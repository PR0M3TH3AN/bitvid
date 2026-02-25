import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTorchConfig } from './torch-config.mjs';

const defaultDeps = {
  fs,
  loadTorchConfig,
};

const deps = { ...defaultDeps };

/** @internal */
export function _setRosterDependencies(overrides) {
  Object.assign(deps, overrides);
}

/** @internal */
export function _restoreRosterDependencies() {
  Object.assign(deps, defaultDeps);
}

const ROSTER_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'prompts/roster.json');
const USER_ROSTER_FILE = path.resolve(process.cwd(), 'torch/roster.json');
const CWD_ROSTER_FILE = path.resolve(process.cwd(), 'roster.json');

const FALLBACK_ROSTER = {
  daily: [
    'audit-agent',
    'ci-health-agent',
    'const-refactor-agent',
    'content-audit-agent',
    'decompose-agent',
    'deps-security-agent',
    'design-system-audit-agent',
    'docs-agent',
    'docs-alignment-agent',
    'docs-code-investigator',
    'innerhtml-migration-agent',
    'known-issues-agent',
    'load-test-agent',
    'onboarding-audit-agent',
    'perf-agent',
    'prompt-curator-agent',
    'protocol-research-agent',
    'scheduler-update-agent',
    'style-agent',
    'test-audit-agent',
    'todo-triage-agent',
  ],
  weekly: [
    'bug-reproducer-agent',
    'changelog-agent',
    'dead-code-agent',
    'event-schema-agent',
    'frontend-console-debug-agent',
    'fuzz-agent',
    'interop-agent',
    'perf-deepdive-agent',
    'perf-optimization-agent',
    'pr-review-agent',
    'race-condition-agent',
    'refactor-agent',
    'smoke-agent',
    'telemetry-agent',
    'test-coverage-agent',
    'weekly-synthesis-agent',
  ],
};

let cachedCanonicalRoster = null;

function loadCanonicalRoster() {
  if (cachedCanonicalRoster) return cachedCanonicalRoster;

  let rosterPath = ROSTER_FILE;

  // Prefer user-managed roster if present
  if (deps.fs.existsSync(USER_ROSTER_FILE)) {
    rosterPath = USER_ROSTER_FILE;
  } else if (deps.fs.existsSync(CWD_ROSTER_FILE)) {
    rosterPath = CWD_ROSTER_FILE;
  }

  try {
    const parsed = JSON.parse(deps.fs.readFileSync(rosterPath, 'utf8'));
    const daily = Array.isArray(parsed.daily) ? parsed.daily.map((item) => String(item).trim()).filter(Boolean) : [];
    const weekly = Array.isArray(parsed.weekly)
      ? parsed.weekly.map((item) => String(item).trim()).filter(Boolean)
      : [];

    if (daily.length > 0 && weekly.length > 0) {
      cachedCanonicalRoster = { daily, weekly };
      return cachedCanonicalRoster;
    }

    console.error(`WARNING: Roster file is missing daily/weekly entries, falling back: ${rosterPath}`);
  } catch {
    // It's okay if roster file is missing when used as a library/CLI without the file present
  }

  cachedCanonicalRoster = FALLBACK_ROSTER;
  return cachedCanonicalRoster;
}

/** @internal */
export function _resetRosterCache() {
  cachedCanonicalRoster = null;
}

function parseEnvRoster(value) {
  if (!value) return null;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getRoster(cadence) {
  const config = await deps.loadTorchConfig();
  const dailyFromEnv = parseEnvRoster(process.env.NOSTR_LOCK_DAILY_ROSTER);
  const weeklyFromEnv = parseEnvRoster(process.env.NOSTR_LOCK_WEEKLY_ROSTER);
  const canonical = loadCanonicalRoster();
  const dailyFromConfig = config.nostrLock.dailyRoster;
  const weeklyFromConfig = config.nostrLock.weeklyRoster;

  if (cadence === 'daily') {
    if (dailyFromEnv && dailyFromEnv.length) return dailyFromEnv;
    if (dailyFromConfig && dailyFromConfig.length) return dailyFromConfig;
    return canonical.daily;
  }

  if (weeklyFromEnv && weeklyFromEnv.length) return weeklyFromEnv;
  if (weeklyFromConfig && weeklyFromConfig.length) return weeklyFromConfig;
  return canonical.weekly;
}
