import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const PROMPT_DIRS = ['src/prompts/daily', 'src/prompts/weekly'];

const REQUIRED_SECTION_HEADING = '## Required startup + artifacts + memory + issue capture';

const REQUIRED_TOKENS = [
  '`AGENTS.md`',
  '`CLAUDE.md`',
  '`KNOWN_ISSUES.md`',
  '`docs/agent-handoffs/README.md`',
  '`src/context/`',
  '`src/todo/`',
  '`src/decisions/`',
  '`src/test_logs/`',
  '`docs/agent-handoffs/incidents/`',
  'memory retrieval before implementation',
  'memory storage after implementation',
];

async function listPromptFiles() {
  const files = [];

  for (const dir of PROMPT_DIRS) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(join(dir, entry.name));
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function validateFile(filePath, content) {
  const issues = [];

  if (!content.includes(REQUIRED_SECTION_HEADING)) {
    issues.push(`missing required section heading: "${REQUIRED_SECTION_HEADING}"`);
    return issues;
  }

  const sectionStart = content.indexOf(REQUIRED_SECTION_HEADING);
  const remainder = content.slice(sectionStart + REQUIRED_SECTION_HEADING.length);
  const nextHeadingIndex = remainder.search(/\n##\s+/);
  const sectionBody =
    nextHeadingIndex >= 0 ? remainder.slice(0, nextHeadingIndex) : remainder;

  for (const token of REQUIRED_TOKENS) {
    if (!sectionBody.includes(token)) {
      issues.push(`missing contract token in required section: ${token}`);
    }
  }

  return issues;
}

const files = await listPromptFiles();
const errors = [];

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const issues = validateFile(file, content);
  for (const issue of issues) {
    errors.push(`[prompt-contract] ${file}: ${issue}`);
  }
}

if (errors.length > 0) {
  console.error('Prompt contract drift detected:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Prompt contract validated for all daily/weekly prompts.');
