#!/usr/bin/env node

// TORCH — Task Orchestration via Relay-Coordinated Handoff
// Generic Nostr-based task locking for multi-agent development.

import { generateSecretKey as _generateSecretKey, getPublicKey as _getPublicKey, finalizeEvent as _finalizeEvent } from 'nostr-tools/pure';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import WebSocket from 'ws';
import {
  getRelays as _getRelays,
  getNamespace as _getNamespace,
  getTtl as _getTtl,
  getHashtag as _getHashtag,
} from './torch-config.mjs';
import {
  VALID_CADENCES,
  KIND_APP_DATA,
  RACE_CHECK_DELAY_MS,
  USAGE_TEXT,
  MS_PER_SECOND,
} from './constants.mjs';
import { cmdInit, cmdUpdate, cmdRemove } from './ops.mjs';
import { parseArgs } from './cli-parser.mjs';
import { getRoster as _getRoster } from './roster.mjs';
import { queryLocks as _queryLocks, publishLock as _publishLock, parseLockEvent } from './lock-ops.mjs';
import { cmdDashboard } from './dashboard.mjs';
import {
  inspectMemory,
  listMemories,
  memoryStats,
  pinMemory,
  triggerPruneDryRun,
  unpinMemory,
} from './services/memory/index.js';
import { ExitError } from './errors.mjs';
import { todayDateStr, nowUnix, detectPlatform } from './utils.mjs';
import { runRelayHealthCheck } from './relay-health.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { cmdProposal } from './cmd-proposal.mjs';
import { cmdRollback } from './cmd-rollback.mjs';
import { cmdCheck } from './cmd-check.mjs';
import { cmdList } from './cmd-list.mjs';
import { cmdComplete } from './cmd-complete.mjs';
import { cmdDoctor } from './cmd-doctor.mjs';

useWebSocketImplementation(WebSocket);

// Re-export for backward compatibility/library usage
export { parseLockEvent, cmdDashboard, _queryLocks as queryLocks, _publishLock as publishLock, cmdCheck, cmdList, cmdComplete };

/**
 * Attempts to acquire an exclusive lock for an agent on the specified cadence.
 *
 * Algorithm:
 * 1. Validate agent against the roster.
 * 2. Query relays for existing valid locks (checking for conflicts).
 * 3. Generate a new ephemeral keypair and build a lock event (kind 30078).
 * 4. Publish the lock event to relays.
 * 5. Wait for propagation (raceCheckDelayMs) and re-query to confirm no earlier lock won the race.
 *
 * @param {string} agent - Agent name
 * @param {string} cadence - 'daily' or 'weekly'
 * @param {boolean} [dryRun=false] - If true, skips publishing
 * @param {Object} [deps] - Dependency injection
 * @returns {Promise<{status: string, eventId: string}>}
 * @throws {ExitError} If lock is denied (already locked, completed, or race lost)
 */
export async function cmdLock(agent, cadence, optionsOrDryRun = false, deps = {}) {
  const options = typeof optionsOrDryRun === 'object' ? optionsOrDryRun : { dryRun: !!optionsOrDryRun };
  const { dryRun = false, platform = null, model = null } = options;

  const {
    getRelays = _getRelays,
    getNamespace = _getNamespace,
    getHashtag = _getHashtag,
    getTtl = _getTtl,
    queryLocks = _queryLocks,
    getRoster = _getRoster,
    publishLock = _publishLock,
    generateSecretKey = _generateSecretKey,
    getPublicKey = _getPublicKey,
    finalizeEvent = _finalizeEvent,
    raceCheckDelayMs = RACE_CHECK_DELAY_MS,
    getDateStr = todayDateStr,
    log = console.log,
    error = console.error
  } = deps;

  const relays = await getRelays();
  const namespace = await getNamespace();
  const hashtag = await getHashtag();
  const dateStr = getDateStr();
  const ttl = await getTtl();
  const now = nowUnix();
  const expiresAt = now + ttl;

  let gitCommit = null;
  try {
    gitCommit = execSync('git rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
  } catch {
    // Ignore git errors (not a git repo, etc)
  }

  let promptHash = null;
  let promptPath = null;
  try {
    // Attempt to locate the prompt file based on standard structure
    // We assume the CWD is the project root or we are in a standard structure.
    // If not found, we just omit the hash.
    const potentialPath = path.join(process.cwd(), 'src', 'prompts', cadence, `${agent}.md`);
    const content = await fs.readFile(potentialPath, 'utf8');
    promptHash = createHash('sha256').update(content).digest('hex');
    promptPath = `src/prompts/${cadence}/${agent}.md`;
  } catch {
    // Ignore missing prompt file
  }

  error(`Locking: namespace=${namespace}, agent=${agent}, cadence=${cadence}, date=${dateStr}`);
  error(`Hashtag: #${hashtag}`);
  error(`TTL: ${ttl}s, expires: ${new Date(expiresAt * MS_PER_SECOND).toISOString()}`);
  error(`Relays: ${relays.join(', ')}`);
  if (gitCommit) error(`Git Commit: ${gitCommit}`);
  if (promptHash) error(`Prompt Hash: ${promptHash.slice(0, 12)}...`);

  const roster = await getRoster(cadence);
  if (!roster.includes(agent)) {
    error(`ERROR: agent "${agent}" is not in the ${cadence} roster`);
    error(`Allowed ${cadence} agents: ${roster.join(', ')}`);
    throw new ExitError(1, 'Agent not in roster');
  }

  error('Step 1: Checking for existing locks...');
  const existingLocks = await queryLocks(relays, cadence, dateStr, namespace);
  const conflicting = existingLocks.filter((l) => l.agent === agent);

  if (conflicting.length > 0) {
    const earliest = conflicting.sort((a, b) => a.createdAt - b.createdAt)[0];

    // Check if it is a completed task
    if (earliest.status === 'completed') {
       error(`LOCK DENIED: Task already completed by event ${earliest.eventId}`);
       log('LOCK_STATUS=denied');
       log('LOCK_REASON=already_completed');
       throw new ExitError(3, 'Task already completed');
    }

    error(
      `LOCK DENIED: ${agent} already locked by event ${earliest.eventId} ` +
        `(created ${earliest.createdAtIso}, platform: ${earliest.platform})`,
    );
    log('LOCK_STATUS=denied');
    log('LOCK_REASON=already_locked');
    log(`LOCK_EXISTING_EVENT=${earliest.eventId}`);
    throw new ExitError(3, 'Lock denied');
  }

  error('Step 2: Generating ephemeral keypair...');
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  error(`  Ephemeral pubkey: ${pk.slice(0, 16)}...`);

  error('Step 3: Building lock event...');
  const event = finalizeEvent(
    {
      kind: KIND_APP_DATA,
      created_at: now,
      tags: [
        ['d', `${namespace}-lock/${cadence}/${agent}/${dateStr}`],
        ['t', hashtag],
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
        platform: platform || process.env.AGENT_PLATFORM || detectPlatform() || 'unknown',
        model: model || process.env.AGENT_MODEL || 'unknown',
        lockedAt: new Date(now * MS_PER_SECOND).toISOString(),
        expiresAt: new Date(expiresAt * MS_PER_SECOND).toISOString(),
        gitCommit,
        promptPath,
        promptHash,
      }),
    },
    sk,
  );

  error(`  Event ID: ${event.id}`);

  if (dryRun) {
    error('Step 4: [DRY RUN] Skipping publish — event built but not sent');
    error('RACE CHECK: won (dry run — no real contention possible)');
  } else {
    error('Step 4: Publishing to relays...');
    await publishLock(relays, event);

    error('Step 5: Race check...');
    await new Promise((resolve) => setTimeout(resolve, raceCheckDelayMs));

    const postLocks = await queryLocks(relays, cadence, dateStr, namespace);
    const racingLocks = postLocks
      .filter((l) => l.agent === agent)
      .sort((a, b) => (a.createdAt - b.createdAt) || String(a.eventId).localeCompare(String(b.eventId)));

    if (racingLocks.length > 1 && racingLocks[0].eventId !== event.id) {
      const winner = racingLocks[0];
      error(
        `RACE CHECK: lost (earlier lock by event ${winner.eventId}, created ${winner.createdAtIso})`,
      );
      log('LOCK_STATUS=race_lost');
      log('LOCK_REASON=earlier_claim_exists');
      log(`LOCK_WINNER_EVENT=${winner.eventId}`);
      throw new ExitError(3, 'Race check lost');
    }

    error('RACE CHECK: won');
  }

  log('LOCK_STATUS=ok');
  log(`LOCK_EVENT_ID=${event.id}`);
  log(`LOCK_PUBKEY=${pk}`);
  log(`LOCK_AGENT=${agent}`);
  log(`LOCK_HASHTAG=${hashtag}`);
  log(`LOCK_CADENCE=${cadence}`);
  log(`LOCK_DATE=${dateStr}`);
  log(`LOCK_EXPIRES=${expiresAt}`);
  log(`LOCK_EXPIRES_ISO=${new Date(expiresAt * MS_PER_SECOND).toISOString()}`);
  if (gitCommit) log(`LOCK_GIT_COMMIT=${gitCommit}`);
  if (promptHash) log(`LOCK_PROMPT_HASH=${promptHash}`);
  return { status: 'ok', eventId: event.id };
}

const COMMAND_HANDLERS = {
  check: async (args) => {
    if (!args.cadence || !VALID_CADENCES.has(args.cadence)) {
      console.error(`ERROR: --cadence <${[...VALID_CADENCES].join('|')}> is required for check`);
      throw new ExitError(1, 'Missing cadence');
    }
    await cmdCheck(args.cadence, {
      logDir: args.logDir,
      ignoreLogs: args.ignoreLogs,
      json: args.json,
      jsonFile: args.jsonFile,
      quiet: args.quiet,
    });
  },
  lock: async (args) => {
    if (!args.agent) {
      console.error('ERROR: --agent <name> is required for lock');
      throw new ExitError(1, 'Missing agent');
    }
    if (!args.cadence || !VALID_CADENCES.has(args.cadence)) {
      console.error(`ERROR: --cadence <${[...VALID_CADENCES].join('|')}> is required for lock`);
      throw new ExitError(1, 'Missing cadence');
    }
    await cmdLock(args.agent, args.cadence, {
      dryRun: args.dryRun,
      platform: args.platform,
      model: args.model
    });
  },
  complete: async (args) => {
    if (!args.agent) {
      console.error('ERROR: --agent <name> is required for complete');
      throw new ExitError(1, 'Missing agent');
    }
    if (!args.cadence || !VALID_CADENCES.has(args.cadence)) {
      console.error(`ERROR: --cadence <${[...VALID_CADENCES].join('|')}> is required for complete`);
      throw new ExitError(1, 'Missing cadence');
    }
    await cmdComplete(args.agent, args.cadence, {
      dryRun: args.dryRun,
      platform: args.platform,
      model: args.model
    });
  },
  list: async (args) => {
    if (args.cadence && !VALID_CADENCES.has(args.cadence)) {
      console.error(`ERROR: --cadence must be one of: ${[...VALID_CADENCES].join(', ')}`);
      throw new ExitError(1, 'Invalid cadence');
    }
    await cmdList(args.cadence || null);
  },
  health: async (args) => {
    if (!args.cadence || !VALID_CADENCES.has(args.cadence)) {
      console.error(`ERROR: --cadence <${[...VALID_CADENCES].join('|')}> is required for health`);
      throw new ExitError(1, 'Missing cadence');
    }
    const result = await runRelayHealthCheck({
      cadence: args.cadence,
      ...(Number.isFinite(args.timeoutMs) ? { timeoutMs: args.timeoutMs } : {}),
      ...(Number.isFinite(args.allRelaysDownMinutes) ? { allRelaysDownMinutes: args.allRelaysDownMinutes } : {}),
      ...(Number.isFinite(args.minSuccessRate) ? { minSuccessRate: args.minSuccessRate } : {}),
      ...(Number.isFinite(args.windowMinutes) ? { windowMinutes: args.windowMinutes } : {}),
    });
    if (!result.ok) {
      result.failureCategory = 'all relays unhealthy';
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) throw new ExitError(2, 'Relay health check failed');
  },
  dashboard: async (args) => {
    await cmdDashboard(args.port, args.host);
  },
  doctor: async (args) => {
    const report = cmdDoctor({ json: args.json });
    if (!report.ok) {
      throw new ExitError(2, 'Doctor found setup failures');
    }
  },
  init: async (args) => {
    await cmdInit(args.force);
  },
  update: async (args) => {
    await cmdUpdate(args.force);
  },
  remove: async (args) => {
    await cmdRemove(args.force);
  },
  'list-memories': async (args) => {
    const result = await listMemories({
      agent_id: args.agent,
      type: args.type,
      tags: args.tags,
      pinned: args.pinned,
      limit: args.limit,
      offset: args.offset,
    });

    if (!args.full && Array.isArray(result)) {
      for (const memory of result) {
        if (typeof memory.content === 'string' && memory.content.length > 200) {
          memory.content = memory.content.slice(0, 200) + '... (truncated, use --full to see all)';
        }
      }
    }

    console.log(JSON.stringify(result, null, 2));
  },
  'inspect-memory': async (args) => {
    if (!args.id) {
      console.error('ERROR: --id <memoryId> is required for inspect-memory');
      throw new ExitError(1, 'Missing memory id');
    }
    const result = await inspectMemory(args.id);
    console.log(JSON.stringify(result, null, 2));
  },
  'pin-memory': async (args) => {
    if (!args.id) {
      console.error('ERROR: --id <memoryId> is required for pin-memory');
      throw new ExitError(1, 'Missing memory id');
    }
    const result = await pinMemory(args.id);
    console.log(JSON.stringify(result, null, 2));
  },
  'unpin-memory': async (args) => {
    if (!args.id) {
      console.error('ERROR: --id <memoryId> is required for unpin-memory');
      throw new ExitError(1, 'Missing memory id');
    }
    const result = await unpinMemory(args.id);
    console.log(JSON.stringify(result, null, 2));
  },
  'trigger-prune-dry-run': async (args) => {
    const result = await triggerPruneDryRun({ retentionMs: args.retentionMs ?? undefined });
    console.log(JSON.stringify(result, null, 2));
  },
  'memory-stats': async (args) => {
    const result = await memoryStats({ windowMs: args.windowMs ?? undefined });
    console.log(JSON.stringify(result, null, 2));
  },
  proposal: async (args) => {
    if (!args.subcommand) {
      console.error('ERROR: Missing subcommand for proposal (create, list, apply, reject, show)');
      throw new ExitError(1, 'Missing subcommand');
    }
    await cmdProposal(args.subcommand, {
      agent: args.agent,
      target: args.target,
      contentFile: args.content,
      reason: args.reason,
      id: args.id,
      status: args.status
    });
  },
  rollback: async (args) => {
    await cmdRollback(args.target, args.strategy, { list: args.list });
  },
  backup: async (args) => {
    const { cmdBackup, listBackups } = await import('./cmd-backup.mjs');
    if (args.list) {
      const backups = await listBackups();
      console.log(JSON.stringify(backups, null, 2));
    } else {
      await cmdBackup({ output: args.output });
    }
  },
};

function usage() {
  console.error(USAGE_TEXT);
}

/**
 * Main entry point for the torch-lock CLI.
 * Dispatches to specific commands (check, lock, complete, etc.) based on argv.
 *
 * @param {string[]} argv - Arguments from process.argv.slice(2)
 */
export async function main(argv) {
  try {
    const args = parseArgs(argv);

    if (!args.command) {
      usage();
      throw new ExitError(1, 'No command specified');
    }

    const handler = COMMAND_HANDLERS[args.command];
    if (handler && Object.hasOwn(COMMAND_HANDLERS, args.command)) {
      await handler(args);
    } else {
      console.error(`ERROR: Unknown command: ${args.command}`);
      usage();
      throw new ExitError(1, 'Unknown command');
    }
  } catch (err) {
    if (err instanceof ExitError) {
      process.exit(err.code);
    } else {
      console.error(`torch-lock failed: ${err.message}`);
      process.exit(2);
    }
  }
}
