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
  test("show anyway override persists across reloads", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });
    await waitForFixtureReady(page);

    const overrideCard = page.locator('[data-test-id="show-anyway"]');
    const thumbnail = overrideCard.locator('img[data-video-thumbnail]');

    await expect(overrideCard).toHaveAttribute(
      "data-moderation-override-available",
      "true"
    );
    const showAnywayButton = overrideCard.getByRole("button", { name: "Show anyway" });
    const restoreButtonQuery = overrideCard.getByRole("button", {
      name: RESTORE_BUTTON_LABEL,
    });

    await expect(overrideCard).toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(thumbnail).toHaveAttribute("data-thumbnail-state", "blurred");

    // Uncommented failures:
    await expect(showAnywayButton).toBeVisible();
    await expect(restoreButtonQuery).toHaveCount(0);

    // Uncommented failure:
    await showAnywayButton.click({ force: true });

    /*
    await expect(overrideCard).toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
    await expect(overrideCard).not.toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(thumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");
    const restoreButton = overrideCard.getByRole("button", {
      name: RESTORE_BUTTON_LABEL,
    });
    await expect(restoreButton).toBeVisible();
    await expect(overrideCard.getByRole("button", { name: "Show anyway" })).toHaveCount(0);

    await page.reload({ waitUntil: "networkidle" });
    await waitForFixtureReady(page);

    const reloadedCard = page.locator('[data-test-id="show-anyway"]');
    const reloadedThumbnail = reloadedCard.locator('img[data-video-thumbnail]');
    const reloadedRestoreButton = reloadedCard.getByRole("button", {
      name: RESTORE_BUTTON_LABEL,
    });

    await expect(reloadedCard).toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
    await expect(reloadedCard).not.toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(reloadedThumbnail).not.toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(reloadedRestoreButton).toBeVisible();
    await expect(
      reloadedCard.getByRole("button", { name: "Show anyway" })
    ).toHaveCount(0);

    await reloadedRestoreButton.click();

    await expect(reloadedCard).not.toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
    await expect(reloadedCard).toHaveAttribute("data-autoplay-policy", "blocked");
    await expect(reloadedThumbnail).toHaveAttribute("data-thumbnail-state", "blurred");
    await expect(
      reloadedCard.getByRole("button", { name: RESTORE_BUTTON_LABEL })
    ).toHaveCount(0);
    await expect(
      reloadedCard.getByRole("button", { name: "Show anyway" })
    ).toBeVisible();
    */
  });
});
