import { expect, test } from "@playwright/test";

test.describe("login modal flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/components/login-modal.html", { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `
        * {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });

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

  test("handles nsec and nip-46 login flows", async ({ page }) => {
    const modal = page.locator("#loginModal");

    await page.evaluate(() => window.__loginController.openModal());
    await expect(modal).toHaveAttribute("data-open", "true");

    await page
      .locator('[data-provider-button][data-provider-id="nsec"]')
      .click();
    await expect(page.locator("[data-nsec-secret]")).toBeVisible();

    await page.locator("[data-nsec-submit]").click();
    const errorMessage = page.locator("[data-nsec-error]");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      "Paste an nsec, hex key, or mnemonic to continue.",
    );

    await page.locator("[data-nsec-secret]").fill("nsec-test-secret");
    await page.locator("[data-nsec-submit]").click();

    await page.waitForFunction(
      () => window.__testAuth?.lastRequest?.providerId === "nsec",
    );

    await expect(modal).toHaveAttribute("data-open", "false");

    await page.evaluate(() => window.__loginController.openModal());
    await expect(modal).toHaveAttribute("data-open", "true");

    await page
      .locator('[data-provider-button][data-provider-id="nip46"]')
      .click();
    await expect(page.locator("[data-nip46-handshake-panel]")).toBeVisible();

    await page.locator("[data-nip46-cancel]").click();
    await expect(page.locator("[data-nip46-handshake-panel]")).toHaveCount(0);
    await expect(modal).toHaveAttribute("data-open", "true");

    await page.locator("#closeLoginModal").click();
    await expect(modal).toHaveAttribute("data-open", "false");

    const lastRequest = await page.evaluate(() => window.__testAuth.lastRequest);
    expect(lastRequest.providerId).toBe("nsec");
    expect(lastRequest.secret).toBe("nsec-test-secret");
  });
});
