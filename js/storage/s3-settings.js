import { userLogger } from "../utils/logger.js";
import { normalizeS3PublicBaseUrl } from "./s3-url.js";

const DB_NAME = "bitvidSettings";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const SETTINGS_KEY = "s3Settings";
const LOCALSTORAGE_FALLBACK_KEY = "bitvid:s3Settings";

function normalizeSettings(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const forcePathStyle = Boolean(base.forcePathStyle);
  const createBucketIfMissing = Boolean(base.createBucketIfMissing);
  const endpoint = String(base.endpoint || "").trim();
  const region = String(base.region || "").trim() || "auto";
  const bucket = String(base.bucket || "").trim();
  const accessKeyId = String(base.accessKeyId || "").trim();
  const secretAccessKey = String(base.secretAccessKey || "").trim();
  const publicBaseUrl = normalizeS3PublicBaseUrl(base.publicBaseUrl || "");

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    publicBaseUrl,
    createBucketIfMissing,
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

export async function loadS3Settings() {
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
          reject(req.error || new Error("Failed to load S3 settings"));
        };
      });
    }
  } catch (err) {
    userLogger.warn("Failed to open IndexedDB for S3 settings, falling back:", err);
  }

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LOCALSTORAGE_FALLBACK_KEY);
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    }
  } catch (err) {
    userLogger.warn("Failed to read fallback S3 settings:", err);
  }

  return normalizeSettings(null);
}

export async function saveS3Settings(settings) {
  const normalized = normalizeSettings(settings);

  let db = null;
  try {
    db = await openSettingsDb();
  } catch (err) {
    userLogger.warn("Unable to open IndexedDB for S3 settings, continuing with fallback:", err);
  }

  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(normalized, SETTINGS_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(req.error || new Error("Failed to save S3 settings"));
    });
  } else if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALSTORAGE_FALLBACK_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export async function clearS3Settings() {
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
    userLogger.warn("Failed to clear IndexedDB S3 settings:", err);
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LOCALSTORAGE_FALLBACK_KEY);
      cleared = true;
    }
  } catch (err) {
    userLogger.warn("Failed to clear fallback S3 settings:", err);
  }

  return cleared;
}
