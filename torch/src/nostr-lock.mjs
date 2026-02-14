#!/usr/bin/env node

// TORCH — Task Orchestration via Relay-Coordinated Handoff
// Generic Nostr-based task locking for multi-agent development.

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

const DEFAULT_TTL = 7200;
const DEFAULT_NAMESPACE = 'torch';
const QUERY_TIMEOUT_MS = 15_000;
const VALID_CADENCES = new Set(['daily', 'weekly']);

const DEFAULT_DAILY_ROSTER = [
  'documentation-agent',
  'quality-agent',
  'security-agent',
  'performance-agent',
  'refactor-agent',
];

const DEFAULT_WEEKLY_ROSTER = [
  'bug-reproducer-agent',
  'integration-agent',
  'release-agent',
  'test-coverage-agent',
  'weekly-synthesis-agent',
];

function getRelays() {
  const envRelays = process.env.NOSTR_LOCK_RELAYS;
  if (envRelays) {
    return envRelays.split(',').map((r) => r.trim()).filter(Boolean);
  }
  return DEFAULT_RELAYS;
}

function getNamespace() {
  const namespace = (process.env.NOSTR_LOCK_NAMESPACE || DEFAULT_NAMESPACE).trim();
  return namespace || DEFAULT_NAMESPACE;
}

function getTtl() {
  const envTtl = process.env.NOSTR_LOCK_TTL;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL;
}

function parseEnvRoster(value) {
  if (!value) return null;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRoster(cadence) {
  const dailyFromEnv = parseEnvRoster(process.env.NOSTR_LOCK_DAILY_ROSTER);
  const weeklyFromEnv = parseEnvRoster(process.env.NOSTR_LOCK_WEEKLY_ROSTER);

  if (cadence === 'daily') {
    return dailyFromEnv && dailyFromEnv.length ? dailyFromEnv : DEFAULT_DAILY_ROSTER;
  }

  return weeklyFromEnv && weeklyFromEnv.length ? weeklyFromEnv : DEFAULT_WEEKLY_ROSTER;
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function parseLockEvent(event) {
  const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  const expTag = event.tags.find((t) => t[0] === 'expiration')?.[1];
  const expiresAt = expTag ? parseInt(expTag, 10) : null;

  let content = {};
  try {
    content = JSON.parse(event.content);
  } catch {
    // Ignore malformed JSON content
  }

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    createdAtIso: new Date(event.created_at * 1000).toISOString(),
    expiresAt,
    expiresAtIso: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    dTag,
    agent: content.agent ?? null,
    cadence: content.cadence ?? null,
    status: content.status ?? null,
    date: content.date ?? null,
    platform: content.platform ?? null,
  };
}

function filterActiveLocks(locks) {
  const now = nowUnix();
  return locks.filter((lock) => !lock.expiresAt || lock.expiresAt > now);
}

async function queryLocks(relays, cadence, dateStr, namespace) {
  const pool = new SimplePool();
  const tagFilter = `${namespace}-lock-${cadence}-${dateStr}`;

  try {
    const events = await Promise.race([
      pool.querySync(relays, {
        kinds: [30078],
        '#t': [tagFilter],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Relay query timed out')), QUERY_TIMEOUT_MS),
      ),
    ]);

    return filterActiveLocks(events.map(parseLockEvent));
  } finally {
    pool.close(relays);
  }
}

async function publishLock(relays, event) {
  const pool = new SimplePool();

  try {
    const publishPromises = pool.publish(relays, event);
    const results = await Promise.allSettled(publishPromises);
    const successes = results.filter((r) => r.status === 'fulfilled');

    if (successes.length === 0) {
      const errors = results.map((r, i) => {
        if (r.status === 'rejected') {
          const reason = r.reason;
          const message = reason instanceof Error ? reason.message : String(reason ?? 'unknown');
          return `${relays[i]}: ${message}`;
        }
        return `${relays[i]}: unknown`;
      });
      throw new Error(`Failed to publish to any relay:\n  ${errors.join('\n  ')}`);
    }

    console.error(`  Published to ${successes.length}/${relays.length} relays`);
    return event;
  } finally {
    pool.close(relays);
  }
}

async function cmdCheck(cadence) {
  const relays = getRelays();
  const namespace = getNamespace();
  const dateStr = todayDateStr();

  console.error(`Checking locks: namespace=${namespace}, cadence=${cadence}, date=${dateStr}`);
  console.error(`Relays: ${relays.join(', ')}`);

  const locks = await queryLocks(relays, cadence, dateStr, namespace);
  const lockedAgents = [...new Set(locks.map((l) => l.agent).filter(Boolean))];
  const roster = getRoster(cadence);
  const available = roster.filter((a) => !lockedAgents.includes(a));

  console.log(
    JSON.stringify(
      {
        namespace,
        cadence,
        date: dateStr,
        locked: lockedAgents.sort(),
        available: available.sort(),
        lockCount: locks.length,
        locks: locks.map((l) => ({
          agent: l.agent,
          eventId: l.eventId,
          createdAt: l.createdAtIso,
          expiresAt: l.expiresAtIso,
          platform: l.platform,
        })),
      },
      null,
      2,
    ),
  );
}

async function cmdLock(agent, cadence, dryRun = false) {
  const relays = getRelays();
  const namespace = getNamespace();
  const dateStr = todayDateStr();
  const ttl = getTtl();
  const now = nowUnix();
  const expiresAt = now + ttl;

  console.error(`Locking: namespace=${namespace}, agent=${agent}, cadence=${cadence}, date=${dateStr}`);
  console.error(`TTL: ${ttl}s, expires: ${new Date(expiresAt * 1000).toISOString()}`);
  console.error(`Relays: ${relays.join(', ')}`);

  console.error('Step 1: Checking for existing locks...');
  const existingLocks = await queryLocks(relays, cadence, dateStr, namespace);
  const conflicting = existingLocks.filter((l) => l.agent === agent);

  if (conflicting.length > 0) {
    const earliest = conflicting.sort((a, b) => a.createdAt - b.createdAt)[0];
    console.error(
      `LOCK DENIED: ${agent} already locked by event ${earliest.eventId} ` +
        `(created ${earliest.createdAtIso}, platform: ${earliest.platform})`,
    );
    console.log('LOCK_STATUS=denied');
    console.log('LOCK_REASON=already_locked');
    console.log(`LOCK_EXISTING_EVENT=${earliest.eventId}`);
    process.exit(3);
  }

  console.error('Step 2: Generating ephemeral keypair...');
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  console.error(`  Ephemeral pubkey: ${pk.slice(0, 16)}...`);

  console.error('Step 3: Building lock event...');
  const event = finalizeEvent(
    {
      kind: 30078,
      created_at: now,
      tags: [
        ['d', `${namespace}-lock/${cadence}/${agent}/${dateStr}`],
        ['t', `${namespace}-agent-lock`],
        ['t', `${namespace}-lock-${cadence}`],
        ['t', `${namespace}-lock-${cadence}-${dateStr}`],
        ['expiration', String(expiresAt)],
      ],
      content: JSON.stringify({
        agent,
        cadence,
        status: 'started',
        namespace,
        date: dateStr,
        platform: process.env.AGENT_PLATFORM || 'unknown',
        lockedAt: new Date(now * 1000).toISOString(),
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      }),
    },
    sk,
  );

  console.error(`  Event ID: ${event.id}`);

  if (dryRun) {
    console.error('Step 4: [DRY RUN] Skipping publish — event built but not sent');
    console.error('RACE CHECK: won (dry run — no real contention possible)');
  } else {
    console.error('Step 4: Publishing to relays...');
    await publishLock(relays, event);

    console.error('Step 5: Race check...');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const postLocks = await queryLocks(relays, cadence, dateStr, namespace);
    const racingLocks = postLocks
      .filter((l) => l.agent === agent)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (racingLocks.length > 1 && racingLocks[0].eventId !== event.id) {
      const winner = racingLocks[0];
      console.error(
        `RACE CHECK: lost (earlier lock by event ${winner.eventId}, created ${winner.createdAtIso})`,
      );
      console.log('LOCK_STATUS=race_lost');
      console.log('LOCK_REASON=earlier_claim_exists');
      console.log(`LOCK_WINNER_EVENT=${winner.eventId}`);
      process.exit(3);
    }

    console.error('RACE CHECK: won');
  }

  console.log('LOCK_STATUS=ok');
  console.log(`LOCK_EVENT_ID=${event.id}`);
  console.log(`LOCK_PUBKEY=${pk}`);
  console.log(`LOCK_AGENT=${agent}`);
  console.log(`LOCK_CADENCE=${cadence}`);
  console.log(`LOCK_DATE=${dateStr}`);
  console.log(`LOCK_EXPIRES=${expiresAt}`);
  console.log(`LOCK_EXPIRES_ISO=${new Date(expiresAt * 1000).toISOString()}`);
}

async function cmdList(cadence) {
  const relays = getRelays();
  const namespace = getNamespace();
  const dateStr = todayDateStr();
  const cadences = cadence ? [cadence] : ['daily', 'weekly'];

  console.error(`Listing active locks: namespace=${namespace}, cadences=${cadences.join(', ')}`);

  for (const c of cadences) {
    const locks = await queryLocks(relays, c, dateStr, namespace);

    console.log(`\n${'='.repeat(72)}`);
    console.log(`Active ${namespace} ${c} locks (${dateStr})`);
    console.log('='.repeat(72));

    if (locks.length === 0) {
      console.log('  (no active locks)');
      continue;
    }

    const sorted = locks.sort((a, b) => a.createdAt - b.createdAt);
    for (const lock of sorted) {
      const age = nowUnix() - lock.createdAt;
      const ageMin = Math.round(age / 60);
      const remaining = lock.expiresAt ? lock.expiresAt - nowUnix() : null;
      const remainMin = remaining ? Math.round(remaining / 60) : '?';

      console.log(
        `  ${(lock.agent ?? 'unknown').padEnd(30)} ` +
          `age: ${String(ageMin).padStart(4)}m  ` +
          `ttl: ${String(remainMin).padStart(4)}m  ` +
          `platform: ${lock.platform ?? '?'}  ` +
          `event: ${lock.eventId?.slice(0, 12)}...`,
      );
    }

    const roster = getRoster(c);
    const lockedAgents = new Set(locks.map((l) => l.agent).filter(Boolean));
    const available = roster.filter((a) => !lockedAgents.has(a));

    console.log(`\n  Locked: ${lockedAgents.size}/${roster.length}`);
    console.log(`  Available: ${available.join(', ') || '(none)'}`);
  }
}

function parseArgs(argv) {
  const args = { command: null, agent: null, cadence: null, dryRun: false };
  let i = 0;

  if (argv.length > 0 && !argv[0].startsWith('-')) {
    args.command = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agent' || arg === '-a') {
      args.agent = argv[++i];
    } else if (arg === '--cadence' || arg === '-c') {
      args.cadence = argv[++i];
    } else if (arg.startsWith('--agent=')) {
      args.agent = arg.split('=')[1];
    } else if (arg.startsWith('--cadence=')) {
      args.cadence = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function usage() {
  console.error(`Usage: node src/nostr-lock.mjs <command> [options]

Commands:
  check  --cadence <daily|weekly>                  Check locked agents (JSON)
  lock   --agent <name> --cadence <daily|weekly>   Claim a lock
  list   [--cadence <daily|weekly>]                Print active lock table

Options:
  --dry-run   Build and sign the event but do not publish

Environment:
  NOSTR_LOCK_NAMESPACE      Namespace prefix for lock tags (default: torch)
  NOSTR_LOCK_RELAYS         Comma-separated relay WSS URLs
  NOSTR_LOCK_TTL            Lock TTL in seconds (default: 7200)
  NOSTR_LOCK_DAILY_ROSTER   Comma-separated daily roster (optional)
  NOSTR_LOCK_WEEKLY_ROSTER  Comma-separated weekly roster (optional)
  AGENT_PLATFORM            Platform identifier (e.g., codex)

Exit codes:
  0  Success
  1  Usage error
  2  Relay/network error
  3  Lock denied (already locked or race lost)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command) {
    usage();
    process.exit(1);
  }

  switch (args.command) {
    case 'check': {
      if (!args.cadence || !VALID_CADENCES.has(args.cadence)) {
        console.error('ERROR: --cadence <daily|weekly> is required for check');
        process.exit(1);
      }
      await cmdCheck(args.cadence);
      break;
    }

    case 'lock': {
      if (!args.agent) {
        console.error('ERROR: --agent <name> is required for lock');
        process.exit(1);
      }
      if (!args.cadence || !VALID_CADENCES.has(args.cadence)) {
        console.error('ERROR: --cadence <daily|weekly> is required for lock');
        process.exit(1);
      }
      await cmdLock(args.agent, args.cadence, args.dryRun);
      break;
    }

    case 'list': {
      if (args.cadence && !VALID_CADENCES.has(args.cadence)) {
        console.error('ERROR: --cadence must be daily or weekly');
        process.exit(1);
      }
      await cmdList(args.cadence || null);
      break;
    }

    default:
      console.error(`ERROR: Unknown command: ${args.command}`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`nostr-lock failed: ${err.message}`);
  process.exit(2);
});
