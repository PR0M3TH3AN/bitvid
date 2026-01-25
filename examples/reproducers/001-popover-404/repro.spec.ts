import { test } from "@playwright/test";
import {
  applyReducedMotion,
  failOnConsoleErrors,
} from "../../../tests/e2e/helpers/uiTestUtils";

test.describe("repro popover 404", () => {
  test.beforeEach(async ({ page }) => {
    await applyReducedMotion(page);
    failOnConsoleErrors(page);
  });

  test("fails to load popover demo due to 404", async ({ page }) => {
    await page.goto("/views/dev/popover-demo.html", { waitUntil: "networkidle" });
  });
});
