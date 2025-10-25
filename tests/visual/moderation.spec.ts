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

  test("trusted report hide fixture supports show anyway override", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });

    const hideCard = page.locator('[data-test-id="trusted-report-hide"]');
    const badge = hideCard.locator('[data-moderation-badge="true"]');
    const showAnywayButton = hideCard.getByRole("button", { name: "Show anyway" });

    await expect(hideCard).toHaveAttribute("data-moderation-hidden", "true");
    await expect(hideCard).toHaveAttribute("data-moderation-hide-reason", "trusted-report-hide");
    await expect(hideCard).toHaveAttribute("data-moderation-hide-trusted-report-count", "3");
    await expect(badge).toContainText("Hidden · 3 trusted spam reports");
    await expect(showAnywayButton).toBeVisible();

    await showAnywayButton.click();

    await expect(hideCard).not.toHaveAttribute("data-moderation-hidden", "true");
    await expect(hideCard).toHaveAttribute("data-moderation-override", "show-anyway");
    await expect(hideCard.locator('[data-moderation-badge="true"]')).toContainText(
      "Showing despite 3 trusted spam reports",
    );
  });

  test("trusted mute hide fixture annotates mute reason and can be overridden", async ({
    page,
  }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });

    const muteCard = page.locator('[data-test-id="trusted-mute-hide"]');
    const badge = muteCard.locator('[data-moderation-badge="true"]');
    const thumbnail = muteCard.locator('img[data-video-thumbnail]');
    const showAnywayButton = muteCard.getByRole("button", { name: "Show anyway" });

    await expect(muteCard).toHaveAttribute("data-moderation-hidden", "true");
    await expect(muteCard).toHaveAttribute("data-moderation-hide-reason", "trusted-mute-hide");
    await expect(muteCard).toHaveAttribute("data-moderation-hide-trusted-mute-count", "1");
    await expect(muteCard).toHaveAttribute("data-moderation-trusted-mute", "true");
    await expect(muteCard).toHaveAttribute("data-moderation-trusted-mute-count", "1");
    await expect(badge).toContainText("Hidden · 1 trusted mute");
    await expect(thumbnail).toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(showAnywayButton).toBeVisible();

    await showAnywayButton.click();

    await expect(muteCard).not.toHaveAttribute("data-moderation-hidden", "true");
    await expect(muteCard).toHaveAttribute("data-moderation-override", "show-anyway");
    await expect(muteCard.locator('[data-moderation-badge="true"]')).toContainText(
      "Showing despite 1 trusted mute",
    );
    await expect(thumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");
  });
});
