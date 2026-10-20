// Agent-facing fleet operations. The CLIs in bin/ and the stdio MCP server
// both call these. Do not copy this logic into a plugin or a second server.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { area as getArea, die, pidAlive, tryGit, git, mainRef, writeAtomic, today, landerIsUp, matchesAny, startLander, runTimedSync } from '../lib.mjs';
import { send as mailboxSendFile, read as mailboxReadDir, archive as mailboxArchiveDir } from '../../adapters/mailbox.mjs';

const STATUSES = ['open', 'in-progress', 'blocked', 'done', 'deferred'];
const SPECIAL = ['owner', 'scheduler', 'interpreter'];
/** Paths a setup commit may stage. Product files are not in this list. */
export const SETUP_PATHS = ['fleet.config.json', 'tools/fleet', 'docs/agents', 'docs/TODO.md', 'fleet', '.gitignore', 'AGENTS.md', '.agents'];
const GITIGNORE_ADDS = new Set(['fleet/inbox/', '.task', '.fleet/']);
const num = (id) => Number(String(id).match(/(\d+)$/)?.[1] ?? 0);

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function backlogDir(c, cwd = process.cwd()) {
  const top = tryGit(cwd, 'rev-parse', '--show-toplevel');
  const dir = path.join(top.ok ? top.out : c.repo, c.paths.backlog);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readItems(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const parsed = readJson(path.join(dir, f));
    return parsed ?? { id: f, status: 'BROKEN-JSON', area: '?', title: f };
  });
}

function itemPath(dir, id) {
  if (!/^[\w.-]+$/.test(id || '')) die(`no item ${id}`);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) die(`no item ${id}`);
  return file;
}

export function listBacklog(c, { area, status, cwd } = {}) {
  const items = readItems(backlogDir(c, cwd));
  return items.filter((i) => (!area || i.area === area) && (status ? i.status === status : i.status !== 'done'))
    .sort((a, b) => String(a.area).localeCompare(String(b.area)) || num(a.id) - num(b.id));
}

export function addBacklog(c, { area, title, id, blockedOn, cwd } = {}) {
  if (!area) die('--area required');
  if (!title) die('--title required');
  const a = getArea(c, area);
  const dir = backlogDir(c, cwd);
  const items = readItems(dir);
  const prefix = a.backlogPrefix ?? a.id;
  const itemId = id ?? `${prefix}-${Math.max(0, ...items.filter((i) => String(i.id).startsWith(`${prefix}-`)).map((i) => num(i.id))) + 1}`;
  if (fs.existsSync(path.join(dir, `${itemId}.json`))) die(`${itemId} exists`);
  const where = cwd || process.cwd();
  const head = tryGit(where, 'rev-parse', 'HEAD');
  const it = { id: itemId, area: a.id, status: blockedOn ? 'blocked' : 'open', title, blockedOn: blockedOn ?? null, addedOn: today(), filedAt: head.ok ? head.out : null };
  writeAtomic(path.join(dir, `${it.id}.json`), JSON.stringify(it, null, 1) + '\n');
  return it;
}

export function updateBacklog(c, id, fields = {}, cwd) {
  const file = itemPath(backlogDir(c, cwd), id);
  const it = readJson(file);
  let statusSet = false;
  for (const [k, raw] of Object.entries(fields)) {
    if (k === 'id') die('id cannot change');
    const v = raw === 'null' ? null : raw;
    if (k === 'status' && !STATUSES.includes(v)) die(`status must be one of ${STATUSES.join(', ')}`);
    if (k === 'area') getArea(c, v);
    it[k] = v;
    if (k === 'status') statusSet = true;
  }
  if (it.status !== 'blocked' && statusSet) it.blockedOn = null;
  writeAtomic(file, JSON.stringify(it, null, 1) + '\n');
  return it;
}

/** Not-done items for an area, in id order. Which one to do is a prompt decision. */
export function nextBacklog(c, area, cwd) {
  getArea(c, area);
  return readItems(backlogDir(c, cwd))
    .filter((i) => i.area === area && i.status !== 'done')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * Mark a named item in-progress. The write is atomic. Status and area are not
 * refused here: whether a blocked, done, or other area's item should be taken
 * is judgment, and the prompt says how to make it.
 */
export function claimBacklog(c, { area, id, cwd } = {}) {
  if (!area) die('area required');
  getArea(c, area);
  if (!id) return { item: null, idle: true, open: nextBacklog(c, area, cwd) };
  const dir = backlogDir(c, cwd);
  const it = readJson(itemPath(dir, id));
  if (it.status !== 'in-progress') {
    it.status = 'in-progress';
    it.blockedOn = null;
    writeAtomic(path.join(dir, `${it.id}.json`), JSON.stringify(it, null, 1) + '\n');
  }
  return { item: it, idle: false };
}

export function closeBacklog(c, id, cwd) {
  const file = itemPath(backlogDir(c, cwd), id);
  const it = readJson(file);
  it.status = 'done';
  it.blockedOn = null;
  it.closedOn = today();
  writeAtomic(file, JSON.stringify(it, null, 1) + '\n');
  return it;
}

function knownParty(c, id) {
  if (SPECIAL.includes(id)) return;
  getArea(c, id);
}

export function sendMailbox(c, { to, from, body, subject = '' } = {}) {
  if (!from) die('--from <your id> required');
  knownParty(c, from);
  if (!body || !String(body).trim()) die('empty message');
  const targets = to === 'all' ? c.areas.map((a) => a.id).filter((id) => id !== from) : [to];
  const files = targets.map((t) => { knownParty(c, t); return mailboxSendFile(c.mailbox.dir, t, from, body, subject ?? ''); });
  const wakes = targets.filter((t) => t !== from).map((t) => ({ to: t, ...nudgeMail(c, t, from) }));
  return Object.assign(files, { wakes });
}

/**
 * Reading takes the messages: they move to the archive, so unread means not yet read.
 * Then the same one-time stale-unread check as fleet status runs. count passes
 * recover:false so a count does not nudge.
 */
export function readMailbox(c, area, { recover = true } = {}) {
  knownParty(c, area);
  const msgs = mailboxReadDir(c.mailbox.dir, area);
  for (const m of msgs) {
    try { mailboxArchiveDir(c.mailbox.dir, area, m.file); } catch { /* already archived */ }
  }
  if (!recover) return msgs;
  const status = fleetStatus(c);
  return Object.assign(msgs, { recovered: status.recovered });
}

export function archiveMailbox(c, area, which) {
  knownParty(c, area);
  return mailboxArchiveDir(c.mailbox.dir, area, which);
}

function gitignoreIsFleetOnly(repo) {
  const st = tryGit(repo, 'status', '--porcelain', '--', '.gitignore');
  if (!st.ok || !st.out) return false;
  if (st.out.split('\n').every((l) => l.startsWith('??'))) return true;
  const diff = tryGit(repo, 'diff', '-U0', '--', '.gitignore');
  const lines = (diff.out || '').split('\n').filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'));
  return lines.length > 0 && lines.every((l) => l.startsWith('+') && GITIGNORE_ADDS.has(l.slice(1)));
}

/**
 * Commit only the fleet setup files in the main checkout. Runs in this process
 * (fleet init, or the MCP server outside an agent sandbox). A sandboxed git
 * commit cannot write the index; this is the path that can. Product files are
 * left unstaged.
 */
export function setupCommit(repo, { message = 'fleet init' } = {}) {
  if (!tryGit(repo, 'rev-parse', '--git-dir').ok) die(`not a git repo: ${repo}`);
  const paths = [];
  for (const spec of SETUP_PATHS) {
    if (spec === '.gitignore') {
      if (gitignoreIsFleetOnly(repo)) paths.push(spec);
      continue;
    }
    const st = tryGit(repo, 'status', '--porcelain', '--', spec);
    if (st.ok && st.out) paths.push(spec);
  }
  if (!paths.length) {
    const head = tryGit(repo, 'rev-parse', 'HEAD');
    return { sha: head.ok ? head.out : null, committed: [], pending: false };
  }
  const add = tryGit(repo, 'add', '--', ...paths);
  if (!add.ok) return { sha: null, committed: [], pending: true, paths, error: add.err || 'git add failed' };
  const email = tryGit(repo, 'config', 'user.email').out;
  const args = ['-c', 'core.editor=true', ...(email ? [] : ['-c', 'user.email=fleet-init@localhost', '-c', 'user.name=fleet init']), 'commit', '-m', message, '--', ...paths];
  const commit = tryGit(repo, ...args);
  if (!commit.ok) return { sha: null, committed: [], pending: true, paths, error: commit.err || commit.out || 'git commit failed' };
  return { sha: tryGit(repo, 'rev-parse', 'HEAD').out, committed: paths, pending: false };
}

/** Mail the session manager from the interpreter. The wake is the same short line as any other mail. */
export function tellDispatch(c, { body, from = 'interpreter', subject = '' } = {}) {
  const hub = c.areas.find((a) => a.role === 'dispatcher');
  if (!hub) die('no session manager (role dispatcher)');
  const files = sendMailbox(c, { to: hub.id, from, body, subject });
  const wake = (files.wakes || []).find((w) => w.to === hub.id) || { submitted: false, reason: 'no-window' };
  const status = fleetStatus(c);
  return { files: [...files], to: hub.id, from, nudged: Boolean(wake.submitted), wake, recovered: status.recovered };
}

export function hearInterpreter(c) {
  return readMailbox(c, 'interpreter');
}

const NUDGE_PAUSE_MS = 200;
const NUDGE_SETTLE_MS = 150;
const NUDGE_RETRY_MS = 400;
const IDLE_AFTER_MS = 3000;
const RECOVER_AFTER_MS = 120000;
const BUSY_RE = /esc to interrupt|esc to cancel|ctrl\+c to (?:interrupt|cancel)/i;

export function nudgeLine(from) {
  return `You have new fleet mail from ${from}. Read it with mailbox_read.`;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tmuxTarget(c, areaId) {
  return `fleet-${c.project}`.replace(/[.:]/g, '-') + `:${areaId}`;
}

function tmuxText(args) {
  return spawnSync('tmux', args, { encoding: 'utf8' });
}

function capturePane(target) {
  const r = tmuxText(['capture-pane', '-p', '-t', target]);
  return r.status === 0 ? r.stdout : '';
}

function cursorRow(target, pane) {
  const info = tmuxText(['display-message', '-p', '-t', target, '#{cursor_y}']);
  const y = Number(String(info.stdout || '').trim());
  const rows = String(pane).split('\n');
  if (!Number.isInteger(y) || y < 0 || y >= rows.length) return rows[rows.length - 1] || '';
  return rows[y] || '';
}

function stillInInput(target, line) {
  return cursorRow(target, capturePane(target)).includes(line);
}

/**
 * Wake an open tmux window with a short line, not the mail body.
 * Codex and Claude treat a fast burst as a paste and swallow Enter, so the
 * line is typed, then Enter is sent after a pause, outside that burst.
 * If the cursor row still holds the line, Enter is sent once more.
 * A pane that shows an interrupt hint is left alone; a later status check can nudge it.
 */
export function nudgeMail(c, areaId, from) {
  const target = tmuxTarget(c, areaId);
  if (tmuxText(['list-panes', '-t', target]).status !== 0) return { submitted: false, reason: 'no-window' };
  const line = nudgeLine(from);
  if (BUSY_RE.test(capturePane(target))) return { submitted: false, reason: 'working', line };
  if (tmuxText(['send-keys', '-t', target, '-l', line]).status !== 0) return { submitted: false, reason: 'send-failed', line };
  sleepMs(NUDGE_PAUSE_MS);
  tmuxText(['send-keys', '-t', target, 'Enter']);
  sleepMs(NUDGE_SETTLE_MS);
  if (!stillInInput(target, line)) return { submitted: true, reason: 'submitted', line };
  sleepMs(NUDGE_RETRY_MS);
  tmuxText(['send-keys', '-t', target, 'Enter']);
  sleepMs(NUDGE_SETTLE_MS);
  const submitted = !stillInInput(target, line);
  return { submitted, reason: submitted ? 'submitted' : 'not-submitted', line };
}

function unreadFiles(c, id) {
  const box = path.join(c.mailbox.dir, id);
  if (!fs.existsSync(box)) return [];
  return fs.readdirSync(box).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort()
    .map((f) => ({ file: f, path: path.join(box, f), mtimeMs: fs.statSync(path.join(box, f)).mtimeMs }));
}

function paneView(c, areaId, idleAfterMs) {
  const target = tmuxTarget(c, areaId);
  if (tmuxText(['list-panes', '-t', target]).status !== 0) return { window: 'dead', activity: 'unknown' };
  const info = tmuxText(['display-message', '-p', '-t', target, '#{pane_dead} #{window_activity}']);
  const match = String(info.stdout || '').trim().match(/^([01])\s+(\d+)$/);
  if (info.status !== 0 || !match) return { window: 'dead', activity: 'unknown' };
  const [, dead, stamp] = match;
  if (dead === '1') return { window: 'dead', activity: 'unknown' };
  const pane = capturePane(target);
  const busy = BUSY_RE.test(pane);
  const ageMs = Date.now() - Number(stamp) * 1000;
  const activity = busy || ageMs < idleAfterMs ? 'working' : 'idle';
  return { window: 'alive', activity };
}

function nudgeStatePath(c) {
  return path.join(c.stateDir, 'mail-nudges.json');
}

function readNudgeState(c) {
  try { return JSON.parse(fs.readFileSync(nudgeStatePath(c), 'utf8')); } catch { return {}; }
}

function senderOf(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text.match(/^from: (.+)$/m)?.[1]?.trim() || 'fleet';
  } catch { return 'fleet'; }
}

/**
 * Per-area window, unread count, and a working/idle guess from the pane.
 * When an area is idle with mail that has been unread for a while, nudge once.
 * That is the only recovery. It runs when someone looks at status, reads mail,
 * hears, or tells. A filename already nudged is not nudged again. There is no timer.
 */
export function fleetStatus(c, { recoverAfterMs = RECOVER_AFTER_MS, idleAfterMs = IDLE_AFTER_MS } = {}) {
  const state = readNudgeState(c);
  let stateDirty = false;
  const recovered = [];
  const areas = c.areas.map((a) => {
    const view = paneView(c, a.id, idleAfterMs);
    const unread = unreadFiles(c, a.id);
    const row = {
      id: a.id, role: a.role, harness: a.harness,
      window: view.window, unread: unread.length, activity: view.activity,
    };
    const oldest = unread[0];
    const age = oldest ? Date.now() - oldest.mtimeMs : 0;
    const already = (state[a.id] || []).includes(oldest?.file);
    if (view.window === 'alive' && view.activity === 'idle' && oldest && age >= recoverAfterMs && !already) {
      const wake = nudgeMail(c, a.id, senderOf(oldest.path));
      state[a.id] = [...(state[a.id] || []), oldest.file];
      stateDirty = true;
      row.recovered = true;
      row.recoverReason = wake.reason;
      recovered.push(a.id);
    }
    return row;
  });
  if (stateDirty) writeAtomic(nudgeStatePath(c), JSON.stringify(state));
  return { areas, recovered, interpreter: { unread: unreadFiles(c, 'interpreter').length } };
}

export function queuePaths(c) {
  const state = path.join(c.stateDir, 'landq');
  const queue = path.join(state, 'queue');
  const done = path.join(state, 'results');
  for (const d of [queue, done]) fs.mkdirSync(d, { recursive: true });
  return {
    state, queue, done,
    pid: path.join(state, 'lander.pid'),
    inflight: path.join(state, 'inflight.json'),
    log: path.join(state, 'landq.log'),
  };
}

export { readJson };

export function queued(c) {
  const { queue } = queuePaths(c);
  return fs.readdirSync(queue).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ ...readJson(path.join(queue, f)), qfile: f }));
}

export function landerAlive(c) {
  return landerIsUp(c);
}

export function submitLanding(c, cwd = process.cwd(), { autostart = true } = {}) {
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === c.mainBranch || branch === 'HEAD') die(`refusing: submit from your area branch, not ${branch}`);
  const warnings = [];
  if (git(cwd, 'status', '--porcelain')) warnings.push('uncommitted changes stay in the worktree; only the committed tip is queued');
  const sha = git(cwd, 'rev-parse', 'HEAD');
  const timeoutMs = Number(c.gates?.timeoutMin) > 0 ? Number(c.gates.timeoutMin) * 60000 : 0;
  if (c.remote) {
    const fetched = runTimedSync({ cmd: 'git', args: ['-C', cwd, 'fetch', '-q', c.remote, c.mainBranch], timeoutMs });
    if (fetched.timedOut) die(`fetch timed out after ${c.gates.timeoutMin} min`);
    if (fetched.status !== 0) die(`fetch of ${c.mainBranch} failed: ${(fetched.stderr || fetched.stdout || '').trim() || `exit ${fetched.status}`}`);
    const pushed = runTimedSync({ cmd: 'git', args: ['-C', cwd, 'push', '-q', c.remote, `HEAD:refs/heads/${branch}`], timeoutMs });
    if (pushed.timedOut) die(`push timed out after ${c.gates.timeoutMin} min`);
    if (pushed.status !== 0) die(`push of ${branch} failed: ${(pushed.stderr || pushed.stdout || '').trim() || `exit ${pushed.status}`}`);
  }
  const files = git(cwd, 'diff', '--name-only', `${mainRef(c)}...HEAD`).split('\n').filter(Boolean);
  if (!files.length) die(`nothing to land: ${branch} has no changes against ${mainRef(c)}${warnings.length ? ' (uncommitted changes were not committed)' : ''}`);
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const area = c.areas.find((a) => path.resolve(a.worktree) === path.resolve(top))?.id ?? branch;
  const entry = { sha, branch, area, files, submittedAt: new Date().toISOString() };
  const { queue } = queuePaths(c);
  writeAtomic(path.join(queue, `${Date.now()}-${sha.slice(0, 10)}.json`), JSON.stringify(entry, null, 1));
  const landerStarted = autostart ? startLander(c, { configPath: c.file }) : 0;
  return { ...entry, id: sha, warnings, landerAlive: landerAlive(c), landerStarted, hint: statusHint(sha) };
}

const STATUS_HINT = (sha) => `Submission ${sha}. Go back to work. At your next natural checkpoint, check MCP land_status (id ${sha}) or \`fleet landq status ${sha}\` if you need the result. Waiting is optional. Never infer the lander or the land result from silence.`;
export function statusHint(sha) { return STATUS_HINT(sha); }

const REJECTED = new Set(['conflict', 'failed', 'red', 'refused', 'withdrawn']);
const MAX_WAIT_SEC = 600;
const DEFAULT_WAIT_SEC = 120;

function landerInfo(c) {
  const { pid: pidFile } = queuePaths(c);
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { rec = null; }
  const pid = Number(rec?.pid) || 0;
  const alive = pid > 0 && pidAlive(pid);
  return {
    alive,
    pid: pid || null,
    since: typeof rec?.since === 'string' ? rec.since : null,
    tickedAt: typeof rec?.tickedAt === 'string' ? rec.tickedAt : null,
  };
}

function oneMatch(items, id) {
  const exact = items.find((e) => e && e.sha === id);
  if (exact) return exact;
  const hits = items.filter((e) => e && typeof e.sha === 'string' && e.sha.startsWith(id));
  if (hits.length > 1) return { ambiguous: true };
  return hits[0] ?? null;
}

/** Durable state of one submission, plus whether the lander process is alive. */
export function readSubmission(c, id) {
  if (!id || !/^[0-9a-f]{4,64}$/i.test(id)) die('land status needs a submission id (sha prefix, at least 4 hex characters)');
  const { done, inflight } = queuePaths(c);
  const lander = landerInfo(c);
  const base = {
    id,
    lander,
    hint: lander.alive ? null : 'lander is not running. Start it with: fleet lander start',
  };
  const doneItems = fs.readdirSync(done).filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(done, f))).filter(Boolean);
  const finished = oneMatch(doneItems, id);
  if (finished?.ambiguous) return { ...base, state: 'unknown', reason: 'ambiguous id; pass a longer sha' };
  if (finished) {
    const sha = finished.sha;
    if (finished.status === 'landed') {
      return { ...base, id: sha, state: 'landed', sha, landedSha: finished.mergedAs ?? null, area: finished.area ?? null, branch: finished.branch ?? null, at: finished.at ?? null };
    }
    const raw = typeof finished.detail === 'string' && finished.detail.trim() ? finished.detail.trim() : (finished.status || 'rejected');
    return {
      ...base, id: sha, state: 'rejected', sha, reason: raw.split('\n')[0],
      status: REJECTED.has(finished.status) ? finished.status : (finished.status || 'rejected'),
      area: finished.area ?? null, branch: finished.branch ?? null, at: finished.at ?? null,
    };
  }
  const waiting = oneMatch(queued(c), id);
  if (waiting?.ambiguous) return { ...base, state: 'unknown', reason: 'ambiguous id; pass a longer sha' };
  if (waiting) {
    const flying = readJson(inflight, []);
    const gating = Array.isArray(flying) && flying.includes(waiting.sha);
    return {
      ...base, id: waiting.sha, state: gating ? 'gating' : 'queued', sha: waiting.sha,
      area: waiting.area ?? null, branch: waiting.branch ?? null, submittedAt: waiting.submittedAt ?? null,
    };
  }
  return { ...base, state: 'unknown', reason: 'no submission with that id' };
}

function boundWait(timeoutSec) {
  const n = timeoutSec == null || timeoutSec === '' ? DEFAULT_WAIT_SEC : Number(timeoutSec);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WAIT_SEC;
  return Math.min(MAX_WAIT_SEC, n);
}

/**
 * One submission's durable state. wait polls until landed, rejected, or unknown,
 * or until timeoutSec (default 120, max 600). queued and gating keep polling.
 */
export async function submissionStatus(c, id, { wait = false, timeoutSec } = {}) {
  let snap = readSubmission(c, id);
  if (!wait || snap.state === 'landed' || snap.state === 'rejected' || snap.state === 'unknown') return snap;
  const deadline = Date.now() + boundWait(timeoutSec) * 1000;
  while ((snap.state === 'queued' || snap.state === 'gating') && Date.now() < deadline) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(250, left)));
    snap = readSubmission(c, id);
  }
  if (snap.state === 'queued' || snap.state === 'gating') return { ...snap, timedOut: true };
  return snap;
}

function samePath(a, b) {
  try { return fs.realpathSync(a) === fs.realpathSync(b); }
  catch { return path.resolve(a) === path.resolve(b); }
}

function gitOrDie(cwd, ...args) {
  const r = tryGit(cwd, ...args);
  if (!r.ok) die(r.err || r.out || `git ${args[0]} failed`);
  return r.out;
}

/** Paths from `git status --porcelain -z`, rename/copy recorded as the new name. */
function changedFiles(cwd) {
  const out = gitOrDie(cwd, 'status', '--porcelain', '-z');
  if (!out) return [];
  const parts = out.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (!rec) continue;
    const xy = rec.slice(0, 2);
    if (xy.includes('R') || xy.includes('C')) files.push(parts[++i]);
    else files.push(rec.slice(3));
  }
  return files.filter(Boolean);
}

/** A path the caller named, relative to the worktree, or a refusal. */
function pathInWorktree(worktree, spec) {
  if (typeof spec !== 'string' || !spec.trim()) die('empty path');
  const abs = path.resolve(worktree, spec);
  const rel = path.relative(worktree, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) die(`refusing: ${spec} is outside the worktree`);
  let probe = abs;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let realProbe, realWt;
  try { realProbe = fs.realpathSync(probe); realWt = fs.realpathSync(worktree); }
  catch { die(`refusing: ${spec} is outside the worktree`); }
  const relReal = path.relative(realWt, realProbe);
  if (relReal.startsWith('..') || path.isAbsolute(relReal)) die(`refusing: ${spec} is outside the worktree`);
  return rel.split(path.sep).join('/');
}

/**
 * Stage and commit in one area worktree. Runs in this process (the CLI or the
 * MCP server), not in a sandboxed agent. Refuses the main checkout, mainBranch,
 * a detached HEAD, and any path outside the worktree. doesNotOwn paths warn.
 */
export function commitWork(c, { cwd = process.cwd(), area, message, paths, all = false, submit = false } = {}) {
  const msg = typeof message === 'string' ? message.trim() : '';
  if (!msg) die('commit needs a message');
  const listed = Array.isArray(paths) ? paths : (paths == null || paths === '' ? [] : [paths]);
  if (all && listed.length) die('pass paths or all, not both');
  if (!all && !listed.length) die('pass paths or all');
  const top = gitOrDie(cwd, 'rev-parse', '--show-toplevel');
  const branch = gitOrDie(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (samePath(top, c.repo)) die(`refusing: ${top} is the main checkout. Commit in the area worktree.`);
  if (branch === c.mainBranch || branch === 'HEAD') die(`refusing: commit from your area branch, not ${branch}`);
  const areaObj = area
    ? getArea(c, area)
    : c.areas.find((a) => samePath(a.worktree, top));
  if (!areaObj) die(`refusing: ${top} is not an area worktree. Pass area, or run from the worktree.`);
  if (area && !samePath(areaObj.worktree, top)) die(`refusing: ${top} is not the worktree for ${area} (${areaObj.worktree})`);
  const rels = all ? changedFiles(top) : listed.map((p) => pathInWorktree(top, p));
  if (!rels.length) die('nothing to commit');
  const warnings = [];
  for (const rel of rels) {
    if (areaObj.doesNotOwn?.length && matchesAny(rel, areaObj.doesNotOwn)) warnings.push(`${rel} matches doesNotOwn for ${areaObj.id}`);
  }
  if (all) gitOrDie(top, 'add', '-A');
  else gitOrDie(top, 'add', '--', ...rels);
  gitOrDie(top, '-c', 'core.editor=true', 'commit', '-m', msg, ...(all ? [] : ['--', ...rels]));
  const sha = gitOrDie(top, 'rev-parse', 'HEAD');
  const result = { sha, area: areaObj.id, branch, warnings };
  if (submit) result.landing = submitLanding(c, top);
  return result;
}

export function landingStatus(c, prefix) {
  const { done } = queuePaths(c);
  if (prefix) {
    const name = fs.readdirSync(done).find((f) => f.startsWith(prefix));
    if (name) return { found: true, phase: 'done', result: readJson(path.join(done, name)) };
    const hit = queued(c).find((e) => e.sha.startsWith(prefix));
    if (hit) return { found: true, phase: 'queued', result: hit };
    return { found: false, prefix };
  }
  const recent = fs.readdirSync(done).map((f) => readJson(path.join(done, f))).filter(Boolean)
    .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
  return { found: true, phase: 'overview', landerAlive: landerAlive(c), queue: queued(c), recent };
}

export function areaInfo(c, id) {
  const one = (a) => ({
    id: a.id, title: a.title, role: a.role, domain: a.domain, provider: a.provider,
    tier: a.tier, model: a.model, owns: a.owns, branch: a.branch, worktree: a.worktree,
  });
  if (id) return one(getArea(c, id));
  return c.areas.map(one);
}
