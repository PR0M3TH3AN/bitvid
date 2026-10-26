// Per-area checkpoint and hold records. Status and the check-in read them.
// There is no timer. An area writes a line when work advances, and a hold
// when something is blocked, naming who clears it and what is still allowed.
import fs from 'node:fs';
import path from 'node:path';
import { area as getArea, die, writeAtomic } from '../lib.mjs';

export const STALL_MIN = 20;

function safeId(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id || '')) die(`bad area "${id ?? ''}"`);
  return id;
}

function fileIn(c, kind, id) {
  return path.join(c.stateDir, kind, `${safeId(id)}.json`);
}

function readMap(c, kind) {
  const dir = path.join(c.stateDir, kind);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try { out[name.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }
    catch { /* a torn write is skipped; the next checkpoint replaces it */ }
  }
  return out;
}

export function readProgressMap(c) {
  return readMap(c, 'progress');
}

export function readHoldMap(c) {
  return readMap(c, 'holds');
}

export function writeProgress(c, area, line) {
  const id = safeId(area);
  getArea(c, id);
  const text = String(line || '').trim();
  if (!text) die('progress needs one line saying what advanced');
  const rec = { at: new Date().toISOString(), area: id, line: text.slice(0, 400) };
  writeAtomic(fileIn(c, 'progress', id), JSON.stringify(rec) + '\n');
  return rec;
}

export function writeHold(c, area, { owner, unblock, next } = {}) {
  const id = safeId(area);
  getArea(c, id);
  const rec = {
    at: new Date().toISOString(),
    area: id,
    owner: String(owner || '').trim(),
    unblock: String(unblock || '').trim(),
    next: String(next || '').trim(),
  };
  if (!rec.owner || !rec.unblock || !rec.next) die('a hold needs --owner, --unblock, and --next');
  writeAtomic(fileIn(c, 'holds', id), JSON.stringify(rec) + '\n');
  return rec;
}

export function clearHold(c, area) {
  const id = safeId(area);
  getArea(c, id);
  const file = fileIn(c, 'holds', id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { area: id, cleared: true };
}
