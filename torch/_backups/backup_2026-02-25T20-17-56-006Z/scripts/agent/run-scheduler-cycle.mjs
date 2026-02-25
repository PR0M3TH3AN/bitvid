#!/usr/bin/env node
/**
 * run-scheduler-cycle.mjs — TORCH Agent Scheduler
 *
 * Orchestrates one full scheduling cycle for a given cadence (daily|weekly).
 * Selects the next eligible agent from the roster, acquires a distributed Nostr
 * lock, executes the agent's prompt via a configured handoff command, verifies
 * required artifacts and memory evidence, then publishes completion.
 *
 * This script owns the full lifecycle for a single agent slot per invocation:
 * lock acquisition → prompt execution → artifact verification → lock:complete.
 * Spawned agents MUST NOT call lock:complete themselves.
 *
 * Main flow (mirrors src/prompts/scheduler-flow.md numbered MUST steps):
 *  1. Parse cadence (daily|weekly), platform, and model from CLI args.
 *  2. Load roster from src/prompts/roster.json.
 *  3. Read AGENTS.md policy file (best-effort, non-fatal if missing).
 *  4. [loop] Read cadence run-state (deferral tracking for the current UTC day).
 *  5. [loop] Optional lock health preflight — fail/defer if all relays unhealthy.
 *  6. [loop] Run lock:check to build the exclusion set (locked + paused + completed).
 *  7. [loop] Apply local time-window guard (24 h daily / 7 d weekly) to exclusion set.
 *  8. [loop] Round-robin select next eligible agent from roster minus exclusion set.
 *  9. [loop] If no agent eligible → exit (cycle-saturated or all-excluded).
 * 10. [loop] Acquire lock with retry. exit 3 → back to step 4; exit 2 → defer or fail.
 * 11. [loop] Validate prompt file (readable, correct format).
 * 12. [loop] Clear deferral state. Run memory retrieve command (if configured).
 * 13. [loop] Run handoff command — hard fail if missing or exits non-zero.
 * 14. [loop] Run memory store command (if configured).
 * 15. [loop] Verify memory evidence (markers/artifact files).
 * 16. [loop] Verify run artifacts via verify-run-artifacts.mjs.
 * 17. [loop] Run validation commands (default: npm run lint).
 * 18. [loop] Publish lock:complete — hard fail if relay error.
 * 19. [loop] Write completed task log and print run summary. Exit 0.
 *
 * Key invariants:
 *  - lock:complete is called ONLY after all validation gates pass (step 18 is last gate).
 *  - Completed task log is written ONLY after lock:complete succeeds.
 *  - Lock exit code 3 (race lost) causes a loop restart to pick the next agent.
 *  - Memory mode 'required' turns missing evidence into a hard failure.
 */
// Source of truth: numbered MUST steps 2 and 4-16 in src/prompts/scheduler-flow.md are
// implemented by this script; step 3 (policy-file read) is best-effort and non-fatal.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  runCommand,
  parseJsonFromOutput,
  readJson,
  normalizeStringList,
  parseNonNegativeInt,
  parseBooleanFlag,
  excerptText,
  getRunDateKey,
  toYamlScalar,
  buildRecentlyRunExclusionSet,
  parseDateValue,
  parseFrontmatterCreatedAt,
  parseFrontmatterAgent,
  parseTimestampFromFilename,
  isStrictSchedulerLogFilename,
  parseAgentFromFilename,
} from './scheduler-utils.mjs';

import {
  classifyLockBackendError,
  buildLockBackendRemediation,
  runLockHealthPreflight,
  acquireLockWithRetry,
  summarizeLockFailureReasons,
} from './scheduler-lock.mjs';

import { detectPlatform } from '../../src/utils.mjs';
import { getTorchConfigPath } from '../../src/torch-config.mjs';

const VALID_CADENCES = new Set(['daily', 'weekly']);
const ALL_EXCLUDED_REASON = 'All roster tasks currently claimed by other agents';
const FAILURE_CATEGORY = {
  PROMPT_PARSE: 'prompt_parse_error',
  PROMPT_SCHEMA: 'prompt_schema_error',
  LOCK_BACKEND: 'lock_backend_error',
  EXECUTION: 'execution_error',
};

/**
 * Parses CLI arguments into a structured options object.
 * Supports both positional cadence (`daily`|`weekly`) and named flags.
 * Falls back to AGENT_PLATFORM env var or auto-detected platform for platform.
 *
 * @param {string[]} argv - process.argv slice (args after the script name)
 * @returns {{ cadence: string|null, platform: string, model: string|null }}
 */
function parseArgs(argv) {
  const args = { cadence: null, platform: process.env.AGENT_PLATFORM || detectPlatform() || 'unknown', model: process.env.AGENT_MODEL || null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--') && !args.cadence) {
      args.cadence = value;
      continue;
    }
    if (value === '--cadence') {
      args.cadence = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (value === '--platform') {
      args.platform = argv[i + 1] || args.platform;
      i += 1;
    }
    if (value === '--model') {
      args.model = argv[i + 1] || args.model;
      i += 1;
    }
  }
  return args;
}

/**
 * Returns an ISO 8601 timestamp string safe for use as a filename component.
 * Colons are replaced with dashes and milliseconds are stripped.
 * Example output: `2026-02-20T07-00-00Z`
 *
 * @returns {string}
 */
function ts() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/**
 * Builds a metadata object that includes a standardized `failure_category` field.
 * Used by writeLog() to attach structured failure classification to task logs.
 *
 * @param {string} failureCategory - One of FAILURE_CATEGORY values (e.g. 'lock_backend_error').
 * @param {Object} [extraMetadata={}] - Additional key/value pairs to merge.
 * @returns {Object}
 */
function categorizeFailureMetadata(failureCategory, extraMetadata = {}) {
  return {
    failure_category: failureCategory,
    ...extraMetadata,
  };
}

/**
 * Validates that a prompt file is readable and contains a valid markdown heading
 * or blockquote as its first non-empty line.
 *
 * This is a lightweight schema check — it does not parse frontmatter or validate
 * the full prompt contract (that is handled by validate-prompt-contract.mjs).
 *
 * @param {string} promptPath - Absolute path to the prompt markdown file.
 * @returns {Promise<{ok: true}|{ok: false, category: string, reason: string, detail: string}>}
 */
async function validatePromptFile(promptPath) {
  let content;
  try {
    content = await fs.readFile(promptPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      category: FAILURE_CATEGORY.PROMPT_PARSE,
      reason: 'Prompt file parse/read failed',
      detail: `Prompt not executed; unable to read prompt file at ${promptPath}: ${error.message}`,
    };
  }

  const lines = String(content).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || '';
  if (!firstLine.startsWith('#') && !firstLine.startsWith('>')) {
    return {
      ok: false,
      category: FAILURE_CATEGORY.PROMPT_SCHEMA,
      reason: 'Prompt file schema validation failed',
      detail: `Prompt not executed; expected markdown heading or blockquote on first non-empty line in ${promptPath}.`,
    };
  }

  return { ok: true };
}

/**
 * Checks whether a file exists and was modified at or after `sinceMs`.
 * Used to verify that memory evidence artifacts were produced during the current run.
 *
 * @param {string|null} filePath - Relative or absolute path to check.
 * @param {number} sinceMs - Epoch milliseconds threshold (run start time).
 * @returns {Promise<boolean>}
 */
async function artifactExistsSince(filePath, sinceMs) {
  if (!filePath) return false;
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  try {
    const stat = await fs.stat(resolved);
    return stat.isFile() && stat.mtimeMs >= sinceMs;
  } catch {
    return false;
  }
}

/**
 * Verifies that a memory pipeline step (retrieve or store) produced observable evidence.
 * Evidence can be either a deterministic output marker string OR a qualifying artifact file.
 * A step is considered complete when either form of evidence is present.
 *
 * @param {Object} params
 * @param {string} params.name - Step name ('retrieve'|'store') for logging.
 * @param {string[]} params.markers - Substrings to search for in combined command output.
 * @param {string[]} params.artifacts - Relative paths of artifact files to check.
 * @param {string} params.outputText - Combined stdout+stderr from all commands this run.
 * @param {number} params.sinceMs - Run start epoch ms; artifact files must be newer.
 * @returns {Promise<{name: string, markerMatched: boolean, artifactMatched: boolean, complete: boolean}>}
 */
async function verifyMemoryStep({ name, markers, artifacts, outputText, sinceMs }) {
  const markerMatched = markers.some((marker) => outputText.includes(marker));
  const artifactResults = await Promise.all(artifacts.map((artifact) => artifactExistsSince(artifact, sinceMs)));
  const artifactMatched = artifactResults.some(Boolean);

  return {
    name,
    markerMatched,
    artifactMatched,
    complete: markerMatched || artifactMatched,
  };
}


/**
 * Finds the most recent valid scheduler task log file in `logDir`.
 * "Valid" means the filename passes isStrictSchedulerLogFilename() AND the file
 * contains a parseable timestamp (from frontmatter created_at or the filename itself).
 *
 * Files with unparseable timestamps are skipped with a console warning.
 * The effective timestamp for sorting is derived from frontmatter first, then filename.
 *
 * @param {string} logDir - Absolute path to the cadence log directory (e.g. task-logs/daily/).
 * @returns {Promise<string|null>} Filename (not path) of the latest log, or null if none.
 */
async function getLatestFile(logDir) {
  await fs.mkdir(logDir, { recursive: true });
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((filename) => isStrictSchedulerLogFilename(filename))
    .sort((a, b) => b.localeCompare(a));

  const results = await Promise.all(
    files.map(async (filename) => {
      const filePath = path.join(logDir, filename);
      const content = await fs.readFile(filePath, 'utf8').catch(() => '');
      const createdAtMs = parseDateValue(parseFrontmatterCreatedAt(content));
      const fileTimestampMs = parseTimestampFromFilename(filename);
      const effectiveMs = createdAtMs ?? fileTimestampMs;

      if (!effectiveMs) {
        console.warn(`[scheduler] Ignoring invalid log timestamp in ${filename}; checking next candidate.`);
        return null;
      }
      return { filename, effectiveMs };
    }),
  );

  let latest = null;

  for (const result of results) {
    if (!result) continue;
    if (!latest || result.effectiveMs > latest.effectiveMs) {
      latest = result;
    }
  }

  return latest?.filename || null;
}

/**
 * Selects the next eligible agent from the roster using round-robin scheduling.
 *
 * Selection algorithm:
 *  - If `previousAgent` is in the roster, start scanning from the next index (wrap-around).
 *  - Otherwise, start from `firstPrompt` index (if configured) or index 0.
 *  - Returns the first candidate not present in `excludedSet`.
 *  - Returns null if every roster agent is excluded.
 *
 * @param {Object} params
 * @param {string[]} params.roster - Ordered array of agent names for this cadence.
 * @param {Set<string>} params.excludedSet - Agents to skip (locked, paused, completed, time-excluded).
 * @param {string|null} params.previousAgent - Agent that ran most recently (from latest log).
 * @param {string|null} params.firstPrompt - Configured first-run starting agent name.
 * @returns {string|null} Selected agent name, or null if roster is fully excluded.
 */
function selectNextAgent({ roster, excludedSet, previousAgent, firstPrompt }) {
  const previousIndex = roster.indexOf(previousAgent);
  const firstIndex = roster.indexOf(firstPrompt);
  const startIndex = previousIndex >= 0
    ? (previousIndex + 1) % roster.length
    : (firstIndex >= 0 ? firstIndex : 0);

  for (let offset = 0; offset < roster.length; offset += 1) {
    const candidate = roster[(startIndex + offset) % roster.length];
    if (!excludedSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Loads and normalizes scheduler configuration for the given cadence.
 * Merges torch-config.json settings with environment variable overrides.
 *
 * Configuration covers:
 *  - handoffCommand: shell command to execute the selected agent's prompt.
 *  - validationCommands: commands that must pass before lock:complete (default: npm run lint).
 *  - lockRetry: maxRetries, backoffMs, jitterMs for lock acquisition retries.
 *  - lockHealthPreflight: whether to probe relay health before lock acquisition.
 *  - lockFailurePolicy: strictLock, degradedLockRetryWindowMs, maxDeferrals.
 *  - memoryPolicy: mode (required|optional), retrieve/store commands, markers, artifacts.
 *
 * Environment variable overrides (all optional):
 *  SCHEDULER_LOCK_MAX_RETRIES, SCHEDULER_LOCK_BACKOFF_MS, SCHEDULER_LOCK_JITTER_MS,
 *  SCHEDULER_LOCK_HEALTH_PREFLIGHT, SCHEDULER_SKIP_LOCK_HEALTH_PREFLIGHT,
 *  SCHEDULER_STRICT_LOCK, SCHEDULER_DEGRADED_LOCK_RETRY_WINDOW_MS, SCHEDULER_MAX_DEFERRALS
 *
 * @param {string} cadence - 'daily'|'weekly'
 * @param {{ isInteractive: boolean }} options
 * @returns {Promise<Object>} Normalized scheduler config object.
 */
async function getSchedulerConfig(cadence, { isInteractive }) {
  const configPath = getTorchConfigPath();
  const cfg = await readJson(configPath, {});
  const configDir = path.dirname(configPath);
  const runtimeDir = process.cwd();

  const resolveNodeCommand = (command) => {
    if (typeof command !== 'string') return command;
    const trimmed = command.trim();
    if (!trimmed.startsWith('node ')) return trimmed;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return trimmed;
    const scriptArg = parts[1];
    if (!scriptArg || scriptArg.startsWith('-') || path.isAbsolute(scriptArg)) return trimmed;
    const absoluteScriptPath = path.resolve(configDir, scriptArg);
    if (!fsSync.existsSync(absoluteScriptPath)) return trimmed;
    const rewrittenScriptPath = path.relative(runtimeDir, absoluteScriptPath).split(path.sep).join('/');
    if (!rewrittenScriptPath || rewrittenScriptPath.startsWith('..')) return trimmed;
    parts[1] = rewrittenScriptPath;
    return parts.join(' ');
  };

  const scheduler = cfg.scheduler || {};
  const defaultHandoffCommand = resolveNodeCommand('node scripts/agent/run-selected-prompt.mjs');
  const handoffCommandRaw = scheduler.handoffCommandByCadence?.[cadence] || defaultHandoffCommand;
  const handoffCommand = resolveNodeCommand(handoffCommandRaw);
  const missingHandoffCommandForMode = !isInteractive && !handoffCommand;
  const memoryPolicyRaw = scheduler.memoryPolicyByCadence?.[cadence] || {};
  const mode = memoryPolicyRaw.mode === 'required' ? 'required' : 'optional';
  const lockRetryRaw = scheduler.lockRetry || {};
  const maxRetries = parseNonNegativeInt(
    process.env.SCHEDULER_LOCK_MAX_RETRIES,
    parseNonNegativeInt(lockRetryRaw.maxRetries, 2),
  );
  const backoffMs = parseNonNegativeInt(
    process.env.SCHEDULER_LOCK_BACKOFF_MS,
    parseNonNegativeInt(lockRetryRaw.backoffMs, 250),
  );
  const jitterMs = parseNonNegativeInt(
    process.env.SCHEDULER_LOCK_JITTER_MS,
    parseNonNegativeInt(lockRetryRaw.jitterMs, 75),
  );
  const lockHealthPreflightFromConfig = parseBooleanFlag(scheduler.lockHealthPreflight, false);
  const lockHealthPreflightEnabled = parseBooleanFlag(
    process.env.SCHEDULER_LOCK_HEALTH_PREFLIGHT,
    lockHealthPreflightFromConfig,
  );
  const lockHealthPreflightSkip = parseBooleanFlag(process.env.SCHEDULER_SKIP_LOCK_HEALTH_PREFLIGHT, false);
  const strictLock = parseBooleanFlag(
    process.env.SCHEDULER_STRICT_LOCK,
    parseBooleanFlag(scheduler.strict_lock, true),
  );
  const degradedLockRetryWindowMs = parseNonNegativeInt(
    process.env.SCHEDULER_DEGRADED_LOCK_RETRY_WINDOW_MS,
    parseNonNegativeInt(scheduler.degraded_lock_retry_window, 3600000),
  );
  const maxDeferrals = parseNonNegativeInt(
    process.env.SCHEDULER_MAX_DEFERRALS,
    parseNonNegativeInt(scheduler.max_deferrals, 3),
  );

  return {
    firstPrompt: scheduler.firstPromptByCadence?.[cadence] || null,
    handoffCommand,
    missingHandoffCommandForMode,
    validationCommands: Array.isArray(scheduler.validationCommandsByCadence?.[cadence])
      ? scheduler.validationCommandsByCadence[cadence].filter((cmd) => typeof cmd === 'string' && cmd.trim())
      : ['npm run lint'],
    lockRetry: {
      maxRetries,
      backoffMs,
      jitterMs,
    },
    lockHealthPreflight: {
      enabled: lockHealthPreflightEnabled,
      skip: lockHealthPreflightSkip,
    },
    lockFailurePolicy: {
      strictLock,
      degradedLockRetryWindowMs,
      maxDeferrals,
    },
    memoryPolicy: {
      mode,
      retrieveCommand: typeof memoryPolicyRaw.retrieveCommand === 'string' && memoryPolicyRaw.retrieveCommand.trim()
        ? resolveNodeCommand(memoryPolicyRaw.retrieveCommand.trim())
        : null,
      storeCommand: typeof memoryPolicyRaw.storeCommand === 'string' && memoryPolicyRaw.storeCommand.trim()
        ? resolveNodeCommand(memoryPolicyRaw.storeCommand.trim())
        : null,
      retrieveSuccessMarkers: normalizeStringList(memoryPolicyRaw.retrieveSuccessMarkers, ['MEMORY_RETRIEVED']),
      storeSuccessMarkers: normalizeStringList(memoryPolicyRaw.storeSuccessMarkers, ['MEMORY_STORED']),
      retrieveArtifacts: normalizeStringList(memoryPolicyRaw.retrieveArtifacts),
      storeArtifacts: normalizeStringList(memoryPolicyRaw.storeArtifacts),
    },
  };
}

/**
 * Reads persisted scheduler run-state for the current UTC day.
 * Run-state is used to track lock deferral metadata across multiple invocations
 * within the same day (e.g., retry window tracking for non-strict lock failures).
 *
 * If the state file is missing, unreadable, or belongs to a previous day, returns
 * a fresh default state. State is keyed by `run_date` (YYYY-MM-DD UTC).
 *
 * @param {string} cadence - 'daily'|'weekly'
 * @returns {Promise<{ statePath: string, state: { run_date: string, lock_deferral: Object|null } }>}
 */
async function readRunState(cadence) {
  const statePath = path.resolve(process.cwd(), 'task-logs', cadence, '.scheduler-run-state.json');
  const fallback = { run_date: getRunDateKey(), lock_deferral: null };
  const raw = await readJson(statePath, fallback);
  if (!raw || typeof raw !== 'object') {
    return { statePath, state: fallback };
  }

  if (raw.run_date !== getRunDateKey()) {
    return { statePath, state: fallback };
  }

  return {
    statePath,
    state: {
      run_date: raw.run_date,
      lock_deferral: raw.lock_deferral && typeof raw.lock_deferral === 'object' ? raw.lock_deferral : null,
    },
  };
}

/**
 * Persists scheduler run-state to disk (JSON file).
 * Creates parent directories if they do not exist.
 *
 * @param {string} statePath - Absolute path to the state file.
 * @param {Object} state - State object to serialize.
 * @returns {Promise<void>}
 */
async function writeRunState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Generates a unique idempotency key for a deferred lock attempt.
 * The key is stable across retries for the same agent/cadence/date combination
 * by being stored in run-state and reused on subsequent invocations.
 *
 * @param {{ cadence: string, selectedAgent: string, runDate: string }} params
 * @returns {string}
 */
function createIdempotencyKey({ cadence, selectedAgent, runDate }) {
  return `${cadence}:${selectedAgent}:${runDate}:${randomUUID()}`;
}

/**
 * Writes a task log file to `task-logs/<cadence>/` with YAML frontmatter.
 * File naming: `<ts>__<agent>__<status>.md`
 *
 * The frontmatter includes cadence, agent, status, reason, created_at, platform,
 * and any additional metadata fields. The file body repeats key fields as bullets
 * for human readability.
 *
 * These files are read by getLatestFile(), cmdCheck(), and the dashboard.
 *
 * @param {{ cadence: string, agent: string, status: string, reason: string,
 *           detail?: string, platform?: string, metadata?: Object }} params
 * @returns {Promise<string>} The filename (not full path) of the written log.
 */
async function writeLog({ cadence, agent, status, reason, detail, platform, metadata = {} }) {
  const logDir = path.resolve(process.cwd(), 'task-logs', cadence);
  await fs.mkdir(logDir, { recursive: true });
  const file = `${ts()}__${agent}__${status}.md`;
  const mergedMetadata = {
    platform: platform || process.env.AGENT_PLATFORM || 'unknown',
    ...metadata,
  };

  const body = [
    '---',
    `cadence: ${cadence}`,
    `agent: ${agent}`,
    `status: ${status}`,
    `reason: ${toYamlScalar(reason)}`,
    detail ? `detail: ${toYamlScalar(detail)}` : null,
    `created_at: ${new Date().toISOString()}`,
    `timestamp: ${new Date().toISOString()}`,
    ...Object.entries(mergedMetadata)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}: ${toYamlScalar(value)}`),
    '---',
    '',
    `# Scheduler ${status}`,
    '',
    `- reason: ${reason}`,
    detail ? `- detail: ${detail}` : null,
    ...Object.entries(mergedMetadata)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `- ${key}: ${value}`),
    '',
  ].filter(Boolean).join('\n');
  await fs.writeFile(path.join(logDir, file), body, 'utf8');
  return file;
}

/**
 * Prints a human-readable run summary to stdout.
 * Includes status, agent, prompt path, platform, reason, and the contents of
 * the memory update file (up to 2000 characters, truncated if longer).
 *
 * @param {{ status: string, agent: string, promptPath: string|null, reason: string,
 *           detail?: string, memoryFile?: string, platform: string }} params
 * @returns {Promise<void>}
 */
async function printRunSummary({ status, agent, promptPath, reason, detail, memoryFile, platform }) {
  let learnings = 'No learnings recorded.';
  if (memoryFile) {
    try {
      const content = await fs.readFile(memoryFile, 'utf8');
      if (content.trim()) {
        learnings = content.trim();
        if (learnings.length > 2000) {
          learnings = learnings.slice(0, 2000) + '\n... (truncated)';
        }
      }
    } catch {
      // ignore read errors
    }
  }

  process.stdout.write('\n================================================================================\n');
  process.stdout.write('Scheduler Run Summary\n');
  process.stdout.write('================================================================================\n');
  process.stdout.write(`Status:    ${status}\n`);
  process.stdout.write(`Agent:     ${agent}\n`);
  process.stdout.write(`Prompt:    ${promptPath || '(none)'}\n`);
  process.stdout.write(`Platform:  ${platform}\n`);
  process.stdout.write(`Reason:    ${reason}\n`);
  if (detail) {
    process.stdout.write(`Detail:    ${detail}\n`);
  }
  process.stdout.write('\nLearnings / Discoveries:\n');
  process.stdout.write(`${learnings}\n`);
  process.stdout.write('================================================================================\n\n');
}

/**
 * Prints the run summary then terminates the process with the given exit code.
 * All normal and failure exit paths in main() go through this function to ensure
 * a summary is always printed before exit.
 *
 * @param {number} code - Exit code (0 = success, 1 = general failure, 2 = backend error).
 * @param {Object|null} summaryData - Data passed to printRunSummary, or null to skip.
 * @returns {Promise<never>}
 */
async function exitWithSummary(code, summaryData) {
  if (summaryData) {
    await printRunSummary(summaryData);
  }
  process.exit(code);
}

async function main() {
  const { cadence, platform, model } = parseArgs(process.argv.slice(2));
  if (!VALID_CADENCES.has(cadence)) {
    console.error('Usage: node scripts/agent/run-scheduler-cycle.mjs <daily|weekly>');
    process.exit(1);
  }

  const roster = (await readJson(path.resolve(process.cwd(), 'src/prompts/roster.json'), {}))[cadence] || [];
  if (!Array.isArray(roster) || roster.length === 0) {
    console.error(`No roster entries for cadence ${cadence}`);
    process.exit(1);
  }

  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const schedulerConfig = await getSchedulerConfig(cadence, { isInteractive });
  const logDir = path.resolve(process.cwd(), 'task-logs', cadence);

  const agentsPath = path.resolve(process.cwd(), 'AGENTS.md');
  try {
    const agentsContent = await fs.readFile(agentsPath, 'utf8');
    process.stdout.write(`${agentsContent}\n`);
  } catch {
    console.log('No AGENTS.md found; continuing');
  }

  while (true) {
    const { statePath: runStatePath, state: schedulerRunState } = await readRunState(cadence);

    if (schedulerConfig.lockHealthPreflight.enabled && !schedulerConfig.lockHealthPreflight.skip) {
      const preflight = await runLockHealthPreflight({ cadence, platform });
      if (preflight.code !== 0) {
        const allRelaysUnhealthy = Boolean(preflight.payload?.summary?.allRelaysUnhealthy);
        const incidentSignal = preflight.payload?.incidentSignal || null;
        await writeLog({
          cadence,
          agent: 'scheduler',
          status: allRelaysUnhealthy ? 'deferred' : 'failed',
          platform,
          reason: allRelaysUnhealthy
            ? 'All relays unhealthy preflight'
            : 'Lock backend unavailable preflight',
          detail: allRelaysUnhealthy
            ? `Deferred run before lock acquisition: ${incidentSignal?.reason || 'all relays unhealthy'}. Prompt not executed. ${buildLockBackendRemediation({ cadence, retryWindowMs: schedulerConfig.lockFailurePolicy.degradedLockRetryWindowMs, maxDeferrals: schedulerConfig.lockFailurePolicy.maxDeferrals, incidentSignalId: incidentSignal?.id || null })}`
            : `Preflight failed (${preflight.failureCategory}). Prompt not executed. ${buildLockBackendRemediation({ cadence, retryWindowMs: schedulerConfig.lockFailurePolicy.degradedLockRetryWindowMs, maxDeferrals: schedulerConfig.lockFailurePolicy.maxDeferrals, incidentSignalId: incidentSignal?.id || null })}`,
          metadata: {
            ...categorizeFailureMetadata(FAILURE_CATEGORY.LOCK_BACKEND, { failure_class: 'backend_unavailable' }),
            preflight_failure_category: preflight.failureCategory,
            relay_list: preflight.relayList.join(', ') || '(none)',
            preflight_stderr_excerpt: preflight.stderrExcerpt || '(empty)',
            preflight_stdout_excerpt: preflight.stdoutExcerpt || '(empty)',
            incident_signal_id: incidentSignal?.id || null,
            incident_signal_severity: incidentSignal?.severity || null,
            preflight_alerts: JSON.stringify(preflight.payload?.alerts || []),
            relay_health_history_path: preflight.payload?.historyPath || null,
          },
        });
        await exitWithSummary(allRelaysUnhealthy ? 0 : (preflight.code || 1), {
          status: allRelaysUnhealthy ? 'deferred' : 'failed',
          agent: 'scheduler',
          promptPath: null,
          reason: allRelaysUnhealthy ? 'All relays unhealthy preflight' : 'Lock backend unavailable preflight',
          platform,
        });
      }
    }

    // Step 6: Build exclusion set from relay state. Prefer the top-level `excluded`
    // field (computed by cmdCheck), falling back to the union of locked/paused/completed.
    const checkResult = await runCommand('npm', ['run', `lock:check:${cadence}`, '--', '--json', '--quiet']);
    const checkPayload = parseJsonFromOutput(`${checkResult.stdout}\n${checkResult.stderr}`) || {};
    const excluded = Array.isArray(checkPayload.excluded)
      ? checkPayload.excluded
      : [...new Set([
          ...(Array.isArray(checkPayload.locked) ? checkPayload.locked : []),
          ...(Array.isArray(checkPayload.paused) ? checkPayload.paused : []),
          ...(Array.isArray(checkPayload.completed) ? checkPayload.completed : []),
        ])];
    const excludedSet = new Set(excluded);

    // Time-window guard: exclude agents that already ran within the cadence window
    // (24 h for daily, 7 d for weekly). This catches the cross-midnight edge case
    // where the relay's date-scoped lock has rolled over but the run was recent.
    const windowLabel = cadence === 'weekly' ? '7-day' : '24-hour';
    const recentlyRunSet = await buildRecentlyRunExclusionSet(logDir, cadence);
    const newlyTimeExcluded = [...recentlyRunSet].filter((agent) => !excludedSet.has(agent));
    for (const agent of recentlyRunSet) {
      excludedSet.add(agent);
    }
    if (newlyTimeExcluded.length > 0) {
      console.log(`[scheduler] Time-window guard (${windowLabel}): ${newlyTimeExcluded.join(', ')} excluded — ran within window`);
    }

    const latestFile = await getLatestFile(logDir);
    let previousAgent = null;

    if (latestFile) {
      const latestPath = path.join(logDir, latestFile);
      const content = await fs.readFile(latestPath, 'utf8').catch(() => '');
      previousAgent = parseFrontmatterAgent(content) || parseAgentFromFilename(latestFile);
      if (!roster.includes(previousAgent)) {
        previousAgent = null;
      }
    }

    const selectedAgent = selectNextAgent({
      roster,
      excludedSet,
      previousAgent,
      firstPrompt: schedulerConfig.firstPrompt,
    });

    if (!selectedAgent) {
      // Cycle saturation: every roster agent has a recent local log within the
      // window. This is the expected steady state once a full rotation completes.
      // Exit 0 so the triggering process (cron, CI) does not treat it as an error.
      const allCycleSaturated = roster.every((agent) => recentlyRunSet.has(agent));
      if (allCycleSaturated) {
        const reason = `Cycle complete: all ${roster.length} agents ran within the ${windowLabel} window`;
        console.log(`[scheduler] ${reason}. Nothing to do.`);
        await exitWithSummary(0, {
          status: 'skipped',
          agent: 'scheduler',
          promptPath: null,
          reason,
          platform,
        });
      }

      await writeLog({
        cadence,
        agent: 'scheduler',
        status: 'failed',
        platform,
        reason: ALL_EXCLUDED_REASON,
      });
      await exitWithSummary(1, {
        status: 'failed',
        agent: 'scheduler',
        promptPath: null,
        reason: ALL_EXCLUDED_REASON,
        platform,
      });
    }

    const deferralForAgent = schedulerRunState.lock_deferral?.selected_agent === selectedAgent
      ? schedulerRunState.lock_deferral
      : null;

    const lockAttempt = await acquireLockWithRetry({
      selectedAgent,
      cadence,
      platform,
      model,
      lockRetry: schedulerConfig.lockRetry,
      idempotencyKey: deferralForAgent?.idempotency_key,
    });
    const lockResult = lockAttempt.result;

    // Lock exit 3: race lost — another agent claimed this slot between our check
    // and our publish. Restart the loop to pick the next available agent.
    if (lockResult.code === 3) {
      continue;
    }

    if (lockResult.code === 2) {
      const combinedLockOutput = `${lockResult.stderr}\n${lockResult.stdout}`;
      const diagnosticsSummary = summarizeLockFailureReasons(combinedLockOutput);
      const backendCategory = lockAttempt.finalBackendCategory || classifyLockBackendError(combinedLockOutput);
      const modelPart = model ? ` --model ${model}` : '';
      const lockCommand = `AGENT_PLATFORM=${platform} npm run lock:lock -- --agent ${selectedAgent} --cadence ${cadence}${modelPart}`;
      const stderrExcerpt = excerptText(lockResult.stderr);
      const stdoutExcerpt = excerptText(lockResult.stdout);
      const backoffSchedule = lockAttempt.backoffScheduleMs.join(', ');

      const existingDeferral = deferralForAgent || {};
      const firstFailureAt = existingDeferral.first_failure_timestamp || new Date().toISOString();
      const firstFailureMs = parseDateValue(firstFailureAt) || Date.now();
      const nowMs = Date.now();
      const deferralAttemptCount = parseNonNegativeInt(existingDeferral.attempt_count, 0) + 1;
      const idempotencyKey = existingDeferral.idempotency_key
        || createIdempotencyKey({ cadence, selectedAgent, runDate: schedulerRunState.run_date });
      const withinRetryWindow = nowMs - firstFailureMs <= schedulerConfig.lockFailurePolicy.degradedLockRetryWindowMs;
      const withinDeferralBudget = deferralAttemptCount <= schedulerConfig.lockFailurePolicy.maxDeferrals;

      if (!schedulerConfig.lockFailurePolicy.strictLock && withinRetryWindow && withinDeferralBudget) {
        schedulerRunState.lock_deferral = {
          attempt_count: deferralAttemptCount,
          first_failure_timestamp: firstFailureAt,
          backend_category: backendCategory,
          idempotency_key: idempotencyKey,
          selected_agent: selectedAgent,
        };
        await writeRunState(runStatePath, schedulerRunState);
        await writeLog({
          cadence,
          agent: selectedAgent,
          status: 'deferred',
          platform,
          reason: 'Lock backend deferred',
          detail: `Deferred after lock backend failure (${backendCategory}); retry window active and deferral budget remaining. Prompt not executed. ${buildLockBackendRemediation({ cadence, retryWindowMs: schedulerConfig.lockFailurePolicy.degradedLockRetryWindowMs, maxDeferrals: schedulerConfig.lockFailurePolicy.maxDeferrals })}`,
          metadata: {
            ...categorizeFailureMetadata(FAILURE_CATEGORY.LOCK_BACKEND, { failure_class: 'backend_unavailable' }),
            deferral_attempt_count: deferralAttemptCount,
            deferral_first_failure_timestamp: firstFailureAt,
            backend_category: backendCategory,
            lock_idempotency_key: idempotencyKey,
          },
        });
        await exitWithSummary(0, {
          status: 'deferred',
          agent: selectedAgent,
          promptPath: null,
          reason: 'Lock backend deferred',
          platform,
          detail: `Lock backend failure (${backendCategory})`,
        });
      }

      schedulerRunState.lock_deferral = null;
      await writeRunState(runStatePath, schedulerRunState);
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: 'Lock backend error',
        detail: `Lock backend error (${backendCategory}) after ${lockAttempt.attempts} attempt(s). Prompt not executed. ${buildLockBackendRemediation({ cadence, retryWindowMs: schedulerConfig.lockFailurePolicy.degradedLockRetryWindowMs, maxDeferrals: schedulerConfig.lockFailurePolicy.maxDeferrals })}`,
        metadata: {
          ...categorizeFailureMetadata(FAILURE_CATEGORY.LOCK_BACKEND, { failure_class: 'backend_unavailable' }),
          lock_attempts_total: lockAttempt.attempts,
          lock_backoff_schedule_ms: backoffSchedule || '(none)',
          lock_correlation_id: diagnosticsSummary.correlationId || lockAttempt.correlationId,
          lock_attempt_id: diagnosticsSummary.attemptId || String(lockAttempt.attempts),
          lock_total_retry_timeline_ms: diagnosticsSummary.totalElapsedMs,
          lock_failure_reason_distribution: JSON.stringify(diagnosticsSummary.reasonDistribution),
          backend_category: backendCategory,
          deferral_attempt_count: deferralAttemptCount,
          deferral_first_failure_timestamp: firstFailureAt,
          lock_command: lockCommand,
          lock_idempotency_key: idempotencyKey,
          lock_stderr_excerpt: stderrExcerpt || '(empty)',
          lock_stdout_excerpt: stdoutExcerpt || '(empty)',
        },
      });
      await exitWithSummary(2, {
        status: 'failed',
        agent: selectedAgent,
        promptPath: null,
        reason: 'Lock backend error',
        platform,
        detail: `Lock backend error (${backendCategory})`,
      });
    }

    if (lockResult.code !== 0) {
      schedulerRunState.lock_deferral = null;
      await writeRunState(runStatePath, schedulerRunState);
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: 'Failed to acquire lock',
      });
      await exitWithSummary(lockResult.code, {
        status: 'failed',
        agent: selectedAgent,
        promptPath: null,
        reason: 'Failed to acquire lock',
        platform,
      });
    }

    const promptPath = path.resolve(process.cwd(), 'src/prompts', cadence, `${selectedAgent}.md`);
    const promptValidation = await validatePromptFile(promptPath);
    if (!promptValidation.ok) {
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: promptValidation.reason,
        detail: promptValidation.detail,
        metadata: categorizeFailureMetadata(promptValidation.category, { prompt_path: promptPath }),
      });
      await exitWithSummary(1, {
        status: 'failed',
        agent: selectedAgent,
        promptPath,
        reason: promptValidation.reason,
        detail: promptValidation.detail,
        platform,
      });
    }

    schedulerRunState.lock_deferral = null;
    await writeRunState(runStatePath, schedulerRunState);
    const runArtifactSince = new Date().toISOString();
    const runStartMs = Date.parse(runArtifactSince);
    const outputChunks = [];

    // Pre-create the memory update file path and inject it as SCHEDULER_MEMORY_FILE
    // so the spawned agent can write learnings without computing the path itself.
    const memoryDir = path.resolve(process.cwd(), 'memory-updates');
    await fs.mkdir(memoryDir, { recursive: true });
    const memoryFile = path.join(memoryDir, `${ts()}__${selectedAgent}.md`);
    const schedulerEnv = {
      AGENT_PLATFORM: platform,
      ...(model ? { AGENT_MODEL: model } : {}),
      SCHEDULER_AGENT: selectedAgent,
      SCHEDULER_CADENCE: cadence,
      SCHEDULER_PROMPT_PATH: promptPath,
      SCHEDULER_MEMORY_FILE: memoryFile,
    };

    if (schedulerConfig.memoryPolicy.retrieveCommand) {
      const retrieveResult = await runCommand('bash', ['-lc', schedulerConfig.memoryPolicy.retrieveCommand], {
        env: schedulerEnv,
      });
      outputChunks.push(retrieveResult.stdout, retrieveResult.stderr);
      if (retrieveResult.code !== 0) {
        await writeLog({
          cadence,
          agent: selectedAgent,
          status: 'failed',
          platform,
          reason: 'Memory retrieval command failed',
          detail: schedulerConfig.memoryPolicy.retrieveCommand,
          metadata: categorizeFailureMetadata(FAILURE_CATEGORY.EXECUTION, { failure_class: 'prompt_validation_error' }),
        });
        await exitWithSummary(retrieveResult.code, {
          status: 'failed',
          agent: selectedAgent,
          promptPath,
          reason: 'Memory retrieval command failed',
          detail: schedulerConfig.memoryPolicy.retrieveCommand,
          memoryFile,
          platform,
        });
      }
    }

    if (schedulerConfig.handoffCommand) {
      const handoff = await runCommand('bash', ['-lc', schedulerConfig.handoffCommand], {
        env: schedulerEnv,
      });
      outputChunks.push(handoff.stdout, handoff.stderr);
      if (handoff.code !== 0) {
        await writeLog({
          cadence,
          agent: selectedAgent,
          status: 'failed',
          platform,
          reason: 'Prompt/handoff execution failed',
          detail: 'Handoff callback failed.',
          metadata: categorizeFailureMetadata(FAILURE_CATEGORY.EXECUTION, { failure_class: 'prompt_validation_error' }),
        });
        await exitWithSummary(handoff.code, {
          status: 'failed',
          agent: selectedAgent,
          promptPath,
          reason: 'Prompt/handoff execution failed',
          detail: 'Handoff callback failed',
          memoryFile,
          platform,
        });
      }
    } else {
      const detail = schedulerConfig.missingHandoffCommandForMode
        ? 'Missing scheduler handoff command for non-interactive run. Set scheduler.handoffCommandByCadence.daily|weekly in torch-config.json.'
        : 'No handoff callback configured. Set scheduler.handoffCommandByCadence.daily|weekly in torch-config.json.';
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: 'Prompt/handoff execution failed',
        detail,
        metadata: categorizeFailureMetadata(FAILURE_CATEGORY.EXECUTION, { failure_class: 'prompt_validation_error' }),
      });
      await exitWithSummary(1, {
        status: 'failed',
        agent: selectedAgent,
        promptPath,
        reason: 'Prompt/handoff execution failed',
        detail,
        memoryFile,
        platform,
      });
    }

    if (schedulerConfig.memoryPolicy.storeCommand) {
      const storeResult = await runCommand('bash', ['-lc', schedulerConfig.memoryPolicy.storeCommand], {
        env: schedulerEnv,
      });
      outputChunks.push(storeResult.stdout, storeResult.stderr);
      if (storeResult.code !== 0) {
        await writeLog({
          cadence,
          agent: selectedAgent,
          status: 'failed',
          platform,
          reason: 'Memory storage command failed',
          detail: schedulerConfig.memoryPolicy.storeCommand,
          metadata: categorizeFailureMetadata(FAILURE_CATEGORY.EXECUTION, { failure_class: 'prompt_validation_error' }),
        });
        await exitWithSummary(storeResult.code, {
          status: 'failed',
          agent: selectedAgent,
          promptPath,
          reason: 'Memory storage command failed',
          detail: schedulerConfig.memoryPolicy.storeCommand,
          memoryFile,
          platform,
        });
      }
    }

    const memoryOutput = outputChunks.join('\n');
    const retrieveCheck = await verifyMemoryStep({
      name: 'retrieve',
      markers: schedulerConfig.memoryPolicy.retrieveSuccessMarkers,
      artifacts: schedulerConfig.memoryPolicy.retrieveArtifacts,
      outputText: memoryOutput,
      sinceMs: runStartMs,
    });
    const storeCheck = await verifyMemoryStep({
      name: 'store',
      markers: schedulerConfig.memoryPolicy.storeSuccessMarkers,
      artifacts: schedulerConfig.memoryPolicy.storeArtifacts,
      outputText: memoryOutput,
      sinceMs: runStartMs,
    });

    // mode='required' → missing evidence is a hard failure; mode='optional' → warning only.
    const missingSteps = [retrieveCheck, storeCheck].filter((step) => !step.complete).map((step) => step.name);
    if (missingSteps.length && schedulerConfig.memoryPolicy.mode === 'required') {
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: 'Required memory steps not verified',
        detail: `Missing evidence for: ${missingSteps.join(', ')}`,
        metadata: categorizeFailureMetadata(FAILURE_CATEGORY.PROMPT_SCHEMA, { failure_class: 'prompt_validation_error' }),
      });
      await exitWithSummary(1, {
        status: 'failed',
        agent: selectedAgent,
        promptPath,
        reason: 'Required memory steps not verified',
        detail: `Missing evidence for: ${missingSteps.join(', ')}`,
        memoryFile,
        platform,
      });
    }

    if (missingSteps.length) {
      console.warn(`[scheduler] Optional memory evidence missing for ${missingSteps.join(', ')}.`);
    }

    const artifactCheck = await runCommand('node', [
      'scripts/agent/verify-run-artifacts.mjs',
      '--since',
      runArtifactSince,
      '--agent',
      selectedAgent,
      '--cadence',
      cadence,
      '--prompt-path',
      promptPath,
      '--run-start',
      runArtifactSince,
      '--check-failure-notes',
    ]);
    if (artifactCheck.code !== 0) {
      const detail = artifactCheck.stderr.trim() || artifactCheck.stdout.trim() || 'Artifact verification failed.';
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: 'Missing required run artifacts',
        detail,
        metadata: categorizeFailureMetadata(FAILURE_CATEGORY.PROMPT_SCHEMA, { failure_class: 'prompt_validation_error' }),
      });
      await exitWithSummary(artifactCheck.code, {
        status: 'failed',
        agent: selectedAgent,
        promptPath,
        reason: 'Missing required run artifacts',
        detail,
        memoryFile,
        platform,
      });
    }

    for (const validation of schedulerConfig.validationCommands) {
      const parts = validation.split(' ').filter(Boolean);
      if (!parts.length) continue;
      const result = await runCommand(parts[0], parts.slice(1));
      if (result.code !== 0) {
        await writeLog({
          cadence,
          agent: selectedAgent,
          status: 'failed',
          platform,
          reason: 'Validation failed',
          detail: validation,
          metadata: categorizeFailureMetadata(FAILURE_CATEGORY.EXECUTION, { failure_class: 'prompt_validation_error' }),
        });
        await exitWithSummary(result.code, {
          status: 'failed',
          agent: selectedAgent,
          promptPath,
          reason: 'Validation failed',
          detail: validation,
          memoryFile,
          platform,
        });
      }
    }

    const completeResult = await runCommand(
      'npm',
      ['run', 'lock:complete', '--', '--agent', selectedAgent, '--cadence', cadence, ...(model ? ['--model', model] : [])],
      { env: { AGENT_PLATFORM: platform, ...(model ? { AGENT_MODEL: model } : {}) } },
    );

    if (completeResult.code !== 0) {
      await writeLog({
        cadence,
        agent: selectedAgent,
        status: 'failed',
        platform,
        reason: `Completion publish failed. Retry npm run lock:complete -- --agent ${selectedAgent} --cadence ${cadence} after verifying relay connectivity`,
      });
      await exitWithSummary(completeResult.code, {
        status: 'failed',
        agent: selectedAgent,
        promptPath,
        reason: 'Completion publish failed',
        detail: 'Retry npm run lock:complete after verifying relay connectivity',
        memoryFile,
        platform,
      });
    }

    await writeLog({ cadence, agent: selectedAgent, status: 'completed', platform, reason: 'Scheduler cycle completed successfully' });
    await exitWithSummary(0, {
      status: 'completed',
      agent: selectedAgent,
      promptPath,
      reason: 'Scheduler cycle completed successfully',
      memoryFile,
      platform,
    });
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
