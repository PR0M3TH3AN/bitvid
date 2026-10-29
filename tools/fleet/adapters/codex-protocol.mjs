// adapters/codex-protocol.mjs — turn Codex `exec --json` output into one outcome.
//
// Parsing facts ported from TORCH src/runtime/codex-protocol-reducer.mjs at 11aec08
// (PR0M3TH3AN/TORCH, rewrite/portable-agent-fleet): a 32 KiB line cap, the first
// thread.started id of at most 256 characters, and turn.completed versus
// turn.failed / turn.error / error. That reducer is a subprocess wrapper; this
// file is a pure function because the kit already runs the child in bin/lib.mjs.
//
// Stricter than TORCH: any dropped oversized line, or a final fragment that
// starts with "{" or "[" and does not parse, is truncated, and truncated is
// not success even if turn.completed appeared earlier.
//
// Needs-input types are not classified by that TORCH reducer. The names are the
// snake_case EventMsg tags in openai/codex protocol.rs (ExecApprovalRequest,
// ApplyPatchApprovalRequest, RequestUserInput, RequestPermissions) plus the
// app-server methods that end in /requestApproval or /requestUserInput.
// request_user_input_async and an in-progress command_execution item are not
// needs-input. These events were not captured from a live exec stream.
import { baseVerdict } from './contract.mjs';

export const MAX_PROTOCOL_LINE_CHARS = 32 * 1024;

const NEEDS_INPUT = new Set([
  'exec_approval_request',
  'apply_patch_approval_request',
  'request_user_input',
  'request_permissions',
]);

function needsInput(record) {
  if (NEEDS_INPUT.has(record?.type)) return true;
  const method = record?.method;
  return typeof method === 'string'
    && (method.endsWith('/requestApproval') || method.endsWith('/requestUserInput'));
}

function threadIdOf(record) {
  const id = record?.thread_id ?? record?.threadId;
  return typeof id === 'string' && id.length > 0 && id.length <= 256 ? id : null;
}

/** Last agent_message text in a Codex exec --json stream, or null. */
export function codexAgentText(text) {
  let last = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let record;
    try { record = JSON.parse(trimmed); } catch { continue; }
    const item = record?.item;
    if (record?.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
      last = item.text;
    }
  }
  return last;
}

/** Scan one Codex JSONL buffer. Later terminal events replace earlier ones. */
export function scanCodexOutput(text) {
  const src = String(text ?? '');
  let sessionId = null;
  let terminal = null;
  let failureType = null;
  let truncated = false;
  let pending = '';
  let dropping = false;

  const apply = (record) => {
    if (!sessionId && record?.type === 'thread.started') sessionId = threadIdOf(record);
    if (record?.type === 'turn.completed') terminal = 'turn.completed';
    else if (record?.type === 'turn.failed' || record?.type === 'turn.error' || record?.type === 'error') {
      terminal = 'failure';
      failureType = record.type;
    } else if (needsInput(record)) terminal = 'needs-input';
  };

  const takeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try { apply(JSON.parse(trimmed)); } catch { /* diagnostic text */ }
  };

  let cursor = 0;
  while (cursor < src.length) {
    const newline = src.indexOf('\n', cursor);
    const end = newline < 0 ? src.length : newline;
    const fragment = src.slice(cursor, end);
    if (!dropping) {
      if (pending.length + fragment.length > MAX_PROTOCOL_LINE_CHARS) {
        pending = '';
        dropping = true;
        truncated = true;
      } else pending += fragment;
    }
    if (newline < 0) break;
    if (!dropping) takeLine(pending);
    pending = '';
    dropping = false;
    cursor = newline + 1;
  }

  if (dropping) truncated = true;
  else if (pending.trim()) {
    const trimmed = pending.trim();
    try { apply(JSON.parse(trimmed)); }
    catch { if (trimmed.startsWith('{') || trimmed.startsWith('[')) truncated = true; }
  }

  return { sessionId, terminal, failureType, truncated };
}

/**
 * Definite outcome for one headless Codex run.
 * Timeout, a signal, and a missing exit win first. Then truncation.
 * Exit 0 is success only when the last terminal event is turn.completed.
 */
export function reduceCodexOutput(output, meta = {}) {
  const parsed = scanCodexOutput(output);
  const sessionId = parsed.sessionId;
  const base = baseVerdict(meta);
  if (base) {
    const outcome = base.reason === 'timeout' ? 'timeout' : 'failure';
    return { ...base, ok: false, outcome, sessionId };
  }
  if (parsed.truncated) return { ok: false, outcome: 'truncated', reason: 'truncated', sessionId };
  if (meta.status !== 0) return { ok: false, outcome: 'failure', reason: `exit:${meta.status}`, sessionId };
  if (parsed.terminal === 'turn.completed') return { ok: true, outcome: 'success', reason: 'turn.completed', sessionId };
  if (parsed.terminal === 'needs-input') return { ok: false, outcome: 'needs-input', reason: 'needs-input', sessionId };
  if (parsed.terminal === 'failure') return { ok: false, outcome: 'failure', reason: parsed.failureType, sessionId };
  return { ok: false, outcome: 'failure', reason: 'no-completed-turn', sessionId };
}
