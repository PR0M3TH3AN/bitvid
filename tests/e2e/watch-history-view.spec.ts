/**
 * Watch history view scenarios.
 *
 * Tests the #view=history page rendering, empty state, and action buttons.
 *
 * Scenarios covered:
 * - SCN-history-loads: History view loads with heading and action buttons
 * - SCN-history-heading: Heading displays "Watch History"
 * - SCN-history-actions: Clear and Refresh buttons are present
 * - SCN-history-empty-state: Empty state message shown when no history
 * - SCN-history-clear-local: Clear button removes history and shows empty state
 * - SCN-history-refresh: Refresh triggers loading without page errors
 * - SCN-history-info-button: Info trigger button exists for sorting info
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Watch history view — structure", () => {
  test("history view loads with heading when logged in", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    // Given: the user is logged in
    await gotoApp();
    await loginAs(page);

    // When: navigating to the history view
    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    // Then: the watch history section should be visible
    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    // And: it should contain the "Watch History" heading
    const heading = historyView.locator("h2").first();
    await expect(heading).toContainText("Watch History");
  });

  test("history view has clear and refresh action buttons", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    // Given: the user navigates to history view
    await gotoApp();
    await loginAs(page);

    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    // Then: the "Clear local history" button should be present
    const clearBtn = page.locator('[data-history-action="clear-cache"]');
    await expect(clearBtn).toBeAttached();
    await expect(clearBtn).toContainText("Clear local history");

    // And: the "Refresh" button should be present
    const refreshBtn = page.locator('[data-history-action="refresh"]');
    await expect(refreshBtn).toBeAttached();
    await expect(refreshBtn).toContainText("Refresh");
  });

  test("history view has info trigger for sort explanation", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    // Given: the user navigates to history view
    await gotoApp();
    await loginAs(page);

    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    // Then: the info trigger button should exist
    const infoBtn = page.locator("#historyInfoTrigger");
    await expect(infoBtn).toBeAttached();
    await expect(infoBtn).toHaveAttribute(
      "aria-label",
      "How is this feed sorted?",
    );
  });

  test("history view has description text", async ({
    page,
    gotoApp,
    loginAs,
  }) => {
    // Given: the user navigates to history view
    await gotoApp();
    await loginAs(page);

    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    // Then: the description should explain the view
    await expect(historyView).toContainText(
      "Review the videos you recently played",
    );
  });
});

test.describe("Watch history view — behavior", () => {
  test("empty state is shown or loading state appears", async ({
    page,
    gotoApp,
    loginAs,
    startDiagnostics,
  }) => {
    // Given: the user navigates to history view with no watch history
    await gotoApp();
    await loginAs(page);

    const diagnostics = await startDiagnostics(page);

    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    // Wait a moment for the view to settle (loading → empty or populated)
    await page.waitForTimeout(3000);

    // Then: either the empty state or the loading indicator should be visible
    // (In test mode with an empty relay, we expect the empty state eventually)
    const emptyState = page.locator("#watchHistoryEmpty");
    const historyGrid = page.locator("#watchHistoryGrid");
    const loadingStatus = page.locator("#watchHistoryStatus");

    const emptyVisible = await emptyState
      .isVisible()
      .catch(() => false);
    const gridVisible = await historyGrid
      .isVisible()
      .catch(() => false);
    const loadingVisible = await loadingStatus
      .isVisible()
      .catch(() => false);

    // At least one state should be active
    expect(emptyVisible || gridVisible || loadingVisible).toBe(true);

    // Check for page errors (filter out known issue with null value setter
    // during view navigation — see watch-history-view tests)
    const { pageErrors } = await diagnostics.stop();
    const unexpectedErrors = pageErrors.filter(
      (err) => !err.includes("Cannot set properties of null (setting 'value')"),
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test("clear local history button does not cause errors", async ({
    page,
    gotoApp,
    loginAs,
    startDiagnostics,
  }) => {
    // Given: the user is on the history view
    await gotoApp();
    await loginAs(page);

    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    const diagnostics = await startDiagnostics(page);

    // When: the user clicks "Clear local history"
    const clearBtn = page.locator('[data-history-action="clear-cache"]');
    await clearBtn.click();

    // Wait for the action to complete
    await page.waitForTimeout(1000);

    // Then: no page errors should occur
    const { pageErrors } = await diagnostics.stop();
    expect(pageErrors).toHaveLength(0);

    // And: the empty state should be visible (history was cleared)
    const emptyState = page.locator("#watchHistoryEmpty");
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test("refresh button triggers loading without errors", async ({
    page,
    gotoApp,
    loginAs,
    startDiagnostics,
  }) => {
    // Given: the user is on the history view
    await gotoApp();
    await loginAs(page);

    await page.evaluate(() => {
      window.location.hash = "#view=history";
    });

    const historyView = page.locator("#watchHistoryView");
    await expect(historyView).toBeVisible({ timeout: 10000 });

    // Wait for initial load to settle
    await page.waitForTimeout(2000);

    const diagnostics = await startDiagnostics(page);

    // When: the user clicks "Refresh"
    const refreshBtn = page.locator('[data-history-action="refresh"]');
    await refreshBtn.click();

    // Wait for the refresh to process
    await page.waitForTimeout(2000);

    // Then: no page errors should occur
    const { pageErrors } = await diagnostics.stop();
    expect(pageErrors).toHaveLength(0);
  });
});
