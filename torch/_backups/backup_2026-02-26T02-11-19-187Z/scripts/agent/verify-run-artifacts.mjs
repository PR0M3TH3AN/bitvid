#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_ARTIFACTS = [
  {
    dir: 'src/context',
    expectedPrefix: 'CONTEXT_',
    structureCheck: (content) =>
      /\bgoal\b/i.test(content) && /\bscope\b/i.test(content) && /\bconstraints\b/i.test(content),
    structureHint: 'must include goal/scope/constraints',
  },
  {
    dir: 'src/todo',
    expectedPrefix: 'TODO_',
    structureCheck: (content) =>
      /\bpending(?:\s+tasks?)?\b[\s\S]{0,400}^\s*[-*]\s+/im.test(content)
      || /\bcompleted(?:\s+tasks?)?\b[\s\S]{0,400}^\s*[-*]\s+/im.test(content),
    structureHint: 'must include at least one pending or completed item',
  },
  {
    dir: 'src/decisions',
    expectedPrefix: 'DECISIONS_',
    structureCheck: (content) => /\bdecision\b/i.test(content) && /\brationale\b/i.test(content),
    structureHint: 'must include decision + rationale',
  },
  {
    dir: 'src/test_logs',
    expectedPrefix: 'TEST_LOG_',
    structureCheck: (content) => {
      const hasCommand = /(^|\n)\s*[-*]?\s*\**command\**\s*:/im.test(content);
      const hasResult = /(^|\n)\s*[-*]?\s*\**result\**\s*:/im.test(content);
      return hasCommand && hasResult;
    },
    structureHint: 'must include command/result pairs',
  },
];

const FAILURE_KEYWORD_RE = /\b(fail|failed|failure|error)\b/i;
const STATUS_RESOLVED_RE = /\b(resolved|closed|fixed)\b/i;
const IDENTIFIER_INLINE_PATTERN = String.raw`\[([A-Za-z0-9._-]{3,})\]`;

function parseArgs(argv) {
  const args = {
    since: null,
    session: null,
    checkFailureNotes: false,
    agent: null,
    cadence: null,
    promptPath: null,
    runStart: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--since') {
      args.since = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (value === '--session') {
      args.session = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (value === '--check-failure-notes') {
      args.checkFailureNotes = true;
      continue;
    }
    if (value === '--agent') {
      args.agent = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (value === '--cadence') {
      args.cadence = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (value === '--prompt-path') {
      args.promptPath = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (value === '--run-start') {
      args.runStart = argv[i + 1] || null;
      i += 1;
    }
  }

  return args;
}

function toMs(iso) {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function isNotNeededNote(content) {
  return /\bnot needed\b/i.test(content);
}

async function listRecentFiles(dirPath, sinceMs) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(dirPath, entry.name);
      const stat = await fs.stat(filePath);
      if (sinceMs != null && stat.mtimeMs < sinceMs) continue;
      files.push({ name: entry.name, filePath, mtimeMs: stat.mtimeMs });
    }
    return files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  } catch {
    return [];
  }
}

async function hasExplicitNotNeeded(files) {
  for (const file of files) {
    const content = await fs.readFile(file.filePath, 'utf8').catch(() => '');
    if (isNotNeededNote(content)) return true;
  }
  return false;
}

function getMatchingArtifacts(files, { expectedPrefix, session }) {
  if (session) {
    return files.filter((file) => file.name.includes(session));
  }
  return files.filter((file) => file.name.startsWith(expectedPrefix));
}

async function hasValidArtifactStructure(files, artifact) {
  for (const file of files) {
    const content = await fs.readFile(file.filePath, 'utf8').catch(() => '');
    if (artifact.structureCheck(content)) {
      return true;
    }
  }
  return false;
}

function readMetadataValue(content, keys) {
  for (const key of keys) {
    const re = new RegExp(`^\\s*(?:[-*]\\s*)?\\**${key}\\**\\s*:\\s*(.+)$`, 'im');
    const match = content.match(re);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractIdentifiers(content) {
  const ids = new Set();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    // Match "failure id" as a distinct word phrase (ignores "failure identifiers" or "failure IDs")
    if (/(?:issue|incident|failure)[-_\s]*id\b/i.test(line)) {
      const match = line.match(/([A-Za-z0-9._-]{3,})\s*$/);
      if (match) ids.add(match[1]);
    }
    for (const inline of line.matchAll(new RegExp(IDENTIFIER_INLINE_PATTERN, 'g'))) {
      ids.add(inline[1]);
    }
  }
  return ids;
}

function collectUnresolvedKnownIssueIds(content) {
  const ids = new Set();
  const sections = content.split(/^###\s+/m).slice(1);
  for (const sectionRaw of sections) {
    const section = sectionRaw.trim();
    const statusMatch = section.match(/\*\*Status:\*\*\s*(.+)$/im);
    const status = (statusMatch?.[1] || '').trim();
    if (status && STATUS_RESOLVED_RE.test(status)) {
      continue;
    }
    for (const id of extractIdentifiers(section)) {
      ids.add(id);
    }
  }
  return ids;
}

async function validateArtifactMetadata(files, { agent, cadence, promptPath, runStart }) {
  const failures = [];
  const promptPathResolved = promptPath ? path.resolve(process.cwd(), promptPath) : null;
  const promptRelative = promptPathResolved ? path.relative(process.cwd(), promptPathResolved) : null;
  const promptBase = promptPathResolved ? path.basename(promptPathResolved) : null;

  for (const file of files) {
    const content = await fs.readFile(file.filePath, 'utf8').catch(() => '');
    const fileErrors = [];

    const agentValue = readMetadataValue(content, ['agent']);
    const cadenceValue = readMetadataValue(content, ['cadence']);
    const sessionValue = readMetadataValue(content, ['session']);
    const runStartValue = readMetadataValue(content, ['run-start', 'run_start', 'run start']);

    if (!agentValue) fileErrors.push('missing `agent:` metadata');
    if (!cadenceValue) fileErrors.push('missing `cadence:` metadata');
    if (!sessionValue && !runStartValue) fileErrors.push('missing `session:` or `run-start:` metadata');

    if (agent && agentValue && agentValue !== agent) {
      fileErrors.push(`agent metadata "${agentValue}" does not match active SCHEDULER_AGENT "${agent}"`);
    }
    if (cadence && cadenceValue && cadenceValue !== cadence) {
      fileErrors.push(`cadence metadata "${cadenceValue}" does not match active cadence "${cadence}"`);
    }
    if (runStart && runStartValue && runStartValue !== runStart) {
      fileErrors.push(`run-start metadata "${runStartValue}" does not match active run-start "${runStart}"`);
    }

    if (agent && !content.includes(agent)) {
      fileErrors.push(`content does not reference active SCHEDULER_AGENT "${agent}"`);
    }

    if (promptPathResolved) {
      const referencesPrompt = [promptPathResolved, promptRelative, promptBase].filter(Boolean)
        .some((candidate) => content.includes(candidate));
      if (!referencesPrompt) {
        fileErrors.push(`content does not reference active prompt file (${promptRelative || promptPathResolved})`);
      }
    }

    if (fileErrors.length) {
      failures.push(`${path.relative(process.cwd(), file.filePath)}: ${fileErrors.join('; ')}`);
    }
  }

  return failures;
}

async function checkFailureTracking({ sinceMs }) {
  const recentTestLogs = await listRecentFiles(path.resolve(process.cwd(), 'src/test_logs'), sinceMs);
  const failureIds = new Set();
  const logsWithFailureNoIds = [];

  for (const file of recentTestLogs) {
    const content = await fs.readFile(file.filePath, 'utf8').catch(() => '');
    // Filter out passing TAP lines, comments, and YAML blocks to avoid false positives on test descriptions
    const relevantContent = content.split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return !/^ok\s+\d+/.test(trimmed) &&
               !trimmed.startsWith('#') &&
               !trimmed.startsWith('>') &&
               !/^(failureType|code|name|stack|operator|expected|actual):/.test(trimmed);
      })
      .join('\n');

    if (FAILURE_KEYWORD_RE.test(relevantContent)) {
      const ids = extractIdentifiers(content); // Extract from full content to find IDs anywhere
      if (!ids.size) {
        logsWithFailureNoIds.push(path.relative(process.cwd(), file.filePath));
      }
      for (const id of ids) failureIds.add(id);
    }
  }

  if (!failureIds.size && !logsWithFailureNoIds.length) {
    return { ok: true, message: null };
  }

  if (logsWithFailureNoIds.length) {
    return {
      ok: false,
      message: `Failure-related output detected in test logs without identifiers. Add Issue/Incident identifiers to: ${logsWithFailureNoIds.join(', ')}`,
    };
  }

  const knownIssuesPath = path.resolve(process.cwd(), 'KNOWN_ISSUES.md');
  const knownIssuesContent = await fs.readFile(knownIssuesPath, 'utf8').catch(() => '');
  const unresolvedKnownIssueIds = collectUnresolvedKnownIssueIds(knownIssuesContent);
  const incidents = await listRecentFiles(path.resolve(process.cwd(), 'docs/agent-handoffs/incidents'), sinceMs);

  const incidentIds = new Set();
  for (const incident of incidents) {
    const incidentContent = await fs.readFile(incident.filePath, 'utf8').catch(() => '');
    for (const id of extractIdentifiers(incidentContent)) incidentIds.add(id);
  }

  const unmatched = [...failureIds].filter((id) => !unresolvedKnownIssueIds.has(id) && !incidentIds.has(id));

  if (!unmatched.length) {
    return { ok: true, message: null };
  }

  return {
    ok: false,
    message: `Failure identifiers found in src/test_logs are not cross-linked to unresolved KNOWN_ISSUES.md entries or new incident notes: ${unmatched.join(', ')}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceMs = toMs(args.since);
  const activeAgent = args.agent || process.env.SCHEDULER_AGENT || null;
  const activeCadence = args.cadence || process.env.SCHEDULER_CADENCE || null;
  const activePromptPath = args.promptPath || process.env.SCHEDULER_PROMPT_PATH || null;
  const activeRunStart = args.runStart || null;

  if (args.since && sinceMs == null) {
    console.error(`Invalid --since value: ${args.since}`);
    process.exit(2);
  }

  if (!activeAgent || !activePromptPath) {
    console.error('Missing scheduler context: provide --agent and --prompt-path (or set SCHEDULER_AGENT/SCHEDULER_PROMPT_PATH).');
    process.exit(2);
  }

  const missing = [];

  for (const artifact of REQUIRED_ARTIFACTS) {
    const dirPath = path.resolve(process.cwd(), artifact.dir);
    const files = await listRecentFiles(dirPath, sinceMs);
    const matchingArtifacts = getMatchingArtifacts(files, {
      expectedPrefix: artifact.expectedPrefix,
      session: args.session,
    });

    if (!matchingArtifacts.length) {
      const hasNotNeeded = await hasExplicitNotNeeded(files);
      if (hasNotNeeded) continue;

      const expectedName = args.session
        ? `${artifact.expectedPrefix}${args.session}.md`
        : `${artifact.expectedPrefix}<timestamp>.md`;
      missing.push(`${artifact.dir}/${expectedName}`);
      continue;
    }

    const hasValidStructure = await hasValidArtifactStructure(matchingArtifacts, artifact);
    if (!hasValidStructure) {
      missing.push(`${artifact.dir}: ${artifact.structureHint}`);
    }

    const metadataFailures = await validateArtifactMetadata(matchingArtifacts, {
      agent: activeAgent,
      cadence: activeCadence,
      promptPath: activePromptPath,
      runStart: activeRunStart,
    });
    missing.push(...metadataFailures);
  }

  if (args.checkFailureNotes) {
    const failureTracking = await checkFailureTracking({ sinceMs });
    if (!failureTracking.ok && failureTracking.message) {
      missing.push(failureTracking.message);
    }
  }

  if (missing.length) {
    console.error('Missing required run artifacts:');
    for (const item of missing) {
      console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log('Run artifacts verified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
