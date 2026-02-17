// js/testHarness.js
//
// Playwright test harness — exposes window.__bitvidTest__ for E2E agent testing.
// This module is loaded conditionally and provides programmatic access to:
//   - Login with a private key (bypassing the UI)
//   - Override relay URLs to point at a local mock relay
//   - Inspect app state (logged-in pubkey, feed items, relay health)
//   - Wait for async operations (feed load, relay connection)
//
// Usage from Playwright:
//   await page.evaluate(() => window.__bitvidTest__.loginWithNsec(hexPrivateKey));
//   await page.evaluate(() => window.__bitvidTest__.getAppState());

import { nostrClient } from "./nostrClientFacade.js";
import {
  registerSigner,
  setActiveSigner,
  getActiveSigner,
  listRegisteredSigners,
} from "./nostrClientRegistry.js";
import { devLogger } from "./utils/logger.js";
import { STANDARD_TIMEOUT_MS } from "./constants.js";

const HARNESS_VERSION = 1;

/**
 * Check if test mode is enabled via URL param or localStorage.
 */
export function isTestMode() {
  if (typeof window === "undefined") return false;

  // Check URL parameter
  const params = new URLSearchParams(window.location.search);
  if (params.get("__test__") === "1") return true;

  // Check localStorage flag
  try {
    if (localStorage.getItem("__bitvidTestMode__") === "1") return true;
  } catch {
    // Ignore storage errors
  }

  return false;
}

/**
 * Read test relay URLs from query params or localStorage.
 * Format: ?__testRelays__=ws://localhost:8899,ws://localhost:8900
 */
export function getTestRelayOverrides() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const paramRelays = params.get("__testRelays__");
  if (paramRelays) {
    return paramRelays
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }

  try {
    const stored = localStorage.getItem("__bitvidTestRelays__");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Apply relay overrides to the nostrClient so it connects to test relays
 * instead of production relays.
 */
function applyRelayOverrides(relayUrls) {
  if (!relayUrls || !relayUrls.length) return false;

  try {
    if (typeof nostrClient.applyRelayPreferences === "function") {
      nostrClient.applyRelayPreferences({
        all: relayUrls,
        read: relayUrls,
        write: relayUrls,
      });
      return true;
    }

    // Fallback: directly set relay arrays if available
    if (nostrClient.connectionManager) {
      const cm = nostrClient.connectionManager;
      cm.relays = [...relayUrls];
      if (Array.isArray(cm.readRelays)) cm.readRelays = [...relayUrls];
      if (Array.isArray(cm.writeRelays)) cm.writeRelays = [...relayUrls];
      return true;
    }
  } catch (err) {
    devLogger.error("[testHarness] Failed to apply relay overrides:", err);
  }

  return false;
}

/**
 * Login programmatically with a hex private key. Bypasses the login modal.
 * Returns the hex pubkey on success.
 */
async function loginWithNsec(hexPrivateKey) {
  if (!hexPrivateKey || typeof hexPrivateKey !== "string") {
    throw new Error("[testHarness] hexPrivateKey is required");
  }

  // Use the nostrClient's built-in method to derive and register
  if (typeof nostrClient.derivePrivateKeyFromSecret !== "function") {
    throw new Error("[testHarness] nostrClient.derivePrivateKeyFromSecret not available");
  }

  const { privateKey, pubkey } = await nostrClient.derivePrivateKeyFromSecret(hexPrivateKey);

  if (typeof nostrClient.registerPrivateKeySigner !== "function") {
    throw new Error("[testHarness] nostrClient.registerPrivateKeySigner not available");
  }

  await nostrClient.registerPrivateKeySigner({
    privateKey,
    pubkey,
    persist: false,
  });

  return pubkey;
}

/**
 * Logout the current signer.
 */
function logout() {
  const signer = getActiveSigner();
  if (signer) {
    setActiveSigner(null);
  }
}

/**
 * Get current app state for test assertions.
 */
function getAppState() {
  const signer = getActiveSigner();
  const signers = listRegisteredSigners();

  return {
    isLoggedIn: Boolean(signer),
    activePubkey: signer?.pubkey || null,
    registeredSignerCount: signers.length,
    relays: nostrClient.connectionManager
      ? {
          all: [...(nostrClient.connectionManager.relays || [])],
          read: [...(nostrClient.connectionManager.readRelays || [])],
          write: [...(nostrClient.connectionManager.writeRelays || [])],
        }
      : null,
  };
}

/**
 * Get the current feed video cards from the DOM.
 */
function getFeedItems() {
  const cards = document.querySelectorAll("[data-video-card]");
  return Array.from(cards).map((card) => ({
    title: card.querySelector("[data-video-title]")?.textContent?.trim() || "",
    pubkey: card.getAttribute("data-video-pubkey") || "",
    dTag: card.getAttribute("data-video-dtag") || "",
    hasUrl: Boolean(card.getAttribute("data-play-url")),
    hasMagnet: Boolean(card.getAttribute("data-play-magnet")),
  }));
}

/**
 * Wait for feed items to appear in the DOM.
 */
function waitForFeedItems(minCount = 1, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const items = getFeedItems();
      if (items.length >= minCount) {
        resolve(items);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `[testHarness] Timed out waiting for ${minCount} feed items (found ${items.length})`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    }

    check();
  });
}

/**
 * Wait for a specific DOM element matching a selector.
 */
function waitForSelector(selector, timeoutMs = STANDARD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const el = document.querySelector(selector);
      if (el) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(`[testHarness] Timed out waiting for selector: ${selector}`),
        );
        return;
      }
      requestAnimationFrame(check);
    }

    check();
  });
}

/**
 * Get relay connection health info.
 */
function getRelayHealth() {
  if (!nostrClient.connectionManager) return null;

  const cm = nostrClient.connectionManager;
  return {
    relays: [...(cm.relays || [])],
    unreachable: [...(cm.unreachableRelays || [])],
    backoff: cm.relayBackoff ? Object.fromEntries(cm.relayBackoff) : {},
  };
}

/**
 * Install the test harness on window.__bitvidTest__.
 * Only installs when test mode is active.
 */
export function installTestHarness() {
  if (typeof window === "undefined") return false;

  if (!isTestMode()) return false;

  const testRelays = getTestRelayOverrides();
  if (testRelays) {
    applyRelayOverrides(testRelays);
  }

  window.__bitvidTest__ = Object.freeze({
    version: HARNESS_VERSION,
    loginWithNsec,
    logout,
    getAppState,
    getFeedItems,
    waitForFeedItems,
    waitForSelector,
    getRelayHealth,
    applyRelayOverrides,

    // Expose nostrClient for advanced test scenarios
    get nostrClient() {
      return nostrClient;
    },
  });

  devLogger.log("[testHarness] Test harness installed (v" + HARNESS_VERSION + ")");
  return true;
}
