// lib.mjs — shared helpers: find + load fleet.config.json, resolve areas, git, globs.
// Dependency-free. Every tool in bin/ imports this.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { healthThresholds } from './core/health.mjs';

export const KIT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** True when this file is the process entry, including an npm bin symlink. */
export function runningAsMain(metaUrl) {
  const entry = process.argv[1];
  if (!entry || !metaUrl) return false;
  try { return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(metaUrl)); }
  catch { return false; }
}

/** Interactive sessions have no time limit unless an area sets budgetMin. 0 means no limit. */
export const DEFAULT_AREA_BUDGET_MIN = 0;

/** Paths changed on main in the last doctor.unownedDays that match no area's owns globs. */
export function unownedChanges(c) {
  const days = Number(c.doctor?.unownedDays) > 0 ? Number(c.doctor.unownedDays) : 14;
  const log = tryGit(c.repo, 'log', '--name-only', '--pretty=format:', `--since=${days} days ago`, mainRef(c));
  if (!log.ok) return [];
  const files = [...new Set(log.out.split('\n').map((s) => s.trim()).filter(Boolean))];
  return files.filter((f) => !c.areas.some((a) => a.owns?.length && matchesAny(f, a.owns)));
}

export function areaBudgetMin(c, area) {
  const raw = area?.budgetMin ?? c?.defaults?.budgetMin ?? DEFAULT_AREA_BUDGET_MIN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) die(`bad budgetMin for ${area?.id ?? 'fleet'}: ${raw}`);
  return n;
}

export class FleetError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'FleetError';
    this.exitCode = exitCode;
  }
}

/** MCP and tests set this so a bad call throws instead of exiting the process. */
export function throwFleetErrors(on = true) { globalThis.__fleetThrow = on; }

export const die = (msg, code = 1) => {
  if (globalThis.__fleetThrow) throw new FleetError(msg, code);
  console.error(msg);
  process.exit(code);
};
const home = (s) => String(s).replace(/^~(?=\/|$)/, os.homedir());
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const tryGit = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};

/** fleet.config.json: --config <file>, else $FLEET_CONFIG, else walk up from cwd. */
export function findConfig(argv = process.argv, start = process.cwd()) {
  const i = argv.indexOf('--config');
  if (i > 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  if (process.env.FLEET_CONFIG) return path.resolve(home(process.env.FLEET_CONFIG));
  for (let d = start; ; d = path.dirname(d)) {
    const f = path.join(d, 'fleet.config.json');
    if (fs.existsSync(f)) return f;
    if (path.dirname(d) === d) return null;
  }
}

/** The main checkout, even when called from inside a worktree. */
function mainCheckout(dir) {
  const common = tryGit(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return common.ok ? path.dirname(common.out) : dir;
}

const DEFAULT_DOMAINS = {
  hub:       { tier: 'strong',   context: '400k' },
  core:      { tier: 'strong',   context: '300k' },
  reviewer:  { tier: 'strong',   context: '300k' },
  producer:  { tier: 'strong',   context: '300k' },
  feature:   { tier: 'standard', context: '200k' },
  tooling:   { tier: 'standard', context: '200k' },
  content:   { tier: 'light',    context: '100k' },
  scheduled: { tier: 'strong',   oneShot: true },
};

export function loadConfig(argv = process.argv, start = process.cwd()) {
  const file = findConfig(argv, start);
  if (!file) die('no fleet.config.json found (walked up from cwd; or set FLEET_CONFIG / --config)');
  let c;
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die(`${file}: ${e.message}`); }
  c.file = file;
  c.repo = c.repo ? path.resolve(path.dirname(file), home(c.repo)) : mainCheckout(path.dirname(file));
  c.project ??= path.basename(c.repo);
  c.mainBranch ??= 'main';
  c.remote ??= null;                       // e.g. "origin"; null = local-only fleet
  c.worktreeRoot = path.resolve(c.repo, home(c.worktreeRoot ?? '..'));
  c.stateDir = path.resolve(home(c.stateDir ?? `~/.local/state/agent-fleet/${c.project}`));
  c.harness ??= 'claude';
  c.paths = {
    prompts: 'docs/agents/prompts', schedules: 'docs/agents/schedules', backlog: 'docs/agents/backlog',
    program: 'docs/agents/PROGRAM.md', todo: 'docs/TODO.md', resume: 'docs/agents/RESUME-BRIEF.md',
    windDown: 'docs/agents/WIND-DOWN.md', strikes: 'docs/agents/STRIKES.md', ...(c.paths || {}),
  };
  c.mailbox = { dir: 'fleet/inbox', ...(c.mailbox || {}) };
  c.mailbox.dir = path.resolve(c.repo, home(c.mailbox.dir));
  c.domains = { ...DEFAULT_DOMAINS, ...(c.domains || {}) };
  c.defaults = { remoteControl: true, budgetMin: DEFAULT_AREA_BUDGET_MIN, ...(c.defaults || {}) };
  c.gates = { land: null, docsOnly: ['docs/**', '**/*.md'], timeoutMin: 30, ...(c.gates || {}) };
  c.landing = { batch: 8, intervalSec: 60, protect: [], ...(c.landing || {}) };
  c.clock = { quietHours: ['22:00', '08:00'], ...(c.clock || {}) };
  c.doctor = { staleHours: 72, unownedDays: 14, ...(c.doctor || {}) };
  c.health = healthThresholds(c.health);
  c.modules = { producer: false, reviewer: false, usageGovernor: false, ...(c.modules || {}) };
  c.schedules ??= [];
  c.areas = (c.areas || []).map((a) => resolveArea(c, a));
  for (const a of c.areas) if (!ID_RE.test(a.id)) die(`bad area id "${a.id}" (lowercase, digits, dashes)`);
  return c;
}

function resolveModel(a, harness, tier, tiers) {
  if (a.model != null && a.model !== '') return a.model;
  const mapped = Object.prototype.hasOwnProperty.call(tiers, tier) ? tiers[tier] : undefined;
  if (mapped) return mapped;
  // Claude areas with no tier map still pass the tier name through, as before.
  if (harness === 'claude') return tier;
  return null;
}

function resolveArea(c, a) {
  const domain = c.domains[a.domain] ?? c.domains.feature;
  const harness = a.provider ?? a.harness ?? c.provider ?? c.harness;
  const tier = a.tier ?? domain.tier;
  const tiers = c.harnesses?.[harness]?.tiers ?? {};
  return {
    ...a,
    role: a.role ?? 'area',
    harness, provider: harness, tier,
    model: resolveModel(a, harness, tier, tiers),
    context: a.context ?? domain.context ?? null,
    remoteControl: a.remoteControl ?? c.defaults.remoteControl,
    worktree: path.resolve(c.worktreeRoot, a.worktree ?? `${c.project}-${a.id}`),
    branch: a.branch ?? `area/${a.id}`,
    owns: a.owns ?? [],
    doesNotOwn: a.doesNotOwn ?? [],
    neighbours: a.neighbours ?? [],
    title: a.title ?? a.id,
  };
}

export const area = (c, id) => c.areas.find((a) => a.id === id) ?? die(`unknown area "${id}" (see fleet.config.json areas)`);
export const dispatcher = (c) => c.areas.find((a) => a.role === 'dispatcher') ?? null;
export const mainRef = (c) => (c.remote ? `${c.remote}/${c.mainBranch}` : c.mainBranch);
export const sessionName = (c, a) => `${c.project} · ${a.title}`;

/** Minimal glob: ** crosses directories, * and ? do not. */
export function globRe(g) {
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*' && g[i + 1] === '*') { r += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (ch === '*') r += '[^/]*';
    else if (ch === '?') r += '[^/]';
    else r += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
}
export const matchesAny = (file, globs) => globs.some((g) => globRe(g).test(file));

export async function loadAdapter(name, harnessConfig) {
  const f = path.join(KIT, 'adapters', `${name}.mjs`);
  if (!fs.existsSync(f)) {
    if (harnessConfig?.argv) {
      const { bind } = await import(path.join(KIT, 'adapters', 'custom.mjs'));
      return bind(harnessConfig, name);
    }
    die(`no adapter "${name}" (adapters/${name}.mjs, or harnesses.${name}.argv for a custom command)`);
  }
  const mod = await import(f);
  if (typeof mod.bind === 'function') return mod.bind(harnessConfig ?? {}, name);
  return mod;
}

/** Kill a child and every process in its group. */
export function killProcessGroup(pid, signal = 'SIGTERM') {
  if (!pid) return;
  try { process.kill(-pid, signal); }
  catch { try { process.kill(pid, signal); } catch { /* already gone */ } }
}

/**
 * Directories a sandboxed Codex session must be able to write besides the
 * area worktree: the main checkout's git dir, this machine's state dir, and
 * the mailbox. `--add-dir` is a real Codex 0.163.0 flag. Creating the state
 * and mailbox dirs here means the flag is not pointed at a missing path.
 */
export function writableRoots(c, { mkdir = true } = {}) {
  const dirs = [];
  const common = tryGit(c.repo, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  if (common.ok && common.out) dirs.push(common.out);
  for (const d of [c.stateDir, c.mailbox?.dir]) if (d && !dirs.includes(d)) dirs.push(d);
  if (mkdir) {
    for (const d of dirs) {
      if (d.endsWith(`${path.sep}.git`) || d.endsWith('/.git')) continue;
      try { fs.mkdirSync(d, { recursive: true }); } catch { /* the git dir already exists */ }
    }
  }
  return dirs;
}

/**
 * Run a command in its own process group. On timeout or SIGTERM/SIGINT, signal
 * the whole group so grandchildren do not survive the parent.
 * stdout/stderr are streamed to this process and also returned (tail-capped).
 */
export function runProcessGroup({ cmd, args = [], cwd, env, timeoutMs = 0, onSpawn } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (child.pid && onSpawn) onSpawn(child.pid);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let killTimer = null;
    const cap = (buf, chunk) => {
      const next = buf + chunk.toString();
      return next.length > 4_000_000 ? next.slice(-2_000_000) : next;
    };
    // A timer is a timeout. An outside signal is a stop, not a budget kill.
    const stopGroup = (fromTimer) => {
      if (fromTimer) timedOut = true;
      killProcessGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => killProcessGroup(child.pid, 'SIGKILL'), 1000);
    };
    const timer = timeoutMs > 0 ? setTimeout(() => stopGroup(true), timeoutMs) : null;
    const onSignal = () => stopGroup(false);
    const finish = (status, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
      resolve({ status: status ?? null, signal: signal ?? null, timedOut, stdout, stderr });
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    child.stdout.on('data', (chunk) => { stdout = cap(stdout, chunk); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr = cap(stderr, chunk); process.stderr.write(chunk); });
    child.on('error', () => finish(127, null));
    child.on('close', (status, signal) => finish(status, signal));
  });
}

/**
 * Run a command in the foreground of this process's terminal, in its own
 * process group. Used for interactive sessions: the child inherits the tty
 * (a tmux pane can be typed into) and a timeout still kills the group.
 * Headless runs stay on runProcessGroup, which pipes stdout.
 */
export function runForeground({ cmd, args = [], cwd, env, timeoutMs = 0, onSpawn } = {}) {
  return new Promise((resolve) => {
    const pidFile = path.join(os.tmpdir(), `fleet-fg-${process.pid}-${Date.now()}.pid`);
    const script = [
      'set -m',
      'pidfile=$FLEET_PIDFILE',
      'unset FLEET_PIDFILE',
      '"$@" &',
      'echo $! > "$pidfile"',
      'fg %1 >/dev/null',
      'status=$?',
      'exit $status',
    ].join('\n');
    const child = spawn('bash', ['--noprofile', '--norc', '-c', script, 'bash', cmd, ...args], {
      cwd, env: { ...env, FLEET_PIDFILE: pidFile }, stdio: 'inherit',
    });
    let agentPid = 0;
    let timedOut = false;
    let settled = false;
    let killTimer = null;
    const notePid = () => {
      if (agentPid) return;
      try {
        const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
        if (pid > 0) { agentPid = pid; if (onSpawn) onSpawn(pid); }
      } catch { /* the shell has not written it yet */ }
    };
    // Poll only until the pid file appears. The interval must not run for the life of the session.
    const poll = setInterval(() => {
      notePid();
      if (agentPid) clearInterval(poll);
    }, 20);
    const stopAgent = (fromTimer) => {
      notePid();
      if (fromTimer) timedOut = true;
      if (agentPid) killProcessGroup(agentPid, 'SIGTERM');
      else if (child.pid) try { process.kill(child.pid, 'SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimeout(() => { if (agentPid) killProcessGroup(agentPid, 'SIGKILL'); }, 1000);
    };
    const timer = timeoutMs > 0 ? setTimeout(() => stopAgent(true), timeoutMs) : null;
    const onSignal = () => stopAgent(false);
    const finish = (status, signal) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
      try { fs.unlinkSync(pidFile); } catch { /* already gone */ }
      resolve({ status: status ?? null, signal: signal ?? null, timedOut, stdout: '', stderr: '' });
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    child.on('error', () => finish(127, null));
    child.on('close', (status, signal) => finish(status, signal));
  });
}

/** Turn a finished headless run into an exit code. Timeout wins over exit 0. */
export function finishHeadless(adapter, result) {
  const meta = {
    status: result.status, signal: result.signal, timedOut: Boolean(result.timedOut), stderr: result.stderr,
  };
  let verdict;
  if (typeof adapter?.completed === 'function') verdict = adapter.completed(result.stdout ?? '', meta);
  else if (meta.timedOut) verdict = { ok: false, reason: 'timeout' };
  else if (meta.signal) verdict = { ok: false, reason: `signal:${meta.signal}` };
  else if (meta.status === 0) verdict = { ok: true, reason: 'exit' };
  else verdict = { ok: false, reason: `exit:${meta.status ?? 'none'}` };
  if (meta.timedOut) verdict = { ...verdict, ok: false, reason: 'timeout' };
  else if (meta.signal && verdict.ok) verdict = { ...verdict, ok: false, reason: `signal:${meta.signal}` };
  const code = verdict.ok ? 0
    : (meta.timedOut || meta.signal ? 124
      : (Number.isInteger(meta.status) && meta.status > 0 ? meta.status : 1));
  return { ...verdict, code };
}

/** Remember a headless thread id, including a failed, timed-out, or needs-input run. */
export function applyHeadlessSession(sessions, areaId, verdict) {
  if (!areaId || !verdict?.sessionId) return false;
  sessions[areaId] = verdict.sessionId;
  return true;
}

/**
 * Id stored before start. A provider that mints its own id (Codex) must not
 * keep a fleet UUID, or the next launch would resume that invented id.
 */
export function assignLaunchSession(sessions, areaId, adapter) {
  if (adapter?.assignsSessionId === false) {
    if (areaId) delete sessions[areaId];
    return null;
  }
  const sid = crypto.randomUUID();
  if (areaId) sessions[areaId] = sid;
  return sid;
}

/**
 * Fresh start after a provider could not resume. Claude's first message stays
 * the resume brief, exactly as before. Other providers get one handoff line.
 */
export function withHandoff(provider, first, { stored, resumable } = {}) {
  if (provider === 'claude' || resumable || !stored) return first;
  return `Handoff: no resumable ${provider} session (${stored}). Starting fresh. Read the resume brief and the files it names.\n\n${first}`;
}

export function flag(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

/** Atomic write: readers never see half a file. */
export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export const today = () => new Date().toISOString().slice(0, 10);
export const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function runPath(c, areaId) {
  return path.join(c.stateDir, 'runs', `${areaId}.json`);
}

export function readRun(c, areaId) {
  try { return JSON.parse(fs.readFileSync(runPath(c, areaId), 'utf8')); }
  catch { return null; }
}

export function writeRun(c, areaId, run) {
  writeAtomic(runPath(c, areaId), JSON.stringify(run, null, 2) + '\n');
}

/** Status words fleet status prints. Timeout is a failed turn. */
export function outcomeOfRun(result = {}) {
  if (result.timedOut) return { status: 'timeout', reason: 'timeout', ok: false };
  if (result.signal) return { status: 'failed', reason: `signal:${result.signal}`, ok: false };
  if (result.status === 0) return { status: 'exited', reason: 'exit:0', ok: true };
  return { status: 'failed', reason: `exit:${result.status ?? 'none'}`, ok: false };
}

/**
 * Run cmd with a time limit and kill its process group when the limit hits.
 * Uses util-linux `timeout`, which puts the command in its own group.
 */
export function runTimedSync({ cmd, args = [], cwd, timeoutMs = 0 } = {}) {
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 0;
  if (ms > 0) {
    const sec = Math.max(1, Math.ceil(ms / 1000));
    const r = spawnSync('timeout', ['-k', '1s', `${sec}s`, cmd, ...args], { cwd, encoding: 'utf8' });
    if (!(r.error && r.error.code === 'ENOENT')) {
      const timedOut = r.status === 124 || r.status === 137;
      return { status: r.status ?? (timedOut ? 124 : 1), signal: r.signal ?? null, timedOut, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    }
  }
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: ms || undefined, killSignal: 'SIGKILL' });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  return { status: timedOut ? 124 : (r.status ?? 1), signal: r.signal ?? null, timedOut, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function landerPid(c) {
  try { return Number(JSON.parse(fs.readFileSync(path.join(c.stateDir, 'landq', 'lander.pid'), 'utf8')).pid) || 0; }
  catch { return 0; }
}

export function landerIsUp(c) {
  const pid = landerPid(c);
  return pid > 0 && pidAlive(pid);
}

/**
 * Start a drain-and-exit lander. Always spawns: flock inside the drain
 * serialises merges, and the holder re-checks the queue after it unlocks.
 * Returns the spawned pid. The pid file is written only while a drain holds the lock.
 */
export function startLander(c, { landqPath, configPath } = {}) {
  const js = landqPath || path.join(KIT, 'bin/landq.mjs');
  const cfg = configPath || c.file;
  const dir = path.join(c.stateDir, 'landq');
  fs.mkdirSync(dir, { recursive: true });
  const out = fs.openSync(path.join(dir, 'lander.out'), 'a');
  const child = spawn(process.execPath, [js, 'drain', '--config', cfg], {
    cwd: c.repo, detached: true, stdio: ['ignore', out, out],
  });
  child.unref();
  return child.pid;
}
