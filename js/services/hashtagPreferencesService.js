// js/services/hashtagPreferencesService.js
import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "../nostrClientFacade.js";
import { getActiveSigner } from "../nostr/index.js";
import {
  buildHashtagPreferenceEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "../nostrPublish.js";
import { userLogger } from "../utils/logger.js";

const LOG_PREFIX = "[HashtagPreferences]";
const HASHTAG_IDENTIFIER = "bitvid:tag-preferences";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const DEFAULT_VERSION = 1;

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

function normalizeTag(input) {
  if (typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim().replace(/^#+/, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase();
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
    const normalizedTag = normalizeTag(tag);
    if (normalizedTag) {
      interests.add(normalizedTag);
    }
  }

  const disinterests = new Set();
  for (const tag of rawDisinterests) {
    const normalizedTag = normalizeTag(tag);
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

  for (const fallback of ["nip44_v2", "nip44"]) {
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
    this.emitChange("reset");
  }

  getInterests() {
    return Array.from(this.interests).sort((a, b) => a.localeCompare(b));
  }

  getDisinterests() {
    return Array.from(this.disinterests).sort((a, b) => a.localeCompare(b));
  }

  addInterest(tag) {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return false;
    }

    const hadInterest = this.interests.has(normalized);
    const removedFromDisinterests = this.disinterests.delete(normalized);
    this.interests.add(normalized);

    if (!hadInterest || removedFromDisinterests) {
      this.emitChange("interest-added", { tag: normalized });
      return true;
    }

    return false;
  }

  removeInterest(tag) {
    const normalized = normalizeTag(tag);
    if (!normalized || !this.interests.has(normalized)) {
      return false;
    }

    this.interests.delete(normalized);
    this.emitChange("interest-removed", { tag: normalized });
    return true;
  }

  addDisinterest(tag) {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return false;
    }

    const hadDisinterest = this.disinterests.has(normalized);
    const removedFromInterests = this.interests.delete(normalized);
    this.disinterests.add(normalized);

    if (!hadDisinterest || removedFromInterests) {
      this.emitChange("disinterest-added", { tag: normalized });
      return true;
    }

    return false;
  }

  removeDisinterest(tag) {
    const normalized = normalizeTag(tag);
    if (!normalized || !this.disinterests.has(normalized)) {
      return false;
    }

    this.disinterests.delete(normalized);
    this.emitChange("disinterest-removed", { tag: normalized });
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

  async load(pubkey) {
    const normalized = normalizeHexPubkey(pubkey);
    this.activePubkey = normalized;

    if (!normalized) {
      this.reset();
      this.loaded = true;
      return;
    }

    if (
      !nostrClient ||
      !nostrClient.pool ||
      typeof nostrClient.pool.list !== "function"
    ) {
      userLogger.warn(
        `${LOG_PREFIX} nostrClient.pool.list unavailable; treating preferences as empty.`,
      );
      this.reset();
      this.loaded = true;
      return;
    }

    const relays = sanitizeRelayList(
      Array.isArray(nostrClient.relays)
        ? nostrClient.relays
        : nostrClient.writeRelays,
    );
    if (!relays.length) {
      this.reset();
      this.loaded = true;
      return;
    }

    const schema = getNostrEventSchema(NOTE_TYPES.HASHTAG_PREFERENCES);
    const canonicalKind = schema?.kind ?? 30015;
    const filter = {
      kinds: [canonicalKind],
      authors: [normalized],
      "#d": [HASHTAG_IDENTIFIER],
      limit: 50,
    };

    let events = [];
    try {
      const result = await nostrClient.pool.list(relays, [filter]);
      if (Array.isArray(result)) {
        events = result.filter((event) => event && event.pubkey === normalized);
      }
    } catch (error) {
      userLogger.warn(
        `${LOG_PREFIX} Failed to load hashtag preferences from relays`,
        error,
      );
      events = [];
    }

    if (!events.length) {
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
        return candidate.id > current.id ? candidate : current;
      }
      return candidateTs > currentTs ? candidate : current;
    }, null);

    if (!latest) {
      this.reset();
      this.loaded = true;
      return;
    }

    const decryptResult = await this.decryptEvent(latest, normalized);
    if (!decryptResult.ok) {
      userLogger.warn(
        `${LOG_PREFIX} Failed to decrypt hashtag preferences`,
        decryptResult.error,
      );
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

    const signer = getActiveSigner();
    const signerHasNip44 = typeof signer?.nip44Decrypt === "function";

    const hints = extractEncryptionHints(event);
    const requiresNip44 = hints.includes("nip44") || hints.includes("nip44_v2");

    if (!signerHasNip44 && requiresNip44) {
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
    const registerDecryptor = (scheme, handler) => {
      if (!scheme || typeof handler !== "function" || decryptors.has(scheme)) {
        return;
      }
      decryptors.set(scheme, handler);
    };

    if (signerHasNip44) {
      registerDecryptor("nip44", (payload) => signer.nip44Decrypt(userPubkey, payload));
      registerDecryptor("nip44_v2", (payload) =>
        signer.nip44Decrypt(userPubkey, payload),
      );
    }

    const nostrApi =
      typeof window !== "undefined" && window && window.nostr ? window.nostr : null;
    if (nostrApi) {
      const nip44 =
        nostrApi.nip44 && typeof nostrApi.nip44 === "object"
          ? nostrApi.nip44
          : null;
      if (nip44) {
        if (typeof nip44.decrypt === "function" && !decryptors.has("nip44")) {
          registerDecryptor("nip44", (payload) => nip44.decrypt(userPubkey, payload));
        }
        const nip44v2 = nip44.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
        if (nip44v2 && typeof nip44v2.decrypt === "function") {
          registerDecryptor("nip44_v2", (payload) =>
            nip44v2.decrypt(userPubkey, payload),
          );
          if (!decryptors.has("nip44")) {
            registerDecryptor("nip44", (payload) =>
              nip44v2.decrypt(userPubkey, payload),
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
    const targetPubkey = normalizeHexPubkey(
      typeof options?.pubkey === "string" ? options.pubkey : this.activePubkey,
    );
    if (!targetPubkey) {
      const error = new Error("Active pubkey is required to publish preferences.");
      error.code = "hashtag-preferences-missing-pubkey";
      throw error;
    }

    const signer = getActiveSigner();
    if (!signer || typeof signer.signEvent !== "function") {
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

    const nostrApi =
      typeof window !== "undefined" && window && window.nostr ? window.nostr : null;
    if (nostrApi) {
      const nip44 =
        nostrApi.nip44 && typeof nostrApi.nip44 === "object"
          ? nostrApi.nip44
          : null;
      if (nip44) {
        if (typeof nip44.encrypt === "function") {
          registerEncryptor("nip44", (value) => nip44.encrypt(targetPubkey, value));
        }
        const nip44v2 = nip44.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
        if (nip44v2 && typeof nip44v2.encrypt === "function") {
          registerEncryptor("nip44_v2", (value) =>
            nip44v2.encrypt(targetPubkey, value),
          );
        }
      }
    }

    if (!encryptors.length) {
      const error = new Error("No encryptors (NIP-44) available to publish preferences.");
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

