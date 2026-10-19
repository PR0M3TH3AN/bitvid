// adapters/codex.mjs — OpenAI Codex CLI (`codex` / `codex exec`).
//
// Flag placement checked against codex-cli 0.163.0 `--help` (no model turn was run):
//   codex [-m M] -s workspace-write -a on-request -c developer_instructions=... [prompt]
//   codex [-m M] -s workspace-write -a on-request [-c ...] resume <session-id>
//   codex [-m M] -s workspace-write -a never exec --json [extra] <prompt>
// `--ask-for-approval` and `--sandbox` are global (before the subcommand).
// `--json` is an exec flag and is rejected before `exec`.
// Exit 0 without a `turn.completed` event is failure, as is a timeout, a truncated
// stream, or a terminal approval / input request. The thread id comes from
// `thread.started`, not from a rollout filename. See docs/adapters.md.
import fs from 'node:fs';
import { messaging as mailboxMessaging } from './mailbox.mjs';
import { modelArgs } from './contract.mjs';
import { reduceCodexOutput } from './codex-protocol.mjs';

export const name = 'codex';
export const complete = true;
export const experimental = false;
export const bin = 'codex';
export const tiers = { strong: null, standard: null, light: null };
export const capabilities = {
  interactive: true,
  resume: true,
  background: false,
  headless: true,
  doneSignal: 'turn.completed',
  prompt: '-c developer_instructions',
  autoMode: ['--sandbox', 'workspace-write', '--ask-for-approval', 'never'],
  contextFlag: null,
  remoteControl: null,
  nativeMessaging: false,
};
export const skillsDir = '.agents/skills';

const MAX_INSTRUCTION = 24 * 1024;

function instructionArgs(promptFile) {
  if (!promptFile) return [];
  let body;
  try { body = fs.readFileSync(promptFile, 'utf8'); }
  catch { body = ''; }
  if (!body || body.length > MAX_INSTRUCTION) {
    body = `Read and follow the fleet prompt at ${promptFile}. The file on disk wins over anything remembered.`;
  }
  return ['-c', `developer_instructions=${JSON.stringify(body)}`];
}

function addDirArgs(dirs) {
  const args = [];
  // --add-dir does not make .git writable. Sandboxed commits go through fleet commit.
  for (const d of dirs ?? []) if (d) args.push('--add-dir', d);
  return args;
}

const interactive = (model, dirs) => [
  ...modelArgs(model), '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', ...addDirArgs(dirs),
];

export function start({ model, promptFile, firstPrompt, writableDirs } = {}) {
  const args = [bin, ...interactive(model, writableDirs), ...instructionArgs(promptFile)];
  if (firstPrompt) args.push(firstPrompt);
  return args;
}

export function resume({ model, sessionId, promptFile, writableDirs } = {}) {
  if (!sessionId) return null;
  return [bin, ...interactive(model, writableDirs), ...instructionArgs(promptFile), 'resume', sessionId];
}

export const background = null;

export function headless({ prompt, model, extraArgs = [], writableDirs } = {}) {
  return [bin, ...modelArgs(model), '--sandbox', 'workspace-write', '--ask-for-approval', 'never',
    ...addDirArgs(writableDirs), 'exec', '--json', ...extraArgs, prompt];
}

/** Codex mints the thread id in `thread.started`. A fleet UUID must not be stored. */
export const assignsSessionId = false;

/** Definite outcome: success, failure, needs-input, timeout, or truncated. */
export function completed(output, meta = {}) {
  return reduceCodexOutput(output, meta);
}

/** Resume the captured thread id. No rollout-filename scan. */
export function canResume(sessionId) {
  return typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 256;
}

export const list = () => null;
export const stop = null;
export const cleanEnv = (env = process.env) => ({ ...env });
export const messaging = mailboxMessaging;
export const usage = () => null;
