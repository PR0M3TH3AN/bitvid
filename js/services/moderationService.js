import {
  getActiveSigner,
  nostrClient,
  requestDefaultExtensionPermissions,
} from "../nostrClientFacade.js";
import { publishEventToRelays, assertAnyRelayAccepted } from "../nostrPublish.js";
import { accessControl } from "../accessControl.js";
import { userBlocks, USER_BLOCK_EVENTS } from "../userBlocks.js";
import logger from "../utils/logger.js";

const AUTOPLAY_TRUST_THRESHOLD = 1;
const BLUR_TRUST_THRESHOLD = 1;
const TRUSTED_MUTE_WINDOW_DAYS = 60;
const TRUSTED_MUTE_WINDOW_SECONDS = TRUSTED_MUTE_WINDOW_DAYS * 24 * 60 * 60;

function normalizeUserLogger(candidate) {
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.info === "function"
  ) {
    return candidate;
  }
  return logger.user;
}

class SimpleEventEmitter {
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

function normalizeLogger(candidate) {
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

function normalizeHex(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed && /^[0-9a-f]{40,64}$/i.test(trimmed) ? trimmed : "";
}

function normalizeEventId(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed && /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed : "";
}

function normalizeReportType(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : "";
}

function isRelayHint(value) {
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

function normalizeMuteCategory(value) {
  return normalizeReportType(value);
}

function extractMuteCategoryFromTag(tag) {
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

function cloneSummary(summary) {
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

function getNostrTools() {
  if (typeof window !== "undefined" && window?.NostrTools) {
    return window.NostrTools;
  }
  if (typeof globalThis !== "undefined" && globalThis?.NostrTools) {
    return globalThis.NostrTools;
  }
  return null;
}

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

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CHARSET_MAP = (() => {
  const map = new Map();
  for (let index = 0; index < BECH32_CHARSET.length; index += 1) {
    map.set(BECH32_CHARSET[index], index);
  }
  return map;
})();

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

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeToHex(candidate) {
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

function encodeToNpub(hex) {
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

function normalizeToHex(candidate) {
  const direct = normalizeHex(candidate);
  if (direct) {
    return direct;
  }
  return decodeToHex(candidate);
}

function createEmptyAdminSnapshot() {
  return {
    whitelist: new Set(),
    whitelistHex: new Set(),
    blacklist: new Set(),
    blacklistHex: new Set(),
  };
}

function resolveRelayList(client, { write = false } = {}) {
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

function findReportedEventId(event) {
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

function extractReportType(event, targetEventId = "") {
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

function ensureNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

export class ModerationService {
  constructor({
    nostrClient: client = null,
    logger: log = null,
    userBlocks: userBlockManager = null,
    accessControl: accessControlService = null,
    userLogger: userChannel = null,
  } = {}) {
    this.nostrClient = client;
    this.log = normalizeLogger(log);
    this.userLogger = normalizeUserLogger(userChannel);

    this.viewerPubkey = "";
    this.viewerIsSessionActor = false;
    this.trustedContacts = new Set();
    this.trustedSeedContacts = new Set();
    this.viewerContacts = new Set();
    this.userBlocks = null;
    this.accessControl = accessControlService;

    this.viewerMuteList = new Set();
    this.viewerMuteEventId = "";
    this.viewerMuteUpdatedAt = 0;
    this.viewerMutePromise = null;

    this.contactSubscription = null;
    this.contactListPromise = null;

    this.reportEvents = new Map();
    this.reportSummaries = new Map();
    this.activeSubscriptions = new Map();
    this.activeEventIds = new Set();

    this.trustedMuteLists = new Map();
    this.trustedMutedAuthors = new Map();
    this.trustedMuteSubscriptions = new Map();
    this.trustedSeedOnly = false;

    this.emitter = new SimpleEventEmitter((message, error) => {
      try {
        this.log(message, error);
      } catch (logError) {
        logger.user.warn("[moderationService] logger threw", logError);
      }
    });

    this.userBlockUnsubscribe = null;
    this.userBlockRefreshQueue = Promise.resolve();

    this.setUserBlocks(userBlockManager);
  }

  setUserLogger(channel) {
    this.userLogger = normalizeUserLogger(channel);
  }

  mergeSeedsIntoSet(base = null) {
    const merged = new Set();

    if (base instanceof Set || Array.isArray(base)) {
      for (const value of base) {
        const normalized = normalizeHex(value);
        if (normalized) {
          merged.add(normalized);
        }
      }
    } else if (base && typeof base[Symbol.iterator] === "function") {
      for (const value of base) {
        const normalized = normalizeHex(value);
        if (normalized) {
          merged.add(normalized);
        }
      }
    }

    if (this.trustedSeedContacts instanceof Set) {
      const adminSnapshot = this.getAdminListSnapshot();
      const blacklistHex = adminSnapshot.blacklistHex;
      for (const seed of this.trustedSeedContacts) {
        const normalized = normalizeHex(seed);
        if (normalized && (!blacklistHex || !blacklistHex.has(normalized))) {
          merged.add(normalized);
        }
      }
    }

    return merged;
  }

  computeTrustedSeedOnly() {
    const trustedContacts =
      this.trustedContacts instanceof Set ? this.trustedContacts : new Set();
    const trustedSeedContacts =
      this.trustedSeedContacts instanceof Set ? this.trustedSeedContacts : new Set();

    if (!trustedSeedContacts.size || trustedContacts.size !== trustedSeedContacts.size) {
      return false;
    }

    for (const value of trustedContacts) {
      if (!trustedSeedContacts.has(value)) {
        return false;
      }
    }

    return true;
  }

  updateTrustedSeedOnlyStatus() {
    const nextValue = this.computeTrustedSeedOnly();
    if (nextValue === this.trustedSeedOnly) {
      return;
    }

    this.trustedSeedOnly = nextValue;
    this.emit("trusted-seed-only", { seedOnly: nextValue });
  }

  rebuildTrustedContacts(nextContacts = new Set(), { previous = null } = {}) {
    const sanitized = new Set();

    if (nextContacts instanceof Set || Array.isArray(nextContacts)) {
      for (const value of nextContacts) {
        const normalized = normalizeHex(value);
        if (normalized) {
          sanitized.add(normalized);
        }
      }
    } else if (nextContacts && typeof nextContacts[Symbol.iterator] === "function") {
      for (const value of nextContacts) {
        const normalized = normalizeHex(value);
        if (normalized) {
          sanitized.add(normalized);
        }
      }
    }

    this.viewerContacts = sanitized;

    const previousContacts =
      previous instanceof Set
        ? new Set(previous)
        : this.trustedContacts instanceof Set
        ? new Set(this.trustedContacts)
        : new Set();

    const seededNext = this.mergeSeedsIntoSet(sanitized);
    this.trustedContacts = seededNext;

    this.updateTrustedSeedOnlyStatus();
    this.emit("contacts", { size: seededNext.size });
    this.recomputeAllSummaries();
    this.reconcileTrustedMuteSubscriptions(previousContacts, seededNext);
  }

  getViewerContactsSnapshot({ includeViewer = false } = {}) {
    const contacts =
      this.viewerContacts instanceof Set ? this.viewerContacts : new Set();
    const viewer = normalizeHex(this.viewerPubkey);
    const list = [];

    for (const value of contacts) {
      const normalized = normalizeHex(value);
      if (!normalized) {
        continue;
      }
      if (!includeViewer && viewer && normalized === viewer) {
        continue;
      }
      list.push({
        pubkey: normalized,
        npub: encodeToNpub(normalized) || "",
      });
    }

    return list;
  }

  async ensureViewerContactsLoaded(pubkey = null) {
    const target = normalizeHex(pubkey);
    const viewer = normalizeHex(this.viewerPubkey);

    if (target && target !== viewer) {
      try {
        await this.setViewerPubkey(target);
      } catch (error) {
        this.log(
          "[moderationService] failed to set viewer pubkey while ensuring contacts",
          error,
        );
      }
      return this.getViewerContactsSnapshot();
    }

    if (this.contactListPromise) {
      try {
        await this.contactListPromise;
      } catch (error) {
        this.log(
          "[moderationService] contact hydration failed while ensuring contacts",
          error,
        );
      }
    } else if (viewer) {
      const hasContacts =
        this.viewerContacts instanceof Set && this.viewerContacts.size > 0;
      if (!hasContacts) {
        try {
          await this.fetchTrustedContacts(viewer);
        } catch (error) {
          this.log(
            "[moderationService] failed to fetch viewer contacts while ensuring contacts",
            error,
          );
        }
      }
    }

    return this.getViewerContactsSnapshot();
  }

  setTrustedSeeds(seeds = []) {
    this.log("[moderationService] setTrustedSeeds called", { count: seeds?.length || seeds?.size || 0 });
    const sanitizedSeeds = new Set();
    const adminSnapshot = this.getAdminListSnapshot();

    if (seeds instanceof Set || Array.isArray(seeds)) {
      for (const candidate of seeds) {
        const normalized = normalizeToHex(candidate);
        const status = this.getAccessControlStatus(candidate, adminSnapshot);
        if (normalized && !status.blacklisted) {
          sanitizedSeeds.add(normalized);
        }
      }
    } else if (seeds && typeof seeds[Symbol.iterator] === "function") {
      for (const candidate of seeds) {
        const normalized = normalizeToHex(candidate);
        const status = this.getAccessControlStatus(candidate, adminSnapshot);
        if (normalized && !status.blacklisted) {
          sanitizedSeeds.add(normalized);
        }
      }
    }

    const previousContacts =
      this.trustedContacts instanceof Set ? new Set(this.trustedContacts) : new Set();

    this.trustedSeedContacts = sanitizedSeeds;
    this.rebuildTrustedContacts(this.viewerContacts, { previous: previousContacts });
  }

  isTrustedSeedOnly() {
    return this.trustedSeedOnly === true;
  }

  logThresholdTransitions({
    eventId = "",
    reportType = "",
    previousTrusted = 0,
    nextTrusted = 0,
  } = {}) {
    const normalizedEventId = normalizeEventId(eventId);
    const normalizedType = normalizeReportType(reportType);
    if (!normalizedEventId || !normalizedType) {
      return;
    }

    const previous = Number.isFinite(previousTrusted) ? previousTrusted : 0;
    const next = Number.isFinite(nextTrusted) ? nextTrusted : 0;

    const transitions = [];

    if (AUTOPLAY_TRUST_THRESHOLD > 0) {
      const previousMet = previous >= AUTOPLAY_TRUST_THRESHOLD;
      const nextMet = next >= AUTOPLAY_TRUST_THRESHOLD;
      if (previousMet !== nextMet) {
        transitions.push({
          action: nextMet ? "autoplay-block-enabled" : "autoplay-block-cleared",
        });
      }
    }

    if (BLUR_TRUST_THRESHOLD > 0) {
      const previousMet = previous >= BLUR_TRUST_THRESHOLD;
      const nextMet = next >= BLUR_TRUST_THRESHOLD;
      if (previousMet !== nextMet) {
        transitions.push({
          action: nextMet ? "blur-enabled" : "blur-cleared",
        });
      }
    }

    if (!transitions.length) {
      return;
    }

    const channel = this.userLogger || logger.user;
    for (const entry of transitions) {
      try {
        channel.info("[moderationService] moderation threshold crossed", {
          eventId: normalizedEventId,
          reportType: normalizedType,
          trustedCount: next,
          action: entry.action,
        });
      } catch (error) {
        logger.user.warn("[moderationService] failed to log threshold transition", error);
      }
    }
  }

  getTrustedMuteWindowCutoff(nowSeconds = Date.now() / 1000) {
    const normalizedNow = ensureNumber(nowSeconds) || Date.now() / 1000;
    return normalizedNow - TRUSTED_MUTE_WINDOW_SECONDS;
  }

  pruneTrustedMuteAggregates(targetAuthors = null, { nowSeconds = Date.now() / 1000 } = {}) {
    const cutoff = this.getTrustedMuteWindowCutoff(nowSeconds);
    const targets =
      targetAuthors instanceof Set || Array.isArray(targetAuthors)
        ? Array.from(targetAuthors)
        : targetAuthors && typeof targetAuthors[Symbol.iterator] === "function"
        ? Array.from(targetAuthors)
        : null;

    const entries = targets
      ? targets.map((author) => [author, this.trustedMutedAuthors.get(author)])
      : Array.from(this.trustedMutedAuthors.entries());

    for (const [author, aggregate] of entries) {
      if (!aggregate || !(aggregate.muters instanceof Map)) {
        continue;
      }
      const expiredOwners = new Set();
      for (const [owner, updatedAt] of aggregate.muters.entries()) {
        if (ensureNumber(updatedAt) < cutoff) {
          aggregate.muters.delete(owner);
          expiredOwners.add(owner);
        }
      }
      if (aggregate.categories instanceof Map && expiredOwners.size) {
        for (const [category, muters] of aggregate.categories.entries()) {
          for (const owner of expiredOwners) {
            muters.delete(owner);
          }
          if (!muters.size) {
            aggregate.categories.delete(category);
          }
        }
      }
      aggregate.count = aggregate.muters.size;
      if (!aggregate.muters.size) {
        this.trustedMutedAuthors.delete(author);
      }
    }
  }

  getActiveTrustedMutersForAuthor(author) {
    const normalized = normalizeHex(author);
    if (!normalized) {
      return [];
    }

    const entry = this.trustedMutedAuthors.get(normalized);
    if (!entry || !(entry.muters instanceof Map)) {
      return [];
    }

    this.pruneTrustedMuteAggregates([normalized]);
    const refreshed = this.trustedMutedAuthors.get(normalized);
    if (!refreshed || !(refreshed.muters instanceof Map)) {
      return [];
    }

    return Array.from(refreshed.muters.keys());
  }

  getTrustedMuteCountsForAuthor(author) {
    const normalized = normalizeHex(author);
    if (!normalized) {
      return { total: 0, categories: {} };
    }

    const entry = this.trustedMutedAuthors.get(normalized);
    if (!entry || !(entry.muters instanceof Map)) {
      return { total: 0, categories: {} };
    }

    this.pruneTrustedMuteAggregates([normalized]);
    const refreshed = this.trustedMutedAuthors.get(normalized);
    if (!refreshed || !(refreshed.muters instanceof Map)) {
      return { total: 0, categories: {} };
    }

    const categories = {};
    if (refreshed.categories instanceof Map) {
      for (const [category, muters] of refreshed.categories.entries()) {
        if (typeof category !== "string" || !category.trim()) {
          continue;
        }
        categories[category] = muters instanceof Map ? muters.size : 0;
      }
    }

    return {
      total: refreshed.muters.size,
      categories,
    };
  }

  setLogger(newLogger) {
    this.log = normalizeLogger(newLogger);
  }

  setNostrClient(client) {
    if (client && client !== this.nostrClient) {
      this.nostrClient = client;
    }
  }

  setUserBlocks(manager) {
    if (manager === this.userBlocks) {
      return;
    }

    if (typeof this.userBlockUnsubscribe === "function") {
      try {
        this.userBlockUnsubscribe();
      } catch (error) {
        this.log("[moderationService] failed to teardown user block listener", error);
      }
    }

    this.userBlockUnsubscribe = null;
    this.userBlocks = manager || null;

    if (!this.userBlocks || typeof this.userBlocks.on !== "function") {
      return;
    }

    try {
      const unsubscribe = this.userBlocks.on(
        USER_BLOCK_EVENTS.CHANGE,
        (detail) => {
          this.queueUserBlockRefresh(detail);
        },
      );

      if (typeof unsubscribe === "function") {
        this.userBlockUnsubscribe = () => {
          try {
            unsubscribe();
          } catch (error) {
            this.log(
              "[moderationService] failed to remove user block listener",
              error,
            );
          }
        };
      }
    } catch (error) {
      this.log("[moderationService] failed to subscribe to user block events", error);
    }
  }

  setAccessControl(control) {
    if (control && control !== this.accessControl) {
      this.accessControl = control;
    }
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  emit(eventName, detail) {
    this.emitter.emit(eventName, detail);
  }

  queueUserBlockRefresh(detail = {}) {
    const previous = this.userBlockRefreshQueue || Promise.resolve();
    const action = typeof detail?.action === "string" ? detail.action : "";
    const targetPubkey = detail?.targetPubkey || detail?.pubkey || "";
    const normalizedTarget = normalizeHex(targetPubkey);

    const next = previous
      .catch(() => {})
      .then(async () => {
        this.recomputeAllSummaries();
        if (this.activeEventIds && this.activeEventIds.size) {
          await this.refreshActiveReportSubscriptions();
        }
        this.emit("user-blocks", {
          action,
          targetPubkey: normalizedTarget,
        });
      });

    this.userBlockRefreshQueue = next.catch((error) => {
      this.log("[moderationService] failed to refresh after user block update", error);
      throw error;
    });

    return this.userBlockRefreshQueue;
  }

  clearTrustedMuteTracking({ previousContacts = null } = {}) {
    void previousContacts;

    for (const [pubkey, entry] of this.trustedMuteSubscriptions.entries()) {
      if (entry && typeof entry.unsub === "function") {
        try {
          entry.unsub();
        } catch (error) {
          this.log(`(moderationService) failed to teardown mute subscription for ${pubkey}`, error);
        }
      }
    }

    this.trustedMuteSubscriptions.clear();

    for (const [author, aggregate] of this.trustedMutedAuthors.entries()) {
      if (aggregate && aggregate.muters instanceof Map) {
        aggregate.muters.clear();
      }
    }

    this.trustedMuteLists.clear();
    this.trustedMutedAuthors.clear();
    this.viewerMuteList.clear();
    this.viewerMuteEventId = "";
    this.viewerMuteUpdatedAt = 0;

    this.emit("trusted-mutes", { total: 0 });

    const emptyPrevious = new Set();
    this.rebuildTrustedContacts(new Set(), { previous: emptyPrevious });
  }

  isTrustedMuteOwner(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return false;
    }
    if (normalized === this.viewerPubkey) {
      return true;
    }
    return this.trustedContacts.has(normalized);
  }

  reconcileTrustedMuteSubscriptions(previousSet, nextSet) {
    const previous = previousSet instanceof Set ? new Set(previousSet) : new Set();
    const next = nextSet instanceof Set ? new Set(nextSet) : new Set();

    this.log("[moderationService] reconcileTrustedMuteSubscriptions", {
      previous: previous.size,
      next: next.size,
    });

    if (this.viewerPubkey) {
      if (this.trustedMuteSubscriptions.has(this.viewerPubkey)) {
        previous.add(this.viewerPubkey);
      }
      next.add(this.viewerPubkey);
    }

    for (const value of previous) {
      if (!next.has(value)) {
        this.teardownTrustedMuteSubscription(value);
      }
    }

    for (const value of next) {
      this.subscribeToTrustedMuteList(value).catch((error) => {
        this.log(
          `(moderationService) failed to subscribe to trusted mute list for ${value}`,
          error,
        );
      });
    }
  }

  async ensureUserBlocksLoaded(pubkey) {
    if (!this.userBlocks || typeof this.userBlocks.ensureLoaded !== "function") {
      return;
    }

    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return;
    }

    try {
      await this.userBlocks.ensureLoaded(normalized);
    } catch (error) {
      this.log("[moderationService] failed to load user block list", error);
    }
  }

  async subscribeToTrustedMuteList(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized || !this.isTrustedMuteOwner(normalized)) {
      return;
    }

    let record = this.trustedMuteSubscriptions.get(normalized);
    if (!record) {
      record = { unsub: null, promise: null };
      this.trustedMuteSubscriptions.set(normalized, record);
    } else if (record.promise) {
      try {
        await record.promise;
      } catch {
        /* noop */
      }
      return;
    } else if (typeof record.unsub === "function") {
      this.log(`[moderationService] already subscribed to ${normalized}`);
      return;
    }

    this.log(`[moderationService] subscribing to trusted mute list for ${normalized}`);

    record.promise = (async () => {
      try {
        await this.ensurePool();
      } catch (error) {
        this.log(
          `(moderationService) ensurePool failed while subscribing to trusted mute list for ${normalized}`,
          error,
        );
        return;
      }

      if (!this.isTrustedMuteOwner(normalized)) {
        return;
      }

      const relays = resolveRelayList(this.nostrClient);
      if (!relays.length) {
        this.log(`[moderationService] no relays available for ${normalized}`);
        return;
      }

      const filter = { kinds: [10000], authors: [normalized], limit: 1 };

      let events = [];
      try {
        events = await this.nostrClient.pool.list(relays, [filter]);
      } catch (error) {
        this.log(
          `(moderationService) failed to backfill trusted mute list for ${normalized}`,
          error,
        );
        events = [];
      }

      if (Array.isArray(events) && events.length) {
        let latest = null;
        for (const event of events) {
          if (!event || ensureNumber(event.created_at) <= 0) {
            continue;
          }
          if (!latest || ensureNumber(event.created_at) > ensureNumber(latest.created_at)) {
            latest = event;
          }
        }
        if (latest) {
          this.ingestTrustedMuteEvent(latest);
        }
      } else {
        this.replaceTrustedMuteList(normalized, new Set(), { createdAt: 0, eventId: "" });
      }

      if (!this.isTrustedMuteOwner(normalized)) {
        return;
      }

      try {
        const sub = this.nostrClient.pool.sub(relays, [filter]);
        sub.on("event", (event) => {
          this.ingestTrustedMuteEvent(event);
        });
        sub.on("eose", () => {});
        record.unsub = typeof sub.unsub === "function" ? () => sub.unsub() : null;
        this.log(`[moderationService] subscribed to trusted mute list for ${normalized}`);
      } catch (error) {
        this.log(
          `(moderationService) failed to subscribe to trusted mute list for ${normalized}`,
          error,
        );
      }
    })();

    try {
      await record.promise;
    } catch (error) {
      this.log("[moderationService] trusted mute subscription promise rejected", error);
    } finally {
      record.promise = null;
    }
  }

  teardownTrustedMuteSubscription(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return;
    }

    const record = this.trustedMuteSubscriptions.get(normalized);
    if (record && typeof record.unsub === "function") {
      try {
        record.unsub();
      } catch (error) {
        this.log("[moderationService] failed to teardown trusted mute subscription", error);
      }
    }
    this.trustedMuteSubscriptions.delete(normalized);
    this.replaceTrustedMuteList(normalized, new Set(), { createdAt: 0, eventId: "" });
  }

  replaceTrustedMuteList(ownerPubkey, mutedAuthors, { createdAt = 0, eventId = "" } = {}) {
    const owner = normalizeHex(ownerPubkey);
    if (!owner) {
      return;
    }

    const sanitizedAuthors = new Map();
    const addAuthor = (candidate, category = "") => {
      const normalized = normalizeToHex(candidate);
      if (!normalized) {
        return;
      }
      const normalizedCategory = normalizeMuteCategory(category);
      sanitizedAuthors.set(normalized, normalizedCategory);
    };

    if (mutedAuthors instanceof Map) {
      for (const [candidate, category] of mutedAuthors.entries()) {
        addAuthor(candidate, category);
      }
    } else if (mutedAuthors instanceof Set || Array.isArray(mutedAuthors)) {
      for (const candidate of mutedAuthors) {
        if (!candidate) {
          continue;
        }
        if (typeof candidate === "object") {
          addAuthor(candidate.pubkey || candidate.author, candidate.category || candidate.reason);
          continue;
        }
        addAuthor(candidate);
      }
    } else if (mutedAuthors && typeof mutedAuthors[Symbol.iterator] === "function") {
      for (const candidate of mutedAuthors) {
        if (!candidate) {
          continue;
        }
        if (typeof candidate === "object") {
          addAuthor(candidate.pubkey || candidate.author, candidate.category || candidate.reason);
          continue;
        }
        addAuthor(candidate);
      }
    }

    const touchedAuthors = new Set();
    const previous = this.trustedMuteLists.get(owner);
    if (previous && previous.authors instanceof Map) {
      for (const [author, category] of previous.authors.entries()) {
        const aggregate = this.trustedMutedAuthors.get(author);
        if (!aggregate || !(aggregate.muters instanceof Map)) {
          continue;
        }
        aggregate.muters.delete(owner);
        if (aggregate.categories instanceof Map) {
          if (category) {
            const categoryMuters = aggregate.categories.get(category);
            if (categoryMuters instanceof Map) {
              categoryMuters.delete(owner);
              if (!categoryMuters.size) {
                aggregate.categories.delete(category);
              }
            }
          } else {
            for (const [existingCategory, muters] of aggregate.categories.entries()) {
              muters.delete(owner);
              if (!muters.size) {
                aggregate.categories.delete(existingCategory);
              }
            }
          }
        }
        touchedAuthors.add(author);
      }
    }

    const normalizedEventId = normalizeEventId(eventId);
    const normalizedCreatedAt = ensureNumber(createdAt);

    if (owner === this.viewerPubkey) {
      this.viewerMuteList = new Set(sanitizedAuthors);
      this.viewerMuteEventId = normalizedEventId || "";
      this.viewerMuteUpdatedAt = normalizedCreatedAt;
    }

    if (!sanitizedAuthors.size) {
      this.trustedMuteLists.delete(owner);
    } else {
      this.trustedMuteLists.set(owner, {
        authors: sanitizedAuthors,
        updatedAt: normalizedCreatedAt,
        eventId: normalizedEventId,
      });

      for (const [author, category] of sanitizedAuthors.entries()) {
        let aggregate = this.trustedMutedAuthors.get(author);
        if (!aggregate) {
          aggregate = { muters: new Map(), categories: new Map(), count: 0 };
          this.trustedMutedAuthors.set(author, aggregate);
        }
        aggregate.muters.set(owner, normalizedCreatedAt);
        if (category) {
          let categoryMuters = aggregate.categories.get(category);
          if (!categoryMuters) {
            categoryMuters = new Map();
            aggregate.categories.set(category, categoryMuters);
          }
          categoryMuters.set(owner, normalizedCreatedAt);
        }
        touchedAuthors.add(author);
      }
    }

    this.pruneTrustedMuteAggregates(touchedAuthors);
    this.emit("trusted-mutes", { total: this.trustedMutedAuthors.size, owner });
  }

  applyTrustedMuteEvent(ownerPubkey, event) {
    const owner = normalizeHex(ownerPubkey);
    if (!owner || !this.isTrustedMuteOwner(owner)) {
      return;
    }

    if (!event || event.kind !== 10000) {
      this.replaceTrustedMuteList(owner, new Set(), { createdAt: 0, eventId: "" });
      return;
    }

    const createdAt = ensureNumber(event.created_at);
    const eventId = typeof event.id === "string" ? event.id : "";

    const existing = this.trustedMuteLists.get(owner);
    if (existing) {
      const existingEventId = typeof existing.eventId === "string" ? existing.eventId : "";
      if (existingEventId && normalizeEventId(existingEventId) === normalizeEventId(eventId)) {
        return;
      }
      if (ensureNumber(existing.updatedAt) > createdAt && normalizeEventId(eventId)) {
        return;
      }
    }

    const mutedAuthors = new Map();
    if (Array.isArray(event.tags)) {
      for (const tag of event.tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }
        if (tag[0] !== "p") {
          continue;
        }
        const normalized = normalizeToHex(tag[1]);
        if (normalized) {
          const category = extractMuteCategoryFromTag(tag);
          mutedAuthors.set(normalized, category);
        }
      }
    }

    this.replaceTrustedMuteList(owner, mutedAuthors, { createdAt, eventId });
  }

  ingestTrustedMuteEvent(event) {
    if (!event || event.kind !== 10000) {
      return;
    }

    const owner = normalizeHex(event.pubkey);
    if (!owner || !this.isTrustedMuteOwner(owner)) {
      return;
    }

    this.applyTrustedMuteEvent(owner, event);
  }

  getViewerMutedAuthors() {
    return Array.from(this.viewerMuteList);
  }

  isAuthorMutedByViewer(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return false;
    }
    return this.viewerMuteList.has(normalized);
  }

  loadLocalMutes(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return;
    }

    const storage = resolveStorage();
    if (!storage) {
      return;
    }

    const key = `bitvid:user-mutes:local:v1:${normalized}`;
    let loaded = [];

    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          loaded = parsed;
        }
      }
    } catch (error) {
      this.log(
        `[moderationService] failed to load local mutes for ${normalized}`,
        error,
      );
    }

    const mutes = new Set();
    for (const item of loaded) {
      const target = normalizeHex(item);
      if (target && target !== normalized) {
        mutes.add(target);
      }
    }

    this.replaceTrustedMuteList(normalized, mutes, {
      createdAt: Date.now() / 1000,
      eventId: `local-${Date.now()}`,
    });
  }

  saveLocalMutes(pubkey, muteSet) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return;
    }

    const storage = resolveStorage();
    if (!storage) {
      return;
    }

    const list = [];
    if (muteSet instanceof Set || Array.isArray(muteSet)) {
      for (const item of muteSet) {
        const target = normalizeHex(item);
        if (target && target !== normalized) {
          list.push(target);
        }
      }
    }

    const key = `bitvid:user-mutes:local:v1:${normalized}`;
    try {
      if (!list.length) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, JSON.stringify(list));
      }
    } catch (error) {
      this.log(
        `[moderationService] failed to save local mutes for ${normalized}`,
        error,
      );
    }
  }

  async ensureViewerMuteListLoaded(pubkey = this.viewerPubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      this.viewerMuteList.clear();
      this.viewerMuteEventId = "";
      this.viewerMuteUpdatedAt = 0;
      return;
    }

    if (this.trustedMuteLists.has(normalized)) {
      return;
    }

    if (this.viewerIsSessionActor && normalized === this.viewerPubkey) {
      this.loadLocalMutes(normalized);
      return;
    }

    if (this.viewerMutePromise) {
      try {
        await this.viewerMutePromise;
      } catch (_) {
        /* noop */
      }
      return;
    }

    this.viewerMutePromise = this.subscribeToTrustedMuteList(normalized)
      .catch((error) => {
        this.log("[moderationService] failed to load viewer mute list", error);
        throw error;
      })
      .finally(() => {
        this.viewerMutePromise = null;
      });

    try {
      await this.viewerMutePromise;
    } catch (_) {
      /* noop */
    }
  }

  async publishViewerMuteList({ owner, muted }) {
    const viewer = normalizeHex(owner || this.viewerPubkey);
    if (!viewer) {
      const error = new Error("viewer-not-logged-in");
      error.code = "viewer-not-logged-in";
      throw error;
    }

    if (this.viewerIsSessionActor && viewer === this.viewerPubkey) {
      this.saveLocalMutes(viewer, muted);
      this.replaceTrustedMuteList(viewer, muted, {
        createdAt: Date.now() / 1000,
        eventId: `local-${Date.now()}`,
      });
      return { ok: true, event: null, results: [] };
    }

    await this.ensurePool();

    let signer = getActiveSigner();
    if (!signer && typeof this.nostrClient?.ensureActiveSignerForPubkey === "function") {
      signer = await this.nostrClient.ensureActiveSignerForPubkey(viewer);
    }

    const canSign = typeof signer?.canSign === "function"
      ? signer.canSign()
      : typeof signer?.signEvent === "function";
    if (!canSign || typeof signer?.signEvent !== "function") {
      const error = new Error("nostr-extension-missing");
      error.code = "nostr-extension-missing";
      throw error;
    }

    if (signer?.type === "extension") {
      const permissionResult = await requestDefaultExtensionPermissions([
        "sign_event",
        "get_public_key",
      ]);
      if (!permissionResult?.ok) {
        const error = new Error("extension-permission-denied");
        error.code = "extension-permission-denied";
        error.details = permissionResult?.error || null;
        throw error;
      }
    }

    const tags = [];
    if (muted instanceof Set || Array.isArray(muted)) {
      for (const value of muted) {
        const normalized = normalizeHex(value);
        if (!normalized || normalized === viewer) {
          continue;
        }
        tags.push(["p", normalized]);
      }
    }

    const event = {
      kind: 10000,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: "",
      pubkey: viewer,
    };

    let signedEvent;
    try {
      signedEvent = await signer.signEvent(event);
    } catch (error) {
      const wrapped = new Error("signature-failed");
      wrapped.code = "signature-failed";
      wrapped.details = error;
      throw wrapped;
    }

    const relays = resolveRelayList(this.nostrClient, { write: true });
    if (!relays.length) {
      const error = new Error("no-relays-configured");
      error.code = "no-relays-configured";
      throw error;
    }

    let results = [];
    try {
      results = await publishEventToRelays(this.nostrClient.pool, relays, signedEvent);
      assertAnyRelayAccepted(results, { context: "mute list" });
    } catch (error) {
      const wrapped = new Error("mute-list-publish-failed");
      wrapped.code = "mute-list-publish-failed";
      wrapped.details = error;
      throw wrapped;
    }

    this.applyTrustedMuteEvent(viewer, signedEvent);
    return { ok: true, event: signedEvent, results };
  }

  async addAuthorToViewerMuteList(pubkey) {
    const viewer = normalizeHex(this.viewerPubkey);
    if (!viewer) {
      const error = new Error("viewer-not-logged-in");
      error.code = "viewer-not-logged-in";
      throw error;
    }

    const target = normalizeHex(pubkey);
    if (!target) {
      const error = new Error("invalid-target");
      error.code = "invalid-target";
      throw error;
    }

    if (target === viewer) {
      const error = new Error("self");
      error.code = "self";
      throw error;
    }

    await this.ensureViewerMuteListLoaded(viewer);

    if (this.viewerMuteList.has(target)) {
      return { ok: true, already: true };
    }

    const next = new Set(this.viewerMuteList);
    next.add(target);

    return this.publishViewerMuteList({ owner: viewer, muted: next });
  }

  async removeAuthorFromViewerMuteList(pubkey) {
    const viewer = normalizeHex(this.viewerPubkey);
    if (!viewer) {
      const error = new Error("viewer-not-logged-in");
      error.code = "viewer-not-logged-in";
      throw error;
    }

    const target = normalizeHex(pubkey);
    if (!target) {
      return { ok: true, already: true };
    }

    await this.ensureViewerMuteListLoaded(viewer);

    if (!this.viewerMuteList.has(target)) {
      return { ok: true, already: true };
    }

    const next = new Set(this.viewerMuteList);
    next.delete(target);

    return this.publishViewerMuteList({ owner: viewer, muted: next });
  }

  isAuthorMutedByTrusted(pubkey) {
    const muters = this.getActiveTrustedMutersForAuthor(pubkey);
    return muters.length > 0;
  }

  getTrustedMutersForAuthor(pubkey) {
    return this.getActiveTrustedMutersForAuthor(pubkey);
  }

  isPubkeyBlockedByViewer(pubkey) {
    if (!this.userBlocks || typeof this.userBlocks.isBlocked !== "function") {
      return false;
    }

    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return false;
    }

    try {
      return this.userBlocks.isBlocked(normalized) === true;
    } catch (error) {
      this.log("[moderationService] user block lookup failed", error);
      return false;
    }
  }

  getAdminListSnapshot() {
    const snapshot = createEmptyAdminSnapshot();

    if (!this.accessControl) {
      return snapshot;
    }

    let whitelist = [];
    let blacklist = [];

    if (typeof this.accessControl.getWhitelist === "function") {
      try {
        whitelist = this.accessControl.getWhitelist() || [];
      } catch (error) {
        this.log("[moderationService] accessControl.getWhitelist threw", error);
      }
    }

    if (typeof this.accessControl.getBlacklist === "function") {
      try {
        blacklist = this.accessControl.getBlacklist() || [];
      } catch (error) {
        this.log("[moderationService] accessControl.getBlacklist threw", error);
      }
    }

    for (const entry of whitelist) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      snapshot.whitelist.add(trimmed);
      const decoded = decodeToHex(trimmed);
      if (decoded) {
        snapshot.whitelistHex.add(decoded);
      }
    }

    for (const entry of blacklist) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      snapshot.blacklist.add(trimmed);
      const decoded = decodeToHex(trimmed);
      if (decoded) {
        snapshot.blacklistHex.add(decoded);
      }
    }

    return snapshot;
  }

  getAccessControlStatus(candidate, snapshot = null) {
    const resolvedSnapshot = snapshot && typeof snapshot === "object" ? snapshot : this.getAdminListSnapshot();
    const whitelist =
      resolvedSnapshot?.whitelist instanceof Set
        ? resolvedSnapshot.whitelist
        : new Set();
    const whitelistHex =
      resolvedSnapshot?.whitelistHex instanceof Set
        ? resolvedSnapshot.whitelistHex
        : new Set();
    const blacklist =
      resolvedSnapshot?.blacklist instanceof Set
        ? resolvedSnapshot.blacklist
        : new Set();
    const blacklistHex =
      resolvedSnapshot?.blacklistHex instanceof Set
        ? resolvedSnapshot.blacklistHex
        : new Set();

    const hex = normalizeToHex(candidate);
    const status = {
      hex,
      whitelisted: false,
      blacklisted: false,
      npub: "",
    };

    if (hex) {
      if (blacklistHex.has(hex)) {
        status.blacklisted = true;
        return status;
      }
      if (whitelistHex.has(hex)) {
        status.whitelisted = true;
        status.npub = encodeToNpub(hex) || "";
        return status;
      }
    }

    const encoded = hex ? encodeToNpub(hex) : "";
    if (encoded) {
      status.npub = encoded;
      if (blacklist.has(encoded)) {
        status.blacklisted = true;
        return status;
      }
      if (whitelist.has(encoded)) {
        status.whitelisted = true;
        return status;
      }
    }

    if (typeof candidate === "string" && !status.npub) {
      const trimmed = candidate.trim();
      if (trimmed && (blacklist.has(trimmed) || whitelist.has(trimmed))) {
        status.npub = trimmed;
        if (blacklist.has(trimmed)) {
          status.blacklisted = true;
        } else if (whitelist.has(trimmed)) {
          status.whitelisted = true;
        }
      }
    }

    return status;
  }

  async ensurePool() {
    if (!this.nostrClient || typeof this.nostrClient.ensurePool !== "function") {
      throw new Error("nostr-client-unavailable");
    }
    return this.nostrClient.ensurePool();
  }

  async refreshViewerFromClient() {
    const clientPubkey = normalizeHex(
      this.nostrClient?.pubkey || this.nostrClient?.sessionActor?.pubkey,
    );
    if (clientPubkey === this.viewerPubkey) {
      if (this.contactListPromise) {
        try {
          await this.contactListPromise;
        } catch (error) {
          this.log("[moderationService] contact hydration failed", error);
        }
      }
      return this.viewerPubkey;
    }
    return this.setViewerPubkey(clientPubkey);
  }

  async setViewerPubkey(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (normalized === this.viewerPubkey && this.contactListPromise) {
      try {
        await this.contactListPromise;
      } catch (error) {
        this.log("[moderationService] contact hydration failed", error);
      }
      await this.ensureUserBlocksLoaded(normalized);
      return this.viewerPubkey;
    }

    const previousContacts =
      this.trustedContacts instanceof Set ? new Set(this.trustedContacts) : new Set();

    this.viewerPubkey = normalized;

    const loggedInPubkey = normalizeHex(this.nostrClient?.pubkey);
    const sessionPubkey = normalizeHex(this.nostrClient?.sessionActor?.pubkey);

    this.viewerIsSessionActor =
      !!normalized && !loggedInPubkey && normalized === sessionPubkey;

    this.clearTrustedMuteTracking({ previousContacts });

    if (this.contactSubscription && typeof this.contactSubscription.unsub === "function") {
      try {
        this.contactSubscription.unsub();
      } catch (error) {
        this.log("[moderationService] failed to teardown contact subscription", error);
      }
    }
    this.contactSubscription = null;

    if (!normalized) {
      await this.ensureUserBlocksLoaded(normalized);
      return this.viewerPubkey;
    }

    this.contactListPromise = this.fetchTrustedContacts(normalized)
      .catch((error) => {
        this.log("[moderationService] failed to load contact list", error);
        return null;
      })
      .finally(() => {
        this.contactListPromise = null;
      });

    try {
      await this.contactListPromise;
    } catch (error) {
      this.log("[moderationService] contact promise rejected", error);
    }

    this.subscribeToContactList(normalized).catch((error) => {
      this.log("[moderationService] failed to subscribe to contact list", error);
    });

    await this.ensureUserBlocksLoaded(normalized);
    await this.ensureViewerMuteListLoaded(normalized);
    return this.viewerPubkey;
  }

  async fetchTrustedContacts(pubkey) {
    const normalized = normalizeHex(pubkey);
    const previousContacts =
      this.trustedContacts instanceof Set ? new Set(this.trustedContacts) : new Set();
    if (!normalized) {
      this.clearTrustedMuteTracking({ previousContacts });
      return;
    }

    try {
      await this.ensurePool();
    } catch (error) {
      this.log("[moderationService] ensurePool failed while fetching contacts", error);
      return;
    }

    const relays = resolveRelayList(this.nostrClient);
    if (!relays.length) {
      this.clearTrustedMuteTracking({ previousContacts });
      return;
    }

    const filter = { kinds: [3], authors: [normalized], limit: 1 };

    let events = [];
    try {
      events = await this.nostrClient.pool.list(relays, [filter]);
    } catch (error) {
      this.log("[moderationService] failed to list contact events", error);
      events = [];
    }

    if (!Array.isArray(events) || !events.length) {
      this.clearTrustedMuteTracking({ previousContacts });
      return;
    }

    let latest = events[0];
    for (const event of events) {
      if (!event || typeof event.created_at !== "number") {
        continue;
      }
      if (!latest || ensureNumber(event.created_at) > ensureNumber(latest.created_at)) {
        latest = event;
      }
    }

    this.applyContactEvent(latest, { previous: previousContacts });
  }

  applyContactEvent(event, { previous = null } = {}) {
    const previousContacts =
      previous instanceof Set
        ? new Set(previous)
        : this.trustedContacts instanceof Set
        ? new Set(this.trustedContacts)
        : new Set();

    if (!event || !Array.isArray(event.tags)) {
      this.clearTrustedMuteTracking({ previousContacts });
      return;
    }

    const nextSet = new Set();
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag[0] !== "p") {
        continue;
      }
      const candidate = normalizeHex(tag[1]);
      if (candidate) {
        nextSet.add(candidate);
      }
    }

    this.rebuildTrustedContacts(nextSet, { previous: previousContacts });
  }

  async subscribeToContactList(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return;
    }

    try {
      await this.ensurePool();
    } catch (error) {
      this.log("[moderationService] ensurePool failed while subscribing to contacts", error);
      return;
    }

    const relays = resolveRelayList(this.nostrClient);
    if (!relays.length) {
      return;
    }

    const filter = { kinds: [3], authors: [normalized], limit: 1 };

    try {
      const sub = this.nostrClient.pool.sub(relays, [filter]);
      sub.on("event", (event) => {
        this.applyContactEvent(event);
      });
      sub.on("eose", () => {});
      this.contactSubscription = {
        unsub: typeof sub.unsub === "function" ? () => sub.unsub() : null,
      };
    } catch (error) {
      this.log("[moderationService] failed to create contact subscription", error);
    }
  }

  async setActiveEventIds(ids = []) {
    const nextIds = new Set();
    if (Array.isArray(ids) || ids instanceof Set) {
      for (const value of ids) {
        const normalized = normalizeEventId(value);
        if (normalized) {
          nextIds.add(normalized);
        }
      }
    }

    for (const existing of Array.from(this.activeSubscriptions.keys())) {
      if (!nextIds.has(existing)) {
        this.teardownReportSubscription(existing);
      }
    }

    const tasks = [];
    for (const id of nextIds) {
      if (this.activeSubscriptions.has(id)) {
        const entry = this.activeSubscriptions.get(id);
        if (entry?.promise) {
          tasks.push(entry.promise.catch(() => {}));
        }
        continue;
      }
      const promise = this.subscribeToReports(id);
      tasks.push(promise.catch((error) => {
        this.log(`(moderationService) failed to subscribe to reports for ${id}`, error);
      }));
    }

    this.activeEventIds = nextIds;

    if (tasks.length) {
      await Promise.all(tasks);
    }
  }

  async refreshActiveReportSubscriptions() {
    if (!this.activeEventIds || !this.activeEventIds.size) {
      return;
    }

    const ids = Array.from(this.activeEventIds);
    for (const id of ids) {
      this.teardownReportSubscription(id);
    }

    await this.setActiveEventIds(ids);
  }

  teardownReportSubscription(eventId) {
    const normalized = normalizeEventId(eventId);
    const entry = this.activeSubscriptions.get(normalized);
    if (!entry) {
      return;
    }
    if (typeof entry.unsub === "function") {
      try {
        entry.unsub();
      } catch (error) {
        this.log("[moderationService] failed to unsubscribe from report stream", error);
      }
    }
    this.activeSubscriptions.delete(normalized);
  }

  async subscribeToReports(eventId) {
    const normalized = normalizeEventId(eventId);
    if (!normalized) {
      return;
    }

    const record = { unsub: null, promise: null };
    this.activeSubscriptions.set(normalized, record);

    record.promise = (async () => {
      await this.ensurePool();
      const relays = resolveRelayList(this.nostrClient);
      if (!relays.length) {
        return;
      }

      const filter = { kinds: [1984], "#e": [normalized], limit: 500 };

      let events = [];
      try {
        events = await this.nostrClient.pool.list(relays, [filter]);
      } catch (error) {
        this.log(`(moderationService) failed to backfill reports for ${normalized}`, error);
        events = [];
      }

      if (Array.isArray(events)) {
        for (const event of events) {
          this.ingestReportEvent(event);
        }
      }

      try {
        const sub = this.nostrClient.pool.sub(relays, [filter]);
        sub.on("event", (event) => {
          this.ingestReportEvent(event);
        });
        sub.on("eose", () => {});
        record.unsub = typeof sub.unsub === "function" ? () => sub.unsub() : null;
      } catch (error) {
        this.log(`(moderationService) failed to subscribe to reports for ${normalized}`, error);
      }
    })();

    try {
      await record.promise;
    } catch (error) {
      this.log("[moderationService] report subscription promise rejected", error);
    } finally {
      record.promise = null;
    }
  }

  ingestReportEvent(event) {
    if (!event || event.kind !== 1984) {
      return;
    }

    const reporter = normalizeHex(event.pubkey);
    if (!reporter) {
      return;
    }

    const targetEventId = findReportedEventId(event);
    const normalizedEventId = normalizeEventId(targetEventId);
    if (!normalizedEventId) {
      return;
    }

    const reportType = extractReportType(event, normalizedEventId);
    if (!reportType) {
      return;
    }

    let eventReports = this.reportEvents.get(normalizedEventId);
    if (!eventReports) {
      eventReports = new Map();
      this.reportEvents.set(normalizedEventId, eventReports);
    }

    let reporterEntry = eventReports.get(reporter);
    if (!reporterEntry) {
      reporterEntry = new Map();
      eventReports.set(reporter, reporterEntry);
    }

    const existing = reporterEntry.get(reportType);
    const createdAt = ensureNumber(event.created_at);

    if (!existing || createdAt >= ensureNumber(existing.created_at)) {
      reporterEntry.set(reportType, {
        created_at: createdAt,
        id: typeof event.id === "string" ? event.id : "",
      });
    }

    this.recomputeSummaryForEvent(normalizedEventId);
  }

  recomputeAllSummaries() {
    for (const eventId of this.reportEvents.keys()) {
      this.recomputeSummaryForEvent(eventId);
    }
  }

  recomputeSummaryForEvent(eventId) {
    const normalized = normalizeEventId(eventId);
    if (!normalized) {
      return;
    }

    const eventReports = this.reportEvents.get(normalized);
    if (!eventReports || !eventReports.size) {
      const previousSummary = this.reportSummaries.get(normalized);
      if (previousSummary && previousSummary.types) {
        for (const [type, detail] of Object.entries(previousSummary.types)) {
          if (!detail || typeof detail !== "object") {
            continue;
          }
          const previousTrusted = Number.isFinite(detail.trusted) ? detail.trusted : 0;
          if (previousTrusted > 0) {
            this.logThresholdTransitions({
              eventId: normalized,
              reportType: type,
              previousTrusted,
              nextTrusted: 0,
            });
          }
        }
      }
      this.reportSummaries.delete(normalized);
      this.emit("summary", { eventId: normalized, summary: null });
      return;
    }

    const previousSummary = this.reportSummaries.get(normalized);
    const typeStats = new Map();
    let totalTrusted = 0;
    const adminSnapshot = this.getAdminListSnapshot();

    for (const [reporter, typeMap] of eventReports.entries()) {
      const status = this.getAccessControlStatus(reporter, adminSnapshot);
      const reporterHex = status.hex || normalizeHex(reporter);
      if (!reporterHex) {
        continue;
      }

      if (this.isPubkeyBlockedByViewer(reporterHex)) {
        continue;
      }

      if (status.blacklisted) {
        continue;
      }

      const isTrustedReporter = status.whitelisted || this.trustedContacts.has(reporterHex);

      for (const [type, detail] of typeMap.entries()) {
        let stats = typeStats.get(type);
        if (!stats) {
          stats = { trusted: 0, total: 0, latest: 0 };
          typeStats.set(type, stats);
        }
        stats.total += 1;
        const createdAt = ensureNumber(detail?.created_at);
        if (createdAt > stats.latest) {
          stats.latest = createdAt;
        }
        if (isTrustedReporter) {
          stats.trusted += 1;
          totalTrusted += 1;
        }
      }
    }

    const types = {};
    for (const [type, stats] of typeStats.entries()) {
      types[type] = {
        trusted: stats.trusted,
        total: stats.total,
        latest: stats.latest,
      };
    }

    if (previousSummary && previousSummary.types) {
      const seen = new Set([
        ...Object.keys(previousSummary.types || {}),
        ...Object.keys(types),
      ]);
      for (const type of seen) {
        const previousEntry = previousSummary?.types?.[type];
        const nextEntry = types?.[type];
        const previousTrusted = Number.isFinite(previousEntry?.trusted)
          ? previousEntry.trusted
          : 0;
        const nextTrusted = Number.isFinite(nextEntry?.trusted)
          ? nextEntry.trusted
          : 0;
        if (previousTrusted !== nextTrusted) {
          this.logThresholdTransitions({
            eventId: normalized,
            reportType: type,
            previousTrusted,
            nextTrusted,
          });
        }
      }
    } else {
      for (const [type, stats] of Object.entries(types)) {
        const nextTrusted = Number.isFinite(stats?.trusted) ? stats.trusted : 0;
        if (nextTrusted > 0) {
          this.logThresholdTransitions({
            eventId: normalized,
            reportType: type,
            previousTrusted: 0,
            nextTrusted,
          });
        }
      }
    }

    const summary = {
      eventId: normalized,
      totalTrusted,
      types,
      updatedAt: Date.now(),
    };

    this.reportSummaries.set(normalized, summary);
    this.emit("summary", { eventId: normalized, summary: cloneSummary(summary) });
  }

  getTrustedReportSummary(eventId) {
    const normalized = normalizeEventId(eventId);
    if (!normalized) {
      return { eventId: "", totalTrusted: 0, types: {}, updatedAt: 0 };
    }
    const summary = this.reportSummaries.get(normalized);
    if (!summary) {
      return { eventId: normalized, totalTrusted: 0, types: {}, updatedAt: 0 };
    }
    return cloneSummary(summary);
  }

  getTrustedReporters(eventId, type) {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return [];
    }

    const eventReports = this.reportEvents.get(normalizedEventId);
    if (!eventReports || !eventReports.size) {
      return [];
    }

    const normalizedType = normalizeReportType(type);
    const results = [];

    const adminSnapshot = this.getAdminListSnapshot();

    for (const [reporter, typeMap] of eventReports.entries()) {
      const status = this.getAccessControlStatus(reporter, adminSnapshot);
      const reporterHex = status.hex || normalizeHex(reporter);
      if (!reporterHex) {
        continue;
      }

      if (this.isPubkeyBlockedByViewer(reporterHex)) {
        continue;
      }

      if (status.blacklisted) {
        continue;
      }

      const isTrustedReporter = status.whitelisted || this.trustedContacts.has(reporterHex);
      if (!isTrustedReporter) {
        continue;
      }

      if (normalizedType) {
        const detail = typeMap.get(normalizedType);
        if (!detail) {
          continue;
        }
        results.push({
          pubkey: reporterHex,
          latest: ensureNumber(detail?.created_at),
        });
        continue;
      }

      let latest = 0;
      for (const entry of typeMap.values()) {
        const candidate = ensureNumber(entry?.created_at);
        if (candidate > latest) {
          latest = candidate;
        }
      }
      results.push({ pubkey: reporterHex, latest });
    }

    if (!results.length) {
      return [];
    }

    results.sort((a, b) => ensureNumber(b.latest) - ensureNumber(a.latest));
    return results.map((entry) => ({
      pubkey: entry.pubkey,
      latest: ensureNumber(entry.latest),
    }));
  }

  trustedReportCount(eventId, type) {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return 0;
    }
    const summary = this.reportSummaries.get(normalizedEventId);
    if (!summary) {
      return 0;
    }
    const normalizedType = normalizeReportType(type);
    const entry = normalizedType ? summary.types[normalizedType] : null;
    if (!entry) {
      return 0;
    }
    return Number.isFinite(entry.trusted) ? entry.trusted : 0;
  }

  async submitReport({
    eventId,
    type,
    targetPubkey = "",
    relayHint = "",
    content = "",
  } = {}) {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      const error = new Error("invalid-event-id");
      error.code = "invalid-event-id";
      throw error;
    }

    const normalizedType = normalizeReportType(type);
    if (!normalizedType) {
      const error = new Error("invalid-type");
      error.code = "invalid-type";
      throw error;
    }

    const reporterPubkey = normalizeHex(
      this.nostrClient?.pubkey || this.nostrClient?.sessionActor?.pubkey,
    );

    if (!reporterPubkey) {
      const error = new Error("viewer-not-logged-in");
      error.code = "viewer-not-logged-in";
      throw error;
    }

    const normalizedTarget = normalizeHex(targetPubkey);
    if (!normalizedTarget) {
      const error = new Error("invalid-target-pubkey");
      error.code = "invalid-target-pubkey";
      throw error;
    }

    const signer = await this.nostrClient.ensureActiveSignerForPubkey(
      reporterPubkey,
    );
    if (!signer || typeof signer.signEvent !== "function") {
      const error = new Error("signer-unavailable");
      error.code = "signer-unavailable";
      throw error;
    }

    if (
      signer.type === "extension" &&
      typeof this.nostrClient?.ensureExtensionPermissions === "function"
    ) {
      const permissionResult = await this.nostrClient.ensureExtensionPermissions([
        "sign_event",
        "get_public_key",
      ]);
      if (!permissionResult?.ok) {
        const error = new Error("extension-permission-denied");
        error.code = "extension-permission-denied";
        error.details = permissionResult?.error || null;
        throw error;
      }
    }

    const sanitizedRelayHint =
      typeof relayHint === "string" ? relayHint.trim() : "";

    const eventTag = ["e", normalizedEventId, normalizedType];
    if (sanitizedRelayHint) {
      eventTag.push(sanitizedRelayHint);
    }

    const tags = [
      eventTag,
      ["p", normalizedTarget, normalizedType],
      ["t", normalizedType],
    ];

    const event = {
      kind: 1984,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: typeof content === "string" ? content : "",
      pubkey: reporterPubkey,
    };

    let signedEvent;
    try {
      signedEvent = await signer.signEvent(event);
    } catch (error) {
      const wrapped = new Error("signature-failed");
      wrapped.code = "signature-failed";
      wrapped.details = error;
      throw wrapped;
    }

    await this.ensurePool();
    const relays = resolveRelayList(this.nostrClient, { write: true });
    if (!relays.length) {
      const error = new Error("no-relays-configured");
      error.code = "no-relays-configured";
      throw error;
    }

    let results = [];
    try {
      results = await publishEventToRelays(this.nostrClient.pool, relays, signedEvent);
      assertAnyRelayAccepted(results, { context: "report" });
    } catch (error) {
      const wrapped = new Error("report-publish-failed");
      wrapped.code = "report-publish-failed";
      wrapped.details = error;
      throw wrapped;
    }

    this.ingestReportEvent(signedEvent);
    return { ok: true, event: signedEvent, results };
  }

  async awaitUserBlockRefresh() {
    if (!this.userBlockRefreshQueue) {
      return;
    }

    try {
      await this.userBlockRefreshQueue;
    } catch {
      /* already reported during queue */
    }
  }
}

const moderationService = new ModerationService({
  nostrClient,
  logger,
  userBlocks,
  accessControl,
});

export default moderationService;
