import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testsDir = path.join(rootDir, 'tests');
const outputFile = path.join(rootDir, 'test-audit', 'suspicious-tests.json');

const checks = {
  zeroAssertions: {
    pattern: /(expect\(|assert\.|t\.is|chai\.expect|should\.)/g,
    inverse: true,
    message: 'No assertions found'
  },
  focusedOrSkipped: {
    pattern: /\.(only|skip)\(/g,
    message: 'Focused or skipped test'
  },
  timeDependence: {
    pattern: /(setTimeout|setInterval|sleep|delay)\(/g,
    message: 'Time dependence (sleep/timeout)'
  },
  networkDependence: {
    pattern: /(fetch|axios\.|new WebSocket|WebSocket\()/g,
    message: 'Network dependence (fetch/WebSocket)'
  },
  consoleUsage: {
    pattern: /console\.(log|warn|error)/g,
    message: 'Console usage'
  }
};

async function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileIssues = [];

  for (const [key, check] of Object.entries(checks)) {
    const matches = content.match(check.pattern);
    if (check.inverse) {
      if (!matches) {
        fileIssues.push(check.message);
      }
    } else {
      if (matches) {
        fileIssues.push(`${check.message} (${matches.length} occurrences)`);
      }
    }
  }
  return fileIssues;
}

async function walk(dir) {
  let results = {};
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === 'visual' || file === 'e2e') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      Object.assign(results, await walk(filePath));
    } else if (file.endsWith('.test.mjs') || file.endsWith('.test.js')) {
      const issues = await scanFile(filePath);
      if (issues.length > 0) {
        results[path.relative(rootDir, filePath)] = issues;
      }
    }
  }
  return results;
}

async function main() {
  console.log('Scanning tests for suspicious patterns...');
  const suspiciousTests = await walk(testsDir);
  fs.writeFileSync(outputFile, JSON.stringify(suspiciousTests, null, 2));
  console.log(`Wrote suspicious tests to ${outputFile}`);
}

main();
