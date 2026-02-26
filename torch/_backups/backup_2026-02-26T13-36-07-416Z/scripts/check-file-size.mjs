import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const DEFAULT_MAX_LINES = 300;
const DEFAULT_EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'artifacts', 'test_logs', 'coverage'];
const DEFAULT_EXCLUDED_FILES = ['package-lock.json'];

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
    return 0;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      'max-lines': { type: 'string' },
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
Usage: check-file-size.mjs [options]

Options:
  --max-lines <n>       Max lines allowed (default: ${DEFAULT_MAX_LINES})
  --exclude-dir <dir>   Exclude directory (can be used multiple times)
  --exclude-file <file> Exclude file (can be used multiple times)
  --no-defaults         Do not use default exclusions
  --report              Report mode (exit code 0 even if violations found)
  --help                Show this help
`);
    process.exit(0);
  }

  const MAX_LINES = values['max-lines'] ? parseInt(values['max-lines'], 10) : DEFAULT_MAX_LINES;
  const noDefaults = values['no-defaults'] || false;

  const EXCLUDED_DIRS = noDefaults ? [] : [...DEFAULT_EXCLUDED_DIRS];
  if (values['exclude-dir']) {
    EXCLUDED_DIRS.push(...values['exclude-dir']);
  }

  const EXCLUDED_FILES = noDefaults ? [] : [...DEFAULT_EXCLUDED_FILES];
  if (values['exclude-file']) {
    EXCLUDED_FILES.push(...values['exclude-file']);
  }

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
          if (['.js', '.mjs', '.ts', '.html', '.css', '.json', '.md'].includes(path.extname(item))) {
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
  let oversizedCount = 0;

  for (const file of files) {
    const lines = countLines(file);
    if (lines > MAX_LINES) {
      const excess = lines - MAX_LINES;
      console.log(`${file}: ${lines} lines (excess: ${excess})`);
      oversizedCount++;
    }
  }

  if (!reportMode && oversizedCount > 0) {
    process.exit(1);
  }
}

main();
