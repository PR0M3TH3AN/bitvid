import { SimplePool } from 'nostr-tools/pool';
import {
  getQueryTimeoutMs,
  getRelayFallbacks,
  getMinActiveRelayPool,
} from './torch-config.mjs';
import {
  KIND_APP_DATA,
  MS_PER_SECOND,
} from './constants.mjs';
import { nowUnix } from './utils.mjs';
import { defaultHealthManager, buildRelayHealthConfig, RelayHealthManager } from './relay-health-manager.mjs';
import { publishLock, LockPublisher } from './lock-publisher.mjs';
import {
  withTimeout,
  relayListLabel,
  mergeRelayList,
  secureRandom,
} from './lock-utils.mjs';

/**
 * Parses a raw Nostr event into a structured lock object.
 * Extracts metadata from tags (d-tag, expiration) and parses the JSON content.
 *
 * @param {Object} event - The raw Nostr event object.
 * @returns {Object} A structured lock object containing event metadata and parsed content.
 */
export function parseLockEvent(event) {
  const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  const expTag = event.tags.find((t) => t[0] === 'expiration')?.[1];
  const expiresAt = expTag ? parseInt(expTag, 10) : null;

  let content = {};
  try {
    const parsed = JSON.parse(event.content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      content = parsed;
    }
  } catch {
    // Ignore malformed JSON content
  }

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    createdAtIso: new Date(event.created_at * MS_PER_SECOND).toISOString(),
    expiresAt,
    expiresAtIso: expiresAt ? new Date(expiresAt * MS_PER_SECOND).toISOString() : null,
    dTag,
    agent: content.agent ?? null,
    cadence: content.cadence ?? null,
    status: content.status ?? null,
    date: content.date ?? null,
    platform: content.platform ?? null,
  };
}

function filterActiveLocks(locks) {
  const now = nowUnix();
  return locks.filter((lock) => !lock.expiresAt || lock.expiresAt > now);
}

/**
 * Queries relays for active lock events matching the criteria.
 * Uses a tiered approach: tries primary relays first, then falls back to others if needed.
 *
 * @param {string[]} relays - List of primary relay URLs.
 * @param {string} cadence - The cadence (e.g., 'daily', 'weekly').
 * @param {string} dateStr - The date string (e.g., '2023-10-27').
 * @param {string} namespace - The lock namespace (e.g., 'torch').
 * @param {Object} [deps] - Dependencies and configuration overrides.
 * @returns {Promise<Array>} A promise resolving to an array of active lock objects.
 * @throws {Error} If the query fails on all attempted relays (primary + fallback).
 */
export async function queryLocks(relays, cadence, dateStr, namespace, deps = {}) {
  const {
    poolFactory = () => new SimplePool(),
    getQueryTimeoutMsFn = getQueryTimeoutMs,
    getRelayFallbacksFn = getRelayFallbacks,
    getMinActiveRelayPoolFn = getMinActiveRelayPool,
    errorLogger = console.error,
    healthLogger = console.error,
    healthManager = defaultHealthManager,
  } = deps;

  const pool = poolFactory();
  const tagFilter = `${namespace}-lock-${cadence}-${dateStr}`;
  const queryTimeoutMs = await getQueryTimeoutMsFn();
  const fallbackRelays = (await getRelayFallbacksFn()).filter((relay) => !relays.includes(relay));
  const healthConfig = buildRelayHealthConfig({
    ...deps,
    minActiveRelayPool: await getMinActiveRelayPoolFn(),
  });

  const runQuery = async (relaySet, phase) => {
    const { prioritized } = healthManager.prioritizeRelays(relaySet, healthConfig);
    if (prioritized.length > 0) {
      errorLogger(`[${phase}] Querying ${prioritized.length} relays (${relayListLabel(prioritized)})...`);
    }

    const startedAtMs = Date.now();
    try {
      const events = await withTimeout(
        pool.querySync(prioritized, {
          kinds: [KIND_APP_DATA],
          '#t': [tagFilter],
        }),
        queryTimeoutMs,
        `[${phase}] Relay query timed out after ${queryTimeoutMs}ms (relays: ${relayListLabel(prioritized)})`,
      );
      const elapsedMs = Date.now() - startedAtMs;
      for (const relay of prioritized) {
        healthManager.recordOutcome(relay, true, null, elapsedMs, healthConfig);
      }
      return filterActiveLocks(events.map(parseLockEvent));
    } catch (err) {
      const elapsedMs = Date.now() - startedAtMs;
      const message = err instanceof Error ? err.message : String(err);
      for (const relay of prioritized) {
        healthManager.recordOutcome(relay, false, message, elapsedMs, healthConfig);
      }
      throw new Error(
        `[${phase}] Relay query failed (timeout=${queryTimeoutMs}ms, relays=${relayListLabel(prioritized)}): ${message}`,
        { cause: err },
      );
    }
  };

  const allRelays = mergeRelayList(relays, fallbackRelays);

  try {
    healthManager.maybeLogSnapshot(allRelays, healthConfig, healthLogger, 'query:periodic');
    try {
      return await runQuery(relays, 'query:primary');
    } catch (primaryErr) {
      if (!fallbackRelays.length) {
        healthManager.maybeLogSnapshot(allRelays, healthConfig, healthLogger, 'query:failure', true);
        throw primaryErr;
      }
      errorLogger(`WARN: ${primaryErr.message}`);
      errorLogger(`WARN: retrying query with fallback relays (${relayListLabel(fallbackRelays)})`);
      return await runQuery(fallbackRelays, 'query:fallback');
    }
  } finally {
    pool.close(allRelays);
  }
}

export function _resetRelayHealthState() {
  defaultHealthManager.reset();
}

export {
  RelayHealthManager,
  defaultHealthManager,
  LockPublisher,
  publishLock,
};

export const _secureRandom = secureRandom;
