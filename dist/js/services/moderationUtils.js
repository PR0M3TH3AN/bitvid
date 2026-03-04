import logger from "../utils/logger.js";

/**
 * Trust threshold for disabling autoplay on reported videos.
 * If >= 1 trusted user reports content, autoplay is disabled.
 */
export const AUTOPLAY_TRUST_THRESHOLD = 1;

/**
 * Trust threshold for blurring content.
 * If >= 1 trusted user reports content, it is blurred.
 */
export const BLUR_TRUST_THRESHOLD = 1;

/**
 * Time window for considering trusted mute list entries valid.
 * Mutes older than 60 days are ignored to prevent stale lists from affecting scores.
 */
export const TRUSTED_MUTE_WINDOW_DAYS = 60;
export const TRUSTED_MUTE_WINDOW_SECONDS = TRUSTED_MUTE_WINDOW_DAYS * 24 * 60 * 60;

export function normalizeUserLogger(candidate) {
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.info === "function"
  ) {
    return candidate;
  }
  return logger.user;
}

export class SimpleEventEmitter {
  constructor(logHandler = null) {
    this.listeners = new Map();
    this.logHandler = typeof logHandler === "function" ? logHandler : null;
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
        if (this.logHandler) {
          try {
            this.logHandler(`moderationService listener for "${eventName}" threw`, error);
          } catch (logError) {
            logger.user.warn("[moderationService] listener logger threw", logError);
          }
        }
      }
    }
  }
}

export function normalizeLogger(candidate) {
  if (typeof candidate === "function") {
    return candidate;
  }
  if (candidate && typeof candidate.log === "function") {
    return (...args) => candidate.log(...args);
  }
  if (
    candidate &&
    typeof candidate.dev === "object" &&
    typeof candidate.dev.log === "function"
  ) {
    return (...args) => candidate.dev.log(...args);
  }
  return () => {};
}

export function normalizeHex(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed && /^[0-9a-f]{40,64}$/i.test(trimmed) ? trimmed : "";
}

export function normalizeEventId(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed && /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed : "";
}

export function normalizeReportType(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : "";
}

export function isRelayHint(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("wss://") ||
    trimmed.startsWith("ws://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  );
}

export function normalizeMuteCategory(value) {
  return normalizeReportType(value);
}

export function extractMuteCategoryFromTag(tag) {
  if (!Array.isArray(tag)) {
    return "";
  }

  const direct = normalizeMuteCategory(tag[3]);
  if (direct) {
    return direct;
  }

  const fallback = typeof tag[2] === "string" && !isRelayHint(tag[2])
    ? normalizeMuteCategory(tag[2])
    : "";
  return fallback;
}

export function cloneSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return { eventId: "", totalTrusted: 0, types: {}, updatedAt: 0 };
  }
  const types = summary.types && typeof summary.types === "object" ? summary.types : {};
  const clonedTypes = {};
  for (const [key, value] of Object.entries(types)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    clonedTypes[key] = {
      trusted: Number.isFinite(value.trusted) ? value.trusted : 0,
      total: Number.isFinite(value.total) ? value.total : 0,
      latest: Number.isFinite(value.latest) ? value.latest : 0,
    };
  }
  return {
    eventId: typeof summary.eventId === "string" ? summary.eventId : "",
    totalTrusted: Number.isFinite(summary.totalTrusted) ? summary.totalTrusted : 0,
    types: clonedTypes,
    updatedAt: Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0,
  };
}

export function getNostrTools() {
  if (typeof window !== "undefined" && window?.NostrTools) {
    return window.NostrTools;
  }
  if (typeof globalThis !== "undefined" && globalThis?.NostrTools) {
    return globalThis.NostrTools;
  }
  return null;
}

export function bytesToHex(bytes) {
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

/**
 * @internal
 * Internal implementation of bech32 encoding/decoding.
 * This ensures the service can normalize `npub` inputs even if the global
 * `NostrTools` object is unavailable or version-mismatched.
 */
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CHARSET_MAP = (() => {
  const map = new Map();
  for (let index = 0; index < BECH32_CHARSET.length; index += 1) {
    map.set(BECH32_CHARSET[index], index);
  }
  return map;
})();

/** @internal */
export function bech32Polymod(values) {
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

export function bech32HrpExpand(hrp) {
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

export function bech32VerifyChecksum(hrp, data) {
  return bech32Polymod(bech32HrpExpand(hrp).concat(data)) === 1;
}

export function bech32Decode(value) {
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

export function convertBits(data, fromBits, toBits, pad = true) {
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

export function fallbackDecodeNpubToHex(value) {
  const decoded = bech32Decode(value);
  if (!decoded || decoded.hrp !== "npub") {
    return "";
  }

  const bytes = convertBits(decoded.words, 5, 8, false);
  if (!bytes || !bytes.length) {
    return "";
  }

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function decodeToHex(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const tools = getNostrTools();
    const decoder = tools?.nip19?.decode;
    if (typeof decoder === "function") {
      const decoded = decoder(trimmed);
      if (!decoded || decoded.type !== "npub") {
        return fallbackDecodeNpubToHex(trimmed);
      }
      const data = decoded.data;
      if (typeof data === "string") {
        const normalized = normalizeHex(data);
        return normalized || fallbackDecodeNpubToHex(trimmed);
      }
      return bytesToHex(data);
    }
    return fallbackDecodeNpubToHex(trimmed);
  } catch (error) {
    return fallbackDecodeNpubToHex(trimmed);
  }
}

export function encodeToNpub(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return "";
  }
  try {
    const tools = getNostrTools();
    const encoder = tools?.nip19?.npubEncode;
    if (typeof encoder !== "function") {
      return "";
    }
    return encoder(normalized) || "";
  } catch (error) {
    return "";
  }
}

export function normalizeToHex(candidate) {
  const direct = normalizeHex(candidate);
  if (direct) {
    return direct;
  }
  return decodeToHex(candidate);
}

export function createEmptyAdminSnapshot() {
  return {
    whitelist: new Set(),
    whitelistHex: new Set(),
    blacklist: new Set(),
    blacklistHex: new Set(),
  };
}

export function resolveRelayList(client, { write = false } = {}) {
  if (!client) {
    return [];
  }
  const source = write ? client.writeRelays : client.relays;
  const fallback = client.relays;
  const raw = Array.isArray(source) && source.length ? source : fallback;
  if (!Array.isArray(raw)) {
    return [];
  }
  const urls = [];
  const seen = new Set();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    urls.push(trimmed);
  }
  return urls;
}

export function findReportedEventId(event) {
  if (!event || !Array.isArray(event.tags)) {
    return "";
  }
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    if (tag[0] !== "e") {
      continue;
    }
    const candidate = normalizeEventId(tag[1]);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

export function extractReportType(event, targetEventId = "") {
  if (!event || !Array.isArray(event.tags)) {
    return "";
  }

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const [marker, value] = tag;
    if (marker === "report" || marker === "type") {
      const normalized = normalizeReportType(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  if (targetEventId) {
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag[0] !== "e") {
        continue;
      }
      if (normalizeEventId(tag[1]) !== targetEventId) {
        continue;
      }
      const typeCandidate = normalizeReportType(tag[2] || "");
      if (typeCandidate) {
        return typeCandidate;
      }
    }
  }

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag[0] !== "t") {
      continue;
    }
    const normalized = normalizeReportType(tag[1] || "");
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function ensureNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveStorage() {
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
