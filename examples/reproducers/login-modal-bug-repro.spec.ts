import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Helpers extracted from tests/e2e/helpers/uiTestUtils.ts to avoid relative import issues
export async function applyReducedMotion(page: Page) {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      *, *::before, *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);
  });
}

export function failOnConsoleErrors(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      // Ignore known false positives or non-blocking errors if necessary
      // For now, fail on any error
      throw new Error(`Console error: ${message.text()}`);
    }
  });
}

test.describe("login modal bug reproduction", () => {
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

        window.__loginReady = true;
      `,
    });

    await page.waitForFunction(() => window.__loginReady === true);
  });

  test("login modal error message should be visible", async ({ page }) => {
    const modal = page.locator("#loginModal");

    await page.evaluate(() => window.__loginController.openModal());
    await expect(modal).toHaveAttribute("data-open", "true");

    await page
      .locator('[data-provider-button][data-provider-id="nsec"]')
      .click();
    await expect(page.locator("[data-nsec-secret]")).toBeVisible();

    // Trigger the empty input error
    await page.locator("[data-nsec-submit]").click();

    const errorMessage = page.locator("[data-nsec-error]");

    // This expectation fails in the current codebase
    // The error message remains hidden
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      "Paste an nsec, hex key, or mnemonic to continue.",
    );
  });
});
