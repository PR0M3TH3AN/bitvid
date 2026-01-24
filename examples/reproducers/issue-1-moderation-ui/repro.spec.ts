import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/docs/moderation/fixtures/index.html";
const STORAGE_KEY = "bitvid:moderation:fixture-overrides";
const SENTINEL_KEY = "__moderationFixturesInit__";

async function waitForFixtureReady(page) {
  await page.waitForSelector('body[data-ready="true"]');
}

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

test("show anyway button should be visible", async ({ page }) => {
  await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });
  await waitForFixtureReady(page);

  const overrideCard = page.locator('[data-test-id="show-anyway"]');
  const showAnywayButton = overrideCard.getByRole("button", { name: "Show anyway" });

  // This assertion fails in headless mode (bug)
  await expect(showAnywayButton).toBeVisible();
});
