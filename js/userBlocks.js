// js/userBlocks.js
import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostrClientFacade.js";
import { getActiveSigner } from "./nostr/index.js";
import { buildBlockListEvent, BLOCK_LIST_IDENTIFIER, NOTE_TYPES } from "./nostrEventSchemas.js";
import { CACHE_POLICIES, STORAGE_TIERS } from "./nostr/cachePolicies.js";
import { devLogger, userLogger } from "./utils/logger.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "./nostrPublish.js";

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
          `[UserBlockList] listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

export const USER_BLOCK_EVENTS = Object.freeze({
  CHANGE: "change",
  STATUS: "status",
});

const FAST_BLOCKLIST_RELAY_LIMIT = 3;
const FAST_BLOCKLIST_TIMEOUT_MS = 2500;
const BACKGROUND_BLOCKLIST_TIMEOUT_MS = 6000;

const BLOCKLIST_STORAGE_PREFIX = "bitvid:user-blocks";
const BLOCKLIST_SEEDED_KEY_PREFIX = `${BLOCKLIST_STORAGE_PREFIX}:seeded:v1`;
const BLOCKLIST_REMOVALS_KEY_PREFIX = `${BLOCKLIST_STORAGE_PREFIX}:removals:v1`;
const BLOCKLIST_LOCAL_KEY_PREFIX = `${BLOCKLIST_STORAGE_PREFIX}:local:v1`;

function resolveStorage() {
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
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
    const name = typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";
    if (name !== "encrypted" && name !== "encryption") {
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

function describeDiscardedEntry(entry) {
  if (typeof entry === "string") {
    return entry.trim();
  }

  if (entry === null) {
    return "null";
  }

  if (typeof entry === "undefined") {
    return "undefined";
  }

  if (Array.isArray(entry)) {
    try {
      return JSON.stringify(entry);
    } catch (_error) {
      return String(entry);
    }
  }

  if (typeof entry === "object") {
    try {
      return JSON.stringify(entry);
    } catch (_error) {
      return String(entry);
    }
  }

  return String(entry);
}

function sanitizeMuteTags(values, ownerPubkey, options = {}) {
  const logDiscarded = options?.logDiscarded !== false;
  const owner = normalizeHex(ownerPubkey);
  const sanitized = [];
  const seen = new Set();

  const iterable = Array.isArray(values)
    ? values
    : values instanceof Set
    ? Array.from(values)
    : values && typeof values[Symbol.iterator] === "function"
    ? Array.from(values)
    : [];

  const logDiscard = (entry, reason, extra) => {
    if (!logDiscarded) {
      return;
    }
    const detail = describeDiscardedEntry(entry);
    if (extra) {
      userLogger.warn(
        `[UserBlockList] Discarded block entry (${reason}).`,
        detail,
        extra,
      );
      return;
    }
    userLogger.warn(`[UserBlockList] Discarded block entry (${reason}).`, detail);
  };

  for (const entry of iterable) {
    let targetHex = null;

    if (Array.isArray(entry)) {
      if (entry.length < 2) {
        logDiscard(entry, "invalid-tuple");
        continue;
      }

      const label =
        typeof entry[0] === "string" ? entry[0].trim().toLowerCase() : "";
      if (label !== "p") {
        logDiscard(entry, "unsupported-tag");
        continue;
      }

      targetHex = normalizeHex(entry[1]);
      if (!targetHex) {
        logDiscard(entry, "invalid-target");
        continue;
      }
    } else if (typeof entry === "string") {
      targetHex = normalizeHex(entry);
      if (!targetHex) {
        logDiscard(entry, "invalid-string");
        continue;
      }
    } else if (entry && typeof entry === "object") {
      if (typeof entry.pubkey === "string") {
        targetHex = normalizeHex(entry.pubkey);
        if (!targetHex) {
          logDiscard(entry, "invalid-object-pubkey");
          continue;
        }
      } else {
        logDiscard(entry, "unsupported-entry");
        continue;
      }
    } else {
      logDiscard(entry, "unsupported-entry");
      continue;
    }

    if (owner && targetHex === owner) {
      logDiscard(entry, "self-target");
      continue;
    }

    if (seen.has(targetHex)) {
      logDiscard(entry, "duplicate", targetHex);
      continue;
    }

    seen.add(targetHex);
    sanitized.push(["p", targetHex]);
  }

  return sanitized;
}

function serializeBlockListTagMatrix(values, ownerPubkey, options = {}) {
  const tags = sanitizeMuteTags(values, ownerPubkey, options);
  return JSON.stringify(tags);
}

function extractPubkeysFromTags(tags, ownerPubkey = null) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const collected = [];
  const seen = new Set();
  const owner = ownerPubkey ? normalizeHex(ownerPubkey) : null;

  for (const entry of tags) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    const label = typeof entry[0] === "string" ? entry[0].trim().toLowerCase() : "";
    if (label !== "p") {
      continue;
    }
    const normalized = normalizeHex(entry[1]);
    if (!normalized || (owner && normalized === owner) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    collected.push(normalized);
  }
  return collected;
}

function parseBlockListPlaintext(plaintext, ownerPubkey) {
  if (typeof plaintext !== "string" || !plaintext) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch (error) {
    userLogger.warn(
      "[UserBlockList] Failed to parse block list ciphertext as JSON; treating as empty.",
      error,
    );
    return [];
  }

  const owner = normalizeHex(ownerPubkey);

  if (Array.isArray(parsed)) {
    return extractPubkeysFromTags(parsed, owner);
  }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.tags) && parsed.tags.length) {
      return extractPubkeysFromTags(parsed.tags, owner);
    }

    const legacy = Array.isArray(parsed.blockedPubkeys) ? parsed.blockedPubkeys : [];
    return legacy
      .map((value) => normalizeHex(value))
      .filter((value) => value && value !== owner);
  }

  return [];
}

function isUserBlockListEvent(event) {
  if (!event || typeof event.kind !== "number") {
    return false;
  }

  if (event.kind === 10000) {
    return true;
  }

  if (event.kind === 30002) {
    const tags = Array.isArray(event.tags) ? event.tags : [];
    return tags.some(
      (tag) =>
        Array.isArray(tag) &&
        typeof tag[0] === "string" &&
        tag[0].trim().toLowerCase() === "d" &&
        typeof tag[1] === "string" &&
        tag[1].trim() === BLOCK_LIST_IDENTIFIER,
    );
  }

  return false;
}

function isTaggedBlockListEvent(event) {
  if (!event || !Array.isArray(event.tags)) {
    return false;
  }
  return event.tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag.length >= 2 &&
      typeof tag[0] === "string" &&
      tag[0].trim().toLowerCase() === "d" &&
      typeof tag[1] === "string" &&
      tag[1].trim() === BLOCK_LIST_IDENTIFIER,
  );
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CHARSET_MAP = (() => {
  const map = new Map();
  for (let index = 0; index < BECH32_CHARSET.length; index += 1) {
    map.set(BECH32_CHARSET[index], index);
  }
  return map;
})();

function bytesToHex(bytes) {
  if (!bytes || typeof bytes.length !== "number") {
    return "";
  }

  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    if (typeof value !== "number") {
      return "";
    }
    const normalized = value & 0xff;
    hex += normalized.toString(16).padStart(2, "0");
  }
  return hex;
}

function bech32Polymod(values) {
  let chk = 1;
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < generators.length; bit += 1) {
      if ((top >>> bit) & 1) {
        chk ^= generators[bit];
      }
    }
  }

  return chk;
}

function bech32HrpExpand(hrp) {
  const expanded = [];
  for (let index = 0; index < hrp.length; index += 1) {
    const code = hrp.charCodeAt(index);
    expanded.push(code >>> 5);
  }
  expanded.push(0);
  for (let index = 0; index < hrp.length; index += 1) {
    const code = hrp.charCodeAt(index);
    expanded.push(code & 31);
  }
  return expanded;
}

function bech32VerifyChecksum(hrp, data) {
  return bech32Polymod(bech32HrpExpand(hrp).concat(data)) === 1;
}

function bech32Decode(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (trimmed !== lower && trimmed !== upper) {
    return null;
  }

  const normalized = lower;
  const separatorIndex = normalized.lastIndexOf("1");
  if (separatorIndex < 1 || separatorIndex + 7 > normalized.length) {
    return null;
  }

  const hrp = normalized.slice(0, separatorIndex);
  const data = [];
  for (let index = separatorIndex + 1; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (!BECH32_CHARSET_MAP.has(char)) {
      return null;
    }
    data.push(BECH32_CHARSET_MAP.get(char));
  }

  if (!bech32VerifyChecksum(hrp, data)) {
    return null;
  }

  return { hrp, words: data.slice(0, -6) };
}

function convertBits(data, fromBits, toBits, pad = true) {
  const result = [];
  let acc = 0;
  let bits = 0;
  const maxv = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of data) {
    if (value < 0 || value >> fromBits) {
      return null;
    }
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >>> bits) & maxv);
    }
  }

  if (pad) {
    if (bits) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }

  return result;
}

function fallbackDecodeNpubToHex(value) {
  const decoded = bech32Decode(value);
  if (!decoded || decoded.hrp !== "npub") {
    return "";
  }

  const bytes = convertBits(decoded.words, 5, 8, false);
  if (!bytes || !bytes.length) {
    return "";
  }

  return bytesToHex(bytes);
}

function normalizeDecodedHex(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^[0-9a-f]{64}$/i.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

function normalizeNpubInput(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("nostr:")) {
    return trimmed.slice(6).trim();
  }

  return trimmed;
}

function decodeNpubToHex(npub) {
  if (typeof npub !== "string") {
    return null;
  }

  const trimmed = normalizeNpubInput(npub);
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const tools = typeof globalThis !== "undefined" ? globalThis?.NostrTools : null;
  const decoder = tools?.nip19?.decode;
  if (typeof decoder === "function") {
    try {
      const decoded = decoder(trimmed);
      if (!decoded || decoded.type !== "npub") {
        return normalizeDecodedHex(fallbackDecodeNpubToHex(trimmed));
      }
      if (typeof decoded.data === "string") {
        const normalized = normalizeDecodedHex(decoded.data);
        return normalized || normalizeDecodedHex(fallbackDecodeNpubToHex(trimmed));
      }
      return normalizeDecodedHex(bytesToHex(decoded.data));
    } catch (error) {
      return normalizeDecodedHex(fallbackDecodeNpubToHex(trimmed));
    }
  }

  return normalizeDecodedHex(fallbackDecodeNpubToHex(trimmed));
}

function readSeededFlag(actorHex) {
  if (typeof actorHex !== "string" || !actorHex) {
    return false;
  }

  if (typeof localStorage === "undefined") {
    return false;
  }

  const key = `${BLOCKLIST_SEEDED_KEY_PREFIX}:${actorHex}`;

  try {
    const value = localStorage.getItem(key);
    return value === "1";
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to read seeded baseline state for ${actorHex}:`,
      error,
    );
    return false;
  }
}

function writeSeededFlag(actorHex, seeded) {
  if (typeof actorHex !== "string" || !actorHex) {
    return;
  }

  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  const key = `${BLOCKLIST_SEEDED_KEY_PREFIX}:${actorHex}`;

  try {
    if (seeded) {
      localStorage.setItem(key, "1");
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to persist seeded baseline state for ${actorHex}:`,
      error,
    );
  }
}

function readRemovalSet(actorHex) {
  const empty = new Set();
  if (typeof actorHex !== "string" || !actorHex) {
    return empty;
  }

  if (typeof localStorage === "undefined") {
    return empty;
  }

  const key = `${BLOCKLIST_REMOVALS_KEY_PREFIX}:${actorHex}`;

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return empty;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return empty;
    }

    const normalized = parsed
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter((entry) => /^[0-9a-f]{64}$/.test(entry));

    return new Set(normalized);
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to read seed removal state for ${actorHex}:`,
      error,
    );
    return empty;
  }
}

function writeRemovalSet(actorHex, removals) {
  if (typeof actorHex !== "string" || !actorHex) {
    return;
  }

  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  const key = `${BLOCKLIST_REMOVALS_KEY_PREFIX}:${actorHex}`;

  try {
    if (!removals || !removals.size) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(Array.from(removals)));
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to persist seed removal state for ${actorHex}:`,
      error,
    );
  }
}

function normalizeHex(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const decoded = decodeNpubToHex(trimmed);
  if (decoded) {
    return decoded;
  }

  return null;
}

function readLocalBlocks(actorHex) {
  if (typeof actorHex !== "string" || !actorHex) {
    return null;
  }

  const storage = resolveStorage();
  if (!storage) {
    return null;
  }

  const key = `${BLOCKLIST_LOCAL_KEY_PREFIX}:${actorHex}`;

  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const normalized = parsed
      .map((entry) =>
        typeof entry === "string" ? entry.trim().toLowerCase() : "",
      )
      .filter((entry) => /^[0-9a-f]{64}$/.test(entry));

    return new Set(normalized);
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to read local blocks for ${actorHex}:`,
      error,
    );
    return null;
  }
}

function writeLocalBlocks(actorHex, blocks) {
  if (typeof actorHex !== "string" || !actorHex) {
    return;
  }

  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  const key = `${BLOCKLIST_LOCAL_KEY_PREFIX}:${actorHex}`;

  try {
    if (!blocks || !blocks.size) {
      // We persist empty sets as [] to distinguish from "not found" (null)
      storage.setItem(key, "[]");
      return;
    }

    storage.setItem(key, JSON.stringify(Array.from(blocks)));
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to persist local blocks for ${actorHex}:`,
      error,
    );
  }
}

class UserBlockListManager {
  constructor() {
    this.blockedPubkeys = new Set();
    this.blockEventId = null;
    this.blockEventCreatedAt = null;
    this.lastPublishedCreatedAt = null;
    this.muteEventId = null;
    this.muteEventCreatedAt = null;
    this.loaded = false;
    this.emitter = new TinyEventEmitter();
    this.seedStateCache = new Map();
  }

  reset() {
    this.blockedPubkeys.clear();
    this.blockEventId = null;
    this.blockEventCreatedAt = null;
    this.lastPublishedCreatedAt = null;
    this.muteEventId = null;
    this.muteEventCreatedAt = null;
    this.loaded = false;
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  getBlockedPubkeys() {
    return Array.from(this.blockedPubkeys);
  }

  isBlocked(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return false;
    }
    return this.blockedPubkeys.has(normalized);
  }

  async ensureLoaded(userPubkey) {
    if (this.loaded) {
      return;
    }

    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      return;
    }

    await this.loadBlocks(normalized);
  }

  async loadBlocks(userPubkey, options = {}) {
    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      this.reset();
      this.loaded = true;
      return;
    }

    const since = Number.isFinite(options?.since)
      ? Math.max(0, Math.floor(options.since))
      : null;
    const statusCallback =
      typeof options?.statusCallback === "function" ? options.statusCallback : null;

    const emitStatus = (detail) => {
      if (!detail || typeof detail !== "object") {
        return;
      }

      try {
        statusCallback?.(detail);
      } catch (callbackError) {
        userLogger.warn(
          "[UserBlockList] statusCallback threw while emitting status",
          callbackError,
        );
      }

      try {
        this.emitter.emit(USER_BLOCK_EVENTS.STATUS, detail);
      } catch (emitterError) {
        userLogger.warn(
          "[UserBlockList] Failed to dispatch status event",
          emitterError,
        );
      }
    };

    emitStatus({ status: "loading", relays: Array.from(nostrClient.relays || []) });

    const localBlocks = this._loadLocal(normalized);
    if (localBlocks) {
      this.blockedPubkeys = localBlocks;
      this.loaded = true;
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "sync",
        blockedPubkeys: Array.from(this.blockedPubkeys),
        source: "local",
      });
      emitStatus({ status: "settled" });
      return;
    }

    const applyBlockedPubkeys = (nextValues, meta = {}) => {
      const nextSet = new Set(Array.isArray(nextValues) ? nextValues : []);
      this.blockedPubkeys = nextSet;

      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "sync",
        blockedPubkeys: Array.from(this.blockedPubkeys),
        ...meta,
      });
    };

    const resolveDecryptors = async (event) => {
      const signer = getActiveSigner();
      const signerHasNip04 = typeof signer?.nip04Decrypt === "function";
      const signerHasNip44 = typeof signer?.nip44Decrypt === "function";

      const hints = extractEncryptionHints(event);
      const requiresNip44 = hints.includes("nip44") || hints.includes("nip44_v2");
      const requiresNip04 = !hints.length || hints.includes("nip04");

      let permissionError = null;
      if ((!signerHasNip44 && requiresNip44) || (!signerHasNip04 && requiresNip04)) {
        try {
          const permissionResult = await requestDefaultExtensionPermissions();
          if (!permissionResult?.ok) {
            permissionError =
              permissionResult?.error instanceof Error
                ? permissionResult.error
                : new Error(
                    "Extension permissions are required to use the browser decryptor.",
                  );
          }
        } catch (error) {
          permissionError = error instanceof Error ? error : new Error(String(error));
        }
      }

      const decryptors = new Map();
      const sources = new Map();
      const registerDecryptor = (scheme, handler, source) => {
        if (!scheme || typeof handler !== "function" || decryptors.has(scheme)) {
          return;
        }
        decryptors.set(scheme, handler);
        sources.set(scheme, source || "unknown");
      };

      if (signerHasNip44) {
        registerDecryptor(
          "nip44",
          (payload) => signer.nip44Decrypt(normalized, payload),
          "active-signer",
        );
        registerDecryptor(
          "nip44_v2",
          (payload) => signer.nip44Decrypt(normalized, payload),
          "active-signer",
        );
      }

      if (signerHasNip04) {
        registerDecryptor(
          "nip04",
          (payload) => signer.nip04Decrypt(normalized, payload),
          "active-signer",
        );
      }

      const nostrApi = typeof window !== "undefined" ? window?.nostr : null;
      if (nostrApi) {
        if (typeof nostrApi.nip04?.decrypt === "function") {
          registerDecryptor(
            "nip04",
            (payload) => nostrApi.nip04.decrypt(normalized, payload),
            "extension",
          );
        }

        const nip44 =
          nostrApi.nip44 && typeof nostrApi.nip44 === "object" ? nostrApi.nip44 : null;
        if (nip44) {
          if (typeof nip44.decrypt === "function") {
            registerDecryptor(
              "nip44",
              (payload) => nip44.decrypt(normalized, payload),
              "extension",
            );
          }

          const nip44v2 = nip44.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
          if (nip44v2 && typeof nip44v2.decrypt === "function") {
            registerDecryptor(
              "nip44_v2",
              (payload) => nip44v2.decrypt(normalized, payload),
              "extension",
            );
            if (!decryptors.has("nip44")) {
              registerDecryptor(
                "nip44",
                (payload) => nip44v2.decrypt(normalized, payload),
                "extension",
              );
            }
          }
        }
      }

      return {
        decryptors,
        sources,
        permissionError,
        order: determineDecryptionOrder(event, Array.from(decryptors.keys())),
      };
    };

    try {
      const filter = {
        kinds: [10000, 30002],
        authors: [normalized],
        limit: 2,
      };

      if (since !== null) {
        filter.since = since;
      }

      const relays = Array.isArray(nostrClient.relays)
        ? nostrClient.relays.filter((relay) => typeof relay === "string" && relay)
        : [];

      if (!relays.length) {
        this.blockedPubkeys.clear();
        this.blockEventId = null;
        this.blockEventCreatedAt = null;
        this.loaded = true;
        emitStatus({ status: "applied-empty" });
        emitStatus({ status: "settled" });
        return;
      }

      const fastRelays = relays.slice(0, FAST_BLOCKLIST_RELAY_LIMIT);
      const backgroundRelays = relays.slice(fastRelays.length);

      const fetchFromRelay = (relayUrl, timeoutMs, requireEvent) =>
        new Promise((resolve, reject) => {
          let settled = false;
          const pool = nostrClient?.pool;
          if (!pool || typeof pool.list !== "function") {
            const poolError = new Error(
              "nostrClient.pool.list is unavailable; cannot query block list.",
            );
            poolError.code = "pool-unavailable";
            poolError.relay = relayUrl;
            reject(poolError);
            return;
          }
          const timer = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            const timeoutError = new Error(
              `Timed out fetching block list from ${relayUrl} after ${timeoutMs}ms`
            );
            timeoutError.code = "timeout";
            timeoutError.relay = relayUrl;
            timeoutError.timeoutMs = timeoutMs;
            reject(timeoutError);
          }, timeoutMs);

          Promise.resolve()
            .then(() => pool.list([relayUrl], [filter]))
            .then((result) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              const events = Array.isArray(result)
                ? result.filter(
                    (event) =>
                      event && event.pubkey === normalized && isUserBlockListEvent(event),
                  )
                : [];
              if (requireEvent && !events.length) {
                const emptyError = new Error(
                  `No block list events returned from ${relayUrl}`
                );
                emptyError.code = "empty";
                emptyError.relay = relayUrl;
                reject(emptyError);
                return;
              }
              resolve({ relayUrl, events });
            })
            .catch((error) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              const wrapped =
                error instanceof Error ? error : new Error(String(error));
              wrapped.relay = relayUrl;
              reject(wrapped);
            });
        });

      const fastPromises = fastRelays.map((relayUrl) =>
        fetchFromRelay(relayUrl, FAST_BLOCKLIST_TIMEOUT_MS, true)
      );
      const backgroundPromises = backgroundRelays.map((relayUrl) =>
        fetchFromRelay(relayUrl, BACKGROUND_BLOCKLIST_TIMEOUT_MS, false)
      );

      const applyEvents = async (
        events,
        { skipIfEmpty = false, source = "fast" } = {},
      ) => {
        if (!Array.isArray(events) || !events.length) {
          if (skipIfEmpty) {
            return;
          }
          if (
            this.lastPublishedCreatedAt !== null ||
            this.blockEventCreatedAt !== null
          ) {
            emitStatus({ status: "stale", reason: "empty-result", source });
            return;
          }
          this.blockEventId = null;
          this.blockEventCreatedAt = null;
          applyBlockedPubkeys([], { source, reason: "empty-result" });
          emitStatus({ status: "applied-empty", source });
          return;
        }

        const validEvents = events.filter(
          (event) =>
            event && event.pubkey === normalized && isUserBlockListEvent(event),
        );

        if (!validEvents.length) {
          if (skipIfEmpty) {
            return;
          }
          if (
            this.lastPublishedCreatedAt !== null ||
            this.blockEventCreatedAt !== null
          ) {
            emitStatus({ status: "stale", reason: "empty-result", source });
            return;
          }
          this.blockEventId = null;
          this.blockEventCreatedAt = null;
          applyBlockedPubkeys([], { source, reason: "empty-result" });
          emitStatus({ status: "applied-empty", source });
          return;
        }

        // Separate by kind to merge distinct lists (Block vs Mute)
        const muteEvents = validEvents.filter((e) => e.kind === 10000);

        // Prioritize tagged mute lists (Bitvid) over plain ones (others)
        const taggedMutes = muteEvents
          .filter((e) => isTaggedBlockListEvent(e))
          .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

        const plainMutes = muteEvents
          .filter((e) => !isTaggedBlockListEvent(e))
          .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

        const newestMute =
          taggedMutes.length > 0 ? taggedMutes[0] : plainMutes[0] || null;

        const blockEvents = validEvents
          .filter((e) => e.kind === 30002)
          .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

        const newestBlock = blockEvents[0] || null;

        const newestMuteTime = Number.isFinite(newestMute?.created_at)
          ? newestMute.created_at
          : 0;
        const newestBlockTime = Number.isFinite(newestBlock?.created_at)
          ? newestBlock.created_at
          : 0;

        // The "canonical" newest event for stale checks is simply the latest of either.
        const newestOverall =
          newestMuteTime >= newestBlockTime ? newestMute : newestBlock;
        const newestCreatedAt = Math.max(newestMuteTime, newestBlockTime);

        const guardCreatedAt = Math.max(
          this.blockEventCreatedAt ?? 0,
          this.lastPublishedCreatedAt ?? 0,
        );

        // If both are stale, skip
        if (newestCreatedAt < guardCreatedAt) {
          emitStatus({
            status: "stale",
            event: newestOverall,
            guardCreatedAt,
            source,
          });
          return;
        }

        if (
          newestCreatedAt === guardCreatedAt &&
          this.blockEventId &&
          newestOverall?.id &&
          newestOverall.id !== this.blockEventId
        ) {
          // If equal time but different ID, we might be seeing a race or propagation delay.
          // But since we are merging, we should proceed unless it's strictly older context.
          // For safety against flapping, we treat strict equality with different ID as stale
          // if we already have a confirmed ID.
          emitStatus({
            status: "stale",
            event: newestOverall,
            guardCreatedAt,
            source,
          });
          return;
        }

        if (newestOverall?.id && newestOverall.id === this.blockEventId) {
          // Already applied this event. Idempotency check.
          return;
        }

        // We accept this state.
        this.blockEventId = newestOverall?.id || null;
        this.blockEventCreatedAt = newestCreatedAt;

        // Helper to decrypt a single event
        const decryptEvent = async (ev) => {
          if (!ev) return [];
          const isContentEmpty = !ev.content || !ev.content.trim();

          if (isContentEmpty) {
            // Handle tag-only lists (e.g. Kind 10000 with empty content but populated p tags)
            if (Array.isArray(ev.tags) && ev.tags.length) {
              return extractPubkeysFromTags(ev.tags, normalized);
            }
            return [];
          }

          const { decryptors, order, sources, permissionError } =
            await resolveDecryptors(ev);

          if (!decryptors.size) {
            if (permissionError) {
              throw permissionError;
            }
            return [];
          }

          let decryptedText = "";
          for (const scheme of order) {
            const handler = decryptors.get(scheme);
            if (typeof handler !== "function") continue;
            try {
              const plaintext = await handler(ev.content);
              if (typeof plaintext === "string") {
                decryptedText = plaintext;
                break;
              }
            } catch {
              // ignore
            }
          }

          if (!decryptedText) {
            // If decryption fails completely for a present event, we might want to log it
            // but return empty for that specific event.
            return [];
          }

          return parseBlockListPlaintext(decryptedText, normalized);
        };

        const mergedPubkeys = new Set();
        let decryptionError = null;

        try {
          const [muteList, blockList] = await Promise.all([
            decryptEvent(newestMute),
            decryptEvent(newestBlock),
          ]);

          muteList.forEach((pk) => mergedPubkeys.add(pk));
          blockList.forEach((pk) => mergedPubkeys.add(pk));
        } catch (error) {
          // If permission denied or critical failure
          decryptionError = error;
        }

        if (decryptionError) {
          userLogger.warn(
            "[UserBlockList] Decryption failed during merge.",
            decryptionError,
          );
          this.reset();
          this.loaded = true;
          emitStatus({
            status: "error",
            error: decryptionError,
            decryptor: "mixed",
          });
          emitStatus({ status: "settled" });
          return;
        }

        const hasMute = Boolean(newestMute);
        const hasBlock = Boolean(newestBlock);

        // Check if we should log "empty-events" reason
        // Effectively empty means: missing content AND missing valid tags
        const isMuteEffectiveEmpty = !newestMute || ((!newestMute.content || !newestMute.content.trim()) && (!newestMute.tags || !extractPubkeysFromTags(newestMute.tags, normalized).length));
        const isBlockEffectiveEmpty = !newestBlock || ((!newestBlock.content || !newestBlock.content.trim()) && (!newestBlock.tags || !extractPubkeysFromTags(newestBlock.tags, normalized).length));

        const effectiveReason = (isMuteEffectiveEmpty && isBlockEffectiveEmpty)
            ? "empty-events"
            : "applied-merge";

        applyBlockedPubkeys(Array.from(mergedPubkeys), {
          source,
          reason: effectiveReason,
          events: [newestMute?.id, newestBlock?.id].filter(Boolean),
        });

        if (effectiveReason === "empty-events") {
           emitStatus({ status: "applied-empty", event: newestOverall, source });
        } else {
           emitStatus({
             status: "applied",
             event: newestOverall,
             blockedPubkeys: Array.from(this.blockedPubkeys),
             source,
           });
        }
      };

      // Sequential promise handling to avoid race conditions but preserve background updates.
      // 1. Try fast path.
      let fastResult = null;
      if (fastPromises.length) {
        try {
          fastResult = await Promise.any(fastPromises);
        } catch (error) {
          if (error instanceof AggregateError) {
            error.errors?.forEach((err) => {
              if (err?.code === "timeout") {
                userLogger.warn(
                  `[UserBlockList] Relay ${err.relay} timed out while loading block list (${err.timeoutMs}ms)`
                );
              }
            });
          } else {
            userLogger.error("[UserBlockList] Fast block list fetch failed:", error);
          }
        }
      }

      if (fastResult?.events?.length) {
        await applyEvents(fastResult.events, { source: "fast" });
        // NOTE: We do NOT return here. We allow background relays to potentially provide newer data.
      }

      // 2. Wait for background (and failed fast relays).
      if (backgroundRelays.length || (!fastResult?.events?.length && fastPromises.length)) {
        emitStatus({
          status: "awaiting-background",
          relays: backgroundRelays.length ? backgroundRelays : fastRelays,
        });
      }

      const allPromises = [...fastPromises, ...backgroundPromises];
      const outcomes = await Promise.allSettled(allPromises);

      const aggregated = [];
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          const events = Array.isArray(outcome.value?.events)
            ? outcome.value.events
            : [];
          if (events.length) {
            aggregated.push(...events);
          }
        } else {
          const reason = outcome.reason;
          if (reason?.code === "timeout") {
            userLogger.warn(
              `[UserBlockList] Relay ${reason.relay} timed out while loading block list (${reason.timeoutMs}ms)`
            );
          } else {
            const relay = reason?.relay || reason?.relayUrl;
            userLogger.error(
              `[UserBlockList] Relay error at ${relay}:`,
              reason?.error ?? reason
            );
          }
        }
      }

      if (!aggregated.length) {
        // Only apply empty if fast path also found nothing (already handled by logic inside applyEvents,
        // but explicit call ensures we settle state if everything failed).
        await applyEvents([], { source: "background" });
        return;
      }

      await applyEvents(aggregated, { skipIfEmpty: true, source: "background" });

    } catch (error) {
      userLogger.error("[UserBlockList] loadBlocks failed:", error);
      applyBlockedPubkeys([], { source: "fast", reason: "load-error", error });
      this.blockEventId = null;
      this.blockEventCreatedAt = null;
      emitStatus({ status: "error", error });
    } finally {
      this.loaded = true;
      emitStatus({ status: "settled" });
    }
  }

  _loadLocal(actorHex) {
    const policy = CACHE_POLICIES[NOTE_TYPES.USER_BLOCK_LIST];
    if (policy?.storage !== STORAGE_TIERS.LOCAL_STORAGE) {
      return null;
    }
    return readLocalBlocks(actorHex);
  }

  _saveLocal(actorHex) {
    const policy = CACHE_POLICIES[NOTE_TYPES.USER_BLOCK_LIST];
    if (policy?.storage !== STORAGE_TIERS.LOCAL_STORAGE) {
      return;
    }
    writeLocalBlocks(actorHex, this.blockedPubkeys);
  }

  _getSeedState(actorHex) {
    const normalized = normalizeHex(actorHex);
    if (!normalized) {
      return { seeded: false, removals: new Set() };
    }

    if (this.seedStateCache.has(normalized)) {
      return this.seedStateCache.get(normalized);
    }

    const seeded = readSeededFlag(normalized);
    const removals = readRemovalSet(normalized);
    const state = { seeded, removals };
    this.seedStateCache.set(normalized, state);
    return state;
  }

  _setSeeded(actorHex, seeded) {
    const normalized = normalizeHex(actorHex);
    if (!normalized) {
      return;
    }

    const state = this._getSeedState(normalized);
    state.seeded = Boolean(seeded);
    writeSeededFlag(normalized, state.seeded);
  }

  _addSeedRemoval(actorHex, targetHex) {
    const normalizedActor = normalizeHex(actorHex);
    const normalizedTarget = normalizeHex(targetHex);
    if (!normalizedActor || !normalizedTarget) {
      return;
    }

    const state = this._getSeedState(normalizedActor);
    if (!state.removals.has(normalizedTarget)) {
      state.removals.add(normalizedTarget);
      writeRemovalSet(normalizedActor, state.removals);
    }
  }

  _clearSeedRemoval(actorHex, targetHex) {
    const normalizedActor = normalizeHex(actorHex);
    const normalizedTarget = normalizeHex(targetHex);
    if (!normalizedActor || !normalizedTarget) {
      return;
    }

    const state = this._getSeedState(normalizedActor);
    if (state.removals.delete(normalizedTarget)) {
      writeRemovalSet(normalizedActor, state.removals);
    }
  }

  async seedWithNpubs(userPubkey, candidateNpubs = []) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      return { ok: false, seeded: false, reason: "invalid-user" };
    }

    await this.ensureLoaded(actorHex);

    const state = this._getSeedState(actorHex);
    if (state.seeded) {
      return { ok: true, seeded: false, reason: "already-seeded" };
    }

    const removals = state.removals;
    const additions = new Set();
    let invalidCount = 0;

    const candidates = Array.isArray(candidateNpubs) ? candidateNpubs : [];
    for (const candidate of candidates) {
      const candidateHex = normalizeHex(candidate);
      if (!candidateHex) {
        invalidCount += 1;
        continue;
      }
      if (candidateHex === actorHex) {
        continue;
      }
      if (this.blockedPubkeys.has(candidateHex)) {
        continue;
      }
      if (removals.has(candidateHex)) {
        continue;
      }
      additions.add(candidateHex);
    }

    if (!additions.size) {
      if (candidates.length) {
        devLogger.info(
          "[UserBlockList] Seed candidates resolved to zero additions.",
          {
            actorPubkey: actorHex,
            candidateCount: candidates.length,
            invalidCount,
            blockedCount: this.blockedPubkeys.size,
            removalCount: removals.size,
          },
        );
      }
      return { ok: true, seeded: false, reason: "no-candidates" };
    }

    const snapshot = new Set(this.blockedPubkeys);
    additions.forEach((hex) => this.blockedPubkeys.add(hex));

    try {
      await this.publishBlockList(actorHex);
    } catch (error) {
      this.blockedPubkeys = snapshot;
      throw error;
    }

    this._setSeeded(actorHex, true);
    additions.forEach((hex) => this._clearSeedRemoval(actorHex, hex));
    this._saveLocal(actorHex);

    try {
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "seed",
        actorPubkey: actorHex,
        blockedPubkeys: Array.from(this.blockedPubkeys),
        addedPubkeys: Array.from(additions),
      });
    } catch (error) {
      userLogger.warn("[UserBlockList] Failed to emit seed change event:", error);
    }

    return { ok: true, seeded: true, addedPubkeys: Array.from(additions) };
  }

  async seedLocalBaseline(userPubkey, candidateNpubs = []) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      return { ok: false, seeded: false, reason: "invalid-user" };
    }

    await this.ensureLoaded(actorHex);

    const state = this._getSeedState(actorHex);
    if (state.seeded) {
      return { ok: true, seeded: false, reason: "already-seeded" };
    }

    if (this.blockedPubkeys.size > 0) {
      return { ok: true, seeded: false, reason: "non-empty" };
    }

    const removals = state.removals;
    const additions = new Set();
    let invalidCount = 0;

    const candidates = Array.isArray(candidateNpubs) ? candidateNpubs : [];
    for (const candidate of candidates) {
      const candidateHex = normalizeHex(candidate);
      if (!candidateHex) {
        invalidCount += 1;
        continue;
      }
      if (candidateHex === actorHex) {
        continue;
      }
      if (removals.has(candidateHex)) {
        continue;
      }
      additions.add(candidateHex);
    }

    if (!additions.size) {
      if (candidates.length) {
        devLogger.info(
          "[UserBlockList] Local seed candidates resolved to zero additions.",
          {
            actorPubkey: actorHex,
            candidateCount: candidates.length,
            invalidCount,
            removalCount: removals.size,
          },
        );
      }
      this._setSeeded(actorHex, true);
      return { ok: true, seeded: true, addedPubkeys: [] };
    }

    additions.forEach((hex) => this.blockedPubkeys.add(hex));

    this._setSeeded(actorHex, true);
    additions.forEach((hex) => this._clearSeedRemoval(actorHex, hex));

    try {
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "seed",
        actorPubkey: actorHex,
        blockedPubkeys: Array.from(this.blockedPubkeys),
        addedPubkeys: Array.from(additions),
        localOnly: true,
      });
    } catch (error) {
      userLogger.warn("[UserBlockList] Failed to emit local seed change event:", error);
    }

    return { ok: true, seeded: true, addedPubkeys: Array.from(additions) };
  }

  async seedBaselineDelta(userPubkey, candidateNpubs = []) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      return { ok: false, seeded: false, reason: "invalid-user" };
    }

    await this.ensureLoaded(actorHex);

    const state = this._getSeedState(actorHex);
    const removals = state.removals;
    const additions = new Set();
    let invalidCount = 0;

    const candidates = Array.isArray(candidateNpubs) ? candidateNpubs : [];
    for (const candidate of candidates) {
      const candidateHex = normalizeHex(candidate);
      if (!candidateHex) {
        invalidCount += 1;
        continue;
      }
      if (candidateHex === actorHex) {
        continue;
      }
      if (this.blockedPubkeys.has(candidateHex)) {
        continue;
      }
      if (removals.has(candidateHex)) {
        continue;
      }
      additions.add(candidateHex);
    }

    if (!additions.size) {
      if (candidates.length) {
        devLogger.info(
          "[UserBlockList] Baseline delta candidates resolved to zero additions.",
          {
            actorPubkey: actorHex,
            candidateCount: candidates.length,
            invalidCount,
            blockedCount: this.blockedPubkeys.size,
            removalCount: removals.size,
          },
        );
      }
      if (!state.seeded) {
        this._setSeeded(actorHex, true);
      }
      return { ok: true, seeded: state.seeded, reason: "no-candidates" };
    }

    additions.forEach((hex) => this.blockedPubkeys.add(hex));

    this._setSeeded(actorHex, true);
    this._saveLocal(actorHex);

    try {
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "seed-delta",
        actorPubkey: actorHex,
        blockedPubkeys: Array.from(this.blockedPubkeys),
        addedPubkeys: Array.from(additions),
        localOnly: true,
      });
    } catch (error) {
      userLogger.warn("[UserBlockList] Failed to emit delta seed change event:", error);
    }

    return { ok: true, seeded: true, addedPubkeys: Array.from(additions) };
  }

  async addBlock(targetPubkey, userPubkey) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      throw new Error("Invalid user pubkey.");
    }

    const targetHex = normalizeHex(targetPubkey);
    if (!targetHex) {
      const err = new Error("Invalid target pubkey.");
      err.code = "invalid";
      throw err;
    }

    if (actorHex === targetHex) {
      const err = new Error("Cannot block yourself.");
      err.code = "self";
      throw err;
    }

    await this.ensureLoaded(actorHex);

    if (this.blockedPubkeys.has(targetHex)) {
      return { ok: true, already: true };
    }

    const snapshot = new Set(this.blockedPubkeys);
    this.blockedPubkeys.add(targetHex);

    const loggedInPubkey = normalizeHex(nostrClient?.pubkey);
    const sessionPubkey = normalizeHex(nostrClient?.sessionActor?.pubkey);
    const isSessionActor =
      !!actorHex && !loggedInPubkey && actorHex === sessionPubkey;

    if (isSessionActor) {
      this._saveLocal(actorHex);
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "block",
        targetPubkey: targetHex,
        actorPubkey: actorHex,
      });
      this._clearSeedRemoval(actorHex, targetHex);
      return { ok: true };
    }

    try {
      await this.publishBlockList(actorHex);
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "block",
        targetPubkey: targetHex,
        actorPubkey: actorHex,
      });
      this._clearSeedRemoval(actorHex, targetHex);
      return { ok: true };
    } catch (err) {
      this.blockedPubkeys = snapshot;
      throw err;
    }
  }

  async removeBlock(targetPubkey, userPubkey) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      throw new Error("Invalid user pubkey.");
    }

    const targetHex = normalizeHex(targetPubkey);
    if (!targetHex) {
      return { ok: true, already: true };
    }

    await this.ensureLoaded(actorHex);

    if (!this.blockedPubkeys.has(targetHex)) {
      return { ok: true, already: true };
    }

    const snapshot = new Set(this.blockedPubkeys);
    this.blockedPubkeys.delete(targetHex);

    const loggedInPubkey = normalizeHex(nostrClient?.pubkey);
    const sessionPubkey = normalizeHex(nostrClient?.sessionActor?.pubkey);
    const isSessionActor =
      !!actorHex && !loggedInPubkey && actorHex === sessionPubkey;

    if (isSessionActor) {
      this._saveLocal(actorHex);
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "unblock",
        targetPubkey: targetHex,
        actorPubkey: actorHex,
      });
      this._addSeedRemoval(actorHex, targetHex);
      return { ok: true };
    }

    try {
      await this.publishBlockList(actorHex);
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "unblock",
        targetPubkey: targetHex,
        actorPubkey: actorHex,
      });
      this._addSeedRemoval(actorHex, targetHex);
      return { ok: true };
    } catch (err) {
      this.blockedPubkeys = snapshot;
      throw err;
    }
  }

  async publishMuteListSnapshot({
    signer,
    ownerPubkey,
    blockedPubkeys = [],
    createdAt,
    plaintext = "",
    onStatus,
  } = {}) {
    const owner = normalizeHex(ownerPubkey);
    if (!owner || !signer || typeof signer.signEvent !== "function") {
      return null;
    }

    const tags = sanitizeMuteTags(blockedPubkeys, owner);

    const timestamp = Number.isFinite(createdAt)
      ? Math.max(0, Math.floor(createdAt))
      : Math.floor(Date.now() / 1000);

    const event = {
      kind: 10000,
      pubkey: owner,
      created_at: timestamp,
      tags,
      content: "",
    };

    const payloadText = typeof plaintext === "string" ? plaintext : "";
    let encryptedContent = "";
    let encryptionTagValue = "";

    if (payloadText) {
      const encryptionCandidates = [];

      if (typeof signer.nip44Encrypt === "function") {
        encryptionCandidates.push({ tag: "nip44_v2", encrypt: signer.nip44Encrypt });
      }

      if (typeof signer.nip04Encrypt === "function") {
        encryptionCandidates.push({ tag: "nip04", encrypt: signer.nip04Encrypt });
      }

      for (const candidate of encryptionCandidates) {
        try {
          const encrypted = await candidate.encrypt(owner, payloadText);
          if (typeof encrypted === "string" && encrypted) {
            encryptedContent = encrypted;
            encryptionTagValue = candidate.tag;
            break;
          }
        } catch (error) {
          // Ignore encryption failures and fall back to the next candidate.
        }
      }
    }

    if (encryptedContent) {
      event.content = encryptedContent;
      if (encryptionTagValue) {
        event.tags.push(["encrypted", encryptionTagValue]);
      }
    }

    onStatus?.({ status: "mute-publishing" });

    let signedEvent;
    try {
      signedEvent = await signer.signEvent(event);
    } catch (error) {
      const wrapped =
        error instanceof Error ? error : new Error(String(error || "mute-signature-failed"));
      wrapped.code = wrapped.code || "mute-signature-failed";
      throw wrapped;
    }

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      nostrClient.relays,
      signedEvent,
    );

    const summary = assertAnyRelayAccepted(publishResults, { context: "mute list" });

    if (summary.failed.length) {
      summary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[UserBlockList] Mute list not accepted by ${url}: ${reason}`,
          relayError,
        );
      });
    }

    this.muteEventId = signedEvent.id;
    this.muteEventCreatedAt = Number.isFinite(signedEvent?.created_at)
      ? signedEvent.created_at
      : event.created_at;

    onStatus?.({ status: "mute-published", event: signedEvent });

    return signedEvent;
  }

  async publishBlockList(userPubkey, options = {}) {
    const onStatus =
      options && typeof options.onStatus === "function" ? options.onStatus : null;

    onStatus?.({ status: "publishing" });

    let signer = getActiveSigner();
    if (!signer) {
      signer = await nostrClient.ensureActiveSignerForPubkey(userPubkey);
    }

    if (!signer) {
      const err = new Error(
        "An active signer is required to update the block list."
      );
      err.code = "signer-missing";
      throw err;
    }

    if (signer.type === "extension") {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        userLogger.warn(
          "[UserBlockList] Signer permissions denied while updating the block list.",
          permissionResult.error,
        );
        const err = new Error(
          "The active signer must allow encryption and signing before updating the block list.",
        );
        err.code = "extension-permission-denied";
        err.cause = permissionResult.error;
        throw err;
      }
    }

    if (typeof signer.signEvent !== "function") {
      const err = new Error("Active signer missing signEvent support.");
      err.code = "sign-event-missing";
      throw err;
    }

    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      throw new Error("Invalid user pubkey.");
    }

    const sanitizedTags = sanitizeMuteTags(this.blockedPubkeys, normalized);
    const payload = {
      blockedPubkeys: sanitizedTags.map(([, target]) => target),
    };
    const plaintext = serializeBlockListTagMatrix(sanitizedTags, normalized, {
      logDiscarded: false,
    });

    const encryptors = [];
    const registerEncryptor = (scheme, handler) => {
      if (!scheme || typeof handler !== "function") {
        return;
      }
      encryptors.push({ scheme, handler });
    };

    if (typeof signer.nip44Encrypt === "function") {
      registerEncryptor("nip44_v2", (value) => signer.nip44Encrypt(normalized, value));
      registerEncryptor("nip44", (value) => signer.nip44Encrypt(normalized, value));
    }

    if (typeof signer.nip04Encrypt === "function") {
      registerEncryptor("nip04", (value) => signer.nip04Encrypt(normalized, value));
    }

    if (!encryptors.length) {
      const err = new Error(
        "An encryption-capable signer is required to update the block list."
      );
      err.code = "block-list-missing-encryptor";
      throw err;
    }

    let cipherText = "";
    let encryptionScheme = "";
    const seenSchemes = new Set();
    const encryptionErrors = [];

    for (const candidate of encryptors) {
      if (seenSchemes.has(candidate.scheme)) {
        continue;
      }
      seenSchemes.add(candidate.scheme);
      try {
        const encrypted = await candidate.handler(plaintext);
        if (typeof encrypted === "string" && encrypted) {
          cipherText = encrypted;
          encryptionScheme = candidate.scheme;
          break;
        }
      } catch (error) {
        encryptionErrors.push({ scheme: candidate.scheme, error });
      }
    }

    if (!cipherText) {
      const err = new Error("Failed to encrypt block list.");
      err.code = "block-list-encrypt-failed";
      err.cause = encryptionErrors;
      throw err;
    }

    const encryptionTagValue =
      encryptionScheme === "nip44_v2"
        ? "nip44_v2"
        : encryptionScheme === "nip44"
          ? "nip44"
          : encryptionScheme === "nip04"
            ? "nip04"
            : undefined;

    const event = buildBlockListEvent({
      pubkey: normalized,
      created_at: Math.floor(Date.now() / 1000),
      content: cipherText,
      encryption: encryptionTagValue,
    });

    const signedEvent = await signer.signEvent(event);

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      nostrClient.relays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "block list",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[UserBlockList] Block list rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[UserBlockList] Block list not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    this.blockEventId = signedEvent.id;
    this.blockEventCreatedAt = Number.isFinite(signedEvent?.created_at)
      ? signedEvent.created_at
      : event.created_at;
    this.lastPublishedCreatedAt = this.blockEventCreatedAt;
    onStatus?.({ status: "published", event: signedEvent });

    try {
      await this.publishMuteListSnapshot({
        signer,
        ownerPubkey: normalized,
        blockedPubkeys: payload.blockedPubkeys,
        createdAt: event.created_at,
        plaintext,
        onStatus,
      });
    } catch (muteError) {
      userLogger.warn("[UserBlockList] Failed to publish mute list", muteError);
    }

    try {
      await this.loadBlocks(normalized, {
        since: this.lastPublishedCreatedAt ?? undefined,
        statusCallback: (detail) => {
          if (!onStatus) {
            return;
          }
          onStatus({ status: "relay", detail });
        },
      });
    } catch (refreshError) {
      onStatus?.({ status: "relay-error", error: refreshError });
    }

    return signedEvent;
  }
}

export const userBlocks = new UserBlockListManager();

if (typeof window !== "undefined") {
  window.userBlocks = userBlocks;
}
