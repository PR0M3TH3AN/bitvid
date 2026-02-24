import fs from "node:fs";

const FLAKINESS_FILE = "test-audit/flakiness-matrix.json";
const SUSPICIOUS_FILE = "test-audit/suspicious-tests.json";
const LOG_FILE = "test-audit/coverage-run.log";

// Dynamic date
const date = new Date().toISOString().split("T")[0];
const REPORT_FILE = `test-audit-report-${date}.md`;

function main() {
  const flakiness = JSON.parse(fs.readFileSync(FLAKINESS_FILE, "utf8"));
  const suspicious = JSON.parse(fs.readFileSync(SUSPICIOUS_FILE, "utf8"));
  let log = "";
  try {
    log = fs.readFileSync(LOG_FILE, "utf8");
  } catch (e) {
    log = "";
  }

  const failingTests = flakiness.filter(r => !r.passed || r.hasTapFailure);
  const passed = failingTests.length === 0;

  // Filter suspicious zero-assertion to actual test files
  const zeroAssertionTests = suspicious.zeroAssertions ? suspicious.zeroAssertions.filter(f => f.match(/\.(test|spec)\.(mjs|js|ts)$/)) : [];

  // Extract failures from log dynamically
  let failureDetails = "";
  if (!passed) {
      const lines = log.split('\n');
      const failures = lines.filter(l => l.includes('not ok') || l.includes('FAIL'));
      if (failures.length > 0) {
        failureDetails = failures.slice(0, 10).map(l => `- \`${l.trim()}\``).join('\n');
        if (failures.length > 10) failureDetails += `\n- ... and ${failures.length - 10} more.`;
      } else {
        failureDetails = "Check logs for details (exit code non-zero but no explicit 'not ok' found).";
      }
  }

  let content = `# Test Audit Report - ${date}

## Summary
- **Status**: ${passed ? "PASS" : "FAIL"}
- **Test Command**: (Check \`test_logs/\`)
- **Coverage**: Skipped (missing \`c8\` / \`@vitest/coverage-v8\`)

## Flakiness & Failures
`;

  if (passed) {
    content += "- No failures or flakiness detected.\n";
  } else {
    content += `- **Failures**: ${failingTests.length}/${flakiness.length} runs failed.\n`;
    content += `\n### Failure Details\n${failureDetails}\n`;
    content += "\n### Run Matrix\n";
    content += "| Iteration | Passed | TAP Failure |\n|---|---|---|\n";
    flakiness.forEach(r => {
      content += `| ${r.iteration} | ${r.passed ? "✅" : "❌"} | ${r.hasTapFailure ? "Yes" : "No"} |\n`;
    });
  }

  content += `
## Suspicious Tests (Static Analysis)

### Zero Assertions (Heuristic)
These test files contain \`test(\` or \`describe(\` but no obvious assertion keywords.
`;

  if (zeroAssertionTests.length === 0) {
    content += "- None found.\n";
  } else {
    zeroAssertionTests.forEach(f => content += `- ${f}\n`);
  }

  content += `
### Skipped or Focused Tests (\`.skip\`, \`.only\`)
`;
   if (suspicious.skippedOrFocused.length === 0) {
    content += "- None found.\n";
  } else {
    suspicious.skippedOrFocused.forEach(f => content += `- ${f.trim()}\n`);
  }

  content += `
### Timing Dependencies (\`setTimeout\`, \`sleep\`)
Found ${suspicious.timing.length} occurrences. Examples:
`;
  suspicious.timing.slice(0, 10).forEach(f => content += `- \`${f.trim()}\`\n`);
  if (suspicious.timing.length > 10) content += `- ... and ${suspicious.timing.length - 10} more.\n`;

  content += `
## Coverage Gaps
- **Critical**: Coverage metrics could not be generated.
- **Action**: Install \`c8\` or configure \`vitest\` coverage.

## Recommendations
1. **Fix Failures**: Investigate any failures listed above.
2. **Remove Skips**: Address skipped tests.
3. **Reduce Timing Flakes**: Refactor tests using real \`setTimeout\` to use mock timers or deterministic waits.
4. **Tooling**: Add \`c8\` to \`devDependencies\` to enable coverage reporting for Node.js native runner.

`;

  fs.writeFileSync(REPORT_FILE, content);
  console.log(`Report generated: ${REPORT_FILE}`);
}

main();
