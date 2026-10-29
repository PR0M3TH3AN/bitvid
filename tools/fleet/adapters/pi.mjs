// adapters/pi.mjs — Pi coding agent. EXPERIMENTAL.
//
// Flags below are the ones `pi --help` and dist/cli/args.js accept in pi 0.74.2
// (the build installed for this check). No model turn was run. Current pi.dev
// docs also describe --session-id, -n/--name, -a/--approve, and an agent_settled
// event; 0.74.2 rejects unknown short options and treats unknown long options as
// errors, so those newer flags are not passed. See docs/adapters.md.
//
//   pi [--model M] --append-system-prompt <file> [first message]
//   pi [--model M] --append-system-prompt <file> --continue
//   pi --mode json --no-session [--model M] [extra] --print <prompt>
//
// JSON mode exits 0 even when the assistant stopReason is error (print-mode.js),
// so completion is the event stream, not the exit code alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { messaging as mailboxMessaging } from './mailbox.mjs';
import { baseVerdict, modelArgs, parseJsonRecords } from './contract.mjs';

export const name = 'pi';
export const complete = true;
export const experimental = true;
export const bin = 'pi';
export const tiers = { strong: null, standard: null, light: null };
export const capabilities = {
  interactive: true,
  resume: true,
  background: false,
  headless: true,
  doneSignal: 'agent_settled-or-agent_end',
  prompt: '--append-system-prompt',
  autoMode: [],
  contextFlag: null,
  remoteControl: null,
  nativeMessaging: false,
};
export const skillsDir = '.pi';

function agentDir(env = process.env) {
  return env.PI_CODING_AGENT_DIR || path.join(env.HOME || os.homedir(), '.pi', 'agent');
}

/** Same encoding as pi's getDefaultSessionDir (dist/core/session-manager.js). */
export function sessionDir(cwd, env) {
  if (!cwd) return null;
  const safe = `--${path.resolve(cwd).replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
  return path.join(agentDir(env), 'sessions', safe);
}

function hasSessionFile(dir) {
  try { return fs.readdirSync(dir).some((f) => f.endsWith('.jsonl')); }
  catch { return false; }
}

export function start({ model, promptFile, firstPrompt } = {}) {
  const args = [bin, ...modelArgs(model)];
  if (promptFile) args.push('--append-system-prompt', promptFile);
  if (firstPrompt) args.push(firstPrompt);
  return args;
}

export function resume({ model, promptFile, cwd, env } = {}) {
  if (!hasSessionFile(sessionDir(cwd, env))) return null;
  const args = [bin, ...modelArgs(model)];
  if (promptFile) args.push('--append-system-prompt', promptFile);
  args.push('--continue');
  return args;
}

export const background = null;

export function headless({ prompt, model, extraArgs = [] } = {}) {
  return [bin, '--mode', 'json', '--no-session', ...modelArgs(model), ...extraArgs, '--print', prompt];
}

function assistantFailed(record) {
  const messages = Array.isArray(record?.messages) ? record.messages : [];
  const assistant = [...messages].reverse().find((m) => m?.role === 'assistant');
  return assistant?.stopReason === 'error' || assistant?.stopReason === 'aborted';
}

export function completed(output, meta = {}) {
  const base = baseVerdict(meta);
  if (base) return base;
  if (meta.status !== 0) return { ok: false, reason: `exit:${meta.status}` };
  const records = parseJsonRecords(output);
  const settled = [...records].reverse().find((r) => r?.type === 'agent_settled');
  if (settled) {
    if (settled.aborted) return { ok: false, reason: 'aborted' };
    return { ok: true, reason: 'agent_settled' };
  }
  const ends = records.filter((r) => r?.type === 'agent_end');
  const last = ends[ends.length - 1];
  if (!last || last.willRetry || assistantFailed(last)) return { ok: false, reason: 'no-completed-result' };
  return { ok: true, reason: 'agent_end' };
}

export function canResume(_sessionId, { cwd, env } = {}) {
  return hasSessionFile(sessionDir(cwd, env));
}

export const list = () => null;
export const stop = null;

export function cleanEnv(env = process.env) {
  const out = { ...env };
  delete out.PI_CODING_AGENT_SESSION_DIR;
  return out;
}

export const messaging = mailboxMessaging;
export const usage = () => null;
