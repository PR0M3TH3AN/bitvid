/**
 * Launch-readiness smoke for the REAL publish pipeline.
 *
 * Every other upload/feed spec seeds events straight into the relay, which
 * bypasses the app's own publish path. This spec drives the actual UI:
 *   open upload modal -> fill title + URL -> submit -> the app signs & publishes
 *   to the (mock) relay -> the video shows up in the feed -> the owner deletes it.
 *
 * Scenarios:
 *  - SCN-publish-url-first: a URL-first upload submitted through the form is
 *    signed, published to the relay, and appears in the feed with its URL.
 *  - SCN-publish-then-delete: the owner can delete a self-published video and it
 *    leaves the feed.
 *
 * This covers the upload->publish->feed->delete orchestration end to end. The
 * S3/R2 *file* upload (multipart, key derivation, cleanup) is exercised by the
 * unit suites; this smoke validates the note lifecycle that ties it together.
 */

import { test, expect } from "./helpers/bitvidTestFixture";

async function openUploadAndPublish(
  page: any,
  { title, url }: { title: string; url: string },
) {
  const opened = await page.evaluate(() =>
    (window as any).__bitvidTest__.openUploadModal(),
  );
  expect(opened?.ok, `openUploadModal: ${JSON.stringify(opened)}`).toBe(true);

  const modal = page.locator('[data-testid="upload-modal"]');
  await expect(modal).toBeVisible({ timeout: 10000 });

  // The modal defaults to "Upload File" (S3) mode; switch to "External Link" so
  // the URL field is shown (URL-first publish, no storage needed).
  await page.locator("#btn-mode-external").click();
  const urlInput = page.locator('[data-testid="upload-url"]');
  await expect(urlInput).toBeVisible({ timeout: 10000 });

  await page.locator('[data-testid="upload-title"]').fill(title);
  await urlInput.fill(url);
  await page.locator('[data-testid="upload-submit"]').click();

  // The publish path closes the modal on success.
  await expect(modal).not.toBeVisible({ timeout: 60000 });
}

test.describe("Upload → publish → feed lifecycle (real pipeline)", () => {
  test("a URL-first upload submitted through the form publishes and appears in the feed", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    await gotoApp();
    await loginAs(page);

    const title = `Smoke Publish ${Date.now()}`;
    const url = "https://example.com/smoke-publish.mp4";

    await openUploadAndPublish(page, { title, url });

    // The app signs the note, publishes to the mock relay, and the feed updates.
    const item = await page.evaluate(async (t: string) => {
      const harness = (window as any).__bitvidTest__;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const items = harness.getFeedItems();
        const found = items.find((i: any) => i.title === t);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    }, title);

    expect(item, "published video should appear in the feed").not.toBeNull();
    expect(item.hasUrl).toBe(true);
  });

  test("the owner can delete a self-published video and it leaves the feed", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    await gotoApp();
    await loginAs(page);

    const title = `Smoke Delete ${Date.now()}`;
    await openUploadAndPublish(page, {
      title,
      url: "https://example.com/smoke-delete.mp4",
    });

    // Wait for the published card to render.
    const card = page
      .locator("[data-video-card]")
      .filter({ has: page.locator(`[data-video-title="${title}"]`) })
      .first();
    await expect(card).toBeVisible({ timeout: 60000 });

    // Owner gear menu -> delete -> confirm.
    await card.locator('[aria-label="Video settings"]').click();
    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 60000 });
    await settingsPanel.locator('[data-action="delete"]').click();

    const deleteModal = page.locator("#deleteVideoModal");
    await expect(deleteModal).not.toHaveClass(/hidden/, { timeout: 60000 });
    await page.locator("#confirmDeleteVideo").click();
    await expect(deleteModal).toHaveClass(/hidden/, { timeout: 60000 });

    // The video should no longer be in the feed.
    const stillThere = await page.evaluate(async (t: string) => {
      const harness = (window as any).__bitvidTest__;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const items = harness.getFeedItems();
        if (!items.some((i: any) => i.title === t)) return false;
        await new Promise((r) => setTimeout(r, 500));
      }
      return true;
    }, title);

    expect(stillThere, "deleted video should leave the feed").toBe(false);
  });
});
