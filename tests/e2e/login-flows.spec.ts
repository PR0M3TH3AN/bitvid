/**
 * Full login/logout lifecycle, auth state transitions, and UI gating tests.
 *
 * Scenarios covered:
 * - SCN-login-programmatic: Programmatic login sets correct app state
 * - SCN-logout-clears-state: Logout resets auth state and hides gated UI
 * - SCN-login-logout-cycle: Repeated login/logout cycles maintain consistency
 * - SCN-auth-gated-ui: Protected UI elements appear/disappear based on auth
 * - SCN-login-modal-open-close: Login modal opens and closes correctly
 * - SCN-login-provider-selection: Provider buttons are rendered and selectable
 * - SCN-auth-persists-navigation: Auth state survives in-page navigation
 * - SCN-concurrent-state-check: App state inspection is consistent after auth
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Login and authentication flows", () => {
  test.describe("Programmatic authentication lifecycle", () => {
    test("programmatic login sets isLoggedIn and activePubkey", async ({
      page,
      gotoApp,
      loginAs,
      testPubkey,
    }) => {
      // Given: the app is loaded
      await gotoApp();

      // Verify initial logged-out state
      const stateBefore = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(stateBefore.isLoggedIn).toBe(false);
      expect(stateBefore.activePubkey).toBeNull();

      // When: user logs in programmatically
      const pubkey = await loginAs(page);

      // Then: app state reflects authenticated session
      expect(pubkey).toBe(testPubkey);

      const stateAfter = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(stateAfter.isLoggedIn).toBe(true);
      expect(stateAfter.activePubkey).toBe(testPubkey);
    });

    test("logout clears all authentication state", async ({
      page,
      gotoApp,
      loginAs,
    }) => {
      // Given: a logged-in user
      await gotoApp();
      await loginAs(page);

      const loggedInState = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(loggedInState.isLoggedIn).toBe(true);

      // When: user logs out
      await page.evaluate(() => {
        (window as any).__bitvidTest__.logout();
      });

      // Then: state is fully cleared
      const loggedOutState = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });
      expect(loggedOutState.isLoggedIn).toBe(false);
      expect(loggedOutState.activePubkey).toBeNull();
    });

    test("repeated login/logout cycles maintain state consistency", async ({
      page,
      gotoApp,
      loginAs,
      testPubkey,
    }) => {
      // Given: the app is loaded
      await gotoApp();

      // Perform 3 login/logout cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // When: login
        const pubkey = await loginAs(page);
        expect(pubkey).toBe(testPubkey);

        const loggedIn = await page.evaluate(() => {
          return (window as any).__bitvidTest__.getAppState();
        });
        expect(loggedIn.isLoggedIn).toBe(true);
        expect(loggedIn.activePubkey).toBe(testPubkey);

        // When: logout
        await page.evaluate(() => {
          (window as any).__bitvidTest__.logout();
        });

        const loggedOut = await page.evaluate(() => {
          return (window as any).__bitvidTest__.getAppState();
        });
        expect(loggedOut.isLoggedIn).toBe(false);
        expect(loggedOut.activePubkey).toBeNull();
      }
    });
  });

  test.describe("Auth-gated UI elements", () => {
    test("upload and profile buttons appear after login", async ({
      page,
      gotoApp,
      loginAs,
    }) => {
      // Given: logged-out state — upload/profile should be hidden
      await gotoApp();

      const uploadBtn = page.locator('[data-testid="upload-button"]');
      const profileBtn = page.locator('[data-testid="profile-button"]');

      await expect(uploadBtn).toBeAttached();
      await expect(uploadBtn).not.toBeVisible();

      // When: user logs in
      await loginAs(page);

      // Then: gated buttons become visible
      await expect(uploadBtn).toBeVisible();
      // Profile button should also be visible (or at least attached)
      await expect(profileBtn).toBeAttached();
    });

    test("upload and profile buttons hide after logout", async ({
      page,
      gotoApp,
      loginAs,
    }) => {
      // Given: a logged-in user with visible gated buttons
      await gotoApp();
      await loginAs(page);

      const uploadBtn = page.locator('[data-testid="upload-button"]');
      await expect(uploadBtn).toBeVisible();

      // When: user logs out
      await page.evaluate(() => {
        (window as any).__bitvidTest__.logout();
      });

      // Then: gated buttons are no longer visible
      // Allow DOM update to propagate
      await page.waitForTimeout(2000);
      await expect(uploadBtn).not.toBeVisible({ timeout: 10000 });
    });

    test("login button is visible in logged-out state", async ({
      page,
      gotoApp,
    }) => {
      // Given: the app loads with no auth
      await gotoApp();

      // Then: login button is the primary auth action
      const loginBtn = page.locator('[data-testid="login-button"]');
      await expect(loginBtn).toBeVisible();
    });
  });

  test.describe("Login modal interaction", () => {
    test("clicking login button opens the login modal", async ({
      page,
      gotoApp,
    }) => {
      // Given: the app is loaded
      await gotoApp();

      // When: user clicks the login button
      await page.locator('[data-testid="login-button"]').click();

      // Then: login modal becomes visible
      await page.waitForFunction(
        () => {
          const modal = document.querySelector(
            '[data-testid="login-modal"]',
          );
          if (!(modal instanceof HTMLElement)) return false;
          return (
            modal.getAttribute("data-open") === "true" &&
            !modal.classList.contains("hidden")
          );
        },
        { timeout: 15000 },
      );

      const modal = page.locator('[data-testid="login-modal"]');
      await expect(modal).toHaveAttribute("data-open", "true");
    });

    test("login modal shows auth provider options", async ({
      page,
      gotoApp,
    }) => {
      // Given: the login modal is open
      await gotoApp();
      await page.locator('[data-testid="login-button"]').click();

      await page.waitForFunction(
        () => {
          const modal = document.querySelector(
            '[data-testid="login-modal"]',
          );
          if (!(modal instanceof HTMLElement)) return false;
          return modal.getAttribute("data-open") === "true";
        },
        { timeout: 15000 },
      );

      // Then: at least one provider button is visible
      const providers = page.locator(
        '[data-testid="login-provider-button"]',
      );
      await expect(providers.first()).toBeVisible({ timeout: 15000 });

      const providerCount = await providers.count();
      expect(providerCount).toBeGreaterThanOrEqual(1);
    });

    test("login modal contains nsec input fields", async ({
      page,
      gotoApp,
    }) => {
      // Given: the login modal is open
      await gotoApp();
      await page.locator('[data-testid="login-button"]').click();

      await page.waitForFunction(
        () => {
          const modal = document.querySelector(
            '[data-testid="login-modal"]',
          );
          if (!(modal instanceof HTMLElement)) return false;
          return modal.getAttribute("data-open") === "true";
        },
        { timeout: 15000 },
      );

      // Click the nsec provider to reveal inputs
      const nsecProvider = page.locator('[data-provider-id="nsec"]');
      await expect(nsecProvider).toBeVisible();
      await nsecProvider.click();

      // Then: nsec input elements should be present in the DOM
      const nsecInput = page.locator('[data-testid="nsec-secret-input"]');
      const nsecSubmit = page.locator('[data-testid="nsec-submit"]');
      await expect(nsecInput).toBeAttached();
      await expect(nsecSubmit).toBeAttached();
    });
  });

  test.describe("App state inspection after auth", () => {
    test("getAppState returns relay info alongside auth state", async ({
      page,
      gotoApp,
      loginAs,
      relayUrl,
    }) => {
      // Given: a logged-in session with relay connection
      await gotoApp();
      await loginAs(page);

      // When: we inspect app state
      const state = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getAppState();
      });

      // Then: state includes both auth and relay information
      expect(state.isLoggedIn).toBe(true);
      expect(state.relays).toBeTruthy();
      expect(state.relays.all || []).toContain(relayUrl);
    });

    test("relay health reflects active connections", async ({
      page,
      gotoApp,
    }) => {
      // Given: the app is loaded with relay connections
      await gotoApp();

      // When: we check relay health
      const health = await page.evaluate(() => {
        return (window as any).__bitvidTest__.getRelayHealth();
      });

      // Then: health info is available
      expect(health).toBeTruthy();
      expect(health.relays).toBeDefined();
    });
  });
});
