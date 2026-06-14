// SubscriptionManager (L1) — the single chokepoint for relay reads.
//
// Per docs/architecture-refactor.md, NOTHING outside this module should call
// pool.sub / pool.list directly. It generalizes relaySubscriptionService by:
//   - defaulting to a bounded, health-gated relay set (so callers stop fanning
//     every query across a user's full ~20-relay NIP-65 list),
//   - deduping one-shot list() fetches that are identical and in-flight,
//   - keeping a registry of active live subscriptions and re-issuing them on
//     relay reconnect (instead of every subsystem re-subscribing on its own,
//     which was the reconnect-storm amplifier).
//
// Callers are expected to pass BATCHED filters (one filter covering many ids,
// e.g. {kinds:[1984], "#e":[...all]}) — never one subscription per item.

import { relaySubscriptionService } from "../services/relaySubscriptionService.js";
import { devLogger, userLogger } from "../utils/logger.js";

const DEFAULT_LIST_TIMEOUT_MS = 8000;

function normalizeRelays(relays) {
  if (!Array.isArray(relays)) return [];
  const seen = new Set();
  const out = [];
  for (const r of relays) {
    const url = typeof r === "string" ? r.trim() : "";
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function stableSignature(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSignature).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSignature(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * @param {object} deps
 * @param {() => object|null} deps.getPool        returns the relay pool (pool.sub/pool.list)
 * @param {() => string[]} deps.getDefaultRelays  bounded, health-gated read relays
 * @param {object} [deps.subscriptions]           relaySubscriptionService (injectable for tests)
 * @param {object} [deps.logger]
 */
export function createSubscriptionManager({
  getPool,
  getDefaultRelays,
  subscriptions = relaySubscriptionService,
  logger = { dev: devLogger, user: userLogger },
} = {}) {
  // Active live subscriptions, keyed by logical `key`, for reconnect re-issue.
  const active = new Map();
  // In-flight one-shot list() promises, keyed by signature, for dedup.
  const inflightLists = new Map();

  const resolveRelays = (relays) => {
    const explicit = normalizeRelays(relays);
    if (explicit.length) return explicit;
    try {
      return normalizeRelays(getDefaultRelays?.() || []);
    } catch (error) {
      logger.dev?.warn?.("[subscriptionManager] getDefaultRelays threw", error);
      return [];
    }
  };

  /**
   * Open (or update) a live subscription. Deduped by `key`. Returns a handle.
   */
  function subscribe({ key, filters, relays, onEvent, onEose, onClose, label = "sub" }) {
    if (!key || typeof key !== "string") {
      logger.dev?.warn?.("[subscriptionManager] subscribe requires a string key");
      return { update() {}, close() {} };
    }
    const pool = getPool?.();
    const record = { key, filters, onEvent, onEose, onClose, label };
    active.set(key, record);

    const open = (nextFilters, nextRelays) => {
      record.filters = nextFilters;
      if (nextRelays !== undefined) record.relays = nextRelays;
      const relayList = resolveRelays(record.relays);
      subscriptions.ensureSubscription({
        key,
        pool,
        relays: relayList,
        filters: record.filters,
        label,
        onEvent,
        onEose,
        onClose,
      });
    };

    open(filters, relays);

    return {
      update({ filters: nextFilters, relays: nextRelays } = {}) {
        open(nextFilters ?? record.filters, nextRelays);
      },
      close() {
        active.delete(key);
        subscriptions.stopSubscription(key, "handle-close");
      },
    };
  }

  /**
   * One-shot fetch (resolves on EOSE). Deduped while identical requests are
   * in-flight, health-gated, with a timeout fallback so a dead relay set can't
   * hang the caller forever.
   */
  function list({ filters, relays, timeoutMs = DEFAULT_LIST_TIMEOUT_MS } = {}) {
    const pool = getPool?.();
    if (!pool || typeof pool.list !== "function") {
      logger.dev?.warn?.("[subscriptionManager] pool.list unavailable");
      return Promise.resolve([]);
    }
    const relayList = resolveRelays(relays);
    if (!relayList.length) return Promise.resolve([]);

    const signature = stableSignature({ relays: relayList.slice().sort(), filters });
    const existing = inflightLists.get(signature);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const result = await Promise.race([
          Promise.resolve(pool.list(relayList, filters)),
          new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
        return Array.isArray(result) ? result : [];
      } catch (error) {
        logger.dev?.warn?.("[subscriptionManager] list() failed", error);
        return [];
      } finally {
        inflightLists.delete(signature);
      }
    })();

    inflightLists.set(signature, promise);
    return promise;
  }

  /**
   * Re-issue all active live subscriptions. Call after a relay (re)connects so
   * subscriptions dropped by a flaky relay are restored — once, centrally —
   * instead of each subsystem re-subscribing independently.
   */
  function handleReconnect() {
    const pool = getPool?.();
    for (const record of active.values()) {
      // The old subscription was dropped by the disconnected relay, but
      // relaySubscriptionService still holds it (same signature) and would
      // reuse the dead handle. Stop it first to force a fresh REQ.
      subscriptions.stopSubscription(record.key, "reconnect");
      const relayList = resolveRelays(record.relays);
      subscriptions.ensureSubscription({
        key: record.key,
        pool,
        relays: relayList,
        filters: record.filters,
        label: record.label,
        onEvent: record.onEvent,
        onEose: record.onEose,
        onClose: record.onClose,
      });
    }
  }

  function closeAll(reason = "close-all") {
    for (const key of Array.from(active.keys())) {
      subscriptions.stopSubscription(key, reason);
    }
    active.clear();
    inflightLists.clear();
  }

  return {
    subscribe,
    list,
    handleReconnect,
    closeAll,
    // introspection for tests/telemetry
    getActiveKeys: () => Array.from(active.keys()),
  };
}
