import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/docs/moderation/fixtures/index.html";
const STORAGE_KEY = "bitvid:moderation:fixture-overrides";
const SENTINEL_KEY = "__moderationFixturesInit__";

function setupStorageReset(page) {
  return page.addInitScript(({ storageKey, sentinelKey }) => {
    try {
      const session = window.sessionStorage;
      const local = window.localStorage;
      if (session && !session.getItem(sentinelKey)) {
        local?.removeItem(storageKey);
        session.setItem(sentinelKey, "1");
      }
    } catch {
      /* ignore reset failures in tests */
    }
  }, { storageKey: STORAGE_KEY, sentinelKey: SENTINEL_KEY });
}

test.beforeEach(async ({ page }) => {
  await setupStorageReset(page);
});

test.describe("moderation bug reproduction", () => {
  test("show anyway override persists across reloads", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });

    const overrideCard = page.locator('[data-test-id="show-anyway"]');
    const showAnywayButton = overrideCard.getByRole("button", { name: "Show anyway" });

    // This expectation fails in the current codebase
    // The "Show anyway" button should be visible but it's not found in the DOM
    await expect(showAnywayButton).toBeVisible();
  });
});
