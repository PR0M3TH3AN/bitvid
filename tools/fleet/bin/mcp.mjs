#!/usr/bin/env node
// fleet-mcp — stdio MCP server for agent-side fleet operations.
// Speaks newline-delimited JSON-RPC. Logs go to stderr. Tools call bin/core/ops.mjs,
// the same functions as the backlog, mailbox, and landq CLIs.
import readline from 'node:readline';
import { FleetError, loadConfig, throwFleetErrors, runningAsMain } from './lib.mjs';
import {
  listBacklog, claimBacklog, updateBacklog, readMailbox, sendMailbox,
  submitLanding, landingStatus, submissionStatus, areaInfo, commitWork,
  setupCommit, tellDispatch, hearInterpreter, fleetStatus,
} from './core/ops.mjs';
import { fleetUpdate } from './core/update.mjs';

export const SERVER = { name: 'agent-fleet', version: '0.2.0' };
const INSTRUCTIONS = [
  'Agent-fleet operations. These tools are conveniences. Editing the backlog JSON, mailbox files, and other fleet files directly is fine. Do not hand-edit the landing queue while a drain is merging.',
  'area_info names the owner of a path. backlog_claim marks one item in-progress; pass its id. Idle, when you pass no id, means you have not chosen one yet.',
  'mailbox_read at the start of a turn. Mail is always delivered; the prompt says when to act on it. Sandboxed agents commit with the commit tool (message plus paths, or all), not git commit. submit on that tool also queues the tip. Then go back to work. At your next natural checkpoint, land_status can report that submission. Waiting is optional. Never infer the lander or the land result from silence. landq_submit queues the committed tip (a dirty worktree warns and still queues HEAD) and starts a drain. Do not push main.',
  'A scarce machine is a prompt convention: say so in .task and wait if a peer already has it. There is no slot lock.',
  'Sessions, worktrees, and cron stay on the fleet CLI. This server does not start them.',
  'setup_commit commits only the fleet setup files on the main checkout. A sandboxed agent uses it instead of git commit. update refreshes vendored runtime and the registered skill to this kit, leaves an edited prompt in place (the new template is a .kit file beside it), and commits only the paths it changed. It does not change fleet.config.json, product files, mail, or the landing queue. If that commit cannot write the index, it falls back to setup_commit. Mail to an open tmux window wakes it with a short line, not the body. mailbox_read and hear take those messages out of unread. fleet_status reports each window alive or dead, the unread count, and a working or idle guess. An idle area with mail that has been waiting is nudged once by that check. mailbox_read, hear, and tell run that same check. A second look does not nudge again. Do not scrape the tmux pane.',
].join(' ');

const cwdProp = { type: 'string', description: 'Directory to resolve the fleet from. Defaults to this server\'s cwd.' };

export const TOOLS = [
  { name: 'area_info', description: 'List fleet areas, or one area: id, provider, owned paths, branch, worktree.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, cwd: cwdProp } } },
  { name: 'backlog_list', description: 'List backlog items. Done items are omitted unless status is set.', inputSchema: { type: 'object', properties: { area: { type: 'string' }, status: { type: 'string' }, cwd: cwdProp } } },
  { name: 'backlog_claim', description: 'Atomically mark a named backlog item in-progress. Pass id. Without id, returns idle and does not pick one for you. Does not refuse blocked, done, or another area.', inputSchema: { type: 'object', properties: { area: { type: 'string' }, id: { type: 'string' }, cwd: cwdProp }, required: ['area'] } },
  { name: 'backlog_update', description: 'Set fields on a backlog item. status must be open, in-progress, blocked, done, or deferred.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, fields: { type: 'object' }, cwd: cwdProp }, required: ['id', 'fields'] } },
  { name: 'mailbox_read', description: 'Read unread mailbox messages for an area, oldest first, and move them to the archive so they are no longer unread.', inputSchema: { type: 'object', properties: { area: { type: 'string' }, cwd: cwdProp }, required: ['area'] } },
  { name: 'mailbox_send', description: 'Send a mailbox message to an area id or "all". Always delivers. If that area\'s tmux window is open, wake it with a short line naming the sender. The body stays in the mail. urgent does not change delivery.', inputSchema: { type: 'object', properties: { to: { type: 'string' }, from: { type: 'string' }, body: { type: 'string' }, subject: { type: 'string' }, urgent: { type: 'boolean' }, cwd: cwdProp }, required: ['to', 'from', 'body'] } },
  { name: 'commit', description: 'Stage and commit in the calling area worktree, in this server (outside an agent sandbox). Refuses the main checkout and paths outside the worktree. doesNotOwn paths warn. submit also queues the tip.', inputSchema: { type: 'object', properties: { message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' }, description: 'Files to stage, relative to the worktree. Name them. Omit only when all is true.' }, all: { type: 'boolean', description: 'Stage every change in the worktree.' }, area: { type: 'string', description: 'Area id. Inferred when cwd is that area\'s worktree.' }, submit: { type: 'boolean', description: 'After the commit, queue the tip the way landq_submit does.' }, cwd: cwdProp }, required: ['message'] } },
  { name: 'landq_submit', description: 'Queue the committed branch tip and start a drain. A dirty worktree warns; only HEAD is queued. Refuses main. Returns the submission id.', inputSchema: { type: 'object', properties: { cwd: cwdProp } } },
  { name: 'land_status', description: 'Quick lookup of one submission: queued, gating, landed (landedSha), rejected (reason), or unknown. Says whether a drain is alive and when it last ticked. If it is dead, the hint is the command that starts it. wait is optional and polls until landed, rejected, or timeoutSec (default 120, max 600).', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Submission id: the commit sha, or a unique prefix of at least 4 hex characters.' }, wait: { type: 'boolean' }, timeoutSec: { type: 'number', description: 'Seconds to poll when wait is true. Default 120. Capped at 600.' }, cwd: cwdProp }, required: ['id'] } },
  { name: 'landq_status', description: 'Landing queue overview, or one submission by sha prefix (same durable state as land_status, including the optional wait).', inputSchema: { type: 'object', properties: { sha: { type: 'string' }, id: { type: 'string' }, wait: { type: 'boolean' }, timeoutSec: { type: 'number' }, cwd: cwdProp } } },
  { name: 'setup_commit', description: 'Commit only fleet setup files in the main checkout. Does not commit product code. Use this instead of git commit when the shell cannot write the git index.', inputSchema: { type: 'object', properties: { message: { type: 'string' }, cwd: cwdProp } } },
  { name: 'update', description: 'Bring kit-owned files up to the installed kit without re-running init. Refreshes vendored runtime and the skill for a tool that is already registered. Overwrites a prompt only when it is still the copy init wrote. An edited prompt stays, and the new template is written beside it as a .kit file. Does not change fleet.config.json, product files, worktrees, mail, or the landing queue. Commits only the paths it changed. If the shell cannot write the git index, falls back to setup_commit.', inputSchema: { type: 'object', properties: { cwd: cwdProp } } },
  { name: 'tell', description: 'Mail the session manager from the interpreter. Wakes its tmux window with a short line when that window is open. The body stays in the mail. Replies are read with hear.', inputSchema: { type: 'object', properties: { body: { type: 'string' }, subject: { type: 'string' }, cwd: cwdProp }, required: ['body'] } },
  { name: 'hear', description: 'Read unread mailbox messages for the interpreter and move them out of unread.', inputSchema: { type: 'object', properties: { cwd: cwdProp } } },
  { name: 'fleet_status', description: 'Each area: tmux window alive or dead, unread mail count, and a working or idle guess. Idle with unread mail that has been waiting is nudged once.', inputSchema: { type: 'object', properties: { cwd: cwdProp } } },
];

function configFor(args) {
  const cwd = args.cwd || process.cwd();
  return { c: loadConfig(process.argv, cwd), cwd };
}

export function dispatchTool(name, args = {}) {
  const { c, cwd } = configFor(args);
  switch (name) {
    case 'area_info': return areaInfo(c, args.id);
    case 'backlog_list': return listBacklog(c, { area: args.area, status: args.status, cwd });
    case 'backlog_claim': return claimBacklog(c, { area: args.area, id: args.id, cwd });
    case 'backlog_update': return updateBacklog(c, args.id, args.fields ?? {}, cwd);
    case 'mailbox_read': return readMailbox(c, args.area);
    case 'mailbox_send': return sendMailbox(c, { to: args.to, from: args.from, body: args.body, subject: args.subject ?? '', urgent: Boolean(args.urgent), cwd });
    case 'commit': return commitWork(c, { cwd, area: args.area, message: args.message, paths: args.paths, all: Boolean(args.all), submit: Boolean(args.submit) });
    case 'landq_submit': return submitLanding(c, cwd);
    case 'land_status': return submissionStatus(c, args.id, { wait: Boolean(args.wait), timeoutSec: args.timeoutSec });
    case 'landq_status': return (args.sha || args.id)
      ? submissionStatus(c, args.sha || args.id, { wait: Boolean(args.wait), timeoutSec: args.timeoutSec })
      : landingStatus(c);
    case 'setup_commit': return setupCommit(c.repo, { message: args.message || 'fleet init' });
    case 'update': return fleetUpdate(c.repo);
    case 'tell': return tellDispatch(c, { body: args.body, subject: args.subject ?? '' });
    case 'hear': return hearInterpreter(c);
    case 'fleet_status': return fleetStatus(c);
    default: throw new FleetError(`unknown tool ${name}`);
  }
}

function toolResult(payload, isError = false) {
  return { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }], ...(isError ? { isError: true } : {}) };
}

export async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || msg.method == null) return null;
  if (msg.id == null) return null;
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
  if (msg.method === 'initialize') {
    const requested = msg.params?.protocolVersion;
    return reply({
      protocolVersion: typeof requested === 'string' && requested ? requested : '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions: INSTRUCTIONS,
    });
  }
  if (msg.method === 'ping') return reply({});
  if (msg.method === 'tools/list') return reply({ tools: TOOLS });
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};
    try {
      throwFleetErrors(true);
      return reply(toolResult(await dispatchTool(name, args)));
    } catch (e) {
      return reply(toolResult(e instanceof Error ? e.message : String(e), true));
    }
  }
  return fail(-32601, `method not found: ${msg.method}`);
}

function serve() {
  throwFleetErrors(true);
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  const send = (msg) => { if (msg) process.stdout.write(`${JSON.stringify(msg)}\n`); };
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try { msg = JSON.parse(text); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); return; }
    Promise.resolve(handleMessage(msg)).then(send).catch((e) => {
      send({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
    });
  });
}

if (runningAsMain(import.meta.url)) serve();
