import fs from 'fs';

const DATE = '2026-02-14';

async function generate() {
  const flakiness = JSON.parse(await fs.promises.readFile('test-audit/flakiness-matrix.json', 'utf8').catch(() => '{}'));
  const suspicious = JSON.parse(await fs.promises.readFile('test-audit/suspicious-tests.json', 'utf8').catch(() => '{}'));
  const coverage = JSON.parse(await fs.promises.readFile('test-audit/coverage-gaps.json', 'utf8').catch(() => '{}'));
  const coverageLog = await fs.promises.readFile('test-audit/coverage-run.log', 'utf8').catch(() => '');

  let report = `# Test Audit Report: ${DATE}

## Summary
- **Test Runner:** \`node:test\` via \`scripts/run-unit-tests.mjs\`
- **Coverage Tool:** \`c8\`
- **Flakiness Check:** ${flakiness.runs} runs (Timeout issues encountered)

## Flakiness
${flakiness.note || (flakiness.failures && flakiness.failures.length > 0 ?
  `Found ${flakiness.failures.length} flaky tests:\n` + flakiness.failures.map(f => `- ${f}`).join('\n') :
  'No flakiness detected (limited runs due to timeout).')}

## Suspicious Tests
### Skipped Tests (.skip)
${suspicious.skipped && suspicious.skipped.length > 0 ? suspicious.skipped.map(f => `- ${f}`).join('\n') : 'None'}

### Focused Tests (.only)
${suspicious.focused && suspicious.focused.length > 0 ? suspicious.focused.map(f => `- ${f}`).join('\n') : 'None'}

### Sleep Usage (setTimeout/sleep)
${suspicious.sleeps && suspicious.sleeps.length > 0 ? suspicious.sleeps.map(f => `- ${f}`).join('\n') : 'None'}

### Console Usage
${suspicious.console && suspicious.console.length > 0 ? suspicious.console.map(f => `- ${f}`).join('\n') : 'None'}

## Coverage Gaps (Critical Files)
| File | Coverage % | Lines Hit | Total Lines |
|------|------------|-----------|-------------|
${Object.entries(coverage).map(([file, data]) => `| ${file} | ${data.coverage}% | ${data.lh} | ${data.lf} |`).join('\n')}

## Recommendations
1. **Investigate Skipped Tests:** ${suspicious.skipped ? suspicious.skipped.length : 0} tests are skipped. Check if they are obsolete or need fixing.
2. **Remove Console Logs:** ${suspicious.console ? suspicious.console.length : 0} test files contain console logs. Clean them up.
3. **Address Coverage Gaps:** Several critical files have low coverage. Focus on \`js/services/authService.js\` and \`js/relayManager.js\` if below 70%.
4. **Fix Flakiness:** The test suite is slow and timed out during flakiness check. Optimize tests or increase timeout.

## Detailed Coverage Log (Snippet)
\`\`\`
${coverageLog.substring(0, 1000)}...
\`\`\`
`;

  await fs.promises.writeFile(`test-audit/test-audit-report-${DATE}.md`, report);
  console.log('Report generated.');
}

generate();
