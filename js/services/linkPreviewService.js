import { devLogger, userLogger } from "../utils/logger.js";

const DB_NAME = "bitvid-link-previews";
const DB_VERSION = 1;
const STORE_NAME = "previews";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24;

const normalizeUrl = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const resolveMetaContent = (doc, selector) => {
  if (!doc) {
    return "";
  }
  const element = doc.querySelector(selector);
  if (!element) {
    return "";
  }
  const content = element.getAttribute("content") || "";
  return content.trim();
};

const resolveFirstMetaContent = (doc, selectors) => {
  if (!doc || !Array.isArray(selectors)) {
    return "";
  }
  for (const selector of selectors) {
    const value = resolveMetaContent(doc, selector);
    if (value) {
      return value;
    }
  }
  return "";
};

const resolveAbsoluteUrl = (candidate, baseUrl) => {
  if (!candidate) {
    return "";
  }
  try {
    const resolved = new URL(candidate, baseUrl);
    return resolved.toString();
  } catch {
    return "";
  }
};

export class LinkPreviewService {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = Number.isFinite(ttlMs) ? Math.max(0, ttlMs) : DEFAULT_TTL_MS;
    this.db = null;
    this.dbPromise = null;
  }

  async init() {
    if (this.db) {
      return this.db;
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not supported."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "url" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(request.error || new Error("IndexedDB open failed."));
      };
    });

    return this.dbPromise;
  }

  async withStore(mode, callback) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);

      tx.oncomplete = () => resolve(request?.result ?? null);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  }

  async getCachedPreview(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return null;
    }
    try {
      const entry = await this.withStore("readonly", (store) => store.get(normalized));
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const expiresAt = Number(entry.expiresAt) || 0;
      if (expiresAt && expiresAt < Date.now()) {
        void this.deletePreview(normalized);
        return null;
      }
      return entry.data || null;
    } catch (error) {
      userLogger.warn("[LinkPreviewService] Failed to read cache.", error);
      return null;
    }
  }

  async deletePreview(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return;
    }
    try {
      await this.withStore("readwrite", (store) => store.delete(normalized));
    } catch (error) {
      devLogger.warn("[LinkPreviewService] Failed to clear cached preview.", error);
    }
  }

  async setCachedPreview(url, data) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return;
    }
    const now = Date.now();
    const payload = {
      url: normalized,
      fetchedAt: now,
      expiresAt: now + this.ttlMs,
      data,
    };
    try {
      await this.withStore("readwrite", (store) => store.put(payload));
    } catch (error) {
      userLogger.warn("[LinkPreviewService] Failed to cache preview.", error);
    }
  }

  async getPreview(url, { signal } = {}) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return null;
    }
    const cached = await this.getCachedPreview(normalized);
    if (cached) {
      return cached;
    }
    const preview = await this.fetchPreview(normalized, { signal });
    if (preview) {
      await this.setCachedPreview(normalized, preview);
    }
    return preview;
  }

  async fetchPreview(url, { signal } = {}) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return null;
    }
    let response;
    try {
      response = await fetch(normalized, {
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
        signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return null;
      }
      devLogger.warn("[LinkPreviewService] Preview fetch failed.", error);
      return null;
    }
    if (!response || !response.ok) {
      return null;
    }
    let html = "";
    try {
      html = await response.text();
    } catch (error) {
      devLogger.warn("[LinkPreviewService] Failed to read preview response.", error);
      return null;
    }
    return this.parsePreview(html, normalized);
  }

  parsePreview(html, url) {
    if (!html) {
      return null;
    }
    let doc;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch (error) {
      devLogger.warn("[LinkPreviewService] Failed to parse preview HTML.", error);
      return null;
    }
    const title = resolveFirstMetaContent(doc, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
    ]) || doc.title?.trim() || "";
    const description = resolveFirstMetaContent(doc, [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]);
    const image = resolveFirstMetaContent(doc, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]);
    const siteName = resolveFirstMetaContent(doc, [
      'meta[property="og:site_name"]',
    ]);
    const resolvedImage = resolveAbsoluteUrl(image, url);

    return {
      url,
      title,
      description,
      image: resolvedImage,
      siteName,
    };
  }
}
