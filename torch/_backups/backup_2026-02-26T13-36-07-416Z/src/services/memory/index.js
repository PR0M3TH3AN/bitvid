import { createMemoryCache } from './cache.js';
import { ingestMemoryWindow } from './ingestor.js';
import { listPruneCandidates, selectPrunableMemories } from './pruner.js';
import { filterAndRankMemories, updateMemoryUsage } from './retriever.js';
import { startScheduler } from './scheduler.js';
import { getMemoryPruneMode, isMemoryIngestEnabled } from './feature-flags.js';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

/*
 * Memory service flow:
 * 1) `ingestEvents` validates/transforms raw events via `ingestMemoryWindow`, persists records, and clears retrieval cache.
 * 2) `getRelevantMemories` applies cached lookup + ranking, updates usage timestamps, emits telemetry/metrics, and caches results.
 * 3) Admin flows (`runPruneCycle`, pin/unpin, merge, list/inspect/stats) mutate or inspect the same backing store.
 *
 * Key invariants:
 * - `memoryStore` is the process-local source of truth and is asynchronously persisted to `.scheduler-memory/memory-store.json`.
 * - Any mutation that affects retrieval semantics clears the in-memory cache.
 * - Save operations are serialized/coalesced (`currentSavePromise` + `pendingSavePromise`) so concurrent writes do not overlap.
 */

const MEMORY_FILE_PATH = path.join(process.cwd(), '.scheduler-memory', 'memory-store.json');
const debug = util.debuglog('torch-memory');

function loadMemoryStore() {
  try {
    if (fs.existsSync(MEMORY_FILE_PATH)) {
      const data = fs.readFileSync(MEMORY_FILE_PATH, 'utf8');
      const entries = JSON.parse(data);
      if (Array.isArray(entries)) {
        return new Map(entries);
      }
    }
  } catch (err) {
    console.error('Failed to load memory store:', err);
  }
  return new Map();
}

let currentSavePromise = null;
let pendingSavePromise = null;
let pendingSaveResolve = null;
let lastSaveTime = 0;
const MIN_SAVE_INTERVAL_MS = 1000;

async function performSave(store) {
  try {
    const now = Date.now();
    const timeSinceLast = now - lastSaveTime;
    if (timeSinceLast < MIN_SAVE_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_SAVE_INTERVAL_MS - timeSinceLast));
    }

    const dir = path.dirname(MEMORY_FILE_PATH);
    await fs.promises.mkdir(dir, { recursive: true });
    const entries = [...store.entries()];
    const tmpPath = `${MEMORY_FILE_PATH}.${Date.now()}.${Math.random()}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(entries, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, MEMORY_FILE_PATH);
    lastSaveTime = Date.now();
  } catch (err) {
    console.error('Failed to save memory store:', err);
  } finally {
    currentSavePromise = null;
    if (pendingSavePromise) {
      const resolve = pendingSaveResolve;
      pendingSavePromise = null;
      pendingSaveResolve = null;
      currentSavePromise = performSave(store).then(() => resolve());
    }
  }
}

async function saveMemoryStore(store) {
  if (pendingSavePromise) {
    return pendingSavePromise;
  }

  if (currentSavePromise) {
    pendingSavePromise = new Promise((resolve) => {
      pendingSaveResolve = resolve;
    });
    return pendingSavePromise;
  }

  currentSavePromise = performSave(store);
  return currentSavePromise;
}

const memoryStore = loadMemoryStore();
const cache = createMemoryCache();

let storeVersion = 0;
let cachedMemoriesArray = null;
let cachedMemoriesVersion = -1;

function getMemoriesArray() {
  if (cachedMemoriesVersion !== storeVersion || !cachedMemoriesArray) {
    cachedMemoriesArray = [...memoryStore.values()];
    cachedMemoriesVersion = storeVersion;
  }
  return cachedMemoriesArray;
}

const memoryRepository = {
  async insertMemory(memory) {
    memoryStore.set(memory.id, memory);
    storeVersion++;
    await saveMemoryStore(memoryStore);
    return memory;
  },
  async updateMemoryUsage(id, lastSeen = Date.now()) {
    const existing = memoryStore.get(id);
    if (!existing) return null;
    const updated = { ...existing, last_seen: lastSeen };
    memoryStore.set(id, updated);
    storeVersion++;
    saveMemoryStore(memoryStore).catch((err) => console.error('Failed to save memory usage update:', err));
    return updated;
  },
  async listPruneCandidates({ cutoff }) {
    return getMemoriesArray().filter((memory) => !memory.pinned && memory.last_seen < cutoff);
  },
  async markMerged(id, mergedInto) {
    const existing = memoryStore.get(id);
    if (!existing) return false;
    memoryStore.set(id, { ...existing, merged_into: mergedInto, last_seen: Date.now() });
    storeVersion++;
    await saveMemoryStore(memoryStore);
    return true;
  },
  async setPinned(id, pinned) {
    const existing = memoryStore.get(id);
    if (!existing) return null;
    const updated = { ...existing, pinned, last_seen: Date.now() };
    memoryStore.set(id, updated);
    storeVersion++;
    await saveMemoryStore(memoryStore);
    return updated;
  },
  async getMemoryById(id) {
    return memoryStore.get(id) ?? null;
  },
  async listMemories() {
    return getMemoriesArray();
  },
};

const memoryStatsState = {
  ingested: [],
  retrieved: [],
  pruned: [],
  archived: 0,
  deleted: 0,
};

const ESTIMATED_INDEX_BYTES_PER_RECORD = 512;

function toSafeTelemetryPayload(payload = {}) {
  const blockedFields = new Set(['content', 'summary', 'query', 'raw']);
  return Object.entries(payload).reduce((safe, [key, value]) => {
    if (blockedFields.has(key)) return safe;
    if (typeof value === 'string' && value.length > 300) {
      safe[key] = `${value.slice(0, 300)}…`;
      return safe;
    }
    safe[key] = value;
    return safe;
  }, {});
}

function buildTelemetryEmitter(options = {}) {
  if (typeof options.emitTelemetry === 'function') {
    return (event, payload) => options.emitTelemetry(event, toSafeTelemetryPayload(payload));
  }

  if (typeof options.telemetry?.emit === 'function') {
    return (event, payload) => options.telemetry.emit(event, toSafeTelemetryPayload(payload));
  }

  return (event, payload) => {
    debug('memory_telemetry', {
      event,
      payload: toSafeTelemetryPayload(payload),
      ts: Date.now(),
    });
  };
}

function emitMetric(options = {}, metric, payload) {
  if (typeof options.emitMetric === 'function') {
    options.emitMetric(metric, payload);
    return;
  }

  if (typeof options.metrics?.emit === 'function') {
    options.metrics.emit(metric, payload);
    return;
  }

  debug('memory_metric', { metric, payload, ts: Date.now() });
}

function applyMemoryFilters(memories, filters = {}) {
  const tags = Array.isArray(filters.tags)
    ? filters.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  return memories.filter((memory) => {
    if (filters.agent_id && memory.agent_id !== filters.agent_id) return false;
    if (filters.type && memory.type !== filters.type) return false;
    if (typeof filters.pinned === 'boolean' && memory.pinned !== filters.pinned) return false;
    if (typeof filters.includeMerged === 'boolean' && !filters.includeMerged && memory.merged_into) return false;
    if (tags.length > 0) {
      const memoryTags = new Set(memory.tags);
      if (!tags.every((tag) => memoryTags.has(tag))) return false;
    }
    return true;
  });
}

function recordThroughput(samples, now) {
  samples.push(now);
  if (samples.length > 10_000) {
    samples.splice(0, samples.length - 10_000);
  }
}

/**
 * Ingests agent events and stores them as memory records.
 *
 * @param {import('./schema.js').MemoryEvent[]} events - Ordered list of raw events to persist.
 * @param {{ agent_id?: string, env?: NodeJS.ProcessEnv, maxSummaryLength?: number, embedText?: (value: string) => Promise<number[]> | number[], repository?: typeof memoryRepository, emitTelemetry?: (event: string, payload: object) => void, telemetry?: { emit?: (event: string, payload: object) => void }, emitMetric?: (metric: string, payload: object) => void, metrics?: { emit?: (metric: string, payload: object) => void } }} [options] - Optional ingest tuning and dependency injection hooks.
 * @returns {Promise<import('./schema.js').MemoryRecord[]>} Stored memory records.
 * @throws {Error} Propagates validation/ingest failures from `ingestMemoryWindow` or repository calls.
 * @example
 * await ingestEvents([{ agent_id: 'agent-a', content: 'event payload', timestamp: Date.now() }], { agent_id: 'agent-a' });
 */
export async function ingestEvents(events, options = {}) {
  const repository = options.repository ?? memoryRepository;
  const telemetry = buildTelemetryEmitter(options);
  if (!isMemoryIngestEnabled(options.agent_id, options.env)) {
    telemetry('memory:ingest_skipped', { reason: 'flag_disabled', agent_id: options.agent_id ?? null });
    return [];
  }
  const records = await ingestMemoryWindow({ events }, {
    ...options,
    repository,
    emitTelemetry: (event, payload) => {
      telemetry(event, payload);
      if (event === 'memory:ingested') {
        recordThroughput(memoryStatsState.ingested, Date.now());
        emitMetric(options, 'memory_ingested_total', { count: 1 });
      }
    },
  });
  cache.clear();
  return records;
}

/**
 * Retrieves top-k memories for an agent query.
 *
 * @param {{ agent_id: string, query?: string, tags?: string[], timeframe?: { from?: number, to?: number }, k?: number, repository?: typeof memoryRepository, ranker?: typeof filterAndRankMemories, cache?: { get: (key: string) => import('./schema.js').MemoryRecord[] | undefined, set: (key: string, value: import('./schema.js').MemoryRecord[]) => void }, emitTelemetry?: (event: string, payload: object) => void, telemetry?: { emit?: (event: string, payload: object) => void }, emitMetric?: (metric: string, payload: object) => void, metrics?: { emit?: (metric: string, payload: object) => void } }} params - Retrieval filter, ranking inputs, and optional hooks.
 * @returns {Promise<import('./schema.js').MemoryRecord[]>} Sorted list of relevant memories.
 * @throws {Error} Propagates repository/ranker/update failures.
 * @example
 * const top = await getRelevantMemories({ agent_id: 'agent-a', query: 'scheduler memory retrieval', k: 5 });
 */
export async function getRelevantMemories(params) {
  const {
    repository = memoryRepository,
    ranker = filterAndRankMemories,
    cache: cacheProvider = cache,
    ...queryParams
  } = params;
  const telemetry = buildTelemetryEmitter(params);
  const cacheKey = JSON.stringify(queryParams);
  const cached = cacheProvider.get(cacheKey);
  if (cached) {
    telemetry('memory:retrieved', {
      agent_id: queryParams.agent_id,
      result_count: cached.length,
      cache_hit: true,
      query_present: Boolean(queryParams.query),
      query_length: typeof queryParams.query === 'string' ? queryParams.query.length : 0,
      tags_count: Array.isArray(queryParams.tags) ? queryParams.tags.length : 0,
    });
    emitMetric(params, 'memory_retrieved_total', { count: cached.length, cache_hit: true });
    recordThroughput(memoryStatsState.retrieved, Date.now());
    return cached;
  }

  const source = typeof repository.listMemories === 'function'
    ? await repository.listMemories(queryParams)
    : getMemoriesArray();

  const ranked = await ranker(source, queryParams);
  await updateMemoryUsage(repository, ranked.map((memory) => memory.id));
  cacheProvider.set(cacheKey, ranked);

  telemetry('memory:retrieved', {
    agent_id: queryParams.agent_id,
    result_count: ranked.length,
    cache_hit: false,
    query_present: Boolean(queryParams.query),
    query_length: typeof queryParams.query === 'string' ? queryParams.query.length : 0,
    tags_count: Array.isArray(queryParams.tags) ? queryParams.tags.length : 0,
  });
  emitMetric(params, 'memory_retrieved_total', { count: ranked.length, cache_hit: false });
  recordThroughput(memoryStatsState.retrieved, Date.now());

  return ranked;
}

/**
 * Runs a memory pruning pass and removes unpinned stale records.
 *
 * @param {{ retentionMs?: number, now?: number, scheduleEveryMs?: number, repository?: typeof memoryRepository, env?: NodeJS.ProcessEnv, pruneMode?: 'off' | 'dry-run' | 'on', emitTelemetry?: (event: string, payload: object) => void, telemetry?: { emit?: (event: string, payload: object) => void }, emitMetric?: (metric: string, payload: object) => void, metrics?: { emit?: (metric: string, payload: object) => void } }} [options] - Prune configuration and optional dependency hooks.
 * @returns {Promise<{ pruned: import('./schema.js').MemoryRecord[], mode?: 'off' | 'dry-run', candidates?: import('./schema.js').MemoryRecord[], scheduler?: { stop: () => void } }>} Prune result. `mode`/`candidates` are returned for non-destructive modes.
 * @throws {Error} Propagates repository listing or scheduler start failures.
 * @example
 * const result = await runPruneCycle({ retentionMs: 30 * 24 * 60 * 60 * 1000 });
 */
export async function runPruneCycle(options = {}) {
  const repository = options.repository ?? memoryRepository;
  const telemetry = buildTelemetryEmitter(options);
  const retentionMs = options.retentionMs ?? (1000 * 60 * 60 * 24 * 30);
  const pruneMode = options.pruneMode ?? getMemoryPruneMode(options.env);
  const dbCandidates = await listPruneCandidates(repository, {
    retentionMs,
    now: options.now,
  });

  const prunable = dbCandidates.length > 0
    ? dbCandidates
    : selectPrunableMemories(getMemoriesArray(), {
      retentionMs,
      now: options.now,
    });

  if (pruneMode === 'off') {
    telemetry('memory:prune_skipped', { reason: 'flag_disabled', retention_ms: retentionMs });
    return { pruned: [], mode: 'off' };
  }

  if (pruneMode === 'dry-run') {
    telemetry('memory:pruned', {
      pruned_count: prunable.length,
      retention_ms: retentionMs,
      dry_run: true,
    });
    emitMetric(options, 'memory_pruned_total', { count: 0, retention_ms: retentionMs, dry_run: true });
    return { pruned: [], candidates: prunable, mode: 'dry-run' };
  }

  for (const memory of prunable) {
    memoryStore.delete(memory.id);
  }

  if (prunable.length > 0) {
    storeVersion++;
    await saveMemoryStore(memoryStore);
  }

  memoryStatsState.deleted += prunable.length;
  recordThroughput(memoryStatsState.pruned, Date.now());
  telemetry('memory:pruned', {
    pruned_count: prunable.length,
    retention_ms: retentionMs,
  });
  emitMetric(options, 'memory_pruned_total', { count: prunable.length, retention_ms: retentionMs });

  cache.clear();

  const result = { pruned: prunable };
  if (Number.isFinite(options.scheduleEveryMs) && options.scheduleEveryMs > 0) {
    result.scheduler = startScheduler(() => runPruneCycle({ retentionMs, repository, env: options.env, pruneMode: options.pruneMode }), {
      intervalMs: options.scheduleEveryMs,
    });
  }

  return result;
}

/**
 * Pins a memory to prevent pruning and boost retrieval ranking.
 *
 * @param {string} id - Memory record identifier.
 * @param {{ repository?: typeof memoryRepository }} [options] - Optional repository override for tests/integration wiring.
 * @returns {Promise<import('./schema.js').MemoryRecord | null>} Updated memory record or null when not found.
 * @throws {Error} Propagates repository update failures.
 * @example
 * await pinMemory('mem_123');
 */
export async function pinMemory(id, options = {}) {
  const repository = options.repository ?? memoryRepository;
  const updated = await repository.setPinned(id, true);
  cache.clear();
  return updated;
}

/**
 * Removes a pin from a memory so it can be pruned normally.
 *
 * @param {string} id - Memory record identifier.
 * @param {{ repository?: typeof memoryRepository }} [options] - Optional repository override for tests/integration wiring.
 * @returns {Promise<import('./schema.js').MemoryRecord | null>} Updated memory record or null when not found.
 * @throws {Error} Propagates repository update failures.
 * @example
 * await unpinMemory('mem_123');
 */
export async function unpinMemory(id, options = {}) {
  const repository = options.repository ?? memoryRepository;
  const updated = await repository.setPinned(id, false);
  cache.clear();
  return updated;
}

/**
 * Marks one memory as merged into another.
 *
 * @param {string} id - Source memory identifier to mark as merged.
 * @param {string} mergedInto - Destination memory identifier.
 * @param {{ repository?: typeof memoryRepository }} [options] - Optional repository override for tests/integration wiring.
 * @returns {Promise<boolean>} `true` when source memory existed and was marked; otherwise `false`.
 * @throws {Error} Propagates repository update failures.
 * @example
 * await markMemoryMerged('mem_old', 'mem_canonical');
 */
export async function markMemoryMerged(id, mergedInto, options = {}) {
  const repository = options.repository ?? memoryRepository;
  const merged = await repository.markMerged(id, mergedInto);
  cache.clear();
  return merged;
}

/**
 * Lists memory records with optional boundary-level filters and pagination.
 *
 * @param {{ agent_id?: string, type?: string, pinned?: boolean, includeMerged?: boolean, tags?: string[], offset?: number, limit?: number }} [filters] - Filter and pagination controls.
 * @param {{ repository?: typeof memoryRepository }} [options] - Optional repository override.
 * @returns {Promise<import('./schema.js').MemoryRecord[]>} Filtered records sorted by descending `last_seen`.
 * @throws {Error} Propagates repository list failures.
 * @example
 * const rows = await listMemories({ agent_id: 'agent-a', pinned: true, limit: 20 });
 */
export async function listMemories(filters = {}, options = {}) {
  const repository = options.repository ?? memoryRepository;
  const source = typeof repository.listMemories === 'function'
    ? await repository.listMemories(filters)
    : getMemoriesArray();

  const filtered = applyMemoryFilters(source, filters)
    .sort((left, right) => right.last_seen - left.last_seen);

  const offset = Number.isFinite(filters.offset) ? Math.max(0, Number(filters.offset)) : 0;
  const limit = Number.isFinite(filters.limit)
    ? Math.max(1, Math.floor(Number(filters.limit)))
    : filtered.length;

  return filtered.slice(offset, offset + limit);
}

/**
 * Retrieves a single memory by id.
 *
 * @param {string} id - Memory record identifier.
 * @param {{ repository?: typeof memoryRepository }} [options] - Optional repository override.
 * @returns {Promise<import('./schema.js').MemoryRecord | null>} Memory record or `null` if not found.
 * @throws {Error} Propagates repository read failures.
 * @example
 * const memory = await inspectMemory('mem_123');
 */
export async function inspectMemory(id, options = {}) {
  const repository = options.repository ?? memoryRepository;
  if (typeof repository.getMemoryById === 'function') {
    return repository.getMemoryById(id);
  }
  return memoryStore.get(id) ?? null;
}

/**
 * Simulates prune selection without deleting data.
 *
 * @param {{ retentionMs?: number, now?: number, repository?: typeof memoryRepository }} [options] - Dry-run selection controls.
 * @returns {Promise<{ dryRun: true, retentionMs: number, candidateCount: number, candidates: Array<{ id: string, agent_id: string, type: string, pinned: boolean, last_seen: number, merged_into?: string | null }> }>} Dry-run summary and redacted candidates.
 * @throws {Error} Propagates repository list/selection failures.
 * @example
 * const preview = await triggerPruneDryRun({ retentionMs: 7 * 24 * 60 * 60 * 1000 });
 */
export async function triggerPruneDryRun(options = {}) {
  const repository = options.repository ?? memoryRepository;
  const retentionMs = options.retentionMs ?? (1000 * 60 * 60 * 24 * 30);
  const dbCandidates = await listPruneCandidates(repository, {
    retentionMs,
    now: options.now,
  });

  const candidates = dbCandidates.length > 0
    ? dbCandidates
    : selectPrunableMemories(await listMemories({}, { repository }), {
      retentionMs,
      now: options.now,
    });

  return {
    dryRun: true,
    retentionMs,
    candidateCount: candidates.length,
    candidates: candidates.map((memory) => ({
      id: memory.id,
      agent_id: memory.agent_id,
      type: memory.type,
      pinned: memory.pinned,
      last_seen: memory.last_seen,
      merged_into: memory.merged_into,
    })),
  };
}

/**
 * Returns aggregate memory counts and throughput estimates for observability.
 *
 * @param {{ repository?: typeof memoryRepository, now?: number, windowMs?: number }} [options] - Stats window and repository controls.
 * @returns {Promise<{ countsByType: Record<string, number>, totals: { total: number, pinned: number, archived: number, deletedObserved: number }, rates: { archivedRate: number, deletedRate: number }, indexSizeEstimateBytes: number, ingestThroughputPerMinute: number }>} Current memory aggregate snapshot.
 * @throws {Error} Propagates repository list failures.
 * @example
 * const stats = await memoryStats({ windowMs: 60 * 60 * 1000 });
 */
export async function memoryStats(options = {}) {
  const repository = options.repository ?? memoryRepository;
  const now = options.now ?? Date.now();
  const windowMs = Number.isFinite(options.windowMs) ? Math.max(1, Number(options.windowMs)) : (60 * 60 * 1000);
  const memories = await listMemories({}, { repository });

  const countsByType = memories.reduce((acc, memory) => {
    acc[memory.type] = (acc[memory.type] ?? 0) + 1;
    return acc;
  }, {});

  const archivedCount = memories.filter((memory) => Boolean(memory.merged_into)).length;
  const deletedRate = memoryStatsState.deleted / Math.max(1, memoryStatsState.ingested.length);
  const archivedRate = archivedCount / Math.max(1, memories.length);

  const ingestedInWindow = memoryStatsState.ingested.filter((timestamp) => timestamp >= (now - windowMs)).length;
  const ingestThroughputPerMinute = ingestedInWindow / Math.max(1, (windowMs / 60_000));

  return {
    countsByType,
    totals: {
      total: memories.length,
      pinned: memories.filter((memory) => memory.pinned).length,
      archived: archivedCount,
      deletedObserved: memoryStatsState.deleted,
    },
    rates: {
      archivedRate,
      deletedRate,
    },
    indexSizeEstimateBytes: memories.length * ESTIMATED_INDEX_BYTES_PER_RECORD,
    ingestThroughputPerMinute,
  };
}
