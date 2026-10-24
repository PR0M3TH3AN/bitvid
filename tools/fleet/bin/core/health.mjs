// One snapshot of the machine and of each area's process tree.
// Missing sensors are "unavailable". Nothing here changes the machine.
// The health block in fleet.config.json is guidance for the prompts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmuxCommand } from './tmux.mjs';

export const HEALTH_DEFAULTS = {
  diskFreePct: 10,
  diskFreeGb: 5,
  memoryAvailablePct: 15,
  swapUsedPct: 50,
  // Occupancy alone is not tight: Linux keeps swapped pages. swapUsedPct counts
  // only when available memory is also low. swapFullPct counts on its own.
  swapFullPct: 90,
  cpuTempC: 90,
  batteryPct: 20,
  batteryMinutes: 30,
  loadPerCore: 1.5,
};

const GB = 1024 ** 3;

export function healthThresholds(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { ...HEALTH_DEFAULTS };
  for (const key of Object.keys(HEALTH_DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const n = Number(src[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

export function parseLoadavg(text) {
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/.exec(String(text || '').trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function parseMeminfo(text) {
  const map = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^(\w+):\s+(\d+)\s*kB/i.exec(line);
    if (m) map[m[1]] = Number(m[2]) * 1024;
  }
  if (map.MemTotal == null) return null;
  const total = map.MemTotal;
  const available = map.MemAvailable ?? map.MemFree ?? null;
  const free = map.MemFree ?? null;
  const swapTotal = map.SwapTotal ?? 0;
  const swapFree = map.SwapFree ?? (swapTotal ? 0 : null);
  return {
    totalBytes: total,
    availableBytes: available,
    freeBytes: free,
    usedBytes: available != null ? Math.max(0, total - available) : null,
    swapTotalBytes: map.SwapTotal == null ? null : swapTotal,
    swapFreeBytes: map.SwapTotal == null ? null : swapFree,
    swapUsedBytes: map.SwapTotal == null ? null : Math.max(0, swapTotal - (swapFree ?? 0)),
  };
}

/** /proc/stat "cpu" line, or a sum of os.cpus().times. idle includes iowait. */
export function parseCpuStat(text) {
  const line = String(text || '').split('\n').find((l) => /^cpu\s+/.test(l));
  if (!line) return null;
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  if (n.length < 4 || n.some((x) => !Number.isFinite(x))) return null;
  const idle = n[3] + (n[4] || 0);
  const total = n.reduce((a, b) => a + b, 0);
  return { total, idle };
}

export function cpuTimes(cpus = os.cpus()) {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus || []) {
    for (const [key, value] of Object.entries(cpu.times || {})) {
      total += value;
      if (key === 'idle') idle += value;
    }
  }
  if (total <= 0) return null;
  return { total, idle };
}

export function cpuUsagePct(before, after) {
  if (!before || !after) return null;
  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  if (total <= 0) return null;
  return Math.round((1000 * (total - idle)) / total) / 10;
}

/** One line of /proc/<pid>/stat. rss is pages times pageSize (default 4096). */
export function parseProcStat(text, pageSize = 4096) {
  const s = String(text || '');
  const end = s.lastIndexOf(')');
  const space = s.indexOf(' ');
  if (end < 0 || space < 0) return null;
  const pid = Number(s.slice(0, space));
  const rest = s.slice(end + 2).trim().split(/\s+/);
  if (rest.length < 22) return null;
  const ppid = Number(rest[1]);
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  const rssPages = Number(rest[21]);
  if (![pid, ppid, utime, stime, rssPages].every(Number.isFinite)) return null;
  return { pid, ppid, ticks: utime + stime, rssBytes: rssPages * pageSize };
}

export function readProcSnapshot(sysRoot, pageSize = 4096) {
  const dir = path.join(sysRoot, 'proc');
  const rows = [];
  for (const name of safeReaddir(dir)) {
    if (!/^\d+$/.test(name)) continue;
    const text = readText(path.join(dir, name, 'stat'));
    if (!text) continue;
    const row = parseProcStat(text, pageSize);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * CPU% and RSS for rootPid and every descendant.
 * ticks are USER_HZ (default 100). A process that appears only in `after`
 * counts its whole tick count. cpuPct may exceed 100 when several cores are busy.
 */
export function treeUse(before, after, rootPid, elapsedMs, hz = 100) {
  const rows = [];
  const prev = new Map((before || []).map((p) => [p.pid, p]));
  const elapsedTicks = (Number(elapsedMs) / 1000) * hz;
  for (const now of after || []) {
    const was = prev.get(now.pid);
    const delta = was ? Math.max(0, now.ticks - was.ticks) : now.ticks;
    const cpuPct = elapsedTicks > 0 ? (100 * delta) / elapsedTicks : null;
    rows.push({ pid: now.pid, ppid: now.ppid, rssBytes: now.rssBytes, cpuPct });
  }
  const sum = sumTree(rows, rootPid);
  if (!sum.found) return sum;
  return { ...sum, cpuPct: sum.cpuPct == null ? null : Math.round(sum.cpuPct * 10) / 10 };
}

/** rows: { pid, ppid, cpuPct, rssBytes }. cpuPct null stays null if every row is null. */
export function sumTree(rows, rootPid) {
  const byPid = new Map();
  const children = new Map();
  for (const row of rows || []) {
    byPid.set(row.pid, row);
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row.pid);
  }
  const seen = new Set();
  const stack = [rootPid];
  let rss = 0;
  let cpu = 0;
  let cpuKnown = false;
  let count = 0;
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const row = byPid.get(pid);
    if (!row) continue;
    count += 1;
    rss += row.rssBytes || 0;
    if (row.cpuPct != null) { cpu += row.cpuPct; cpuKnown = true; }
    for (const kid of children.get(pid) || []) stack.push(kid);
  }
  if (!count) return { found: false, cpuPct: null, rssBytes: null, pids: 0 };
  return { found: true, cpuPct: cpuKnown ? Math.round(cpu * 10) / 10 : null, rssBytes: rss, pids: count };
}

export function parseDf(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const line = lines[lines.length - 1];
  const parts = line.split(/\s+/);
  if (parts.length < 6) return null;
  const total = Number(parts[1]);
  const used = Number(parts[2]);
  const free = Number(parts[3]);
  if (![total, used, free].every((n) => Number.isFinite(n) && n >= 0)) return null;
  const freePct = total > 0 ? Math.round((1000 * free) / total) / 10 : null;
  return { mount: parts.slice(5).join(' '), totalBytes: total, usedBytes: used, freeBytes: free, freePct };
}

export function parseVmStat(text) {
  const page = /page size of (\d+) bytes/i.exec(text || '');
  const pages = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^Pages (.+?):\s+(\d+)/.exec(line.trim());
    if (m) pages[m[1].toLowerCase()] = Number(m[2]);
  }
  return { pageSize: page ? Number(page[1]) : 4096, pages };
}

export function parseSwapUsage(text) {
  const unit = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  const grab = (name) => {
    const m = new RegExp(`${name}\\s*=\\s*([\\d.]+)\\s*([KMGT])`, 'i').exec(text || '');
    if (!m) return null;
    return Math.round(Number(m[1]) * (unit[m[2].toUpperCase()] || 1));
  };
  const total = grab('total');
  if (total == null) return { totalBytes: null, usedBytes: null, freeBytes: null };
  return { totalBytes: total, usedBytes: grab('used'), freeBytes: grab('free') };
}

export function parsePmset(text) {
  const body = String(text || '');
  if (!body.trim() || /no batteries/i.test(body) && !/\d+\s*%/.test(body)) return emptyBattery();
  const line = body.split('\n').find((l) => /\d+\s*%/.test(l));
  if (!line) return emptyBattery();
  const pct = /(\d+)\s*%/.exec(line);
  let state = 'unavailable';
  if (/discharg/i.test(line)) state = 'discharging';
  else if (/charg(ing|ed)/i.test(line) && !/not charging/i.test(line) && /charging/i.test(line)) state = 'charging';
  else if (/charged|full/i.test(line)) state = 'full';
  else if (/not charging/i.test(line)) state = 'not-charging';
  else if (/AC Power/i.test(body)) state = 'not-charging';
  else if (/Battery Power/i.test(body)) state = 'discharging';
  let minutes = null;
  const tm = /(\d+):(\d+)\s+remaining/.exec(line);
  if (tm && !/no estimate/i.test(line)) minutes = Number(tm[1]) * 60 + Number(tm[2]);
  return { present: true, percent: pct ? Number(pct[1]) : null, state, minutesRemaining: minutes };
}

export function parsePs(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const rssKb = Number(parts[2]);
    const cpu = Number(parts[3]);
    if (![pid, ppid, rssKb, cpu].every(Number.isFinite)) continue;
    rows.push({ pid, ppid, rssBytes: rssKb * 1024, cpuPct: cpu });
  }
  return rows;
}

function emptyBattery() {
  return { present: false, percent: null, state: 'unavailable', minutesRemaining: null };
}

function emptyMemory() {
  return {
    status: 'unavailable', totalBytes: null, usedBytes: null, freeBytes: null,
    availableBytes: null, availablePct: null, swapTotalBytes: null, swapUsedBytes: null, swapFreeBytes: null,
  };
}

function withMemoryPct(mem) {
  if (!mem || mem.totalBytes == null) return emptyMemory();
  const availablePct = mem.availableBytes != null && mem.totalBytes > 0
    ? Math.round((1000 * mem.availableBytes) / mem.totalBytes) / 10
    : null;
  return { status: 'ok', ...mem, availablePct };
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function readNum(file) {
  const text = readText(file);
  if (text == null) return null;
  const n = Number(String(text).trim());
  return Number.isFinite(n) ? n : null;
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function toC(raw) {
  if (raw == null || !Number.isFinite(raw)) return null;
  const c = Math.abs(raw) >= 1000 ? raw / 1000 : raw;
  if (c <= 0 || c > 150) return null;
  return Math.round(c * 10) / 10;
}

function isCpuName(name) {
  return /cpu|package|pkg|core|soc|k10temp|zenpower|tdie|tctl/i.test(name || '');
}

export function readLinuxTemps(sysRoot) {
  const readings = [];
  const thermal = path.join(sysRoot, 'sys/class/thermal');
  for (const name of safeReaddir(thermal)) {
    if (!name.startsWith('thermal_zone')) continue;
    const dir = path.join(thermal, name);
    const celsius = toC(readNum(path.join(dir, 'temp')));
    if (celsius == null) continue;
    readings.push({ source: 'thermal', name: readText(path.join(dir, 'type'))?.trim() || name, celsius });
  }
  const hwmon = path.join(sysRoot, 'sys/class/hwmon');
  for (const name of safeReaddir(hwmon)) {
    const dir = path.join(hwmon, name);
    const chip = readText(path.join(dir, 'name'))?.trim() || name;
    for (const file of safeReaddir(dir)) {
      const m = /^temp(\d+)_input$/.exec(file);
      if (!m) continue;
      const celsius = toC(readNum(path.join(dir, file)));
      if (celsius == null) continue;
      const label = readText(path.join(dir, `temp${m[1]}_label`))?.trim();
      readings.push({ source: 'hwmon', name: label ? `${chip} ${label}` : chip, celsius });
    }
  }
  const cpuish = readings.filter((r) => isCpuName(r.name));
  const rest = readings.filter((r) => !isCpuName(r.name));
  const kept = [...cpuish, ...rest].slice(0, 12);
  return kept.length ? { status: 'ok', readings: kept } : { status: 'unavailable', readings: [] };
}

function minutesBetween(now, full, rate) {
  if (now == null || rate == null || rate <= 0) return null;
  return Math.max(0, Math.round((Math.abs(full == null ? now : full - now) / rate) * 60));
}

export function readLinuxBattery(sysRoot) {
  const root = path.join(sysRoot, 'sys/class/power_supply');
  const names = safeReaddir(root).filter((n) => /^(BAT|battery)/i.test(n)).sort();
  const parsed = [];
  for (const name of names) {
    const dir = path.join(root, name);
    const status = (readText(path.join(dir, 'status')) || '').trim().toLowerCase();
    const state = status === 'charging' ? 'charging'
      : status === 'discharging' ? 'discharging'
      : status === 'full' ? 'full'
      : status === 'not charging' ? 'not-charging'
      : 'unavailable';
    let percent = readNum(path.join(dir, 'capacity'));
    const energy = readNum(path.join(dir, 'energy_now'));
    const energyFull = readNum(path.join(dir, 'energy_full'));
    const power = readNum(path.join(dir, 'power_now'));
    const charge = readNum(path.join(dir, 'charge_now'));
    const chargeFull = readNum(path.join(dir, 'charge_full'));
    const current = readNum(path.join(dir, 'current_now'));
    if (percent == null && energy != null && energyFull > 0) percent = Math.round((100 * energy) / energyFull);
    if (percent == null && charge != null && chargeFull > 0) percent = Math.round((100 * charge) / chargeFull);
    if (percent == null && state === 'unavailable') continue;
    let minutes = null;
    if (state === 'discharging') minutes = energy != null ? minutesBetween(energy, null, power) : minutesBetween(charge, null, current);
    else if (state === 'charging') minutes = energy != null ? minutesBetween(energy, energyFull, power) : minutesBetween(charge, chargeFull, current);
    parsed.push({ percent, state, minutesRemaining: minutes });
  }
  if (!parsed.length) return emptyBattery();
  const pick = parsed.find((b) => b.state === 'discharging') || parsed[0];
  return { present: true, count: parsed.length, ...pick };
}

function sh(cmd, args, timeout = 2500) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout });
    if (r.status !== 0 || r.error) return null;
    return r.stdout || '';
  } catch { return null; }
}

function pause(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return;
  const r = spawnSync('sleep', [(n / 1000).toFixed(3)], { timeout: n + 2000 });
  if (r.error || r.status !== 0) {
    const end = Date.now() + n;
    while (Date.now() < end) { /* sleep(1) missing */ }
  }
}

function pageSize() {
  const text = sh('getconf', ['PAGE_SIZE'], 1000);
  const n = Number(String(text || '').trim());
  return Number.isFinite(n) && n > 0 ? n : 4096;
}

function userHz() {
  const text = sh('getconf', ['CLK_TCK'], 1000);
  const n = Number(String(text || '').trim());
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function existingPath(target) {
  let dir = target;
  while (dir) {
    try { if (fs.existsSync(dir)) return dir; } catch { return null; }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function dfLive(target, platform) {
  const gnu = sh('df', ['-B1', '-P', target], 3000);
  if (gnu && /1B-blocks|1-blocks/.test(gnu)) return parseDf(gnu);
  const bsd = sh('df', ['-k', '-P', target], 3000);
  if (bsd) {
    const parsed = parseDf(bsd);
    if (parsed) {
      const scale = /512-blocks/.test(bsd) ? 512 : 1024;
      return {
        mount: parsed.mount,
        totalBytes: parsed.totalBytes * scale,
        usedBytes: parsed.usedBytes * scale,
        freeBytes: parsed.freeBytes * scale,
        freePct: parsed.freePct,
      };
    }
  }
  if (gnu) return parseDf(gnu);
  if (platform === 'win32') return winDisk(target);
  return null;
}

function winDisk(target) {
  const script = `$p=${JSON.stringify(target)}; $q=Split-Path -Qualifier $p; if (-not $q) { $q='C:' }; $d=New-Object System.IO.DriveInfo($q); if (-not $d.IsReady) { exit 1 }; Write-Output ($d.TotalSize.ToString()+' '+($d.TotalSize-$d.AvailableFreeSpace).ToString()+' '+$d.AvailableFreeSpace.ToString()+' '+$d.Name)`;
  const text = sh('powershell', ['-NoProfile', '-Command', script], 4000);
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const total = Number(parts[0]);
  const used = Number(parts[1]);
  const free = Number(parts[2]);
  if (![total, used, free].every(Number.isFinite)) return null;
  return { mount: parts.slice(3).join(' '), totalBytes: total, usedBytes: used, freeBytes: free, freePct: total ? Math.round((1000 * free) / total) / 10 : null };
}

function detectWsl(sysRoot, opt) {
  if (opt.wsl != null) return Boolean(opt.wsl);
  const version = readText(path.join(sysRoot, 'proc/version'));
  if (version) return /microsoft|wsl/i.test(version);
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function diskTargets(c) {
  return [
    ['repo', c?.repo || '/'],
    ['worktree', c?.worktreeRoot || c?.repo || '/'],
    ['state', c?.stateDir || '/'],
    ['tmp', os.tmpdir()],
  ];
}

function readDisks(c, platform, opt) {
  return diskTargets(c).map(([label, requested]) => {
    const parsed = opt.df
      ? opt.df(requested)
      : dfLive(existingPath(requested) || requested, platform);
    if (!parsed || parsed.freeBytes == null) {
      return { label, path: requested, mount: null, totalBytes: null, usedBytes: null, freeBytes: null, freePct: null, status: 'unavailable' };
    }
    return { label, path: requested, status: 'ok', mount: parsed.mount ?? null, totalBytes: parsed.totalBytes, usedBytes: parsed.usedBytes, freeBytes: parsed.freeBytes, freePct: parsed.freePct };
  });
}

function readLinuxMemory(sysRoot) {
  return withMemoryPct(parseMeminfo(readText(path.join(sysRoot, 'proc/meminfo')) || ''));
}

function readGenericMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  if (!total) return emptyMemory();
  return withMemoryPct({
    totalBytes: total,
    availableBytes: free,
    freeBytes: free,
    usedBytes: Math.max(0, total - free),
    swapTotalBytes: null,
    swapFreeBytes: null,
    swapUsedBytes: null,
  });
}

function readDarwinMemory() {
  const total = Number(String(sh('sysctl', ['-n', 'hw.memsize']) || '').trim());
  const vm = parseVmStat(sh('vm_stat', []) || '');
  const swap = parseSwapUsage(sh('sysctl', ['-n', 'vm.swapusage']) || '');
  if (!Number.isFinite(total) || total <= 0) return readGenericMemory();
  const page = vm.pageSize || 4096;
  const availablePages = (vm.pages.free || 0) + (vm.pages.inactive || 0) + (vm.pages.speculative || 0);
  const available = Math.min(total, availablePages * page);
  return withMemoryPct({
    totalBytes: total,
    availableBytes: available,
    freeBytes: (vm.pages.free || 0) * page,
    usedBytes: Math.max(0, total - available),
    swapTotalBytes: swap.totalBytes,
    swapFreeBytes: swap.freeBytes,
    swapUsedBytes: swap.usedBytes,
  });
}

function readDarwinBattery() {
  const text = sh('pmset', ['-g', 'batt'], 3000);
  if (!text) return emptyBattery();
  return parsePmset(text);
}

function readWindowsBattery() {
  const text = sh('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress)'], 4000);
  if (!text || !text.trim() || text.trim() === 'null') return emptyBattery();
  try {
    const row = JSON.parse(text);
    if (!row || row.EstimatedChargeRemaining == null) return emptyBattery();
    const code = Number(row.BatteryStatus);
    const state = [6, 7, 8, 9].includes(code) ? 'charging'
      : code === 1 || code === 4 || code === 5 ? 'discharging'
      : code === 2 || code === 3 ? 'full'
      : 'unavailable';
    return { present: true, percent: Number(row.EstimatedChargeRemaining), state, minutesRemaining: null };
  } catch { return emptyBattery(); }
}

function linuxSample(sysRoot, opt) {
  if (opt.statTexts || opt.procSamples) {
    return {
      usagePct: opt.statTexts ? cpuUsagePct(parseCpuStat(opt.statTexts[0]), parseCpuStat(opt.statTexts[1])) : null,
      before: opt.procSamples ? opt.procSamples[0] : [],
      after: opt.procSamples ? opt.procSamples[1] : [],
      elapsedMs: opt.elapsedMs ?? 1000,
    };
  }
  if (opt.sampleMs === 0) return { usagePct: null, before: [], after: [], elapsedMs: 0 };
  const stat1 = parseCpuStat(readText(path.join(sysRoot, 'proc/stat')) || '');
  const pages = pageSize();
  const before = readProcSnapshot(sysRoot, pages);
  const t0 = Date.now();
  pause(opt.sampleMs ?? 200);
  const stat2 = parseCpuStat(readText(path.join(sysRoot, 'proc/stat')) || '');
  const after = readProcSnapshot(sysRoot, pages);
  let usagePct = cpuUsagePct(stat1, stat2);
  if (usagePct == null) {
    const a = cpuTimes();
    pause(opt.sampleMs ?? 200);
    usagePct = cpuUsagePct(a, cpuTimes());
  }
  return { usagePct, before, after, elapsedMs: Math.max(1, Date.now() - t0) };
}

function readLoad(platform, sysRoot) {
  if (platform === 'linux') {
    const parsed = parseLoadavg(readText(path.join(sysRoot, 'proc/loadavg')) || '');
    if (parsed) return parsed;
    const live = os.loadavg();
    return live.some((n) => n > 0) ? live : [null, null, null];
  }
  if (platform === 'win32') return [null, null, null];
  return os.loadavg();
}

function listPanes(c, opt) {
  if (opt.panes) return opt.panes;
  const session = `fleet-${c?.project || 'fleet'}`.replace(/[.:]/g, '-');
  return (c?.areas || []).map((area) => {
    const r = tmuxCommand(c, ['list-panes', '-t', `${session}:${area.id}`, '-F', '#{pane_pid}'], { timeout: 2000 });
    const text = r.status === 0 ? r.stdout : null;
    const pid = Number(String(text || '').trim().split(/\s+/)[0]);
    return { id: area.id, pid: Number.isInteger(pid) && pid > 0 ? pid : null };
  });
}

function areasFromTree(panes, before, after, elapsedMs, hz) {
  return (panes || []).map((pane) => {
    if (!pane.pid) return { id: pane.id, found: false, cpuPct: null, rssBytes: null, pids: 0 };
    return { id: pane.id, ...treeUse(before, after, pane.pid, elapsedMs, hz) };
  });
}

function areasFromPs(panes, rows) {
  return (panes || []).map((pane) => {
    if (!pane.pid) return { id: pane.id, found: false, cpuPct: null, rssBytes: null, pids: 0 };
    return { id: pane.id, ...sumTree(rows, pane.pid) };
  });
}

function readPsAreas(panes, opt) {
  const text = opt.psText != null ? opt.psText : sh('ps', ['-ax', '-o', 'pid=,ppid=,rss=,%cpu='], 3000);
  if (!text) return (panes || []).map((pane) => ({ id: pane.id, found: Boolean(pane.pid), cpuPct: null, rssBytes: null, pids: pane.pid ? null : 0 }));
  return areasFromPs(panes, parsePs(text));
}

function fmtBytes(bytes) {
  if (bytes == null) return 'unavailable';
  const gb = bytes / GB;
  if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
  return `${Math.round(bytes / (1024 ** 2))} MB`;
}

function judge(snap, limits) {
  const crossed = [];
  const mem = snap.memory;
  if (mem?.status === 'ok' && mem.availableBytes != null && mem.totalBytes > 0) {
    const pct = (100 * mem.availableBytes) / mem.totalBytes;
    if (pct < limits.memoryAvailablePct) {
      crossed.push({ id: 'memory', words: `memory available ${Math.round(pct)}% (${fmtBytes(mem.availableBytes)} of ${fmtBytes(mem.totalBytes)}), under ${limits.memoryAvailablePct}%` });
    }
  }
  if (mem?.swapTotalBytes > 0 && mem.swapUsedBytes != null) {
    const pct = (100 * mem.swapUsedBytes) / mem.swapTotalBytes;
    const availablePct = mem.totalBytes > 0 && mem.availableBytes != null ? (100 * mem.availableBytes) / mem.totalBytes : null;
    const memoryLow = availablePct != null && availablePct < limits.memoryAvailablePct;
    const nearFull = pct >= limits.swapFullPct;
    // Occupancy alone is normal on Linux. Count it when memory is also low, or when swap is near full.
    if (nearFull || (memoryLow && pct >= limits.swapUsedPct)) {
      const words = nearFull
        ? `swap ${Math.round(pct)}% used, near full (at or over ${limits.swapFullPct}%)`
        : `swap ${Math.round(pct)}% used while available memory is under ${limits.memoryAvailablePct}%`;
      crossed.push({ id: 'swap', words });
    }
  }
  const seen = new Set();
  for (const disk of snap.disks || []) {
    if (disk.status !== 'ok' || disk.freeBytes == null) continue;
    const key = disk.mount || disk.path;
    if (seen.has(key)) continue;
    seen.add(key);
    const freeGb = disk.freeBytes / GB;
    const lowPct = disk.freePct != null && disk.freePct < limits.diskFreePct;
    const lowGb = freeGb < limits.diskFreeGb;
    if (!lowPct && !lowGb) continue;
    const labels = snap.disks.filter((row) => row.status === 'ok' && (row.mount || row.path) === key).map((row) => row.label).join(', ');
    const pct = disk.freePct == null ? '' : ` (${Math.round(disk.freePct)}%)`;
    crossed.push({ id: `disk:${key}`, words: `${labels} on ${key}: ${fmtBytes(disk.freeBytes)} free${pct}, under ${limits.diskFreeGb} GB or ${limits.diskFreePct}%` });
  }
  const readings = snap.temps?.readings || [];
  const cpuish = readings.filter((r) => isCpuName(r.name));
  const pool = cpuish.length ? cpuish : readings;
  if (pool.length) {
    const hot = pool.reduce((a, b) => (b.celsius > a.celsius ? b : a));
    if (hot.celsius >= limits.cpuTempC) {
      crossed.push({ id: 'temp', words: `${hot.name} ${hot.celsius}°C, at or over ${limits.cpuTempC}°C` });
    }
  }
  const battery = snap.battery;
  if (battery?.present && battery.percent != null && battery.percent <= limits.batteryPct && battery.state !== 'charging' && battery.state !== 'full') {
    const how = battery.state === 'discharging' ? ' and discharging' : '';
    crossed.push({ id: 'battery', words: `battery ${battery.percent}%${how}, at or under ${limits.batteryPct}%` });
  } else if (battery?.present && battery.state === 'discharging' && battery.minutesRemaining != null && battery.minutesRemaining <= limits.batteryMinutes) {
    crossed.push({ id: 'battery', words: `battery discharging with about ${battery.minutesRemaining} min left, at or under ${limits.batteryMinutes} min` });
  }
  if (snap.cpu?.load1 != null && snap.cpu.cores) {
    const per = snap.cpu.load1 / snap.cpu.cores;
    if (per >= limits.loadPerCore) {
      crossed.push({ id: 'load', words: `load ${snap.cpu.load1} on ${snap.cpu.cores} cores (${Math.round(per * 10) / 10} per core), at or over ${limits.loadPerCore}` });
    }
  }
  return crossed;
}

function verdictOf(crossed, battery) {
  const onBattery = battery?.present && battery.state === 'discharging';
  if (!crossed.length && onBattery) {
    const left = battery.minutesRemaining == null ? 'time left unavailable' : `about ${battery.minutesRemaining} min left`;
    const pct = battery.percent == null ? 'unknown %' : `${battery.percent}%`;
    return `ok: on battery at ${pct}, ${left}; nothing crossed the suggested limits`;
  }
  if (!crossed.length) return 'ok: nothing crossed the suggested limits';
  return `tight: ${crossed.map((row) => row.words).join('; ')}`;
}

export function formatHealth(snap) {
  const lines = [snap.verdict];
  const cpu = snap.cpu || {};
  const load = cpu.load1 == null ? 'load unavailable' : `load ${cpu.load1} ${cpu.load5} ${cpu.load15}`;
  const usage = cpu.usagePct == null ? 'usage unavailable' : `usage ${cpu.usagePct}%`;
  lines.push(`cpu  ${load}  ${cpu.cores ?? '?'} cores  ${usage}${snap.wsl ? '  wsl' : ''}`);
  const mem = snap.memory;
  if (!mem || mem.status !== 'ok') lines.push('mem  unavailable');
  else {
    const swap = mem.swapTotalBytes == null ? 'swap unavailable' : mem.swapTotalBytes === 0 ? 'swap none' : `swap ${fmtBytes(mem.swapUsedBytes)} / ${fmtBytes(mem.swapTotalBytes)}`;
    lines.push(`mem  ${fmtBytes(mem.usedBytes)} used / ${fmtBytes(mem.totalBytes)}  available ${fmtBytes(mem.availableBytes)} (${mem.availablePct ?? '?'}%)  ${swap}`);
  }
  for (const disk of snap.disks || []) {
    if (disk.status !== 'ok') lines.push(`disk ${disk.label}  unavailable  ${disk.path}`);
    else lines.push(`disk ${disk.label}  ${disk.mount}  ${fmtBytes(disk.freeBytes)} free (${disk.freePct}%)  ${disk.path}`);
  }
  if (!snap.temps || snap.temps.status !== 'ok') lines.push('temp  unavailable');
  else lines.push(`temp  ${snap.temps.readings.map((r) => `${r.name} ${r.celsius}°C`).join('  ')}`);
  const battery = snap.battery || emptyBattery();
  if (!battery.present) lines.push('battery  none');
  else {
    const left = battery.minutesRemaining == null ? 'time unavailable' : `${battery.minutesRemaining} min left`;
    lines.push(`battery  ${battery.percent ?? '?'}%  ${battery.state}  ${left}`);
  }
  if (!snap.areas?.length) lines.push('areas  none');
  for (const area of snap.areas || []) {
    if (!area.found) lines.push(`area ${area.id}  window not found`);
    else if (area.cpuPct == null && area.rssBytes == null) lines.push(`area ${area.id}  unavailable`);
    else lines.push(`area ${area.id}  cpu ${area.cpuPct ?? '?'}%  rss ${fmtBytes(area.rssBytes)}  ${area.pids ?? '?'} procs`);
  }
  return lines.join('\n');
}

export function fleetHealth(c = {}, opt = {}) {
  const platform = opt.platform || process.platform;
  const sysRoot = opt.sysRoot || '/';
  const limits = healthThresholds(c.health);
  const wsl = platform === 'linux' ? detectWsl(sysRoot, opt) : false;
  const cores = opt.cores ?? (os.cpus()?.length || null);
  const needsLinuxSample = platform === 'linux' && (opt.cpu == null || opt.areas == null);
  const sampled = needsLinuxSample ? linuxSample(sysRoot, opt) : null;
  const load = readLoad(platform, sysRoot);
  const cpu = opt.cpu ?? {
    load1: load[0],
    load5: load[1],
    load15: load[2],
    cores,
    usagePct: platform === 'linux'
      ? sampled?.usagePct ?? null
      : (opt.sampleMs === 0 ? null : cpuUsagePct(cpuTimes(), (pause(opt.sampleMs ?? 200), cpuTimes()))),
  };
  const memory = opt.memory
    ? withMemoryPct(opt.memory.status === 'unavailable' ? null : opt.memory)
    : platform === 'linux' ? readLinuxMemory(sysRoot)
    : platform === 'darwin' ? readDarwinMemory()
    : readGenericMemory();
  const disks = opt.disks ?? readDisks(c, platform, opt);
  const temps = opt.temps ?? (platform === 'linux' ? readLinuxTemps(sysRoot) : { status: 'unavailable', readings: [] });
  const battery = opt.battery ?? (
    platform === 'linux' ? readLinuxBattery(sysRoot)
    : platform === 'darwin' ? readDarwinBattery()
    : platform === 'win32' ? readWindowsBattery()
    : emptyBattery()
  );
  let areas = opt.areas;
  if (areas == null) {
    const panes = listPanes(c, opt);
    if (platform === 'linux' && sampled && (sampled.before.length || sampled.after.length || opt.procSamples || opt.sampleMs === 0)) {
      areas = areasFromTree(panes, sampled.before, sampled.after, sampled.elapsedMs, opt.hz ?? userHz());
    } else if (platform === 'linux' && opt.sampleMs !== 0) {
      areas = areasFromTree(panes, sampled?.before || [], sampled?.after || [], sampled?.elapsedMs || 0, opt.hz ?? userHz());
      if (areas.every((a) => !a.found) && panes.some((p) => p.pid) && !opt.procSamples) areas = readPsAreas(panes, opt);
    } else {
      areas = readPsAreas(panes, opt);
    }
  }
  const snap = {
    at: opt.at || new Date().toISOString(),
    platform,
    wsl,
    cpu,
    memory,
    disks,
    temps,
    battery,
    areas,
    thresholds: limits,
  };
  snap.crossed = judge(snap, limits);
  snap.verdict = verdictOf(snap.crossed, snap.battery);
  return snap;
}
