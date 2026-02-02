import {
  DEFAULT_RELAY_URLS,
  ensureNostrTools,
  resolveSimplePoolConstructor,
  shimLegacySimplePoolMethods,
} from "../nostr/toolkit.js";
import { sanitizeRelayList } from "../nostr/nip46Client.js";
import { publishEventToRelay } from "../nostrPublish.js";
import logger from "../utils/logger.js";

const DEFAULT_BACKOFF = {
  baseMs: 1000,
  maxMs: 30000,
  jitterRatio: 0.3,
};

const MAX_SEEN_EVENT_IDS = 5000;
const DM_RELAY_LIST_TIMEOUT_MS = 5000;
export const DM_RELAY_WARNING_FALLBACK = "dm-relays-fallback";

function normalizeRelayList(relays) {
  if (!Array.isArray(relays)) {
    return [];
  }

  return Array.from(
    new Set(
      relays
        .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function normalizePubkey(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function normalizeLogger(candidate) {
  if (
    candidate &&
    typeof candidate === "object" &&
    candidate.dev &&
    candidate.user
  ) {
    return candidate;
  }

  return logger;
}

function extractRelayHintsFromEvent(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  return sanitizeRelayList(
    tags
      .filter((tag) => Array.isArray(tag) && tag[0] === "relay")
      .map((tag) => (typeof tag[1] === "string" ? tag[1].trim() : "")),
  );
}

function withTimeout(promise, timeoutMs, errorCode) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("DM relay discovery timed out.");
      if (errorCode) {
        error.code = errorCode;
      }
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export async function resolveDmRelaySelection({
  pubkey,
  relayHints = [],
  discoveryRelays = [],
  fallbackRelays = [],
  pool = null,
  log = null,
} = {}) {
  const resolvedLogger = normalizeLogger(log || logger);
  const normalizedPubkey = normalizePubkey(pubkey);
  const hintedRelays = sanitizeRelayList(Array.isArray(relayHints) ? relayHints : []);

  if (hintedRelays.length) {
    return { relays: hintedRelays, source: "hints", warning: null };
  }

  const discoveryList = sanitizeRelayList(
    Array.isArray(discoveryRelays) ? discoveryRelays : [],
  );
  const candidateFallbackList = sanitizeRelayList(
    Array.isArray(fallbackRelays) && fallbackRelays.length
      ? fallbackRelays
      : discoveryRelays,
  );
  const defaultFallbackList = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
  const fallbackList =
    candidateFallbackList.length > 0 ? candidateFallbackList : defaultFallbackList;

  if (
    normalizedPubkey &&
    pool &&
    typeof pool.list === "function" &&
    discoveryList.length
  ) {
    try {
      const events = await withTimeout(
        pool.list(discoveryList, [
          { kinds: [10050], authors: [normalizedPubkey], limit: 1 },
        ]),
        DM_RELAY_LIST_TIMEOUT_MS,
        "dm-relay-discovery-timeout",
      );
      const sorted = Array.isArray(events)
        ? events
            .filter((entry) => entry && entry.pubkey === normalizedPubkey)
            .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0))
        : [];
      if (sorted.length) {
        const relays = extractRelayHintsFromEvent(sorted[0]);
        if (relays.length) {
          return { relays, source: "kind-10050", warning: null };
        }
      }
    } catch (error) {
      resolvedLogger.dev.warn("[dmNostrService] Failed to fetch DM relay hints.", error);
      if (fallbackList.length) {
        return {
          relays: fallbackList,
          source: "fallback",
          warning: DM_RELAY_WARNING_FALLBACK,
        };
      }
    }
  }

  if (fallbackList.length) {
    return {
      relays: fallbackList,
      source: "fallback",
      warning: DM_RELAY_WARNING_FALLBACK,
    };
  }

  return { relays: [], source: "none", warning: null };
}

function clampNumber(value, minimum, maximum) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function resolveBackoffConfig(custom = {}) {
  return {
    baseMs: clampNumber(custom.baseMs ?? DEFAULT_BACKOFF.baseMs, 250, 60000),
    maxMs: clampNumber(custom.maxMs ?? DEFAULT_BACKOFF.maxMs, 1000, 300000),
    jitterRatio: clampNumber(custom.jitterRatio ?? DEFAULT_BACKOFF.jitterRatio, 0, 1),
  };
}

function applyJitter(value, ratio) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return value;
  }
  const jitter = value * ratio;
  return Math.round(value + (Math.random() * jitter - jitter / 2));
}

class DmNostrService {
  constructor({
    relays = [],
    preferredRelays = [],
    backoff = {},
    log = null,
  } = {}) {
    this.relays = normalizeRelayList(relays);
    this.preferredRelays = normalizeRelayList(preferredRelays);
    this.pool = null;
    this.poolPromise = null;
    this.logger = normalizeLogger(log || logger);
    this.backoffConfig = resolveBackoffConfig(backoff);
    this.relayStates = new Map();
    this.relayWatermarks = new Map();
    this.relayTimers = new Map();
    this.seenEventIds = new Set();
    this.seenEventOrder = [];
    this.subscriptions = new Map();
    this.activeFilters = [];
    this.actorPubkey = "";
    this.handlers = {
      onEvent: null,
      onEose: null,
      onError: null,
    };
  }

  async ensurePool() {
    if (this.pool) {
      return this.pool;
    }

    if (this.poolPromise) {
      return this.poolPromise;
    }

    this.poolPromise = (async () => {
      const tools = await ensureNostrTools();
      const SimplePool = resolveSimplePoolConstructor(tools);
      if (typeof SimplePool !== "function") {
        throw new Error("nostr-tools SimplePool unavailable");
      }

      const pool = new SimplePool();
      shimLegacySimplePoolMethods(pool);
      this.pool = pool;
      this.poolPromise = null;
      return pool;
    })();

    try {
      return await this.poolPromise;
    } catch (error) {
      this.poolPromise = null;
      this.logger.user.warn("[dmNostrService] Failed to initialize pool.", error);
      throw error;
    }
  }

  getRelayStatus(relayUrl) {
    const relay = this.relayStates.get(relayUrl);
    return relay ? { ...relay } : null;
  }

  listRelayStatuses() {
    return Array.from(this.relayStates.entries()).map(([url, state]) => ({
      url,
      ...state,
    }));
  }

  async connect({ relays = null } = {}) {
    if (Array.isArray(relays)) {
      this.relays = normalizeRelayList(relays);
    }

    if (!this.relays.length) {
      this.logger.user.warn("[dmNostrService] No relays configured for DM service.");
      return;
    }

    await this.ensurePool();

    await Promise.all(
      this.relays.map(async (relayUrl) => {
        await this.connectRelay(relayUrl);
      }),
    );
  }

  async connectRelay(relayUrl) {
    if (!this.pool) {
      await this.ensurePool();
    }

    if (!relayUrl) {
      return;
    }

    const relayState = this.ensureRelayState(relayUrl);
    relayState.lastConnectAttempt = Date.now();

    if (typeof this.pool.ensureRelay === "function") {
      try {
        const relay = await this.pool.ensureRelay(relayUrl);
        relayState.connected = Boolean(relay);
        if (relay) {
          this.attachRelayListeners(relayUrl, relay);
          this.recordRelaySuccess(relayUrl);
        }
      } catch (error) {
        this.recordRelayFailure(relayUrl, error);
        this.scheduleReconnect(relayUrl, "connect-failed");
      }
    } else {
      relayState.connected = true;
      this.recordRelaySuccess(relayUrl);
    }
  }

  attachRelayListeners(relayUrl, relay) {
    if (!relay || typeof relay.on !== "function") {
      return;
    }

    try {
      relay.on("connect", () => {
        this.recordRelaySuccess(relayUrl);
      });
      relay.on("disconnect", () => {
        this.recordRelayFailure(relayUrl, new Error("relay-disconnect"));
        this.scheduleReconnect(relayUrl, "relay-disconnect");
      });
      relay.on("error", (error) => {
        this.recordRelayFailure(relayUrl, error);
        this.scheduleReconnect(relayUrl, "relay-error");
      });
    } catch (error) {
      this.logger.dev.warn("[dmNostrService] Failed to attach relay listeners.", error);
    }
  }

  ensureRelayState(relayUrl) {
    if (!this.relayStates.has(relayUrl)) {
      this.relayStates.set(relayUrl, {
        connected: false,
        okCount: 0,
        failCount: 0,
        lastOkAt: 0,
        lastFailAt: 0,
        lastConnectAttempt: 0,
        backoffMs: 0,
        attempts: 0,
      });
    }

    return this.relayStates.get(relayUrl);
  }

  recordRelaySuccess(relayUrl) {
    const relayState = this.ensureRelayState(relayUrl);
    relayState.connected = true;
    relayState.okCount += 1;
    relayState.lastOkAt = Date.now();
    relayState.backoffMs = 0;
    relayState.attempts = 0;
  }

  recordRelayFailure(relayUrl, error) {
    const relayState = this.ensureRelayState(relayUrl);
    relayState.connected = false;
    relayState.failCount += 1;
    relayState.lastFailAt = Date.now();

    this.logger.dev.warn("[dmNostrService] Relay failure", {
      relayUrl,
      error,
    });
  }

  scheduleReconnect(relayUrl, reason) {
    const relayState = this.ensureRelayState(relayUrl);
    relayState.attempts += 1;

    const backoffBase = this.backoffConfig.baseMs * 2 ** (relayState.attempts - 1);
    const backoffMs = applyJitter(
      Math.min(backoffBase, this.backoffConfig.maxMs),
      this.backoffConfig.jitterRatio,
    );

    relayState.backoffMs = backoffMs;

    if (this.relayTimers.has(relayUrl)) {
      clearTimeout(this.relayTimers.get(relayUrl));
    }

    this.logger.dev.info("[dmNostrService] Scheduling relay reconnect", {
      relayUrl,
      reason,
      backoffMs,
    });

    const timer = setTimeout(() => {
      this.relayTimers.delete(relayUrl);
      this.resubscribeRelay(relayUrl);
    }, backoffMs);

    this.relayTimers.set(relayUrl, timer);
  }

  buildFilters({ actorPubkey, authors = [], recipients = [] } = {}) {
    const normalizedActor = normalizePubkey(actorPubkey || this.actorPubkey);
    const authorSet = new Set(
      [normalizedActor, ...authors].map(normalizePubkey).filter(Boolean),
    );
    const recipientSet = new Set(
      [normalizedActor, ...recipients].map(normalizePubkey).filter(Boolean),
    );

    const filters = [];

    if (authorSet.size) {
      filters.push({
        kinds: [4],
        authors: Array.from(authorSet),
      });
    }

    if (recipientSet.size) {
      filters.push({
        kinds: [4],
        "#p": Array.from(recipientSet),
      });
    }

    return filters;
  }

  updateWatermark(relayUrl, event) {
    if (!event || typeof event.created_at !== "number") {
      return;
    }

    const current = this.relayWatermarks.get(relayUrl) || 0;
    if (event.created_at > current) {
      this.relayWatermarks.set(relayUrl, event.created_at);
    }
  }

  hasSeenEvent(eventId) {
    if (!eventId) {
      return false;
    }
    return this.seenEventIds.has(eventId);
  }

  rememberEvent(eventId) {
    if (!eventId || this.seenEventIds.has(eventId)) {
      return;
    }

    this.seenEventIds.add(eventId);
    this.seenEventOrder.push(eventId);

    if (this.seenEventOrder.length > MAX_SEEN_EVENT_IDS) {
      const oldest = this.seenEventOrder.shift();
      if (oldest) {
        this.seenEventIds.delete(oldest);
      }
    }
  }

  shouldProcessEvent(relayUrl, event) {
    if (!event || typeof event.id !== "string") {
      return false;
    }

    if (this.hasSeenEvent(event.id)) {
      return false;
    }

    const watermark = this.relayWatermarks.get(relayUrl) || 0;
    if (typeof event.created_at === "number" && event.created_at < watermark) {
      return false;
    }

    return true;
  }

  async subscribe({
    actorPubkey,
    authors,
    recipients,
    relays,
    onEvent,
    onEose,
    onError,
  } = {}) {
    if (typeof onEvent === "function") {
      this.handlers.onEvent = onEvent;
    }
    if (typeof onEose === "function") {
      this.handlers.onEose = onEose;
    }
    if (typeof onError === "function") {
      this.handlers.onError = onError;
    }

    if (typeof actorPubkey === "string" && actorPubkey.trim()) {
      this.actorPubkey = normalizePubkey(actorPubkey);
    }

    if (Array.isArray(relays)) {
      this.relays = normalizeRelayList(relays);
    }

    if (!this.relays.length) {
      this.logger.user.warn("[dmNostrService] Cannot subscribe without relays.");
      return;
    }

    this.activeFilters = this.buildFilters({
      actorPubkey: this.actorPubkey,
      authors,
      recipients,
    });

    if (!this.activeFilters.length) {
      this.logger.user.warn("[dmNostrService] Cannot subscribe without filters.");
      return;
    }

    await this.connect();

    this.relays.forEach((relayUrl) => {
      this.subscribeRelay(relayUrl);
    });
  }

  subscribeRelay(relayUrl) {
    if (!this.pool || !relayUrl) {
      return;
    }

    const since = this.relayWatermarks.get(relayUrl);
    const filters = this.activeFilters.map((filter) => {
      if (typeof since === "number" && since > 0) {
        return {
          ...filter,
          since: Math.max(0, since - 1),
        };
      }
      return { ...filter };
    });

    if (this.subscriptions.has(relayUrl)) {
      this.unsubscribeRelay(relayUrl);
    }

    let subscription;
    try {
      subscription = this.pool.sub([relayUrl], filters);
    } catch (error) {
      this.recordRelayFailure(relayUrl, error);
      this.scheduleReconnect(relayUrl, "subscribe-failed");
      return;
    }

    if (!subscription || typeof subscription.on !== "function") {
      this.recordRelayFailure(relayUrl, new Error("subscription-unavailable"));
      this.scheduleReconnect(relayUrl, "subscribe-unavailable");
      return;
    }

    subscription.on("event", (event) => {
      if (!this.shouldProcessEvent(relayUrl, event)) {
        return;
      }

      this.rememberEvent(event.id);
      this.updateWatermark(relayUrl, event);
      this.recordRelaySuccess(relayUrl);

      if (typeof this.handlers.onEvent === "function") {
        try {
          this.handlers.onEvent(event, { relayUrl });
        } catch (error) {
          this.logger.dev.warn("[dmNostrService] onEvent handler failed.", error);
        }
      }
    });

    subscription.on("eose", () => {
      if (typeof this.handlers.onEose === "function") {
        try {
          this.handlers.onEose({ relayUrl });
        } catch (error) {
          this.logger.dev.warn("[dmNostrService] onEose handler failed.", error);
        }
      }
    });

    subscription.on("close", () => {
      this.recordRelayFailure(relayUrl, new Error("subscription-closed"));
      this.scheduleReconnect(relayUrl, "subscription-closed");
    });

    this.subscriptions.set(relayUrl, subscription);
  }

  resubscribeRelay(relayUrl) {
    if (!relayUrl) {
      return;
    }

    this.subscribeRelay(relayUrl);
  }

  unsubscribeRelay(relayUrl) {
    const subscription = this.subscriptions.get(relayUrl);
    if (subscription && typeof subscription.unsub === "function") {
      try {
        subscription.unsub();
      } catch (error) {
        this.logger.dev.warn("[dmNostrService] Failed to unsubscribe relay.", error);
      }
    }
    this.subscriptions.delete(relayUrl);
  }

  stop() {
    for (const relayUrl of this.subscriptions.keys()) {
      this.unsubscribeRelay(relayUrl);
    }

    for (const timer of this.relayTimers.values()) {
      clearTimeout(timer);
    }

    this.relayTimers.clear();
  }

  async publishSignedEvent(signedEvent, { relays = null } = {}) {
    if (!signedEvent || typeof signedEvent !== "object") {
      throw new Error("signed-event-required");
    }

    if (signedEvent.kind !== 4) {
      throw new Error("invalid-event-kind");
    }

    const relayList = normalizeRelayList(
      Array.isArray(relays) && relays.length
        ? relays
        : this.preferredRelays.length
        ? this.preferredRelays
        : this.relays,
    );

    if (!relayList.length) {
      throw new Error("no-relays-configured");
    }

    await this.ensurePool();

    const results = await Promise.all(
      relayList.map(async (relayUrl) => {
        let result;
        try {
          result = await publishEventToRelay(this.pool, relayUrl, signedEvent);
        } catch (error) {
          this.recordRelayFailure(relayUrl, error);
          return { success: false, error, relayUrl };
        }

        if (result?.success) {
          this.recordRelaySuccess(relayUrl);
        } else {
          this.recordRelayFailure(
            relayUrl,
            result?.error || new Error("publish-failed"),
          );
        }

        return { ...result, relayUrl };
      }),
    );

    return results;
  }
}

export default DmNostrService;
