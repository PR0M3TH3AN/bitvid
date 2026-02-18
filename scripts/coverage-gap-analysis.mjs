import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let coverageFile = path.join(rootDir, 'test-audit', 'coverage', 'coverage', 'coverage-summary.json');
const outputFile = path.join(rootDir, 'test-audit', 'coverage-gaps.json');

const criticalFiles = [
  'js/services/authService.js',
  'js/relayManager.js',
  'js/nostr/dmDecryptWorker.js',
  'js/nostr/watchHistory.js',
  'js/userBlocks.js'
];

async function main() {
  if (!fs.existsSync(coverageFile)) {
    const altPath = path.join(rootDir, 'test-audit', 'coverage', 'coverage-summary.json');
    if (fs.existsSync(altPath)) {
      coverageFile = altPath;
    } else {
      // One more fallback for potential flatter structure
      const flatPath = path.join(rootDir, 'test-audit', 'coverage-summary.json');
      if (fs.existsSync(flatPath)) {
        coverageFile = flatPath;
      } else {
        console.error(`Coverage file not found at ${coverageFile} or ${altPath}`);
        process.exit(1);
      }
    }
  }

  console.log(`Reading coverage from: ${coverageFile}`);
  const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
  const gaps = {};

  // Create a normalized map of coverage keys (absolute paths) to relative paths
  const normalizedCoverage = {};
  for (const key of Object.keys(coverage)) {
    let relativeKey = path.relative(rootDir, key);
    normalizedCoverage[relativeKey] = coverage[key];
  }

  for (const file of criticalFiles) {
    const fileCoverage = normalizedCoverage[file];

    if (!fileCoverage) {
      gaps[file] = {
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
        status: 'MISSING'
      };
      continue;
    }

    const { lines, statements, functions, branches } = fileCoverage;
    // Check if any metric is < 70%
    if (lines.pct < 70 || statements.pct < 70 || functions.pct < 70 || branches.pct < 70) {
      gaps[file] = {
        lines: lines.pct,
        statements: statements.pct,
        functions: functions.pct,
        branches: branches.pct,
        status: 'LOW_COVERAGE'
      };
    } else {
      gaps[file] = {
        lines: lines.pct,
        statements: statements.pct,
        functions: functions.pct,
        branches: branches.pct,
        status: 'OK'
      };
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(gaps, null, 2));
  console.log(`Wrote coverage gaps to ${outputFile}`);
}

main();
