const DEFAULT_VECTOR_BACKEND = 'inmemory';
const VECTOR_BACKEND_ENV = 'MEMORY_VECTOR_BACKEND';

/**
 * @typedef {{
 *  embedText: (text: string) => Promise<number[]> | number[],
 *  upsertVector: (input: { id: string, vector: number[], metadata?: Record<string, unknown> }) => Promise<void> | void,
 *  queryVector: (input: { vector: number[], k?: number, filter?: Record<string, unknown> }) => Promise<Array<{ id: string, score: number, vector: number[], metadata: Record<string, unknown> }>> | Array<{ id: string, score: number, vector: number[], metadata: Record<string, unknown> }>,
 *  deleteVector: (id: string) => Promise<boolean> | boolean,
 * }} EmbedderAdapter
 */

/**
 * @param {string} text
 * @returns {number[]}
 */
function fallbackEmbedding(_text) {
  // Disabled as per configuration: Jules uses text-based memory, not vector embeddings.
  return [];
}

/**
 * @param {number[]} vector
 * @returns {number}
 */
function computeNorm(vector) {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) {
    norm += (vector[index] ?? 0) ** 2;
  }
  return Math.sqrt(norm);
}

function cosineSimilarity(left, right, leftNorm, rightNorm) {
  if (leftNorm === 0 || rightNorm === 0) return 0;

  const size = Math.min(left.length, right.length);
  let dot = 0;

  for (let index = 0; index < size; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return dot / (leftNorm * rightNorm);
}

/** @implements {EmbedderAdapter} */
class InMemoryEmbedderAdapter {
  constructor() {
    this.vectors = new Map();
  }

  /** @param {string} text */
  async embedText(text) {
    return fallbackEmbedding(text);
  }

  /** @param {{ id: string, vector: number[], metadata?: Record<string, unknown> }} input */
  async upsertVector({ id, vector, metadata = {} }) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('upsertVector requires a non-empty id');
    }
    if (!Array.isArray(vector) || vector.length === 0) {
      // In strict mode this might throw, but since we return [] from embedText,
      // ingestor won't call this. If someone calls it manually with [], we can just ignore or warn.
      // But adhering to the interface, we should probably throw or just return.
      // Given we want to support "no embedding", simply returning is safer than throwing.
      return;
    }
    const norm = computeNorm(vector);
    this.vectors.set(id, { vector: [...vector], norm, metadata: { ...metadata } });
  }

  /** @param {{ vector: number[], k?: number, filter?: Record<string, unknown> }} input */
  async queryVector({ vector, k = 5, filter = {} }) {
    if (!Array.isArray(vector) || vector.length === 0) return [];

    const matchesFilter = (metadata) => Object.entries(filter).every(([key, value]) => metadata?.[key] === value);
    const queryNorm = computeNorm(vector);

    return [...this.vectors.entries()]
      .filter(([, value]) => matchesFilter(value.metadata))
      .map(([id, value]) => ({
        id,
        score: cosineSimilarity(vector, value.vector, queryNorm, value.norm ?? computeNorm(value.vector)),
        vector: [...value.vector],
        metadata: { ...value.metadata },
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Number.isFinite(k) && k > 0 ? Math.floor(k) : 5);
  }

  /** @param {string} id */
  async deleteVector(id) {
    if (typeof id !== 'string' || id.length === 0) return false;
    return this.vectors.delete(id);
  }
}

const ADAPTER_FACTORIES = {
  inmemory: () => new InMemoryEmbedderAdapter(),
  local: () => new InMemoryEmbedderAdapter(),
  mock: () => new InMemoryEmbedderAdapter(),
};

let defaultAdapter;

/**
 * @param {{ backend?: string }} [options]
 * @returns {EmbedderAdapter}
 */
export function createEmbedderAdapter(options = {}) {
  const configuredBackend = String(options.backend ?? process.env[VECTOR_BACKEND_ENV] ?? DEFAULT_VECTOR_BACKEND).trim().toLowerCase();
  const factory = ADAPTER_FACTORIES[configuredBackend];
  if (!factory) {
    throw new Error(`Unsupported vector backend "${configuredBackend}". Configure ${VECTOR_BACKEND_ENV}=inmemory (default) until provider adapters are added.`);
  }
  return factory();
}

/**
 * @returns {EmbedderAdapter}
 */
export function getDefaultEmbedderAdapter() {
  if (!defaultAdapter) {
    defaultAdapter = createEmbedderAdapter();
  }
  return defaultAdapter;
}

/**
 * @param {string} text
 * @param {{ embedText?: (value: string) => Promise<number[]> | number[], adapter?: EmbedderAdapter }} [options]
 * @returns {Promise<number[]>}
 */
export async function embedText(text, options = {}) {
  if (typeof options.embedText === 'function') {
    return options.embedText(text);
  }

  const adapter = options.adapter ?? getDefaultEmbedderAdapter();
  return adapter.embedText(text);
}
