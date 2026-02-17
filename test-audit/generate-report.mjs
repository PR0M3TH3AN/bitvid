import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const reportFile = `test-audit-report-${new Date().toISOString().split("T")[0]}.md`;
const logFile = "test-audit/coverage-run.log";
const flakinessFile = "test-audit/flakiness-matrix.json";
const suspiciousFile = "test-audit/suspicious-tests.json";
const coverageFile = "coverage/coverage-summary.json";

async function readJson(file) {
  try {
    const content = await fs.readFile(file, "utf8");
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

async function run() {
  const flakiness = await readJson(flakinessFile);
  const suspicious = await readJson(suspiciousFile);
  const coverage = await readJson(coverageFile);
  const logContent = await fs.readFile(logFile, "utf8");

  let report = `# Test Audit Report - ${new Date().toISOString().split("T")[0]}\n\n`;

  // Summary
  report += "## Summary\n";
  report += "- **Runner**: Custom (`scripts/run-unit-tests.mjs`)\n";
  report += "- **Command**: `npx c8 npm run test:unit`\n";

  // Failures
  if (logContent.includes("failed with exit code")) {
    report += "- **Status**: FAIL (Failures detected)\n";
  } else {
    report += "- **Status**: PASS\n";
  }

  // Coverage Stats
  if (coverage && coverage.total) {
    report += `- **Coverage**: ${coverage.total.lines.pct}% Lines, ${coverage.total.statements.pct}% Statements, ${coverage.total.functions.pct}% Functions, ${coverage.total.branches.pct}% Branches\n`;
  } else {
    report += "- **Coverage**: N/A\n";
  }

  // Flakiness
  report += "\n## Flakiness Check\n";
  if (flakiness && flakiness.error) {
    report += `- **Error**: ${flakiness.error}\n`;
  } else if (flakiness && flakiness.runs) {
    // Process flakiness
    report += `- **Runs**: ${flakiness.runs.length}\n`;
    // Add details
  } else {
    report += "- **Status**: Skipped or failed to produce results.\n";
  }

  // Suspicious Tests
  report += "\n## Suspicious Tests\n";
  if (suspicious) {
    let count = 0;
    for (const [file, issues] of Object.entries(suspicious)) {
      count++;
      report += `- **${file}**:\n`;
      issues.forEach(i => report += `  - ${i}\n`);
    }
    if (count === 0) report += "None found.\n";
  } else {
    report += "Analysis not run or failed.\n";
  }

  // Coverage Gaps (Critical Files)
  report += "\n## Coverage Gaps (< 70%)\n";
  if (coverage) {
    let gaps = 0;
    for (const [file, stats] of Object.entries(coverage)) {
      if (file === "total") continue;
      const relativePath = path.relative(rootDir, file);
      if (stats.lines.pct < 70) {
        gaps++;
        report += `- **${relativePath}**: ${stats.lines.pct}% (Lines)\n`;
      }
    }
    if (gaps === 0) report += "No files under 70%.\n";
  }

  // Recommendations
  report += "\n## Recommendations\n";
  report += "1. Fix suspicious tests (especially timeouts and console usage).\n";
  report += "2. Improve coverage for files < 70%.\n";
  report += "3. Investigate potential flakiness (if checked).\n";

  await fs.writeFile(reportFile, report);
  console.log(`Report generated: ${reportFile}`);
}

run().catch(console.error);
