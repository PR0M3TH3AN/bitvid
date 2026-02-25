import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { todayDateStr, getIsoWeekStr } from './utils.mjs';

export { relayListLabel, mergeRelayList } from './utils.mjs';

/**
 * Scans the local log directory to identify agents that have already completed their task
 * for the current period (daily or weekly).
 *
 * @param {string} cadence - 'daily' or 'weekly'
 * @param {string} logDir - Path to the log directory (e.g., 'task-logs')
 * @param {Object} deps - Dependency injection for testing
 * @returns {Promise<Set<string>>} - Set of agent names that have completed their task
 */
export async function getCompletedAgents(cadence, logDir, deps) {
  const { readdir = fs.readdir, getDateStr = todayDateStr, getIsoWeek = getIsoWeekStr } = deps;
  const completed = new Set();
  const targetDir = path.join(logDir, cadence);

  try {
    const files = await readdir(targetDir);
    const today = getDateStr();
    const currentWeek = getIsoWeek();

    for (const file of files) {
      // Format: YYYY-MM-DDTHH-mm-ssZ__<agent>__<status>.md
      const match = file.match(/^(\d{4}-\d{2}-\d{2})T.*__([a-zA-Z0-9-_]+)__(.*)\.md$/);
      if (!match) continue;

      const [, datePart, agent, status] = match;

      if (status === 'completed') {
        if (cadence === 'daily' && datePart === today) {
          completed.add(agent);
        } else if (cadence === 'weekly') {
          const fileWeek = getIsoWeek(datePart); // datePart is YYYY-MM-DD
          if (fileWeek === currentWeek) {
            completed.add(agent);
          }
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Warning: Failed to read log dir ${targetDir}: ${err.message}`);
    }
  }

  return completed;
}

export function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

const MAX_RANDOM = 281474976710655; // 2**48 - 1

export function secureRandom() {
  return randomInt(0, MAX_RANDOM) / MAX_RANDOM;
}
