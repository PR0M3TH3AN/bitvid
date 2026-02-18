import fs from 'node:fs';
import path from 'node:path';

const logDir = 'test-audit';
const matrixFile = path.join(logDir, 'flakiness-matrix.json');

function parseLog(content) {
  const results = {};
  const lines = content.split('\n');
  let currentFile = null;

  for (const line of lines) {
    // "→ Running tests/..."
    const runningMatch = line.match(/→ Running (.+)/);
    if (runningMatch) {
      currentFile = runningMatch[1];
      if (!results[currentFile]) {
        results[currentFile] = 'PASS'; // Assume pass until failure found
      }
      continue;
    }

    // "✖ tests/... failed with exit code ..."
    const failMatch = line.match(/✖ (.+) failed with exit code/);
    if (failMatch) {
      results[failMatch[1]] = 'FAIL';
      continue;
    }

    // TAP failures
    if (line.trim().startsWith('not ok')) {
       // Ideally we'd map this to the specific test case, but for now map to the file
       if (currentFile) {
         results[currentFile] = 'FAIL';
       }
    }
  }
  return results;
}

function main() {
  const matrix = {};
  const runFiles = fs.readdirSync(logDir).filter(f => f.startsWith('run-') && f.endsWith('.log'));

  if (runFiles.length === 0) {
    console.log('No run logs found.');
    return;
  }

  console.log(`Analyzing ${runFiles.length} runs...`);

  for (const file of runFiles) {
    const content = fs.readFileSync(path.join(logDir, file), 'utf8');
    const runResults = parseLog(content);

    for (const [testFile, status] of Object.entries(runResults)) {
      if (!matrix[testFile]) {
        matrix[testFile] = [];
      }
      matrix[testFile].push(status);
    }
  }

  // Identify flaky tests
  const flakyTests = {};
  for (const [testFile, statuses] of Object.entries(matrix)) {
    const hasPass = statuses.includes('PASS');
    const hasFail = statuses.includes('FAIL');
    if (hasPass && hasFail) {
      flakyTests[testFile] = { statuses, verdict: 'FLAKY' };
    } else if (hasFail) {
      flakyTests[testFile] = { statuses, verdict: 'FAIL' };
    } else {
       // Consistent PASS, ignore for report to save space, or include?
       // Let's include everything for completeness
       flakyTests[testFile] = { statuses, verdict: 'PASS' };
    }
  }

  fs.writeFileSync(matrixFile, JSON.stringify(flakyTests, null, 2));
  console.log(`Wrote flakiness matrix to ${matrixFile}`);
}

main();
