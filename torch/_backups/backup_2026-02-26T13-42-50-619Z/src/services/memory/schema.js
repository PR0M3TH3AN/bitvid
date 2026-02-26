/**
 * @typedef {Object} MemoryEvent
 * @property {string} agent_id
 * @property {string} content
 * @property {number} [timestamp]
 * @property {string[]} [tags]
 * @property {Record<string, unknown>} [metadata]
 */

export const SCHEMA_VERSION = 1;

/**
 * @typedef {Object} MemoryRecord
 * @property {number} schema_version
 * @property {string} id
 * @property {string} agent_id
 * @property {string} session_id
 * @property {string} type
 * @property {string} content
 * @property {string} summary
 * @property {string[]} tags
 * @property {number} importance
 * @property {string | null} embedding_id
 * @property {number} created_at
 * @property {number} last_seen
 * @property {string} source
 * @property {number | null} ttl_days
 * @property {string | null} merged_into
 * @property {boolean} pinned
 */

/**
 * @param {MemoryEvent} event
 * @returns {MemoryEvent}
 */
export function normalizeEvent(event) {
  return {
    ...event,
    timestamp: Number.isFinite(event?.timestamp) ? Number(event.timestamp) : Date.now(),
    tags: Array.isArray(event?.tags)
      ? event.tags.map((tag) => String(tag)).filter((tag) => tag.length > 0)
      : [],
    metadata: event?.metadata && typeof event.metadata === 'object' ? event.metadata : {},
  };
}

/**
 * @param {Partial<MemoryRecord>} input
 * @returns {MemoryRecord}
 */
export function normalizeMemoryItem(input = {}) {
  const now = Date.now();

  return {
    schema_version: SCHEMA_VERSION,
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : crypto.randomUUID(),
    agent_id: typeof input.agent_id === 'string' ? input.agent_id.trim() : '',
    session_id: typeof input.session_id === 'string' ? input.session_id.trim() : 'unknown',
    type: typeof input.type === 'string' && input.type.trim() ? input.type.trim() : 'event',
    content: typeof input.content === 'string' ? input.content : '',
    summary: typeof input.summary === 'string' ? input.summary : '',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0)
      : [],
    importance: Number.isFinite(input.importance)
      ? Math.max(0, Math.min(1, Number(input.importance)))
      : 0.5,
    embedding_id: typeof input.embedding_id === 'string' && input.embedding_id.trim()
      ? input.embedding_id.trim()
      : null,
    created_at: Number.isFinite(input.created_at) ? Number(input.created_at) : now,
    last_seen: Number.isFinite(input.last_seen) ? Number(input.last_seen) : now,
    source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'ingest',
    ttl_days: Number.isFinite(input.ttl_days) ? Math.max(0, Math.floor(Number(input.ttl_days))) : null,
    merged_into: typeof input.merged_into === 'string' && input.merged_into.trim()
      ? input.merged_into.trim()
      : null,
    pinned: Boolean(input.pinned),
  };
}

/**
 * @param {unknown} item
 * @returns {{ valid: boolean, errors: Array<{ field: string, expected: string, received: string, value: unknown }> }}
 */
export function validateMemoryItem(item) {
  const errors = [];

  const check = (condition, field, expected, value) => {
    if (!condition) {
      errors.push({
        field,
        expected,
        received: Array.isArray(value) ? 'array' : typeof value,
        value,
      });
    }
  };

  check(item && typeof item === 'object', 'item', 'object', item);
  if (!item || typeof item !== 'object') {
    return { valid: false, errors };
  }

  check(item.schema_version === SCHEMA_VERSION, 'schema_version', `number (${SCHEMA_VERSION})`, item.schema_version);
  check(typeof item.id === 'string' && item.id.length > 0, 'id', 'non-empty string', item.id);
  check(typeof item.agent_id === 'string' && item.agent_id.length > 0, 'agent_id', 'non-empty string', item.agent_id);
  check(typeof item.session_id === 'string' && item.session_id.length > 0, 'session_id', 'non-empty string', item.session_id);
  check(typeof item.type === 'string' && item.type.length > 0, 'type', 'non-empty string', item.type);
  check(typeof item.content === 'string', 'content', 'string', item.content);
  check(typeof item.summary === 'string', 'summary', 'string', item.summary);
  check(Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string'), 'tags', 'string[]', item.tags);
  check(Number.isFinite(item.importance) && item.importance >= 0 && item.importance <= 1, 'importance', 'number between 0 and 1', item.importance);
  check(item.embedding_id === null || (typeof item.embedding_id === 'string' && item.embedding_id.length > 0), 'embedding_id', 'null or non-empty string', item.embedding_id);
  check(Number.isFinite(item.created_at), 'created_at', 'finite number', item.created_at);
  check(Number.isFinite(item.last_seen), 'last_seen', 'finite number', item.last_seen);
  check(typeof item.source === 'string' && item.source.length > 0, 'source', 'non-empty string', item.source);
  check(item.ttl_days === null || (Number.isInteger(item.ttl_days) && item.ttl_days >= 0), 'ttl_days', 'null or non-negative integer', item.ttl_days);
  check(item.merged_into === null || (typeof item.merged_into === 'string' && item.merged_into.length > 0), 'merged_into', 'null or non-empty string', item.merged_into);
  check(typeof item.pinned === 'boolean', 'pinned', 'boolean', item.pinned);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * @param {Partial<MemoryRecord>} record
 * @returns {MemoryRecord}
 */
export function createMemoryRecord(record) {
  return normalizeMemoryItem(record);
}
