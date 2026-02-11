import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/docs/moderation/fixtures/index.html";
const STORAGE_KEY = "bitvid:moderation:fixture-overrides";
const SENTINEL_KEY = "__moderationFixturesInit__";
const RESTORE_BUTTON_LABEL = "Restore default moderation";

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
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
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

test("REPRO: trusted mute hide fixture annotates mute reason and can be overridden (should fail)", async ({
  page,
}) => {
  await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });
  await waitForFixtureReady(page);

  const muteCard = page.locator('[data-test-id="trusted-mute-hide"]');
  const badge = muteCard.locator('[data-moderation-badge="true"]');
  const thumbnail = muteCard.locator('img[data-video-thumbnail]');

  await expect(muteCard).toHaveAttribute(
    "data-moderation-override-available",
    "true"
  );
  const showAnywayButton = muteCard.getByRole("button", { name: "Show anyway" });
  const restoreButtonQuery = muteCard.getByRole("button", {
    name: RESTORE_BUTTON_LABEL,
  });

  await expect(muteCard).toHaveAttribute("data-moderation-hidden", "true");
  await expect(muteCard).toHaveAttribute("data-moderation-hide-reason", "trusted-mute-hide");
  await expect(muteCard).toHaveAttribute("data-moderation-hide-trusted-mute-count", "1");
  await expect(muteCard).toHaveAttribute("data-moderation-trusted-mute", "true");
  await expect(muteCard).toHaveAttribute("data-moderation-trusted-mute-count", "1");
  await expect(badge).toContainText("Hidden · 1 trusted mute");
  await expect(thumbnail).toHaveAttribute("data-thumbnail-state", "blurred");

  // This line is commented out in the original test because it fails in headless mode.
  // We uncomment it here to reproduce the failure.
  await expect(showAnywayButton).toBeVisible();

  const showAnywayLocator = muteCard.locator('button[data-moderation-action="override"]');
  await expect(showAnywayLocator).toHaveCount(1);
  await expect(showAnywayLocator).toHaveAttribute("aria-label", "Show anyway");
  await expect(restoreButtonQuery).toHaveCount(0);

  await showAnywayButton.click();

  await expect(muteCard).not.toHaveAttribute("data-moderation-hidden", "true");
  await expect(muteCard).toHaveAttribute("data-moderation-override", "show-anyway");
  await expect(muteCard.locator('[data-moderation-badge="true"]')).toContainText(
    "Showing despite 1 trusted mute",
  );
  await expect(thumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");

  const restoreButton = muteCard.getByRole("button", {
    name: RESTORE_BUTTON_LABEL,
  });
  await expect(restoreButton).toBeVisible();

  await restoreButton.click();

  await expect(muteCard).toHaveAttribute("data-moderation-hidden", "true");
  await expect(muteCard).not.toHaveAttribute("data-moderation-override", "show-anyway");
  await expect(thumbnail).toHaveAttribute("data-thumbnail-state", "blurred");
  await expect(muteCard.getByRole("button", { name: "Show anyway" })).toBeVisible();
});
