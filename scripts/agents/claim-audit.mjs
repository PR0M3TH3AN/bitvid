#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const VALID_CADENCES = new Set(['daily', 'weekly']);
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { cadence: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--cadence' || value === '-c') {
      args.cadence = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (value.startsWith('--cadence=')) {
      args.cadence = value.split('=')[1] ?? null;
    }
  }
  return args;
}


function isClaimCandidate(pr, cadence) {
  const headRef = String(pr?.head?.ref ?? '').toLowerCase();
  const title = String(pr?.title ?? '').toLowerCase();

  const branchHints = [
    `agents/${cadence}/`,
    `${cadence}/`,
    `agent/${cadence}/`,
  ];
  if (branchHints.some((hint) => headRef.includes(hint))) {
    return true;
  }

  if (title.includes(cadence) && title.includes('-agent')) {
    return true;
  }

  return false;
}

function deriveAgentFromPr(pr, cadence) {
  const headRef = String(pr?.head?.ref ?? '');
  const title = String(pr?.title ?? '');
  const branchMatcher = new RegExp(`^agents/${cadence}/(?<agent>[^/]+)/`);
  const branchMatch = headRef.match(branchMatcher);
  if (branchMatch?.groups?.agent) {
    return { agent: branchMatch.groups.agent, source: 'branch' };
  }

  const legacyBranchMatcher = new RegExp(`^(?:agent/)?${cadence}/(?<tail>[^/]+)$`);
  const legacyMatch = headRef.match(legacyBranchMatcher);
  if (legacyMatch?.groups?.tail) {
    const tail = legacyMatch.groups.tail;
    const agentMatch = tail.match(/^(?<agent>(?:[A-Za-z0-9-]+-agent|docs-code-investigator))(?:[-_/].*)?$/);
    if (agentMatch?.groups?.agent) {
      return { agent: agentMatch.groups.agent, source: 'branch-legacy' };
    }
  }

  const titleMatch = title.match(/(?<agent>[A-Za-z0-9-]+-agent|docs-code-investigator)/);
  if (titleMatch?.groups?.agent) {
    return { agent: titleMatch.groups.agent, source: 'title' };
  }

  return { agent: null, source: 'none' };
}

function parseTaskLogFilename(fileName) {
  const match = fileName.match(
    /^(?<date>\d{4}-\d{2}-\d{2})_(?<time>\d{2}-\d{2}-\d{2})_(?<agent>.+)_(?<status>started|completed|failed)\.md$/
  );
  if (!match?.groups) {
    return null;
  }

  const isoTime = match.groups.time.replace(/-/g, ':');
  const timestamp = Date.parse(`${match.groups.date}T${isoTime}Z`);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return {
    fileName,
    agent: match.groups.agent,
    status: match.groups.status,
    timestamp,
    iso: new Date(timestamp).toISOString(),
  };
}

const execFile = promisify(execFileCb);

async function fetchOpenPrs() {
  const url = 'https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100';

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bitvid-claim-audit-script',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (fetchError) {
    const { stdout } = await execFile('curl', ['-s', url]);
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`GitHub API fetch and curl fallback both failed (${fetchError.message})`);
    }
    return Array.isArray(parsed) ? parsed : [];
  }
}

async function getLogEntries(cadence) {
  const directory = join('docs', 'agents', 'task-logs', cadence);
  const files = await readdir(directory);
  return files
    .map(parseTaskLogFilename)
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp || a.fileName.localeCompare(b.fileName));
}

function computeInProgressClaims(entries, nowMs) {
  const startedEntries = entries.filter((entry) => entry.status === 'started');
  const terminalEntries = entries.filter(
    (entry) => entry.status === 'completed' || entry.status === 'failed'
  );

  return startedEntries
    .filter((started) => {
      if (nowMs - started.timestamp >= DAY_MS) {
        return false;
      }
      return !terminalEntries.some(
        (terminal) => terminal.agent === started.agent && terminal.timestamp > started.timestamp
      );
    })
    .map((started) => ({
      agent: started.agent,
      fileName: started.fileName,
      startedAt: started.iso,
      ageHours: Number(((nowMs - started.timestamp) / (60 * 60 * 1000)).toFixed(2)),
    }));
}

function summarizeOpenClaims(prs, cadence) {
  const parsed = [];
  const unresolved = [];

  for (const pr of prs) {
    if (!isClaimCandidate(pr, cadence)) {
      continue;
    }
    const { agent, source } = deriveAgentFromPr(pr, cadence);
    const base = {
      number: pr.number,
      title: pr.title,
      createdAt: pr.created_at,
      draft: Boolean(pr.draft),
      headRef: pr?.head?.ref ?? null,
      state: pr.state,
      parsedAgent: agent,
      parsedFrom: source,
    };

    if (agent) {
      parsed.push(base);
    } else {
      unresolved.push(base);
    }
  }

  const byAgent = {};
  for (const item of parsed) {
    if (!byAgent[item.parsedAgent]) {
      byAgent[item.parsedAgent] = [];
    }
    byAgent[item.parsedAgent].push(item);
  }

  return { parsed, unresolved, byAgent };
}

function printHumanSummary(result) {
  const line = '-'.repeat(72);
  console.log(line);
  console.log(`Claim Audit Summary (${result.cadence})`);
  console.log(line);
  console.log(`Open PRs parsed to agents: ${result.openPrClaims.parsed.length}`);
  console.log(`In-progress started claims (<24h): ${result.inProgressStartedClaims.length}`);
  console.log(`Unresolved PR metadata entries: ${result.openPrClaims.unresolved.length}`);
  console.log(`Global lock warning: ${result.globalLockWarning ? 'YES' : 'no'}`);
  console.log(`Excluded agents: ${result.excludedAgents.length > 0 ? result.excludedAgents.join(', ') : '(none)'}`);
  console.log(`Exclusion list resolved: ${result.exclusionListResolved ? 'YES' : 'NO (fail-closed)'}`);
}

async function main() {
  const { cadence } = parseArgs(process.argv.slice(2));
  if (!VALID_CADENCES.has(cadence)) {
    console.error('Usage: node scripts/agents/claim-audit.mjs --cadence <daily|weekly>');
    process.exit(1);
  }

  const nowMs = Date.now();
  const openPrs = await fetchOpenPrs();
  const logs = await getLogEntries(cadence);

  const openPrClaims = summarizeOpenClaims(openPrs, cadence);
  const inProgressStartedClaims = computeInProgressClaims(logs, nowMs);

  const excludedSet = new Set();
  for (const item of openPrClaims.parsed) {
    excludedSet.add(item.parsedAgent);
  }
  for (const item of inProgressStartedClaims) {
    excludedSet.add(item.agent);
  }

  const excludedAgents = [...excludedSet].sort();
  const globalLockWarning = openPrClaims.unresolved.length > 0;

  const result = {
    generatedAt: new Date(nowMs).toISOString(),
    cadence,
    openPrClaims,
    inProgressStartedClaims,
    excludedAgents,
    globalLockWarning,
    exclusionListResolved: !globalLockWarning,
    failClosedReason: globalLockWarning
      ? 'Unresolved PR metadata detected. Do not execute tasks until exclusion list is manually resolved.'
      : null,
  };

  printHumanSummary(result);
  console.log('\nJSON_OUTPUT_START');
  console.log(JSON.stringify(result, null, 2));
  console.log('JSON_OUTPUT_END');
}

main().catch((error) => {
  console.error(`claim-audit failed: ${error.message}`);
  process.exit(1);
});
