import {
  DEFAULT_ROLLING_WINDOW_SIZE,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_QUARANTINE_COOLDOWN_MS,
  DEFAULT_MAX_QUARANTINE_COOLDOWN_MS,
  DEFAULT_SNAPSHOT_INTERVAL_MS,
} from './constants.mjs';

function summarizeRelayMetrics(metrics, nowMs) {
  const total = metrics.recentOutcomes.length;
  const successCount = metrics.recentOutcomes.filter((entry) => entry.success).length;
  const timeoutCount = metrics.recentOutcomes.filter((entry) => entry.timedOut).length;
  const latencyEntries = metrics.recentOutcomes.map((entry) => entry.latencyMs).filter((v) => Number.isFinite(v));
  const averageLatencyMs = latencyEntries.length
    ? Math.round(latencyEntries.reduce((sum, value) => sum + value, 0) / latencyEntries.length)
    : null;
  const successRate = total > 0 ? successCount / total : 0.5;
  const timeoutRate = total > 0 ? timeoutCount / total : 0;
  const quarantineRemainingMs = metrics.quarantineUntil > nowMs ? metrics.quarantineUntil - nowMs : 0;
  return {
    relay: metrics.relay,
    sampleSize: total,
    successRate,
    timeoutRate,
    averageLatencyMs,
    failureStreak: metrics.failureStreak,
    quarantined: quarantineRemainingMs > 0,
    quarantineRemainingMs,
    cooldownMs: metrics.cooldownMs,
    lastResultAt: metrics.lastResultAt,
  };
}

function computeRelayScore(summary) {
  const latencyPenalty = summary.averageLatencyMs === null
    ? 0.1
    : Math.min(0.35, summary.averageLatencyMs / 10_000);
  const quarantinePenalty = summary.quarantined ? 1 : 0;
  return (summary.successRate * 1.4) - (summary.timeoutRate * 0.9) - latencyPenalty - quarantinePenalty;
}

/**
 * Manages health metrics, scoring, and prioritization for Nostr relays.
 * Tracks success rates, timeouts, and latency to optimize relay selection.
 * Implements a quarantine mechanism for failing relays.
 */
export class RelayHealthManager {
  constructor() {
    this.metricsByRelay = new Map();
    this.lastSnapshotAt = 0;
    this._metricsVersion = 0;
    this._sortedCache = null;
  }

  ensureMetrics(relay, config) {
    let metrics = this.metricsByRelay.get(relay);
    if (!metrics) {
      metrics = {
        relay,
        recentOutcomes: [],
        failureStreak: 0,
        quarantineUntil: 0,
        cooldownMs: config.quarantineCooldownMs,
        lastLatencyMs: null,
        lastResultAt: null,
      };
      this.metricsByRelay.set(relay, metrics);
      this._metricsVersion += 1;
    }
    return metrics;
  }

  /**
   * Ranks a list of relays based on their health scores.
   * Utilizes a cached sort order to avoid re-sorting on every call if metrics haven't changed.
   *
   * @param {string[]} relays - List of relay URLs to rank.
   * @param {Object} config - Health configuration.
   * @param {number} [nowMs] - Current timestamp.
   * @returns {Array} List of ranked relay entries with scores and summaries.
   */
  rankRelays(relays, config, nowMs = Date.now()) {
    for (const relay of relays) {
      this.ensureMetrics(relay, config);
    }

    // Check if the cached sort order is still valid
    if (
      !this._sortedCache
      || this._sortedCache.version !== this._metricsVersion
      || nowMs >= this._sortedCache.validUntil
    ) {
      let minQuarantineUntil = Infinity;
      const entries = [];

      // Re-evaluate scores for all tracked relays
      for (const metrics of this.metricsByRelay.values()) {
        const summary = summarizeRelayMetrics(metrics, nowMs);
        const score = computeRelayScore(summary);
        if (metrics.quarantineUntil > nowMs && metrics.quarantineUntil < minQuarantineUntil) {
          minQuarantineUntil = metrics.quarantineUntil;
        }
        entries.push({
          relay: metrics.relay,
          summary,
          score,
          metrics,
        });
      }

      // Sort by score (desc), then quarantine status, then latency (asc), then name
      const comparator = (a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.summary.quarantined !== b.summary.quarantined) return a.summary.quarantined ? 1 : -1;
        if (a.summary.averageLatencyMs !== b.summary.averageLatencyMs) {
          if (a.summary.averageLatencyMs === null) return 1;
          if (b.summary.averageLatencyMs === null) return -1;
          return a.summary.averageLatencyMs - b.summary.averageLatencyMs;
        }
        return a.relay.localeCompare(b.relay);
      };
      entries.sort(comparator);

      this._sortedCache = {
        version: this._metricsVersion,
        validUntil: minQuarantineUntil,
        entries,
        byRelay: new Map(entries.map((e) => [e.relay, e])),
        comparator,
      };
    }

    // Optimization: if requesting a small subset of total known relays,
    // look them up directly instead of filtering the entire list.
    // Threshold: if requested set is smaller than 50% of cached entries.
    if (relays.length > 0 && relays.length * 2 < this._sortedCache.entries.length) {
      const subset = [];
      for (const relay of relays) {
        const entry = this._sortedCache.byRelay.get(relay);
        if (entry) {
          subset.push(entry);
        }
      }
      // Re-sort the subset to maintain ranking order
      subset.sort(this._sortedCache.comparator);

      return subset.map((entry) => {
        const quarantineRemainingMs = entry.metrics.quarantineUntil > nowMs
          ? entry.metrics.quarantineUntil - nowMs
          : 0;
        return {
          relay: entry.relay,
          score: entry.score,
          summary: {
            ...entry.summary,
            quarantineRemainingMs,
          },
        };
      });
    }

    const requestedSet = new Set(relays);
    return this._sortedCache.entries
      .filter((entry) => requestedSet.has(entry.relay))
      .map((entry) => {
        const quarantineRemainingMs = entry.metrics.quarantineUntil > nowMs
          ? entry.metrics.quarantineUntil - nowMs
          : 0;
        return {
          relay: entry.relay,
          score: entry.score,
          summary: {
            ...entry.summary,
            quarantineRemainingMs,
          },
        };
      });
  }

  /**
   * Selects a subset of relays for immediate use, prioritizing healthy ones.
   * May include quarantined relays if the number of healthy relays is below `minActiveRelayPool`.
   *
   * @param {string[]} relays - Candidate relays.
   * @param {Object} config - Health configuration.
   * @param {number} [nowMs] - Current timestamp.
   * @returns {Object} An object containing `prioritized` (list of selected relay URLs) and `ranked` (full ranking details).
   */
  prioritizeRelays(relays, config, nowMs = Date.now()) {
    const minActive = Math.max(1, Math.min(config.minActiveRelayPool, relays.length || 1));
    const ranked = this.rankRelays([...new Set(relays)], config, nowMs);
    const active = ranked.filter((entry) => !entry.summary.quarantined);
    const quarantined = ranked
      .filter((entry) => entry.summary.quarantined)
      .sort((a, b) => a.summary.quarantineRemainingMs - b.summary.quarantineRemainingMs);

    const selected = [...active];
    if (selected.length < minActive) {
      const additionalNeeded = Math.min(minActive - selected.length, quarantined.length);
      selected.push(...quarantined.slice(0, additionalNeeded));
    }

    return {
      prioritized: selected.map((entry) => entry.relay),
      ranked,
    };
  }

  /**
   * Updates health metrics for a relay based on the outcome of an operation.
   *
   * @param {string} relay - The relay URL.
   * @param {boolean} success - Whether the operation succeeded.
   * @param {string} errorMessage - Error message if failed.
   * @param {number} latencyMs - Duration of the operation.
   * @param {Object} config - Health configuration.
   * @param {number} [nowMs] - Current timestamp.
   */
  recordOutcome(relay, success, errorMessage, latencyMs, config, nowMs = Date.now()) {
    const metrics = this.ensureMetrics(relay, config);
    const timedOut = String(errorMessage || '').toLowerCase().includes('timeout')
      || String(errorMessage || '').toLowerCase().includes('timed out');
    metrics.recentOutcomes.push({ success, timedOut, latencyMs, atMs: nowMs });
    if (metrics.recentOutcomes.length > config.rollingWindowSize) {
      metrics.recentOutcomes.splice(0, metrics.recentOutcomes.length - config.rollingWindowSize);
    }
    metrics.lastResultAt = nowMs;
    metrics.lastLatencyMs = Number.isFinite(latencyMs) ? latencyMs : null;

    if (success) {
      metrics.failureStreak = 0;
      if (metrics.quarantineUntil > nowMs) {
        metrics.quarantineUntil = 0;
        metrics.cooldownMs = config.quarantineCooldownMs;
      }
      return;
    }

    metrics.failureStreak += 1;
    if (metrics.failureStreak >= config.failureThreshold) {
      metrics.quarantineUntil = nowMs + metrics.cooldownMs;
      metrics.cooldownMs = Math.min(config.maxQuarantineCooldownMs, Math.floor(metrics.cooldownMs * 1.5));
    }
    this._metricsVersion += 1;
  }

  collectSnapshot(relays, config, nowMs = Date.now()) {
    const uniqueRelays = [...new Set(relays)];
    return this.rankRelays(uniqueRelays, config, nowMs).map((entry) => ({
      relay: entry.relay,
      score: Number(entry.score.toFixed(4)),
      ...entry.summary,
    }));
  }

  maybeLogSnapshot(relays, config, logger, reason, force = false, nowMs = Date.now()) {
    const intervalReached = nowMs - this.lastSnapshotAt >= config.snapshotIntervalMs;
    if (!force && !intervalReached) return;
    this.lastSnapshotAt = nowMs;
    logger(JSON.stringify({
      event: 'relay_health_snapshot',
      reason,
      relays: this.collectSnapshot(relays, config, nowMs),
    }));
  }

  reset() {
    this.metricsByRelay.clear();
    this.lastSnapshotAt = 0;
    this._metricsVersion = 0;
    this._sortedCache = null;
  }
}

export const defaultHealthManager = new RelayHealthManager();

export function buildRelayHealthConfig(deps) {
  return {
    rollingWindowSize: deps.rollingWindowSize ?? DEFAULT_ROLLING_WINDOW_SIZE,
    failureThreshold: deps.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
    quarantineCooldownMs: deps.quarantineCooldownMs ?? DEFAULT_QUARANTINE_COOLDOWN_MS,
    maxQuarantineCooldownMs: deps.maxQuarantineCooldownMs ?? DEFAULT_MAX_QUARANTINE_COOLDOWN_MS,
    snapshotIntervalMs: deps.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS,
    minActiveRelayPool: Math.max(1, deps.minActiveRelayPool ?? 1),
  };
}
