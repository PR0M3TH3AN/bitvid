import { userLogger } from "./utils/logger.js";

const DB_NAME = "bitvidSettings";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const KEY_PREFIX = "dmSnapshot:";
const LOCALSTORAGE_PREFIX = "bitvid:dmSnapshot:";
const PREVIEW_MAX_LENGTH = 160;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

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
    return "";
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return "";
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
      // Ignore decode errors and fall through to return empty string.
    }
  }

  return "";
}

function resolveStorageKeys(pubkey) {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) {
    throw new Error("Invalid pubkey for DM snapshot storage.");
  }

  return {
    normalized,
    dbKey: `${KEY_PREFIX}${normalized}`,
    fallbackKey: `${LOCALSTORAGE_PREFIX}${normalized}`,
  };
}

function sanitizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  const rounded = Math.floor(numeric);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : 0;
}

function sanitizePreview(value) {
  if (typeof value !== "string") {
    return "";
  }

  let preview = value.replace(/\s+/g, " ").trim();
  if (!preview) {
    return "";
  }

  if (preview.length > PREVIEW_MAX_LENGTH) {
    preview = `${preview.slice(0, PREVIEW_MAX_LENGTH).trimEnd()}\u2026`;
  }

  return preview;
}

function normalizeSnapshotEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const remotePubkey = normalizePubkey(
    entry.remotePubkey || entry.remote || entry.pubkey,
  );
  if (!remotePubkey) {
    return null;
  }

  const latestTimestamp = sanitizeTimestamp(
    entry.latestTimestamp ?? entry.timestamp ?? entry.lastTimestamp,
  );

  const preview = sanitizePreview(
    entry.preview ?? entry.plaintext ?? entry.text ?? "",
  );

  return {
    remotePubkey,
    latestTimestamp,
    preview,
  };
}

function normalizeSnapshotList(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const results = [];

  for (const entry of raw) {
    const normalized = normalizeSnapshotEntry(entry);
    if (!normalized) {
      continue;
    }

    if (seen.has(normalized.remotePubkey)) {
      const existingIndex = results.findIndex(
        (candidate) => candidate.remotePubkey === normalized.remotePubkey,
      );
      if (existingIndex >= 0) {
        const existing = results[existingIndex];
        if (normalized.latestTimestamp > existing.latestTimestamp) {
          results[existingIndex] = normalized;
        }
      }
      continue;
    }

    seen.add(normalized.remotePubkey);
    results.push(normalized);
  }

  results.sort(
    (a, b) => (b.latestTimestamp || 0) - (a.latestTimestamp || 0),
  );

  return results;
}

export async function loadDirectMessageSnapshot(pubkey) {
  let keys;
  try {
    keys = resolveStorageKeys(pubkey);
  } catch (error) {
    userLogger.warn("[directMessagesStore] Invalid pubkey for load", error);
    return [];
  }

  const { normalized, dbKey, fallbackKey } = keys;

  try {
    const db = await openSettingsDb();
    if (db) {
      const stored = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(dbKey);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () =>
          reject(request.error || new Error("Failed to load snapshot"));
      });

      return normalizeSnapshotList(stored);
    }
  } catch (error) {
    userLogger.warn(
      "[directMessagesStore] Failed to read IndexedDB snapshot",
      error,
    );
  }

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(fallbackKey);
      if (raw) {
        return normalizeSnapshotList(JSON.parse(raw));
      }
    }
  } catch (error) {
    userLogger.warn(
      "[directMessagesStore] Failed to read fallback snapshot",
      error,
    );
  }

  // If we reached here, ensure we still return a normalized empty list for
  // callers that rely on consistent return values.
  return normalizeSnapshotList([]);
}

export async function saveDirectMessageSnapshot(pubkey, snapshot) {
  let keys;
  try {
    keys = resolveStorageKeys(pubkey);
  } catch (error) {
    userLogger.warn("[directMessagesStore] Invalid pubkey for save", error);
    return [];
  }

  const normalizedSnapshot = normalizeSnapshotList(snapshot);
  const { dbKey, fallbackKey } = keys;

  try {
    const db = await openSettingsDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(normalizedSnapshot, dbKey);
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error || new Error("Failed to write snapshot"));
      });
      return normalizedSnapshot;
    }
  } catch (error) {
    userLogger.warn(
      "[directMessagesStore] Failed to write IndexedDB snapshot",
      error,
    );
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(fallbackKey, JSON.stringify(normalizedSnapshot));
    }
  } catch (error) {
    userLogger.warn(
      "[directMessagesStore] Failed to write fallback snapshot",
      error,
    );
  }

  return normalizedSnapshot;
}

export async function clearDirectMessageSnapshot(pubkey) {
  let keys;
  try {
    keys = resolveStorageKeys(pubkey);
  } catch (error) {
    userLogger.warn("[directMessagesStore] Invalid pubkey for clear", error);
    return false;
  }

  const { dbKey, fallbackKey } = keys;
  let cleared = false;

  try {
    const db = await openSettingsDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(dbKey);
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error || new Error("Failed to clear snapshot"));
      });
      cleared = true;
    }
  } catch (error) {
    userLogger.warn(
      "[directMessagesStore] Failed to clear IndexedDB snapshot",
      error,
    );
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(fallbackKey);
      cleared = true;
    }
  } catch (error) {
    userLogger.warn(
      "[directMessagesStore] Failed to clear fallback snapshot",
      error,
    );
  }

  return cleared;
}

export function buildDirectMessageSnapshotPayload(entries) {
  return normalizeSnapshotList(entries);
}
