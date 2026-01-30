import { userLogger } from "./utils/logger.js";
const DB_NAME = "bitvidSettings";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const KEY_PREFIX = "nwcSettings:";
const LOCALSTORAGE_PREFIX = "bitvid:nwcSettings:";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const MIN_DEFAULT_ZAP = 0;
const MAX_DEFAULT_ZAP = 100000000;

const DEFAULT_SETTINGS = Object.freeze({
  nwcUri: "",
  defaultZap: null,
  lastChecked: null,
  version: "",
});

function createClone(value) {
  return { ...value };
}

function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch (error) {
    return false;
  }
}

function openSettingsDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open settings DB"));
    };
  });
}

function normalizePubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.startsWith("npub1") && typeof window !== "undefined") {
    try {
      const decoded = window?.NostrTools?.nip19?.decode?.(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        const hex = decoded.data.trim();
        if (HEX64_REGEX.test(hex)) {
          return hex.toLowerCase();
        }
      }
    } catch (error) {
      // Ignore decode errors and fall through to return null.
    }
  }

  return null;
}

function resolveStorageKeys(pubkey) {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) {
    throw new Error("Invalid pubkey for NWC settings.");
  }
  return {
    normalized,
    dbKey: `${KEY_PREFIX}${normalized}`,
    fallbackKey: `${LOCALSTORAGE_PREFIX}${normalized}`,
  };
}

function sanitizeUri(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeDefaultZap(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const rounded = Math.round(numeric);
  if (!Number.isFinite(rounded)) {
    return null;
  }

  return Math.min(MAX_DEFAULT_ZAP, Math.max(MIN_DEFAULT_ZAP, rounded));
}

function sanitizeTimestamp(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return null;
  }
  return Math.max(0, rounded);
}

function sanitizeVersion(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeSettings(raw) {
  const base = createClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== "object") {
    return base;
  }

  if (Object.prototype.hasOwnProperty.call(raw, "nwcUri")) {
    base.nwcUri = sanitizeUri(raw.nwcUri);
  }

  if (Object.prototype.hasOwnProperty.call(raw, "defaultZap")) {
    base.defaultZap = sanitizeDefaultZap(raw.defaultZap);
  }

  if (Object.prototype.hasOwnProperty.call(raw, "lastChecked")) {
    base.lastChecked = sanitizeTimestamp(raw.lastChecked);
  }

  if (Object.prototype.hasOwnProperty.call(raw, "version")) {
    base.version = sanitizeVersion(raw.version);
  }

  return base;
}

function mergeSettings(existing, partial) {
  const source = partial && typeof partial === "object" ? partial : {};
  return normalizeSettings({ ...existing, ...source });
}

function emitToast(message, { variant = "error", error } = {}) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) {
    return;
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(
        new CustomEvent("bitvid:toast", {
          detail: {
            message: text,
            variant,
            source: "nwc-settings",
            error,
          },
        })
      );
    } catch (eventError) {
      userLogger.warn("[nwcSettings] Failed to dispatch toast event", eventError);
    }
  }
}

function notifyFailure(message, error) {
  const text = message || "NWC settings storage error.";
  userLogger.warn(`[nwcSettings] ${text}`, error);
  emitToast(text, { variant: "error", error });
}

function notifyWarning(message, error) {
  const text = message || "NWC settings storage warning.";
  userLogger.warn(`[nwcSettings] ${text}`, error);
  emitToast(text, { variant: "warning", error });
}

async function readFromIndexedDb(dbKey) {
  try {
    const db = await openSettingsDb();
    if (!db) {
      return null;
    }
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(dbKey);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        reject(request.error || new Error("Failed to load NWC settings."));
      };
    });
  } catch (error) {
    notifyWarning("Unable to read wallet settings from IndexedDB.", error);
    return null;
  }
}

function readFromLocalStorage(fallbackKey) {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    const raw = localStorage.getItem(fallbackKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    notifyFailure(
      "Unable to read wallet settings from local storage fallback.",
      error
    );
    return null;
  }
}

async function writeToIndexedDb(dbKey, value) {
  try {
    const db = await openSettingsDb();
    if (!db) {
      return false;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(value, dbKey);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(request.error || new Error("Failed to persist NWC settings."));
      };
    });
    return true;
  } catch (error) {
    notifyWarning("Unable to save wallet settings to IndexedDB.", error);
    return false;
  }
}

function writeToLocalStorage(fallbackKey, value) {
  try {
    if (typeof localStorage === "undefined") {
      return false;
    }
    localStorage.setItem(fallbackKey, JSON.stringify(value));
    return true;
  } catch (error) {
    notifyWarning("Unable to save wallet settings to local storage fallback.", error);
    return false;
  }
}

async function deleteFromIndexedDb(dbKey) {
  try {
    const db = await openSettingsDb();
    if (!db) {
      return false;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(dbKey);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(request.error || new Error("Failed to clear NWC settings."));
      };
    });
    return true;
  } catch (error) {
    notifyWarning("Unable to remove wallet settings from IndexedDB.", error);
    return false;
  }
}

function deleteFromLocalStorage(fallbackKey) {
  try {
    if (typeof localStorage === "undefined") {
      return false;
    }
    localStorage.removeItem(fallbackKey);
    return true;
  } catch (error) {
    notifyWarning("Unable to remove wallet settings from local storage fallback.", error);
    return false;
  }
}

export function createDefaultNwcSettings() {
  return createClone(DEFAULT_SETTINGS);
}

export async function loadNwcSettings(pubkey) {
  const { dbKey, fallbackKey } = resolveStorageKeys(pubkey);
  const stored = await readFromIndexedDb(dbKey);
  if (stored) {
    return normalizeSettings(stored);
  }

  const fallback = readFromLocalStorage(fallbackKey);
  if (fallback) {
    return normalizeSettings(fallback);
  }

  return normalizeSettings(null);
}

export async function saveNwcSettings(pubkey, partial = {}) {
  const { normalized, dbKey, fallbackKey } = resolveStorageKeys(pubkey);
  const existing = await readFromIndexedDb(dbKey);
  const fallbackExisting = existing || readFromLocalStorage(fallbackKey);
  const merged = mergeSettings(fallbackExisting || DEFAULT_SETTINGS, partial);

  const idbPersisted = await writeToIndexedDb(dbKey, merged);
  const localPersisted = writeToLocalStorage(fallbackKey, merged);

  if (!idbPersisted && !localPersisted) {
    notifyFailure(
      "Failed to persist wallet settings. Recent changes were not saved.",
      new Error(`Unable to save settings for ${normalized}`)
    );
    throw new Error("Unable to persist NWC settings.");
  }

  return merged;
}

export async function clearNwcSettings(pubkey) {
  const { normalized, dbKey, fallbackKey } = resolveStorageKeys(pubkey);
  const idbCleared = await deleteFromIndexedDb(dbKey);
  const localCleared = deleteFromLocalStorage(fallbackKey);

  if (!idbCleared && !localCleared) {
    notifyFailure(
      "Failed to clear wallet settings from browser storage.",
      new Error(`Unable to clear settings for ${normalized}`)
    );
    throw new Error("Unable to clear NWC settings.");
  }

  return true;
}
