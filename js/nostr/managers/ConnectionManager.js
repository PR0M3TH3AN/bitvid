import {
  DEFAULT_RELAY_URLS,
  RELAY_URLS,
  ensureNostrTools,
  resolveSimplePoolConstructor,
  shimLegacySimplePoolMethods,
  nostrToolsBootstrapFailure,
} from "../toolkit.js";
import { devLogger, userLogger } from "../../utils/logger.js";
import { isDevMode } from "../../config.js";
import { sanitizeRelayList } from "../nip46Client.js";
import {
  logCountTimeoutCleanupFailure,
  logRelayCountFailure,
} from "../countDiagnostics.js";
import {
  RELAY_CONNECT_TIMEOUT_MS,
  RELAY_RECONNECT_BASE_DELAY_MS,
  RELAY_RECONNECT_MAX_DELAY_MS,
  RELAY_RECONNECT_MAX_ATTEMPTS,
  RELAY_BACKOFF_BASE_DELAY_MS,
  RELAY_BACKOFF_MAX_DELAY_MS,
  RELAY_CIRCUIT_BREAKER_THRESHOLD,
  RELAY_CIRCUIT_BREAKER_COOLDOWN_MS,
  RELAY_FAILURE_WINDOW_MS,
  RELAY_FAILURE_WINDOW_THRESHOLD,
  RELAY_SUMMARY_LOG_INTERVAL_MS,
} from "../relayConstants.js";

function withRequestTimeout(promise, timeoutMs, onTimeout, message = "Request timed out") {
  const resolvedTimeout = Number(timeoutMs);
  const effectiveTimeout =
    Number.isFinite(resolvedTimeout) && resolvedTimeout > 0
      ? Math.floor(resolvedTimeout)
      : 4000;

  let timeoutId = null;
  let settled = false;

  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      if (typeof onTimeout === "function") {
        try {
          onTimeout();
        } catch (cleanupError) {
          logCountTimeoutCleanupFailure(cleanupError);
        }
      }
      reject(new Error(message));
    }, effectiveTimeout);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
  });
}

export class ConnectionManager {
  constructor() {
    this.pool = null;
    this.poolPromise = null;
    this.relays = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
    this.readRelays = Array.from(this.relays);
    this.writeRelays = Array.from(this.relays);

    this.countUnsupportedRelays = new Set();
    this.unreachableRelays = new Set();
    this.relayBackoff = new Map();
    this.relayFailureCounts = new Map();
    this.relayFailureWindows = new Map();
    this.relayCircuitBreakers = new Map();
    this.relaySummaryLogTimestamps = new Map();
    this.relayReconnectTimer = null;
    this.relayReconnectAttempt = 0;
    this.countRequestCounter = 0;
  }

  async ensurePool() {
    if (this.pool) {
      return this.pool;
    }

    if (this.poolPromise) {
      return this.poolPromise;
    }

    const tools = await ensureNostrTools();
    const SimplePool = resolveSimplePoolConstructor(tools);

    if (typeof SimplePool !== "function") {
      if (tools && typeof tools === "object") {
        const availableKeys = Object.keys(tools).join(", ");
        devLogger.warn(
          "[nostr] NostrTools helpers did not expose SimplePool. Available keys:",
          availableKeys
        );
      } else {
        userLogger.warn(
          "[nostr] NostrTools helpers were unavailable. Check that nostr-tools bundles can load on this domain."
        );
      }
      if (nostrToolsBootstrapFailure) {
        userLogger.warn(
          "[nostr] nostr-tools bootstrap failure details:",
          nostrToolsBootstrapFailure
        );
      }
      const error = new Error(
        "NostrTools SimplePool is unavailable. Verify that nostr-tools resources can load on this domain."
      );

      error.code = "nostr-simplepool-unavailable";
      if (nostrToolsBootstrapFailure) {
        error.bootstrapFailure = nostrToolsBootstrapFailure;
      }
      this.poolPromise = null;
      throw error;
    }

    const creation = Promise.resolve().then(() => {
      const instance = new SimplePool();

      if (typeof instance.ensureRelay === "function") {
        const originalEnsureRelay = instance.ensureRelay.bind(instance);
        instance.ensureRelay = async (url) => {
          const relay = await originalEnsureRelay(url);
          if (relay && typeof relay.setMaxListeners === "function") {
            try {
              relay.setMaxListeners(200);
            } catch (error) {
              // ignore
            }
          }
          return relay;
        };
      } else {
        devLogger.warn(
          "[nostr] SimplePool.ensureRelay missing; max listeners patch skipped."
        );
      }

      shimLegacySimplePoolMethods(instance);
      this.pool = instance;
      return instance;
    });

    const shared = creation
      .then((instance) => {
        this.poolPromise = Promise.resolve(instance);
        return instance;
      })
      .catch((error) => {
        this.poolPromise = null;
        throw error;
      });

    this.poolPromise = shared;
    return shared;
  }

  async connectToRelays() {
    const relayTargets = this.getHealthyRelays(this.relays);
    if (!relayTargets.length) {
      return [];
    }
    const results = await Promise.all(
      relayTargets.map(
        (url) =>
          new Promise((resolve) => {
            const sub = this.pool.sub([url], [{ kinds: [0], limit: 1 }]);
            const timeout = setTimeout(() => {
              sub.unsub();
              resolve({ url, success: false });
            }, RELAY_CONNECT_TIMEOUT_MS);

            const succeed = () => {
              clearTimeout(timeout);
              sub.unsub();
              resolve({ url, success: true });
            };
            sub.on("event", succeed);
            sub.on("eose", succeed);
          })
      )
    );

    for (const result of results) {
      if (result.success) {
        this.clearRelayBackoff(result.url);
      } else {
        this.markRelayUnreachable(result.url, 60000, {
          reason: "connect-timeout",
        });
        if (isDevMode) {
          devLogger.warn(`[nostr] Marked relay as unreachable: ${result.url}`);
        }
      }
    }

    return results;
  }

  resolveRelayReconnectDelayMs(attempt) {
    const safeAttempt = Number.isFinite(attempt) ? Math.max(0, attempt) : 0;
    const computed = RELAY_RECONNECT_BASE_DELAY_MS * Math.pow(2, safeAttempt);
    return Math.min(RELAY_RECONNECT_MAX_DELAY_MS, computed);
  }

  resetRelayReconnectState() {
    this.relayReconnectAttempt = 0;
    if (this.relayReconnectTimer) {
      clearTimeout(this.relayReconnectTimer);
      this.relayReconnectTimer = null;
    }
  }

  scheduleRelayReconnect({ reason = "retry" } = {}) {
    if (this.relayReconnectTimer) {
      return;
    }
    if (this.relayReconnectAttempt >= RELAY_RECONNECT_MAX_ATTEMPTS) {
      if (isDevMode) {
        devLogger.debug(
          "[nostr] Relay reconnect attempts exhausted.",
          {
            attempts: this.relayReconnectAttempt,
            reason,
          },
        );
      }
      return;
    }

    const delayMs = this.resolveRelayReconnectDelayMs(this.relayReconnectAttempt);
    const attemptNumber = this.relayReconnectAttempt + 1;
    this.relayReconnectAttempt = attemptNumber;

    if (isDevMode) {
      devLogger.debug("[nostr] Scheduling relay reconnect attempt.", {
        attempt: attemptNumber,
        delayMs,
        reason,
      });
    }

    this.relayReconnectTimer = setTimeout(async () => {
      this.relayReconnectTimer = null;
      try {
        const results = await this.connectToRelays();
        const successful = results.some((result) => result.success);
        if (successful) {
          this.resetRelayReconnectState();
          return;
        }
      } catch (error) {
        devLogger.warn("[nostr] Relay reconnect attempt failed:", error);
      }
      this.scheduleRelayReconnect({ reason: "reconnect-failed" });
    }, delayMs);
  }

  logRelaySummary({
    key,
    level = "warn",
    message,
    payload,
  } = {}) {
    if (!key || !message) {
      return;
    }
    const now = Date.now();
    const lastLogged = this.relaySummaryLogTimestamps.get(key) || 0;
    if (now - lastLogged < RELAY_SUMMARY_LOG_INTERVAL_MS) {
      return;
    }
    this.relaySummaryLogTimestamps.set(key, now);
    const channel = isDevMode ? devLogger : userLogger;
    const logFn =
      typeof channel[level] === "function" ? channel[level] : channel.warn;
    if (payload) {
      logFn(`[nostr] ${message}`, payload);
    } else {
      logFn(`[nostr] ${message}`);
    }
  }

  resolveRelayBackoffMs(failureCount, ttlOverride) {
    const baseMs = RELAY_BACKOFF_BASE_DELAY_MS;
    const maxMs = RELAY_BACKOFF_MAX_DELAY_MS;
    const computed = Math.min(
      maxMs,
      baseMs * Math.pow(2, Math.max(0, failureCount - 1))
    );
    const override = Number(ttlOverride);
    if (Number.isFinite(override) && override > 0) {
      return Math.min(computed, Math.floor(override));
    }
    return computed;
  }

  clearRelayBackoff(url) {
    if (!url || typeof url !== "string") {
      return;
    }
    const normalized = url.trim();
    if (!normalized) {
      return;
    }
    const hadBackoffState =
      this.relayBackoff.has(normalized) ||
      this.unreachableRelays.has(normalized) ||
      this.relayFailureCounts.has(normalized) ||
      this.relayCircuitBreakers.has(normalized);
    this.relayBackoff.delete(normalized);
    this.relayFailureCounts.delete(normalized);
    this.relayFailureWindows.delete(normalized);
    this.unreachableRelays.delete(normalized);
    this.relayCircuitBreakers.delete(normalized);
    if (hadBackoffState) {
      this.logRelaySummary({
        key: `relay-recovered:${normalized}`,
        level: "info",
        message: "Relay recovered; backoff cleared.",
        payload: { relay: normalized },
      });
    }
  }

  recordRelayFailureWindow(url) {
    if (!url || typeof url !== "string") {
      return 0;
    }
    const normalized = url.trim();
    if (!normalized) {
      return 0;
    }
    const now = Date.now();
    const cutoff = now - RELAY_FAILURE_WINDOW_MS;
    const history = this.relayFailureWindows.get(normalized) || [];
    const filtered = history.filter(
      (timestamp) => Number.isFinite(timestamp) && timestamp >= cutoff,
    );
    filtered.push(now);
    this.relayFailureWindows.set(normalized, filtered);
    return filtered.length;
  }

  markRelayUnreachable(url, ttlMs = 60000, { reason = null } = {}) {
    if (!url || typeof url !== "string") {
      return;
    }
    const normalized = url.trim();
    if (!normalized) {
      return;
    }
    const windowFailureCount = this.recordRelayFailureWindow(normalized);
    const nextFailureCount = (this.relayFailureCounts.get(normalized) || 0) + 1;
    this.relayFailureCounts.set(normalized, nextFailureCount);
    const backoffMs = this.resolveRelayBackoffMs(nextFailureCount, ttlMs);
    const retryAt = Date.now() + backoffMs;
    this.relayBackoff.set(normalized, {
      retryAt,
      backoffMs,
      failureCount: nextFailureCount,
      reason,
    });
    this.unreachableRelays.add(normalized);
    const shouldOpenCircuit =
      nextFailureCount >= RELAY_CIRCUIT_BREAKER_THRESHOLD ||
      windowFailureCount >= RELAY_FAILURE_WINDOW_THRESHOLD;
    if (shouldOpenCircuit) {
      const now = Date.now();
      const openUntil = now + RELAY_CIRCUIT_BREAKER_COOLDOWN_MS;
      const existing = this.relayCircuitBreakers.get(normalized);
      const nextOpenUntil =
        existing && Number.isFinite(existing.openUntil)
          ? Math.max(existing.openUntil, openUntil)
          : openUntil;
      const circuitReason =
        reason ||
        (nextFailureCount >= RELAY_CIRCUIT_BREAKER_THRESHOLD
          ? "consecutive-failures"
          : "windowed-failures");
      this.relayCircuitBreakers.set(normalized, {
        openUntil: nextOpenUntil,
        failureCount: nextFailureCount,
        reason: circuitReason,
      });
      this.logRelaySummary({
        key: `relay-circuit:${normalized}`,
        level: "warn",
        message: "Circuit breaker opened for relay.",
        payload: {
          relay: normalized,
          openUntil: nextOpenUntil,
          failureCount: nextFailureCount,
          reason: circuitReason,
        },
      });
    }
    this.logRelaySummary({
      key: `relay-backoff:${normalized}`,
      level: "warn",
      message: "Relay backoff applied.",
      payload: {
        relay: normalized,
        backoffMs,
        failureCount: nextFailureCount,
        retryAt,
        reason,
      },
    });
  }

  getHealthyRelays(candidates) {
    const source = Array.isArray(candidates) ? candidates : this.relays;
    if (!this.unreachableRelays.size) {
      return source;
    }
    const now = Date.now();
    return source.filter((url) => {
      const circuit = this.relayCircuitBreakers.get(url);
      if (circuit && Number.isFinite(circuit.openUntil)) {
        if (circuit.openUntil > now) {
          return false;
        }
        this.relayCircuitBreakers.delete(url);
        this.relayFailureCounts.delete(url);
        this.relayFailureWindows.delete(url);
        this.unreachableRelays.delete(url);
        this.relayBackoff.delete(url);
        this.logRelaySummary({
          key: `relay-circuit-reset:${url}`,
          level: "info",
          message: "Circuit breaker reset for relay.",
          payload: { relay: url },
        });
      }
      if (!this.unreachableRelays.has(url)) {
        return true;
      }
      const entry = this.relayBackoff.get(url);
      if (!entry) {
        return false;
      }
      if (Number.isFinite(entry.retryAt) && entry.retryAt > now) {
        return false;
      }
      this.relayBackoff.delete(url);
      this.relayFailureCounts.delete(url);
      this.relayFailureWindows.delete(url);
      this.unreachableRelays.delete(url);
      this.logRelaySummary({
        key: `relay-backoff-expired:${url}`,
        level: "info",
        message: "Relay backoff expired.",
        payload: { relay: url },
      });
      return true;
    });
  }

  applyRelayPreferences(preferences = {}) {
    const normalizedPrefs =
      preferences && typeof preferences === "object" ? preferences : {};
    const sanitizedAll = sanitizeRelayList(
      Array.isArray(normalizedPrefs.all)
        ? normalizedPrefs.all
        : this.relays
    );
    const effectiveAll =
      sanitizedAll.length > 0
        ? sanitizedAll
        : sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));

    const sanitizedRead = sanitizeRelayList(
      Array.isArray(normalizedPrefs.read)
        ? normalizedPrefs.read
        : effectiveAll
    );
    const sanitizedWrite = sanitizeRelayList(
      Array.isArray(normalizedPrefs.write)
        ? normalizedPrefs.write
        : effectiveAll
    );

    this.relays = effectiveAll.length ? effectiveAll : Array.from(RELAY_URLS);
    this.readRelays = sanitizedRead.length ? sanitizedRead : Array.from(this.relays);
    this.writeRelays = sanitizedWrite.length ? sanitizedWrite : Array.from(this.relays);
  }

  makeCountUnsupportedError(relayUrl) {
    const normalizedUrl =
      typeof relayUrl === "string" && relayUrl.trim()
        ? relayUrl.trim()
        : "";
    const error = new Error(
      `[nostr] Relay ${normalizedUrl} does not support COUNT frames.`
    );
    error.code = "count-unsupported";
    error.relay = normalizedUrl;
    error.unsupported = true;
    return error;
  }

  getRequestTimeoutMs(timeoutMs) {
    const candidate = Number(timeoutMs);
    if (Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate);
    }
    const poolTimeout = Number(this.pool?.getTimeout);
    if (Number.isFinite(poolTimeout) && poolTimeout > 0) {
      return Math.floor(poolTimeout);
    }
    return 3400;
  }

  normalizeCountFilter(filter) {
    if (!filter || typeof filter !== "object") {
      return null;
    }

    const normalized = {};

    const toStringArray = (value) => {
      if (value === undefined || value === null) {
        return [];
      }
      const source = Array.isArray(value) ? value : [value];
      const collected = [];
      for (const item of source) {
        if (typeof item !== "string") {
          continue;
        }
        const trimmed = item.trim();
        if (!trimmed || collected.includes(trimmed)) {
          continue;
        }
        collected.push(trimmed);
      }
      return collected;
    };

    if (filter.kinds !== undefined) {
      const kindsSource = Array.isArray(filter.kinds)
        ? filter.kinds
        : [filter.kinds];
      const normalizedKinds = [];
      const seenKinds = new Set();
      for (const candidate of kindsSource) {
        const parsed = Number(candidate);
        if (!Number.isFinite(parsed)) {
          continue;
        }
        const normalizedValue = Math.floor(parsed);
        if (seenKinds.has(normalizedValue)) {
          continue;
        }
        seenKinds.add(normalizedValue);
        normalizedKinds.push(normalizedValue);
      }
      if (normalizedKinds.length) {
        normalized.kinds = normalizedKinds;
      }
    }

    const ids = toStringArray(filter.ids);
    if (ids.length) {
      normalized.ids = ids;
    }

    const authors = toStringArray(filter.authors);
    if (authors.length) {
      normalized.authors = authors;
    }

    for (const [key, value] of Object.entries(filter)) {
      if (!key.startsWith("#")) {
        continue;
      }
      const tagValues = toStringArray(value);
      if (tagValues.length) {
        normalized[key] = tagValues;
      }
    }

    if (filter.since !== undefined) {
      const parsedSince = Number(filter.since);
      if (Number.isFinite(parsedSince)) {
        normalized.since = Math.floor(parsedSince);
      }
    }

    if (filter.until !== undefined) {
      const parsedUntil = Number(filter.until);
      if (Number.isFinite(parsedUntil)) {
        normalized.until = Math.floor(parsedUntil);
      }
    }

    if (filter.limit !== undefined) {
      const parsedLimit = Number(filter.limit);
      if (Number.isFinite(parsedLimit) && parsedLimit >= 0) {
        normalized.limit = Math.floor(parsedLimit);
      }
    }

    return Object.keys(normalized).length ? normalized : null;
  }

  normalizeCountFilters(filters) {
    if (!filters) {
      return [];
    }

    const list = Array.isArray(filters) ? filters : [filters];
    const normalized = [];

    for (const candidate of list) {
      const normalizedFilter = this.normalizeCountFilter(candidate);
      if (normalizedFilter) {
        normalized.push(normalizedFilter);
      }
    }

    return normalized;
  }

  generateCountRequestId(prefix = "count") {
    this.countRequestCounter += 1;
    if (this.countRequestCounter > Number.MAX_SAFE_INTEGER - 1) {
      this.countRequestCounter = 1;
    }
    const normalizedPrefix =
      typeof prefix === "string" && prefix.trim() ? prefix.trim() : "count";
    const timestamp = Date.now().toString(36);
    const counter = this.countRequestCounter.toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${normalizedPrefix}:${timestamp}:${counter}${random}`;
  }

  extractCountValue(payload) {
    if (typeof payload === "number") {
      const value = Math.floor(payload);
      return value >= 0 ? value : 0;
    }

    if (payload && typeof payload === "object") {
      const candidate =
        typeof payload.count === "number"
          ? payload.count
          : Number(payload.count);
      if (Number.isFinite(candidate)) {
        const value = Math.floor(candidate);
        return value >= 0 ? value : 0;
      }
    }

    const parsed = Number(payload);
    if (Number.isFinite(parsed)) {
      const value = Math.floor(parsed);
      return value >= 0 ? value : 0;
    }

    return 0;
  }

  async sendRawCountFrame(relayUrl, filters, options = {}) {
    if (!this.pool) {
      throw new Error(
        "Nostr pool not initialized. Call ensurePool() before requesting counts."
      );
    }

    const normalizedUrl =
      typeof relayUrl === "string" ? relayUrl.trim() : "";
    if (!normalizedUrl) {
      throw new Error("Invalid relay URL for COUNT request.");
    }

    if (this.countUnsupportedRelays.has(normalizedUrl)) {
      throw this.makeCountUnsupportedError(normalizedUrl);
    }

    const normalizedFilters = this.normalizeCountFilters(filters);
    if (!normalizedFilters.length) {
      throw new Error("At least one filter is required for a COUNT request.");
    }

    const requestId =
      typeof options.subId === "string" && options.subId.trim()
        ? options.subId.trim()
        : this.generateCountRequestId();

    let relay;
    try {
      relay = await this.pool.ensureRelay(normalizedUrl);
    } catch (error) {
      const connectError = new Error(
        `Failed to connect to relay ${normalizedUrl}`
      );
      connectError.code = "relay-connect-failed";
      this.markRelayUnreachable(normalizedUrl, 60000, {
        reason: "connect-failed",
      });
      throw connectError;
    }

    if (!relay) {
      const relayError = new Error(
        `Relay ${normalizedUrl} is unavailable for COUNT requests.`
      );
      relayError.code = "relay-unavailable";
      this.markRelayUnreachable(normalizedUrl, 60000, {
        reason: "relay-unavailable",
      });
      throw relayError;
    }

    const frame = ["COUNT", requestId, ...normalizedFilters];
    let countPromise;

    if (
      relay.openCountRequests instanceof Map &&
      typeof relay.send === "function"
    ) {
      countPromise = new Promise((resolve, reject) => {
        const cleanup = () => {
          if (relay.openCountRequests instanceof Map) {
            relay.openCountRequests.delete(requestId);
          }
        };

        relay.openCountRequests.set(requestId, {
          resolve: (value) => {
            cleanup();
            resolve(value);
          },
          reject: (error) => {
            cleanup();
            reject(error);
          },
        });

        let sendResult;
        try {
          sendResult = relay.send(JSON.stringify(frame));
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }

        if (sendResult && typeof sendResult.catch === "function") {
          sendResult.catch((error) => {
            cleanup();
            reject(error);
          });
        }
      });
    } else if (typeof relay.count === "function") {
      countPromise = relay.count(normalizedFilters, { id: requestId });
    } else {
      this.countUnsupportedRelays.add(normalizedUrl);
      throw this.makeCountUnsupportedError(normalizedUrl);
    }

    const timeoutMs = this.getRequestTimeoutMs(options.timeoutMs);
    let rawResult;
    try {
      rawResult = await withRequestTimeout(
        countPromise,
        timeoutMs,
        () => {
          if (relay?.openCountRequests instanceof Map) {
            relay.openCountRequests.delete(requestId);
          }
        },
        `COUNT request timed out after ${timeoutMs}ms`
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("COUNT request timed out")
      ) {
        error.code = "count-timeout";
      }
      throw error;
    }

    const countValue = this.extractCountValue(rawResult);
    return ["COUNT", requestId, { count: countValue }];
  }

  async countEventsAcrossRelays(filters, options = {}) {
    const normalizedFilters = this.normalizeCountFilters(filters);
    if (!normalizedFilters.length) {
      return { total: 0, best: null, perRelay: [], partial: false };
    }

    const relayList =
      Array.isArray(options.relays) && options.relays.length
        ? options.relays
        : Array.isArray(this.relays) && this.relays.length
        ? this.relays
        : RELAY_URLS;

    const normalizedRelayList = relayList
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter(Boolean);

    const eligibleRelays = this.getHealthyRelays(normalizedRelayList);
    const eligibleRelaySet = new Set(eligibleRelays);
    const activeRelays = [];
    const precomputedEntries = [];

    for (const url of normalizedRelayList) {
      if (this.countUnsupportedRelays.has(url)) {
        const error = this.makeCountUnsupportedError(url);
        precomputedEntries.push({
          url,
          ok: false,
          error,
          unsupported: true,
        });
        continue;
      }
      if (!eligibleRelaySet.has(url)) {
        precomputedEntries.push({
          url,
          ok: false,
          skipped: true,
          reason: "backoff",
        });
        continue;
      }
      activeRelays.push(url);
    }

    const activeResults = await Promise.all(
      activeRelays.map(async (url) => {
        try {
          const frame = await this.sendRawCountFrame(url, normalizedFilters, {
            timeoutMs: options.timeoutMs,
          });
          const count = this.extractCountValue(frame?.[2]);
          this.clearRelayBackoff(url);
          return { url, ok: true, frame, count };
        } catch (error) {
          const isUnsupported = error?.code === "count-unsupported";
          const isTimeout =
            error?.code === "count-timeout" || error?.code === "timeout";
          if (isUnsupported) {
            this.countUnsupportedRelays.add(url);
          } else {
            logRelayCountFailure(url, error);
            // If the count request timed out, we don't want to kill the entire relay connection
            // because it might still be good for subscriptions.
            // We only trip the circuit breaker for hard errors.
            if (!isTimeout) {
              this.markRelayUnreachable(url, 60000, {
                reason: "count-error",
              });
            } else if (isDevMode) {
              devLogger.warn(
                `[nostr] Relay ${url} count timed out (ignored for circuit breaker).`
              );
            }
          }
          return {
            url,
            ok: false,
            error,
            unsupported: isUnsupported,
            timedOut: isTimeout,
            errorCode: error?.code || null,
          };
        }
      })
    );

    const resultsByUrl = new Map();
    for (const entry of [...precomputedEntries, ...activeResults]) {
      if (entry && typeof entry.url === "string") {
        resultsByUrl.set(entry.url, entry);
      }
    }

    const perRelayResults = normalizedRelayList.map((url) => {
      if (resultsByUrl.has(url)) {
        return resultsByUrl.get(url);
      }
      return { url, ok: false };
    });

    let bestEstimate = null;
    const perRelay = perRelayResults.map((entry) => {
      if (!entry || !entry.ok) {
        return entry;
      }

      const numericValue = Number(entry.count);
      const normalizedCount =
        Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;

      const normalizedEntry = {
        ...entry,
        count: normalizedCount,
      };

      if (!Number.isFinite(numericValue) || numericValue < 0) {
        normalizedEntry.rawCount = entry.count;
      }

      if (
        !bestEstimate ||
        normalizedCount > bestEstimate.count ||
        (bestEstimate && normalizedCount === bestEstimate.count && !bestEstimate.frame)
      ) {
        bestEstimate = {
          relay: normalizedEntry.url,
          count: normalizedCount,
          frame: normalizedEntry.frame,
        };
      }

      return normalizedEntry;
    });

    const total = bestEstimate ? bestEstimate.count : 0;
    const partial = perRelayResults.some(
      (entry) => entry?.timedOut || entry?.skipped
    );

    return {
      total,
      best: bestEstimate,
      perRelay,
      partial,
    };
  }
}
