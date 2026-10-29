#!/usr/bin/env node
// backlog.mjs — the backlog: one JSON file per item under paths.backlog, in git.
// Operates on the tree you run it in (your worktree); changes land like any other file.
// The work is in bin/core/ops.mjs, shared with the MCP server.
//
//   backlog [list] [--area a] [--status s] [--json]
//   backlog add --area a --title "..." [--id x] [--blocked-on "who/what"]
//   backlog set <id> key=value [key=value...]      e.g. status=blocked blockedOn="web-ui: API"
//   backlog claim --area a --id x                  mark that item in-progress (atomic write)
//   backlog next --area a                          list the area's not-done items; you pick
//   backlog close <id>                             status=done, closedOn=today
//
// Item: {id, area, status, title, blockedOn, addedOn}  (+ any extra fields you like)
// status: open | in-progress | blocked | done | deferred
// Only the owner cancels agreed work; a priority change defers it.
import { loadConfig, flag, die } from './lib.mjs';
import { listBacklog, addBacklog, updateBacklog, claimBacklog, nextBacklog, closeBacklog } from './core/ops.mjs';

const c = loadConfig();
const argv = process.argv.slice(2);
const line = (it) => `${it.id.padEnd(14)}${String(it.area).padEnd(16)}${String(it.status).padEnd(12)}${it.title}${it.blockedOn ? `  [blocked on: ${it.blockedOn}]` : ''}`;

const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'list';
if (cmd === 'list') {
  const ar = flag(argv, '--area'), st = flag(argv, '--status');
  const items = listBacklog(c, { area: ar, status: st });
  if (argv.includes('--json')) console.log(JSON.stringify(items, null, 1));
  else { for (const i of items) console.log(line(i)); console.log(`${items.length} item(s)${st ? '' : ' not done'}`); }
} else if (cmd === 'add') {
  const it = addBacklog(c, { area: flag(argv, '--area'), title: flag(argv, '--title'), id: flag(argv, '--id'), blockedOn: flag(argv, '--blocked-on') });
  console.log(`added ${line(it)}`);
} else if (cmd === 'set') {
  const fields = {};
  for (const kv of argv.slice(2)) {
    const i = kv.indexOf('='); if (i < 1) die(`bad key=value: ${kv}`);
    fields[kv.slice(0, i)] = kv.slice(i + 1);
  }
  console.log(`set ${line(updateBacklog(c, argv[1], fields))}`);
} else if (cmd === 'claim') {
  const ar = flag(argv, '--area') ?? die('--area required');
  const r = claimBacklog(c, { area: ar, id: flag(argv, '--id') });
  if (r.idle) console.log(`pass --id. \`backlog next --area ${ar}\` lists open items. Pick by PROGRAM.md.`);
  else console.log(`claimed ${line(r.item)}`);
} else if (cmd === 'next') {
  const ar = flag(argv, '--area') ?? die('--area required');
  const items = nextBacklog(c, ar);
  if (!items.length) { console.log(`nothing open for ${ar} — idle is a correct state`); process.exit(0); }
  for (const it of items) console.log(line(it));
  console.log(`${items.length} open item(s) for ${ar}. Pick by PROGRAM.md; claim with --id.`);
} else if (cmd === 'close') {
  console.log(`closed ${closeBacklog(c, argv[1]).id}`);
} else die('usage: backlog [list|add|set|claim|next|close] (see header)');
