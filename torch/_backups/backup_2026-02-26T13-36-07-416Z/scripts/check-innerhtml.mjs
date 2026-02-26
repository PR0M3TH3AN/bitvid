import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const DEFAULT_EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'artifacts', 'test_logs', 'coverage'];
const DEFAULT_TARGET_EXTENSIONS = ['.js', '.mjs', '.ts', '.html'];
const DEFAULT_EXCLUDED_FILES = [];

function countInnerHTML(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Basic regex to find assignment to innerHTML
    const regex = /\.innerHTML\s*=/g;
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
    return 0;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      'exclude-dir': { type: 'string', multiple: true },
      'exclude-file': { type: 'string', multiple: true },
      'no-defaults': { type: 'boolean' },
      'report': { type: 'boolean' },
      'help': { type: 'boolean' },
    },
    strict: false,
  });

  if (values.help) {
    console.log(`
Usage: check-innerhtml.mjs [options]

Options:
  --exclude-dir <dir>   Exclude directory (can be used multiple times)
  --exclude-file <file> Exclude file (can be used multiple times)
  --no-defaults         Do not use default exclusions
  --report              Report mode (exit code 0 even if violations found)
  --help                Show this help
`);
    process.exit(0);
  }

  const noDefaults = values['no-defaults'] || false;

  const EXCLUDED_DIRS = noDefaults ? [] : [...DEFAULT_EXCLUDED_DIRS];
  if (values['exclude-dir']) {
    EXCLUDED_DIRS.push(...values['exclude-dir']);
  }

  const EXCLUDED_FILES = noDefaults ? [] : [...DEFAULT_EXCLUDED_FILES];
  if (values['exclude-file']) {
    EXCLUDED_FILES.push(...values['exclude-file']);
  }

  const TARGET_EXTENSIONS = DEFAULT_TARGET_EXTENSIONS;

  function scanDirectory(dir) {
    let files = [];
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!EXCLUDED_DIRS.includes(item)) {
             files = files.concat(scanDirectory(fullPath));
          }
        } else if (stat.isFile()) {
          if (EXCLUDED_FILES.includes(item)) {
            continue;
          }
          if (TARGET_EXTENSIONS.includes(path.extname(item))) {
             files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning ${dir}: ${error.message}`);
    }
    return files;
  }

  const reportMode = values.report;

  const files = scanDirectory('.');
  let totalAssignments = 0;
  let offenderCount = 0;

  for (const file of files) {
    const count = countInnerHTML(file);
    if (count > 0) {
      console.log(`${file}: ${count} assignments`);
      totalAssignments += count;
      offenderCount++;
    }
  }

  if (reportMode && totalAssignments > 0) {
    console.log(`Total assignments: ${totalAssignments}`);
  }

  if (!reportMode && offenderCount > 0) {
    process.exit(1);
  }
}

main();
