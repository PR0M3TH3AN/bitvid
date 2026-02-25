/**
 * Video CRUD flow scenarios: settings menu, edit modal, delete modal.
 *
 * Scenarios covered:
 * - SCN-crud-settings-menu: Video card owned by logged-in user shows settings gear
 * - SCN-crud-settings-actions: Settings menu contains edit and delete actions
 * - SCN-crud-edit-open: Clicking edit action opens the edit modal
 * - SCN-crud-edit-form: Edit modal contains the expected form fields
 * - SCN-crud-edit-close: Edit modal can be closed without submitting
 * - SCN-crud-delete-open: Clicking delete action opens the delete confirmation modal
 * - SCN-crud-delete-elements: Delete modal has confirm and cancel buttons
 * - SCN-crud-delete-cancel: Cancelling delete closes the modal without removing the video
 */

import { test, expect } from "./helpers/bitvidTestFixture";

/**
 * Helper: seed a video, navigate, log in, and wait for the feed to populate.
 */
async function setupFeedWithVideo(
  page: any,
  { gotoApp, loginAs, seedEvent }: any,
  overrides: Record<string, string> = {},
) {
  await seedEvent({
    title: overrides.title || "CRUD Test Video",
    url: overrides.url || "https://example.com/crud.mp4",
    dTag: overrides.dTag || `crud-${Date.now()}`,
  });

  await gotoApp();
  await loginAs(page);

  await page.evaluate(() => {
    return (window as any).__bitvidTest__.waitForFeedItems(1, 15000);
  });
}

test.describe("Video CRUD — settings menu", () => {
  test("video card shows settings gear button for the owner", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
    testPubkey,
  }) => {
    // Given: a video seeded by the test user (same key used for login)
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-gear-001",
    });

    // Then: the video card should have a settings gear button
    const card = page.locator("[data-video-card]").first();
    await expect(card).toBeVisible();

    // The card's pubkey should match the test user
    const cardPubkey = await card.getAttribute("data-video-pubkey");
    expect(cardPubkey).toBe(testPubkey);

    // And: the settings gear button should exist on the card
    const gearBtn = card.locator('[aria-label="Video settings"]');
    await expect(gearBtn).toBeAttached();
  });

  test("clicking settings gear opens a menu with edit and delete actions", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: a video card with settings gear
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-menu-001",
    });

    const card = page.locator("[data-video-card]").first();
    const gearBtn = card.locator('[aria-label="Video settings"]');

    // When: user clicks the gear button
    await gearBtn.click();

    // Then: a settings menu panel should appear
    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });

    // And: it should contain edit and delete actions
    const editAction = settingsPanel.locator('[data-action="edit"]');
    const deleteAction = settingsPanel.locator('[data-action="delete"]');
    await expect(editAction).toBeVisible();
    await expect(deleteAction).toBeVisible();
  });
});

test.describe("Video CRUD — edit modal", () => {
  test("clicking edit action opens the edit modal", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the settings menu is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-edit-open-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });

    // When: user clicks the edit action
    await settingsPanel.locator('[data-action="edit"]').click();

    // Then: the edit modal should open
    const editModal = page.locator("#editVideoModal");
    await expect(editModal).not.toHaveClass(/hidden/, { timeout: 10000 });
  });

  test("edit modal contains the title input field", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the edit modal is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      title: "Editable Video",
      dTag: "crud-edit-form-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });
    await settingsPanel.locator('[data-action="edit"]').click();

    const editModal = page.locator("#editVideoModal");
    await expect(editModal).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Then: the title input should be present
    const titleInput = page.locator("#editVideoTitle");
    await expect(titleInput).toBeAttached();
  });

  test("edit modal can be closed via the close button", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the edit modal is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-edit-close-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });
    await settingsPanel.locator('[data-action="edit"]').click();

    const editModal = page.locator("#editVideoModal");
    await expect(editModal).not.toHaveClass(/hidden/, { timeout: 10000 });

    // When: user clicks the close button
    const closeBtn = page.locator("#closeEditVideoModal");
    await closeBtn.click();

    // Then: the edit modal should be hidden
    await expect(editModal).toHaveClass(/hidden/, { timeout: 5000 });
  });
});

test.describe("Video CRUD — delete modal", () => {
  test("clicking delete action opens the delete confirmation modal", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the settings menu is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-delete-open-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });

    // When: user clicks the delete action
    await settingsPanel.locator('[data-action="delete"]').click();

    // Then: the delete confirmation modal should open
    const deleteModal = page.locator("#deleteVideoModal");
    await expect(deleteModal).not.toHaveClass(/hidden/, { timeout: 10000 });
  });

  test("delete modal has confirm and cancel buttons", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the delete modal is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-delete-btns-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });
    await settingsPanel.locator('[data-action="delete"]').click();

    const deleteModal = page.locator("#deleteVideoModal");
    await expect(deleteModal).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Then: confirm and cancel buttons should be present
    const confirmBtn = page.locator("#confirmDeleteVideo");
    const cancelBtn = page.locator("#cancelDeleteVideo");
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // And: confirm button should indicate destructive action
    await expect(confirmBtn).toHaveAttribute("data-variant", "critical");
  });

  test("cancelling delete closes the modal and preserves the video", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the delete modal is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      title: "Video To Keep",
      dTag: "crud-delete-cancel-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });
    await settingsPanel.locator('[data-action="delete"]').click();

    const deleteModal = page.locator("#deleteVideoModal");
    await expect(deleteModal).not.toHaveClass(/hidden/, { timeout: 10000 });

    // When: user clicks cancel
    await page.locator("#cancelDeleteVideo").click();

    // Then: the delete modal should close
    await expect(deleteModal).toHaveClass(/hidden/, { timeout: 5000 });

    // And: the video should still be in the feed
    const feedItems = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getFeedItems();
    });
    expect(feedItems.length).toBeGreaterThanOrEqual(1);
  });

  test("delete modal shows warning about irreversible action", async ({
    page,
    gotoApp,
    loginAs,
    seedEvent,
  }) => {
    // Given: the delete modal is open
    await setupFeedWithVideo(page, { gotoApp, loginAs, seedEvent }, {
      dTag: "crud-delete-warn-001",
    });

    const card = page.locator("[data-video-card]").first();
    await card.locator('[aria-label="Video settings"]').click();

    const settingsPanel = page.locator('[data-menu="video-settings"]');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });
    await settingsPanel.locator('[data-action="delete"]').click();

    const deleteModal = page.locator("#deleteVideoModal");
    await expect(deleteModal).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Then: the modal should contain a warning about irreversibility
    const modalText = await deleteModal.textContent();
    expect(modalText).toContain("cannot be undone");
  });
});
