#!/usr/bin/env node
// Bitvid policy: cron may work only while an interactive fleet is alive and unpaused.
// Kept separate from sched.sh so kit updates cannot restore ignorePause behavior.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, pidAlive, killProcessGroup, runProcessGroup } from './lib.mjs';

export function inactiveReason(c) {
  if (fs.existsSync(path.join(c.stateDir, 'PAUSED'))) return 'fleet paused';
  for (const area of c.areas) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(c.stateDir, 'runs', `${area.id}.json`), 'utf8'));
      if (run.status === 'running' && Number.isInteger(run.pid) && run.pid > 1 && pidAlive(run.pid)) return null;
    } catch { /* Missing or invalid state is not permission to launch. */ }
  }
  return 'fleet down';
}

export async function guardSchedule(c, job, { scheduler = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sched.sh'), pollMs = 1000 } = {}) {
  if (!c.schedules.some((entry) => entry.name === job)) throw new Error(`Unknown scheduled job: ${job}`);
  const reason = inactiveReason(c);
  if (reason) return { status: 0, reason };
  let poll;
  let force;
  let stopped;
  const result = await runProcessGroup({
    cmd: '/bin/bash', args: [scheduler, job], cwd: c.repo, env: process.env,
    onSpawn(pid) {
      poll = setInterval(() => {
        const why = inactiveReason(c);
        if (!why || stopped) return;
        stopped = why;
        // Only the process group this invocation created. Nested fleet runners
        // receive TERM and forward it to their own agent process groups.
        killProcessGroup(pid, 'SIGTERM');
        force = setTimeout(() => killProcessGroup(pid, 'SIGKILL'), 3000);
      }, pollMs);
    },
  }).finally(() => {
    clearInterval(poll);
    clearTimeout(force);
  });
  return { status: stopped ? 0 : (result.status ?? 1), reason: stopped ?? null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const c = loadConfig();
    const result = await guardSchedule(c, process.argv[2]);
    process.exitCode = result.status;
  } catch (error) {
    console.error(`Bitvid schedule guard: ${error.message}`);
    process.exitCode = 1;
  }
}
