import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RUNS = 5;
const results = {};
const runDiagnostics = [];

// Parse arguments to separate our flags from test runner args
const args = process.argv.slice(2);
let outputDir = 'reports/test-audit';
const testArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-dir') {
    outputDir = args[i + 1];
    i++; // Skip next arg
  } else {
    testArgs.push(args[i]);
  }
}

// Default to npm test patterns if no args provided
if (testArgs.length === 0) {
  testArgs.push('test/*.test.mjs', 'test/*.test.js');
}

async function runTests(i) {
  console.log(`Run ${i + 1}/${RUNS}...`);
  return new Promise((resolve) => {
    const tapOutputPath = join(outputDir, `flaky-run-${String(i + 1).padStart(2, '0')}.tap`);
    const child = spawn(process.execPath, [
      '--test',
      '--test-reporter=tap',
      `--test-reporter-destination=${tapOutputPath}`,
      ...testArgs
    ], {
      stdio: ['ignore', 'ignore', 'ignore']
    });

    child.on('close', (code) => {
      let observed = 0;
      const tapOutput = existsSync(tapOutputPath) ? readFileSync(tapOutputPath, 'utf8') : '';
      const lines = tapOutput.split('\n');
      for (const line of lines) {
        if (line.startsWith('not ok ') && !line.includes('# skip') && !line.includes('# todo')) {
          const name = line.substring(line.indexOf('-') + 1).trim();
          if (!results[name]) results[name] = { pass: 0, fail: 0 };
          results[name].fail++;
          observed++;
        } else if (line.startsWith('ok ') && !line.includes('# skip') && !line.includes('# todo')) {
          const name = line.substring(line.indexOf('-') + 1).trim();
          if (!results[name]) results[name] = { pass: 0, fail: 0 };
          results[name].pass++;
          observed++;
        }
      }
      runDiagnostics.push({
        run: i + 1,
        code: code ?? 1,
        tapOutputPath,
        observed
      });
      resolve();
    });
  });
}

async function main() {
  // Ensure output directory exists before creating per-run TAP files
  mkdirSync(outputDir, { recursive: true });

  for (let i = 0; i < RUNS; i++) {
    await runTests(i);
  }

  const outputPath = join(outputDir, 'flakiness-matrix.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Flakiness matrix written to ${outputPath}.`);

  const diagnosticsPath = join(outputDir, 'flakiness-runs.json');
  writeFileSync(diagnosticsPath, JSON.stringify(runDiagnostics, null, 2));

  // Fail closed: an empty matrix means the signal is missing, not "no flakiness".
  const totalObserved = runDiagnostics.reduce((sum, run) => sum + run.observed, 0);
  if (totalObserved === 0) {
    console.error('No TAP test outcomes were observed across runs; flakiness report is not trustworthy.');
    process.exitCode = 1;
  }
}

main();
