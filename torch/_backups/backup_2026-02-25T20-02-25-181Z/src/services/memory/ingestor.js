import { createHash, randomUUID } from 'node:crypto';
import { createMemoryRecord, normalizeEvent, validateMemoryItem } from './schema.js';
import { embedText, getDefaultEmbedderAdapter } from './embedder.js';
import { summarizeEvents } from './summarizer.js';

const WINDOW_BUCKET_MS = 60_000;
const MAX_DEDUPE_KEYS = 2000;
const dedupeWindow = new Map();

function pruneDedupeWindow() {
  while (dedupeWindow.size > MAX_DEDUPE_KEYS) {
    const oldestKey = dedupeWindow.keys().next().value;
    if (!oldestKey) break;
    dedupeWindow.delete(oldestKey);
  }
}

function redactObviousPii(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted:email]')
    .replace(/\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g, '[redacted:phone]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted:ssn]');
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function chunkEvents(events, options = {}) {
  const maxChunkChars = Number.isFinite(options.maxChunkChars) && options.maxChunkChars > 0
    ? Math.floor(options.maxChunkChars)
    : 1_200;
  const maxChunkTokens = Number.isFinite(options.maxChunkTokens) && options.maxChunkTokens > 0
    ? Math.floor(options.maxChunkTokens)
    : 300;

  const chunks = [];
  let currentChunk = [];
  let currentChars = 0;
  let currentTokens = 0;

  const flush = () => {
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
      currentTokens = 0;
    }
  };

  for (const event of events) {
    const eventChars = event.content.length;
    const eventTokens = estimateTokens(event.content);
    const overBudget = (currentChars + eventChars > maxChunkChars) || (currentTokens + eventTokens > maxChunkTokens);
    if (overBudget) {
      flush();
    }

    currentChunk.push(event);
    currentChars += eventChars;
    currentTokens += eventTokens;
  }

  flush();
  return chunks;
}

function hashIngestionWindow({ agentId, bucket, content }) {
  return createHash('sha256').update(`${agentId}|${bucket}|${content}`).digest('hex');
}

async function isDuplicateWindow(repository, dedupeKey) {
  if (dedupeWindow.has(dedupeKey)) return true;
  if (typeof repository?.hasIngestionFingerprint === 'function') {
    const exists = await repository.hasIngestionFingerprint(dedupeKey);
    if (exists) return true;
  }
  return false;
}

async function rememberWindowFingerprint(repository, dedupeKey, payload) {
  dedupeWindow.set(dedupeKey, payload);
  pruneDedupeWindow();
  if (typeof repository?.storeIngestionFingerprint === 'function') {
    await repository.storeIngestionFingerprint(dedupeKey, payload);
  }
}


function compactContextExcerpt(text, maxChars = 280) {
  if (typeof text !== 'string' || text.length === 0) return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1)}…`;
}

function buildTelemetryEmitter(options = {}) {
  if (typeof options.emitTelemetry === 'function') return options.emitTelemetry;
  if (typeof options.telemetry?.emit === 'function') {
    return (event, payload) => options.telemetry.emit(event, payload);
  }
  return () => {};
}

/**
 * @param {import('./schema.js').MemoryEvent[]} events
 * @returns {import('./schema.js').MemoryEvent[]}
 */
export function normalizeEvents(events) {
  return events.map(normalizeEvent);
}

/**
 * @param {{
 *  events?: import('./schema.js').MemoryEvent[],
 *  runtimeCache?: { getRecentRuntimeEvents?: (scope: Record<string, unknown>, params?: { since?: number, limit?: number }) => Record<string, unknown>[] },
 *  runtimeScope?: Record<string, unknown>,
 *  logSource?: { getEvents?: (params: { from: number, to: number, agent_id?: string }) => Promise<Record<string, unknown>[]> | Record<string, unknown>[], fetchEvents?: (params: { from: number, to: number, agent_id?: string }) => Promise<Record<string, unknown>[]> | Record<string, unknown>[] },
 *  agent_id?: string,
 *  windowStart?: number,
 *  windowEnd?: number,
 * }} input
 * @param {{
 *  repository?: { insertMemory: (memory: import('./schema.js').MemoryRecord) => Promise<unknown>, hasIngestionFingerprint?: (dedupeKey: string) => Promise<boolean>, storeIngestionFingerprint?: (dedupeKey: string, payload: Record<string, unknown>) => Promise<void>, linkEmbedding?: (memoryId: string, embedding: { id: string, vector: number[] }) => Promise<unknown> },
 *  maxSummaryLength?: number,
 *  maxChunkChars?: number,
 *  maxChunkTokens?: number,
 *  embedText?: (value: string) => Promise<number[]> | number[],
 *  adapter?: import('./embedder.js').EmbedderAdapter,
 *  embedderAdapter?: import('./embedder.js').EmbedderAdapter,
 *  contextExcerptChars?: number,
 *  emitTelemetry?: (event: string, payload: Record<string, unknown>) => void,
 *  telemetry?: { emit: (event: string, payload: Record<string, unknown>) => void },
 *  now?: number,
 *  windowBucketMs?: number,
 * }} options
 * @returns {Promise<import('./schema.js').MemoryRecord[]>}
 */
export async function ingestMemoryWindow(input = {}, options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.insertMemory !== 'function') {
    throw new TypeError('Memory ingest requires a repository with insertMemory');
  }

  const emitTelemetry = buildTelemetryEmitter(options);
  const windowStart = Number.isFinite(input.windowStart) ? Number(input.windowStart) : 0;
  const windowEnd = Number.isFinite(input.windowEnd) ? Number(input.windowEnd) : (Number.isFinite(options.now) ? Number(options.now) : Date.now());

  const runtimeEvents = typeof input.runtimeCache?.getRecentRuntimeEvents === 'function'
    ? input.runtimeCache.getRecentRuntimeEvents(input.runtimeScope ?? {}, { since: windowStart, limit: 500 })
    : [];

  const logReader = input.logSource?.fetchEvents ?? input.logSource?.getEvents;
  const logEvents = typeof logReader === 'function'
    ? await logReader({ from: windowStart, to: windowEnd, agent_id: input.agent_id })
    : [];

  const normalizedEvents = normalizeEvents([
    ...(Array.isArray(input.events) ? input.events : []),
    ...(Array.isArray(runtimeEvents) ? runtimeEvents : []),
    ...(Array.isArray(logEvents) ? logEvents : []),
  ]);

  const redactedEvents = normalizedEvents.map((event) => ({
    ...event,
    content: redactObviousPii(event.content),
  }));

  const eventsByAgent = new Map();
  for (const event of redactedEvents) {
    const events = eventsByAgent.get(event.agent_id) ?? [];
    events.push(event);
    eventsByAgent.set(event.agent_id, events);
  }

  const insertedRecords = [];
  const bucketMs = Number.isFinite(options.windowBucketMs) && options.windowBucketMs > 0
    ? Math.floor(options.windowBucketMs)
    : WINDOW_BUCKET_MS;
  const bucket = Math.floor(windowEnd / bucketMs);

  for (const [agentId, agentEvents] of eventsByAgent.entries()) {
    if (!agentEvents.length) continue;
    const sorted = [...agentEvents].sort((a, b) => a.timestamp - b.timestamp);
    const dedupeContent = sorted.map((event) => `${event.timestamp}:${event.content}`).join('\n');
    const dedupeKey = hashIngestionWindow({ agentId, bucket, content: dedupeContent });

    if (await isDuplicateWindow(repository, dedupeKey)) {
      continue;
    }

    const chunks = chunkEvents(sorted, options);
    for (const chunk of chunks) {
      const summarization = await summarizeEvents(chunk, options);
      const contextText = chunk.map((event) => event.content).join('\n');
      const summaryEmbedding = await embedText(summarization.summary, options);
      const contextExcerpt = compactContextExcerpt(contextText, options.contextExcerptChars);
      const chunkStart = Math.min(...chunk.map((event) => event.timestamp));
      const chunkEnd = Math.max(...chunk.map((event) => event.timestamp));

      const record = createMemoryRecord({
        agent_id: agentId,
        session_id: typeof chunk[0]?.metadata?.session_id === 'string' ? chunk[0].metadata.session_id : 'unknown',
        type: 'batch_window',
        content: contextText,
        summary: summarization.summary,
        tags: [...new Set(chunk.flatMap((event) => event.tags))],
        importance: Number.isFinite(chunk[0]?.metadata?.importance)
          ? Number(chunk[0].metadata.importance)
          : summarization.importance,
        embedding_id: Array.isArray(summaryEmbedding) && summaryEmbedding.length > 0 ? randomUUID() : null,
        created_at: chunkStart,
        last_seen: chunkEnd,
        source: typeof chunk[0]?.metadata?.source === 'string' ? chunk[0].metadata.source : 'ingest',
        ttl_days: Number.isFinite(chunk[0]?.metadata?.ttl_days) ? Number(chunk[0].metadata.ttl_days) : null,
        merged_into: null,
        pinned: false,
      });

      const validation = validateMemoryItem(record);
      if (!validation.valid) {
        console.error('memory_validation_error', {
          stage: 'ingest',
          reason: 'record_failed_schema_validation',
          fields: validation.errors,
          item: record,
        });
        throw new TypeError('Memory ingest rejected: invalid durable record format');
      }

      await insertMemory(repository, record);
      insertedRecords.push(record);

      if (record.embedding_id) {
        const vectorMetadata = {
          memory_id: record.id,
          agent_id: record.agent_id,
          summary: record.summary,
          context_excerpt: contextExcerpt,
          source: record.source,
          created_at: record.created_at,
          last_seen: record.last_seen,
        };

        if (typeof repository.linkEmbedding === 'function') {
          await repository.linkEmbedding(record.id, {
            id: record.embedding_id,
            vector: summaryEmbedding,
            metadata: vectorMetadata,
          });
        }

        const adapter = options.embedderAdapter ?? options.adapter ?? getDefaultEmbedderAdapter();
        if (typeof adapter?.upsertVector === 'function') {
          await adapter.upsertVector({
            id: record.embedding_id,
            vector: summaryEmbedding,
            metadata: vectorMetadata,
          });
        }
      }

      emitTelemetry('memory:ingested', {
        memory_id: record.id,
        agent_id: record.agent_id,
        dedupe_key: dedupeKey,
        chunk_events: chunk.length,
        window_start: windowStart,
        window_end: windowEnd,
      });
    }

    await rememberWindowFingerprint(repository, dedupeKey, {
      agent_id: agentId,
      window_start: windowStart,
      window_end: windowEnd,
    });
  }

  return insertedRecords;
}

/**
 * @param {{ insertMemory: (memory: import('./schema.js').MemoryRecord) => Promise<unknown> }} repository
 * @param {import('./schema.js').MemoryRecord} memory
 */
export async function insertMemory(repository, memory) {
  return repository.insertMemory(memory);
}
