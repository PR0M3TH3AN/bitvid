#!/usr/bin/env node

// scripts/agent/nostr-lock.mjs
//
// TORCH — Task Orchestration via Relay-Coordinated Handoff
//
// Decentralized task locking for multi-agent development using Nostr.
// Each lock generates a fresh ephemeral keypair and discards it.
// Locks auto-expire via NIP-40 — no cleanup, no tokens, no secrets.
//
// See docs/agents/TORCH.md for the full protocol documentation.
//
// Commands:
//   check  --cadence <daily|weekly>                  JSON list of locked agents
//   lock   --agent <name> --cadence <daily|weekly>   Claim a lock (exit 0=won, 3=lost)
//   list   [--cadence <daily|weekly>]                Human-readable lock table
//
// Environment:
//   NOSTR_LOCK_RELAYS   Comma-separated relay WSS URLs (overrides defaults)
//   NOSTR_LOCK_TTL      Lock TTL in seconds (default: 7200 = 2 hours)

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

const DEFAULT_TTL = 7200; // 2 hours in seconds
const QUERY_TIMEOUT_MS = 15_000;
const VALID_CADENCES = new Set(['daily', 'weekly']);

const DAILY_ROSTER = [
  'audit-agent',
  'ci-health-agent',
  'const-refactor-agent',
  'content-audit-agent',
  'decompose-agent',
  'deps-security-agent',
  'design-system-audit-agent',
  'docs-agent',
  'docs-alignment-agent',
  'docs-code-investigator',
  'innerhtml-migration-agent',
  'known-issues-agent',
  'load-test-agent',
  'nip-research-agent',
  'onboarding-audit-agent',
  'perf-agent',
  'prompt-curator-agent',
  'scheduler-update-agent',
  'style-agent',
  'test-audit-agent',
  'todo-triage-agent',
];

const WEEKLY_ROSTER = [
  'bug-reproducer-agent',
  'changelog-agent',
  'dead-code-agent',
  'event-schema-agent',
  'frontend-console-debug-agent',
  'fuzz-agent',
  'interop-agent',
  'perf-deepdive-agent',
  'perf-optimization-agent',
  'pr-review-agent',
  'race-condition-agent',
  'refactor-agent',
  'smoke-agent',
  'telemetry-agent',
  'test-coverage-agent',
  'weekly-synthesis-agent',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelays() {
  const envRelays = process.env.NOSTR_LOCK_RELAYS;
  if (envRelays) {
    return envRelays
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }
  return DEFAULT_RELAYS;
}

function getTtl() {
  const envTtl = process.env.NOSTR_LOCK_TTL;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL;
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function todayStartUnix() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function getRoster(cadence) {
  return cadence === 'daily' ? DAILY_ROSTER : WEEKLY_ROSTER;
}

/** Parse a lock event into a structured object. */
function parseLockEvent(event) {
  const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  const expTag = event.tags.find((t) => t[0] === 'expiration')?.[1];
  const expiresAt = expTag ? parseInt(expTag, 10) : null;

  let content = {};
  try {
    content = JSON.parse(event.content);
  } catch {
    // content might not be valid JSON
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

/** Filter out expired locks. */
function filterActiveLocks(locks) {
  const now = nowUnix();
  return locks.filter((lock) => {
    if (lock.expiresAt && lock.expiresAt <= now) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Relay operations
// ---------------------------------------------------------------------------

/**
 * Query relays for lock events matching a cadence and date.
 * Returns parsed lock objects.
 */
async function queryLocks(relays, cadence, dateStr) {
  const pool = new SimplePool();
  const tagFilter = `bitvid-lock-${cadence}-${dateStr}`;

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

/**
 * Publish a lock event to relays.
 * Returns the signed event.
 */
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
          const msg = reason instanceof Error ? reason.message : String(reason ?? 'unknown');
          return `${relays[i]}: ${msg}`;
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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdCheck(cadence) {
  const relays = getRelays();
  const dateStr = todayDateStr();

  console.error(`Checking locks: cadence=${cadence}, date=${dateStr}`);
  console.error(`Relays: ${relays.join(', ')}`);

  const locks = await queryLocks(relays, cadence, dateStr);
  const lockedAgents = [...new Set(locks.map((l) => l.agent).filter(Boolean))];
  const roster = getRoster(cadence);
  const available = roster.filter((a) => !lockedAgents.includes(a));

  const result = {
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
  };

  // Machine-readable JSON to stdout
  console.log(JSON.stringify(result, null, 2));
}

async function cmdLock(agent, cadence, dryRun = false) {
  const relays = getRelays();
  const dateStr = todayDateStr();
  const ttl = getTtl();
  const now = nowUnix();
  const expiresAt = now + ttl;

  console.error(`Locking: agent=${agent}, cadence=${cadence}, date=${dateStr}`);
  console.error(`TTL: ${ttl}s, expires: ${new Date(expiresAt * 1000).toISOString()}`);
  console.error(`Relays: ${relays.join(', ')}`);

  // Step 1: Check for existing locks on this agent
  console.error('Step 1: Checking for existing locks...');
  const existingLocks = await queryLocks(relays, cadence, dateStr);
  const conflicting = existingLocks.filter((l) => l.agent === agent);

  if (conflicting.length > 0) {
    const earliest = conflicting.sort((a, b) => a.createdAt - b.createdAt)[0];
    console.error(
      `LOCK DENIED: ${agent} already locked by event ${earliest.eventId} ` +
        `(created ${earliest.createdAtIso}, platform: ${earliest.platform})`,
    );
    console.log(`LOCK_STATUS=denied`);
    console.log(`LOCK_REASON=already_locked`);
    console.log(`LOCK_EXISTING_EVENT=${earliest.eventId}`);
    process.exit(3);
  }

  // Step 2: Generate ephemeral keypair
  console.error('Step 2: Generating ephemeral keypair...');
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  console.error(`  Ephemeral pubkey: ${pk.slice(0, 16)}...`);

  // Step 3: Build and sign the lock event
  console.error('Step 3: Building lock event...');
  const event = finalizeEvent(
    {
      kind: 30078,
      created_at: now,
      tags: [
        ['d', `bitvid-lock/${cadence}/${agent}/${dateStr}`],
        ['t', 'bitvid-agent-lock'],
        ['t', `bitvid-lock-${cadence}`],
        ['t', `bitvid-lock-${cadence}-${dateStr}`],
        ['expiration', String(expiresAt)],
      ],
      content: JSON.stringify({
        agent,
        cadence,
        status: 'started',
        date: dateStr,
        platform: process.env.AGENT_PLATFORM || 'unknown',
        lockedAt: new Date(now * 1000).toISOString(),
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      }),
    },
    sk,
  );

  console.error(`  Event ID: ${event.id}`);

  // Step 4: Publish to relays
  if (dryRun) {
    console.error('Step 4: [DRY RUN] Skipping publish — event built but not sent');
    console.error('RACE CHECK: won (dry run — no real contention possible)');
  } else {
    console.error('Step 4: Publishing to relays...');
    await publishLock(relays, event);

    // Step 5: Race check — re-query and verify we're the earliest
    console.error('Step 5: Race check...');
    // Brief pause to let relays propagate
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const postLocks = await queryLocks(relays, cadence, dateStr);
    const racingLocks = postLocks
      .filter((l) => l.agent === agent)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (racingLocks.length > 1 && racingLocks[0].eventId !== event.id) {
      const winner = racingLocks[0];
      console.error(
        `RACE CHECK: lost (earlier lock by event ${winner.eventId}, ` +
          `created ${winner.createdAtIso})`,
      );
      console.log(`LOCK_STATUS=race_lost`);
      console.log(`LOCK_REASON=earlier_claim_exists`);
      console.log(`LOCK_WINNER_EVENT=${winner.eventId}`);
      process.exit(3);
    }

    console.error('RACE CHECK: won');
  }

  // Output machine-readable results to stdout
  console.log(`LOCK_STATUS=ok`);
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
  const dateStr = todayDateStr();

  const cadences = cadence ? [cadence] : ['daily', 'weekly'];
  console.error(`Listing active locks for: ${cadences.join(', ')}`);

  for (const c of cadences) {
    const locks = await queryLocks(relays, c, dateStr);

    console.log(`\n${'='.repeat(72)}`);
    console.log(`Active ${c} locks (${dateStr})`);
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

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { command: null, agent: null, cadence: null, dryRun: false };
  let i = 0;

  // First positional arg is the command
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
  console.error(`Usage: node scripts/agent/nostr-lock.mjs <command> [options]

Commands:
  check  --cadence <daily|weekly>                  Check which agents are locked (JSON)
  lock   --agent <name> --cadence <daily|weekly>   Claim a lock for an agent
  list   [--cadence <daily|weekly>]                Human-readable lock table

Options:
  --dry-run   Build and sign the event but don't publish (for testing)

Environment:
  NOSTR_LOCK_RELAYS   Comma-separated relay WSS URLs
  NOSTR_LOCK_TTL      Lock TTL in seconds (default: 7200)
  AGENT_PLATFORM      Platform identifier (e.g., "jules", "claude-code")

Exit codes:
  0  Success (lock acquired or check complete)
  1  Usage error
  2  Relay/network error
  3  Lock denied (already locked or race lost)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
