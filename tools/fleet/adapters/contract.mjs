// adapters/contract.mjs — shared helpers for the provider contract in docs/adapters.md.
//
// Every adapter module exports:
//   name, bin, complete, experimental?, tiers, capabilities,
//   start(opts) -> argv | null,
//   resume(opts) -> argv | null,
//   background(argv) -> argv | null,
//   headless({prompt, model, extraArgs}) -> argv | null,
//   completed(output, {status, signal, timedOut, stderr}) -> {ok, reason, sessionId?},
//   canResume(sessionId, {cwd, env}?) -> boolean,
//   list() -> [{id, name, status, cwd}] | null,
//   stop(id) -> argv | null,
//   cleanEnv(env) -> env,
//   messaging, skillsDir, usage(stateDir)
//
// opts for start/resume: {model, context, remoteControl, sessionId, sessionName,
//   promptFile, firstPrompt, cwd}. Unsupported fields are ignored, not rejected.
import fs from 'node:fs';

export const TIER_NAMES = new Set(['strong', 'standard', 'light']);

/** A configured model id. Tier names and empty values mean "CLI default". */
export function usableModel(model) {
  if (model == null || model === '' || TIER_NAMES.has(model)) return null;
  return String(model);
}

export function modelArgs(model) {
  const id = usableModel(model);
  return id ? ['--model', id] : [];
}

/** Parse JSONL, or one JSON document if the whole buffer is a single object. */
export function parseJsonRecords(text) {
  const records = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { records.push(JSON.parse(trimmed)); } catch { /* diagnostic text */ }
  }
  if (!records.length && String(text ?? '').trim().startsWith('{')) {
    try { records.push(JSON.parse(text)); } catch { /* not json */ }
  }
  return records;
}

/** Timeout, signal, or a missing exit short-circuit every provider the same way. */
export function baseVerdict(meta = {}) {
  if (meta.timedOut) return { ok: false, reason: 'timeout' };
  if (meta.signal) return { ok: false, reason: `signal:${meta.signal}` };
  if (meta.status == null) return { ok: false, reason: 'no-exit' };
  return null;
}

export function homeOf(env = process.env) {
  return env.HOME || process.env.HOME || undefined;
}

export function walkFiles(dir, pred, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return false;
  let names;
  try { names = fs.readdirSync(dir); } catch { return false; }
  for (const name of names) {
    const p = `${dir}/${name}`;
    if (pred(name, p)) return true;
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory() && walkFiles(p, pred, depth + 1, maxDepth)) return true;
  }
  return false;
}
