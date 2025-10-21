import {
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  getTrustedMuteHideThreshold,
  getTrustedSpamHideThreshold,
} from "../constants.js";
import { userLogger } from "../utils/logger.js";
import { sanitizeProfileMediaUrl } from "../utils/profileMedia.js";
import {
  readUrlHealthFromStorage,
  removeUrlHealthFromStorage,
  writeUrlHealthToStorage,
} from "../utils/storage.js";

const PROFILE_CACHE_STORAGE_KEY = "bitvid:profileCache:v1";
const PROFILE_CACHE_VERSION = 1;
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const SAVED_PROFILES_STORAGE_KEY = "bitvid:savedProfiles:v1";
const SAVED_PROFILES_STORAGE_VERSION = 1;

const URL_HEALTH_TTL_MS = 45 * 60 * 1000; // 45 minutes
const URL_HEALTH_TIMEOUT_RETRY_MS = 5 * 60 * 1000; // 5 minutes
export const URL_PROBE_TIMEOUT_MS = 8 * 1000; // 8 seconds
const URL_PROBE_TIMEOUT_RETRY_MS = 15 * 1000; // 15 seconds

const HEX64_REGEX = /^[0-9a-f]{64}$/i;

const MODERATION_OVERRIDE_STORAGE_KEY = "bitvid:moderationOverrides:v1";
const MODERATION_OVERRIDE_STORAGE_VERSION = 1;
const MODERATION_SETTINGS_STORAGE_KEY = "bitvid:moderationSettings:v1";
const MODERATION_SETTINGS_STORAGE_VERSION = 1;

function computeDefaultModerationSettings() {
  let runtimeMuteHide = DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD;
  let runtimeSpamHide = DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD;

  try {
    if (typeof getTrustedMuteHideThreshold === "function") {
      runtimeMuteHide = getTrustedMuteHideThreshold();
    }
  } catch (error) {
    userLogger.warn(
      "[cache.computeDefaultModerationSettings] Failed to read runtime mute hide threshold:",
      error,
    );
  }

  try {
    if (typeof getTrustedSpamHideThreshold === "function") {
      runtimeSpamHide = getTrustedSpamHideThreshold();
    }
  } catch (error) {
    userLogger.warn(
      "[cache.computeDefaultModerationSettings] Failed to read runtime spam hide threshold:",
      error,
    );
  }

  return {
    blurThreshold: 3,
    autoplayBlockThreshold: 2,
    trustedMuteHideThreshold: sanitizeModerationThreshold(
      runtimeMuteHide,
      DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
    ),
    trustedSpamHideThreshold: sanitizeModerationThreshold(
      runtimeSpamHide,
      DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
    ),
  };
}

const DEFAULT_MODERATION_SETTINGS = Object.freeze(computeDefaultModerationSettings());

function createDefaultModerationSettings() {
  return { ...computeDefaultModerationSettings() };
}

function sanitizeModerationThreshold(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const clamped = Math.max(0, Math.floor(numeric));
  if (!Number.isFinite(clamped)) {
    return fallback;
  }

  return clamped;
}

function sanitizeProfileString(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed;
}

let savedProfiles = [];
let activeProfilePubkey = null;
let hadExplicitActiveProfile = false;
const profileCache = new Map();
const urlHealthCache = new Map();
const urlHealthInFlight = new Map();
const moderationOverrides = new Map();
let moderationSettings = createDefaultModerationSettings();

function hasSavedProfilesChanged(previousProfiles, nextProfiles) {
  if (previousProfiles === nextProfiles) {
    return false;
  }
  if (!Array.isArray(previousProfiles) || !Array.isArray(nextProfiles)) {
    return true;
  }
  if (previousProfiles.length !== nextProfiles.length) {
    return true;
  }

  for (let index = 0; index < previousProfiles.length; index += 1) {
    const prev = previousProfiles[index];
    const next = nextProfiles[index];
    if (prev === next) {
      continue;
    }
    if (!prev || !next || typeof prev !== "object" || typeof next !== "object") {
      return true;
    }

    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      if (prev[key] !== next[key]) {
        return true;
      }
    }
  }

  return false;
}

function safeDecodeNpub(npub) {
  if (typeof npub !== "string") {
    return null;
  }

  const trimmed = npub.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const decoded = window?.NostrTools?.nip19?.decode(trimmed);
    if (decoded && decoded.type === "npub" && typeof decoded.data === "string") {
      return decoded.data;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function normalizeHexPubkey(pubkey) {
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

  if (trimmed.startsWith("npub1")) {
    const decoded = safeDecodeNpub(trimmed);
    if (decoded && HEX64_REGEX.test(decoded)) {
      return decoded.toLowerCase();
    }
  }

  return null;
}

function normalizeEventId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return HEX64_REGEX.test(trimmed) ? trimmed : null;
}

export function getSavedProfiles() {
  return savedProfiles;
}

export function getProfileCacheMap() {
  return profileCache;
}

export function getActiveProfilePubkey() {
  return activeProfilePubkey;
}

export function setActiveProfilePubkey(pubkey, { persist = true } = {}) {
  const normalized = normalizeHexPubkey(pubkey);
  const nextValue =
    normalized || (typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : null);
  if (activeProfilePubkey === nextValue) {
    if (persist) {
      persistSavedProfiles({ persistActive: true });
    }
    return activeProfilePubkey;
  }

  activeProfilePubkey = nextValue;
  if (persist) {
    persistSavedProfiles({ persistActive: true });
  }
  return activeProfilePubkey;
}

export function mutateSavedProfiles(mutator, { persist = true, persistActive = true } = {}) {
  if (typeof mutator !== "function") {
    return { changed: false, profiles: getSavedProfiles() };
  }

  const draft = savedProfiles.slice();
  const result = mutator(draft);
  const nextProfiles = Array.isArray(result) ? result : draft;
  const changed = hasSavedProfilesChanged(savedProfiles, nextProfiles);

  if (changed) {
    savedProfiles = nextProfiles;
    if (persist) {
      persistSavedProfiles({ persistActive });
    }
  } else if (persist && persistActive === false) {
    persistSavedProfiles({ persistActive: false });
  }

  return { changed, profiles: getSavedProfiles() };
}

export function setSavedProfiles(nextProfiles, options) {
  return mutateSavedProfiles(
    () => (Array.isArray(nextProfiles) ? nextProfiles.slice() : []),
    options
  );
}

export function readSavedProfilesPayloadFromStorage() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    userLogger.warn(
      "[cache.readSavedProfilesPayloadFromStorage] Failed to parse payload:",
      error
    );
    return null;
  }
}

function writeSavedProfilesPayloadToStorage(payload) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(SAVED_PROFILES_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    const isQuotaError =
      error &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error.code === 22 ||
        error.code === 1014);
    if (isQuotaError) {
      userLogger.warn(
        "[cache.writeSavedProfilesPayloadToStorage] Storage quota exceeded; keeping in-memory copy only.",
        error
      );
    } else {
      userLogger.warn(
        "[cache.writeSavedProfilesPayloadToStorage] Failed to persist saved profiles:",
        error
      );
    }
  }
}

export function persistSavedProfiles({ persistActive = true } = {}) {
  if (typeof localStorage === "undefined") {
    return;
  }

  if (!savedProfiles.length && !activeProfilePubkey) {
    try {
      localStorage.removeItem(SAVED_PROFILES_STORAGE_KEY);
    } catch (error) {
      userLogger.warn(
        "[cache.persistSavedProfiles] Failed to remove empty payload:",
        error
      );
    }
    return;
  }

  let activePubkeyToPersist = activeProfilePubkey || null;
  if (!persistActive) {
    const storedPayload = readSavedProfilesPayloadFromStorage();
    if (storedPayload && typeof storedPayload === "object") {
      const candidate =
        typeof storedPayload.activePubkey === "string"
          ? storedPayload.activePubkey
          : typeof storedPayload.activePubKey === "string"
          ? storedPayload.activePubKey
          : null;
      const normalizedStored = normalizeHexPubkey(candidate);
      if (normalizedStored) {
        activePubkeyToPersist = normalizedStored;
      } else if (candidate === null) {
        activePubkeyToPersist = null;
      }
    }
  }

  const payload = {
    version: SAVED_PROFILES_STORAGE_VERSION,
    entries: savedProfiles.map((entry) => ({
      pubkey: entry.pubkey,
      npub:
        typeof entry.npub === "string" && entry.npub.trim() ? entry.npub.trim() : null,
      name: typeof entry.name === "string" ? entry.name : "",
      picture: typeof entry.picture === "string" ? entry.picture : "",
      authType:
        typeof entry.authType === "string" && entry.authType.trim()
          ? entry.authType.trim()
          : null,
    })),
    activePubkey: activePubkeyToPersist,
  };

  writeSavedProfilesPayloadToStorage(payload);
}

export function loadSavedProfilesFromStorage() {
  savedProfiles = [];
  activeProfilePubkey = null;
  hadExplicitActiveProfile = false;

  if (typeof localStorage === "undefined") {
    return {
      profiles: getSavedProfiles(),
      activePubkey: activeProfilePubkey,
      hasExplicitActiveProfile: hadExplicitActiveProfile,
    };
  }

  const raw = localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);
  if (!raw) {
    return {
      profiles: getSavedProfiles(),
      activePubkey: activeProfilePubkey,
      hasExplicitActiveProfile: hadExplicitActiveProfile,
    };
  }

  let needsRewrite = false;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.version === SAVED_PROFILES_STORAGE_VERSION) {
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const seenPubkeys = new Set();
      for (const candidate of entries) {
        if (!candidate || typeof candidate !== "object") {
          continue;
        }

        const normalizedPubkey = normalizeHexPubkey(candidate.pubkey);
        if (!normalizedPubkey || seenPubkeys.has(normalizedPubkey)) {
          needsRewrite = true;
          continue;
        }

        seenPubkeys.add(normalizedPubkey);
        const rawAuthType =
          typeof candidate.authType === "string" ? candidate.authType : null;
        let storedAuthType = null;
        if (rawAuthType) {
          const trimmedAuthType = rawAuthType.trim();
          if (trimmedAuthType) {
            storedAuthType = trimmedAuthType;
            if (trimmedAuthType !== rawAuthType) {
              needsRewrite = true;
            }
          }
        }

        if (!storedAuthType) {
          storedAuthType = "nip07";
          if (rawAuthType !== "nip07") {
            needsRewrite = true;
          }
        }
        const npub =
          typeof candidate.npub === "string" && candidate.npub.trim()
            ? candidate.npub.trim()
            : null;

        const entry = {
          pubkey: normalizedPubkey,
          npub,
          name: typeof candidate.name === "string" ? candidate.name : "",
          picture: typeof candidate.picture === "string" ? candidate.picture : "",
          authType: storedAuthType,
        };

        if (
          typeof candidate.npub === "string" && candidate.npub.trim() !== candidate.npub
        ) {
          needsRewrite = true;
        }

        if (entry.npub && typeof candidate.npub !== "string" && entry.npub !== candidate.npub) {
          needsRewrite = true;
        }

        savedProfiles.push(entry);
      }

      let hasActiveField = false;
      let activeCandidate;
      if (Object.prototype.hasOwnProperty.call(parsed, "activePubkey")) {
        hasActiveField = true;
        activeCandidate = parsed.activePubkey;
      } else if (Object.prototype.hasOwnProperty.call(parsed, "activePubKey")) {
        hasActiveField = true;
        activeCandidate = parsed.activePubKey;
      }

      if (hasActiveField) {
        hadExplicitActiveProfile = true;
        if (typeof activeCandidate === "string") {
          const normalizedActive = normalizeHexPubkey(activeCandidate);
          if (normalizedActive && seenPubkeys.has(normalizedActive)) {
            activeProfilePubkey = normalizedActive;
          } else if (activeCandidate) {
            needsRewrite = true;
          }
        } else if (activeCandidate !== null && activeCandidate !== undefined) {
          needsRewrite = true;
        }
      }
    } else if (raw) {
      needsRewrite = true;
    }
  } catch (error) {
    userLogger.warn("[cache.loadSavedProfilesFromStorage] Failed to parse payload:", error);
    needsRewrite = true;
  }

  if (!activeProfilePubkey && savedProfiles.length && !hadExplicitActiveProfile) {
    activeProfilePubkey = savedProfiles[0].pubkey;
    needsRewrite = true;
  }

  if (needsRewrite) {
    persistSavedProfiles();
  }

  return {
    profiles: getSavedProfiles(),
    activePubkey: activeProfilePubkey,
    hasExplicitActiveProfile: hadExplicitActiveProfile,
  };
}

export function syncSavedProfileFromCache(pubkey, { persist = false } = {}) {
  const normalized = normalizeHexPubkey(pubkey);
  if (!normalized) {
    return false;
  }

  const cacheEntry = profileCache.get(normalized);
  if (!cacheEntry || typeof cacheEntry !== "object") {
    return false;
  }

  let updated = false;
  mutateSavedProfiles((profiles) => {
    const next = profiles.slice();
    const index = next.findIndex((entry) => entry && entry.pubkey === normalized);
    if (index < 0) {
      return profiles;
    }

    const existing = next[index] || {};
    const profile = cacheEntry.profile || {};
    const nextEntry = {
      ...existing,
      name: profile.name || existing.name || "",
      picture: profile.picture || existing.picture || "",
    };

    if (
      existing.name === nextEntry.name &&
      existing.picture === nextEntry.picture
    ) {
      return profiles;
    }

    next[index] = nextEntry;
    updated = true;
    return next;
  }, { persist, persistActive: false });

  return updated;
}

export function loadProfileCacheFromStorage() {
  if (typeof localStorage === "undefined") {
    return;
  }

  const now = Date.now();
  const raw = localStorage.getItem(PROFILE_CACHE_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }

    if (parsed.version !== PROFILE_CACHE_VERSION) {
      return;
    }

    const entries = parsed.entries;
    if (!entries || typeof entries !== "object") {
      return;
    }

    for (const [pubkey, entry] of Object.entries(entries)) {
      if (!pubkey || !entry || typeof entry !== "object") {
        continue;
      }

      const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
      if (!timestamp || now - timestamp > PROFILE_CACHE_TTL_MS) {
        continue;
      }

      const profile = entry.profile;
      if (!profile || typeof profile !== "object") {
        continue;
      }

      const normalized = {
        name: profile.name || profile.display_name || "Unknown",
        picture: profile.picture || "assets/svg/default-profile.svg",
      };

      const about = sanitizeProfileString(profile.about || profile.aboutMe);
      if (about) {
        normalized.about = about;
      }

      const website = sanitizeProfileString(profile.website || profile.url);
      if (website) {
        normalized.website = website;
      }

      const banner = sanitizeProfileString(profile.banner || profile.header);
      if (banner) {
        normalized.banner = banner;
      }

      const lud16 = sanitizeProfileString(profile.lud16);
      if (lud16) {
        normalized.lud16 = lud16;
      }

      const lud06 = sanitizeProfileString(profile.lud06);
      if (lud06) {
        normalized.lud06 = lud06;
      }

      const lightningCandidates = [
        sanitizeProfileString(profile.lightningAddress),
        lud16,
        lud06,
      ].filter(Boolean);
      if (lightningCandidates.length) {
        normalized.lightningAddress = lightningCandidates[0];
      }

      profileCache.set(pubkey, {
        profile: normalized,
        timestamp,
      });
    }
  } catch (error) {
    userLogger.warn("[cache.loadProfileCacheFromStorage] Failed to parse payload:", error);
  }
}

export function persistProfileCacheToStorage() {
  if (typeof localStorage === "undefined") {
    return;
  }

  const now = Date.now();
  const entries = {};

  for (const [pubkey, entry] of profileCache.entries()) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
    if (!timestamp || now - timestamp > PROFILE_CACHE_TTL_MS) {
      profileCache.delete(pubkey);
      continue;
    }

    entries[pubkey] = {
      profile: entry.profile,
      timestamp,
    };
  }

  const payload = {
    version: PROFILE_CACHE_VERSION,
    savedAt: now,
    entries,
  };

  if (Object.keys(entries).length === 0) {
    try {
      localStorage.removeItem(PROFILE_CACHE_STORAGE_KEY);
    } catch (error) {
      userLogger.warn(
        "[cache.persistProfileCacheToStorage] Failed to clear storage:",
        error
      );
    }
    return;
  }

  try {
    localStorage.setItem(PROFILE_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    userLogger.warn("[cache.persistProfileCacheToStorage] Failed to persist cache:", error);
  }
}

export function getProfileCacheEntry(pubkey) {
  const normalized = normalizeHexPubkey(pubkey);
  if (!normalized) {
    return null;
  }

  const entry = profileCache.get(normalized);
  if (!entry) {
    return null;
  }

  const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
  if (!timestamp || Date.now() - timestamp > PROFILE_CACHE_TTL_MS) {
    profileCache.delete(normalized);
    persistProfileCacheToStorage();
    return null;
  }

  return entry;
}

export function setProfileCacheEntry(pubkey, profile, { persist = true } = {}) {
  const normalizedPubkey = normalizeHexPubkey(pubkey);
  if (!normalizedPubkey || !profile) {
    return null;
  }

  const normalized = {
    name: profile.name || profile.display_name || "Unknown",
    picture:
      sanitizeProfileMediaUrl(profile.picture || profile.image) ||
      "assets/svg/default-profile.svg",
  };

  const about = sanitizeProfileString(profile.about || profile.aboutMe);
  if (about) {
    normalized.about = about;
  }

  const website = sanitizeProfileString(profile.website || profile.url);
  if (website) {
    normalized.website = website;
  }

  const banner = sanitizeProfileMediaUrl(
    profile.banner ||
      profile.header ||
      profile.background ||
      profile.cover ||
      profile.cover_image ||
      profile.coverImage
  );
  if (banner) {
    normalized.banner = banner;
  }

  const lud16 = sanitizeProfileString(profile.lud16);
  if (lud16) {
    normalized.lud16 = lud16;
  }

  const lud06 = sanitizeProfileString(profile.lud06);
  if (lud06) {
    normalized.lud06 = lud06;
  }

  const lightningCandidates = [
    sanitizeProfileString(profile.lightningAddress),
    lud16,
    lud06,
  ].filter(Boolean);
  if (lightningCandidates.length) {
    normalized.lightningAddress = lightningCandidates[0];
  }

  const entry = {
    profile: normalized,
    timestamp: Date.now(),
  };

  profileCache.set(normalizedPubkey, entry);
  if (persist) {
    persistProfileCacheToStorage();
  }

  return entry;
}

function haveModerationSettingsChanged(previous, next) {
  if (!previous || !next) {
    return true;
  }

  return (
    previous.blurThreshold !== next.blurThreshold ||
    previous.autoplayBlockThreshold !== next.autoplayBlockThreshold ||
    previous.trustedMuteHideThreshold !== next.trustedMuteHideThreshold ||
    previous.trustedSpamHideThreshold !== next.trustedSpamHideThreshold
  );
}

export function getDefaultModerationSettings() {
  return createDefaultModerationSettings();
}

export function getModerationSettings() {
  return { ...moderationSettings };
}

export function loadModerationSettingsFromStorage() {
  if (typeof localStorage === "undefined") {
    moderationSettings = createDefaultModerationSettings();
    return getModerationSettings();
  }

  const raw = localStorage.getItem(MODERATION_SETTINGS_STORAGE_KEY);
  if (!raw) {
    moderationSettings = createDefaultModerationSettings();
    return getModerationSettings();
  }

  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      moderationSettings = createDefaultModerationSettings();
      return getModerationSettings();
    }

    if (payload.version !== MODERATION_SETTINGS_STORAGE_VERSION) {
      moderationSettings = createDefaultModerationSettings();
      return getModerationSettings();
    }

    const defaults = createDefaultModerationSettings();
    const overrides =
      payload.overrides && typeof payload.overrides === "object"
        ? payload.overrides
        : {};

    moderationSettings = {
      blurThreshold: sanitizeModerationThreshold(
        overrides.blurThreshold,
        defaults.blurThreshold,
      ),
      autoplayBlockThreshold: sanitizeModerationThreshold(
        overrides.autoplayBlockThreshold,
        defaults.autoplayBlockThreshold,
      ),
      trustedMuteHideThreshold: sanitizeModerationThreshold(
        overrides.trustedMuteHideThreshold,
        defaults.trustedMuteHideThreshold,
      ),
      trustedSpamHideThreshold: sanitizeModerationThreshold(
        overrides.trustedSpamHideThreshold,
        defaults.trustedSpamHideThreshold,
      ),
    };
  } catch (error) {
    moderationSettings = createDefaultModerationSettings();
    userLogger.warn(
      "[cache.loadModerationSettingsFromStorage] Failed to parse payload:",
      error,
    );
  }

  return getModerationSettings();
}

function persistModerationSettingsToStorage() {
  if (typeof localStorage === "undefined") {
    return;
  }

  const defaults = createDefaultModerationSettings();
  const overrides = {};

  if (moderationSettings.blurThreshold !== defaults.blurThreshold) {
    overrides.blurThreshold = moderationSettings.blurThreshold;
  }

  if (moderationSettings.autoplayBlockThreshold !== defaults.autoplayBlockThreshold) {
    overrides.autoplayBlockThreshold = moderationSettings.autoplayBlockThreshold;
  }

  if (
    moderationSettings.trustedMuteHideThreshold !==
    defaults.trustedMuteHideThreshold
  ) {
    overrides.trustedMuteHideThreshold = moderationSettings.trustedMuteHideThreshold;
  }

  if (
    moderationSettings.trustedSpamHideThreshold !==
    defaults.trustedSpamHideThreshold
  ) {
    overrides.trustedSpamHideThreshold = moderationSettings.trustedSpamHideThreshold;
  }

  if (Object.keys(overrides).length === 0) {
    try {
      localStorage.removeItem(MODERATION_SETTINGS_STORAGE_KEY);
    } catch (error) {
      userLogger.warn(
        "[cache.persistModerationSettingsToStorage] Failed to clear overrides:",
        error,
      );
    }
    return;
  }

  const payload = {
    version: MODERATION_SETTINGS_STORAGE_VERSION,
    overrides,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(
      MODERATION_SETTINGS_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch (error) {
    userLogger.warn(
      "[cache.persistModerationSettingsToStorage] Failed to persist overrides:",
      error,
    );
  }
}

export function setModerationSettings(partial = {}, { persist = true } = {}) {
  const defaults = createDefaultModerationSettings();
  const next = { ...moderationSettings };
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(partial, "blurThreshold")) {
    const value = partial.blurThreshold;
    const sanitized =
      value === null
        ? defaults.blurThreshold
        : sanitizeModerationThreshold(value, defaults.blurThreshold);
    if (next.blurThreshold !== sanitized) {
      next.blurThreshold = sanitized;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, "autoplayBlockThreshold")) {
    const value = partial.autoplayBlockThreshold;
    const sanitized =
      value === null
        ? defaults.autoplayBlockThreshold
        : sanitizeModerationThreshold(value, defaults.autoplayBlockThreshold);
    if (next.autoplayBlockThreshold !== sanitized) {
      next.autoplayBlockThreshold = sanitized;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, "trustedMuteHideThreshold")) {
    const value = partial.trustedMuteHideThreshold;
    const sanitized =
      value === null
        ? defaults.trustedMuteHideThreshold
        : sanitizeModerationThreshold(value, defaults.trustedMuteHideThreshold);
    if (next.trustedMuteHideThreshold !== sanitized) {
      next.trustedMuteHideThreshold = sanitized;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, "trustedSpamHideThreshold")) {
    const value = partial.trustedSpamHideThreshold;
    const sanitized =
      value === null
        ? defaults.trustedSpamHideThreshold
        : sanitizeModerationThreshold(value, defaults.trustedSpamHideThreshold);
    if (next.trustedSpamHideThreshold !== sanitized) {
      next.trustedSpamHideThreshold = sanitized;
      changed = true;
    }
  }

  if (!changed) {
    if (persist) {
      persistModerationSettingsToStorage();
    }
    return { ...moderationSettings };
  }

  moderationSettings = next;

  if (persist) {
    persistModerationSettingsToStorage();
  }

  return { ...moderationSettings };
}

export function resetModerationSettings({ persist = true } = {}) {
  const previous = moderationSettings;
  moderationSettings = createDefaultModerationSettings();

  const changed = haveModerationSettingsChanged(previous, moderationSettings);

  if (persist) {
    persistModerationSettingsToStorage();
  }

  if (!changed) {
    return { ...moderationSettings };
  }

  return { ...moderationSettings };
}

export function getModerationOverridesMap() {
  return moderationOverrides;
}

export function getModerationOverride(eventId) {
  const normalized = normalizeEventId(eventId);
  if (!normalized) {
    return null;
  }

  const entry = moderationOverrides.get(normalized);
  if (!entry) {
    return null;
  }

  return { ...entry };
}

export function loadModerationOverridesFromStorage() {
  if (typeof localStorage === "undefined") {
    return;
  }

  const raw = localStorage.getItem(MODERATION_OVERRIDE_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.version !== MODERATION_OVERRIDE_STORAGE_VERSION) {
      return;
    }

    const entries = payload.entries && typeof payload.entries === "object"
      ? payload.entries
      : {};

    moderationOverrides.clear();

    for (const [eventId, entry] of Object.entries(entries)) {
      const normalized = normalizeEventId(eventId);
      if (!normalized) {
        continue;
      }
      if (!entry || entry.showAnyway !== true) {
        continue;
      }
      const updatedAt = Number.isFinite(entry.updatedAt)
        ? Math.floor(entry.updatedAt)
        : Date.now();
      moderationOverrides.set(normalized, {
        showAnyway: true,
        updatedAt,
      });
    }
  } catch (error) {
    moderationOverrides.clear();
    userLogger.warn(
      "[cache.loadModerationOverridesFromStorage] Failed to parse payload:",
      error,
    );
  }
}

export function persistModerationOverridesToStorage() {
  if (typeof localStorage === "undefined") {
    return;
  }

  const entries = {};
  for (const [eventId, entry] of moderationOverrides.entries()) {
    if (!entry || entry.showAnyway !== true) {
      continue;
    }
    const updatedAt = Number.isFinite(entry.updatedAt)
      ? Math.floor(entry.updatedAt)
      : Date.now();
    entries[eventId] = {
      showAnyway: true,
      updatedAt,
    };
  }

  if (Object.keys(entries).length === 0) {
    try {
      localStorage.removeItem(MODERATION_OVERRIDE_STORAGE_KEY);
    } catch (error) {
      userLogger.warn(
        "[cache.persistModerationOverridesToStorage] Failed to clear overrides:",
        error,
      );
    }
    return;
  }

  const payload = {
    version: MODERATION_OVERRIDE_STORAGE_VERSION,
    savedAt: Date.now(),
    entries,
  };

  try {
    localStorage.setItem(
      MODERATION_OVERRIDE_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch (error) {
    userLogger.warn(
      "[cache.persistModerationOverridesToStorage] Failed to persist overrides:",
      error,
    );
  }
}

export function setModerationOverride(
  eventId,
  override = {},
  { persist = true } = {},
) {
  const normalized = normalizeEventId(eventId);
  if (!normalized) {
    return null;
  }

  const showAnyway = override?.showAnyway === true;
  if (!showAnyway) {
    const removed = moderationOverrides.delete(normalized);
    if (removed && persist) {
      persistModerationOverridesToStorage();
    }
    return null;
  }

  const updatedAt = Number.isFinite(override?.updatedAt)
    ? Math.floor(override.updatedAt)
    : Date.now();

  const existing = moderationOverrides.get(normalized);
  const nextEntry = { showAnyway: true, updatedAt };
  const changed =
    !existing ||
    existing.showAnyway !== nextEntry.showAnyway ||
    existing.updatedAt !== nextEntry.updatedAt;

  moderationOverrides.set(normalized, nextEntry);

  if (persist && changed) {
    persistModerationOverridesToStorage();
  }

  return { ...nextEntry };
}

export function clearModerationOverride(eventId, { persist = true } = {}) {
  const normalized = normalizeEventId(eventId);
  if (!normalized) {
    return false;
  }

  const removed = moderationOverrides.delete(normalized);
  if (removed && persist) {
    persistModerationOverridesToStorage();
  }

  return removed;
}

function buildUrlProbeKey(url, options = {}) {
  const trimmed = typeof url === "string" ? url : "";
  const mode = options?.confirmPlayable ? "playable" : "basic";
  return `${trimmed}::${mode}`;
}

function isUrlHealthEntryFresh(entry, url) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const now = Date.now();
  if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now) {
    return false;
  }

  if (url && entry.url && entry.url !== url) {
    return false;
  }

  return true;
}

export function getCachedUrlHealth(eventId, url) {
  if (!eventId) {
    return null;
  }

  const entry = urlHealthCache.get(eventId);
  if (isUrlHealthEntryFresh(entry, url)) {
    return entry;
  }

  if (entry) {
    urlHealthCache.delete(eventId);
  }

  const stored = readUrlHealthFromStorage(eventId);
  if (!isUrlHealthEntryFresh(stored, url)) {
    if (stored) {
      removeUrlHealthFromStorage(eventId);
    }
    return null;
  }

  urlHealthCache.set(eventId, stored);
  return stored;
}

export function storeUrlHealth(eventId, url, result, ttlMs = URL_HEALTH_TTL_MS) {
  if (!eventId) {
    return null;
  }

  const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : URL_HEALTH_TTL_MS;
  const now = Date.now();
  const entry = {
    status: result?.status || "checking",
    message: result?.message || "⏳ CDN",
    url: url || result?.url || "",
    expiresAt: now + ttl,
    lastCheckedAt: now,
  };
  urlHealthCache.set(eventId, entry);
  writeUrlHealthToStorage(eventId, entry);
  return entry;
}

export function setInFlightUrlProbe(eventId, url, promise, options = {}) {
  if (!eventId || !promise) {
    return;
  }

  const key = buildUrlProbeKey(url, options);
  urlHealthInFlight.set(eventId, { promise, key });
  promise.finally(() => {
    const current = urlHealthInFlight.get(eventId);
    if (current && current.promise === promise) {
      urlHealthInFlight.delete(eventId);
    }
  });
}

export function getInFlightUrlProbe(eventId, url, options = {}) {
  if (!eventId) {
    return null;
  }

  const entry = urlHealthInFlight.get(eventId);
  if (!entry) {
    return null;
  }

  const key = buildUrlProbeKey(url, options);
  if (entry.key && entry.key !== key) {
    return null;
  }

  return entry.promise;
}

export const urlHealthConstants = {
  URL_HEALTH_TTL_MS,
  URL_HEALTH_TIMEOUT_RETRY_MS,
  URL_PROBE_TIMEOUT_RETRY_MS,
};
