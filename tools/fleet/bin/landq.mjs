#!/usr/bin/env node
// landq.mjs — the landing queue: sessions submit, ONE drain merges to main.
//
// Why: with many sessions pushing main directly, every push races every other,
// and each loser re-runs its gates on a tree that moved underneath it. A single
// drain serialises landing: a session submits its committed branch tip and goes
// back to work; the drain merges queued tips onto main in order, runs the gate
// command ONCE per batch, publishes main, and exits.
//
//   landq submit            from your worktree: (push your branch,) queue its tip,
//                           and start a drain
//   landq status <id> [--wait] [--timeout sec]
//                           durable state of one submission: queued, gating,
//                           landed, rejected, or unknown, plus whether a drain
//                           is alive and when it last ticked. --wait is optional.
//   landq status            the queue + recent results
//   landq withdraw <sha>    take a queued submission back (refused once in a pass)
//   landq drain             merge until the queue is empty, then exit
//   landq run               same as drain (an old @reboot line must not stay up)
//   landq once              one pass, then exit (no lock; for a manual pass)
//   landq alive             exit 0 if a drain is running
//
// Rules the lander keeps:
//   - merge (--no-ff), never rebase or squash; a conflicting tip is marked
//     'conflict' and its author merges main and resubmits;
//   - a batch whose files are all docs-only (gates.docsOnly globs) lands without gates;
//   - a red batch is retried one tip at a time, so one bad tip never blocks the rest;
//   - landing.protect: [{file, pattern}] — a merge that REDUCES the number of
//     occurrences of `pattern` in `file` is logged as a warning and still lands;
//   - two drains never merge at once: flock -n on landq.lock. The kernel drops
//     the lock if the holder dies. After the lock is released the drain looks
//     at the queue again, so a submit that arrived as it finished is not stranded.
//   - CHANGE THIS FILE ONLY WITH AN EMPTY QUEUE: a running drain keeps the old code.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, git, tryGit, mainRef, matchesAny, writeAtomic, die, runTimedSync } from './lib.mjs';
import { fileURLToPath } from 'node:url';
import { queuePaths, queued, landerAlive, readJson, submitLanding, landingStatus, submissionStatus } from './core/ops.mjs';

const c = loadConfig();
const argv = process.argv.slice(2);
const SELF = fileURLToPath(import.meta.url);
const paths = queuePaths(c);
const QUEUE = paths.queue;
const DONE = paths.done;
const PID = paths.pid;
const INFLIGHT = paths.inflight;
const LOG = paths.log;
const LOCK = path.join(paths.state, 'landq.lock');
const LANDER = path.resolve(c.worktreeRoot, c.landing.worktree ?? `${c.project}-lander`);
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; fs.appendFileSync(LOG, l + '\n'); console.log(l); };

function submit() {
  const e = submitLanding(c, process.cwd());
  for (const w of e.warnings ?? []) console.error(`warn: ${w}`);
  console.log(`queued ${e.sha.slice(0, 10)} (${e.branch}, ${e.files.length} files).`);
  console.log(e.hint);
  if (e.landerStarted) console.log(`lander drain started (pid ${e.landerStarted})`);
}

const gateTimeoutMs = () => (Number(c.gates.timeoutMin) > 0 ? Number(c.gates.timeoutMin) * 60000 : 0);

function statusOverview() {
  const s = landingStatus(c);
  console.log(`lander: ${s.landerAlive ? 'running' : 'NOT running'}   queue: ${s.queue.length}`);
  for (const e of s.queue) console.log(`  queued  ${e.sha.slice(0, 10)}  ${e.area.padEnd(16)} ${e.submittedAt}`);
  for (const x of s.recent) console.log(`  ${x.status.padEnd(8)}${x.sha.slice(0, 10)}  ${x.area.padEnd(16)} ${x.at}`);
}

function formatStatus(s) {
  const lines = [`id ${s.id}`, `state ${s.state}`];
  if (s.landedSha) lines.push(`landed ${s.landedSha}`);
  if (s.reason) lines.push(`reason ${s.reason}`);
  const beat = s.lander?.tickedAt;
  lines.push(s.lander?.alive
    ? `lander alive pid ${s.lander.pid}${beat ? ` ticked ${beat}` : ''}`
    : `lander dead${beat ? ` last ticked ${beat}` : ''}`);
  if (s.hint) lines.push(s.hint);
  if (s.timedOut) lines.push('wait timed out');
  return lines.join('\n');
}

function statusArg(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

function statusId() {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--config' || argv[i] === '--timeout') { i++; continue; }
    if (argv[i].startsWith('--')) continue;
    return argv[i];
  }
  return null;
}

async function printStatus() {
  const id = statusId();
  if (!id) { statusOverview(); return; }
  const snap = await submissionStatus(c, id, { wait: argv.includes('--wait'), timeoutSec: statusArg('--timeout') });
  console.log(formatStatus(snap));
}

function withdraw(prefix) {
  const e = queued(c).find((x) => x.sha.startsWith(prefix || '\0'));
  if (!e) die(`no queued submission ${prefix}`);
  if ((readJson(INFLIGHT, [])).includes(e.sha)) die('refused: the lander has taken it into the current pass');
  fs.unlinkSync(path.join(QUEUE, e.qfile));
  record(e, 'withdrawn');
}

function record(e, status, extra = {}) {
  writeAtomic(path.join(DONE, `${e.sha}.json`), JSON.stringify({ ...e, status, at: new Date().toISOString(), ...extra }, null, 1));
  try { fs.unlinkSync(path.join(QUEUE, e.qfile)); } catch { /* already gone */ }
  log(`${status} ${e.sha.slice(0, 10)} ${e.area}${extra.detail ? ` — ${extra.detail.split('\n')[0]}` : ''}`);
}

function ensureLander() {
  if (!fs.existsSync(LANDER)) {
    const r = tryGit(c.repo, 'worktree', 'add', '--detach', LANDER, mainRef(c));
    if (!r.ok) die(`cannot create lander worktree ${LANDER}: ${r.err}`);
  }
  if (c.remote) {
    const f = runTimedSync({ cmd: 'git', args: ['-C', LANDER, 'fetch', '-q', c.remote, c.mainBranch], timeoutMs: gateTimeoutMs() });
    if (f.timedOut || f.status !== 0) throw new Error(f.timedOut ? `fetch timed out after ${c.gates.timeoutMin} min` : `fetch failed (exit ${f.status})`);
  }
  // The lander's own dedicated tree: resetting it is safe and nobody else works here.
  git(LANDER, 'checkout', '-q', '--detach', mainRef(c));
  git(LANDER, 'reset', '-q', '--hard', mainRef(c));
  return git(LANDER, 'rev-parse', 'HEAD');
}

const countMatches = (rev, { file, pattern }) => {
  const r = tryGit(LANDER, 'show', `${rev}:${file}`);
  return r.ok ? (r.out.match(new RegExp(pattern, 'g')) ?? []).length : 0;   // occurrences, not lines
};

/** Merge entries onto base; returns {merged, verdict, detail}. */
function attempt(base, entries) {
  git(LANDER, 'reset', '-q', '--hard', base);
  const merged = [];
  for (const e of entries) {
    const m = tryGit(LANDER, 'merge', '--no-ff', '--no-edit', '-m', `land: ${e.branch} ${e.sha.slice(0, 10)} (${e.area})`, e.sha);
    if (m.ok) { merged.push(e); continue; }
    tryGit(LANDER, 'merge', '--abort');
    record(e, 'conflict', { detail: `merge ${mainRef(c)} into your branch, fix, resubmit\n${m.out.slice(-800)}` });
  }
  if (!merged.length) return { merged, verdict: 'empty' };
  const warnings = [];
  for (const p of c.landing.protect) {
    if (countMatches('HEAD', p) < countMatches(base, p)) {
      warnings.push(`warn: fewer matches of /${p.pattern}/ in ${p.file} than on main (a test registration may have been removed)`);
    }
  }
  const docsOnly = merged.every((e) => e.files.every((f) => matchesAny(f, c.gates.docsOnly)));
  const note = (rest) => [...warnings, rest].filter(Boolean).join('\n');
  if (docsOnly || !c.gates.land) return { merged, verdict: 'green', detail: note(docsOnly ? 'docs-only: no gates' : 'no gate configured') };
  const g = runTimedSync({ cmd: 'sh', args: ['-c', c.gates.land], cwd: LANDER, timeoutMs: gateTimeoutMs() });
  const tail = `${g.stdout ?? ''}${g.stderr ?? ''}`.split('\n').slice(-30).join('\n');
  const verdict = g.status === 0 ? 'green' : (g.timedOut ? 'failed' : 'red');
  return { merged, verdict, detail: note(`gate \`${c.gates.land}\` ${g.timedOut ? 'timed out' : `exit ${g.status}`}\n${tail}`) };
}

function publish(base) {
  const head = git(LANDER, 'rev-parse', 'HEAD');
  if (c.remote) {
    const p = runTimedSync({
      cmd: 'git', args: ['-C', LANDER, 'push', '-q', c.remote, `HEAD:refs/heads/${c.mainBranch}`], timeoutMs: gateTimeoutMs(),
    });
    if (p.status === 0) return { ok: true, sha: head };
    return { ok: false, detail: p.timedOut ? `push timed out after ${c.gates.timeoutMin} min` : `push failed (exit ${p.status})\n${p.stderr ?? ''}`.slice(0, 800) };
  }
  const onMain = tryGit(c.repo, 'symbolic-ref', '-q', 'HEAD').out === `refs/heads/${c.mainBranch}`;
  const r = onMain ? tryGit(c.repo, 'merge', '-q', '--ff-only', head)
    : tryGit(c.repo, 'update-ref', `refs/heads/${c.mainBranch}`, head, base);
  if (!r.ok) return { ok: false, detail: `publish failed: ${r.err}` };
  return { ok: true, sha: head };
}

function pass() {
  const batch = queued(c).slice(0, c.landing.batch);
  if (!batch.length) return;
  writeAtomic(INFLIGHT, JSON.stringify(batch.map((e) => e.sha)));
  try {
    let base;
    try { base = ensureLander(); }
    catch (e) {
      for (const entry of batch) record(entry, 'failed', { detail: e.message });
      return;
    }
    const land = (entries, from = base) => {
      const r = attempt(from, entries);
      if (r.verdict === 'empty') return false;
      if (r.verdict === 'green') {
        const pub = publish(from);
        if (!pub.ok) {
          for (const e of r.merged) record(e, 'failed', { detail: pub.detail });
          return false;
        }
        for (const e of r.merged) record(e, 'landed', { mergedAs: pub.sha, detail: r.detail });
        return true;
      }
      if (r.merged.length > 1) {                // one bad tip must not hold the rest
        log(`batch ${r.verdict}; retrying ${r.merged.length} tips singly`);
        let tip = from;
        for (const e of r.merged) {
          // The next base is the lander's tree after a successful publish.
          // The main checkout's HEAD is a different commit when that checkout
          // is not on mainBranch, and a remote publish does not move it.
          if (land([e], tip)) tip = git(LANDER, 'rev-parse', 'HEAD');
        }
        return false;
      }
      record(r.merged[0], r.verdict, { detail: r.detail });
      return false;
    };
    try { land(batch); }
    catch (e) {
      log(`pass error: ${e.message}`);
      for (const entry of batch) {
        if (entry.qfile && fs.existsSync(path.join(QUEUE, entry.qfile))) record(entry, 'failed', { detail: e.message });
      }
    }
  } finally { writeAtomic(INFLIGHT, '[]'); }
}

function beat(since) {
  writeAtomic(PID, JSON.stringify({ pid: process.pid, since, tickedAt: new Date().toISOString() }) + '\n');
}

function clearBeat() {
  try {
    if (readJson(PID, null)?.pid === process.pid) fs.unlinkSync(PID);
  } catch { /* already gone */ }
}

/** Test hook: pause while still holding the lock, after the queue looks empty. */
function holdIfRequested() {
  const hold = process.env.FLEET_DRAIN_HOLD;
  if (!hold) return;
  fs.writeFileSync(`${hold}.ready`, String(process.pid));
  const deadline = Date.now() + 20000;
  while (fs.existsSync(hold) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
  }
}

function drainLocked() {
  const since = new Date().toISOString();
  beat(since);
  log(`lander drain (pid ${process.pid}, tree ${LANDER})`);
  try {
    while (queued(c).length) {
      beat(since);
      pass();
    }
    holdIfRequested();
  } finally {
    clearBeat();
  }
}

function drain() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.closeSync(fs.openSync(LOCK, 'a'));
  if (process.env.FLEET_LANDQ_LOCKED === '1') {
    drainLocked();
    return 0;
  }
  // 75 is the lock-conflict code (flock -E). A command failure keeps its own status.
  const r = spawnSync('flock', ['-n', '-E', '75', LOCK, process.execPath, SELF, 'drain', '--config', c.file], {
    env: { ...process.env, FLEET_LANDQ_LOCKED: '1' },
    stdio: 'inherit',
  });
  if (r.error) die(`flock failed: ${r.error.message}`);
  if (r.status === 75) return 0;
  // The lock is released. A submission that arrived while this drain was
  // finishing could not take the lock, so look again before exiting.
  if (r.status === 0 && queued(c).length) return drain();
  return r.status ?? 1;
}

const cmd = argv[0];
if (cmd === 'submit') submit();
else if (cmd === 'status') await printStatus();
else if (cmd === 'withdraw') withdraw(argv[1]);
else if (cmd === 'once') pass();
else if (cmd === 'run' || cmd === 'drain') process.exit(drain());
else if (cmd === 'alive') process.exit(landerAlive(c) ? 0 : 1);
else die('usage: landq submit | status [<id> [--wait] [--timeout sec]] | withdraw <sha> | drain | once | alive');
// Inherited stdin and stdio pipes otherwise keep a finished command alive.
process.exit(0);
