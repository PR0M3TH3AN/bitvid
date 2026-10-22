// One JSON line per wake attempt, in the fleet state dir (not the checkout).
// The line records what the pane looked like and what the nudge did. It does
// not record mail bodies. The file is capped so it cannot grow without bound.
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from '../lib.mjs';

export const WAKE_LOG_MAX = 400;

export function wakeLogPath(c) {
  return path.join(c.stateDir, 'wake-log.jsonl');
}

export function appendWakeLog(c, entry) {
  const file = wakeLogPath(c);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { /* new log */ }
  lines.push(JSON.stringify(entry));
  if (lines.length > WAKE_LOG_MAX) lines = lines.slice(lines.length - WAKE_LOG_MAX);
  writeAtomic(file, `${lines.join('\n')}\n`);
}

export function priorWakes(c, area, file) {
  return readRaw(c).filter((e) => e && e.kind !== 'stale' && e.area === area && e.file === file);
}

function readRaw(c) {
  try {
    return fs.readFileSync(wakeLogPath(c), 'utf8').split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

/** Plain words for the failure a later reader should tell the user. */
export function wakeFlag(entry) {
  if (!entry) return 'unknown';
  if (entry.kind === 'stale') {
    const last = Array.isArray(entry.prior) ? entry.prior[entry.prior.length - 1] : null;
    const age = entry.ageSec ?? '?';
    if (!last) return `still unread after ${age}s; no earlier wake`;
    if (last.outcome === 'swallowed') return `woke at ${last.t} (${last.trigger}), wake line still in the composer, still unread after ${age}s`;
    if (last.outcome === 'timeout') return `woke at ${last.t} (${last.trigger}), pane stayed busy until the waiter stopped, still unread after ${age}s`;
    if (last.outcome === 'deferred' || last.action === 'deferred') return `woke at ${last.t} (${last.trigger}), handed to a waiter because the pane was busy, still unread after ${age}s`;
    if (last.action === 'skipped-busy') return `woke at ${last.t} (${last.trigger}), skipped because an interrupt hint was showing, still unread after ${age}s`;
    if (last.action === 'no-window' || last.outcome === 'no-window') return `woke at ${last.t} (${last.trigger}), pane not found, still unread after ${age}s`;
    if (last.outcome === 'submitted') return `woke at ${last.t} (${last.trigger}), line left the composer, still unread after ${age}s`;
    return `woke at ${last.t} (${last.trigger}), outcome ${last.outcome}, still unread after ${age}s`;
  }
  if (entry.action === 'no-window' || entry.outcome === 'no-window') {
    const names = Array.isArray(entry.windows) && entry.windows.length ? entry.windows.join(', ') : 'none';
    const looked = entry.lookup || entry.window || 'unknown window';
    return `pane not found (looked up ${looked}; session windows: ${names})`;
  }
  if (entry.outcome === 'waiter-running') return 'a waiter is already polling this pane';
  if (entry.outcome === 'already-read') return 'mail was read before the pane went idle, so nothing was typed';
  if (entry.outcome === 'timeout') return 'pane stayed busy until the waiter stopped';
  if (entry.outcome === 'deferred') return 'handed to a waiter because an interrupt hint was showing';
  if (entry.action === 'skipped-busy') return 'skipped: interrupt hint was showing, so the pane looked mid-turn';
  if (entry.action === 'send-failed') return 'send-keys failed before Enter';
  if (entry.trigger === 'deferred' && entry.outcome === 'swallowed') return `waiter typed it; wake line still on the cursor row after ${entry.enterAttempts} Enter`;
  if (entry.outcome === 'swallowed') return `wake line still on the cursor row after ${entry.enterAttempts} Enter`;
  if (entry.trigger === 'deferred' && entry.outcome === 'submitted') return 'waiter typed the line and it left the composer';
  if (entry.outcome === 'submitted') {
    if (entry.before && entry.before.idleSec != null && entry.before.idleSec < 3 && !entry.before.interrupt) {
      return 'typed and the line left the composer while the pane was recently active';
    }
    return 'typed and the line left the composer';
  }
  return entry.outcome || entry.action || 'unknown';
}

export function readWakeLog(c, { limit = 40 } = {}) {
  const all = readRaw(c);
  const entries = all.slice(-Math.max(1, Number(limit) || 40)).map((entry) => ({ ...entry, flag: wakeFlag(entry) }));
  return { path: wakeLogPath(c), entries };
}
