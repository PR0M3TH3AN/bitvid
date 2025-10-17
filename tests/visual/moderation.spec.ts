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

test.afterEach(async ({ page }) => {
  try {
    await page.evaluate(({ key, sentinel }) => {
      window.localStorage?.removeItem(key);
      window.sessionStorage?.removeItem(sentinel);
    }, { key: STORAGE_KEY, sentinel: SENTINEL_KEY });
  } catch {
    // ignore cleanup errors when page already closed
  }
});

test.describe("moderation fixtures", () => {
  test("blur fixture masks thumbnails and blocks autoplay", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });

    const blurCard = page.locator('[data-test-id="blur-threshold"]');
    const thumbnail = blurCard.locator('img[data-video-thumbnail]');

    await expect(blurCard).toHaveAttribute("data-moderation-report-count", "3");
    await expect(blurCard).toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(thumbnail).toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(blurCard).not.toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
  });

  test("autoplay fixture disables preview without blurring", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });

    const autoplayCard = page.locator('[data-test-id="autoplay-threshold"]');
    const thumbnail = autoplayCard.locator('img[data-video-thumbnail]');

    await expect(autoplayCard).toHaveAttribute("data-moderation-report-count", "2");
    await expect(autoplayCard).toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(thumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");
  });

  test("show anyway override persists across reloads", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });

    const overrideCard = page.locator('[data-test-id="show-anyway"]');
    const thumbnail = overrideCard.locator('img[data-video-thumbnail]');
    const showAnywayButton = overrideCard.getByRole("button", { name: "Show anyway" });

    await expect(overrideCard).toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(thumbnail).toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(showAnywayButton).toBeVisible();

    await showAnywayButton.click();

    await expect(overrideCard).toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
    await expect(overrideCard).not.toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(thumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(overrideCard.getByRole("button", { name: "Show anyway" })).toHaveCount(0);

    await page.reload({ waitUntil: "networkidle" });

    const reloadedCard = page.locator('[data-test-id="show-anyway"]');
    const reloadedThumbnail = reloadedCard.locator('img[data-video-thumbnail]');

    await expect(reloadedCard).toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
    await expect(reloadedCard).not.toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(reloadedThumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(
      reloadedCard.getByRole("button", { name: "Show anyway" })
    ).toHaveCount(0);
  });
});
