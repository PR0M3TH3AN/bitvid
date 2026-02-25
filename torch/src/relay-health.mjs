import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { getNamespace, getRelays } from './torch-config.mjs';
import { MS_PER_SECOND } from './constants.mjs';
import { withTimeout } from './lock-utils.mjs';

const PROBE_KIND = 27235;

function nowIso() {
  return new Date().toISOString();
}

export function summarizeHistory(historyEntries, { nowMs = Date.now(), windowMinutes = 60 } = {}) {
  const windowStartMs = nowMs - (windowMinutes * 60_000);
  const recent = historyEntries.filter((entry) => Date.parse(entry.timestamp || '') >= windowStartMs);
  const relayProbeCount = recent.reduce((sum, entry) => sum + (entry.summary?.totalRelays || 0), 0);
  const successCount = recent.reduce((sum, entry) => sum + (entry.summary?.healthyRelays || 0), 0);
  const successRate = relayProbeCount > 0 ? successCount / relayProbeCount : 1;

  let lastHealthyAtMs = null;
  for (let i = historyEntries.length - 1; i >= 0; i -= 1) {
    if ((historyEntries[i].summary?.healthyRelays || 0) > 0) {
      lastHealthyAtMs = Date.parse(historyEntries[i].timestamp || '');
      break;
    }
  }

  const allDownDurationMinutes = lastHealthyAtMs === null
    ? null
    : Math.max(0, Math.floor((nowMs - lastHealthyAtMs) / 60_000));

  return {
    windowMinutes,
    sampleCount: recent.length,
    successRate,
    allDownDurationMinutes,
  };
}

export function evaluateAlertThresholds(currentResult, historyEntries, thresholds, { nowMs = Date.now() } = {}) {
  const stats = summarizeHistory(historyEntries, { nowMs, windowMinutes: thresholds.windowMinutes });
  const alerts = [];

  if (currentResult.summary.allRelaysUnhealthy && stats.allDownDurationMinutes !== null && stats.allDownDurationMinutes >= thresholds.allRelaysDownMinutes) {
    alerts.push({
      type: 'all_relays_down_duration',
      thresholdMinutes: thresholds.allRelaysDownMinutes,
      actualMinutes: stats.allDownDurationMinutes,
      severity: 'critical',
    });
  }

  if (stats.sampleCount > 0 && stats.successRate < thresholds.minSuccessRate) {
    alerts.push({
      type: 'relay_success_rate_below_threshold',
      threshold: thresholds.minSuccessRate,
      actual: Number(stats.successRate.toFixed(4)),
      windowMinutes: thresholds.windowMinutes,
      severity: 'warning',
    });
  }

  return { alerts, stats };
}

async function probeWebSocketReachability(relayUrl, timeoutMs) {
  const startedAt = Date.now();
  return withTimeout(new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    let settled = false;

    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn(value);
    };

    ws.once('open', finish(() => resolve({ ok: true, latencyMs: Date.now() - startedAt })));
    ws.once('error', finish((err) => reject(err)));
  }), timeoutMs, `WebSocket reachability timeout after ${timeoutMs}ms`);
}

async function probePublishRead(relayUrl, namespace, timeoutMs) {
  const ws = new WebSocket(relayUrl);
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const createdAt = Math.floor(Date.now() / MS_PER_SECOND);
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const probeTag = `${namespace}-health-probe-${nonce}`;
  const event = finalizeEvent({
    kind: PROBE_KIND,
    created_at: createdAt,
    tags: [
      ['t', `${namespace}-relay-health`],
      ['d', probeTag],
    ],
    content: JSON.stringify({ type: 'relay_health_probe', nonce, namespace, pubkey: pk }),
  }, sk);

  const subId = `probe-${nonce}`;

  return withTimeout(new Promise((resolve, reject) => {
    let okAck = false;
    let readSeen = false;
    let settled = false;

    const settle = (fn) => (value) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn(value);
    };

    ws.once('open', () => {
      ws.send(JSON.stringify(['EVENT', event]));
      ws.send(JSON.stringify(['REQ', subId, { ids: [event.id], limit: 1 }]));
    });

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        // Ignore malformed messages. The relay might be sending non-JSON data
        // or we might have a protocol mismatch. We only care about valid JSON.
        return;
      }
      if (!Array.isArray(message) || message.length < 2) return;
      const type = message[0];

      if (type === 'OK' && message[1] === event.id) {
        okAck = Boolean(message[2]);
        if (!okAck) {
          settle(reject)(new Error(`Relay rejected health probe event: ${String(message[3] || 'unknown reason')}`));
          return;
        }
      }

      if (type === 'EVENT' && message[1] === subId && message[2]?.id === event.id) {
        readSeen = true;
      }

      if (okAck && readSeen) {
        ws.send(JSON.stringify(['CLOSE', subId]));
        settle(resolve)({ ok: true, eventId: event.id });
      }
    });

    ws.once('error', settle(reject));
  }), timeoutMs, `Publish/read probe timeout after ${timeoutMs}ms`);
}

async function readHistory(historyPath) {
  try {
    const raw = await fs.readFile(historyPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && typeof entry === 'object');
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendHistory(historyPath, entry) {
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.appendFile(historyPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function runRelayHealthCheck(options = {}) {
  const {
    cadence = 'daily',
    timeoutMs = 6000,
    allRelaysDownMinutes = 10,
    minSuccessRate = 0.7,
    windowMinutes = 60,
  } = options;

  let {
    relays,
    namespace,
    historyPath,
  } = options;

  if (!relays) relays = await getRelays();
  if (!namespace) namespace = await getNamespace();
  if (!historyPath) historyPath = path.resolve(process.cwd(), 'task-logs', 'relay-health', `${cadence}.jsonl`);

  const relayResults = [];
  for (const relay of relays) {
    const relayResult = {
      relay,
      websocketReachable: false,
      publishReadOk: false,
      healthy: false,
      checks: {},
    };

    try {
      const wsProbe = await probeWebSocketReachability(relay, timeoutMs);
      relayResult.websocketReachable = true;
      relayResult.checks.websocket = wsProbe;
    } catch (error) {
      relayResult.checks.websocket = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    if (relayResult.websocketReachable) {
      try {
        const prProbe = await probePublishRead(relay, namespace, timeoutMs);
        relayResult.publishReadOk = true;
        relayResult.checks.publishRead = prProbe;
      } catch (error) {
        relayResult.checks.publishRead = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    relayResult.healthy = relayResult.websocketReachable && relayResult.publishReadOk;
    relayResults.push(relayResult);
  }

  const summary = {
    totalRelays: relayResults.length,
    healthyRelays: relayResults.filter((relay) => relay.healthy).length,
  };
  summary.unhealthyRelays = summary.totalRelays - summary.healthyRelays;
  summary.allRelaysUnhealthy = summary.healthyRelays === 0;

  const result = {
    ok: !summary.allRelaysUnhealthy,
    cadence,
    namespace,
    timestamp: nowIso(),
    relays,
    relayResults,
    summary,
    incidentSignal: null,
    alerts: [],
    alertStats: null,
    historyPath,
  };

  const historyEntries = await readHistory(historyPath);
  const prospectiveHistory = [...historyEntries, result];
  const thresholdEval = evaluateAlertThresholds(result, prospectiveHistory, {
    allRelaysDownMinutes,
    minSuccessRate,
    windowMinutes,
  });
  result.alerts = thresholdEval.alerts;
  result.alertStats = thresholdEval.stats;

  if (summary.allRelaysUnhealthy) {
    const incidentId = `relay-health-${cadence}-${Date.now()}`;
    result.incidentSignal = {
      id: incidentId,
      reason: 'All relays unhealthy before lock acquisition',
      severity: 'critical',
      suggestedAction: 'Defer scheduler run and investigate relay availability before retrying lock acquisition.',
    };
  }

  await appendHistory(historyPath, result);
  return result;
}
