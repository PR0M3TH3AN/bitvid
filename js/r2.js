import { userLogger } from "./utils/logger.js";
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
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/.*$/, "");
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

export async function loadR2Settings() {
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

export async function saveR2Settings(settings) {
  const normalized = normalizeSettings(settings);

  let db = null;
  try {
    db = await openSettingsDb();
  } catch (err) {
    userLogger.warn("Unable to open IndexedDB, continuing with fallback:", err);
  }

  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(normalized, SETTINGS_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(req.error || new Error("Failed to save R2 settings"));
    });
  } else if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      LOCALSTORAGE_FALLBACK_KEY,
      JSON.stringify(normalized)
    );
  }

  return normalized;
}

export async function clearR2Settings() {
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

export function buildR2Key(npub, file) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeNpub = String(npub || "")
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
  return `u/${safeNpub}/${year}/${month}/${safeSlug}.${ext}`;
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

export { sanitizeBaseDomain };