import fs from 'node:fs';

const SOURCE_FILES = [
  'scripts/agent/nostr-lock.mjs',
  'docs/agents/TORCH.md',
  'docs/agents/prompts/META_PROMPTS.md',
  'docs/agents/prompts/scheduler-flow.md',
  'docs/agents/prompts/daily-scheduler.md',
  'docs/agents/prompts/weekly-scheduler.md',
  'views/dev/agent-dashboard.html'
];

const TORCH_FILES = [
  'torch/src/nostr-lock.mjs',
  'torch/src/docs/TORCH.md',
  'torch/src/prompts/META_PROMPTS.md',
  'torch/src/prompts/scheduler-flow.md',
  'torch/src/prompts/daily-scheduler.md',
  'torch/src/prompts/weekly-scheduler.md',
  'torch/dashboard/index.html'
];

const EXPECTED_BITVID_REFERENCES = [
  {
    file: 'docs/agents/TORCH.md',
    includes: ['scripts/agent/nostr-lock.mjs']
  },
  {
    file: 'docs/agents/prompts/META_PROMPTS.md',
    includes: ['node scripts/agent/nostr-lock.mjs check --cadence daily', 'node scripts/agent/nostr-lock.mjs check --cadence weekly']
  },
  {
    file: 'docs/agents/prompts/scheduler-flow.md',
    includes: ['node scripts/agent/nostr-lock.mjs check --cadence <cadence>', 'node scripts/agent/nostr-lock.mjs lock \\\n     --agent <agent-name> \\\n     --cadence <cadence>']
  },
  {
    file: 'views/dev/agent-dashboard.html',
    includes: ['scripts/agent/nostr-lock.mjs', 'href="docs/agents/TORCH.md"']
  },
  {
    file: 'js/constants.js',
    includes: ['DEV_DASHBOARD: "dev/agent-dashboard"']
  }
];

const FORBIDDEN_BITVID_PATTERNS = [
  { file: 'docs/agents/TORCH.md', pattern: /node\s+src\/nostr-lock\.mjs/g },
  { file: 'docs/agents/prompts/META_PROMPTS.md', pattern: /node\s+src\/nostr-lock\.mjs/g },
  { file: 'docs/agents/prompts/scheduler-flow.md', pattern: /node\s+src\/nostr-lock\.mjs/g },
  { file: 'docs/agents/prompts/daily-scheduler.md', pattern: /src\/prompts\/scheduler-flow\.md/g },
  { file: 'docs/agents/prompts/weekly-scheduler.md', pattern: /src\/prompts\/scheduler-flow\.md/g },
  { file: 'views/dev/agent-dashboard.html', pattern: /href="torch\//g }
];

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertFilesExist(files, failures, label) {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      failures.push(`[${label}] Missing file: ${file}`);
    }
  }
}

function assertExpectedReferences(failures) {
  for (const check of EXPECTED_BITVID_REFERENCES) {
    const contents = readFile(check.file);
    for (const expected of check.includes) {
      if (!contents.includes(expected)) {
        failures.push(`[references] ${check.file} is missing expected string: ${JSON.stringify(expected)}`);
      }
    }
  }
}

function assertForbiddenPatterns(failures) {
  for (const check of FORBIDDEN_BITVID_PATTERNS) {
    const contents = readFile(check.file);
    const matches = contents.match(check.pattern);
    if (matches && matches.length > 0) {
      failures.push(`[references] ${check.file} contains forbidden extracted-path pattern ${check.pattern} (${matches.length} match${matches.length === 1 ? '' : 'es'})`);
    }
  }
}

function main() {
  const failures = [];

  assertFilesExist(SOURCE_FILES, failures, 'source');
  assertFilesExist(TORCH_FILES, failures, 'torch-copy');

  if (failures.length === 0) {
    assertExpectedReferences(failures);
    assertForbiddenPatterns(failures);
  }

  if (failures.length > 0) {
    console.error('Torch extraction validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Torch extraction validation passed.');
  console.log('- Source files still exist in bitvid (copy-based extraction confirmed).');
  console.log('- Torch destination files exist.');
  console.log('- Bitvid scheduler commands, lock script paths, and dashboard route references remain unchanged.');
}

try {
  main();
} catch (error) {
  console.error(`Torch extraction validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
