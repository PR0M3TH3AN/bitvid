import {
  getRelays as _getRelays,
  getNamespace as _getNamespace,
  loadTorchConfig as _loadTorchConfig,
} from './torch-config.mjs';
import { todayDateStr } from './utils.mjs';
import { getRoster as _getRoster } from './roster.mjs';
import { queryLocks as _queryLocks } from './lock-ops.mjs';
import { getCompletedAgents } from './lock-utils.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Checks the status of the repository locks for a given cadence.
 *
 * It aggregates data from three sources:
 * 1. Configuration (paused agents)
 * 2. Local logs (completed agents)
 * 3. Nostr relays (current active locks)
 *
 * It outputs a JSON object describing the state (locked, available, excluded agents).
 *
 * @param {string} cadence - 'daily' or 'weekly'
 * @param {Object} [deps] - Dependency injection
 * @returns {Promise<Object>} - The check result object
 */
export async function cmdCheck(cadence, deps = {}) {
  const {
    getRelays = _getRelays,
    getNamespace = _getNamespace,
    loadTorchConfig = _loadTorchConfig,
    queryLocks = _queryLocks,
    getRoster = _getRoster,
    getDateStr = todayDateStr,
    log = console.log,
    error = console.error,
    logDir = 'task-logs',
    ignoreLogs = false,
    json = false,
    jsonFile = null,
    quiet = false,
  } = deps;

  const relays = await getRelays();
  const namespace = await getNamespace();
  const dateStr = getDateStr();
  const config = await loadTorchConfig();
  const pausedAgents = config.scheduler.paused[cadence] || [];

  if (!quiet) {
    error(`Checking locks: namespace=${namespace}, cadence=${cadence}, date=${dateStr}`);
    error(`Relays: ${relays.join(', ')}`);
    if (pausedAgents.length > 0) {
      error(`Paused agents: ${pausedAgents.join(', ')}`);
    }
  }

  let completedAgents = new Set();
  if (!ignoreLogs) {
    completedAgents = await getCompletedAgents(cadence, logDir, deps);
    if (!quiet && completedAgents.size > 0) {
      error(`Completed agents (logs): ${[...completedAgents].join(', ')}`);
    }
  }

  const locks = await queryLocks(
    relays,
    cadence,
    dateStr,
    namespace,
    quiet ? { errorLogger: () => {}, healthLogger: () => {} } : {},
  );
  const lockedAgents = [...new Set(locks.map((l) => l.agent).filter(Boolean))];
  const roster = await getRoster(cadence);
  const rosterSet = new Set(roster);

  const excludedAgentsSet = new Set([...lockedAgents, ...pausedAgents, ...completedAgents]);
  const excludedAgents = [...excludedAgentsSet];
  const unknownLockedAgents = lockedAgents.filter((agent) => !rosterSet.has(agent));
  const available = roster.filter((a) => !excludedAgentsSet.has(a));

  const result = {
    namespace,
    cadence,
    date: dateStr,
    locked: lockedAgents.sort(),
    paused: pausedAgents.sort(),
    completed: [...completedAgents].sort(),
    excluded: excludedAgents.sort(),
    available: available.sort(),
    lockCount: locks.length,
    unknownLockedAgents: unknownLockedAgents.sort(),
    locks: locks.map((l) => ({
      agent: l.agent,
      eventId: l.eventId,
      createdAt: l.createdAtIso,
      expiresAt: l.expiresAtIso,
      platform: l.platform,
    })),
  };

  const output = json ? JSON.stringify(result) : JSON.stringify(result, null, 2);

  if (jsonFile) {
    const resolvedPath = path.resolve(process.cwd(), jsonFile);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, `${output}\n`, 'utf8');
  }

  if (json || !quiet) {
    log(output);
  }

  return result;
}
