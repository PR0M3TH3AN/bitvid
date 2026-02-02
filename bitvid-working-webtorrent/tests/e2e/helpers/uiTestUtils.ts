import type { Page } from "@playwright/test";

export async function applyReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      * {
        transition: none !important;
        animation: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

export async function waitForRAF(page: Page, cycles = 2): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, cycles);
}

export function failOnConsoleErrors(page: Page): void {
  page.on("console", (message) => {
    if (message.type() === "error") {
      throw new Error(`Console error: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    throw error;
  });
}

export async function forceOpenModal(page: Page, selector: string): Promise<void> {
  await page.evaluate((modalSelector) => {
    const element = document.querySelector(modalSelector);
    if (!element) {
      return;
    }
    element.classList.remove("hidden");
    element.setAttribute("data-open", "true");
  }, selector);
}
