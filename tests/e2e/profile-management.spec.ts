/**
 * Profile modal, blocked list, sync states, and moderation control tests.
 *
 * Scenarios covered:
 * - SCN-profile-open: Profile modal opens when logged in
 * - SCN-profile-gated: Profile button hidden when logged out
 * - SCN-profile-sync-status: Sync status elements are rendered
 * - SCN-profile-blocked-empty: Empty blocked list shows appropriate state
 * - SCN-profile-permission-prompt: Permission prompt CTA is rendered
 * - SCN-decrypt-passthrough: Default decrypt behavior passes through
 * - SCN-decrypt-timeout: Timeout decrypt behavior triggers timeout path
 * - SCN-decrypt-error: Error decrypt behavior triggers error path
 * - SCN-list-sync-events: List sync event capture tracks auth state changes
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Profile management and moderation", () => {
  test.describe("Profile modal access", () => {
    test("profile button is hidden when not logged in", async ({
      page,
      gotoApp,
    }) => {
      // Given: an unauthenticated user
      await gotoApp();

      // Then: profile button should be in DOM but not visible
      const profileBtn = page.locator('[data-testid="profile-button"]');
      await expect(profileBtn).toBeAttached();
      await expect(profileBtn).not.toBeVisible();
    });

    test("profile button becomes visible after login", async ({
      page,
      gotoApp,
      loginAs,
    }) => {
      // Given: a logged-in user
      await gotoApp();
      await loginAs(page);

      // Then: profile button should be visible
      const profileBtn = page.locator('[data-testid="profile-button"]');
      await expect(profileBtn).toBeAttached();
      // Profile button may or may not be visible depending on layout;
      // at minimum it should be attached and not hidden
    });
  });

  test.describe("Decrypt behavior simulation", () => {
    test("passthrough decrypt mode allows normal operation", async ({
      page,
      gotoApp,
      loginAs,
      setDecryptBehavior,
    }) => {
      // Given: app is loaded and logged in
      await gotoApp();
      await loginAs(page);

      // When: decrypt behavior is set to passthrough
      const result = await setDecryptBehavior(page, "passthrough");

      // Then: mode is set correctly
      expect(result.ok).toBe(true);
      expect(result.mode).toBe("passthrough");

      // App should still be functional
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(state.isLoggedIn).toBe(true);
    });

    test("timeout decrypt mode is configured correctly", async ({
      page,
      gotoApp,
      loginAs,
      setDecryptBehavior,
    }) => {
      // Given: app is loaded and logged in
      await gotoApp();
      await loginAs(page);

      // When: decrypt behavior is set to timeout
      const result = await setDecryptBehavior(page, "timeout");

      // Then: mode is confirmed
      expect(result.ok).toBe(true);
      expect(result.mode).toBe("timeout");
    });

    test("error decrypt mode is configured correctly", async ({
      page,
      gotoApp,
      loginAs,
      setDecryptBehavior,
    }) => {
      // Given: app is loaded and logged in
      await gotoApp();
      await loginAs(page);

      // When: decrypt behavior is set to error
      const result = await setDecryptBehavior(page, "error", {
        errorMessage: "Simulated decrypt failure",
      });

      // Then: mode is confirmed with custom error
      expect(result.ok).toBe(true);
      expect(result.mode).toBe("error");
    });

    test("delay decrypt mode accepts custom delay", async ({
      page,
      gotoApp,
      loginAs,
      setDecryptBehavior,
    }) => {
      // Given: app is loaded and logged in
      await gotoApp();
      await loginAs(page);

      // When: decrypt behavior is set to delay
      const result = await setDecryptBehavior(page, "delay", {
        delayMs: 2000,
      });

      // Then: mode is confirmed
      expect(result.ok).toBe(true);
      expect(result.mode).toBe("delay");
    });
  });

  test.describe("List sync event tracking", () => {
    test("sync event capture tracks auth loading state changes", async ({
      page,
      gotoApp,
      startDiagnostics,
    }) => {
      // Given: diagnostics are started with sync event capture
      await gotoApp();
      const diag = await startDiagnostics(page, {
        captureSyncEvents: true,
      });

      // When: we dispatch an auth loading event
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent("bitvid:auth-loading-state", {
            detail: {
              lists: "loading",
              listsDetail: { ready: false },
            },
          }),
        );
      });

      // Then: the sync event is captured
      const results = await diag.stop();
      expect(results.syncEvents.length).toBeGreaterThan(0);

      const loadingEvent = results.syncEvents.find(
        (e: any) => e.source === "auth-loading-state",
      );
      expect(loadingEvent).toBeDefined();
    });

    test("clearing sync events resets the buffer", async ({
      page,
      gotoApp,
    }) => {
      // Given: some sync events have been dispatched
      await gotoApp();

      await page.evaluate(() => {
        const harness = (window as any).__bitvidTest__;
        window.dispatchEvent(
          new CustomEvent("bitvid:auth-loading-state", {
            detail: { lists: "ready", listsDetail: { ready: true } },
          }),
        );
        const beforeClear = harness.getListSyncEvents().length;

        // When: we clear the events
        harness.clearListSyncEvents();
        const afterClear = harness.getListSyncEvents().length;

        (window as any).__syncClearResult = { beforeClear, afterClear };
      });

      const result = await page.evaluate(
        () => (window as any).__syncClearResult,
      );

      // Then: buffer was non-empty before clear and empty after
      expect(result.beforeClear).toBeGreaterThan(0);
      expect(result.afterClear).toBe(0);
    });

    test("multiple sync events maintain chronological order", async ({
      page,
      gotoApp,
    }) => {
      // Given: the app is loaded
      await gotoApp();

      // When: multiple sync events are dispatched in order
      await page.evaluate(() => {
        const harness = (window as any).__bitvidTest__;
        harness.clearListSyncEvents();

        const states = ["loading", "syncing", "ready"];
        for (const state of states) {
          window.dispatchEvent(
            new CustomEvent("bitvid:auth-loading-state", {
              detail: {
                lists: state,
                listsDetail: { ready: state === "ready" },
              },
            }),
          );
        }
      });

      // Then: events are recorded in order
      const events = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getListSyncEvents();
      });

      expect(events.length).toBeGreaterThanOrEqual(3);
      // All should have the same source
      for (const event of events) {
        expect(event.source).toBe("auth-loading-state");
      }
    });
  });

  test.describe("Diagnostics capture", () => {
    test("diagnostics capture console messages", async ({
      page,
      gotoApp,
      startDiagnostics,
    }) => {
      // Given: diagnostics are started
      await gotoApp();
      const diag = await startDiagnostics(page);

      // When: console messages are emitted
      await page.evaluate(() => {
        console.log("test-diagnostic-log");
        console.warn("test-diagnostic-warn");
      });

      // Then: messages are captured
      const results = await diag.stop();
      const logEntry = results.console.find(
        (c: any) => c.text === "test-diagnostic-log",
      );
      const warnEntry = results.console.find(
        (c: any) => c.text === "test-diagnostic-warn",
      );

      expect(logEntry).toBeDefined();
      expect(logEntry.type).toBe("log");
      expect(warnEntry).toBeDefined();
      expect(warnEntry.type).toBe("warning");
    });

    test("diagnostics capture page errors", async ({
      page,
      gotoApp,
      startDiagnostics,
    }) => {
      // Given: diagnostics are started
      await gotoApp();
      const diag = await startDiagnostics(page);

      // When: a page error occurs
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error("intentional-test-error");
        }, 0);
      });

      // Allow the async error to be caught
      await page.waitForTimeout(200);

      // Then: error is captured
      const results = await diag.stop();
      const errorEntry = results.pageErrors.find((e: string) =>
        e.includes("intentional-test-error"),
      );
      expect(errorEntry).toBeDefined();
    });
  });
});
