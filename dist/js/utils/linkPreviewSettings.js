import { devLogger } from "./logger.js";

const STORAGE_KEY = "bitvid:linkPreviewSettings:v1";
const EVENT_NAME = "bitvid:link-preview-settings";
const DEFAULT_SETTINGS = Object.freeze({
  autoFetchUnknownDomains: true,
  allowedDomains: [],
});

const getStorage = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
};

const getEventTarget = () =>
  typeof window !== "undefined" ? window : globalThis;

const normalizeDomain = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed;
};

const sanitizeDomains = (domains) => {
  if (!Array.isArray(domains)) {
    return [];
  }
  const normalized = domains
    .map((domain) => normalizeDomain(domain))
    .filter(Boolean);
  return Array.from(new Set(normalized));
};

const sanitizeSettings = (settings) => {
  if (!settings || typeof settings !== "object") {
    return {
      autoFetchUnknownDomains: DEFAULT_SETTINGS.autoFetchUnknownDomains,
      allowedDomains: [],
    };
  }
  const autoFetchUnknownDomains =
    typeof settings.autoFetchUnknownDomains === "boolean"
      ? settings.autoFetchUnknownDomains
      : DEFAULT_SETTINGS.autoFetchUnknownDomains;
  const allowedDomains = sanitizeDomains(settings.allowedDomains);
  return {
    autoFetchUnknownDomains,
    allowedDomains,
  };
};

const emitSettings = (settings) => {
  const target = getEventTarget();
  if (!target || typeof target.dispatchEvent !== "function") {
    return;
  }
  target.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { settings } }),
  );
};

export const getLinkPreviewSettings = () => {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_SETTINGS, allowedDomains: [] };
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS, allowedDomains: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeSettings(parsed);
    return { ...sanitized, allowedDomains: [...sanitized.allowedDomains] };
  } catch (error) {
    devLogger.warn("[linkPreviewSettings] Failed to parse settings.", error);
    return { ...DEFAULT_SETTINGS, allowedDomains: [] };
  }
};

const persistSettings = (settings, { silent = false } = {}) => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    devLogger.warn("[linkPreviewSettings] Failed to persist settings.", error);
  }
  if (!silent) {
    emitSettings(settings);
  }
};

export const setLinkPreviewAutoFetch = (enabled) => {
  const current = getLinkPreviewSettings();
  const next = {
    ...current,
    autoFetchUnknownDomains: Boolean(enabled),
  };
  persistSettings(next);
  return next;
};

export const allowLinkPreviewDomain = (domain, { silent = false } = {}) => {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return getLinkPreviewSettings();
  }
  const current = getLinkPreviewSettings();
  if (current.allowedDomains.includes(normalized)) {
    return current;
  }
  const next = {
    ...current,
    allowedDomains: [...current.allowedDomains, normalized],
  };
  persistSettings(next, { silent });
  return next;
};

export const isLinkPreviewDomainAllowed = (domain, settings) => {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return false;
  }
  const resolvedSettings = settings || getLinkPreviewSettings();
  return resolvedSettings.allowedDomains.includes(normalized);
};

export const subscribeToLinkPreviewSettings = (callback) => {
  const target = getEventTarget();
  if (!target || typeof target.addEventListener !== "function") {
    return () => {};
  }
  const handler =
    typeof callback === "function"
      ? callback
      : () => {};
  target.addEventListener(EVENT_NAME, handler);
  return () => target.removeEventListener(EVENT_NAME, handler);
};
