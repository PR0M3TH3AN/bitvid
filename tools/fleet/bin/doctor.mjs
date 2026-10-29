#!/usr/bin/env node
// doctor.mjs — the hygiene of every area worktree, in one table. REPORT ONLY:
// nothing here writes, kills or pushes. The session that owns a tree fixes it.
//
//   doctor            the table
//   doctor --json     for scheduled check-ins
//   doctor --strict   exit 1 when any row has a flag
//
// Flags per area:
//   MISSING   no worktree on disk
//   DIRTY     uncommitted changes
//   ONE-DISK  commits that exist only on this machine (not on any remote ref);
//             with no remote configured: commits not yet landed on main
//   NO-TASK   no .task file (what the session is doing, in one line)
//   STALE     .task untouched for doctor.staleHours while the tree has unlanded work
//   WAITING   the .task carries a `WAITING: <who> — <what> (since <date>)` line
// Plus backlog items marked in-progress that no commit has named for doctor.staleHours.
// Plus UNOWNED: files changed on main in the last doctor.unownedDays that match no owns glob.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, tryGit, mainRef, unownedChanges } from './lib.mjs';

const c = loadConfig();
const JSON_OUT = process.argv.includes('--json');
const n = (r) => (r.ok ? Number(r.out || 0) : null);
const rows = [];

for (const a of c.areas) {
  const row = { area: a.id, worktree: a.worktree, flags: [], waiting: [] };
  rows.push(row);
  if (!fs.existsSync(a.worktree)) { row.flags.push('MISSING'); continue; }
  const g = (...x) => tryGit(a.worktree, ...x);
  row.branch = g('rev-parse', '--abbrev-ref', 'HEAD').out;
  row.dirty = g('status', '--porcelain').out.split('\n').filter(Boolean).length;
  row.unlanded = n(g('rev-list', '--count', `${mainRef(c)}..HEAD`));
  row.behind = n(g('rev-list', '--count', `HEAD..${mainRef(c)}`));
  row.oneDisk = c.remote ? n(g('rev-list', '--count', 'HEAD', '--not', `--remotes=${c.remote}`)) : row.unlanded;
  if (row.dirty) row.flags.push('DIRTY');
  if (row.oneDisk) row.flags.push('ONE-DISK');
  const task = path.join(a.worktree, '.task');
  if (!fs.existsSync(task)) row.flags.push('NO-TASK');
  else {
    const ageH = (Date.now() - fs.statSync(task).mtimeMs) / 3.6e6;
    row.taskAgeH = Math.round(ageH);
    if (ageH > c.doctor.staleHours && (row.dirty || row.unlanded)) row.flags.push('STALE');
    for (const l of fs.readFileSync(task, 'utf8').split('\n')) {
      const m = l.match(/^\s*WAITING:\s*(.+)$/i);
      if (m) row.waiting.push(m[1]);
    }
    if (row.waiting.length) row.flags.push('WAITING');
  }
}

// backlog items in progress that no commit has named recently
const staleItems = [];
const bdir = path.join(c.repo, c.paths.backlog);
if (fs.existsSync(bdir)) {
  const since = `${c.doctor.staleHours} hours ago`;
  for (const f of fs.readdirSync(bdir).filter((x) => x.endsWith('.json'))) {
    let it; try { it = JSON.parse(fs.readFileSync(path.join(bdir, f), 'utf8')); } catch { continue; }
    if (it.status !== 'in-progress') continue;
    const named = tryGit(c.repo, 'log', '--all', '-1', '--format=%h', `--since=${since}`, '-F', `--grep=${it.id}`).out;
    if (!named) staleItems.push(`${it.id} (${it.area}): ${it.title}`);
  }
}

const unowned = unownedChanges(c);
if (JSON_OUT) console.log(JSON.stringify({ at: new Date().toISOString(), rows, staleItems, unowned }, null, 1));
else {
  console.log(`${'area'.padEnd(18)}${'branch'.padEnd(22)}dirty unlanded behind one-disk task(h)  flags`);
  for (const r of rows) {
    console.log(`${r.area.padEnd(18)}${String(r.branch ?? '-').padEnd(22)}${String(r.dirty ?? '-').padStart(5)}${String(r.unlanded ?? '-').padStart(9)}${String(r.behind ?? '-').padStart(7)}${String(r.oneDisk ?? '-').padStart(9)}${String(r.taskAgeH ?? '-').padStart(8)}  ${r.flags.join(' ')}`);
    for (const w of r.waiting) console.log(`${''.padEnd(18)}WAITING: ${w}`);
  }
  if (staleItems.length) { console.log(`\nin-progress items no commit has named for ${c.doctor.staleHours} h:`); for (const s of staleItems) console.log(`  ${s}`); }
  if (unowned.length) {
    console.log(`\nUNOWNED files changed in the last ${c.doctor.unownedDays} days (no area owns them). Tell the session manager; it staffs an owner:`);
    for (const f of unowned) console.log(`  ${f}`);
  }
}
if (process.argv.includes('--strict') && (rows.some((r) => r.flags.length) || staleItems.length || unowned.length)) process.exit(1);
