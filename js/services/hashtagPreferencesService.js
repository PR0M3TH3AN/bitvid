// js/services/hashtagPreferencesService.js
import {
  nostrClient,
  requestDefaultExtensionPermissions,
  getActiveSigner,
} from "../nostrClientFacade.js";
import { isSessionActor } from "../nostr/sessionActor.js";
import {
  buildHashtagPreferenceEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "../nostrPublish.js";
import { userLogger, devLogger } from "../utils/logger.js";
import { normalizeHashtag } from "../utils/hashtagNormalization.js";
import { profileCache } from "../state/profileCache.js";
import { DEFAULT_RELAY_URLS } from "../nostr/toolkit.js";
import { relayManager } from "../relayManager.js";

const LOG_PREFIX = "[HashtagPreferences]";
const HASHTAG_IDENTIFIER = "bitvid:tag-preferences";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const DEFAULT_VERSION = 1;
const DECRYPT_TIMEOUT_MS = 90000;
const DECRYPT_RETRY_DELAY_MS = 10000;

class TinyEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return () => {};
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        userLogger.warn(
          `${LOG_PREFIX} listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

const EVENTS = Object.freeze({
  CHANGE: "change",
});

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

  return null;
}

function sanitizeRelayList(candidate) {
  return Array.isArray(candidate)
    ? candidate
        .map((url) => (typeof url === "string" ? url.trim() : ""))
        .filter(Boolean)
    : [];
}

function normalizeEncryptionToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePreferencesPayload(payload) {
  const versionCandidate = Number(payload?.version);
  const version = Number.isFinite(versionCandidate) && versionCandidate > 0
    ? versionCandidate
    : DEFAULT_VERSION;

  const rawInterests = Array.isArray(payload?.interests)
    ? payload.interests
    : [];
  const rawDisinterests = Array.isArray(payload?.disinterests)
    ? payload.disinterests
    : [];

  const interests = new Set();
  for (const tag of rawInterests) {
    const normalizedTag = normalizeHashtag(tag);
    if (normalizedTag) {
      interests.add(normalizedTag);
    }
  }

  const disinterests = new Set();
  for (const tag of rawDisinterests) {
    const normalizedTag = normalizeHashtag(tag);
    if (!normalizedTag) {
      continue;
    }
    disinterests.add(normalizedTag);
    interests.delete(normalizedTag);
  }

  return {
    version,
    interests,
    disinterests,
  };
}

function extractEncryptionHints(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const hints = [];

  const pushUnique = (scheme) => {
    if (!scheme || hints.includes(scheme)) {
      return;
    }
    hints.push(scheme);
  };

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const label = typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";
    if (label !== "encrypted" && label !== "encryption") {
      continue;
    }
    const rawValue = typeof tag[1] === "string" ? tag[1] : "";
    if (!rawValue) {
      continue;
    }
    const parts = rawValue
      .split(/[\s,]+/)
      .map((part) => normalizeEncryptionToken(part))
      .filter(Boolean);
    for (const part of parts) {
      if (part === "nip44v2" || part === "nip44v02") {
        pushUnique("nip44_v2");
        continue;
      }
      if (part === "nip44") {
        pushUnique("nip44");
        continue;
      }
      if (part === "nip04" || part === "nip4") {
        pushUnique("nip04");
      }
    }
  }

  return hints;
}

function determineDecryptionOrder(event, availableSchemes) {
  const available = Array.isArray(availableSchemes) ? availableSchemes : [];
  const availableSet = new Set(available);
  const prioritized = [];

  const hints = extractEncryptionHints(event);
  const aliasMap = {
    nip04: ["nip04"],
    nip44: ["nip44", "nip44_v2"],
    nip44_v2: ["nip44_v2", "nip44"],
  };

  for (const hint of hints) {
    const candidates = Array.isArray(aliasMap[hint]) ? aliasMap[hint] : [hint];
    for (const candidate of candidates) {
      if (availableSet.has(candidate) && !prioritized.includes(candidate)) {
        prioritized.push(candidate);
        break;
      }
    }
  }

  for (const fallback of ["nip44_v2", "nip44", "nip04"]) {
    if (availableSet.has(fallback) && !prioritized.includes(fallback)) {
      prioritized.push(fallback);
    }
  }

  return prioritized.length ? prioritized : available;
}

class HashtagPreferencesService {
  constructor() {
    this.emitter = new TinyEventEmitter();
    this.interests = new Set();
    this.disinterests = new Set();
    this.activePubkey = null;
    this.eventId = null;
    this.eventCreatedAt = null;
    this.loaded = false;
    this.preferencesVersion = DEFAULT_VERSION;
    this.decryptRetryTimeoutId = null;

    profileCache.subscribe((event, detail) => {
      if (event === "profileChanged") {
        this.reset();
        if (detail.pubkey) {
          this.load(detail.pubkey);
        }
      } else if (event === "runtimeCleared" && detail.pubkey === this.activePubkey) {
        this.reset();
        if (this.activePubkey) {
          this.load(this.activePubkey);
        }
      }
    });
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  reset() {
    this.interests = new Set();
    this.disinterests = new Set();
    this.eventId = null;
    this.eventCreatedAt = null;
    this.loaded = false;
    this.preferencesVersion = DEFAULT_VERSION;
    if (this.decryptRetryTimeoutId) {
      clearTimeout(this.decryptRetryTimeoutId);
      this.decryptRetryTimeoutId = null;
    }
    this.emitChange("reset");
  }

  saveToCache() {
    const interests = this.getInterests();
    const disinterests = this.getDisinterests();
    const payload = {
      interests,
      disinterests,
      version: this.preferencesVersion,
      eventId: this.eventId,
      createdAt: this.eventCreatedAt,
    };
    // Use the note type key directly, though "interests" maps to HASHTAG_PREFERENCES
    // in profileCache. Using NOTE_TYPES.HASHTAG_PREFERENCES explicitly is safer if we import it,
    // but relying on the mapped key "interests" is also consistent with current usage.
    // However, the fix requires us to ensure we use the unified path.
    // We'll stick to "interests" which maps to NOTE_TYPES.HASHTAG_PREFERENCES in profileCache.js
    profileCache.set("interests", payload);
  }

  loadFromCache(pubkey) {
    // profileCache internally uses activePubkey, but we should verify if it matches
    try {
      let cached = profileCache.getProfileData(pubkey, "interests");

      // Legacy fallback migration
      if (!cached && typeof localStorage !== "undefined") {
        try {
          const legacy = localStorage.getItem(HASHTAG_IDENTIFIER);
          if (legacy) {
            const parsed = JSON.parse(legacy);
            // Migrate to unified profile cache
            profileCache.set("interests", parsed);
            localStorage.removeItem(HASHTAG_IDENTIFIER);
            cached = parsed;
            devLogger.log(`${LOG_PREFIX} Migrated legacy preferences to profileCache.`);
          }
        } catch (err) {
          devLogger.warn(`${LOG_PREFIX} Legacy migration failed:`, err);
        }
      }

      if (cached && typeof cached === "object") {
        this.activePubkey = normalizeHexPubkey(pubkey);
        this.interests = new Set(Array.isArray(cached.interests) ? cached.interests : []);
        this.disinterests = new Set(Array.isArray(cached.disinterests) ? cached.disinterests : []);
        this.eventId = cached.eventId || null;
        this.eventCreatedAt = cached.createdAt || null;
        this.preferencesVersion = cached.version || DEFAULT_VERSION;
        this.loaded = true;
        this.emitChange("cache-load");
        return true;
      }
    } catch (err) {
      devLogger.warn(`${LOG_PREFIX} loadFromCache failed:`, err);
    }
    return false;
  }

  getInterests() {
    return Array.from(this.interests).sort((a, b) => a.localeCompare(b));
  }

  getDisinterests() {
    return Array.from(this.disinterests).sort((a, b) => a.localeCompare(b));
  }

  addInterest(tag) {
    const normalized = normalizeHashtag(tag);
    if (!normalized) {
      return false;
    }

    const hadInterest = this.interests.has(normalized);
    const removedFromDisinterests = this.disinterests.delete(normalized);
    this.interests.add(normalized);

    if (!hadInterest || removedFromDisinterests) {
      this.emitChange("interest-added", { tag: normalized });
      this.publish().catch((err) =>
        userLogger.warn(`${LOG_PREFIX} Auto-save failed`, err),
      );
      return true;
    }

    return false;
  }

  removeInterest(tag) {
    const normalized = normalizeHashtag(tag);
    if (!normalized || !this.interests.has(normalized)) {
      return false;
    }

    this.interests.delete(normalized);
    this.emitChange("interest-removed", { tag: normalized });
    this.publish().catch((err) =>
      userLogger.warn(`${LOG_PREFIX} Auto-save failed`, err),
    );
    return true;
  }

  addDisinterest(tag) {
    const normalized = normalizeHashtag(tag);
    if (!normalized) {
      return false;
    }

    const hadDisinterest = this.disinterests.has(normalized);
    const removedFromInterests = this.interests.delete(normalized);
    this.disinterests.add(normalized);

    if (!hadDisinterest || removedFromInterests) {
      this.emitChange("disinterest-added", { tag: normalized });
      this.publish().catch((err) =>
        userLogger.warn(`${LOG_PREFIX} Auto-save failed`, err),
      );
      return true;
    }

    return false;
  }

  removeDisinterest(tag) {
    const normalized = normalizeHashtag(tag);
    if (!normalized || !this.disinterests.has(normalized)) {
      return false;
    }

    this.disinterests.delete(normalized);
    this.emitChange("disinterest-removed", { tag: normalized });
    this.publish().catch((err) =>
      userLogger.warn(`${LOG_PREFIX} Auto-save failed`, err),
    );
    return true;
  }

  emitChange(action, detail = {}) {
    try {
      this.emitter.emit(EVENTS.CHANGE, {
        action,
        interests: this.getInterests(),
        disinterests: this.getDisinterests(),
        eventId: this.eventId,
        createdAt: this.eventCreatedAt,
        version: this.preferencesVersion,
        ...detail,
      });
    } catch (error) {
      userLogger.warn(`${LOG_PREFIX} Failed to emit change event`, error);
    }
  }

  scheduleDecryptRetry(pubkey, error) {
    const normalized = normalizeHexPubkey(pubkey);
    if (!normalized) {
      return;
    }
    if (this.decryptRetryTimeoutId) {
      clearTimeout(this.decryptRetryTimeoutId);
    }
    this.decryptRetryTimeoutId = setTimeout(() => {
      this.decryptRetryTimeoutId = null;
      if (this.activePubkey && this.activePubkey !== normalized) {
        return;
      }
      this.load(normalized).catch((retryError) => {
        userLogger.warn(`${LOG_PREFIX} Decryption retry failed`, retryError);
      });
    }, DECRYPT_RETRY_DELAY_MS);
    devLogger.log(
      `${LOG_PREFIX} Decryption timed out; scheduling retry in ${DECRYPT_RETRY_DELAY_MS / 1000}s.`,
      error,
    );
  }

  async load(pubkey) {
    const normalized = normalizeHexPubkey(pubkey);
    let wasLoadedForUser =
      this.activePubkey &&
      this.activePubkey === normalized &&
      (this.interests.size > 0 || this.disinterests.size > 0 || this.loaded);

    this.activePubkey = normalized;

    if (!normalized) {
      this.reset();
      this.loaded = true;
      return;
    }

    // Try cache first
    if (this.loadFromCache(normalized)) {
      wasLoadedForUser = true;
    }

    if (
      !nostrClient ||
      !nostrClient.pool ||
      typeof nostrClient.pool.list !== "function"
    ) {
      userLogger.warn(
        `${LOG_PREFIX} nostrClient.pool.list unavailable; treating preferences as empty.`,
      );
      // If we already have data for this user, do not reset on transient client issues.
      if (wasLoadedForUser) {
        userLogger.warn(
          `${LOG_PREFIX} Keeping existing preferences despite client unavailability.`,
        );
        return;
      }
      this.reset();
      this.loaded = true;
      return;
    }

    const readRelays = relayManager.getReadRelayUrls();
    const relays = readRelays.length > 0 ? readRelays : Array.from(DEFAULT_RELAY_URLS);
    if (!relays.length) {
      if (wasLoadedForUser) {
        userLogger.warn(
          `${LOG_PREFIX} Keeping existing preferences; no relays available for refresh.`,
        );
        return;
      }
      this.reset();
      this.loaded = true;
      return;
    }

    const schema = getNostrEventSchema(NOTE_TYPES.HASHTAG_PREFERENCES);
    const canonicalKind = schema?.kind ?? 30015;
    const legacyKind = 30005;

    const kinds = [canonicalKind];
    if (canonicalKind !== legacyKind) {
      kinds.push(legacyKind);
    }

    let events = [];
    let fetchError = null;

    try {
      // Use incremental fetching for both kinds concurrently (if multiple kinds)
      // fetchListIncrementally takes a single kind.
      // kinds is array of [canonicalKind, legacyKind] if different.

      // Anchor the fetch to the service's current state to prevent desync.
      // If we have cached data, we ask for updates since that timestamp.
      // If we have no data, we force a full fetch (since=0).
      const since = wasLoadedForUser ? Number(this.eventCreatedAt) || 0 : 0;

      const promises = kinds.map((kind) =>
        nostrClient.fetchListIncrementally({
          kind,
          pubkey: normalized,
          dTag: HASHTAG_IDENTIFIER,
          relayUrls: relays,
          since,
          timeoutMs: 12000,
        }),
      );

      const results = await Promise.all(promises);
      events = results.flat();

    } catch (error) {
      fetchError = error;
      userLogger.warn(
        `${LOG_PREFIX} Failed to load hashtag preferences from relays`,
        error,
      );
      events = [];
    }

    if (!events.length) {
      if (fetchError) {
        userLogger.warn(
          `${LOG_PREFIX} Failed to load hashtag preferences (keeping local state if any).`,
          fetchError,
        );
        return;
      }

      // If we failed to fetch (network error) but already have data for this user,
      // preserve the existing state instead of wiping it.
      // If fetchListIncrementally returns empty, it means no new updates or full fetch yielded nothing.
      if (wasLoadedForUser) {
        userLogger.warn(
          `${LOG_PREFIX} Keeping existing preferences despite empty relay response.`,
        );
        return;
      }

      this.reset();
      this.loaded = true;
      return;
    }

    const latest = events.reduce((current, candidate) => {
      if (!candidate) {
        return current;
      }
      if (!current) {
        return candidate;
      }
      const candidateTs = Number(candidate.created_at) || 0;
      const currentTs = Number(current.created_at) || 0;
      if (candidateTs === currentTs) {
        if (
          candidate.kind === canonicalKind &&
          current.kind !== canonicalKind
        ) {
          return candidate;
        }
        if (
          current.kind === canonicalKind &&
          candidate.kind !== canonicalKind
        ) {
          return current;
        }
        return candidate.id > current.id ? candidate : current;
      }
      return candidateTs > currentTs ? candidate : current;
    }, null);

    if (!latest) {
      if (wasLoadedForUser) {
        return;
      }
      this.reset();
      this.loaded = true;
      return;
    }

    const currentCreatedAt = Number(this.eventCreatedAt) || 0;
    const latestCreatedAt = Number(latest.created_at) || 0;

    // Protection against overwriting optimistic updates:
    // If the local version is newer (because user just edited), ignore the remote fetch.
    if (wasLoadedForUser && currentCreatedAt >= latestCreatedAt) {
      devLogger.log(
        `${LOG_PREFIX} Ignoring stale/concurrent preferences event (remote: ${latestCreatedAt}, local: ${currentCreatedAt}).`,
      );
      return;
    }

    let decryptResult;
    try {
      const decryptPromise = this.decryptEvent(latest, normalized);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => {
            const timeoutError = new Error(
              `Decryption timed out after ${DECRYPT_TIMEOUT_MS / 1000}s`,
            );
            timeoutError.code = "hashtag-preferences-decrypt-timeout";
            reject(timeoutError);
          },
          DECRYPT_TIMEOUT_MS,
        ),
      );
      decryptResult = await Promise.race([decryptPromise, timeoutPromise]);
    } catch (error) {
      decryptResult = { ok: false, error };
    }

    if (!decryptResult.ok) {
      userLogger.warn(
        `${LOG_PREFIX} Failed to decrypt hashtag preferences`,
        decryptResult.error,
      );

      if (decryptResult.error?.code === "hashtag-preferences-decrypt-timeout") {
        if (!wasLoadedForUser && !this.loaded) {
          this.loaded = true;
        }
        this.scheduleDecryptRetry(normalized, decryptResult.error);
        return;
      }

      // If we already have loaded preferences (e.g. from cache), preserve them
      // rather than wiping everything just because the remote update couldn't be decrypted.
      if (wasLoadedForUser) {
        userLogger.warn(
          `${LOG_PREFIX} Preserving cached preferences despite decryption failure.`,
        );
        return;
      }

      this.reset();
      this.loaded = true;
      return;
    }

    try {
      const payload = JSON.parse(decryptResult.plaintext);
      // Normalize the decrypted payload into the canonical preferences shape so
      // downstream consumers receive a single structure.
      const normalizedPayload = normalizePreferencesPayload(payload);

      this.preferencesVersion = normalizedPayload.version;
      this.interests = normalizedPayload.interests;
      this.disinterests = normalizedPayload.disinterests;
      this.eventId = latest.id || null;
      this.eventCreatedAt = Number.isFinite(latest?.created_at)
        ? latest.created_at
        : null;
      this.loaded = true;
      this.saveToCache();
      this.emitChange("sync", { scheme: decryptResult.scheme });
    } catch (error) {
      userLogger.warn(
        `${LOG_PREFIX} Failed to parse decrypted hashtag preferences`,
        error,
      );
      this.reset();
      this.loaded = true;
    }
  }

  async decryptEvent(event, userPubkey) {
    const ciphertext = typeof event?.content === "string" ? event.content : "";
    if (!ciphertext) {
      const error = new Error("Preference event missing ciphertext content.");
      error.code = "hashtag-preferences-empty";
      return { ok: false, error };
    }

    let signer = getActiveSigner();
    if (!signer && typeof nostrClient?.ensureActiveSignerForPubkey === "function") {
      signer = await nostrClient.ensureActiveSignerForPubkey(userPubkey);
    }
    const signerHasNip04 = typeof signer?.nip04Decrypt === "function";
    const signerHasNip44 = typeof signer?.nip44Decrypt === "function";

    const hints = extractEncryptionHints(event);
    const requiresNip44 = hints.includes("nip44") || hints.includes("nip44_v2");
    const requiresNip04 = !hints.length || hints.includes("nip04");

    if (
      (!signerHasNip44 && requiresNip44) ||
      (!signerHasNip04 && requiresNip04)
    ) {
      try {
        await requestDefaultExtensionPermissions();
      } catch (error) {
        userLogger.warn(
          `${LOG_PREFIX} Extension permissions request failed while loading preferences`,
          error,
        );
      }
    }

    const decryptors = new Map();
    const sources = new Map();
    const registerDecryptor = (scheme, handler, source = "unknown") => {
      if (!scheme || typeof handler !== "function" || decryptors.has(scheme)) {
        return;
      }
      decryptors.set(scheme, handler);
      sources.set(scheme, source);
    };

    if (signerHasNip44) {
      registerDecryptor(
        "nip44",
        (payload) => signer.nip44Decrypt(userPubkey, payload),
        "active-signer",
      );
      registerDecryptor(
        "nip44_v2",
        (payload) => signer.nip44Decrypt(userPubkey, payload),
        "active-signer",
      );
    }

    if (signerHasNip04) {
      registerDecryptor(
        "nip04",
        (payload) => signer.nip04Decrypt(userPubkey, payload),
        "active-signer",
      );
    }

    const nostrApi = typeof window !== "undefined" ? window?.nostr : null;
    if (nostrApi) {
      if (typeof nostrApi.nip04?.decrypt === "function") {
        registerDecryptor(
          "nip04",
          (payload) => nostrApi.nip04.decrypt(userPubkey, payload),
          "extension",
        );
      }

      const nip44 =
        nostrApi.nip44 && typeof nostrApi.nip44 === "object"
          ? nostrApi.nip44
          : null;
      if (nip44) {
        if (typeof nip44.decrypt === "function") {
          registerDecryptor(
            "nip44",
            (payload) => nip44.decrypt(userPubkey, payload),
            "extension",
          );
        }

        const nip44v2 =
          nip44.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
        if (nip44v2 && typeof nip44v2.decrypt === "function") {
          registerDecryptor(
            "nip44_v2",
            (payload) => nip44v2.decrypt(userPubkey, payload),
            "extension",
          );
          if (!decryptors.has("nip44")) {
            registerDecryptor(
              "nip44",
              (payload) => nip44v2.decrypt(userPubkey, payload),
              "extension",
            );
          }
        }
      }
    }

    if (!decryptors.size) {
      const error = new Error(
        "No decryptors available for hashtag preferences payload.",
      );
      error.code = "hashtag-preferences-no-decryptors";
      return { ok: false, error };
    }

    const order = determineDecryptionOrder(event, Array.from(decryptors.keys()));
    const attemptErrors = [];

    for (const scheme of order) {
      const decryptFn = decryptors.get(scheme);
      if (!decryptFn) {
        continue;
      }
      const source = sources.get(scheme);

      if (source === "extension") {
        userLogger.info(
          `${LOG_PREFIX} Attempting decryption via window.nostr fallback (${scheme})`,
        );
      }

      try {
        const plaintext = await decryptFn(ciphertext);
        if (typeof plaintext !== "string") {
          attemptErrors.push({
            scheme,
            error: new Error("Decryption returned non-string payload."),
          });
          continue;
        }
        return { ok: true, plaintext, scheme };
      } catch (error) {
        if (source === "extension") {
          userLogger.warn(
            `${LOG_PREFIX} window.nostr fallback decryption failed (${scheme})`,
            error,
          );
        }
        attemptErrors.push({ scheme, error });
      }
    }

    const error = new Error("Failed to decrypt hashtag preferences.");
    error.code = "hashtag-preferences-decrypt-failed";
    if (attemptErrors.length) {
      error.cause = attemptErrors;
    }
    return { ok: false, error, errors: attemptErrors };
  }

  async publish(options = {}) {
    // nostrClient imported from nostrClientFacade
    if (isSessionActor(nostrClient)) {
      const error = new Error(
        "Publishing preferences is not allowed for session actors."
      );
      error.code = "session-actor-publish-blocked";
      throw error;
    }

    const targetPubkey = normalizeHexPubkey(
      typeof options?.pubkey === "string" ? options.pubkey : this.activePubkey,
    );
    if (!targetPubkey) {
      const error = new Error("Active pubkey is required to publish preferences.");
      error.code = "hashtag-preferences-missing-pubkey";
      throw error;
    }

    let signer = getActiveSigner();
    if (!signer) {
      signer = await nostrClient.ensureActiveSignerForPubkey(targetPubkey);
    }

    const canSign = typeof signer?.canSign === "function"
      ? signer.canSign()
      : typeof signer?.signEvent === "function";
    if (!canSign || typeof signer?.signEvent !== "function") {
      const error = new Error("An active signer is required to publish preferences.");
      error.code = "hashtag-preferences-missing-signer";
      throw error;
    }

    if (signer.type === "extension") {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult?.ok) {
        const error = new Error(
          "The active signer must allow encryption and signing before publishing preferences.",
        );
        error.code = "hashtag-preferences-extension-denied";
        error.cause = permissionResult?.error || null;
        throw error;
      }
    }

    const interests = this.getInterests();
    const disinterests = this.getDisinterests().filter(
      (tag) => !interests.includes(tag),
    );

    const payload = {
      version: DEFAULT_VERSION,
      interests,
      disinterests,
    };
    const plaintext = JSON.stringify(payload);

    const encryptors = [];
    const registerEncryptor = (scheme, handler) => {
      if (!scheme || typeof handler !== "function") {
        return;
      }
      encryptors.push({ scheme, handler });
    };

    if (typeof signer.nip44Encrypt === "function") {
      registerEncryptor("nip44_v2", (value) => signer.nip44Encrypt(targetPubkey, value));
      registerEncryptor("nip44", (value) => signer.nip44Encrypt(targetPubkey, value));
    }

    if (typeof signer.nip04Encrypt === "function") {
      registerEncryptor("nip04", (value) => signer.nip04Encrypt(targetPubkey, value));
    }

    if (!encryptors.length) {
      const error = new Error("No encryptors available to publish preferences.");
      error.code = "hashtag-preferences-no-encryptor";
      throw error;
    }

    let ciphertext = "";
    let schemeUsed = "";
    const encryptionErrors = [];
    const triedSchemes = new Set();

    for (const candidate of encryptors) {
      if (triedSchemes.has(candidate.scheme)) {
        continue;
      }
      triedSchemes.add(candidate.scheme);
      try {
        const encrypted = await candidate.handler(plaintext);
        if (typeof encrypted === "string" && encrypted) {
          ciphertext = encrypted;
          schemeUsed = candidate.scheme;
          break;
        }
      } catch (error) {
        encryptionErrors.push({ scheme: candidate.scheme, error });
      }
    }

    if (!ciphertext) {
      const error = new Error("Failed to encrypt hashtag preferences.");
      error.code = "hashtag-preferences-encrypt-failed";
      error.cause = encryptionErrors;
      throw error;
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const event = buildHashtagPreferenceEvent({
      pubkey: targetPubkey,
      created_at: createdAt,
      content: ciphertext,
    });

    if (!Array.isArray(event.tags)) {
      event.tags = [];
    }

    let updatedSchemeTag = false;
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      if (typeof tag[0] === "string" && tag[0].toLowerCase() === "encrypted") {
        tag[1] = schemeUsed;
        updatedSchemeTag = true;
        break;
      }
    }
    if (!updatedSchemeTag) {
      event.tags.push(["encrypted", schemeUsed]);
    }

    const signedEvent = await signer.signEvent(event);

    const writeRelays = sanitizeRelayList(nostrClient.writeRelays);
    const relayFallback = writeRelays.length
      ? writeRelays
      : sanitizeRelayList(nostrClient.relays);

    if (!relayFallback.length) {
      const error = new Error("No relays configured for publishing preferences.");
      error.code = "hashtag-preferences-no-relays";
      throw error;
    }

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      relayFallback,
      signedEvent,
    );

    const publishSummary = assertAnyRelayAccepted(publishResults, {
      context: "hashtag-preferences",
    });

    if (publishSummary.failed?.length) {
      publishSummary.failed.forEach(({ url, error }) => {
        userLogger.warn(
          `${LOG_PREFIX} Preferences not accepted by ${url}: ${error}`,
          error,
        );
      });
    }

    this.eventId = signedEvent.id || null;
    this.eventCreatedAt = Number.isFinite(signedEvent?.created_at)
      ? signedEvent.created_at
      : createdAt;
    this.emitChange("published", { event: signedEvent, scheme: schemeUsed });
    return signedEvent;
  }
}

const hashtagPreferences = new HashtagPreferencesService();

export default hashtagPreferences;
export { HashtagPreferencesService, hashtagPreferences, EVENTS as HASHTAG_PREFERENCES_EVENTS };
