// adapters/claude.mjs — Claude Code (the `claude` CLI). COMPLETE.
//
// Every flag below is in daily use by the fleet this kit was generalised from:
//   claude --model <alias> --autocompact <window> --remote-control
//          --session-id <uuid> -n <name> --append-system-prompt-file <file> [first prompt]
//   claude --model <alias> --autocompact <window> --resume <id> --remote-control
//   claude --bg ...            detached background session (`claude attach <id>` to join)
//   claude -p <prompt> --model <alias> --output-format text      one-shot headless run
//   claude agents --json / claude stop <id>                       list / stop sessions
// Messaging is native: the SendMessage tool, names from ListAgents.
//
// NOTE: a system prompt passed with --append-system-prompt-file is recorded when the
// conversation is CREATED and replayed on resume, so an edited prompt reaches a session
// only through a fresh start (`fleet up --fresh --only <id>`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const name = 'claude';
export const complete = true;
export const experimental = false;
export const bin = 'claude';
export const capabilities = {
  interactive: true,
  resume: true,
  background: true,
  headless: true,
  doneSignal: 'exit',
  prompt: '--append-system-prompt-file',
  autoMode: ['--permission-mode', 'auto'],
  contextFlag: '--autocompact',
  remoteControl: '--remote-control',
  nativeMessaging: true,
};

/** Suggested tier -> model alias map (aliases track the newest model of each family). */
export const tiers = { strong: 'opus', standard: 'sonnet', light: 'haiku' };

const common = ({ model, context, remoteControl }) => [
  '--model', model,
  ...(context ? ['--autocompact', String(context)] : []),
  ...(remoteControl ? ['--remote-control'] : []),
];

/** argv for a NEW conversation. */
export function start({ model, context, remoteControl, sessionId, sessionName, promptFile, firstPrompt }) {
  return [bin, ...common({ model, context, remoteControl }),
    '--session-id', sessionId, '-n', sessionName,
    '--append-system-prompt-file', promptFile,
    ...(firstPrompt ? [firstPrompt] : [])];
}

/** argv to RESUME an existing conversation by id. */
export function resume({ model, context, remoteControl, sessionId }) {
  return [bin, ...common({ model, context, remoteControl }), '--resume', sessionId];
}

/** Turn a start/resume argv into a detached background session. */
export const background = (argv) => [argv[0], '--bg', ...argv.slice(1)];

/** One-shot headless job (scheduled jobs). extraArgs e.g. ['--permission-mode', 'auto']. */
export const headless = ({ prompt, model, extraArgs = [] }) =>
  [bin, '-p', prompt, '--model', model, '--output-format', 'text', ...extraArgs];

/**
 * Claude's text headless mode reports completion with the process exit code
 * (non-zero on failure). Timeout and signals are failure even when the status is 0.
 */
export function completed(output, meta = {}) {
  if (meta.timedOut) return { ok: false, reason: 'timeout' };
  if (meta.signal) return { ok: false, reason: `signal:${meta.signal}` };
  if (meta.status == null) return { ok: false, reason: 'no-exit' };
  if (meta.status !== 0) return { ok: false, reason: `exit:${meta.status}` };
  return { ok: true, reason: 'exit' };
}

/** A conversation can be resumed only if its transcript was saved. */
export function canResume(sessionId) {
  if (!sessionId) return false;
  const root = path.join(os.homedir(), '.claude', 'projects');
  try { return fs.readdirSync(root).some((d) => fs.existsSync(path.join(root, d, `${sessionId}.jsonl`))); }
  catch { return false; }
}

/** Running sessions: [{id, name, status, cwd}] or null when the CLI cannot say. */
export function list() {
  const r = spawnSync(bin, ['agents', '--json'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout).map((s) => ({ id: s.id, name: s.name, status: s.status, cwd: s.cwd })); }
  catch { return null; }
}

export const stop = (id) => [bin, 'stop', id];

/**
 * Never hand the launching session's environment to the sessions it starts:
 * a dispatcher that ran `fleet up` from its own shell once gave every child its
 * session id, messaging socket and effort, and those children saved no transcript.
 */
export function cleanEnv(env = process.env) {
  const out = { ...env };
  for (const k of Object.keys(out)) if (/^CLAUDE/.test(k)) delete out[k];
  return out;
}

export const messaging = {
  native: true,
  instructions: [
    'MESSAGING: use the SendMessage tool to reach another session; get names from ListAgents.',
    'Also check your file mailbox each turn (`node tools/fleet/bin/mailbox.mjs read <your id>`):',
    'scheduled jobs and other harnesses write there. Archive what you have handled.',
  ].join('\n'),
};

/** Where project skills live, relative to the repo root. */
export const skillsDir = '.claude/skills';

/**
 * Usage meter hook (optional, plan specific). The CLI does not expose the plan's weekly
 * meter. Return {weekPct:number} or null. Implement by reading your plan's usage page
 * (e.g. a scheduled job with browser tools) and writing <stateDir>/usage.json.
 */
export function usage(stateDir) {
  try { return JSON.parse(fs.readFileSync(path.join(stateDir, 'usage.json'), 'utf8')); } catch { return null; }
}
