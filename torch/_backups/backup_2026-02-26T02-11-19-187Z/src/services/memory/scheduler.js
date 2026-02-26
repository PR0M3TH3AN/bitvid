import { getMemoryPruneMode, isMemoryEnabled, isMemoryIngestEnabled } from './feature-flags.js';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const JOBS = {
  ingestRecentRuntimeEvents: {
    lockKey: 'memory:job:ingest-recent-runtime-events',
    minIntervalMs: MINUTE_MS,
    maxIntervalMs: 5 * MINUTE_MS,
  },
  consolidateObservations: {
    lockKey: 'memory:job:consolidate-observations',
    intervalMs: HOUR_MS,
  },
  pruningCycle: {
    lockKey: 'memory:job:pruning-cycle',
    intervalMs: DAY_MS,
  },
  deepMergeArchivalMaintenance: {
    lockKey: 'memory:job:deep-merge-archival-maintenance',
    intervalMs: WEEK_MS,
  },
};

/**
 * @param {() => Promise<unknown> | unknown} task
 * @param {{ intervalMs: number }} options
 * @returns {{ stop: () => void }}
 */
export function startScheduler(task, options) {
  const handle = setInterval(() => {
    void task();
  }, options.intervalMs);

  return {
    stop() {
      clearInterval(handle);
    },
  };
}

function normalizeItemCount(result) {
  if (typeof result === 'number' && Number.isFinite(result)) {
    return Math.max(0, Math.floor(result));
  }

  if (result && typeof result === 'object') {
    const count = result.itemCount ?? result.count ?? result.processed ?? result.rows;
    if (typeof count === 'number' && Number.isFinite(count)) {
      return Math.max(0, Math.floor(count));
    }
  }

  return 0;
}

/**
 * @param {string} key
 */
function hashLockKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash * 31) + key.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows?: any[] }> }} db
 * @param {{ namespace?: string }} [options]
 */
export function createDbAdvisoryLockProvider(db, options = {}) {
  const namespace = options.namespace ?? 'torch-memory-jobs';

  return {
    /**
     * @param {string} key
     * @param {() => Promise<unknown>} task
     */
    async withLock(key, task) {
      const lockId = `${namespace}:${key}`;
      const keyA = hashLockKey(namespace);
      const keyB = hashLockKey(lockId);
      const acquiredResult = await db.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [keyA, keyB]);
      const acquired = Boolean(acquiredResult?.rows?.[0]?.locked);
      if (!acquired) {
        return { acquired: false, result: null };
      }

      try {
        const result = await task();
        return { acquired: true, result };
      } finally {
        await db.query('SELECT pg_advisory_unlock($1, $2)', [keyA, keyB]);
      }
    },
  };
}

function createInMemoryLockProvider() {
  const locks = new Set();
  return {
    async withLock(key, task) {
      if (locks.has(key)) {
        return { acquired: false, result: null };
      }

      locks.add(key);
      try {
        const result = await task();
        return { acquired: true, result };
      } finally {
        locks.delete(key);
      }
    },
  };
}

/**
 * @param {{
 *   jobName: string,
 *   lockKey: string,
 *   handler: () => Promise<unknown> | unknown,
 *   lockProvider: { withLock: (key: string, task: () => Promise<unknown>) => Promise<{ acquired: boolean, result: unknown }> },
 *   maxRetries: number,
 *   retryDelayMs: number,
 *   emitMetric?: (metricName: string, payload: Record<string, unknown>) => void,
 * }} options
 */
async function runScheduledJob(options) {
  const startedAt = Date.now();
  let failures = 0;
  let retries = 0;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      const lockRun = await options.lockProvider.withLock(options.lockKey, async () => options.handler());

      if (!lockRun.acquired) {
        options.emitMetric?.('memory_scheduler_job', {
          job: options.jobName,
          status: 'skipped_lock_unavailable',
          durationMs: Date.now() - startedAt,
          itemCount: 0,
          failures,
          retries,
        });
        return;
      }

      options.emitMetric?.('memory_scheduler_job', {
        job: options.jobName,
        status: 'success',
        durationMs: Date.now() - startedAt,
        itemCount: normalizeItemCount(lockRun.result),
        failures,
        retries,
      });
      return;
    } catch (error) {
      failures += 1;
      if (attempt < options.maxRetries) {
        retries += 1;
        await new Promise((resolve) => {
          setTimeout(resolve, options.retryDelayMs);
        });
        continue;
      }

      options.emitMetric?.('memory_scheduler_job', {
        job: options.jobName,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        itemCount: 0,
        failures,
        retries,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }
}

function shouldRunJob(jobName, options) {
  const env = options.env ?? process.env;
  if (!isMemoryEnabled(env)) return false;

  if (jobName === 'ingestRecentRuntimeEvents') {
    return isMemoryIngestEnabled(options.ingestAgentId, env);
  }

  if (jobName === 'pruningCycle') {
    return getMemoryPruneMode(env) !== 'off';
  }

  return true;
}

/**
 * @param {{
 *   handlers: {
 *     ingestRecentRuntimeEvents: () => Promise<unknown> | unknown,
 *     consolidateObservations: () => Promise<unknown> | unknown,
 *     pruningCycle: () => Promise<unknown> | unknown,
 *     deepMergeArchivalMaintenance: () => Promise<unknown> | unknown,
 *   },
 *   lockProvider?: { withLock: (key: string, task: () => Promise<unknown>) => Promise<{ acquired: boolean, result: unknown }> },
 *   emitMetric?: (metricName: string, payload: Record<string, unknown>) => void,
 *   maxRetries?: number,
 *   retryDelayMs?: number,
 *   runImmediately?: boolean,
 *   random?: () => number,
 * }} options
 */
export function startMemoryMaintenanceScheduler(options) {
  const lockProvider = options.lockProvider ?? createInMemoryLockProvider();
  const maxRetries = Number.isFinite(options.maxRetries) ? Math.max(0, Math.floor(options.maxRetries)) : 2;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Math.max(0, Math.floor(options.retryDelayMs)) : 1_000;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const handles = [];
  const timeouts = new Set();

  const runJob = async (jobName, definition, handler) => runScheduledJob({
    jobName,
    lockKey: definition.lockKey,
    handler,
    lockProvider,
    maxRetries,
    retryDelayMs,
    emitMetric: options.emitMetric,
  });

  const startFixedIntervalJob = (jobName, definition, handler) => {
    const run = () => {
      if (!shouldRunJob(jobName, options)) {
        options.emitMetric?.('memory_scheduler_job', {
          job: jobName,
          status: 'skipped_flag_disabled',
          durationMs: 0,
          itemCount: 0,
          failures: 0,
          retries: 0,
        });
        return;
      }
      void runJob(jobName, definition, handler);
    };

    if (options.runImmediately !== false) run();
    const intervalHandle = setInterval(run, definition.intervalMs);
    handles.push(() => clearInterval(intervalHandle));
  };

  const startRandomIntervalJob = (jobName, definition, handler) => {
    const scheduleNext = () => {
      const jitterRatio = Math.min(1, Math.max(0, random()));
      const delayMs = definition.minIntervalMs + Math.floor((definition.maxIntervalMs - definition.minIntervalMs) * jitterRatio);
      const timeout = setTimeout(async () => {
        timeouts.delete(timeout);
        if (!shouldRunJob(jobName, options)) {
          options.emitMetric?.('memory_scheduler_job', {
            job: jobName,
            status: 'skipped_flag_disabled',
            durationMs: 0,
            itemCount: 0,
            failures: 0,
            retries: 0,
          });
          scheduleNext();
          return;
        }
        await runJob(jobName, definition, handler);
        scheduleNext();
      }, delayMs);
      timeouts.add(timeout);
    };

    if (options.runImmediately !== false) {
      if (!shouldRunJob(jobName, options)) {
        options.emitMetric?.('memory_scheduler_job', {
          job: jobName,
          status: 'skipped_flag_disabled',
          durationMs: 0,
          itemCount: 0,
          failures: 0,
          retries: 0,
        });
        scheduleNext();
        return;
      }
      void runJob(jobName, definition, handler).then(() => {
        scheduleNext();
      });
    } else {
      scheduleNext();
    }
  };

  startRandomIntervalJob('ingestRecentRuntimeEvents', JOBS.ingestRecentRuntimeEvents, options.handlers.ingestRecentRuntimeEvents);
  startFixedIntervalJob('consolidateObservations', JOBS.consolidateObservations, options.handlers.consolidateObservations);
  startFixedIntervalJob('pruningCycle', JOBS.pruningCycle, options.handlers.pruningCycle);
  startFixedIntervalJob('deepMergeArchivalMaintenance', JOBS.deepMergeArchivalMaintenance, options.handlers.deepMergeArchivalMaintenance);

  return {
    stop() {
      for (const stopHandle of handles) {
        stopHandle();
      }
      for (const timeout of timeouts) {
        clearTimeout(timeout);
      }
      timeouts.clear();
    },
  };
}
