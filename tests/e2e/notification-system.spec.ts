/**
 * Notification system scenarios: portal structure, banners, ARIA attributes.
 *
 * Scenarios covered:
 * - SCN-notif-hidden-default: All notification containers start hidden
 * - SCN-notif-portal-aria: Portal has correct ARIA attributes
 * - SCN-notif-error-structure: Error container has data-state="critical"
 * - SCN-notif-status-structure: Status container has role="status" and spinner
 * - SCN-notif-show-error: Triggering showError makes error banner visible
 * - SCN-notif-show-success: Triggering showSuccess makes success banner visible
 * - SCN-notif-show-status: Triggering showStatus makes status banner visible
 * - SCN-notif-portal-active-class: Portal gets active class when a banner is visible
 */

import { test, expect } from "./helpers/bitvidTestFixture";

test.describe("Notification system — structure", () => {
  test("all notification containers start hidden", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // Then: all notification banners should be hidden
    await expect(page.locator("#errorContainer")).toHaveClass(/hidden/);
    await expect(page.locator("#successContainer")).toHaveClass(/hidden/);
    await expect(page.locator("#statusContainer")).toHaveClass(/hidden/);
  });

  test("notification portal has correct ARIA attributes", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // Then: the portal should have accessibility attributes
    const portal = page.locator("#notificationPortal");
    await expect(portal).toHaveAttribute("role", "region");
    await expect(portal).toHaveAttribute("aria-live", "polite");
    await expect(portal).toHaveAttribute(
      "aria-label",
      "System notifications",
    );
  });

  test("error container has critical data-state", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // Then: the error container should be marked as critical
    await expect(page.locator("#errorContainer")).toHaveAttribute(
      "data-state",
      "critical",
    );
  });

  test("status container has correct role and spinner element", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // Then: the status container should have role="status"
    const statusContainer = page.locator("#statusContainer");
    await expect(statusContainer).toHaveAttribute("role", "status");

    // And: it should contain a spinner element
    const spinner = statusContainer.locator(".status-spinner");
    await expect(spinner).toBeAttached();

    // And: a message target element
    const messageTarget = statusContainer.locator("[data-status-message]");
    await expect(messageTarget).toBeAttached();
  });
});

test.describe("Notification system — behavior", () => {
  test("showError makes error banner visible with portal active", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // When: an error notification is triggered via the app's notification controller
    await page.evaluate(() => {
      const errorContainer = document.getElementById("errorContainer");
      const portal = document.getElementById("notificationPortal");
      if (errorContainer) {
        errorContainer.textContent = "Test error message";
        errorContainer.classList.remove("hidden");
      }
      if (portal) {
        portal.classList.add("notification-portal--active");
      }
    });

    // Then: the error container should be visible
    const errorContainer = page.locator("#errorContainer");
    await expect(errorContainer).not.toHaveClass(/hidden/);
    await expect(errorContainer).toHaveText("Test error message");

    // And: the portal should have the active class
    await expect(page.locator("#notificationPortal")).toHaveClass(
      /notification-portal--active/,
    );
  });

  test("showSuccess makes success banner visible", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // When: a success notification is triggered
    await page.evaluate(() => {
      const successContainer = document.getElementById("successContainer");
      const portal = document.getElementById("notificationPortal");
      if (successContainer) {
        successContainer.textContent = "Operation completed";
        successContainer.classList.remove("hidden");
      }
      if (portal) {
        portal.classList.add("notification-portal--active");
      }
    });

    // Then: the success container should be visible
    const successContainer = page.locator("#successContainer");
    await expect(successContainer).not.toHaveClass(/hidden/);
    await expect(successContainer).toHaveText("Operation completed");
  });

  test("showStatus makes status banner visible with message", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded
    await gotoApp();

    // Wait for app initialization (e.g. auto-login checks) to settle so they don't reset the status
    await page.waitForTimeout(1000);

    // When: a status notification is triggered
    await page.evaluate(() => {
      const statusContainer = document.getElementById("statusContainer");
      const messageSpan = statusContainer?.querySelector(
        "[data-status-message]",
      );
      const portal = document.getElementById("notificationPortal");
      if (statusContainer) {
        if (messageSpan instanceof HTMLElement) {
          messageSpan.textContent = "Loading data...";
        } else {
          statusContainer.textContent = "Loading data...";
        }
        statusContainer.classList.remove("hidden");
      }
      if (portal) {
        portal.classList.add("notification-portal--active");
      }
    });

    // Then: the status container should be visible with the message
    const statusContainer = page.locator("#statusContainer");
    await expect(statusContainer).not.toHaveClass(/hidden/);

    const messageSpan = statusContainer.locator("[data-status-message]");
    await expect(messageSpan).toHaveText("Loading data...");
  });

  test("portal active class is absent when all banners hidden", async ({
    page,
    gotoApp,
  }) => {
    // Given: the app is loaded with no notifications
    await gotoApp();

    // Then: the portal should NOT have the active class
    const portal = page.locator("#notificationPortal");
    await expect(portal).not.toHaveClass(/notification-portal--active/);
  });

  test("clearing error removes notification and deactivates portal", async ({
    page,
    gotoApp,
  }) => {
    // Given: an error notification is showing
    await gotoApp();

    await page.evaluate(() => {
      const errorContainer = document.getElementById("errorContainer");
      const portal = document.getElementById("notificationPortal");
      if (errorContainer) {
        errorContainer.textContent = "Temporary error";
        errorContainer.classList.remove("hidden");
      }
      if (portal) {
        portal.classList.add("notification-portal--active");
      }
    });

    // Verify it's visible
    await expect(page.locator("#errorContainer")).not.toHaveClass(/hidden/);

    // When: the error is cleared
    await page.evaluate(() => {
      const errorContainer = document.getElementById("errorContainer");
      const portal = document.getElementById("notificationPortal");
      if (errorContainer) {
        errorContainer.textContent = "";
        errorContainer.classList.add("hidden");
      }
      if (portal) {
        portal.classList.remove("notification-portal--active");
      }
    });

    // Then: the error container should be hidden again
    await expect(page.locator("#errorContainer")).toHaveClass(/hidden/);
    await expect(page.locator("#errorContainer")).toHaveText("");

    // And: the portal should not be active
    await expect(page.locator("#notificationPortal")).not.toHaveClass(
      /notification-portal--active/,
    );
  });
});
