#!/usr/bin/env node
// mailbox.mjs — the file mailbox CLI. bin/core/ops.mjs does the work (shared with MCP).
//
//   mailbox send <to> --from <me> [--subject s] "text"   (to may be "all")
//   mailbox read <me>            print unread messages (oldest first) and move them to archive
//   mailbox count <me>           number of unread messages
//   mailbox archive <me> <file|--all>
//
// Recipients and senders must be area ids from fleet.config.json (or "owner",
// "scheduler", "interpreter"), so a message cannot be written outside the mailbox directory.
// Quiet hours are a prompt. send always delivers. --urgent is accepted and ignored.
import { loadConfig, flag, die } from './lib.mjs';
import { sendMailbox, readMailbox, archiveMailbox } from './core/ops.mjs';

const c = loadConfig();
const argv = process.argv.slice(2);
const [cmd, who] = argv;

if (cmd === 'send') {
  const skip = new Set(['--from', '--subject', '--config']);
  const body = argv.slice(2).filter((x, i, arr) => !skip.has(x) && !skip.has(arr[i - 1]) && x !== '--urgent').join(' ');
  for (const file of sendMailbox(c, { to: who, from: flag(argv, '--from'), body, subject: flag(argv, '--subject') ?? '', urgent: argv.includes('--urgent') })) console.log(file);
} else if (cmd === 'read') {
  const msgs = readMailbox(c, who);
  if (!msgs.length) console.log(`no unread messages for ${who}`);
  for (const m of msgs) console.log(`=== ${m.file}\n${m.text}`);
  for (const id of msgs.recovered || []) console.log(`nudged ${id} again`);
} else if (cmd === 'count') {
  console.log(readMailbox(c, who, { recover: false }).length);
} else if (cmd === 'archive') {
  try { for (const n of archiveMailbox(c, who, argv[2] ?? die('archive <me> <file|--all>'))) console.log(`archived ${n}`); }
  catch (e) { die(e.message); }
} else die('usage: mailbox send|read|count|archive (see header)');
