// adapters/cursor.mjs — Cursor's agent CLI (`agent`, same binary as `cursor-agent`).
//
// Verified from `agent --help` of 2026.10.16-e3cb207 and the parameter / output-format
// docs. No authenticated model turn was run. See docs/adapters.md.
//
//   agent --trust [--model M] [prompt]                         new interactive session
//   agent --trust [--model M] --resume <id> | --continue       resume
//   agent -p --output-format json --trust --force [--model M]  one-shot
//
// There is no --append-system-prompt-file, --autocompact, --remote-control, -n, or
// --bg. The composed prompt is a file the first message tells the agent to read.
// `agent persist` exists but its flags were not shown to match a foreground argv,
// so background mode stays unsupported (tmux is the launch path).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { messaging as mailboxMessaging } from './mailbox.mjs';
import { baseVerdict, modelArgs, parseJsonRecords, walkFiles } from './contract.mjs';

export const name = 'cursor';
export const complete = true;
export const experimental = false;
export const bin = 'agent';
export const tiers = { strong: null, standard: null, light: null };
export const capabilities = {
  interactive: true,
  resume: true,
  background: false,
  headless: true,
  doneSignal: 'json-result',
  prompt: 'prompt-file-in-first-message',
  autoMode: ['--trust', '--force'],
  contextFlag: null,
  remoteControl: null,
  nativeMessaging: false,
};
export const skillsDir = '.cursor/rules';

const home = (env) => env?.HOME || os.homedir();

function promptLead(promptFile, firstPrompt) {
  const note = promptFile
    ? `Read and follow the fleet prompt at ${promptFile} before acting. The file on disk wins over anything remembered.`
    : '';
  return [note, firstPrompt].filter(Boolean).join('\n\n');
}

function storeOf(sessionId, env) {
  const root = path.join(home(env), '.cursor', 'chats');
  return walkFiles(root, (name, p) => name === sessionId && fs.existsSync(path.join(p, 'store.db')), 0, 2);
}

function workspaceHasChat(cwd, env) {
  if (!cwd) return false;
  const dir = path.join(home(env), '.cursor', 'chats', crypto.createHash('md5').update(path.resolve(cwd)).digest('hex'));
  try { return fs.readdirSync(dir).some((id) => fs.existsSync(path.join(dir, id, 'store.db'))); }
  catch { return false; }
}

/** New interactive session. sessionId is not a Cursor chat id until create-chat, which we do not call. */
export function start({ model, promptFile, firstPrompt } = {}) {
  const prompt = promptLead(promptFile, firstPrompt);
  return [bin, '--trust', ...modelArgs(model), ...(prompt ? [prompt] : [])];
}

/** Resume a known chat id, or the latest chat in this workspace. */
export function resume({ model, sessionId, cwd, env } = {}) {
  if (sessionId && storeOf(sessionId, env)) return [bin, '--trust', ...modelArgs(model), '--resume', sessionId];
  if (workspaceHasChat(cwd, env)) return [bin, '--trust', ...modelArgs(model), '--continue'];
  return null;
}

export const background = null;

export function headless({ prompt, model, extraArgs = [] } = {}) {
  const extras = [...extraArgs];
  for (const flag of ['--trust', '--force']) if (!extras.includes(flag)) extras.push(flag);
  return [bin, '-p', '--output-format', 'json', ...modelArgs(model), ...extras, prompt];
}

/**
 * Success is a JSON result object with subtype "success" and is_error false.
 * Exit 0 without that object is failure. Works for `json` and `stream-json`.
 */
export function completed(output, meta = {}) {
  const base = baseVerdict(meta);
  if (base) return base;
  if (meta.status !== 0) return { ok: false, reason: `exit:${meta.status}` };
  const result = [...parseJsonRecords(output)].reverse().find((r) => r && r.type === 'result');
  if (!result || result.is_error || result.subtype !== 'success') {
    return { ok: false, reason: result ? `result:${result.subtype ?? 'error'}` : 'no-completed-result', sessionId: result?.session_id ?? null };
  }
  return { ok: true, reason: 'result', sessionId: result.session_id ?? null };
}

export function canResume(sessionId, { cwd, env } = {}) {
  if (sessionId && storeOf(sessionId, env)) return true;
  return workspaceHasChat(cwd, env);
}

export const list = () => null;
export const stop = null;
export const cleanEnv = (env = process.env) => ({ ...env });
export const messaging = mailboxMessaging;
export const usage = () => null;
