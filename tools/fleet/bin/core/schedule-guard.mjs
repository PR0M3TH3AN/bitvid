// Scheduled jobs may run only while an interactive fleet is alive and unpaused.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pidAlive, killProcessGroup, runProcessGroup } from '../lib.mjs';

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

export async function guardSchedule(c, job, { runner = fileURLToPath(new URL('../fleet.mjs', import.meta.url)), pollMs = 1000 } = {}) {
  if (!c.schedules.some((entry) => entry.name === job)) throw new Error(`Unknown scheduled job: ${job}`);
  const reason = inactiveReason(c);
  if (reason) return { status: 0, reason };
  let poll;
  let force;
  let stopped;
  const result = await runProcessGroup({
    cmd: process.execPath, args: [runner, 'run-job', job, ...(c.file ? ['--config', c.file] : [])], cwd: c.repo, env: process.env,
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
