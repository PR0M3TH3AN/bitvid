import { test as base, expect } from "@playwright/test";
import { attachCoverageAndConsoleCapture } from "./playwrightCoverageInstrumentation";

export const test = base.extend({
  _coverageAndConsoleCapture: [
    async ({ page, browserName }, use, testInfo) => {
      const stopCapture = await attachCoverageAndConsoleCapture(page, testInfo, browserName);
      await use();
      await stopCapture();
    },
    { auto: true },
  ],
});

export { expect };
