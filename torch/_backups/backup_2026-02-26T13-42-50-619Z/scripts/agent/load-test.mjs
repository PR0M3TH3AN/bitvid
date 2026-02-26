import WebSocket from 'ws';
import { Relay, useWebSocketImplementation } from 'nostr-tools/relay';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { KIND_APP_DATA, DEFAULT_RELAYS } from '../../src/constants.mjs';
import { ensureDir } from '../../src/utils.mjs';

useWebSocketImplementation(WebSocket);

const KIND_VIEW_EVENT = 1;
const KNOWN_PUBLIC_RELAY_HOSTS = new Set(DEFAULT_RELAYS.map((relay) => new URL(relay).hostname));
const RELAY_SAFETY_ACK_VALUE = 'LOAD_TEST_INFRA_CONFIRMED';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const token = raw.slice(2);
    if (!token) continue;
    const eqIndex = token.indexOf('=');
    if (eqIndex >= 0) {
      args[token.slice(0, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[token] = next;
      i += 1;
    } else {
      args[token] = '1';
    }
  }
  return args;
}

function getConfigValue(args, key, envKey, fallback) {
  if (args[key] !== undefined) return args[key];
  if (process.env[envKey] !== undefined) return process.env[envKey];
  return fallback;
}

function parseIntStrict(value, name) {
  if (!/^-?\d+$/.test(String(value))) {
    throw new Error(`${name} must be an integer (got "${value}")`);
  }
  return Number.parseInt(value, 10);
}

function parseFloatStrict(value, name) {
  if (!/^[-+]?\d+(\.\d+)?$/.test(String(value))) {
    throw new Error(`${name} must be a number (got "${value}")`);
  }
  return Number.parseFloat(value);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function assertRange(value, name, min, max) {
  if (value < min || value > max) {
    throw new Error(`${name} out of range (${min}..${max}): ${value}`);
  }
}

function isPrivateIpv4(hostname) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function isLocalOrPrivateHost(hostname) {
  const lower = hostname.toLowerCase();
  return lower === 'localhost'
    || lower === '::1'
    || lower.endsWith('.local')
    || isPrivateIpv4(lower);
}

function classifyError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  if (text.includes('timeout')) return 'timeout';
  if (text.includes('reject') || text.includes('invalid signature') || text.includes('validation')) return 'reject';
  if (text.includes('closed') || text.includes('disconnect') || text.includes('econnreset')) return 'disconnect';
  if (text.includes('refused') || text.includes('enotfound') || text.includes('etimedout')) return 'network';
  return 'publish_error';
}

function xmur3(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seedInt) {
  let seed = seedInt >>> 0;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarizePercentiles(samples) {
  if (samples.length === 0) {
    return {
      count: 0,
      minMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    };
  }
  const minMs = samples.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
  const maxMs = samples.reduce((max, value) => Math.max(max, value), 0);
  const sumMs = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    minMs,
    avgMs: sumMs / samples.length,
    p50Ms: percentile(samples, 50),
    p90Ms: percentile(samples, 90),
    p95Ms: percentile(samples, 95),
    p99Ms: percentile(samples, 99),
    maxMs,
  };
}

function withTimeout(promise, timeoutMs) {
  let timeoutHandle = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`publish timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

function buildViewEvent(secretKey, nowMs) {
  return finalizeEvent({
    kind: KIND_VIEW_EVENT,
    created_at: Math.floor(nowMs / 1000),
    tags: [
      ['t', 'torch-load-test'],
      ['t', 'view-event'],
    ],
    content: JSON.stringify({
      type: 'view_event',
      source: 'load-test-harness',
      viewed_at: new Date(nowMs).toISOString(),
    }),
  }, secretKey);
}

function buildMultipartMetadataEvent(secretKey, nowMs, rng, sequence, partsPerEvent) {
  const videoId = `video-${Math.floor(rng() * 1000000).toString(16)}-${sequence}`;
  const part = 1 + Math.floor(rng() * partsPerEvent);
  const content = {
    type: 'video_metadata_multipart',
    source: 'load-test-harness',
    schema_basis: 'nostr-app-data-kind-30078',
    video_id: videoId,
    part,
    total_parts: partsPerEvent,
    payload: {
      title: `Load test clip ${sequence}`,
      duration_sec: 30 + Math.floor(rng() * 600),
      codecs: ['h264', 'aac'],
      chunk_manifest: Array.from({ length: partsPerEvent }, (_, idx) => ({
        part: idx + 1,
        bytes: 500 + Math.floor(rng() * 2500),
      })),
    },
  };
  return finalizeEvent({
    kind: KIND_APP_DATA,
    created_at: Math.floor(nowMs / 1000),
    tags: [
      ['t', 'torch-load-test'],
      ['t', 'video-metadata-multipart'],
      ['d', `${videoId}-${part}`],
    ],
    content: JSON.stringify(content),
  }, secretKey);
}

function summarizeRelay(relayUrl) {
  const parsed = new URL(relayUrl);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
}

function redactRelayForReport(relayUrl) {
  const parsed = new URL(relayUrl);
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || '(default)',
  };
}

function buildRemediation(report) {
  const items = [];
  const { results } = report;
  if (results.backpressureDrops > 0) {
    items.push('Reduce RATE_EPS or increase MAX_INFLIGHT only after confirming relay capacity; backpressure drops indicate local pipeline saturation.');
  }
  if ((results.errorBreakdown.timeout || 0) > 0) {
    items.push('Investigate relay write acknowledgements and tune PUBLISH_TIMEOUT_MS; timeout errors were observed during publish acknowledgements.');
  }
  if ((results.errorBreakdown.disconnect || 0) > 0 || (results.errorBreakdown.network || 0) > 0) {
    items.push('Check relay network stability (TCP resets, DNS, proxy paths) before raising client count.');
  }
  if (results.latency.p99Ms > 500) {
    items.push('Profile relay-side event acceptance path; p99 publish latency exceeded 500ms.');
  }
  if (results.eventLoopLag.p95Ms > 50) {
    items.push('Reduce local scheduling pressure (lower RATE_EPS or CLIENTS) to keep event loop lag under 50ms.');
  }
  if (results.resource.maxRssMb > 512) {
    items.push('Cap MAX_CONNECTIONS or lower CLIENTS to reduce harness memory pressure (RSS exceeded 512MB).');
  }
  if (items.length === 0) {
    items.push('No significant bottlenecks observed in this run; increase load gradually and repeat to find saturation point.');
  }
  return items.slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const relayUrlRaw = getConfigValue(args, 'relay-url', 'RELAY_URL', '');
  const relayUrl = String(relayUrlRaw || '').trim();
  if (!relayUrl) throw new Error('RELAY_URL (or --relay-url) is required.');

  const parsedRelay = new URL(relayUrl);
  if (!['ws:', 'wss:'].includes(parsedRelay.protocol)) {
    throw new Error(`Unsupported relay protocol ${parsedRelay.protocol}. Use ws:// or wss://.`);
  }

  const allowDedicated = parseBoolean(getConfigValue(args, 'allow-dedicated-test-relay', 'ALLOW_DEDICATED_TEST_RELAY', '0'), false);
  const relaySafetyAck = String(getConfigValue(args, 'relay-safety-ack', 'RELAY_SAFETY_ACK', '') || '').trim();
  const host = parsedRelay.hostname.toLowerCase();

  if (KNOWN_PUBLIC_RELAY_HOSTS.has(host)) {
    throw new Error(`Refusing to target known public relay host: ${host}`);
  }

  if (!isLocalOrPrivateHost(host)) {
    if (!allowDedicated || relaySafetyAck !== RELAY_SAFETY_ACK_VALUE) {
      throw new Error(
        `Refusing non-local relay host "${host}". Set ALLOW_DEDICATED_TEST_RELAY=1 and RELAY_SAFETY_ACK=${RELAY_SAFETY_ACK_VALUE} for dedicated test infrastructure.`,
      );
    }
  }

  const clients = parseIntStrict(getConfigValue(args, 'clients', 'CLIENTS', '1000'), 'CLIENTS');
  const durationSec = parseIntStrict(getConfigValue(args, 'duration-sec', 'DURATION_SEC', '600'), 'DURATION_SEC');
  const rateEps = parseFloatStrict(getConfigValue(args, 'rate-eps', 'RATE_EPS', '20'), 'RATE_EPS');
  const mix = parseFloatStrict(getConfigValue(args, 'mix', 'MIX', '0.2'), 'MIX');
  const seed = String(getConfigValue(args, 'seed', 'SEED', '') || '').trim();
  const dryRun = parseBoolean(getConfigValue(args, 'dry-run', 'DRY_RUN', '1'), true);
  const connectConcurrency = parseIntStrict(getConfigValue(args, 'connect-concurrency', 'CONNECT_CONCURRENCY', '25'), 'CONNECT_CONCURRENCY');
  const maxConnections = parseIntStrict(getConfigValue(args, 'max-connections', 'MAX_CONNECTIONS', String(Math.min(clients, 250))), 'MAX_CONNECTIONS');
  const maxInflight = parseIntStrict(getConfigValue(args, 'max-inflight', 'MAX_INFLIGHT', '300'), 'MAX_INFLIGHT');
  const publishTimeoutMs = parseIntStrict(getConfigValue(args, 'publish-timeout-ms', 'PUBLISH_TIMEOUT_MS', '15000'), 'PUBLISH_TIMEOUT_MS');
  const resourceSampleMs = parseIntStrict(getConfigValue(args, 'resource-sample-ms', 'RESOURCE_SAMPLE_MS', '5000'), 'RESOURCE_SAMPLE_MS');
  const eventLoopSampleMs = parseIntStrict(getConfigValue(args, 'event-loop-sample-ms', 'EVENT_LOOP_SAMPLE_MS', '200'), 'EVENT_LOOP_SAMPLE_MS');
  const metadataParts = parseIntStrict(getConfigValue(args, 'metadata-parts', 'METADATA_PARTS', '4'), 'METADATA_PARTS');

  assertRange(clients, 'CLIENTS', 1, 100000);
  assertRange(durationSec, 'DURATION_SEC', 1, 86400);
  assertRange(rateEps, 'RATE_EPS', 0.1, 100000);
  assertRange(mix, 'MIX', 0, 1);
  assertRange(connectConcurrency, 'CONNECT_CONCURRENCY', 1, 1000);
  assertRange(maxConnections, 'MAX_CONNECTIONS', 1, clients);
  assertRange(maxInflight, 'MAX_INFLIGHT', 1, 100000);
  assertRange(publishTimeoutMs, 'PUBLISH_TIMEOUT_MS', 100, 120000);
  assertRange(resourceSampleMs, 'RESOURCE_SAMPLE_MS', 500, 120000);
  assertRange(eventLoopSampleMs, 'EVENT_LOOP_SAMPLE_MS', 20, 2000);
  assertRange(metadataParts, 'METADATA_PARTS', 2, 20);

  const rng = seed ? mulberry32(xmur3(seed)()) : Math.random;
  const reportDir = path.resolve(process.cwd(), 'reports', 'load-test');
  ensureDir(reportDir);

  const relaySummary = summarizeRelay(relayUrl);
  console.log('Load test configuration');
  console.log(`  relay: ${relaySummary}`);
  console.log(`  clients: ${clients}`);
  console.log(`  durationSec: ${durationSec}`);
  console.log(`  rateEps: ${rateEps}`);
  console.log(`  mix(metadata): ${mix}`);
  console.log(`  seed: ${seed || '(random)'}`);
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  maxConnections: ${maxConnections}`);
  console.log(`  connectConcurrency: ${connectConcurrency}`);
  console.log(`  maxInflight: ${maxInflight}`);

  if (dryRun) {
    console.log('DRY_RUN enabled: no relay connections or publish calls will be made.');
  }

  const clientKeys = Array.from({ length: clients }, () => generateSecretKey());

  const stats = {
    startedAtIso: new Date().toISOString(),
    startedAtMs: Date.now(),
    attempted: 0,
    succeeded: 0,
    failed: 0,
    backpressureDrops: 0,
    inFlightPeak: 0,
    latenciesMs: [],
    errorBreakdown: {},
    stackSamples: {},
    throughputBySecond: {},
    resourceSnapshots: [],
    eventLoopLagMs: [],
    mode: dryRun ? 'dry-run' : 'live',
  };

  const cpuStart = process.cpuUsage();
  let previousCpu = process.cpuUsage();
  let previousCpuWallMs = Date.now();

  const eventLoopTimer = setInterval(() => {
    const expected = Date.now() + eventLoopSampleMs;
    setTimeout(() => {
      const lag = Math.max(0, Date.now() - expected);
      stats.eventLoopLagMs.push(lag);
    }, eventLoopSampleMs);
  }, eventLoopSampleMs);

  const resourceTimer = setInterval(() => {
    const nowMs = Date.now();
    const mem = process.memoryUsage();
    const cpuDiff = process.cpuUsage(previousCpu);
    const wallMs = Math.max(1, nowMs - previousCpuWallMs);
    const cpuMs = (cpuDiff.user + cpuDiff.system) / 1000;
    const cpuPercent = Number(((cpuMs / wallMs) * 100).toFixed(2));
    previousCpu = process.cpuUsage();
    previousCpuWallMs = nowMs;
    stats.resourceSnapshots.push({
      tSec: Math.floor((nowMs - stats.startedAtMs) / 1000),
      rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
      heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
      cpuPercent,
    });
  }, resourceSampleMs);

  const recordAttempt = () => {
    const sec = Math.floor((Date.now() - stats.startedAtMs) / 1000);
    const bucket = stats.throughputBySecond[sec] || { attempted: 0, succeeded: 0, failed: 0, backpressureDrops: 0 };
    bucket.attempted += 1;
    stats.throughputBySecond[sec] = bucket;
  };

  const recordResult = (kind) => {
    const sec = Math.floor((Date.now() - stats.startedAtMs) / 1000);
    const bucket = stats.throughputBySecond[sec] || { attempted: 0, succeeded: 0, failed: 0, backpressureDrops: 0 };
    bucket[kind] += 1;
    stats.throughputBySecond[sec] = bucket;
  };

  const relays = [];
  if (!dryRun) {
    let nextConnectionIndex = 0;
    const connectionErrors = [];
    const workers = Array.from({ length: Math.min(connectConcurrency, maxConnections) }, () => (async () => {
      while (nextConnectionIndex < maxConnections) {
        const current = nextConnectionIndex;
        nextConnectionIndex += 1;
        try {
          const relay = await Relay.connect(relayUrl);
          relays[current] = relay;
        } catch (error) {
          connectionErrors.push(String(error?.message || error));
        }
      }
    })());

    await Promise.all(workers);
    if (!relays.length) {
      throw new Error(`Failed to establish any relay connections. errors=${connectionErrors.slice(0, 3).join(' | ') || '(none)'}`);
    }
    if (connectionErrors.length) {
      stats.errorBreakdown.connection = connectionErrors.length;
      stats.stackSamples.connection = connectionErrors.slice(0, 3);
    }
    console.log(`Established ${relays.length}/${maxConnections} relay connections.`);
  }

  const publishContext = {
    inFlight: 0,
    tasks: new Set(),
    metadataSeq: 0,
  };

  async function publishOne(clientIndex, isMetadata) {
    const nowMs = Date.now();
    const secretKey = clientKeys[clientIndex];
    const event = isMetadata
      ? buildMultipartMetadataEvent(secretKey, nowMs, rng, publishContext.metadataSeq += 1, metadataParts)
      : buildViewEvent(secretKey, nowMs);

    const started = performance.now();
    try {
      if (dryRun) {
        const syntheticLatency = 5 + Math.floor(rng() * 20);
        await sleep(syntheticLatency);
      } else {
        const relay = relays[clientIndex % relays.length];
        await withTimeout(relay.publish(event), publishTimeoutMs);
      }
      const latencyMs = Number((performance.now() - started).toFixed(3));
      stats.succeeded += 1;
      stats.latenciesMs.push(latencyMs);
      recordResult('succeeded');
    } catch (error) {
      stats.failed += 1;
      const category = classifyError(error);
      stats.errorBreakdown[category] = (stats.errorBreakdown[category] || 0) + 1;
      const stack = String(error?.stack || error?.message || error);
      const trimmed = stack.split('\n').slice(0, 3).join('\n');
      if (!stats.stackSamples[category]) stats.stackSamples[category] = [];
      if (stats.stackSamples[category].length < 3) {
        stats.stackSamples[category].push(trimmed);
      }
      recordResult('failed');
    }
  }

  const durationMs = durationSec * 1000;
  const endAt = stats.startedAtMs + durationMs;
  const paceMs = 1000 / rateEps;
  let nextTick = Date.now();

  while (Date.now() < endAt) {
    if (Date.now() < nextTick) {
      await sleep(Math.max(0, nextTick - Date.now()));
      continue;
    }
    nextTick += paceMs;

    stats.attempted += 1;
    recordAttempt();
    if (publishContext.inFlight >= maxInflight) {
      stats.backpressureDrops += 1;
      stats.failed += 1;
      stats.errorBreakdown.backpressure = (stats.errorBreakdown.backpressure || 0) + 1;
      recordResult('failed');
      recordResult('backpressureDrops');
      continue;
    }

    const clientIndex = Math.floor(rng() * clients);
    const isMetadata = rng() < mix;
    publishContext.inFlight += 1;
    stats.inFlightPeak = Math.max(stats.inFlightPeak, publishContext.inFlight);
    const task = publishOne(clientIndex, isMetadata).finally(() => {
      publishContext.inFlight -= 1;
      publishContext.tasks.delete(task);
    });
    publishContext.tasks.add(task);
  }

  await Promise.allSettled([...publishContext.tasks]);

  clearInterval(eventLoopTimer);
  clearInterval(resourceTimer);
  for (const relay of relays) relay.close();

  const completedAtMs = Date.now();
  const completedAtIso = new Date(completedAtMs).toISOString();
  const cpuTotal = process.cpuUsage(cpuStart);
  const runDurationSec = Math.max(0.001, (completedAtMs - stats.startedAtMs) / 1000);
  const latency = summarizePercentiles(stats.latenciesMs);
  const eventLoopLag = summarizePercentiles(stats.eventLoopLagMs);
  const maxRssMb = stats.resourceSnapshots.reduce((max, item) => Math.max(max, item.rssMb), 0);
  const maxHeapMb = stats.resourceSnapshots.reduce((max, item) => Math.max(max, item.heapUsedMb), 0);
  const avgCpuPercent = stats.resourceSnapshots.length
    ? stats.resourceSnapshots.reduce((sum, item) => sum + item.cpuPercent, 0) / stats.resourceSnapshots.length
    : 0;

  const throughputSeries = Object.entries(stats.throughputBySecond)
    .map(([second, values]) => ({ second: Number(second), ...values }))
    .sort((a, b) => a.second - b.second);

  const report = {
    generatedAt: completedAtIso,
    config: {
      relay: redactRelayForReport(relayUrl),
      relaySummary,
      dryRun,
      clients,
      durationSec,
      rateEps,
      mixMetadata: mix,
      seed: seed || null,
      connectConcurrency,
      maxConnections,
      maxInflight,
      publishTimeoutMs,
      metadataParts,
    },
    results: {
      attempted: stats.attempted,
      succeeded: stats.succeeded,
      failed: stats.failed,
      successRate: Number((stats.succeeded / Math.max(1, stats.attempted)).toFixed(4)),
      throughputEps: Number((stats.succeeded / runDurationSec).toFixed(3)),
      backpressureDrops: stats.backpressureDrops,
      inFlightPeak: stats.inFlightPeak,
      latency,
      eventLoopLag: {
        avgMs: Number(eventLoopLag.avgMs.toFixed(3)),
        p95Ms: Number(eventLoopLag.p95Ms.toFixed(3)),
      },
      errorBreakdown: stats.errorBreakdown,
      topStackTraces: stats.stackSamples,
      resource: {
        samples: stats.resourceSnapshots,
        sampleCount: stats.resourceSnapshots.length,
        maxRssMb,
        maxHeapUsedMb: maxHeapMb,
        avgCpuPercent: Number(avgCpuPercent.toFixed(2)),
        cpuUserMs: Number((cpuTotal.user / 1000).toFixed(3)),
        cpuSystemMs: Number((cpuTotal.system / 1000).toFixed(3)),
      },
      throughputSeries,
      hotFunctions: 'not measured',
      startedAtIso: stats.startedAtIso,
      completedAtIso,
      runDurationSec: Number(runDurationSec.toFixed(3)),
    },
  };

  report.remediation = buildRemediation(report);

  const dateStr = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(reportDir, `load-report-${dateStr}.json`);
  const markdownPath = path.join(reportDir, `load-test-report-${dateStr}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const markdown = [
    `# Load Test Report - ${dateStr}`,
    '',
    '## Safety',
    '- Does not target public relays.',
    '- Requires explicit `RELAY_URL`.',
    `- Relay target: ${relaySummary}`,
    `- Mode: ${dryRun ? 'dry-run (no network sends)' : 'live publish test'}`,
    '',
    '## Configuration',
    `- Clients: ${clients}`,
    `- Duration: ${durationSec}s`,
    `- Rate: ${rateEps} events/sec`,
    `- Metadata mix: ${mix}`,
    `- Max connections: ${maxConnections}`,
    `- Max in-flight publishes: ${maxInflight}`,
    `- Seed: ${seed || '(random)'}`,
    '',
    '## Summary',
    `- Attempted: ${report.results.attempted}`,
    `- Succeeded: ${report.results.succeeded}`,
    `- Failed: ${report.results.failed}`,
    `- Throughput: ${report.results.throughputEps} events/sec`,
    `- Success rate: ${(report.results.successRate * 100).toFixed(2)}%`,
    '',
    '## Latency',
    `- p50: ${report.results.latency.p50Ms.toFixed(3)} ms`,
    `- p90: ${report.results.latency.p90Ms.toFixed(3)} ms`,
    `- p95: ${report.results.latency.p95Ms.toFixed(3)} ms`,
    `- p99: ${report.results.latency.p99Ms.toFixed(3)} ms`,
    '',
    '## Event Loop Lag',
    `- Avg: ${report.results.eventLoopLag.avgMs} ms`,
    `- p95: ${report.results.eventLoopLag.p95Ms} ms`,
    '',
    '## Error Taxonomy',
    `- ${Object.entries(report.results.errorBreakdown).map(([key, value]) => `${key}: ${value}`).join(', ') || 'none'}`,
    '',
    '## Hot Functions',
    '- not measured',
    '',
    '## Prioritized Remediation',
    ...report.remediation.map((item, index) => `${index + 1}. ${item}`),
    '',
  ].join('\n');

  fs.writeFileSync(markdownPath, markdown);

  console.log(`JSON report written: ${jsonPath}`);
  console.log(`Markdown report written: ${markdownPath}`);
}

main().catch((error) => {
  console.error(`Load test harness failed: ${error?.stack || error}`);
  process.exit(1);
});
