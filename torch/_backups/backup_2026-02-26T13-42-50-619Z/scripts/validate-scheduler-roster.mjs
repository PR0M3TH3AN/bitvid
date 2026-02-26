import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG = {
  daily: {
    schedulerFile: 'src/prompts/daily-scheduler.md',
    promptDir: 'src/prompts/daily',
  },
  weekly: {
    schedulerFile: 'src/prompts/weekly-scheduler.md',
    promptDir: 'src/prompts/weekly',
  },
};

function parseTableRows(markdown, schedulerFile) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*$/);
    if (!match) {
      continue;
    }

    rows.push({
      index: Number(match[1]),
      agent: match[2].trim(),
      promptFile: match[3].trim(),
    });
  }

  if (rows.length === 0) {
    throw new Error(`No scheduler table rows found in ${schedulerFile}`);
  }

  return rows;
}

function diffLists(expected, actual) {
  return {
    missing: expected.filter((item) => !actual.includes(item)),
    extra: actual.filter((item) => !expected.includes(item)),
  };
}

function validateScheduler(cadence, roster, rows, promptFiles) {
  const errors = [];

  if (rows.length !== roster.length) {
    errors.push(
      `[${cadence}] row count mismatch: roster has ${roster.length}, table has ${rows.length}`,
    );
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const expectedIndex = i + 1;
    if (row.index !== expectedIndex) {
      errors.push(`[${cadence}] row ${i + 1} has index ${row.index}, expected ${expectedIndex}`);
    }

    const expectedAgent = roster[i];
    if (expectedAgent && row.agent !== expectedAgent) {
      errors.push(
        `[${cadence}] row ${i + 1} agent mismatch: table has "${row.agent}", roster expects "${expectedAgent}"`,
      );
    }

    const expectedPromptFile = `${row.agent}.md`;
    if (row.promptFile !== expectedPromptFile) {
      errors.push(
        `[${cadence}] row ${i + 1} prompt file mismatch: table has "${row.promptFile}", expected "${expectedPromptFile}"`,
      );
    }
  }

  const tableAgents = rows.map((row) => row.agent);
  const rosterVsTable = diffLists(roster, tableAgents);
  if (rosterVsTable.missing.length > 0 || rosterVsTable.extra.length > 0) {
    errors.push(
      `[${cadence}] roster/table mismatch: missing in table [${rosterVsTable.missing.join(', ')}], extra in table [${rosterVsTable.extra.join(', ')}]`,
    );
  }

  const rosterPromptFiles = roster.map((agent) => `${agent}.md`);
  const filesVsRoster = diffLists(rosterPromptFiles, promptFiles);
  if (filesVsRoster.missing.length > 0 || filesVsRoster.extra.length > 0) {
    errors.push(
      `[${cadence}] roster/files mismatch: missing files [${filesVsRoster.missing.join(', ')}], extra files [${filesVsRoster.extra.join(', ')}]`,
    );
  }

  const filesVsTable = diffLists(promptFiles, rows.map((row) => row.promptFile));
  if (filesVsTable.missing.length > 0 || filesVsTable.extra.length > 0) {
    errors.push(
      `[${cadence}] table/files mismatch: missing in table [${filesVsTable.missing.join(', ')}], extra in table [${filesVsTable.extra.join(', ')}]`,
    );
  }

  return errors;
}

async function listMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function validateCanonicalPromptPaths() {
  const errors = [];
  const markdownFiles = await listMarkdownFiles('src/prompts');
  const invalidPathPattern = /src\/src\/(context|todo|decisions|test_logs)\b/;

  for (const file of markdownFiles) {
    const content = await readFile(file, 'utf8');
    if (!invalidPathPattern.test(content)) {
      continue;
    }

    errors.push(
      `[prompt-paths] ${file} contains invalid canonical path references using "src/src/..."; expected "src/..."`,
    );
  }

  return errors;
}

const roster = JSON.parse(await readFile('src/prompts/roster.json', 'utf8'));

const allErrors = [];

for (const [cadence, cfg] of Object.entries(CONFIG)) {
  const schedulerMd = await readFile(cfg.schedulerFile, 'utf8');
  const rows = parseTableRows(schedulerMd, cfg.schedulerFile);
  const promptFiles = (await readdir(cfg.promptDir))
    .filter((filename) => filename.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));

  allErrors.push(...validateScheduler(cadence, roster[cadence] ?? [], rows, promptFiles));
}

allErrors.push(...(await validateCanonicalPromptPaths()));

if (allErrors.length > 0) {
  console.error('Scheduler/roster drift detected:');
  for (const error of allErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Scheduler tables, roster, and prompt filenames are in sync.');
