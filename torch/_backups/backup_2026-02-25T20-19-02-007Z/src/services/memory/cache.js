const DEFAULT_MAX_NAMESPACES = 128;
const DEFAULT_MAX_EVENTS_PER_NAMESPACE = 200;
const DEFAULT_MAX_TOTAL_EVENTS = 5000;

function normalizeScope(scope = {}) {
  const signerId = typeof scope.signer_id === 'string' && scope.signer_id.trim()
    ? scope.signer_id.trim()
    : 'anonymous-signer';
  const sessionId = typeof scope.session_id === 'string' && scope.session_id.trim()
    ? scope.session_id.trim()
    : 'anonymous-session';

  return { signer_id: signerId, session_id: sessionId };
}

function getNamespaceKey(scope) {
  const normalized = normalizeScope(scope);
  return `${normalized.signer_id}::${normalized.session_id}`;
}

function isEventSensitive(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.is_decrypted === true || event.session_sensitive === true) return true;

  const classification = typeof event.classification === 'string' ? event.classification.toLowerCase() : '';
  return classification === 'decrypted' || classification === 'session-sensitive';
}

function canPromoteToDurableStorage(event) {
  if (!isEventSensitive(event)) return true;
  return event.sanitized_for_durable === true;
}

/**
 * @param {{ maxNamespaces?: number, maxEventsPerNamespace?: number, maxTotalEvents?: number }} [options]
 * @returns {{
 *  get: (key: string) => unknown,
 *  set: (key: string, value: unknown) => void,
 *  delete: (key: string) => boolean,
 *  clear: () => void,
 *  setRuntimeEvent: (scope: { signer_id?: string, session_id?: string }, event: Record<string, unknown>, ttlMs?: number) => boolean,
 *  getRecentRuntimeEvents: (scope: { signer_id?: string, session_id?: string }, params?: { limit?: number, since?: number }) => Record<string, unknown>[],
 *  clearScope: (scope: { signer_id?: string, session_id?: string }) => void,
 *  getMetrics: () => Record<string, number>
 * }}
 */
export function createMemoryCache(options = {}) {
  const store = new Map();
  const runtimeNamespaces = new Map();
  const maxNamespaces = Number.isFinite(options.maxNamespaces) && options.maxNamespaces > 0
    ? Math.floor(options.maxNamespaces)
    : DEFAULT_MAX_NAMESPACES;
  const maxEventsPerNamespace = Number.isFinite(options.maxEventsPerNamespace) && options.maxEventsPerNamespace > 0
    ? Math.floor(options.maxEventsPerNamespace)
    : DEFAULT_MAX_EVENTS_PER_NAMESPACE;
  const maxTotalEvents = Number.isFinite(options.maxTotalEvents) && options.maxTotalEvents > 0
    ? Math.floor(options.maxTotalEvents)
    : DEFAULT_MAX_TOTAL_EVENTS;

  let totalRuntimeEvents = 0;
  const metrics = {
    runtime_events_added: 0,
    runtime_events_expired: 0,
    runtime_events_lru_evicted: 0,
    runtime_scopes_cleared: 0,
    runtime_sensitive_events_blocked: 0,
  };

  function touchNamespace(key) {
    const bucket = runtimeNamespaces.get(key);
    if (!bucket) return;
    runtimeNamespaces.delete(key);
    runtimeNamespaces.set(key, bucket);
  }

  function evictNamespace(key) {
    const bucket = runtimeNamespaces.get(key);
    if (!bucket) return;
    totalRuntimeEvents -= bucket.events.length;
    metrics.runtime_events_lru_evicted += bucket.events.length;
    runtimeNamespaces.delete(key);
  }

  function evictOldestNamespaceIfNeeded() {
    while (runtimeNamespaces.size > maxNamespaces) {
      const oldestKey = runtimeNamespaces.keys().next().value;
      if (!oldestKey) return;
      evictNamespace(oldestKey);
    }
  }

  function removeExpired(now = Date.now()) {
    for (const [namespaceKey, bucket] of runtimeNamespaces.entries()) {
      if (!bucket.events.length) continue;

      const originalLength = bucket.events.length;
      bucket.events = bucket.events.filter((entry) => entry.expiresAt > now);
      const removed = originalLength - bucket.events.length;
      if (removed > 0) {
        totalRuntimeEvents -= removed;
        metrics.runtime_events_expired += removed;
      }

      if (bucket.events.length === 0) {
        runtimeNamespaces.delete(namespaceKey);
      }
    }
  }

  function enforceEventBounds(namespaceKey) {
    const bucket = runtimeNamespaces.get(namespaceKey);
    if (!bucket) return;

    while (bucket.events.length > maxEventsPerNamespace) {
      bucket.events.shift();
      totalRuntimeEvents -= 1;
      metrics.runtime_events_lru_evicted += 1;
    }

    while (totalRuntimeEvents > maxTotalEvents) {
      const oldestNamespaceKey = runtimeNamespaces.keys().next().value;
      if (!oldestNamespaceKey) return;
      const oldestBucket = runtimeNamespaces.get(oldestNamespaceKey);
      if (!oldestBucket || oldestBucket.events.length === 0) {
        runtimeNamespaces.delete(oldestNamespaceKey);
        continue;
      }

      oldestBucket.events.shift();
      totalRuntimeEvents -= 1;
      metrics.runtime_events_lru_evicted += 1;
      if (oldestBucket.events.length === 0) {
        runtimeNamespaces.delete(oldestNamespaceKey);
      }
    }
  }

  return {
    get(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, value);
    },
    delete(key) {
      return store.delete(key);
    },
    clear() {
      store.clear();
      runtimeNamespaces.clear();
      totalRuntimeEvents = 0;
    },
    setRuntimeEvent(scope, event, ttlMs = 60_000) {
      const now = Date.now();
      removeExpired(now);

      const safeTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000;
      const expiresAt = now + safeTtlMs;
      const namespaceKey = getNamespaceKey(scope);
      const bucket = runtimeNamespaces.get(namespaceKey) ?? { events: [] };

      bucket.events.push({
        event,
        createdAt: now,
        expiresAt,
        durableEligible: canPromoteToDurableStorage(event),
      });

      totalRuntimeEvents += 1;
      metrics.runtime_events_added += 1;
      if (!canPromoteToDurableStorage(event)) {
        metrics.runtime_sensitive_events_blocked += 1;
      }

      runtimeNamespaces.set(namespaceKey, bucket);
      touchNamespace(namespaceKey);
      evictOldestNamespaceIfNeeded();
      enforceEventBounds(namespaceKey);
      return true;
    },
    getRecentRuntimeEvents(scope, params = {}) {
      const now = Date.now();
      removeExpired(now);

      const namespaceKey = getNamespaceKey(scope);
      const bucket = runtimeNamespaces.get(namespaceKey);
      if (!bucket) return [];

      touchNamespace(namespaceKey);

      const limit = Number.isFinite(params.limit) && params.limit > 0 ? Math.floor(params.limit) : 50;
      const since = Number.isFinite(params.since) ? params.since : 0;

      return bucket.events
        .filter((entry) => entry.createdAt >= since)
        .slice(-limit)
        .map((entry) => ({
          ...entry.event,
          durable_eligible: entry.durableEligible,
        }));
    },
    clearScope(scope) {
      const namespaceKey = getNamespaceKey(scope);
      const bucket = runtimeNamespaces.get(namespaceKey);
      if (!bucket) return;
      totalRuntimeEvents -= bucket.events.length;
      metrics.runtime_scopes_cleared += 1;
      runtimeNamespaces.delete(namespaceKey);
    },
    getMetrics() {
      return {
        ...metrics,
        runtime_active_namespaces: runtimeNamespaces.size,
        runtime_active_events: totalRuntimeEvents,
      };
    },
  };
}
