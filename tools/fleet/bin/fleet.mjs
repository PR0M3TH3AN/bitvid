#!/usr/bin/env node
// fleet.mjs — start, list and stop the fleet's sessions from fleet.config.json.
//
//   fleet init <repo> [--spec <file>] [--provider name]
//                                     copy templates + tools (never overwrites). Creates the
//                                     git repo if needed. --provider (or --harness) sets harness.
//                                     Writes fleet/context.md and commits only the setup files.
//                                     Starts the session manager at a terminal, or tells the
//                                     user's agent to `fleet up` and talk to it.
//   fleet setup-commit                commit only those setup files (same as the MCP tool)
//   fleet update                      refresh vendored runtime and the registered skill
//                                     to this kit. Untouched prompts are overwritten.
//                                     An edited prompt stays, and the new template is
//                                     written beside it as <file>.kit. Does not change
//                                     fleet.config.json, product files, worktrees, mail,
//                                     or the landing queue. Commits only paths it changed.
//   fleet tell <text>                 mail the session manager from the interpreter.
//                                     An open window is woken with a short line, not the body.
//   fleet hear                        print unread mail for the interpreter, and take it out of unread
//   fleet worktrees [--only a,b]      create missing worktrees (one per area, branch area/<id>)
//                                     refuses while fleet files are still uncommitted
//   fleet up [--only a,b] [--skip a,b] [--bg] [--fresh] [--dry-run]
//                                     start every area (dispatcher last); resume by session id
//                                     when the provider can resume it, else start fresh with the resume brief.
//                                     Skips an area whose tmux window is already open.
//                                     budgetMin is an optional limit on a working session (default
//                                     unlimited). It is not a hung-job timeout; headless jobs use timeoutMin.
//   fleet down [--only a,b]           stop area process groups; with no --only, also the tmux
//                                     session and the lander
//   fleet supervise <id>              run one area's recorded command in the foreground of this
//                                     terminal. budgetMin 0 means no time limit.
//   fleet commit -m <msg> [--area id] [--all] [--submit] [--] [paths...]
//                                     stage and commit in the area worktree this process
//                                     is in (not inside an agent sandbox). Refuses the
//                                     main checkout and paths outside that worktree.
//                                     --submit then queues the tip (landq submit).
//   fleet doctor | landq | backlog | mailbox
//                                     the same tools as tools/fleet/bin/<name>.mjs
//   fleet status                      areas, run state (running / exited / failed / timeout / stopped), lander up or down
//   fleet wakes                       recent wake attempts, and plain words for a likely failure
//   fleet prompt <id>                 print the composed system prompt for an area
//   fleet crontab                     PRINT the crontab lines for scheduled jobs (never installs)
//   fleet run-job <name>              one headless run of docs/agents/schedules/<name>.md (sched.sh calls this)
//   fleet sched-env <name>            shell vars for sched.sh
//   fleet lander start|status         start a drain-and-exit lander, or print its status
//
// Launch modes for `up`: --bg (harness background sessions, if the adapter has them);
// otherwise one tmux window per area in session "fleet-<project>" when tmux exists;
// otherwise the commands are printed for you to run.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT, loadConfig, loadAdapter, area as getArea, dispatcher, sessionName, flag, die, writeAtomic, tryGit, mainRef, today, runProcessGroup, runForeground, finishHeadless, withHandoff, applyHeadlessSession, assignLaunchSession, areaBudgetMin, readRun, writeRun, outcomeOfRun, pidAlive, killProcessGroup, landerIsUp, landerPid, startLander, writableRoots } from './lib.mjs';
import { commitWork, setupCommit, tellDispatch, hearInterpreter, fleetStatus } from './core/ops.mjs';
import { readWakeLog } from './core/wake-log.mjs';
import { fleetUpdate, recordInstalled, isTemplatePath } from './core/update.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const has = (f) => argv.includes(f);
const list = (f) => (flag(argv, f) || '').split(',').filter(Boolean);
const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

if (!cmd || cmd === 'help' || cmd === '--help') {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
if (cmd === 'init') {
  init(argv[1], flag(argv, '--provider') || flag(argv, '--harness'), flag(argv, '--spec'));
  process.exit(0);
}

const c = loadConfig();
const SESSIONS = path.join(c.stateDir, 'sessions.json');
// The lander and the scheduler run the tools and config LANDED on main (the main checkout),
// never a copy inside some area's worktree.
const MAIN_CFG = fs.existsSync(path.join(c.repo, 'fleet.config.json')) ? path.join(c.repo, 'fleet.config.json') : c.file;
const MAIN_BIN = fs.existsSync(path.join(c.repo, 'tools/fleet/bin/landq.mjs')) ? path.join(c.repo, 'tools/fleet/bin') : path.join(KIT, 'bin');
const readSessions = () => { try { return JSON.parse(fs.readFileSync(SESSIONS, 'utf8')); } catch { return {}; } };
const pick = () => {
  const only = list('--only'), skip = list('--skip');
  for (const id of [...only, ...skip]) getArea(c, id);
  return c.areas.filter((a) => (!only.length || only.includes(a.id)) && !skip.includes(a.id));
};

function composePrompt(a, adapter) {
  const dir = path.join(c.repo, c.paths.prompts);
  const commonPath = path.join(dir, 'COMMON.md');
  const common = fs.existsSync(commonPath) ? fs.readFileSync(commonPath, 'utf8') : die(`missing ${dir}/COMMON.md`);
  const own = ownPrompt(a);
  const peers = c.areas.filter((p) => p.id !== a.id).map((p) => {
    const owns = p.owns.length ? `owns ${p.owns.join(', ')}` : 'owns nothing listed';
    const not = p.doesNotOwn.length ? `; does not own ${p.doesNotOwn.join(', ')}` : '';
    const neigh = p.neighbours.length ? `; neighbours ${p.neighbours.join(', ')}` : '';
    return `- ${p.id} — ${p.title} (${owns}${not}${neigh})`;
  }).join('\n');
  const vars = {
    project: c.project, 'area.id': a.id, 'area.title': a.title, 'area.role': a.role,
    'area.owns': a.owns.join(', ') || '(none listed)',
    'area.doesNotOwn': a.doesNotOwn.join(', ') || '(none listed)',
    'area.neighbours': a.neighbours.join(', ') || '(none listed)',
    'area.branch': a.branch, 'area.worktree': a.worktree, mainBranch: c.mainBranch, peers,
    dispatcher: dispatcher(c)?.id ?? '(none)', gate: c.gates.land ?? '(no gate configured)',
    quietHours: c.clock.quietHours.join('–'), messaging: adapter.messaging?.instructions ?? '',
  };
  return `${common}\n\n${own}`.replace(/\{\{([\w.]+)\}\}/g, (m, k) => vars[k] ?? m);
}

function ownPrompt(a) {
  const dir = path.join(c.repo, c.paths.prompts);
  const names = a.role === 'dispatcher' ? ['session-manager.md', `${a.id}.md`] : [`${a.id}.md`];
  for (const name of names) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  }
  if (a.role === 'dispatcher') {
    const kit = path.join(KIT, 'templates/prompts/session-manager.md');
    if (fs.existsSync(kit)) return fs.readFileSync(kit, 'utf8');
  }
  die(`missing ${dir}/${a.id}.md (copy area.md and fill it in)`);
}

function ruleChangeNote() {
  return '\n\nRead fleet/RULE-CHANGES.md newest first now and before every item. It overrides this prompt.';
}
function resumePrompt(a) {
  return `${c.project} fleet start. You are ${a.title} (area "${a.id}"). Read ${c.paths.resume}, your area's entry in ${c.paths.todo}, `
    + `your .task and your mailbox. \`node tools/fleet/bin/backlog.mjs next --area ${a.id}\` lists open items; pick by PROGRAM.md, then claim that id. `
    + `Before starting an item, check it still applies at HEAD (filedAt is the commit it was filed against). Report to the session manager only if blocked.`
    + ruleChangeNote();
}
function dispatcherWake(a) {
  return `${c.project} fleet start. You are the session manager (${a.id}). Read fleet/context.md and fleet/GOAL.md. `
    + 'If GOAL.md is missing, ask the goal questions and write fleet/GOAL.md yourself. '
    + 'The user talks to their own agent, the interpreter. A line that says you have new fleet mail is only a wake. Read the mailbox; that takes the messages out of unread. Answer once, by mailbox, with your next action. '
    + 'Read your mailbox at the start of every turn. The interpreter\'s yes counts for a routine decision. '
    + 'Money, pushes, deploys, deletes, secrets, outgoing messages, and a bigger structural or directional change go to the real user. '
    + 'Do not ask the user to edit a file, attach to tmux, or run a command. On the first loop, show the proposed team and ask before you start anyone. '
    + `Read ${c.paths.resume} and ${c.paths.program}.`
    + ruleChangeNote();
}

const adapterFor = (name) => loadAdapter(name, c.harnesses?.[name]);

async function launch(a, { fresh, bg, dry, sessions }) {
  const ad = await adapterFor(a.harness);
  if (!ensureWorktree(a)) return true;
  const windowNames = () => {
    const listed = spawnSync('tmux', ['list-windows', '-t', tmuxSession(), '-F', '#{window_name}'], { encoding: 'utf8' });
    return listed.status === 0 ? listed.stdout.split('\n').filter(Boolean) : [];
  };
  const open = windowNames().includes(a.id);
  if (open && !dry) {
    console.error(`warn: ${a.id} already has tmux window ${tmuxSession()}:${a.id}; skipping. \`fleet down --only ${a.id}\` closes it`);
    return true;
  }
  const promptText = composePrompt(a, ad);
  const promptFile = path.join(c.stateDir, 'prompts', `${a.id}.md`);
  if (!dry) writeAtomic(promptFile, promptText);
  let first = a.role === 'dispatcher' ? dispatcherWake(a) : resumePrompt(a);
  if (ad.experimental) console.error(`[${a.id}] provider "${ad.name}" is experimental: flags checked against its CLI help, not a live model turn`);
  if (!ad.start) {   // stub harness: hand it to the human
    const p = path.join(a.worktree, '.fleet', 'PROMPT.md');
    if (!dry) writeAtomic(p, `${promptText}\n\n---\nFIRST MESSAGE:\n${first}\n`);
    console.log(`[${a.id}] harness "${a.harness}" adapter is a stub: start it by hand in ${a.worktree} with model tier ${a.tier}${a.context ? `, context ${a.context}` : ''}, and give it ${p}`);
    return true;
  }
  const opts = { model: a.model, context: a.context, remoteControl: a.remoteControl, cwd: a.worktree, promptFile, writableDirs: writableRoots(c, { mkdir: !dry }) };
  let argvL;
  let sid = sessions[a.id];
  const resumable = !fresh && sid && ad.resume && ad.canResume(sid, { cwd: a.worktree });
  if (resumable) argvL = ad.resume({ ...opts, sessionId: sid });
  if (!argvL) {
    first = withHandoff(ad.name, first, { stored: fresh ? null : sid, resumable: false });
    sid = assignLaunchSession(sessions, a.id, ad);
    argvL = ad.start({ ...opts, sessionId: sid, sessionName: sessionName(c, a), firstPrompt: first });
  }
  const env = ad.cleanEnv(process.env);
  const budgetMin = areaBudgetMin(c, a);
  const budgetLabel = budgetMin > 0 ? `${budgetMin}m` : 'unlimited';
  const shown = argvL.map((s) => (s.length > 80 ? `${q(s.slice(0, 60))}…` : q(s))).join(' ');
  if (dry) {
    console.log(`[dry] ${a.id.padEnd(16)} ${a.tier}/${a.model ?? '-'} ctx=${a.context ?? '-'} rc=${a.remoteControl} budget=${budgetLabel}  (cd ${a.worktree} && ${shown})${open ? ' WINDOW OPEN' : ''}`);
    return true;
  }
  if (bg) {
    if (!ad.background) die(`harness ${a.harness} has no background mode; drop --bg`);
    const r = spawnSync(ad.background(argvL)[0], ad.background(argvL).slice(1), { cwd: a.worktree, env, stdio: 'inherit' });
    console.log(`[${a.id}] background start exit ${r.status} (background mode is not under the area budget)`);
    return true;
  }
  writeRun(c, a.id, {
    areaId: a.id, sessionId: sid ?? null, argv: argvL, cwd: a.worktree, budgetMin,
    status: 'running', startedAt: new Date().toISOString(), pid: null,
  });
  const sup = [process.execPath, process.argv[1], 'supervise', a.id, '--config', c.file].map(q).join(' ');
  if (spawnSync('tmux', ['-V']).status === 0) {
    const s = tmuxSession();
    if (spawnSync('tmux', ['has-session', '-t', s]).status !== 0) spawnSync('tmux', ['new-session', '-d', '-s', s, '-n', 'shell']);
    spawnSync('tmux', ['new-window', '-t', s, '-n', a.id, '-c', a.worktree, sup], { stdio: 'inherit' });
    console.log(`[${a.id}] tmux window ${s}:${a.id} budget=${budgetLabel}`);
  } else {
    console.log(`[${a.id}] no tmux: run this yourself\n  ${sup}`);
  }
  return true;
}

const tmuxSession = () => `fleet-${c.project}`.replace(/[.:]/g, '-');

async function supervise(id) {
  if (!id) die('usage: fleet supervise <area>');
  const a = getArea(c, id);
  const run = readRun(c, id);
  if (!run?.argv?.length) die(`no recorded command for ${id} (fleet up writes it)`);
  const ad = await adapterFor(a.harness);
  const budgetMin = Number.isFinite(Number(run.budgetMin)) ? Number(run.budgetMin) : areaBudgetMin(c, a);
  let childPid = run.pid ?? null;
  const result = await runForeground({
    cmd: run.argv[0], args: run.argv.slice(1), cwd: run.cwd || a.worktree, env: ad.cleanEnv(process.env),
    timeoutMs: budgetMin > 0 ? budgetMin * 60000 : 0,
    onSpawn(pid) {
      childPid = pid;
      writeRun(c, id, { ...readRun(c, id), pid, status: 'running' });
    },
  });
  const outcome = outcomeOfRun(result);
  const latest = readRun(c, id);
  // fleet down marks reason "down" before the signal. A 143 from that kill is a stop.
  const stoppedByDown = latest?.reason === 'down';
  writeRun(c, id, stoppedByDown
    ? { ...latest, pid: childPid, status: 'stopped', reason: 'down', endedAt: new Date().toISOString() }
    : { ...latest, pid: childPid, ...outcome, endedAt: new Date().toISOString() });
  if (!outcome.ok) console.error(`[${id}] ${outcome.status}: ${outcome.reason}`);
  process.exit(outcome.ok ? 0 : (result.timedOut || result.signal ? 124 : (Number.isInteger(result.status) && result.status > 0 ? result.status : 1)));
}

async function up() {
  const fresh = has('--fresh'), bg = has('--bg'), dry = has('--dry-run');
  const sessions = readSessions();
  const areas = pick();
  const order = [...areas.filter((a) => a.role !== 'dispatcher'), ...areas.filter((a) => a.role === 'dispatcher')];
  let refused = 0;
  for (const a of order) if (!(await launch(a, { fresh, bg, dry, sessions }))) refused++;
  if (!dry) { writeAtomic(SESSIONS, JSON.stringify(sessions, null, 2) + '\n'); if (c.landing.autoStart !== false) lander('start', true); }
  if (refused) process.exit(1);
}

function stopPid(pid) {
  if (!pid || !pidAlive(pid)) return false;
  killProcessGroup(pid, 'SIGTERM');
  spawnSync('sleep', ['1']);
  if (pidAlive(pid)) killProcessGroup(pid, 'SIGKILL');
  return true;
}

async function down() {
  const areas = pick();
  const full = !list('--only').length;
  for (const a of areas) {
    const ad = await adapterFor(a.harness);
    const run = readRun(c, a.id);
    const sid = readSessions()[a.id];
    let killed = false;
    if (run?.pid && pidAlive(run.pid)) {
      writeRun(c, a.id, { ...run, reason: 'down' });
      killed = stopPid(run.pid);
    }
    if (killed) console.log(`[${a.id}] stopped process group ${run.pid}`);
    else console.log(`[${a.id}] no running process`);
    if (ad.stop && sid) {
      const [b, ...rest] = ad.stop(sid);
      console.log(`[${a.id}] adapter stop exit ${spawnSync(b, rest, { stdio: 'inherit' }).status}`);
    }
    const latest = readRun(c, a.id);
    if (killed || latest?.status === 'running') writeRun(c, a.id, { ...latest, status: 'stopped', reason: 'down', endedAt: new Date().toISOString() });
    if (!full) spawnSync('tmux', ['kill-window', '-t', `${tmuxSession()}:${a.id}`]);
  }
  if (full) {
    spawnSync('tmux', ['kill-session', '-t', tmuxSession()]);
    const pid = landerPid(c);
    if (stopPid(pid)) console.log(`lander stopped (${pid})`);
    else console.log('lander not running');
    console.log(`stopped tmux session ${tmuxSession()}`);
  }
}

function runMark(a, sessions) {
  const run = readRun(c, a.id);
  if (run?.status === 'running' && run.pid && pidAlive(run.pid)) return `running pid ${run.pid}`;
  if (run?.status === 'timeout') return 'timeout';
  if (run?.status === 'failed') return `failed ${run.reason ?? ''}`.trim();
  if (run?.status === 'stopped') return 'stopped';
  if (run?.status === 'exited') return 'exited';
  if (run?.status === 'running') return 'not running';
  if (sessions[a.id]) return 'not running';
  return 'never started';
}

async function status() {
  const sessions = readSessions();
  const report = fleetStatus(c);
  console.log(`${c.project}  repo ${c.repo}  state ${c.stateDir}  lander ${landerIsUp(c) ? 'up' : 'DOWN'}`);
  for (const a of c.areas) {
    const budgetMin = areaBudgetMin(c, a);
    const row = report.areas.find((r) => r.id === a.id);
    const live = row ? ` window=${row.window} unread=${row.unread} ${row.activity}` : '';
    console.log(`${a.id.padEnd(18)} ${a.role.padEnd(10)} ${a.harness.padEnd(7)} ${`${a.tier}/${a.model ?? '-'}`.padEnd(16)} ctx=${String(a.context ?? '-').padEnd(5)} rc=${a.remoteControl ? 'on ' : 'off'} budget=${budgetMin > 0 ? `${budgetMin}m` : 'unlimited'} ${fs.existsSync(a.worktree) ? '' : 'NO-WORKTREE '}${runMark(a, sessions)}${live}`);
  }
  if (report.interpreter.unread) console.log(`interpreter          unread=${report.interpreter.unread}`);
  for (const id of report.recovered) console.log(`nudged ${id} again`);
}

function wakesCmd() {
  const report = readWakeLog(c);
  if (!report.entries.length) {
    console.log(`no wake attempts in ${report.path}`);
    return;
  }
  console.log(report.path);
  for (const e of report.entries) {
    if (e.kind === 'stale') console.log(`${e.t}  stale ${e.area} ${e.file}  ${e.flag}`);
    else console.log(`${e.t}  ${e.trigger} ${e.area} ${e.window} ${e.file || '-'}  ${e.action} enter=${e.enterAttempts} ${e.outcome}  ${e.flag}`);
  }
}

function ensureWorktree(a) {
  if (fs.existsSync(a.worktree)) return true;
  const dirty = uncommittedFleetFiles();
  if (dirty.length) {
    console.error(`skip ${a.id}: commit fleet files before starting:\n${dirty.map((l) => `  ${l}`).join('\n')}`);
    return false;
  }
  const hasBranch = tryGit(c.repo, 'rev-parse', '--verify', '-q', `refs/heads/${a.branch}`).ok;
  const r = hasBranch
    ? tryGit(c.repo, 'worktree', 'add', a.worktree, a.branch)
    : tryGit(c.repo, 'worktree', 'add', '-b', a.branch, a.worktree, mainRef(c));
  if (!r.ok) { console.error(`skip ${a.id}: ${r.err}`); return false; }
  console.log(`made ${a.id}  ${a.worktree}  ${a.branch}`);
  return true;
}

function uncommittedFleetFiles() {
  const r = tryGit(c.repo, 'status', '--porcelain', '--', 'fleet.config.json', 'tools/fleet', 'docs/agents', 'fleet', 'AGENTS.md', '.agents');
  if (!r.ok) return [];
  return r.out.split('\n').map((l) => l.trimEnd()).filter(Boolean);
}

function worktrees() {
  const pending = pick().filter((a) => !fs.existsSync(a.worktree));
  const dirty = pending.length ? uncommittedFleetFiles() : [];
  if (dirty.length) {
    die(`commit fleet files before \`fleet worktrees\`. Uncommitted files are not in the new worktrees:\n${dirty.map((l) => `  ${l}`).join('\n')}`);
  }
  for (const a of pick()) {
    if (fs.existsSync(a.worktree)) { console.log(`ok   ${a.id}  ${a.worktree}`); continue; }
    const hasBranch = tryGit(c.repo, 'rev-parse', '--verify', '-q', `refs/heads/${a.branch}`).ok;
    const r = hasBranch ? tryGit(c.repo, 'worktree', 'add', a.worktree, a.branch)
      : tryGit(c.repo, 'worktree', 'add', '-b', a.branch, a.worktree, mainRef(c));
    console.log(`${r.ok ? 'made' : 'FAIL'} ${a.id}  ${a.worktree}  ${r.ok ? a.branch : r.err}`);
  }
}

function crontab() {
  const sched = path.join(MAIN_BIN, 'sched.sh');
  console.log(`# agent-fleet ${c.project} — review, then add with \`crontab -e\` yourself. Nothing was installed.`);
  console.log(`FLEET_CONFIG=${MAIN_CFG}`);
  for (const s of c.schedules) console.log(`${s.cron} ${sched} ${s.name}   # ${s.note ?? ''}`);
}

function schedule(name) {
  if (!/^[a-z0-9-]+$/.test(name || '')) die('usage: fleet run-job <name>');
  const s = c.schedules.find((x) => x.name === name) ?? {};
  const file = path.join(c.repo, c.paths.schedules, `${name}.md`);
  return { s, file };
}

async function runJob(name) {
  const { s, file } = schedule(name);
  if (!fs.existsSync(file)) die(`no prompt ${file}`, 2);
  const d = s.area ? getArea(c, s.area) : dispatcher(c) ?? die('no dispatcher area and no schedules[].area');
  const providerName = s.provider ?? s.harness ?? d.harness;
  const ad = await loadAdapter(providerName, c.harnesses?.[providerName]);
  if (!ad.headless) die(`harness ${ad.name} has no verified headless mode (adapter stub)`, 2);
  const tier = s.tier ?? c.domains.scheduled.tier;
  const model = c.harnesses?.[ad.name]?.tiers?.[tier] ?? ad.tiers[tier];
  const vars = { project: c.project, date: today(), stateDir: c.stateDir };
  const prompt = fs.readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
  const [b, ...rest] = ad.headless({ prompt, model, extraArgs: c.harnesses?.[ad.name]?.headlessArgs ?? [], writableDirs: writableRoots(c) });
  const timeoutMin = Number(s.timeoutMin ?? 40);
  const result = await runProcessGroup({
    cmd: b, args: rest, cwd: d.worktree, env: ad.cleanEnv(process.env),
    timeoutMs: Number.isFinite(timeoutMin) && timeoutMin > 0 ? timeoutMin * 60000 : 0,
  });
  const done = finishHeadless(ad, result);
  const sessions = readSessions();
  // A job's thread is not the area's thread. Resuming the dispatcher into it
  // would throw away the interactive session.
  if (applyHeadlessSession(sessions, `job:${name}`, done)) writeAtomic(SESSIONS, JSON.stringify(sessions, null, 2) + '\n');
  if (!done.ok) console.error(`job ${name} failed: ${done.reason}`);
  process.exit(done.code);
}

function schedEnv(name) {
  const { s, file } = schedule(name);
  const [qs, qe] = c.clock.quietHours.map((t) => Number(t.split(':')[0]));
  const vars = { STATE: c.stateDir, PROMPT: file, QUIET_START: qs, QUIET_END: qe, TIMEOUT_MIN: s.timeoutMin ?? 40,
    QUIET_OK: s.quietHours === 'allowed' ? 1 : 0, ALWAYS: s.ignorePause ? 1 : 0 };
  for (const [k, v] of Object.entries(vars)) console.log(`${k}=${q(String(v))}`);
}

function lander(sub, quiet = false) {
  const js = path.join(MAIN_BIN, 'landq.mjs');
  if (sub === 'start') {
    const pid = startLander(c, { landqPath: js, configPath: MAIN_CFG });
    if (!quiet && pid) console.log(`lander drain started (pid ${pid})`);
  } else spawnSync(process.execPath, [js, 'status', '--config', MAIN_CFG], { stdio: 'inherit' });
}

function setConfigHarness(file, provider) {
  if (!/^[A-Za-z0-9._-]+$/.test(provider || '')) die(`bad provider "${provider ?? ''}"`);
  const text = fs.readFileSync(file, 'utf8');
  const next = /"harness"\s*:/.test(text)
    ? text.replace(/"harness"\s*:\s*"[^"]*"/, `"harness": "${provider}"`)
    : text.replace('{', `{\n  "harness": "${provider}",`);
  if (next !== text) fs.writeFileSync(file, next);
  console.log(`harness: ${provider}`);
}

function contextFacts(repo, spec) {
  const bins = ['claude', 'codex', 'agent', 'pi'].filter((b) => spawnSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }).status === 0);
  let top = [];
  try { top = fs.readdirSync(repo).filter((n) => n !== '.git'); } catch { /* empty */ }
  const lines = [
    '# Context for the session manager',
    `repo: ${repo}`,
    `node: ${process.version}`,
    `harness binaries on PATH: ${bins.join(', ') || '(none)'}`,
    `top: ${top.join(' ') || '(empty)'}`,
  ];
  const readme = ['README.md', 'readme.md'].map((n) => path.join(repo, n)).find((p) => fs.existsSync(p));
  if (readme) lines.push(`README:\n${fs.readFileSync(readme, 'utf8').split('\n').slice(0, 40).join('\n')}`);
  const pkg = path.join(repo, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      lines.push(`package: ${p.name ?? ''} — ${p.description ?? ''}`);
      lines.push(`scripts: ${Object.keys(p.scripts ?? {}).join(', ') || '(none)'}`);
    } catch { lines.push('package.json: unreadable'); }
  }
  const log = tryGit(repo, 'log', '-8', '--oneline');
  if (log.ok && log.out) lines.push(`recent commits:\n${log.out}`);
  if (spec) lines.push(`spec (${spec}):\n${fs.readFileSync(path.resolve(spec), 'utf8').slice(0, 8000)}`);
  return `${lines.join('\n')}\n`;
}

function fleetDirty(repo) {
  const r = tryGit(repo, 'status', '--porcelain', '--', 'fleet.config.json', 'tools/fleet', 'docs/agents', 'fleet', 'AGENTS.md', '.agents');
  return r.ok ? r.out.split('\n').filter(Boolean) : [];
}

function nextLine() {
  return 'next: the user\'s agent runs `fleet up` and talks to the session manager. The user does not edit a file, attach to tmux, or run a command.';
}

function init(target, provider, spec) {
  if (!target || target.startsWith('--')) die('usage: fleet init <repo> [--spec <file>] [--provider <name>]');
  const repo = path.resolve(target);
  fs.mkdirSync(repo, { recursive: true });
  if (!tryGit(repo, 'rev-parse', '--git-dir').ok) {
    const g = spawnSync('git', ['init', '-b', 'main'], { cwd: repo, encoding: 'utf8' });
    if (g.status !== 0) die(g.stderr || 'git init failed');
    console.log(`git init -b main in ${repo}`);
  }
  const copied = [];
  const copy = (from, to) => {
    if (fs.statSync(from).isDirectory()) { for (const f of fs.readdirSync(from)) copy(path.join(from, f), path.join(to, f)); return; }
    if (fs.existsSync(to)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); copied.push(path.relative(repo, to));
  };
  const T = path.join(KIT, 'templates');
  copy(path.join(T, 'fleet.config.json'), path.join(repo, 'fleet.config.json'));
  copy(path.join(T, 'prompts'), path.join(repo, 'docs/agents/prompts'));
  copy(path.join(T, 'schedules'), path.join(repo, 'docs/agents/schedules'));
  const backlogFrom = path.join(T, 'docs', 'backlog');
  if (fs.existsSync(backlogFrom) && fs.readdirSync(backlogFrom).some((f) => !f.startsWith('.'))) copy(backlogFrom, path.join(repo, 'docs/agents/backlog'));
  for (const f of ['PROGRAM.md', 'RESUME-BRIEF.md', 'WIND-DOWN.md', 'STRIKES.md']) copy(path.join(T, 'docs', f), path.join(repo, 'docs/agents', f));
  copy(path.join(T, 'docs', 'TODO.md'), path.join(repo, 'docs/TODO.md'));
  copy(path.join(T, 'fleet', 'RULE-CHANGES.md'), path.join(repo, 'fleet/RULE-CHANGES.md'));
  copy(path.join(KIT, 'bin'), path.join(repo, 'tools/fleet/bin'));
  copy(path.join(KIT, 'adapters'), path.join(repo, 'tools/fleet/adapters'));
  const gi = path.join(repo, '.gitignore');
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const add = ['fleet/inbox/', '.task', '.fleet/'].filter((l) => !cur.split('\n').includes(l));
  if (add.length) fs.appendFileSync(gi, `${cur && !cur.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`);
  console.log(`copied ${copied.length} files into ${repo}${add.length ? `; .gitignore += ${add.join(' ')}` : ''}`);
  for (const f of copied) console.log(`  ${f}`);
  const managed = copied.map((rel) => rel.split(path.sep).join('/')).filter(isTemplatePath);
  if (managed.length) {
    recordInstalled(repo, managed);
    console.log('recorded kit hashes in fleet/kit.json');
  }
  if (provider) setConfigHarness(path.join(repo, 'fleet.config.json'), provider);
  writeAtomic(path.join(repo, 'fleet/context.md'), contextFacts(repo, spec));
  console.log('wrote fleet/context.md');
  const setup = setupCommit(repo);
  if (setup.pending) {
    console.error(setup.error || 'setup commit failed');
    console.log('Setup files are in the worktree but not committed. Call the setup_commit MCP tool. Do not git commit, and do not ask the user to approve one.');
  } else if (setup.committed.length) {
    if (!tryGit(repo, 'config', 'user.email').out) console.log('no git user.email set; the setup commit uses a local fleet-init identity');
    console.log(`committed fleet setup ${setup.sha}`);
  }
  if (setup.pending || fleetDirty(repo).length) {
    console.log(nextLine());
    return repo;
  }
  const loaded = loadConfig(['node', 'fleet', '--config', path.join(repo, 'fleet.config.json')]);
  const hub = dispatcher(loaded);
  if (hub && !fs.existsSync(hub.worktree)) {
    const hasBranch = tryGit(repo, 'rev-parse', '--verify', '-q', `refs/heads/${hub.branch}`).ok;
    const r = hasBranch
      ? tryGit(repo, 'worktree', 'add', hub.worktree, hub.branch)
      : tryGit(repo, 'worktree', 'add', '-b', hub.branch, hub.worktree, 'HEAD');
    if (r.ok) console.log(`worktree ${hub.id}  ${hub.worktree}`);
    else console.error(r.err);
  }
  if (process.stdout.isTTY && hub && fs.existsSync(hub.worktree)) {
    console.log('starting the session manager');
    const started = spawnSync(process.execPath, [process.argv[1], 'up', '--only', hub.id, '--config', loaded.file], { stdio: 'inherit' });
    process.exit(started.status ?? 1);
  }
  console.log(nextLine());
  return repo;
}

function commitArgs() {
  const paths = [];
  let message = null;
  let area = null;
  let all = false;
  let submit = false;
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') { paths.push(...rest.slice(i + 1)); break; }
    if (a === '--all') { all = true; continue; }
    if (a === '--submit') { submit = true; continue; }
    if (a === '-m' || a === '--message') { message = rest[++i]; continue; }
    if (a === '--area') { area = rest[++i]; continue; }
    if (a === '--config') { i++; continue; }
    if (a.startsWith('-')) die('usage: fleet commit -m <msg> [--area id] [--all] [--submit] [--] [paths...]');
    paths.push(a);
  }
  return { message, area, all, submit, paths };
}

function updateCmd() {
  const result = fleetUpdate(c.repo);
  console.log(`fleet update → kit ${result.version}`);
  const section = (title, rows) => {
    if (!rows.length) return;
    console.log(`${title}:`);
    for (const row of rows) console.log(`  ${row}`);
  };
  section('runtime', result.runtime);
  section('updated', result.updated);
  section('added', result.added);
  if (result.merge.length) {
    console.log('needs merge (local file kept; new template is beside it):');
    for (const item of result.merge) console.log(`  ${item.path} -> ${item.sidecar}`);
    console.log('If you did not edit the local file, replace it with the .kit copy and delete the .kit file. If you did, merge, then delete the .kit file.');
  }
  if (result.restart) console.log('restart agents after handoff: prompts changed');
  else console.log('restart: no');
  const commit = result.commit;
  if (commit.pending) {
    console.error(commit.error || 'update commit failed');
    console.log('Commit is pending. Call the update MCP tool (or setup_commit). Do not git commit, and do not ask the user to approve one.');
  } else if (commit.committed.length) console.log(`committed ${commit.sha}`);
  else console.log(commit.sha ? `nothing new to commit ${commit.sha}` : 'nothing to commit');
}

function setupCommitCmd() {
  const result = setupCommit(c.repo);
  if (result.pending) die(result.error || 'setup commit failed. Do not git commit.');
  if (!result.committed.length) console.log(result.sha ? `setup already committed ${result.sha}` : 'nothing to commit');
  else console.log(`committed fleet setup ${result.sha}`);
}

function tellCmd() {
  const rest = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--config') { i++; continue; }
    if (argv[i] === '--') continue;
    rest.push(argv[i]);
  }
  const body = rest.join(' ').trim();
  if (!body) die('usage: fleet tell <text>');
  const result = tellDispatch(c, { body });
  for (const f of result.files) console.log(f);
  if (result.nudged) console.log(`nudged ${result.to}`);
  else if (result.wake?.reason === 'working') console.log(`mailed ${result.to} (working, not nudged)`);
  else console.log(`mailed ${result.to}`);
  for (const id of result.recovered || []) if (id !== result.to || !result.nudged) console.log(`nudged ${id} again`);
}

function hearCmd() {
  const msgs = hearInterpreter(c);
  if (!msgs.length) console.log('no unread messages for interpreter');
  for (const m of msgs) console.log(`=== ${m.file}\n${m.text}`);
  for (const id of msgs.recovered || []) console.log(`nudged ${id} again`);
}

function commitCmd() {
  const { message, area, all, submit, paths } = commitArgs();
  const result = commitWork(c, { cwd: process.cwd(), area, message, paths, all, submit });
  for (const w of result.warnings) console.error(`warn: ${w}`);
  console.log(result.sha);
  if (result.landing) {
    for (const w of result.landing.warnings ?? []) console.error(`warn: ${w}`);
    console.log(`queued ${result.landing.sha.slice(0, 10)} (${result.landing.branch}, ${result.landing.files.length} files)`);
    if (result.landing.hint) console.log(result.landing.hint);
    if (result.landing.landerStarted) console.log(`lander drain started (pid ${result.landing.landerStarted})`);
  }
}

function tool(name) {
  const js = path.join(MAIN_BIN, `${name}.mjs`);
  const r = spawnSync(process.execPath, [js, ...argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const run = { up, down, status, supervise: () => supervise(argv[1]), worktrees, crontab,
  prompt: async () => console.log(composePrompt(getArea(c, argv[1]), await adapterFor(getArea(c, argv[1]).harness))),
  'run-job': () => runJob(argv[1]), 'sched-env': () => schedEnv(argv[1]), lander: () => lander(argv[1] ?? 'status'),
  commit: commitCmd, 'setup-commit': setupCommitCmd, update: updateCmd, tell: tellCmd, hear: hearCmd, wakes: wakesCmd,
  doctor: () => tool('doctor'), landq: () => tool('landq'), backlog: () => tool('backlog'),
  mailbox: () => tool('mailbox') }[cmd];
if (!run) die(`unknown command "${cmd}" (fleet help)`);
await run();
