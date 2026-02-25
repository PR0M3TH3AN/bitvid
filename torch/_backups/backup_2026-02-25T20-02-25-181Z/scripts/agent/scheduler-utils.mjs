import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'Path', // Windows compatibility
  'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'SystemRoot', 'windir', 'ComSpec', 'PATHEXT',
  'TMPDIR', 'TEMP', 'TMP',
  'EDITOR', 'VISUAL',
  // CI variables
  'CI', 'GITHUB_ACTIONS', 'GITHUB_REF', 'GITHUB_HEAD_REF', 'GITHUB_BASE_REF', 'GITHUB_EVENT_NAME', 'GITHUB_SHA',
]);

export function getSafeEnv() {
  const safeEnv = {};
  for (const key in process.env) {
    if (ALLOWED_ENV_KEYS.has(key) ||
        key.startsWith('npm_') ||
        key.startsWith('NOSTR_') ||
        key.startsWith('TORCH_') ||
        key.startsWith('SCHEDULER_') ||
        key.startsWith('AGENT_') ||
        key.startsWith('JULES_') ||
        key.startsWith('CODEX_') ||
        key.startsWith('CLAUDE_') ||
        key.startsWith('ANTHROPIC_') ||
        key.startsWith('GOOSE_')) {
      safeEnv[key] = process.env[key];
    }
  }
  return safeEnv;
}

/**
 * Spawns a child process with a sanitized environment by default.
 * @param {string} command
 * @param {string[]} args
 * @param {object} options
 * @param {object} [options.env] - Additional environment variables to merge.
 * @param {boolean} [options.inheritProcessEnv=false] - If true, use full process.env. If false (default), use sanitized env.
 */
export async function runCommand(command, args = [], options = {}) {
  const baseEnv = options.inheritProcessEnv ? process.env : getSafeEnv();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...baseEnv, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const OUTPUT_LIMIT = 20000; // 20KB
    let stdoutWritten = 0;
    let stderrWritten = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;

      if (stdoutWritten < OUTPUT_LIMIT) {
        const remaining = OUTPUT_LIMIT - stdoutWritten;
        if (text.length <= remaining) {
          process.stdout.write(text);
          stdoutWritten += text.length;
        } else {
          process.stdout.write(text.slice(0, remaining));
          stdoutWritten += remaining;
        }
      } else if (!stdoutTruncated) {
        process.stdout.write('\n...[stdout truncated]...\n');
        stdoutTruncated = true;
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;

      if (stderrWritten < OUTPUT_LIMIT) {
        const remaining = OUTPUT_LIMIT - stderrWritten;
        if (text.length <= remaining) {
          process.stderr.write(text);
          stderrWritten += text.length;
        } else {
          process.stderr.write(text.slice(0, remaining));
          stderrWritten += remaining;
        }
      } else if (!stderrTruncated) {
        process.stderr.write('\n...[stderr truncated]...\n');
        stderrTruncated = true;
      }
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function parseJsonFromOutput(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith('{') && !line.startsWith('[')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning from the end.
    }
  }
  return null;
}

export function parseJsonEventsFromOutput(text) {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        events.push(parsed);
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }
  return events;
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function normalizeStringList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

export function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
}

export function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function redactSensitive(text) {
  if (!text) return '';
  return String(text)
    .replace(/\b(BEARER\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/\b(token|api[_-]?key|secret(?:[_-]?key)?|password|passwd|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b(sk|pk|ghp|xoxb|xoxp)_[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

export function excerptText(text, maxChars = 600) {
  const clean = redactSensitive(String(text || '').trim());
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars)}…`;
}

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const minutes = Math.round(ms / 60000);
  return `${minutes} minute(s)`;
}

export function getRunDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function toYamlScalar(value) {
  const str = String(value ?? '');
  return `'${str.replace(/'/g, "''")}'`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Time-window guard helpers
// Exported so they can be unit-tested independently of run-scheduler-cycle.mjs
// ---------------------------------------------------------------------------

/** Window sizes for the per-cadence duplicate-run guard. */
export const CADENCE_WINDOW_MS = {
  daily: 24 * 60 * 60 * 1000,      // 24 hours
  weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/** Parse a date string to milliseconds, or null if invalid. */
export function parseDateValue(value) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Returns true when a filename matches the canonical scheduler log pattern. */
export function isStrictSchedulerLogFilename(filename) {
  return /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)__[^_]+__(completed|failed)\.md$/.test(String(filename));
}

/** Extract agent name from a canonical log filename, or null. */
export function parseAgentFromFilename(filename) {
  const match = String(filename).match(/^.+__([^_]+?)__(completed|failed)\.md$/);
  return match?.[1] || null;
}

/** Extract the ISO timestamp embedded in a canonical log filename as ms, or null. */
export function parseTimestampFromFilename(filename) {
  const match = String(filename).match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)__[^_]+__(completed|failed)\.md$/);
  if (!match?.[1]) return null;
  const iso = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z');
  return parseDateValue(iso);
}

/** Read a single YAML frontmatter key from a markdown string, or null. */
export function parseFrontmatterValue(markdown, key) {
  const lines = String(markdown).split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const keyPattern = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i');
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '---') break;
    const match = line.match(keyPattern);
    if (match?.[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

/** Read `created_at` from YAML frontmatter. */
export function parseFrontmatterCreatedAt(markdown) {
  return parseFrontmatterValue(markdown, 'created_at');
}

/** Read `agent` from YAML frontmatter. */
export function parseFrontmatterAgent(markdown) {
  return parseFrontmatterValue(markdown, 'agent');
}

/**
 * Scans task-log files for a cadence and returns a Set of agent names that
 * completed or failed within the cadence's time window (24 h daily, 7 d weekly).
 *
 * This is the local-filesystem companion to the Nostr relay lock check.  It
 * catches the cross-midnight edge case where the relay's date-scoped lock has
 * rolled over but the agent ran less than a full window ago.
 *
 * Only `completed` and `failed` logs are considered.  `deferred` logs are
 * intentionally skipped so the scheduler retries lock-backend failures.
 *
 * Non-fatal: if the log directory cannot be read, an empty Set is returned.
 *
 * @param {string} logDir - Absolute or relative path to task-logs/<cadence>/.
 * @param {'daily'|'weekly'} cadence
 * @param {number} [now] - Current epoch ms (injectable for tests).
 * @returns {Promise<Set<string>>} Agent names that ran within the window.
 */
export async function buildRecentlyRunExclusionSet(logDir, cadence, now = Date.now()) {
  const windowMs = CADENCE_WINDOW_MS[cadence] ?? CADENCE_WINDOW_MS.daily;
  const cutoff = now - windowMs;
  const recentlyRun = new Set();

  let entries;
  try {
    await fs.mkdir(logDir, { recursive: true });
    entries = await fs.readdir(logDir, { withFileTypes: true });
  } catch {
    return recentlyRun;
  }

  const logFiles = entries
    .filter((e) => e.isFile() && isStrictSchedulerLogFilename(e.name))
    .map((e) => e.name);

  await Promise.all(logFiles.map(async (filename) => {
    const agentName = parseAgentFromFilename(filename);
    if (!agentName) return;

    // Prefer frontmatter created_at (more precise) over the filename timestamp.
    let effectiveMs = parseTimestampFromFilename(filename);
    try {
      const content = await fs.readFile(path.join(logDir, filename), 'utf8');
      const frontmatterMs = parseDateValue(parseFrontmatterCreatedAt(content));
      if (frontmatterMs !== null) effectiveMs = frontmatterMs;
    } catch {
      // Read failure: fall back to filename timestamp.
    }

    if (effectiveMs !== null && effectiveMs >= cutoff) {
      recentlyRun.add(agentName);
    }
  }));

  return recentlyRun;
}
