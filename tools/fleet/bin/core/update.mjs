// Bring an initialized project up to the kit that is installed now.
// Init records a hash of each template it wrote (fleet/kit.json). Update
// overwrites a file only when it still matches that hash. A local edit, or a
// file with no recorded hash, stays put and the new template is written beside
// it as <file>.kit. Vendored runtime (tools/fleet) is always refreshed.
// Product files, fleet.config.json, worktrees, mail, and the landing queue
// are never written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { KIT, die, tryGit, writeAtomic } from '../lib.mjs';
import { setupCommit } from './ops.mjs';

const MANIFEST_REL = 'fleet/kit.json';

const TEMPLATE_DIRS = [
  ['templates/prompts', 'docs/agents/prompts'],
  ['templates/schedules', 'docs/agents/schedules'],
  ['templates/docs/backlog', 'docs/agents/backlog'],
];

const TEMPLATE_FILES = [
  ['templates/docs/PROGRAM.md', 'docs/agents/PROGRAM.md'],
  ['templates/docs/RESUME-BRIEF.md', 'docs/agents/RESUME-BRIEF.md'],
  ['templates/docs/WIND-DOWN.md', 'docs/agents/WIND-DOWN.md'],
  ['templates/docs/STRIKES.md', 'docs/agents/STRIKES.md'],
  ['templates/docs/TODO.md', 'docs/TODO.md'],
  ['templates/fleet/RULE-CHANGES.md', 'fleet/RULE-CHANGES.md'],
];

const RUNTIME_DIRS = [
  ['bin', 'tools/fleet/bin'],
  ['adapters', 'tools/fleet/adapters'],
];

/** Installed only when that tool's copy is already in the project. */
const SKILLS = [
  { from: 'plugins/codex/.agents/skills/agent-fleet', to: '.agents/skills/agent-fleet' },
  { from: 'plugins/claude/skills/fleet', to: '.claude/skills/fleet' },
  { from: 'plugins/pi/.pi/skills/agent-fleet', to: '.pi/skills/agent-fleet' },
  { from: 'plugins/cursor/rules/fleet.mdc', to: '.cursor/rules/fleet.mdc' },
];

export function kitVersion() {
  return JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8')).version;
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function posix(rel) {
  return String(rel).split(path.sep).join('/');
}

export function isTemplatePath(rel) {
  const norm = posix(rel);
  if (norm === 'fleet.config.json' || norm.startsWith('tools/fleet/')) return false;
  if (norm === 'fleet/context.md' || norm === 'fleet/GOAL.md' || norm === 'fleet/LOG.md') return false;
  if (norm.startsWith('fleet/inbox/')) return false;
  return norm.startsWith('docs/agents/') || norm === 'docs/TODO.md' || norm === 'fleet/RULE-CHANGES.md';
}

function blocked(rel) {
  const norm = posix(rel);
  if (norm.includes('..')) return true;
  if (norm === 'fleet.config.json') return true;
  if (norm === 'fleet/context.md' || norm === 'fleet/GOAL.md' || norm === 'fleet/LOG.md') return true;
  if (norm.startsWith('fleet/inbox/')) return true;
  return false;
}

function readManifest(repo) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(repo, MANIFEST_REL), 'utf8'));
    const files = parsed.files && typeof parsed.files === 'object' ? parsed.files : {};
    return { version: typeof parsed.version === 'string' ? parsed.version : '', files };
  } catch {
    return { version: '', files: {} };
  }
}

function manifestText(manifest) {
  return `${JSON.stringify({ version: manifest.version, files: manifest.files }, null, 2)}\n`;
}

/** Record hashes for templates this init actually wrote. Skipped files stay unrecorded. */
export function recordInstalled(repo, rels) {
  const manifest = readManifest(repo);
  manifest.version = kitVersion();
  for (const rel of rels) {
    const norm = posix(rel);
    if (!isTemplatePath(norm)) continue;
    const abs = path.join(repo, norm);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    manifest.files[norm] = sha256(fs.readFileSync(abs));
  }
  writeAtomic(path.join(repo, MANIFEST_REL), manifestText(manifest));
  return manifest;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...walkFiles(abs));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

function kitPairs() {
  const pairs = [];
  for (const [from, to] of TEMPLATE_DIRS) {
    const abs = path.join(KIT, from);
    for (const file of walkFiles(abs)) {
      pairs.push({ rel: posix(path.join(to, path.relative(abs, file))), abs: file });
    }
  }
  for (const [from, to] of TEMPLATE_FILES) {
    const abs = path.join(KIT, from);
    if (fs.existsSync(abs)) pairs.push({ rel: to, abs });
  }
  return pairs;
}

/**
 * Missing file: write it. Untouched since the recorded hash: overwrite.
 * Local edit, or no recorded hash and bytes differ: leave it, write <rel>.kit.
 * Do not record the edited bytes — the next update would treat them as untouched.
 */
function placeManaged(repo, rel, kitBytes, manifest, actions) {
  if (blocked(rel)) return;
  const dest = path.join(repo, rel);
  const kitHash = sha256(kitBytes);
  const recorded = manifest.files[rel];
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, kitBytes);
    manifest.files[rel] = kitHash;
    actions.added.push(rel);
    return;
  }
  const curHash = sha256(fs.readFileSync(dest));
  if (curHash === kitHash) {
    manifest.files[rel] = kitHash;
    return;
  }
  if (recorded && curHash === recorded) {
    fs.writeFileSync(dest, kitBytes);
    manifest.files[rel] = kitHash;
    actions.updated.push(rel);
    return;
  }
  const sidecar = `${rel}.kit`;
  const sideAbs = path.join(repo, sidecar);
  const same = fs.existsSync(sideAbs) && sha256(fs.readFileSync(sideAbs)) === kitHash;
  if (!same) {
    fs.mkdirSync(path.dirname(sideAbs), { recursive: true });
    fs.writeFileSync(sideAbs, kitBytes);
    actions.wrote.push(sidecar);
  }
  actions.merge.push({ path: rel, sidecar });
}

function refreshTree(repo, fromAbs, toRel, actions) {
  for (const abs of walkFiles(fromAbs)) {
    const rel = posix(path.join(toRel, path.relative(fromAbs, abs)));
    if (blocked(rel)) continue;
    const kitBytes = fs.readFileSync(abs);
    const dest = path.join(repo, rel);
    if (fs.existsSync(dest) && sha256(fs.readFileSync(dest)) === sha256(kitBytes)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, kitBytes);
    actions.runtime.push(rel);
  }
}

function skillPairs(repo) {
  const pairs = [];
  for (const spec of SKILLS) {
    if (!fs.existsSync(path.join(repo, spec.to))) continue;
    const abs = path.join(KIT, spec.from);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) {
      pairs.push({ rel: spec.to, abs });
      continue;
    }
    for (const file of walkFiles(abs)) {
      pairs.push({ rel: posix(path.join(spec.to, path.relative(abs, file))), abs: file });
    }
  }
  return pairs;
}

function promptTouched(rel) {
  return posix(rel).startsWith('docs/agents/prompts/');
}

function allowCommit(rel) {
  const norm = posix(rel);
  if (blocked(norm)) return false;
  if (norm.startsWith('tools/fleet/')) return true;
  if (norm.startsWith('docs/agents/')) return true;
  if (norm === 'docs/TODO.md' || norm === 'docs/TODO.md.kit') return true;
  if (norm === MANIFEST_REL || norm === 'fleet/RULE-CHANGES.md' || norm === 'fleet/RULE-CHANGES.md.kit') return true;
  if (norm.startsWith('.agents/')) return true;
  if (norm.startsWith('.claude/skills/')) return true;
  if (norm.startsWith('.pi/')) return true;
  if (norm.startsWith('.cursor/rules/fleet')) return true;
  return false;
}

function gitOut(repo, args) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout || '', err: (r.stderr || '').trim() };
}

function porcelainPaths(out) {
  const paths = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    let rel = line.slice(3);
    if (rel.includes(' -> ')) rel = rel.split(' -> ').pop();
    if (rel.startsWith('"') && rel.endsWith('"')) {
      try { rel = JSON.parse(rel); } catch { /* keep the raw text */ }
    }
    paths.push(posix(rel));
  }
  return paths;
}

function fallbackCommit(repo, error) {
  const fallback = setupCommit(repo, { message: 'fleet update' });
  return { ...fallback, fallback: true, error: error || fallback.error || 'git commit failed' };
}

function commitChanged(repo, wanted) {
  const specs = [...new Set(wanted.map(posix))].filter(allowCommit);
  const head = () => {
    const sha = tryGit(repo, 'rev-parse', 'HEAD');
    return sha.ok ? sha.out : null;
  };
  if (!specs.length) return { sha: head(), committed: [], pending: false, fallback: false };
  const status = gitOut(repo, ['status', '--porcelain', '--', ...specs]);
  if (!status.ok) return fallbackCommit(repo, status.err || 'git status failed');
  const changed = porcelainPaths(status.out).filter(allowCommit);
  if (!changed.length) return { sha: head(), committed: [], pending: false, fallback: false };
  const add = tryGit(repo, 'add', '--', ...changed);
  if (!add.ok) return fallbackCommit(repo, add.err || 'git add failed');
  const email = tryGit(repo, 'config', 'user.email').out;
  const args = ['-c', 'core.editor=true', ...(email ? [] : ['-c', 'user.email=fleet-init@localhost', '-c', 'user.name=fleet init']), 'commit', '-m', 'fleet update', '--', ...changed];
  const commit = tryGit(repo, ...args);
  if (!commit.ok) return fallbackCommit(repo, commit.err || commit.out || 'git commit failed');
  return { sha: head(), committed: changed, pending: false, fallback: false };
}

export function fleetUpdate(repo) {
  if (!repo) die('fleet update needs the project repo');
  if (!tryGit(repo, 'rev-parse', '--git-dir').ok) die(`not a git repo: ${repo}`);
  const manifest = readManifest(repo);
  const before = fs.existsSync(path.join(repo, MANIFEST_REL)) ? fs.readFileSync(path.join(repo, MANIFEST_REL), 'utf8') : '';
  const actions = { runtime: [], updated: [], added: [], merge: [], wrote: [] };
  for (const [from, to] of RUNTIME_DIRS) refreshTree(repo, path.join(KIT, from), to, actions);
  for (const pair of kitPairs()) placeManaged(repo, pair.rel, fs.readFileSync(pair.abs), manifest, actions);
  for (const pair of skillPairs(repo)) placeManaged(repo, pair.rel, fs.readFileSync(pair.abs), manifest, actions);
  manifest.version = kitVersion();
  const next = manifestText(manifest);
  if (next !== before) writeAtomic(path.join(repo, MANIFEST_REL), next);
  const restart = [...actions.updated, ...actions.added, ...actions.wrote].some(promptTouched);
  const commit = commitChanged(repo, [
    ...actions.runtime, ...actions.updated, ...actions.added, ...actions.wrote,
    ...(next !== before ? [MANIFEST_REL] : []),
  ]);
  return {
    version: manifest.version,
    runtime: actions.runtime,
    updated: actions.updated,
    added: actions.added,
    merge: actions.merge,
    restart,
    commit,
  };
}
