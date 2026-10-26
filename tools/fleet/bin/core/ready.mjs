// Startup readiness. One mailbox round trip, the Codex approval path, health,
// durable deps, and the last checkpoints. No model call and no daemon.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { send, read, archive } from '../../adapters/mailbox.mjs';
import { fleetHealth } from './health.mjs';
import { readHoldMap, readProgressMap } from './progress.mjs';

const USAGE_RE = /five-hour|usage limit|%\s*remaining|rate limit/i;

export function codexConfigCandidates(repo, env = process.env, home = os.homedir()) {
  const root = env.CODEX_HOME || path.join(home, '.codex');
  return [path.join(root, 'config.toml'), path.join(repo, '.codex', 'config.toml')];
}

/**
 * Read the agent-fleet approval mode out of a Codex config.toml.
 * `approve` is the always-allow value. `auto` still requires approval for
 * tools that are not marked read-only, and on-request auto-review then runs.
 */
export function parseCodexMcpApproval(text, server = 'agent-fleet') {
  let section = '';
  const result = { server: false, defaultMode: null, tools: {} };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const table = /^\[([^\]]+)\]$/.exec(line);
    if (table) { section = table[1].trim(); continue; }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const val = kv[2].trim().replace(/^['"]|['"]$/g, '');
    if (section === `mcp_servers.${server}` && kv[1] === 'default_tools_approval_mode') {
      result.server = true;
      result.defaultMode = val;
    }
    const tool = new RegExp(`^mcp_servers\\.${server}\\.tools\\.(.+)$`).exec(section);
    if (tool && kv[1] === 'approval_mode') {
      result.server = true;
      result.tools[tool[1]] = val;
    }
  }
  const sendMode = result.tools.mailbox_send;
  const tellMode = result.tools.tell;
  const mailOk = result.defaultMode === 'approve' || (sendMode === 'approve' && tellMode === 'approve');
  return { ...result, mailOk };
}

export function readCodexApproval(repo, opt = {}) {
  const files = [];
  for (const file of codexConfigCandidates(repo, opt.env, opt.home)) {
    if (!file || files.some((row) => row.file === file)) continue;
    if (!fs.existsSync(file)) {
      files.push({ file, found: false });
      continue;
    }
    const parsed = parseCodexMcpApproval(fs.readFileSync(file, 'utf8'));
    files.push({ file, found: true, ...parsed });
  }
  const hit = files.find((row) => row.mailOk) || files.find((row) => row.found && row.server) || null;
  return {
    files,
    mailOk: Boolean(hit?.mailOk),
    mode: hit?.defaultMode ?? null,
    file: hit?.file ?? null,
    note: 'fleet up runs codex with no --profile and does not set CODEX_HOME. The session reads the same config.toml as any other Codex process in that environment. The server name is agent-fleet. Shell fleet tell is a sandboxed command; default_tools_approval_mode does not apply to it.',
  };
}

/** Prove send, read, and archive on an isolated mailbox. Does not wake a pane. */
export function mailboxRoundTrip(dir) {
  const probe = path.join(dir, 'probe');
  fs.rmSync(probe, { recursive: true, force: true });
  const body = `ready ${Date.now()} ${process.pid}`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = path.join(dir, `.write-${process.pid}`);
    fs.writeFileSync(stamp, 'ok');
    fs.unlinkSync(stamp);
    const file = send(probe, 'ready', 'ready', body, 'round trip');
    const msgs = read(probe, 'ready');
    const hit = msgs.find((m) => m.text.includes(body));
    if (!hit) return { ok: false, error: 'read did not see the message just written' };
    archive(probe, 'ready', hit.file);
    const left = read(probe, 'ready');
    if (left.length) return { ok: false, error: 'archive left the message unread' };
    return { ok: true, file: path.basename(file) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

export function depsReady(c) {
  const root = path.join(c.stateDir, 'deps');
  const manifest = path.join(root, 'manifest.txt');
  const missing = [];
  if (fs.existsSync(manifest)) {
    for (const line of fs.readFileSync(manifest, 'utf8').split('\n')) {
      const rel = line.trim();
      if (!rel || rel.startsWith('#')) continue;
      const file = path.resolve(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) { missing.push(rel); continue; }
      if (!fs.existsSync(file)) missing.push(rel);
    }
  }
  const names = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'go.sum'];
  const repoManifests = names.filter((name) => fs.existsSync(path.join(c.repo, name)));
  return {
    repoManifests,
    manifest: fs.existsSync(manifest),
    missing,
    ok: missing.length === 0,
    note: 'Keep runners, lockfiles, pinned archives, and evidence in the worktree or stateDir/deps. /tmp and the npm cache are disposable.',
  };
}

export function usageSignal(c) {
  const file = path.join(c.stateDir, 'wake-log.jsonl');
  if (!fs.existsSync(file)) return { seen: false, line: null };
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-80);
  const hit = [...lines].reverse().find((line) => USAGE_RE.test(line)) || null;
  return { seen: Boolean(hit), line: hit ? hit.slice(0, 240) : null };
}

export function fleetReady(c, opt = {}) {
  const mailbox = mailboxRoundTrip(path.join(c.stateDir, 'ready-mailbox'));
  const approval = readCodexApproval(c.repo, opt);
  const health = opt.health || fleetHealth(c, { sampleMs: 0, ...(opt.healthOpt || {}) });
  const deps = depsReady(c);
  const checkpoints = Object.values(readProgressMap(c));
  const holds = Object.values(readHoldMap(c));
  const usage = usageSignal(c);
  return {
    ok: mailbox.ok && deps.ok,
    mailbox,
    approval,
    health: { verdict: health.verdict, notes: health.notes || [] },
    deps,
    checkpoints,
    holds,
    usage,
  };
}

export function formatReady(report) {
  const lines = [];
  lines.push(report.mailbox.ok ? 'mailbox  round trip ok' : `mailbox  round trip failed: ${report.mailbox.error}`);
  if (report.approval.mailOk) lines.push(`approval  ${report.approval.mode || 'per-tool approve'} in ${report.approval.file}`);
  else {
    const seen = (report.approval.files || []).filter((row) => row.found && row.server);
    const where = seen.length ? seen.map((row) => `${row.file} mode=${row.defaultMode || 'unset'}`).join('; ') : 'no [mcp_servers.agent-fleet] table found';
    lines.push(`approval  want default_tools_approval_mode = "approve" (or per-tool approval_mode = "approve" on mailbox_send and tell). ${where}. auto still asks, and on-request auto-review can reject the call. Offer to write approve only after the user says yes, then reload Codex.`);
  }
  lines.push(`health  ${report.health.verdict}`);
  for (const note of report.health.notes || []) lines.push(`health note  ${note.words}`);
  const manifests = report.deps.repoManifests.length ? report.deps.repoManifests.join(', ') : 'none in the repo root';
  lines.push(`deps  repo manifests: ${manifests}${report.deps.manifest ? '; stateDir/deps/manifest.txt present' : ''}`);
  if (report.deps.missing.length) lines.push(`deps missing  ${report.deps.missing.join(', ')}`);
  lines.push(`deps note  ${report.deps.note}`);
  if (!report.checkpoints.length) lines.push('checkpoints  none yet');
  for (const row of report.checkpoints) lines.push(`checkpoint  ${row.area}  ${row.at}  ${row.line}`);
  if (!report.holds.length) lines.push('holds  none');
  for (const row of report.holds) lines.push(`hold  ${row.area}  owner ${row.owner}; unblock ${row.unblock}; next ${row.next}`);
  if (report.usage.seen) lines.push('usage  a recent wake line mentioned a usage limit. Checkpoint and hand off; resume from the checkpoints after the window resets.');
  lines.push('resume  continue from the checkpoints. A live window is not progress.');
  return lines.join('\n');
}
