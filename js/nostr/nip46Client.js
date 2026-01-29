// js/nostr/nip46Client.js

/**
 * NIP-46 (Nostr Connect) Client Implementation.
 *
 * This module provides a client for the Nostr Connect protocol, allowing the application
 * to delegate event signing to a remote signer (e.g., a "Bunker" or mobile wallet).
 *
 * Key components:
 * - `Nip46RpcClient`: The main class managing the RPC session.
 * - `parseNip46ConnectionString`: URI parser for `bunker://` and `nostrconnect://`.
 *
 * For a detailed architecture overview, see `docs/nip46-client-overview.md`.
 */

import { isDevMode } from "../config.js";
import {
  DEFAULT_RELAY_URLS,
  ensureNostrTools,
  getCachedNostrTools,
  readToolkitFromScope,
} from "./toolkit.js";
import {
  publishEventToRelays as defaultPublishEventToRelays,
  assertAnyRelayAccepted as defaultAssertAnyRelayAccepted,
} from "../nostrPublish.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { Nip46RequestQueue, NIP46_PRIORITY } from "./nip46Queue.js";

export const HEX64_REGEX = /^[0-9a-f]{64}$/i;

export const NIP46_RPC_KIND = 24_133;
export const NIP46_SESSION_STORAGE_KEY = "bitvid:nip46:session:v1";
export const NIP46_PUBLISH_TIMEOUT_MS = 8_000;
export const NIP46_RESPONSE_TIMEOUT_MS = 15_000;
export const NIP46_SIGN_EVENT_TIMEOUT_MS = 20_000;
export const NIP46_MAX_RETRIES = 1;
export const NIP46_HANDSHAKE_TIMEOUT_MS = 60_000;
export const NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS = 5;
export const NIP46_ENCRYPTION_ALGORITHMS = Object.freeze([
  "nip44.v2",
  "nip44",
  "nip04",
]);

function isSecureRelayContext() {
  if (typeof window === "undefined") {
    return false;
  }
  const protocol = window?.location?.protocol;
  return protocol === "https:";
}

function resolveRelayProtocol(protocol, { enforceTls = false } = {}) {
  if (!protocol) {
    return null;
  }
  const normalized = protocol.toLowerCase();
  if (normalized === "wss:") {
    return "wss:";
  }
  if (normalized === "ws:") {
    return enforceTls ? "wss:" : "ws:";
  }
  return null;
}

/**
 * resolves the appropriate storage mechanism (localStorage or polyfill) for NIP-46 sessions.
 * @returns {Storage|null} The storage interface or null if unavailable.
 */
export function getNip46Storage() {
  if (typeof localStorage !== "undefined" && localStorage) {
    return localStorage;
  }

  if (typeof globalThis !== "undefined" && globalThis?.localStorage) {
    return globalThis.localStorage;
  }

  return null;
}

/**
 * Cleans and normalizes a list of relay URLs.
 * Removes duplicates, trailing slashes, and invalid URLs.
 *
 * @param {string[]} list - The raw list of relay URLs.
 * @returns {string[]} The sanitized list of relay URLs.
 */
export function sanitizeRelayList(list) {
  const seen = new Set();
  const sanitized = [];
  if (!Array.isArray(list)) {
    return sanitized;
  }
  const enforceTls = isSecureRelayContext();

  list.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (!/^wss?:\/\//i.test(trimmed)) {
      return;
    }
    if (/\s/.test(trimmed)) {
      return;
    }

    let normalized = trimmed.replace(/\/+$/, "");
    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname) {
        return;
      }
      const resolvedProtocol = resolveRelayProtocol(parsed.protocol, {
        enforceTls,
      });
      if (!resolvedProtocol) {
        return;
      }
      if (parsed.protocol !== resolvedProtocol) {
        parsed.protocol = resolvedProtocol;
      }
      const pathname = parsed.pathname.replace(/\/+$/, "");
      normalized = `${parsed.protocol}//${parsed.host}${pathname}${parsed.search || ""}`;
    } catch (error) {
      // Ignore URL parsing failures and fall back to the trimmed string.
    }

    if (enforceTls && normalized.startsWith("ws://")) {
      return;
    }

    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    sanitized.push(normalized);
  });

  return sanitized;
}

/**
 * Validates and normalizes a NIP-46 session object from storage.
 * Ensures strict schema compliance to prevent prototype pollution or corrupted state.
 *
 * @param {object} candidate - The raw session object from storage.
 * @returns {object|null} The valid session object or null if invalid.
 */
export function sanitizeStoredNip46Session(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const version = Number(candidate.version) || 0;
  if (version !== 1) {
    return null;
  }

  const clientPublicKey =
    typeof candidate.clientPublicKey === "string" && candidate.clientPublicKey.trim()
      ? candidate.clientPublicKey.trim().toLowerCase()
      : "";
  const remotePubkey =
    typeof candidate.remotePubkey === "string" && candidate.remotePubkey.trim()
      ? candidate.remotePubkey.trim().toLowerCase()
      : "";

  if (!remotePubkey) {
    return null;
  }

  const relays = Array.isArray(candidate.relays)
    ? candidate.relays
        .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
        .filter(Boolean)
    : [];

  const metadata =
    candidate.metadata && typeof candidate.metadata === "object"
      ? {
          name:
            typeof candidate.metadata.name === "string"
              ? candidate.metadata.name.trim()
              : "",
          url:
            typeof candidate.metadata.url === "string"
              ? candidate.metadata.url.trim()
              : "",
          image:
            typeof candidate.metadata.image === "string"
              ? candidate.metadata.image.trim()
              : "",
        }
      : {};

  return {
    version: 1,
    clientPublicKey,
    remotePubkey,
    relays,
    encryption: normalizeNip46EncryptionAlgorithm(
      typeof candidate.encryption === "string"
        ? candidate.encryption
        : typeof candidate.algorithm === "string"
        ? candidate.algorithm
        : "",
    ),
    permissions:
      typeof candidate.permissions === "string" && candidate.permissions.trim()
        ? candidate.permissions.trim()
        : "",
    metadata,
    userPubkey:
      typeof candidate.userPubkey === "string" && candidate.userPubkey.trim()
        ? candidate.userPubkey.trim().toLowerCase()
        : "",
    lastConnectedAt: Number.isFinite(candidate.lastConnectedAt)
      ? candidate.lastConnectedAt
      : Date.now(),
  };
}

export function readStoredNip46Session() {
  const storage = getNip46Storage();
  if (!storage) {
    return null;
  }

  let raw = null;
  try {
    raw = storage.getItem(NIP46_SESSION_STORAGE_KEY);
  } catch (error) {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeStoredNip46Session(parsed);
    if (
      sanitized &&
      (typeof parsed?.clientPrivateKey === "string" ||
        typeof parsed?.secret === "string")
    ) {
      writeStoredNip46Session(sanitized);
    }
    return sanitized;
  } catch (error) {
    try {
      storage.removeItem(NIP46_SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[nostr] Failed to clear corrupt NIP-46 session entry:",
        cleanupError,
      );
    }
    return null;
  }
}

export function writeStoredNip46Session(payload) {
  const storage = getNip46Storage();
  if (!storage) {
    return;
  }

  const sanitizedInput =
    payload && typeof payload === "object"
      ? {
          version: payload.version,
          clientPublicKey: payload.clientPublicKey,
          remotePubkey: payload.remotePubkey,
          relays: payload.relays,
          encryption: payload.encryption,
          permissions: payload.permissions,
          metadata: payload.metadata,
          userPubkey: payload.userPubkey,
          lastConnectedAt: payload.lastConnectedAt,
        }
      : payload;
  const normalized = sanitizeStoredNip46Session(sanitizedInput);
  if (!normalized) {
    try {
      storage.removeItem(NIP46_SESSION_STORAGE_KEY);
    } catch (error) {
      // ignore cleanup failures
    }
    return;
  }

  try {
    storage.setItem(NIP46_SESSION_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // ignore persistence failures
  }
}

export function clearStoredNip46Session() {
  const storage = getNip46Storage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(NIP46_SESSION_STORAGE_KEY);
  } catch (error) {
    // ignore cleanup issues
  }
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CHARSET_MAP = (() => {
  const map = new Map();
  for (let index = 0; index < BECH32_CHARSET.length; index += 1) {
    map.set(BECH32_CHARSET[index], index);
  }
  return map;
})();

function bech32Polymod(values) {
  const GENERATORS = [
    0x3b6a57b2,
    0x26508e6d,
    0x1ea119fa,
    0x3d4233dd,
    0x2a1462b3,
  ];

  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < GENERATORS.length; i += 1) {
      if ((top >> i) & 1) {
        chk ^= GENERATORS[i];
      }
    }
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  const result = [];
  for (let i = 0; i < hrp.length; i += 1) {
    result.push(hrp.charCodeAt(i) >> 5);
  }
  result.push(0);
  for (let i = 0; i < hrp.length; i += 1) {
    result.push(hrp.charCodeAt(i) & 31);
  }
  return result;
}

function bech32VerifyChecksum(hrp, data) {
  return bech32Polymod([...bech32HrpExpand(hrp), ...data]) === 1;
}

function convertBits(data, fromBits, toBits) {
  let accumulator = 0;
  let bits = 0;
  const result = [];
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) {
      return null;
    }
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }

  if (bits > 0) {
    result.push((accumulator << (toBits - bits)) & maxValue);
  }

  return result;
}

function decodeBech32Npub(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.toLowerCase();
  const separatorIndex = normalized.lastIndexOf("1");
  if (separatorIndex <= 0 || separatorIndex + 7 > normalized.length) {
    return "";
  }

  const hrp = normalized.slice(0, separatorIndex);
  if (hrp !== "npub") {
    return "";
  }

  const dataPart = normalized.slice(separatorIndex + 1);
  const values = [];
  for (let i = 0; i < dataPart.length; i += 1) {
    const mapped = BECH32_CHARSET_MAP.get(dataPart[i]);
    if (typeof mapped !== "number") {
      return "";
    }
    values.push(mapped);
  }

  if (values.length < 7 || !bech32VerifyChecksum(hrp, values)) {
    return "";
  }

  const words = values.slice(0, -6);
  const bytes = convertBits(words, 5, 8);
  if (!bytes || bytes.length !== 32) {
    return "";
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function decodeNpubToHex(npub) {
  if (typeof npub !== "string") {
    return "";
  }

  const trimmed = npub.trim();
  if (!trimmed) {
    return "";
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const lower = trimmed.toLowerCase();
  const hasNpubPrefix = lower.startsWith("npub1");
  if (!hasNpubPrefix) {
    return "";
  }

  const warnableNpub = /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(
    trimmed,
  );

  let tools = getCachedNostrTools();
  if (!tools || typeof tools?.nip19?.decode !== "function") {
    const fallbackTools = readToolkitFromScope();
    if (fallbackTools) {
      tools = fallbackTools;
    }
  }

  let decodeError = null;
  if (tools?.nip19 && typeof tools.nip19.decode === "function") {
    try {
      const decoded = tools.nip19.decode(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (error) {
      decodeError = error;
    }
  }

  const manualDecoded = decodeBech32Npub(trimmed);
  if (manualDecoded) {
    return manualDecoded;
  }

  if (isDevMode && warnableNpub) {
    userLogger.warn(
      `[nostr] Failed to decode npub: ${trimmed}`,
      decodeError || new Error("invalid-npub"),
    );
  }

  return "";
}

export function encodeHexToNpub(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }

  const normalized = pubkey.trim().toLowerCase();
  if (!normalized || !HEX64_REGEX.test(normalized)) {
    return "";
  }

  let toolkit = getCachedNostrTools();
  if (!toolkit || typeof toolkit?.nip19?.npubEncode !== "function") {
    const fallbackToolkit = readToolkitFromScope();
    if (fallbackToolkit?.nip19?.npubEncode) {
      toolkit = fallbackToolkit;
    }
  }

  const encoder = toolkit?.nip19?.npubEncode;
  if (typeof encoder !== "function") {
    return "";
  }

  try {
    return encoder(normalized);
  } catch (error) {
    if (isDevMode) {
      devLogger.warn("[nostr] Failed to encode npub", error);
    }
    return "";
  }
}

export function normalizeNostrPubkey(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return "";
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const decoded = decodeNpubToHex(trimmed);
  if (decoded && HEX64_REGEX.test(decoded)) {
    return decoded.toLowerCase();
  }

  return trimmed.toLowerCase();
}

/**
 * Parses a NIP-46 connection URI (bunker:// or nostrconnect://) into a structured configuration.
 * Handles decoding of standard params (relay, secret, perms) and bunker-specific logic (user hints).
 *
 * @param {string} uri - The connection URI.
 * @returns {object|null} The parsed configuration object or null if invalid.
 */
export function parseNip46ConnectionString(uri) {
  const value = typeof uri === "string" ? uri.trim() : "";
  if (!value) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return null;
  }

  const decodeParam = (raw) => {
    if (typeof raw !== "string") {
      return "";
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }
    try {
      return decodeURIComponent(trimmed);
    } catch (error) {
      return trimmed;
    }
  };

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  const params = parsed.searchParams || new URLSearchParams();

  const relays = params
    .getAll("relay")
    .map((relay) => decodeParam(relay))
    .filter(Boolean);

  const permissionsParam =
    decodeParam(params.get("perms")) || decodeParam(params.get("permissions")) || "";
  const metadata = {
    name: "",
    url: "",
    image: "",
  };

  for (const key of ["name", "url", "image"]) {
    const decoded = decodeParam(params.get(key));
    if (decoded) {
      metadata[key] = decoded;
    }
  }

  const remoteSignerParamKeys = [
    "remote-signer-key",
    "remote_signer_key",
    "remotesignerkey",
    "remoteSignerKey",
    "remote-signer-pubkey",
    "remote_signer_pubkey",
    "remoteSignerPubkey",
  ];

  let remoteSignerParam = "";
  for (const key of remoteSignerParamKeys) {
    const candidate = decodeParam(params.get(key));
    if (candidate) {
      remoteSignerParam = candidate;
      break;
    }
  }

  const remoteFallbackParam =
    decodeParam(params.get("remote")) ||
    decodeParam(params.get("remotePubkey")) ||
    decodeParam(params.get("signer")) ||
    "";

  let remotePubkey = remoteSignerParam || remoteFallbackParam || "";
  let clientPubkey = "";
  let userPubkeyHint = "";

  if (scheme === "bunker") {
    let bunkerIdentifier = parsed.hostname || "";
    if (!bunkerIdentifier && parsed.pathname && parsed.pathname !== "/") {
      bunkerIdentifier = parsed.pathname.replace(/^\/+/, "");
    }

    const normalizedIdentifier = normalizeNostrPubkey(bunkerIdentifier);

    if (remoteSignerParam) {
      userPubkeyHint = normalizedIdentifier;
    } else if (!remotePubkey) {
      remotePubkey = normalizedIdentifier;
    }

    if (!userPubkeyHint) {
      const userParamCandidates = [
        "user",
        "user_pubkey",
        "user-pubkey",
        "pubkey",
        "npub",
        "profile",
      ];
      for (const key of userParamCandidates) {
        const candidate = decodeParam(params.get(key));
        if (candidate) {
          userPubkeyHint = normalizeNostrPubkey(candidate);
          if (userPubkeyHint) {
            break;
          }
        }
      }

      if (!userPubkeyHint && normalizedIdentifier && normalizedIdentifier !== remotePubkey) {
        userPubkeyHint = normalizedIdentifier;
      }
    }
  } else if (scheme === "nostrconnect" || scheme === "web+nostrconnect") {
    clientPubkey = parsed.hostname || "";
    if (!clientPubkey && parsed.pathname && parsed.pathname !== "/") {
      clientPubkey = parsed.pathname.replace(/^\/+/, "");
    }
  }

  const secretParam = decodeParam(params.get("secret"));

  return {
    scheme,
    type: scheme === "bunker" ? "remote" : "client",
    remotePubkey: normalizeNostrPubkey(remotePubkey),
    clientPubkey: normalizeNostrPubkey(clientPubkey),
    relays,
    secret: secretParam,
    permissions: typeof permissionsParam === "string" ? permissionsParam.trim() : "",
    metadata,
    userPubkeyHint: normalizeNostrPubkey(userPubkeyHint),
  };
}

export function generateNip46Secret(length = 16) {
  const size = Number.isFinite(length) && length > 0 ? Math.min(64, Math.max(8, Math.floor(length))) : 16;
  try {
    if (typeof crypto !== "undefined" && crypto?.getRandomValues) {
      const bytes = new Uint8Array(size);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch (error) {
    // fall through to Math.random fallback
  }

  let secret = "";
  for (let i = 0; i < size; i += 1) {
    secret += Math.floor(Math.random() * 16).toString(16);
  }
  return secret;
}

export function sanitizeNip46Metadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const normalized = {};
  for (const key of ["name", "url", "image"]) {
    if (typeof metadata[key] === "string" && metadata[key].trim()) {
      normalized[key] = metadata[key].trim();
    }
  }
  return normalized;
}

export function normalizeNip46EncryptionAlgorithm(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  if (NIP46_ENCRYPTION_ALGORITHMS.includes(trimmed)) {
    return trimmed;
  }

  const aliasMap = new Map([
    ["nip44v2", "nip44.v2"],
    ["nip44-v2", "nip44.v2"],
    ["nip44_v2", "nip44.v2"],
    ["nip44-v1", "nip44"],
    ["nip44v1", "nip44"],
    ["nip44_v1", "nip44"],
    ["nip-44", "nip44"],
    ["nip-04", "nip04"],
    ["nip04.v1", "nip04"],
  ]);

  if (aliasMap.has(trimmed)) {
    return aliasMap.get(trimmed) || "";
  }

  return "";
}

export function resolveNip46Relays(relays, fallbackRelays = []) {
  const primary = sanitizeRelayList(Array.isArray(relays) ? relays : []);
  if (primary.length) {
    return primary;
  }

  const fallback = sanitizeRelayList(Array.isArray(fallbackRelays) ? fallbackRelays : []);
  if (fallback.length) {
    return fallback;
  }

  return Array.from(DEFAULT_RELAY_URLS);
}

function resolveNip44V2ConversationKeyGetter(tools) {
  if (typeof tools?.nip44?.v2?.getConversationKey === "function") {
    return tools.nip44.v2.getConversationKey.bind(tools.nip44.v2);
  }

  if (typeof tools?.nip44?.v2?.utils?.getConversationKey === "function") {
    return tools.nip44.v2.utils.getConversationKey.bind(tools.nip44.v2.utils);
  }

  return null;
}

function resolveLegacyNip44ConversationKeyGetter(tools) {
  if (typeof tools?.nip44?.getConversationKey === "function") {
    return tools.nip44.getConversationKey.bind(tools.nip44);
  }

  if (typeof tools?.nip44?.utils?.getConversationKey === "function") {
    return tools.nip44.utils.getConversationKey.bind(tools.nip44.utils);
  }

  return null;
}

let sharedTextDecoder = null;

function decodeBytesToUtf8(value) {
  if (value == null) {
    return "";
  }

  if (typeof Buffer !== "undefined" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(value)) {
    try {
      return value.toString("utf8");
    } catch (error) {
      return "";
    }
  }

  let view = null;

  if (value instanceof Uint8Array) {
    view = value;
  } else if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) {
      view = new Uint8Array(value);
    } else if (typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
      try {
        view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } catch (error) {
        view = null;
      }
    }
  }

  if (!view && Array.isArray(value)) {
    const bytes = [];
    for (const entry of value) {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        const normalized = entry & 0xff;
        if (normalized < 0 || normalized > 255) {
          return "";
        }
        bytes.push(normalized);
      } else {
        return "";
      }
    }
    if (!bytes.length) {
      return "";
    }
    view = Uint8Array.from(bytes);
  }

  if (!view || !view.length) {
    return "";
  }

  if (!sharedTextDecoder && typeof TextDecoder === "function") {
    try {
      sharedTextDecoder = new TextDecoder();
    } catch (error) {
      sharedTextDecoder = null;
    }
  }

  if (sharedTextDecoder) {
    try {
      return sharedTextDecoder.decode(view);
    } catch (error) {
      // fall through to manual decoding
    }
  }

  let result = "";
  for (let index = 0; index < view.length; index += 1) {
    result += String.fromCharCode(view[index]);
  }
  return result;
}

export function normalizeNip46CiphertextPayload(payload) {
  const visited = new Set();
  const candidates = new Set();

  const addCandidate = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    candidates.add(trimmed);
  };

  const addCiphertextWithNonce = (ciphertext, nonce) => {
    const normalizedCiphertext = typeof ciphertext === "string" ? ciphertext.trim() : "";
    const normalizedNonce = typeof nonce === "string" ? nonce.trim() : "";

    if (!normalizedCiphertext) {
      return;
    }

    addCandidate(normalizedCiphertext);

    if (!normalizedNonce) {
      return;
    }

    const strippedNonce = normalizedNonce.replace(/^\?iv=/i, "");

    addCandidate(`${normalizedCiphertext}\n${strippedNonce}`);
    addCandidate(`${normalizedCiphertext}?iv=${strippedNonce}`);

    if (strippedNonce !== normalizedNonce) {
      addCandidate(`${normalizedCiphertext}${normalizedNonce}`);
    }
  };

  const coerce = (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        addCandidate(trimmed);
      }
      return;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      addCandidate(String(value));
      return;
    }

    if (Array.isArray(value)) {
      const scalarEntries = [];
      for (const entry of value) {
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
          const candidate = String(entry).trim();
          if (candidate) {
            scalarEntries.push(candidate);
            addCandidate(candidate);
          }
        } else if (entry && typeof entry === "object") {
          coerce(entry);
        }
      }

      if (scalarEntries.length >= 2) {
        for (let i = 0; i < scalarEntries.length; i += 1) {
          for (let j = i + 1; j < scalarEntries.length; j += 1) {
            addCiphertextWithNonce(scalarEntries[i], scalarEntries[j]);
            addCiphertextWithNonce(scalarEntries[j], scalarEntries[i]);
          }
        }
      }

      for (const entry of value) {
        coerce(entry);
      }
      return;
    }

    if (value && typeof value === "object") {
      const decoded = decodeBytesToUtf8(value);
      if (decoded) {
        addCandidate(decoded);
        return;
      }

      if (
        typeof value.type === "string" &&
        value.type.toLowerCase() === "buffer" &&
        Array.isArray(value.data)
      ) {
        const bufferDecoded = decodeBytesToUtf8(value.data);
        if (bufferDecoded) {
          addCandidate(bufferDecoded);
          return;
        }
      }

      if (visited.has(value)) {
        return;
      }
      visited.add(value);

      const ciphertextCandidates = [
        typeof value.ciphertext === "string" ? value.ciphertext : "",
        typeof value.cipher_text === "string" ? value.cipher_text : "",
        typeof value.content === "string" ? value.content : "",
        typeof value.payload === "string" ? value.payload : "",
        typeof value.result === "string" ? value.result : "",
        typeof value.value === "string" ? value.value : "",
        typeof value.data === "string" ? value.data : "",
      ];

      const nonceCandidates = [
        typeof value.nonce === "string" ? value.nonce : "",
        typeof value.iv === "string" ? value.iv : "",
      ];

      const ciphertext = ciphertextCandidates.find((candidate) => candidate && candidate.trim());
      const nonce = nonceCandidates.find((candidate) => candidate && candidate.trim());

      if (ciphertext || nonce) {
        addCiphertextWithNonce(ciphertext || "", nonce || "");
      }

      const nestedKeys = [
        "ciphertext",
        "cipher_text",
        "payload",
        "result",
        "value",
        "data",
        "content",
      ];

      for (const key of nestedKeys) {
        if (key in value) {
          coerce(value[key]);
        }
      }

      return;
    }
  };

  coerce(payload);

  return Array.from(candidates);
}

function resolveAvailableNip46Ciphers(
  tools,
  privateKey,
  remotePubkey,
  { preferredAlgorithm } = {},
) {
  if (!tools) {
    return [];
  }

  const normalizedPreferred = normalizeNip46EncryptionAlgorithm(preferredAlgorithm);
  const available = [];

  const registerCipher = (algorithm, factory) => {
    try {
      const cipher = factory();
      if (
        cipher &&
        typeof cipher.encrypt === "function" &&
        typeof cipher.decrypt === "function"
      ) {
        available.push({ ...cipher, algorithm });
      }
    } catch (error) {
      // Ignore individual algorithm failures so other fallbacks can run.
      devLogger.debug?.(
        "[nostr] Skipping unavailable NIP-46 cipher algorithm",
        algorithm,
        error,
      );
    }
  };

  const nip44v2GetConversationKey = resolveNip44V2ConversationKeyGetter(tools);
  if (
    tools?.nip44?.v2?.encrypt &&
    tools?.nip44?.v2?.decrypt &&
    typeof nip44v2GetConversationKey === "function"
  ) {
    registerCipher("nip44.v2", () => {
      const conversationKey = nip44v2GetConversationKey(privateKey, remotePubkey);

      if (!conversationKey) {
        throw new Error("Failed to derive a nip44 conversation key for remote signing.");
      }

      return {
        encrypt: (plaintext, nonce) =>
          typeof nonce === "string"
            ? tools.nip44.v2.encrypt(plaintext, conversationKey, nonce)
            : tools.nip44.v2.encrypt(plaintext, conversationKey),
        decrypt: (ciphertext) => tools.nip44.v2.decrypt(ciphertext, conversationKey),
      };
    });
  }

  const nip44GetConversationKey = resolveLegacyNip44ConversationKeyGetter(tools);

  if (
    tools?.nip44?.encrypt &&
    tools?.nip44?.decrypt &&
    typeof nip44GetConversationKey === "function"
  ) {
    registerCipher("nip44", () => {
      const conversationKey = nip44GetConversationKey(privateKey, remotePubkey);

      if (!conversationKey) {
        throw new Error("Failed to derive a nip44 conversation key for remote signing.");
      }

      return {
        encrypt: (plaintext, nonce) =>
          typeof nonce === "string"
            ? tools.nip44.encrypt(plaintext, conversationKey, nonce)
            : tools.nip44.encrypt(plaintext, conversationKey),
        decrypt: (ciphertext) => tools.nip44.decrypt(ciphertext, conversationKey),
      };
    });
  }

  if (tools?.nip04?.encrypt && tools?.nip04?.decrypt) {
    registerCipher("nip04", () => {
      const privateKeyHex = typeof privateKey === "string" ? privateKey : "";
      const remotePubkeyHex = typeof remotePubkey === "string" ? remotePubkey : "";

      if (!privateKeyHex || !remotePubkeyHex) {
        throw new Error("Missing keys for nip04 encryption.");
      }

      return {
        encrypt: (plaintext) =>
          tools.nip04.encrypt(privateKeyHex, remotePubkeyHex, plaintext),
        decrypt: (ciphertext) =>
          tools.nip04.decrypt(privateKeyHex, remotePubkeyHex, ciphertext),
      };
    });
  }

  if (normalizedPreferred) {
    const index = available.findIndex((entry) => entry.algorithm === normalizedPreferred);
    if (index > 0) {
      const [preferred] = available.splice(index, 1);
      available.unshift(preferred);
    }
  }

  return available;
}

/**
 * Creates an encryption interface (encrypt/decrypt) for NIP-46 communication.
 * Automatically selects the best available algorithm (NIP-44 v2 preferred) supported by the environment.
 *
 * @param {object} tools - The nostr-tools library instance.
 * @param {string} privateKey - The local client's private key (hex).
 * @param {string} remotePubkey - The remote signer's public key (hex).
 * @param {object} [options] - Configuration options.
 * @param {string} [options.preferredAlgorithm] - Force a specific algorithm ("nip44.v2", "nip04").
 * @returns {object} An object with `encrypt(text)` and `decrypt(text)` methods.
 */
export function createNip46Cipher(tools, privateKey, remotePubkey, options = {}) {
  const available = resolveAvailableNip46Ciphers(tools, privateKey, remotePubkey, options);

  if (!available.length) {
    throw new Error("Remote signer encryption helpers are unavailable.");
  }

  return available[0];
}

/**
 * Attempts to decrypt a NIP-46 payload using all available encryption algorithms.
 * Useful when the specific algorithm used by the remote signer is unknown (e.g., during handshake).
 *
 * @param {string} privateKey - The local client's private key.
 * @param {string} remotePubkey - The remote signer's public key.
 * @param {string} ciphertext - The encrypted payload.
 * @returns {Promise<object>} The decrypted result containing `{ plaintext, algorithm }`.
 */
export async function decryptNip46PayloadWithKeys(privateKey, remotePubkey, ciphertext) {
  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  if (!tools) {
    throw new Error("NostrTools helpers are unavailable for NIP-46 payload decryption.");
  }

  const ciphers = resolveAvailableNip46Ciphers(tools, privateKey, remotePubkey);
  if (!ciphers.length) {
    throw new Error("Remote signer encryption helpers are unavailable for NIP-46 payload decryption.");
  }
  const normalizedCandidates = normalizeNip46CiphertextPayload(ciphertext);
  const candidates = normalizedCandidates.length
    ? normalizedCandidates
    : typeof ciphertext === "string"
    ? [ciphertext]
    : [];

  const tried = [];
  for (const cipher of ciphers) {
    for (const candidate of candidates) {
      try {
        const plaintext = cipher.decrypt(candidate);
        return { plaintext, algorithm: cipher.algorithm };
      } catch (error) {
        tried.push({ candidate, algorithm: cipher.algorithm, error });
      }
    }
  }

  const failure = new Error("Failed to decrypt NIP-46 payload with available candidates.");
  failure.attempts = tried;
  throw failure;
}

export function summarizeHexForLog(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length <= 12) {
    return `${normalized} (len:${normalized.length})`;
  }
  return `${normalized.slice(0, 8)}…${normalized.slice(-4)} (len:${normalized.length})`;
}

export function summarizeSecretForLog(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "<empty>";
  }

  const trimmed = value.trim();
  const visible = trimmed.length <= 4 ? "*".repeat(trimmed.length) : `${"*".repeat(3)}…`;
  return `${visible} (len:${trimmed.length})`;
}

export function summarizeMetadataForLog(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  return Object.keys(metadata).slice(0, 12);
}

export function summarizeUrlForLog(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return {
      origin: url.origin,
      pathname: url.pathname,
      hasQuery: Boolean(url.search),
      hasHash: Boolean(url.hash),
      length: trimmed.length,
    };
  } catch (error) {
    const length = trimmed.length;
    if (length <= 64) {
      return `${trimmed} (len:${length})`;
    }
    return `${trimmed.slice(0, 32)}…${trimmed.slice(-8)} (len:${length})`;
  }
}

export function summarizePayloadPreviewForLog(value) {
  if (typeof value !== "string") {
    return { type: typeof value };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { type: "string", length: 0 };
  }

  return {
    type: "string",
    length: trimmed.length,
    preview: trimmed.length <= 96 ? trimmed : `${trimmed.slice(0, 64)}…`,
  };
}

export function summarizeRpcParamsForLog(method, params) {
  if (!Array.isArray(params)) {
    return [];
  }

  return params.map((param, index) => {
    if (typeof param === "string") {
      if (method === "connect" && index === 1) {
        return { index, secret: summarizeSecretForLog(param) };
      }
      const trimmed = param.trim();
      if (!trimmed) {
        return { index, type: "string", length: 0 };
      }
      if (method === "sign_event") {
        return { index, type: "string", length: trimmed.length };
      }
      if (trimmed.length <= 64) {
        return { index, value: trimmed, length: trimmed.length };
      }
      return {
        index,
        type: "string",
        length: trimmed.length,
        preview: `${trimmed.slice(0, 32)}…${trimmed.slice(-8)}`,
      };
    }

    if (param && typeof param === "object") {
      return {
        index,
        type: Array.isArray(param) ? "array" : "object",
        keys: Object.keys(param).slice(0, 6),
      };
    }

    return { index, type: typeof param };
  });
}

export function summarizeRpcResultForLog(method, result) {
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) {
      return { type: "string", length: 0 };
    }
    if (method === "connect") {
      return { type: "string", length: trimmed.length, secret: summarizeSecretForLog(trimmed) };
    }
    if (trimmed.length <= 96) {
      return { type: "string", length: trimmed.length, value: trimmed };
    }
    return {
      type: "string",
      length: trimmed.length,
      preview: `${trimmed.slice(0, 48)}…${trimmed.slice(-12)}`,
    };
  }

  if (!result) {
    return { type: typeof result };
  }

  if (typeof result === "object") {
    return {
      type: Array.isArray(result) ? "array" : "object",
      keys: Object.keys(result).slice(0, 6),
    };
  }

  return { type: typeof result };
}

export function summarizeRelayPublishResultsForLog(results) {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((entry) => ({
    relay: entry?.relay || "",
    success: Boolean(entry?.ok),
    reason: entry?.error ? entry.error?.message || String(entry.error) : null,
  }));
}

export function createNip46RequestId() {
  try {
    if (typeof crypto !== "undefined" && crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch (error) {
    // fall through to timestamp-based id
  }

  const timestamp = Date.now().toString(16);
  const entropy = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${timestamp}${entropy}`;
}

export async function attemptDecryptNip46HandshakePayload({
  clientPrivateKey,
  candidateRemotePubkeys = [],
  ciphertext,
}) {
  const tried = [];
  const seen = new Set();

  for (const candidate of candidateRemotePubkeys) {
    const normalized = normalizeNostrPubkey(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    devLogger.debug("[nostr] Handshake decrypt attempt", {
      remotePubkey: summarizeHexForLog(normalized),
      ciphertextLength: typeof ciphertext === "string" ? ciphertext.length : 0,
    });
    try {
      const result = await decryptNip46PayloadWithKeys(
        clientPrivateKey,
        normalized,
        ciphertext,
      );
      devLogger.debug("[nostr] Handshake decrypt succeeded", {
        remotePubkey: summarizeHexForLog(normalized),
        algorithm: result?.algorithm || null,
      });
      return { ...result, remotePubkey: normalized };
    } catch (error) {
      devLogger.debug("[nostr] Handshake decrypt failed for candidate", {
        remotePubkey: summarizeHexForLog(normalized),
        error: error?.message || error,
      });
      tried.push({ remotePubkey: normalized, error });
    }
  }

  const failure = new Error(
    "Failed to decrypt remote signer handshake payload with provided keys.",
  );
  failure.attempts = tried;
  devLogger.warn("[nostr] Exhausted handshake decrypt candidates", {
    attempts: tried.map((entry) => ({
      remotePubkey: summarizeHexForLog(entry.remotePubkey),
      error: entry.error?.message || entry.error,
    })),
  });
  throw failure;
}

/**
 * Manages a NIP-46 (Nostr Connect) remote signing session.
 * Handles the RPC loop: Encrypt Request -> Publish Event -> Wait for Response -> Decrypt.
 *
 * It uses a "Stale-While-Revalidate" approach for subscriptions and maintains a
 * priority queue for requests to avoid rate-limiting issues with relays.
 */
export class Nip46RpcClient {
  /**
   * @param {object} config
   * @param {NostrClient} [config.nostrClient] - The main app client (for pool/relays).
   * @param {string} config.clientPrivateKey - The ephemeral local private key (hex).
   * @param {string} [config.clientPublicKey] - The ephemeral local public key (hex).
   * @param {string} config.remotePubkey - The remote signer's public key (hex).
   * @param {string[]} [config.relays] - List of relay URLs to use for the RPC channel.
   * @param {string} [config.encryption] - Preferred encryption algorithm ("nip44.v2" or "nip04").
   * @param {string} [config.secret] - Optional shared secret (for initial connection verification).
   * @param {string} [config.permissions] - Requested permissions (comma-separated).
   * @param {object} [config.metadata] - Metadata to identify this app to the signer.
   * @param {function} [config.signEvent] - Function to sign the RPC request events.
   */
  constructor({
    nostrClient,
    clientPrivateKey,
    clientPublicKey,
    remotePubkey,
    relays,
    encryption,
    secret,
    permissions,
    metadata,
    signEvent,
    publishEventToRelays = defaultPublishEventToRelays,
    assertAnyRelayAccepted = defaultAssertAnyRelayAccepted,
  } = {}) {
    this.nostrClient = nostrClient || null;
    this.clientPrivateKey =
      typeof clientPrivateKey === "string" && HEX64_REGEX.test(clientPrivateKey)
        ? clientPrivateKey.toLowerCase()
        : "";
    this.clientPublicKey = normalizeNostrPubkey(clientPublicKey);
    this.remotePubkey = normalizeNostrPubkey(remotePubkey);
    this.relays = resolveNip46Relays(relays, nostrClient?.relays || []);
    this.encryptionAlgorithm = normalizeNip46EncryptionAlgorithm(encryption);
    this.secret = typeof secret === "string" ? secret.trim() : "";
    this.permissions = typeof permissions === "string" ? permissions.trim() : "";
    this.metadata = metadata && typeof metadata === "object" ? { ...metadata } : {};
    this.signEventWithKey = typeof signEvent === "function" ? signEvent : null;
    this.publishEventToRelays =
      typeof publishEventToRelays === "function"
        ? publishEventToRelays
        : defaultPublishEventToRelays;
    this.assertAnyRelayAccepted =
      typeof assertAnyRelayAccepted === "function"
        ? assertAnyRelayAccepted
        : defaultAssertAnyRelayAccepted;

    if (!this.clientPrivateKey) {
      throw new Error("A NIP-46 client private key is required.");
    }

    if (!this.clientPublicKey) {
      const tools = getCachedNostrTools();
      if (!tools || typeof tools.getPublicKey !== "function") {
        throw new Error("Public key derivation is unavailable.");
      }
      this.clientPublicKey = tools.getPublicKey(this.clientPrivateKey);
      if (!this.clientPublicKey || !HEX64_REGEX.test(this.clientPublicKey)) {
        throw new Error("Failed to derive a valid public key for the remote signer session.");
      }
      this.clientPublicKey = this.clientPublicKey.toLowerCase();
    }

    if (!this.remotePubkey) {
      throw new Error("A remote signer pubkey is required.");
    }

    if (!this.signEventWithKey) {
      throw new Error("Remote signer requires a signEvent helper.");
    }

    this.pendingRequests = new Map();
    this.subscription = null;
    this.destroyed = false;
    this.cipher = null;
    this.lastSeen = 0;
    this.userPubkey = "";
    this.activeSignerCache = null;
    this.requestQueue = new Nip46RequestQueue();
  }

  get pool() {
    return this.nostrClient?.pool || null;
  }

  async ensurePool() {
    if (this.pool) {
      devLogger.debug("[nostr] Remote signer using existing nostr pool");
      return this.pool;
    }

    if (!this.nostrClient || typeof this.nostrClient.ensurePool !== "function") {
      throw new Error("Remote signer requires a nostr client pool.");
    }

    await this.nostrClient.ensurePool();
    devLogger.debug("[nostr] Remote signer pool ensured");
    return this.pool;
  }

  async ensureCipher() {
    if (this.cipher) {
      devLogger.debug("[nostr] Reusing cached remote signer cipher", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        algorithm: this.cipher?.algorithm || this.encryptionAlgorithm || null,
      });
      return this.cipher;
    }

    const tools = (await ensureNostrTools()) || getCachedNostrTools();
    if (!tools) {
      throw new Error("NostrTools helpers are unavailable for remote signing.");
    }

    const cipher = createNip46Cipher(
      tools,
      this.clientPrivateKey,
      this.remotePubkey,
      { preferredAlgorithm: this.encryptionAlgorithm },
    );
    this.cipher = cipher;
    if (!this.encryptionAlgorithm && cipher?.algorithm) {
      this.encryptionAlgorithm = cipher.algorithm;
    }
    devLogger.debug("[nostr] Created remote signer cipher", {
      remotePubkey: summarizeHexForLog(this.remotePubkey),
      algorithm: cipher?.algorithm || null,
    });
    return this.cipher;
  }

  async encryptPayload(payload, context = {}) {
    const { encrypt } = await this.ensureCipher();
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
    const ciphertext = encrypt(serialized);
    devLogger.debug("[nostr] Encrypted remote signer payload", {
      remotePubkey: summarizeHexForLog(this.remotePubkey),
      method: context.method || null,
      requestId: context.requestId || null,
      payloadPreview: summarizePayloadPreviewForLog(serialized),
      ciphertextLength: typeof ciphertext === "string" ? ciphertext.length : 0,
    });
    return ciphertext;
  }

  async decryptPayload(ciphertext, context = {}) {
    const { decrypt } = await this.ensureCipher();
    try {
      const plaintext = decrypt(ciphertext);
      devLogger.debug("[nostr] Decrypted remote signer payload", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        method: context.method || null,
        requestId: context.requestId || null,
        ciphertextLength: typeof ciphertext === "string" ? ciphertext.length : 0,
        plaintextPreview: summarizePayloadPreviewForLog(plaintext),
      });
      return plaintext;
    } catch (error) {
      devLogger.warn("[nostr] Remote signer payload decryption failed", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        method: context.method || null,
        requestId: context.requestId || null,
        ciphertextLength: typeof ciphertext === "string" ? ciphertext.length : 0,
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  async ensureSubscription() {
    if (this.subscription) {
      devLogger.debug("[nostr] Reusing remote signer subscription", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        relayCount: this.relays.length,
      });
      return this.subscription;
    }

    const pool = await this.ensurePool();
    const filters = [
      {
        kinds: [NIP46_RPC_KIND],
        authors: [this.remotePubkey],
        "#p": [this.clientPublicKey],
      },
    ];

    const relays = this.relays.length ? this.relays : resolveNip46Relays([], this.nostrClient?.relays || []);

    const sub = pool.sub(relays, filters);
    sub.on("event", (event) => {
      this.handleEvent(event);
    });
    sub.on("eose", () => {
      // no-op; responses are push-based
    });
    this.subscription = sub;
    devLogger.debug("[nostr] Remote signer subscription created", {
      remotePubkey: summarizeHexForLog(this.remotePubkey),
      relays,
      filters,
    });
    return sub;
  }

  handleEvent(event) {
    if (this.destroyed) {
      return;
    }

    if (!event || event.kind !== NIP46_RPC_KIND) {
      return;
    }

    if (typeof event.pubkey !== "string" || normalizeNostrPubkey(event.pubkey) !== this.remotePubkey) {
      return;
    }

    const tags = Array.isArray(event.tags) ? event.tags : [];
    const targetsClient = tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "p" &&
        typeof tag[1] === "string" &&
        normalizeNostrPubkey(tag[1]) === this.clientPublicKey,
    );

    if (!targetsClient) {
      return;
    }

    const eventId = typeof event.id === "string" ? event.id : "";
    devLogger.debug("[nostr] Remote signer event received", {
      eventId,
      remotePubkey: summarizeHexForLog(event.pubkey || ""),
      clientPubkey: summarizeHexForLog(this.clientPublicKey),
      createdAt: Number.isFinite(event.created_at) ? event.created_at : null,
      contentLength: typeof event.content === "string" ? event.content.length : 0,
    });

    Promise.resolve()
      .then(() =>
        this.decryptPayload(event.content, {
          requestId: eventId,
        }),
      )
      .then((payload) => {
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch (error) {
          devLogger.warn("[nostr] Remote signer returned malformed payload:", error);
          return;
        }

        if (!parsed || typeof parsed !== "object") {
          return;
        }

        const requestId = typeof parsed.id === "string" ? parsed.id : "";
        if (!requestId || !this.pendingRequests.has(requestId)) {
          return;
        }

        const pending = this.pendingRequests.get(requestId);
        devLogger.debug("[nostr] Remote signer response parsed", {
          eventId,
          requestId,
          remotePubkey: summarizeHexForLog(this.remotePubkey),
          method: pending?.method || null,
          resultSummary: summarizeRpcResultForLog(pending?.method || "", parsed.result),
          errorSummary: summarizePayloadPreviewForLog(parsed.error ?? ""),
        });
        this.pendingRequests.delete(requestId);
        clearTimeout(pending.timeoutId);

        this.lastSeen = Date.now();

        if (
          parsed.result === "auth_url" &&
          typeof parsed.error === "string" &&
          parsed.error.trim()
        ) {
          const authError = new Error("Remote signer requires additional authentication.");
          authError.code = "auth-challenge";
          authError.authUrl = parsed.error.trim();
          pending.reject(authError);
          return;
        }

        if (typeof parsed.error === "string" && parsed.error.trim()) {
          const err = new Error(parsed.error.trim());
          err.code = "nip46-error";
          pending.reject(err);
          return;
        }

        pending.resolve(parsed.result ?? null);
      })
      .catch((error) => {
        devLogger.warn("[nostr] Failed to decrypt remote signer payload:", error);
      });
  }

  rejectAllPending(error) {
    if (this.pendingRequests.size) {
      devLogger.warn("[nostr] Rejecting pending remote signer RPC requests", {
        count: this.pendingRequests.size,
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        error: error?.message || String(error),
      });
    }
    this.requestQueue.clear(error);
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        pending.reject(error);
      } catch (rejectError) {
        devLogger.warn("[nostr] Pending NIP-46 promise reject failed for", id, rejectError);
      }
    }
    this.pendingRequests.clear();
  }

  /**
   * Sends an RPC command to the remote signer and awaits the response.
   * Handles encryption, signing, publishing, and timeouts.
   *
   * @param {string} method - The RPC method name (e.g., "connect", "sign_event").
   * @param {Array} [params=[]] - The parameters for the method.
   * @param {object} [options={}] - Options for this specific call.
   * @param {number} [options.timeoutMs] - Timeout in milliseconds.
   * @param {number} [options.priority] - Priority level (High/Normal/Low).
   * @param {number} [options.retries] - Number of retry attempts.
   * @returns {Promise<any>} The result from the remote signer.
   */
  async sendRpc(method, params = [], options = {}) {
    if (this.destroyed) {
      throw new Error("Remote signer session has been disposed.");
    }

    const priority = Number.isFinite(options.priority)
      ? options.priority
      : NIP46_PRIORITY.NORMAL;

    return this.requestQueue.enqueue(async () => {
      const timeoutMs =
        Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
          ? options.timeoutMs
          : NIP46_RESPONSE_TIMEOUT_MS;
      const retries =
        Number.isFinite(options.retries) && options.retries >= 0
          ? options.retries
          : NIP46_MAX_RETRIES;

      let lastError = null;

      devLogger.debug("[nostr] Remote signer RPC start", {
        method,
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        timeoutMs,
        retries,
        params: summarizeRpcParamsForLog(method, params),
        priority,
      });

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        await this.ensureSubscription();

        const requestId = createNip46RequestId();
        const message = {
          id: requestId,
          method,
          params: Array.isArray(params) ? params : [],
        };

        devLogger.debug("[nostr] Remote signer RPC attempt prepared", {
          method,
          attempt: attempt + 1,
          requestId,
          remotePubkey: summarizeHexForLog(this.remotePubkey),
        });

        let event;
        try {
          const content = await this.encryptPayload(message, {
            method,
            requestId,
          });
          if (!this.signEventWithKey) {
            throw new Error("Remote signer signing helper is unavailable.");
          }
          event = this.signEventWithKey(
            {
              kind: NIP46_RPC_KIND,
              pubkey: this.clientPublicKey,
              created_at: Math.floor(Date.now() / 1000),
              tags: [["p", this.remotePubkey]],
              content,
            },
            this.clientPrivateKey,
          );
          devLogger.debug("[nostr] Remote signer RPC event signed", {
            method,
            attempt: attempt + 1,
            requestId,
            relayCount: this.relays.length,
            contentLength:
              typeof event.content === "string" ? event.content.length : 0,
          });
        } catch (error) {
          lastError = error;
          devLogger.warn("[nostr] Remote signer RPC encryption failed", {
            method,
            attempt: attempt + 1,
            requestId,
            error: error?.message || String(error),
          });
          break;
        }

        const responsePromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            const timeoutError = new Error(
              `Timed out waiting for remote signer response to ${method}.`,
            );
            timeoutError.code = "nip46-timeout";
            devLogger.warn("[nostr] Remote signer RPC timed out", {
              method,
              requestId,
              attempt: attempt + 1,
              timeoutMs,
            });
            reject(timeoutError);
          }, timeoutMs);

          this.pendingRequests.set(requestId, {
            resolve,
            reject,
            timeoutId,
            method,
          });
          devLogger.debug("[nostr] Remote signer RPC awaiting response", {
            method,
            requestId,
            attempt: attempt + 1,
          });
        });

        try {
          const publishResults = await this.publishEventToRelays(
            await this.ensurePool(),
            this.relays,
            event,
            { timeoutMs: NIP46_PUBLISH_TIMEOUT_MS },
          );
          this.assertAnyRelayAccepted(publishResults, { context: method });
          devLogger.debug("[nostr] Remote signer RPC published", {
            method,
            requestId,
            attempt: attempt + 1,
            publishResults: summarizeRelayPublishResultsForLog(publishResults),
          });
        } catch (error) {
          const pending = this.pendingRequests.get(requestId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingRequests.delete(requestId);
          }
          lastError = error;

          const isRateLimited =
            error &&
            (error.message?.includes("rate-limited") ||
              error.message?.includes("noting too much"));

          if (isRateLimited) {
            devLogger.warn(
              "[nostr] Remote signer RPC rate limited, backing off",
              {
                method,
                requestId,
                attempt: attempt + 1,
                error: error?.message || String(error),
              },
            );
            // Exponential backoff: 2s, 4s, 8s...
            const backoffMs = 2000 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, backoffMs));
          } else {
            devLogger.warn("[nostr] Remote signer RPC publish failed", {
              method,
              requestId,
              attempt: attempt + 1,
              error: error?.message || String(error),
            });
          }
          continue;
        }

        try {
          const result = await responsePromise;
          devLogger.debug("[nostr] Remote signer RPC response received", {
            method,
            requestId,
            attempt: attempt + 1,
            resultSummary: summarizeRpcResultForLog(method, result),
          });
          return result;
        } catch (error) {
          lastError = error;
          devLogger.warn("[nostr] Remote signer RPC attempt rejected", {
            method,
            requestId,
            attempt: attempt + 1,
            error: error?.message || String(error),
          });
          if (error?.code === "auth-challenge") {
            throw error;
          }
        }
      }

      if (lastError) {
        devLogger.warn("[nostr] Remote signer RPC exhausted", {
          method,
          remotePubkey: summarizeHexForLog(this.remotePubkey),
          error: lastError?.message || String(lastError),
        });
        throw lastError;
      }

      devLogger.warn(
        "[nostr] Remote signer RPC failed without explicit error",
        {
          method,
          remotePubkey: summarizeHexForLog(this.remotePubkey),
        },
      );
      throw new Error(`Remote signer request for ${method} failed.`);
    }, priority);
  }

  /**
   * Initiates the connection handshake ("connect" method).
   * Verifies that the remote signer acknowledges the shared secret (if one exists).
   *
   * @param {object} [opts]
   * @param {string} [opts.permissions] - Override permissions to request.
   * @returns {Promise<string>} The response result (usually "ack").
   */
  async connect({ permissions } = {}) {
    const params = [this.remotePubkey];
    const requestedPermissions = permissions || this.permissions || "";

    if (this.secret || requestedPermissions) {
      params.push(this.secret || "");
    }
    if (requestedPermissions) {
      params.push(requestedPermissions);
    }

    const result = await this.sendRpc("connect", params, {
      timeoutMs: Math.max(NIP46_RESPONSE_TIMEOUT_MS, 12_000),
      retries: 0,
      priority: NIP46_PRIORITY.HIGH,
    });

    if (this.secret) {
      const normalizedResult = typeof result === "string" ? result.trim() : "";
      if (
        !normalizedResult ||
        (normalizedResult !== this.secret && normalizedResult.toLowerCase() !== "ack")
      ) {
        const error = new Error("Remote signer secret mismatch. Rejecting connection.");
        error.code = "nip46-secret-mismatch";
        throw error;
      }
    }

    devLogger.debug("[nostr] Remote signer connect RPC acknowledged", {
      remotePubkey: summarizeHexForLog(this.remotePubkey),
      secretConfirmed: Boolean(this.secret),
      resultSummary: summarizeRpcResultForLog("connect", result),
    });
    return result;
  }

  async getUserPubkey() {
    const result = await this.sendRpc("get_public_key", [], {
      timeoutMs: NIP46_RESPONSE_TIMEOUT_MS,
      retries: 0,
      priority: NIP46_PRIORITY.HIGH,
    });
    const pubkey = typeof result === "string" ? result.trim() : "";
    if (!pubkey) {
      const error = new Error("Remote signer did not return a public key.");
      error.code = "nip46-empty-pubkey";
      throw error;
    }
    this.userPubkey = normalizeNostrPubkey(pubkey);
    devLogger.debug("[nostr] Remote signer get_public_key resolved", {
      remotePubkey: summarizeHexForLog(this.remotePubkey),
      userPubkey: summarizeHexForLog(this.userPubkey),
    });
    return this.userPubkey;
  }

  async ping() {
    try {
      const result = await this.sendRpc("ping", [], {
        timeoutMs: 5000,
        retries: 0,
        priority: NIP46_PRIORITY.HIGH,
      });
      const ok = typeof result === "string" && result.trim().toLowerCase() === "pong";
      devLogger.debug("[nostr] Remote signer ping result", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        ok,
        summary: summarizeRpcResultForLog("ping", result),
      });
      return ok;
    } catch (error) {
      devLogger.warn("[nostr] Remote signer ping failed", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        error: error?.message || String(error),
      });
      return false;
    }
  }

  /**
   * Requests the remote signer to sign a Nostr event.
   *
   * @param {object} event - The raw event object (unsigned).
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - Custom timeout.
   * @returns {Promise<object>} The fully signed event object.
   */
  async signEvent(event, options = {}) {
    if (!event || typeof event !== "object") {
      throw new Error("A Nostr event is required for remote signing.");
    }

    const unsigned = {
      kind: event.kind,
      created_at: event.created_at,
      content: typeof event.content === "string" ? event.content : "",
      tags: Array.isArray(event.tags)
        ? event.tags.map((tag) => (Array.isArray(tag) ? [...tag] : tag))
        : [],
      pubkey:
        typeof event.pubkey === "string" && event.pubkey.trim()
          ? event.pubkey.trim()
          : this.userPubkey,
    };

    const result = await this.sendRpc(
      "sign_event",
      [JSON.stringify(unsigned)],
      {
        timeoutMs: Number.isFinite(options.timeoutMs)
          ? options.timeoutMs
          : NIP46_SIGN_EVENT_TIMEOUT_MS,
        retries: Number.isFinite(options.retries) ? options.retries : NIP46_MAX_RETRIES,
        priority: NIP46_PRIORITY.HIGH,
      },
    );

    if (!result) {
      const error = new Error("Remote signer returned an empty response.");
      error.code = "nip46-empty-response";
      throw error;
    }

    if (typeof result === "object") {
      devLogger.debug("[nostr] Remote signer sign_event returned object", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        keys: Object.keys(result).slice(0, 6),
      });
      return result;
    }

    try {
      const parsed = JSON.parse(result);
      devLogger.debug("[nostr] Remote signer sign_event returned JSON", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        keys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 6) : [],
      });
      return parsed;
    } catch (error) {
      const failure = new Error("Remote signer returned malformed signed event.");
      failure.code = "nip46-invalid-response";
      failure.cause = error;
      devLogger.warn("[nostr] Remote signer sign_event parse failed", {
        remotePubkey: summarizeHexForLog(this.remotePubkey),
        error: error?.message || String(error),
      });
      throw failure;
    }
  }

  async nip04Encrypt(pubkey, plaintext, options = {}) {
    if (!pubkey || !plaintext) {
      throw new Error("Pubkey and plaintext are required for NIP-04 encryption.");
    }
    const priority =
      Number.isFinite(options?.priority)
        ? options.priority
        : NIP46_PRIORITY.LOW;
    const result = await this.sendRpc("nip04_encrypt", [pubkey, plaintext], {
      priority,
    });
    if (typeof result !== "string") {
      throw new Error("Remote signer returned invalid NIP-04 ciphertext.");
    }
    return result;
  }

  async nip04Decrypt(pubkey, ciphertext, options = {}) {
    if (!pubkey || !ciphertext) {
      throw new Error("Pubkey and ciphertext are required for NIP-04 decryption.");
    }
    const priority =
      Number.isFinite(options?.priority)
        ? options.priority
        : NIP46_PRIORITY.LOW;
    const result = await this.sendRpc("nip04_decrypt", [pubkey, ciphertext], {
      priority,
    });
    if (typeof result !== "string") {
      throw new Error("Remote signer returned invalid NIP-04 plaintext.");
    }
    return result;
  }

  async nip44Encrypt(pubkey, plaintext, options = {}) {
    if (!pubkey || !plaintext) {
      throw new Error("Pubkey and plaintext are required for NIP-44 encryption.");
    }
    const priority =
      Number.isFinite(options?.priority)
        ? options.priority
        : NIP46_PRIORITY.LOW;
    const result = await this.sendRpc("nip44_encrypt", [pubkey, plaintext], {
      priority,
    });
    if (typeof result !== "string") {
      throw new Error("Remote signer returned invalid NIP-44 ciphertext.");
    }
    return result;
  }

  async nip44Decrypt(pubkey, ciphertext, options = {}) {
    if (!pubkey || !ciphertext) {
      throw new Error("Pubkey and ciphertext are required for NIP-44 decryption.");
    }
    const priority =
      Number.isFinite(options?.priority)
        ? options.priority
        : NIP46_PRIORITY.LOW;
    const result = await this.sendRpc("nip44_decrypt", [pubkey, ciphertext], {
      priority,
    });
    if (typeof result !== "string") {
      throw new Error("Remote signer returned invalid NIP-44 plaintext.");
    }
    return result;
  }

  getActiveSigner() {
    if (!this.userPubkey) {
      return null;
    }

    if (!this.activeSignerCache) {
      this.activeSignerCache = {
        type: "nip46",
        pubkey: this.userPubkey,
        signEvent: (event) => this.signEvent(event),
        nip04: {
          encrypt: (pubkey, plaintext, options) =>
            this.nip04Encrypt(pubkey, plaintext, options),
          decrypt: (pubkey, ciphertext, options) =>
            this.nip04Decrypt(pubkey, ciphertext, options),
        },
        nip44: {
          encrypt: (pubkey, plaintext, options) =>
            this.nip44Encrypt(pubkey, plaintext, options),
          decrypt: (pubkey, ciphertext, options) =>
            this.nip44Decrypt(pubkey, ciphertext, options),
        },
        nip04Encrypt: (pubkey, plaintext, options) =>
          this.nip04Encrypt(pubkey, plaintext, options),
        nip04Decrypt: (pubkey, ciphertext, options) =>
          this.nip04Decrypt(pubkey, ciphertext, options),
        nip44Encrypt: (pubkey, plaintext, options) =>
          this.nip44Encrypt(pubkey, plaintext, options),
        nip44Decrypt: (pubkey, ciphertext, options) =>
          this.nip44Decrypt(pubkey, ciphertext, options),
      };
    }

    return this.activeSignerCache;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    devLogger.debug("[nostr] Destroying remote signer client", {
      remotePubkey: summarizeHexForLog(this.remotePubkey),
      pendingRequests: this.pendingRequests.size,
      hasSubscription: Boolean(this.subscription),
    });

    if (this.subscription && typeof this.subscription.unsub === "function") {
      try {
        this.subscription.unsub();
      } catch (error) {
        devLogger.warn("[nostr] Failed to unsubscribe remote signer session:", error);
      }
    }
    this.subscription = null;

    if (this.requestQueue) {
      this.requestQueue.clear();
    }
    this.rejectAllPending(new Error("Remote signer session closed."));
  }
}
