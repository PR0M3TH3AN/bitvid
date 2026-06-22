import { userLogger, devLogger } from "./utils/logger.js";
import {
  computeSha256HexFromValue,
  valueToUint8Array,
  getSharedTextEncoder,
} from "./utils/cryptoUtils.js";
const DB_NAME = "bitvidSettings";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const SETTINGS_KEY = "r2Settings";
const LOCALSTORAGE_FALLBACK_KEY = "bitvid:r2Settings";

function sanitizeBaseDomain(domain) {
  if (!domain) {
    return "";
  }
  let value = String(domain).trim().toLowerCase();
  // Ensure it starts with https:// if it doesn't already
  if (!/^https?:\/\//.test(value)) {
    value = `https://${value}`;
  }
  // Remove trailing slashes
  value = value.replace(/\/+$/, "");
  return value;
}

function normalizeBucketEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const bucket = String(entry.bucket || "").toLowerCase();
  if (!bucket) {
    return null;
  }
  const publicBaseUrl = String(entry.publicBaseUrl || "");
  const domainType = entry.domainType === "custom" ? "custom" : "managed";
  const lastUpdated = Number.isFinite(entry.lastUpdated)
    ? entry.lastUpdated
    : Date.now();
  return { bucket, publicBaseUrl, domainType, lastUpdated };
}

function normalizeSettings(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const buckets = {};
  if (base.buckets && typeof base.buckets === "object") {
    for (const [npub, value] of Object.entries(base.buckets)) {
      const normalizedEntry = normalizeBucketEntry(value);
      if (normalizedEntry) {
        buckets[String(npub)] = normalizedEntry;
      }
    }
  }

  return {
    accountId: String(base.accountId || ""),
    accessKeyId: String(base.accessKeyId || ""),
    secretAccessKey: String(base.secretAccessKey || ""),
    apiToken: String(base.apiToken || ""),
    zoneId: String(base.zoneId || ""),
    baseDomain: sanitizeBaseDomain(base.baseDomain || ""),
    buckets,
  };
}

function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch (err) {
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

/**
 * Legacy R2 settings loader (deprecated).
 * Used only for one-time migration into StorageService.
 * @deprecated
 */
export async function loadLegacyR2Settings() {
  try {
    const db = await openSettingsDb();
    if (db) {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(SETTINGS_KEY);
        req.onsuccess = () => {
          resolve(normalizeSettings(req.result));
        };
        req.onerror = () => {
          reject(req.error || new Error("Failed to load settings"));
        };
      });
    }
  } catch (err) {
    userLogger.warn("Failed to open IndexedDB for settings, falling back:", err);
  }

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LOCALSTORAGE_FALLBACK_KEY);
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    }
  } catch (err) {
    userLogger.warn("Failed to read fallback settings:", err);
  }

  return normalizeSettings(null);
}

/**
 * Legacy R2 settings clearer (deprecated).
 * Used only after successful migration into StorageService.
 * @deprecated
 */
export async function clearLegacyR2Settings() {
  let cleared = false;
  try {
    const db = await openSettingsDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(SETTINGS_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error("Failed to clear"));
      });
      cleared = true;
    }
  } catch (err) {
    userLogger.warn("Failed to clear IndexedDB settings:", err);
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LOCALSTORAGE_FALLBACK_KEY);
      cleared = true;
    }
  } catch (err) {
    userLogger.warn("Failed to clear fallback settings:", err);
  }

  return cleared;
}

export function mergeBucketEntry(settings, npub, entry) {
  if (!settings || typeof settings !== "object") {
    return settings;
  }
  const normalizedEntry = normalizeBucketEntry(entry);
  if (!normalizedEntry) {
    return settings;
  }
  return {
    ...settings,
    buckets: {
      ...(settings.buckets || {}),
      [npub]: normalizedEntry,
    },
  };
}

function guessExtension(file) {
  if (!file) {
    return "mp4";
  }

  const name = typeof file.name === "string" ? file.name : "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < name.length - 1) {
    return name.slice(dotIndex + 1).toLowerCase();
  }

  const type = typeof file.type === "string" ? file.type : "";
  switch (type) {
    case "video/webm":
      return "webm";
    case "application/vnd.apple.mpegurl":
      return "m3u8";
    case "video/mp2t":
      return "ts";
    case "video/quicktime":
      return "mov";
    case "video/x-matroska":
      return "mkv";
    default:
      return "mp4";
  }
}

export function buildR2Key(npub, file, identifier = "") {
  const safeNpub = String(npub || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeIdentifier = String(identifier || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const baseName = typeof file?.name === "string" ? file.name : "video";
  const withoutExt = baseName.replace(/\.[^/.]+$/, "");
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "video";
  const ext = guessExtension(file);
  const namespace = safeIdentifier || "uploads";
  return `u/${safeNpub}/${namespace}/${safeSlug}.${ext}`;
}

export function buildPublicUrl(baseUrl, key) {
  if (!baseUrl) {
    return "";
  }
  const sanitizedBase = String(baseUrl).replace(/\/$/, "");
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${sanitizedBase}/${encodedKey}`;
}

// Above this size we fingerprint metadata + sampled edges instead of hashing the
// whole file, so we never buffer a multi-GB video in memory (which would freeze
// the main thread). Only reached on the rare path where a torrent info-hash is
// unavailable.
const STORAGE_FULL_HASH_MAX_BYTES = 512 * 1024 * 1024; // 512 MB
const STORAGE_FINGERPRINT_SAMPLE_BYTES = 256 * 1024; // 256 KB head + tail

async function fingerprintLargeFile(file, size) {
  const encoder = getSharedTextEncoder();
  const metaString = `${file?.name || ""} ${size} ${
    Number(file?.lastModified) || 0
  }`;
  const meta = encoder ? encoder.encode(metaString) : new Uint8Array();
  const canSlice = typeof file?.slice === "function";
  const headBlob = canSlice
    ? file.slice(0, Math.min(STORAGE_FINGERPRINT_SAMPLE_BYTES, size))
    : null;
  const tailBlob = canSlice
    ? file.slice(Math.max(0, size - STORAGE_FINGERPRINT_SAMPLE_BYTES))
    : null;
  const head = headBlob ? await valueToUint8Array(headBlob) : null;
  const tail = tailBlob ? await valueToUint8Array(tailBlob) : null;
  const parts = [meta, head, tail].filter(Boolean);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return computeSha256HexFromValue(combined);
}

/**
 * Derives a deterministic, content-based namespace component for a storage key
 * when no torrent info-hash is available. Prevents distinct URL-first uploads
 * that share a filename from overwriting each other - the `buildR2Key`
 * `"uploads"` fallback was a silent data-loss path.
 *
 * Small/medium files use a full SHA-256 of the bytes (idempotent + collision
 * safe). Files larger than `STORAGE_FULL_HASH_MAX_BYTES` use a SHA-256
 * fingerprint over name/size/mtime + sampled head & tail bytes, so we never
 * buffer a huge file in memory. Returns "" only if the file can't be read at
 * all (callers must then supply their own uniqueness).
 *
 * @param {Blob|File} file
 * @returns {Promise<string>}
 */
export async function computeStorageContentHash(file) {
  if (!file) {
    return "";
  }
  try {
    const size = Number(file.size) || 0;
    if (size > 0 && size <= STORAGE_FULL_HASH_MAX_BYTES) {
      const hex = await computeSha256HexFromValue(file);
      if (hex) {
        return `sha256${hex}`;
      }
    }
    const fingerprint = await fingerprintLargeFile(file, size);
    if (fingerprint) {
      return `fp${fingerprint}`;
    }
  } catch (error) {
    devLogger.warn("[r2] Failed to derive content hash for storage key:", error);
  }
  return "";
}

export { sanitizeBaseDomain };
