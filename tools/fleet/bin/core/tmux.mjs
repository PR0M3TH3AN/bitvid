// The fleet session lives on one tmux server. A sender (Codex MCP, a sandbox,
// a shell) often has a different TMUX or TMUX_TMPDIR, so a bare `tmux` looks
// at the wrong server and reports the pane missing. fleet up records the
// socket. Every later command passes -S and ignores the sender's TMUX.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function fleetTmuxSession(c) {
  return `fleet-${c?.project || 'fleet'}`.replace(/[.:]/g, '-');
}

export function tmuxSocketFile(c) {
  return path.join(c.stateDir, 'tmux-socket');
}

function readSocketFile(c) {
  if (!c?.stateDir) return '';
  try {
    const sock = fs.readFileSync(tmuxSocketFile(c), 'utf8').trim().split('\n')[0].trim();
    return sock.startsWith('/') ? sock : '';
  } catch {
    return '';
  }
}

function writeSocketFile(c, sock) {
  if (!c?.stateDir || !sock || !sock.startsWith('/')) return;
  fs.mkdirSync(c.stateDir, { recursive: true });
  fs.writeFileSync(tmuxSocketFile(c), `${sock}\n`);
}

function cleanEnv(base, { keepTmux = false } = {}) {
  const env = { ...base };
  if (!keepTmux) delete env.TMUX;
  return env;
}

function hasSession(session, socket, env) {
  const args = [...(socket ? ['-S', socket] : []), 'has-session', '-t', session];
  const r = spawnSync('tmux', args, { encoding: 'utf8', env });
  return r.status === 0;
}

function socketPathOf(session, socket, env) {
  const args = [...(socket ? ['-S', socket] : []), 'display-message', '-p', '-t', session, '#{socket_path}'];
  const r = spawnSync('tmux', args, { encoding: 'utf8', env });
  const sock = String(r.stdout || '').trim();
  return r.status === 0 && sock.startsWith('/') ? sock : '';
}

function socketDirs() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : '';
  const roots = [process.env.TMUX_TMPDIR, process.env.XDG_RUNTIME_DIR, '/tmp'];
  return [...new Set(roots.filter(Boolean).map((root) => path.join(root, `tmux-${uid}`)))];
}

function listSockets() {
  const found = [];
  for (const dir of socketDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isSocket()) found.push(full);
      } catch { /* gone */ }
    }
  }
  return found;
}

/** Socket that actually has this fleet session, or '' if none is visible. */
function findSocket(session) {
  const bare = cleanEnv(process.env);
  delete bare.TMUX_TMPDIR;
  if (hasSession(session, '', bare)) {
    const pathOf = socketPathOf(session, '', bare);
    if (pathOf) return pathOf;
  }
  const fromEnv = String(process.env.TMUX || '').split(',')[0];
  if (fromEnv.startsWith('/') && hasSession(session, fromEnv, cleanEnv(process.env))) return fromEnv;
  for (const sock of listSockets()) {
    if (sock === fromEnv) continue;
    if (hasSession(session, sock, cleanEnv(process.env))) return sock;
  }
  return '';
}

export function resolveTmuxSocket(c) {
  if (!c) return '';
  if (c._tmuxSocket) return c._tmuxSocket;
  const session = fleetTmuxSession(c);
  const saved = readSocketFile(c);
  if (saved && hasSession(session, saved, cleanEnv(process.env))) {
    c._tmuxSocket = saved;
    return saved;
  }
  const found = findSocket(session);
  if (found) {
    writeSocketFile(c, found);
    c._tmuxSocket = found;
    return found;
  }
  // Keep a recorded path even when the session is not on it, so the miss
  // log names the server we actually queried instead of the sender's TMUX.
  if (saved) {
    c._tmuxSocket = saved;
    return saved;
  }
  return '';
}

/** After fleet up creates or reuses the session, store the server it used. */
export function rememberTmuxServer(c) {
  const session = fleetTmuxSession(c);
  const known = c?._tmuxSocket || readSocketFile(c);
  const env = cleanEnv(process.env, { keepTmux: !known });
  const sock = socketPathOf(session, known, env);
  if (!sock) return '';
  writeSocketFile(c, sock);
  c._tmuxSocket = sock;
  return sock;
}

export function tmuxSocketFacts(c) {
  const saved = c?._tmuxSocket || readSocketFile(c);
  return {
    socket: saved || null,
    socketExists: saved ? fs.existsSync(saved) : false,
    tmuxEnv: process.env.TMUX || null,
    tmuxTmpdir: process.env.TMUX_TMPDIR || null,
  };
}

export function tmuxCommand(c, args, opts = {}) {
  const socket = resolveTmuxSocket(c);
  const argv = socket ? ['-S', socket, ...args] : args;
  const env = cleanEnv({ ...process.env, ...(opts.env || {}) }, { keepTmux: !socket });
  const { env: _env, ...rest } = opts;
  return spawnSync('tmux', argv, { encoding: 'utf8', ...rest, env });
}
