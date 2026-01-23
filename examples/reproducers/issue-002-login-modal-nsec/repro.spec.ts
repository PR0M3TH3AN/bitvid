import { expect, test } from "@playwright/test";
import {
  applyReducedMotion,
  failOnConsoleErrors,
} from "../../../tests/e2e/helpers/uiTestUtils";

test.describe("login modal flows (reproducer)", () => {
  test.beforeEach(async ({ page }) => {
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
    await page.goto("/components/login-modal.html", { waitUntil: "networkidle" });

    await page.addScriptTag({
      type: "module",
      content: `
        import LoginModalController from "/js/ui/loginModalController.js";
        import {
          prepareStaticModal,
          openStaticModal,
          closeStaticModal,
        } from "/js/ui/components/staticModalAccessibility.js";

        const modalElement = document.getElementById("loginModal");
        window.__testAuth = {
          lastRequest: null,
        };

        const authService = {
          requestLogin: async (options) => {
            window.__testAuth.lastRequest = options;
            if (options.providerId === "nip46") {
              if (typeof options.onHandshakePrepared === "function") {
                options.onHandshakePrepared({ uri: "nostr:test-uri" });
              }
              await new Promise(() => {});
            }
            return { pubkey: "npub-test" };
          },
          hydrateFromStorage: async () => null,
          on: () => () => {},
        };

        const providers = [
          {
            id: "nsec",
            label: "Secret key",
            description: "Use a raw key",
            login: async () => {},
          },
          {
            id: "nip46",
            label: "Remote signer",
            description: "Pair a signer",
            login: async () => {},
          },
          {
            id: "nip07",
            label: "Extension",
            description: "Browser extension",
            login: async () => {},
          },
        ];

        const prepareModal = (modal) =>
          prepareStaticModal({ root: modal }) || modal;

        const openModal = ({ modal, triggerElement } = {}) =>
          openStaticModal(modal, { triggerElement });

        const closeModal = () => {
          if (modalElement) {
            closeStaticModal(modalElement);
          }
        };

        window.__loginController = new LoginModalController({
          modalElement,
          providers,
          services: {
            authService,
            nostrClient: {
              getRemoteSignerStatus: () => null,
              onRemoteSignerChange: () => () => {},
              getStoredNip46Metadata: () => null,
            },
          },
          helpers: {
            prepareModal,
            openModal,
            closeModal,
            setModalState: (name, isOpen) => {
              window.__testModalState = { name, isOpen };
            },
          },
        });

        const closeButton = document.getElementById("closeLoginModal");
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            closeModal();
          });
        }

        window.__loginReady = true;
      `,
    });

    await page.waitForFunction(() => window.__loginReady === true);
  });

  test("handles nsec login flow (reproduces missing error element)", async ({ page }) => {
    const modal = page.locator("#loginModal");

    await page.evaluate(() => window.__loginController.openModal());
    await expect(modal).toHaveAttribute("data-open", "true");

    await page
      .locator('[data-provider-button][data-provider-id="nsec"]')
      .click();
    await expect(page.locator("[data-nsec-secret]")).toBeVisible();

    await page.locator("[data-nsec-submit]").click();
    const errorMessage = page.locator("[data-nsec-error]");

    // This is expected to fail if the bug exists
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      "Paste an nsec, hex key, or mnemonic to continue.",
    );
  });
});
