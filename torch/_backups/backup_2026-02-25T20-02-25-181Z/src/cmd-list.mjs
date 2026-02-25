import {
  getRelays as _getRelays,
  getNamespace as _getNamespace,
} from './torch-config.mjs';
import {
  VALID_CADENCES,
} from './constants.mjs';
import { todayDateStr, nowUnix } from './utils.mjs';
import { getRoster as _getRoster } from './roster.mjs';
import { queryLocks as _queryLocks } from './lock-ops.mjs';

/**
 * Lists all active locks for the specified cadence (or all cadences if null).
 * It prints a formatted table to stdout with lock age, TTL, and event ID.
 *
 * @param {string|null} cadence - Filter by cadence ('daily', 'weekly') or null for all
 * @param {Object} [deps] - Dependency injection
 * @returns {Promise<void>}
 */
export async function cmdList(cadence, deps = {}) {
  const {
    getRelays = _getRelays,
    getNamespace = _getNamespace,
    queryLocks = _queryLocks,
    getRoster = _getRoster,
    getDateStr = todayDateStr,
    log = console.log,
    error = console.error
  } = deps;

  const relays = await getRelays();
  const namespace = await getNamespace();
  const dateStr = getDateStr();
  const cadences = cadence ? [cadence] : [...VALID_CADENCES];

  error(`Listing active locks: namespace=${namespace}, cadences=${cadences.join(', ')}`);

  const results = await Promise.all(
    cadences.map(async (c) => {
      const locks = await queryLocks(relays, c, dateStr, namespace);
      return { c, locks };
    }),
  );

  for (const { c, locks } of results) {
    log(`\n${'='.repeat(72)}`);
    log(`Active ${namespace} ${c} locks (${dateStr})`);
    log('='.repeat(72));

    if (locks.length === 0) {
      log('  (no active locks)');
      continue;
    }

    const sorted = locks.sort((a, b) => a.createdAt - b.createdAt);
    for (const lock of sorted) {
      const age = nowUnix() - lock.createdAt;
      const ageMin = Math.round(age / 60);

      let remainMin = '?';
      if (lock.status === 'completed') {
          remainMin = 'done';
      } else if (lock.expiresAt) {
          const remaining = lock.expiresAt - nowUnix();
          remainMin = Math.round(remaining / 60);
      }

      log(
        `  ${(lock.agent ?? 'unknown').padEnd(30)} ` +
          `age: ${String(ageMin).padStart(4)}m  ` +
          `ttl: ${String(remainMin).padStart(4)}  ` +
          `platform: ${lock.platform ?? '?'}  ` +
          `event: ${lock.eventId?.slice(0, 12)}...`,
      );
    }

    const roster = await getRoster(c);
    const rosterSet = new Set(roster);
    const lockedAgents = new Set(locks.map((l) => l.agent).filter(Boolean));
    const unknownLockedAgents = [...lockedAgents].filter((agent) => !rosterSet.has(agent));
    const available = roster.filter((a) => !lockedAgents.has(a));

    if (unknownLockedAgents.length > 0) {
      log(`  Warning: lock events found with non-roster agent names: ${unknownLockedAgents.join(', ')}`);
    }

    log(`\n  Locked: ${lockedAgents.size}/${roster.length}`);
    log(`  Available: ${available.join(', ') || '(none)'}`);
  }
}
