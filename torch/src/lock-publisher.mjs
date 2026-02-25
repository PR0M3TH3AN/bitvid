import { randomUUID } from 'node:crypto';
import { SimplePool } from 'nostr-tools/pool';
import {
  getPublishTimeoutMs,
  getMinSuccessfulRelayPublishes,
  getRelayFallbacks,
  getMinActiveRelayPool,
} from './torch-config.mjs';
import { defaultHealthManager, buildRelayHealthConfig } from './relay-health-manager.mjs';
import {
  withTimeout,
  mergeRelayList,
  relayListLabel,
  secureRandom,
} from './lock-utils.mjs';

const PUBLISH_ERROR_CODES = {
  TIMEOUT: 'publish_timeout',
  DNS: 'dns_resolution',
  TCP: 'tcp_connect_timeout',
  TLS: 'tls_handshake',
  WEBSOCKET: 'websocket_open_failure',
  NETWORK: 'network_timeout',
  CONNECTION_RESET: 'connection_reset',
  RELAY_UNAVAILABLE: 'relay_unavailable',
  PERMANENT: 'permanent_validation_error',
};

const PUBLISH_FAILURE_CATEGORIES = {
  QUORUM_FAILURE: 'relay_publish_quorum_failure',
  NON_RETRYABLE: 'relay_publish_non_retryable',
};

/**
 * Classifies a raw error message into a standardized publication error code.
 * Used to determine if a failure is transient (retryable) or permanent.
 *
 * @param {string|Error} message - The error message or object to classify.
 * @returns {string} One of the PUBLISH_ERROR_CODES constants.
 */
function classifyPublishError(message) {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('publish timed out after') || normalized.includes('publish timeout')) {
    return PUBLISH_ERROR_CODES.TIMEOUT;
  }
  if (
    normalized.includes('enotfound')
    || normalized.includes('eai_again')
    || normalized.includes('getaddrinfo')
    || (normalized.includes('dns') && normalized.includes('websocket'))
  ) {
    return PUBLISH_ERROR_CODES.DNS;
  }
  if (
    normalized.includes('connect etimedout')
    || normalized.includes('tcp connect timed out')
    || normalized.includes('connect timeout')
  ) {
    return PUBLISH_ERROR_CODES.TCP;
  }
  if (
    normalized.includes('tls')
    || normalized.includes('ssl')
    || normalized.includes('certificate')
    || normalized.includes('handshake')
  ) {
    return PUBLISH_ERROR_CODES.TLS;
  }
  if (
    normalized.includes('websocket')
    || normalized.includes('bad response')
    || normalized.includes('unexpected server response')
  ) {
    return PUBLISH_ERROR_CODES.WEBSOCKET;
  }
  if (normalized.includes('timed out') || normalized.includes('timeout') || normalized.includes('etimedout')) {
    return PUBLISH_ERROR_CODES.NETWORK;
  }
  if (normalized.includes('econnreset') || normalized.includes('connection reset') || normalized.includes('socket hang up')) {
    return PUBLISH_ERROR_CODES.CONNECTION_RESET;
  }
  if (
    normalized.includes('unavailable')
    || normalized.includes('offline')
    || normalized.includes('econnrefused')
    || normalized.includes('connection refused')
    || normalized.includes('enotfound')
    || normalized.includes('503')
  ) {
    return PUBLISH_ERROR_CODES.RELAY_UNAVAILABLE;
  }
  return PUBLISH_ERROR_CODES.PERMANENT;
}

function isTransientPublishCategory(category) {
  return [
    PUBLISH_ERROR_CODES.TIMEOUT,
    PUBLISH_ERROR_CODES.DNS,
    PUBLISH_ERROR_CODES.TCP,
    PUBLISH_ERROR_CODES.TLS,
    PUBLISH_ERROR_CODES.WEBSOCKET,
    PUBLISH_ERROR_CODES.NETWORK,
    PUBLISH_ERROR_CODES.CONNECTION_RESET,
    PUBLISH_ERROR_CODES.RELAY_UNAVAILABLE,
  ].includes(category);
}

function calculateBackoffDelayMs(attemptNumber, baseMs, capMs, randomFn = secureRandom) {
  const maxDelay = Math.min(capMs, baseMs * (2 ** Math.max(0, attemptNumber - 1)));
  return Math.floor(randomFn() * maxDelay);
}

async function publishToRelays(pool, relays, event, publishTimeoutMs, phase) {
  const publishPromises = pool.publish(relays, event);
  const settled = await Promise.allSettled(
    publishPromises.map((publishPromise, index) => withTimeout(
      publishPromise,
      publishTimeoutMs,
      `[${phase}] Publish timed out after ${publishTimeoutMs}ms (relay=${relays[index]})`,
    )),
  );

  return settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return {
        relay: relays[index],
        success: true,
        phase,
        latencyMs: null,
      };
    }
    const reason = result.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? 'unknown');
    return {
      relay: relays[index],
      success: false,
      phase,
      message,
      latencyMs: null,
    };
  });
}

/**
 * Orchestrates the publication of a lock event to multiple relays.
 * Handles retries, fallback relays, and health-based relay prioritization.
 *
 * Cycle:
 * 1. Attempt to publish to primary relays.
 * 2. If quorum not met, attempt fallback relays.
 * 3. If still failing, retry with backoff (if errors are transient).
 * 4. Report final success or failure.
 */
export class LockPublisher {
  /**
   * @param {string[]} relays - Target primary relays.
   * @param {Object} event - The lock event to publish.
   * @param {Object} [deps] - Dependencies and configuration.
   */
  constructor(relays, event, deps = {}) {
    this.relays = relays;
    this.event = event;
    this.deps = deps;
    this.pool = null;
    this.healthConfig = null;
    this.allRelays = [];
    this.fallbackRelays = [];
    this.publishTimeoutMs = 0;
    this.minSuccesses = 0;
    this.minActiveRelayPool = 0;
    this.maxAttempts = 0;
    this.retryBaseDelayMs = 0;
    this.retryCapDelayMs = 0;
    this.sleepFn = null;
    this.randomFn = null;
    this.telemetryLogger = null;
    this.healthLogger = null;
    this.healthManager = null;
    this.correlationId = null;
    this.attemptId = null;
  }

  /**
   * Executes the publication process with retries.
   *
   * @returns {Promise<Object>} The published event if successful.
   * @throws {Error} If publication quorum is not met after all attempts.
   */
  async publish() {
    const {
      poolFactory = () => new SimplePool(),
      retryAttempts = 4,
      retryBaseDelayMs = 500,
      retryCapDelayMs = 8_000,
      sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      randomFn = Math.random,
      telemetryLogger = console.error,
      healthLogger = console.error,
      diagnostics = {},
      healthManager = defaultHealthManager,
    } = this.deps;

    this.healthManager = healthManager;
    this.pool = poolFactory();
    this.publishTimeoutMs = this.deps.resolvedConfig?.publishTimeoutMs;
    this.minSuccesses = this.deps.resolvedConfig?.minSuccesses;
    this.fallbackRelays = (this.deps.resolvedConfig?.fallbackRelays || []).filter((relay) => !this.relays.includes(relay));
    this.maxAttempts = Math.max(1, Math.floor(retryAttempts));
    this.healthConfig = buildRelayHealthConfig({
      ...this.deps,
      minActiveRelayPool: this.deps.resolvedConfig?.minActiveRelayPool,
    });

    this.retryBaseDelayMs = retryBaseDelayMs;
    this.retryCapDelayMs = retryCapDelayMs;
    this.sleepFn = sleepFn;
    this.randomFn = randomFn;
    this.telemetryLogger = telemetryLogger;
    this.healthLogger = healthLogger;
    this.healthManager = healthManager;
    this.correlationId = diagnostics.correlationId || randomUUID();
    this.attemptId = diagnostics.attemptId || randomUUID();

    this.allRelays = mergeRelayList(this.relays, this.fallbackRelays);

    try {
      this.healthManager.maybeLogSnapshot(this.allRelays, this.healthConfig, this.healthLogger, 'publish:periodic');
      let lastAttemptState = null;
      const retryTimeline = [];
      const overallStartedAt = Date.now();
      let terminalFailureCategory = PUBLISH_FAILURE_CATEGORIES.NON_RETRYABLE;

      // Retry loop: attempts publication until success or max attempts reached
      for (let attemptNumber = 1; attemptNumber <= this.maxAttempts; attemptNumber += 1) {
        const startedAtMs = Date.now();
        lastAttemptState = await this.executePublishCycle();
        const elapsedMs = Date.now() - startedAtMs;
        retryTimeline.push({
          publishAttempt: attemptNumber,
          successCount: lastAttemptState.successCount,
          relayAttemptedCount: lastAttemptState.attempted.size,
          elapsedMs,
        });

        if (lastAttemptState.successCount >= this.minSuccesses) {
          this.logSuccess(attemptNumber, lastAttemptState, retryTimeline, overallStartedAt);
          return this.event;
        }

        const { hasTransientFailure, hasPermanentFailure } = this.analyzeFailures(lastAttemptState.failures);
        const canRetry = attemptNumber < this.maxAttempts && hasTransientFailure && !hasPermanentFailure;

        terminalFailureCategory = this.determineFailureCategory(hasTransientFailure, hasPermanentFailure, attemptNumber);

        if (!canRetry) {
          break;
        }

        const nextDelayMs = calculateBackoffDelayMs(attemptNumber, this.retryBaseDelayMs, this.retryCapDelayMs, this.randomFn);
        this.logRetry(attemptNumber, lastAttemptState.failures, elapsedMs, nextDelayMs);
        await this.sleepFn(nextDelayMs);
      }

      this.handleFinalFailure(lastAttemptState, terminalFailureCategory, retryTimeline, overallStartedAt);
    } finally {
      this.pool.close(this.allRelays);
    }
  }

  async executePublishCycle() {
    const attempted = new Set();
    const publishResults = [];

    await this.attemptPhase(this.relays, 'publish:primary', attempted, publishResults);

    let successCount = publishResults.filter((result) => result.success).length;
    if (successCount < this.minSuccesses && this.fallbackRelays.length > 0) {
      await this.attemptPhase(this.fallbackRelays, 'publish:fallback', attempted, publishResults);
      successCount = publishResults.filter((result) => result.success).length;
    }

    const failures = publishResults
      .filter((result) => !result.success)
      .map((result) => ({
        ...result,
        category: classifyPublishError(result.message),
      }));

    return { attempted, publishResults, successCount, failures };
  }

  async attemptPhase(phaseRelays, phaseName, attempted, publishResults) {
    if (!phaseRelays.length) return;
    const { prioritized } = this.healthManager.prioritizeRelays(phaseRelays, this.healthConfig);
    if (!prioritized.length) return;

    console.error(`[${phaseName}] Publishing to ${prioritized.length} relays (${relayListLabel(prioritized)})...`);

    const startedAtMs = Date.now();
    for (const relay of prioritized) {
      attempted.add(relay);
    }
    const phaseResults = await publishToRelays(this.pool, prioritized, this.event, this.publishTimeoutMs, phaseName);
    const elapsedMs = Date.now() - startedAtMs;
    for (const result of phaseResults) {
      result.latencyMs = elapsedMs;
      this.healthManager.recordOutcome(result.relay, result.success, result.message, elapsedMs, this.healthConfig);
    }
    publishResults.push(...phaseResults);
  }

  analyzeFailures(failures) {
    const hasTransientFailure = failures.some((failure) => isTransientPublishCategory(failure.category));
    const hasPermanentFailure = failures.some((failure) => !isTransientPublishCategory(failure.category));
    return { hasTransientFailure, hasPermanentFailure };
  }

  determineFailureCategory(hasTransientFailure, hasPermanentFailure, attemptNumber) {
    if (hasTransientFailure && !hasPermanentFailure && attemptNumber >= this.maxAttempts) {
      return PUBLISH_FAILURE_CATEGORIES.QUORUM_FAILURE;
    } else if (hasPermanentFailure) {
      return PUBLISH_FAILURE_CATEGORIES.NON_RETRYABLE;
    } else {
      return PUBLISH_FAILURE_CATEGORIES.QUORUM_FAILURE;
    }
  }

  logSuccess(attemptNumber, lastAttemptState, retryTimeline, overallStartedAt) {
    this.telemetryLogger(JSON.stringify({
      event: 'lock_publish_quorum_met',
      correlationId: this.correlationId,
      attemptId: this.attemptId,
      publishAttempt: attemptNumber,
      successCount: lastAttemptState.successCount,
      relayAttemptedCount: lastAttemptState.attempted.size,
      requiredSuccesses: this.minSuccesses,
      timeoutMs: this.publishTimeoutMs,
      retryTimeline,
      totalElapsedMs: Date.now() - overallStartedAt,
    }));
    console.error(
      `  Published to ${lastAttemptState.successCount}/${lastAttemptState.attempted.size} relays `
      + `(required=${this.minSuccesses}, timeout=${this.publishTimeoutMs}ms)`,
    );
  }

  logRetry(attemptNumber, failures, elapsedMs, nextDelayMs) {
    for (const failure of failures) {
      if (!isTransientPublishCategory(failure.category)) continue;
      this.telemetryLogger(JSON.stringify({
        event: 'lock_publish_retry',
        correlationId: this.correlationId,
        attemptId: this.attemptId,
        publishAttempt: attemptNumber,
        relayUrl: failure.relay,
        errorCategory: failure.category,
        elapsedMs,
        nextDelayMs,
      }));
    }
  }

  handleFinalFailure(lastAttemptState, terminalFailureCategory, retryTimeline, overallStartedAt) {
    const reasonDistribution = {};
    const failureLines = lastAttemptState.failures
      .map((result) => {
        reasonDistribution[result.category] = (reasonDistribution[result.category] || 0) + 1;
        this.telemetryLogger(JSON.stringify({
          event: 'lock_publish_failure',
          correlationId: this.correlationId,
          attemptId: this.attemptId,
          relayUrl: result.relay,
          phase: result.phase,
          reason: result.category,
          message: result.message,
        }));
        return `${result.relay} (${result.phase}, reason=${result.category}): ${result.message}`;
      });

    this.telemetryLogger(JSON.stringify({
      event: 'lock_publish_quorum_failed',
      correlationId: this.correlationId,
      attemptId: this.attemptId,
      errorCategory: terminalFailureCategory,
      successCount: lastAttemptState.successCount,
      relayAttemptedCount: lastAttemptState.attempted.size,
      requiredSuccesses: this.minSuccesses,
      timeoutMs: this.publishTimeoutMs,
      attempts: this.maxAttempts,
      reasonDistribution,
      retryTimeline,
      totalElapsedMs: Date.now() - overallStartedAt,
    }));

    this.healthManager.maybeLogSnapshot(this.allRelays, this.healthConfig, this.healthLogger, 'publish:failure', true);
    throw new Error(
      `Failed relay publish quorum in publish phase: ${lastAttemptState.successCount}/${lastAttemptState.attempted.size} successful `
      + `(required=${this.minSuccesses}, timeout=${this.publishTimeoutMs}ms, attempts=${this.maxAttempts}, attempt_id=${this.attemptId}, correlation_id=${this.correlationId}, error_category=${terminalFailureCategory}, total_retry_timeline_ms=${Date.now() - overallStartedAt})\n`
      + `  retry timeline: ${retryTimeline.map((item) => `#${item.publishAttempt}:${item.elapsedMs}ms`).join(', ')}\n`
      + `  ${failureLines.join('\n  ')}`,
    );
  }
}

/**
 * High-level function to publish a lock event.
 * Initializes a LockPublisher and triggers the publication process.
 *
 * @param {string[]} relays - Target relays.
 * @param {Object} event - Lock event to publish.
 * @param {Object} [deps] - Dependencies.
 * @returns {Promise<Object>} The published event.
 */
export async function publishLock(relays, event, deps = {}) {
  const {
    getPublishTimeoutMsFn = getPublishTimeoutMs,
    getMinSuccessfulRelayPublishesFn = getMinSuccessfulRelayPublishes,
    getRelayFallbacksFn = getRelayFallbacks,
    getMinActiveRelayPoolFn = getMinActiveRelayPool,
  } = deps;

  const [publishTimeoutMs, minSuccesses, fallbackRelays, minActiveRelayPool] = await Promise.all([
    getPublishTimeoutMsFn(),
    getMinSuccessfulRelayPublishesFn(),
    getRelayFallbacksFn(),
    getMinActiveRelayPoolFn(),
  ]);

  return new LockPublisher(relays, event, {
    ...deps,
    resolvedConfig: {
      publishTimeoutMs,
      minSuccesses,
      fallbackRelays,
      minActiveRelayPool,
    },
  }).publish();
}

export { secureRandom };
