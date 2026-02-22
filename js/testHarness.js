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
import { relayManager } from "./relayManager.js";
import { userBlocks, USER_BLOCK_EVENTS } from "./userBlocks.js";
import {
  registerSigner,
  setActiveSigner,
  getActiveSigner,
  listRegisteredSigners,
} from "./nostrClientRegistry.js";
import { devLogger } from "./utils/logger.js";
import { STANDARD_TIMEOUT_MS } from "./constants.js";
import { getApplication } from "./applicationContext.js";

const HARNESS_VERSION = 2;
const MAX_SYNC_EVENT_BUFFER = 300;
const SYNC_EVENT_POLL_INTERVAL_MS = 50;

const listSyncEvents = [];
let listSyncCaptureInstalled = false;
let removeUserBlockStatusListener = null;
let removeAuthLoadingListener = null;
const signerDecryptOriginals = new WeakMap();
let activeDecryptBehavior = {
  mode: "passthrough",
  delayMs: 0,
  errorMessage: "",
};

function normalizeRelayList(relayUrls) {
  if (!Array.isArray(relayUrls)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const item of relayUrls) {
    const value = typeof item === "string" ? item.trim() : "";
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function pushListSyncEvent(source, detail = {}) {
  const event = {
    source: typeof source === "string" ? source : "unknown",
    at: Date.now(),
    detail: detail && typeof detail === "object" ? detail : { value: detail },
  };
  listSyncEvents.push(event);
  if (listSyncEvents.length > MAX_SYNC_EVENT_BUFFER) {
    listSyncEvents.splice(0, listSyncEvents.length - MAX_SYNC_EVENT_BUFFER);
  }
}

function installListSyncCapture() {
  if (listSyncCaptureInstalled || typeof window === "undefined") {
    return;
  }

  removeAuthLoadingListener = (event) => {
    pushListSyncEvent("auth-loading-state", event?.detail || {});
  };
  window.addEventListener("bitvid:auth-loading-state", removeAuthLoadingListener);

  if (userBlocks && typeof userBlocks.on === "function") {
    removeUserBlockStatusListener = userBlocks.on(
      USER_BLOCK_EVENTS.STATUS,
      (detail) => {
        pushListSyncEvent("user-blocks-status", detail || {});
      },
    );
  }

  listSyncCaptureInstalled = true;
}

function clearListSyncEvents() {
  listSyncEvents.length = 0;
}

function getListSyncEvents() {
  return listSyncEvents.map((entry) => ({
    source: entry.source,
    at: entry.at,
    detail: entry.detail,
  }));
}

function matchesListSyncCriteria(event, criteria = {}) {
  if (!event || typeof event !== "object") {
    return false;
  }

  const expectedSource =
    typeof criteria.source === "string" ? criteria.source.trim() : "";
  if (expectedSource && event.source !== expectedSource) {
    return false;
  }

  const expectedStatus =
    typeof criteria.status === "string" ? criteria.status.trim() : "";
  if (expectedStatus && event?.detail?.status !== expectedStatus) {
    return false;
  }

  const expectedReason =
    typeof criteria.reason === "string" ? criteria.reason.trim() : "";
  if (expectedReason && event?.detail?.reason !== expectedReason) {
    return false;
  }

  return true;
}

function waitForListSyncEvent(criteria = {}, timeoutMs = STANDARD_TIMEOUT_MS) {
  const timeout = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.floor(timeoutMs))
    : STANDARD_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      for (const event of listSyncEvents) {
        if (matchesListSyncCriteria(event, criteria)) {
          resolve(event);
          return;
        }
      }

      if (Date.now() - startedAt >= timeout) {
        reject(
          new Error(
            `[testHarness] Timed out waiting for list sync event: ${JSON.stringify(criteria)}`,
          ),
        );
        return;
      }

      setTimeout(check, SYNC_EVENT_POLL_INTERVAL_MS);
    };

    check();
  });
}

function normalizeDecryptBehavior(mode, options = {}) {
  const normalizedMode =
    typeof mode === "string" ? mode.trim().toLowerCase() : "passthrough";
  const allowed = new Set(["passthrough", "timeout", "error", "delay"]);
  const safeMode = allowed.has(normalizedMode) ? normalizedMode : "passthrough";
  const delayMs = Number.isFinite(options?.delayMs)
    ? Math.max(0, Math.floor(options.delayMs))
    : 0;
  const errorMessage =
    typeof options?.errorMessage === "string" && options.errorMessage.trim()
      ? options.errorMessage.trim()
      : "test-harness decrypt failure";
  return { mode: safeMode, delayMs, errorMessage };
}

function ensureSignerDecryptOriginals(signer) {
  if (!signer || typeof signer !== "object") {
    return null;
  }
  if (!signerDecryptOriginals.has(signer)) {
    signerDecryptOriginals.set(signer, {
      nip04Decrypt: signer.nip04Decrypt,
      nip44Decrypt: signer.nip44Decrypt,
    });
  }
  return signerDecryptOriginals.get(signer);
}

function buildDecryptWrapper(originalDecrypt, behavior, methodName) {
  if (typeof originalDecrypt !== "function") {
    return originalDecrypt;
  }

  if (behavior.mode === "timeout") {
    return () => new Promise(() => {});
  }

  if (behavior.mode === "error") {
    return async () => {
      const error = new Error(behavior.errorMessage);
      error.code = "test-harness-decrypt-error";
      error.method = methodName;
      throw error;
    };
  }

  if (behavior.mode === "delay") {
    return async (...args) => {
      if (behavior.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
      }
      return originalDecrypt(...args);
    };
  }

  return originalDecrypt;
}

function setSignerDecryptBehavior(mode = "passthrough", options = {}) {
  const behavior = normalizeDecryptBehavior(mode, options);
  activeDecryptBehavior = behavior;

  const signer = getActiveSigner();
  if (!signer || typeof signer !== "object") {
    return {
      ok: false,
      mode: behavior.mode,
      reason: "no-active-signer",
    };
  }

  const originals = ensureSignerDecryptOriginals(signer);
  if (!originals) {
    return {
      ok: false,
      mode: behavior.mode,
      reason: "invalid-signer",
    };
  }

  signer.nip04Decrypt = buildDecryptWrapper(
    originals.nip04Decrypt,
    behavior,
    "nip04Decrypt",
  );
  signer.nip44Decrypt = buildDecryptWrapper(
    originals.nip44Decrypt,
    behavior,
    "nip44Decrypt",
  );

  return {
    ok: true,
    mode: behavior.mode,
    delayMs: behavior.delayMs,
  };
}

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

  console.error(`[testHarness] getTestRelayOverrides called. URL: ${window.location.href}`);
  const params = new URLSearchParams(window.location.search);
  const paramRelays = params.get("__testRelays__");
  if (paramRelays) {
    console.error(`[testHarness] Found URL override: ${paramRelays}`);
    return paramRelays
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }

  try {
    const stored = localStorage.getItem("__bitvidTestRelays__");
    if (stored) {
      console.error(`[testHarness] Found localStorage override: ${stored}`);
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("[testHarness] localStorage read failed:", err);
  }

  console.error("[testHarness] No overrides found.");
  return null;
}

/**
 * Apply relay overrides to the nostrClient so it connects to test relays
 * instead of production relays.
 */
function applyRelayOverrides(relayUrls) {
  const normalizedRelays = normalizeRelayList(relayUrls);
  if (!normalizedRelays.length) return false;

  try {
    if (typeof nostrClient.applyRelayPreferences === "function") {
      nostrClient.applyRelayPreferences({
        all: normalizedRelays,
        read: normalizedRelays,
        write: normalizedRelays,
      });
      return true;
    }

    // Fallback: directly set relay arrays if available
    if (nostrClient.connectionManager) {
      const cm = nostrClient.connectionManager;
      cm.relays = [...normalizedRelays];
      if (Array.isArray(cm.readRelays)) cm.readRelays = [...normalizedRelays];
      if (Array.isArray(cm.writeRelays)) cm.writeRelays = [...normalizedRelays];
      return true;
    }
  } catch (err) {
    devLogger.error("[testHarness] Failed to apply relay overrides:", err);
  }

  return false;
}

function setTestRelays(relayUrls, options = {}) {
  const normalizedRelays = normalizeRelayList(relayUrls);
  if (!normalizedRelays.length) {
    return { ok: false, reason: "invalid-relays" };
  }

  const persist = options?.persist !== false;
  let applied = false;

  try {
    if (relayManager && typeof relayManager.setEntries === "function") {
      const entries = normalizedRelays.map((url) => ({ url, mode: "both" }));
      // Overwrite defaults so resets/fallbacks use test relays
      if (relayManager.defaultEntries) {
        relayManager.defaultEntries = entries.map((e) => ({
          ...e,
          read: true,
          write: true,
        }));
      }
      relayManager.setEntries(
        entries,
        { allowEmpty: false, updateClient: true },
      );
      applied = true;
    }
  } catch (error) {
    devLogger.warn("[testHarness] relayManager.setEntries failed:", error);
  }

  if (!applied) {
    applied = applyRelayOverrides(normalizedRelays);
  } else {
    applyRelayOverrides(normalizedRelays);
  }

  if (persist) {
    try {
      localStorage.setItem("__bitvidTestRelays__", JSON.stringify(normalizedRelays));
    } catch (_error) {
      // ignore storage failures in restricted contexts
    }
  }

  return {
    ok: applied,
    relays: normalizedRelays,
  };
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

  if (activeDecryptBehavior.mode !== "passthrough") {
    setSignerDecryptBehavior(activeDecryptBehavior.mode, activeDecryptBehavior);
  }

  const app = getApplication();
  if (app && app.authService) {
    // Notify the app about the login so UI updates
    await app.authService.login(pubkey, { persistActive: false });
  } else {
    devLogger.warn("[testHarness] App or authService not available during loginWithNsec");
  }

  return pubkey;
}

/**
 * Logout the current signer.
 */
async function logout() {
  const signer = getActiveSigner();
  if (signer) {
    setActiveSigner(null);
  }

  const app = getApplication();
  if (app && app.requestLogout) {
    await app.requestLogout();
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
    relayManager: relayManager
      ? {
          all: relayManager.getAllRelayUrls?.() || [],
          read: relayManager.getReadRelayUrls?.() || [],
          write: relayManager.getWriteRelayUrls?.() || [],
          lastLoadSource: relayManager.lastLoadSource || null,
        }
      : null,
    decryptBehavior: { ...activeDecryptBehavior },
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
    setTestRelays(testRelays, { persist: false });
  }

  installListSyncCapture();

  // Patch relayManager to respect test overrides during login/logout
  if (relayManager) {
    const originalLoadRelayList = relayManager.loadRelayList;
    relayManager.loadRelayList = async function (pubkey) {
      // Heuristic: If we are in test mode and the current relays are different from defaults,
      // assume they are test relays and preserve them.
      const isTest = isTestMode();
      const currentEntries = JSON.stringify(this.entries.map(e => ({ url: e.url, mode: e.mode })));
      const defaultEntries = JSON.stringify(this.defaultEntries.map(e => ({ url: e.url, mode: e.mode })));

      if (isTest && currentEntries !== defaultEntries) {
        console.error("[testHarness] Preserving non-default relays in loadRelayList (test mode active)");
        return { ok: true, source: "test-override-preserved", events: [] };
      }

      if (typeof originalLoadRelayList === "function") {
        return originalLoadRelayList.call(this, pubkey);
      }
      return { ok: false, reason: "original-method-missing" };
    };

    const originalReset = relayManager.reset;
    relayManager.reset = function () {
      if (isTestMode()) {
        const overrides = getTestRelayOverrides();
        if (overrides && overrides.length > 0) {
          console.error("[testHarness] Patching reset to restore test relays:", overrides);
          this.lastEvent = null;
          this.loadedPubkey = null;
          this.lastLoadSource = "test-override";
          setTestRelays(overrides, { persist: false });
          return;
        }
      }
      if (typeof originalReset === "function") {
        originalReset.call(this);
      }
    };
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
    setTestRelays,
    setSignerDecryptBehavior,
    getListSyncEvents,
    clearListSyncEvents,
    waitForListSyncEvent,

    // Expose nostrClient for advanced test scenarios
    get nostrClient() {
      return nostrClient;
    },
  });

  devLogger.log("[testHarness] Test harness installed (v" + HARNESS_VERSION + ")");
  return true;
}
