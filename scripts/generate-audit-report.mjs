import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const flakinessFile = path.join(rootDir, 'test-audit', 'flakiness-matrix.json');
const suspiciousFile = path.join(rootDir, 'test-audit', 'suspicious-tests.json');
const coverageFile = path.join(rootDir, 'test-audit', 'coverage-gaps.json');
const outputFile = path.join(rootDir, 'test-audit-report-' + new Date().toISOString().split('T')[0] + '.md');

function readJson(file) {
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

function main() {
  const flakiness = readJson(flakinessFile);
  const suspicious = readJson(suspiciousFile);
  const coverage = readJson(coverageFile);

  const nodeVersion = process.version;
  let npmVersion = 'unknown';
  try {
    npmVersion = execSync('npm --version').toString().trim();
  } catch (e) {}

  let report = `# Test Audit Report - ${new Date().toISOString().split('T')[0]}\n\n`;

  report += `## Run Metadata\n`;
  report += `- **Date**: ${new Date().toISOString()}\n`;
  report += `- **Node Version**: ${nodeVersion}\n`;
  report += `- **NPM Version**: ${npmVersion}\n`;
  report += `- **Test Command**: \`npm run test:unit\` (with c8 coverage)\n\n`;

  // Summary
  report += `## Summary\n`;
  report += `- **Flaky Tests**: ${flakiness ? Object.keys(flakiness).filter(k => flakiness[k].verdict === 'FLAKY').length : 'N/A'}\n`;
  report += `- **Suspicious Files**: ${suspicious ? Object.keys(suspicious).length : 'N/A'}\n`;
  report += `- **Critical Coverage Gaps**: ${coverage ? Object.keys(coverage).filter(k => coverage[k].status === 'LOW_COVERAGE').length : 'N/A'}\n\n`;

  // Flakiness
  report += `## Flakiness Detection\n`;
  if (flakiness) {
    const flakyTests = Object.keys(flakiness).filter(k => flakiness[k].verdict === 'FLAKY');
    if (flakyTests.length > 0) {
      report += `Found ${flakyTests.length} flaky tests:\n`;
      for (const test of flakyTests) {
        report += `- **${test}**: ${flakiness[test].statuses.join(', ')}\n`;
      }
    } else {
      report += `No flaky tests detected (based on run matrix).\n`;
    }
  } else {
    report += `Flakiness matrix not found.\n`;
  }
  report += `\n`;

  // Suspicious Tests
  report += `## Suspicious Patterns\n`;
  if (suspicious) {
    const files = Object.keys(suspicious);
    if (files.length > 0) {
      report += `Found suspicious patterns in ${files.length} files:\n`;
      for (const file of files) {
        report += `### ${file}\n`;
        for (const issue of suspicious[file]) {
          report += `- ${issue}\n`;
        }
      }
    } else {
      report += `No suspicious patterns found.\n`;
    }
  } else {
    report += `Suspicious tests file not found.\n`;
  }
  report += `\n`;

  // Coverage Gaps
  report += `## Critical Coverage Gaps\n`;
  if (coverage) {
    const gaps = Object.keys(coverage).filter(k => coverage[k].status !== 'OK');
    if (gaps.length > 0) {
      report += `Critical modules with low coverage (< 70%):\n`;
      for (const file of gaps) {
        const stats = coverage[file];
        if (stats.status === 'MISSING') {
          report += `- **${file}**: No coverage data found.\n`;
        } else {
          report += `- **${file}**: Lines: ${stats.lines}%, Statements: ${stats.statements}%, Functions: ${stats.functions}%, Branches: ${stats.branches}%\n`;
        }
      }
    } else {
      report += `All critical modules have acceptable coverage.\n`;
    }
  } else {
    report += `Coverage gaps file not found.\n`;
  }
  report += `\n`;

  // Remediation
  report += `## Prioritized Remediation\n`;
  report += `### High Priority (P0)\n`;
  if (coverage) {
    const gaps = Object.keys(coverage).filter(k => coverage[k].status !== 'OK');
    for (const file of gaps) {
      report += `- [ ] Increase coverage for \`${file}\` (currently < 70%).\n`;
    }
  }
  if (flakiness) {
    const flakyTests = Object.keys(flakiness).filter(k => flakiness[k].verdict === 'FLAKY');
    for (const test of flakyTests) {
      report += `- [ ] Fix flakiness in \`${test}\`.\n`;
    }
  }

  report += `\n### Medium Priority (P1)\n`;
  report += `- [ ] Review suspicious tests (time dependence, network usage) and replace with deterministic patterns.\n`;

  fs.writeFileSync(outputFile, report);
  console.log(`Generated report: ${outputFile}`);
}

main();
