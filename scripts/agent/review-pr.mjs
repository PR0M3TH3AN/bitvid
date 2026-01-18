import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const LOG_FILE = 'pr_review_report.md';
const SENSITIVE_PATTERNS = [
  /^js\/nostr\//,
  /^js\/storage\//,
  /crypto/i,
  /nip44/i
];

function log(message) {
  console.log(message);
}

function runCommand(command, args = [], options = {}) {
  log(`> Running: ${command} ${args.join(' ')}`);
  return spawnSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    ...options
  });
}

function getChangedFiles(baseBranch = 'origin/main') {
  try {
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    log(`Warning: Could not determine changed files against ${baseBranch}. Using local changes if any.`);
    return [];
  }
}

async function main() {
  const branchArg = process.argv[2];
  let originalBranch;

  if (branchArg && !branchArg.startsWith('--')) {
    try {
      originalBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      log(`Switching to branch: ${branchArg}`);
      execSync(`git checkout ${branchArg}`);
    } catch (e) {
      log(`Error: Could not checkout branch ${branchArg}. ${e.message}`);
      process.exit(1);
    }
  }

  const report = [];
  report.push(`# Automated PR Review`);
  report.push(`**Branch:** ${branchArg || 'Current'}`);
  report.push(`**Date:** ${new Date().toISOString()}`);
  report.push('');

  try {
    // 1. npm ci
    log('Installing dependencies...');
    const ciResult = runCommand('npm', ['ci']);
    if (ciResult.status !== 0) {
      report.push(`## 🚨 Dependency Installation Failed`);
      report.push('`npm ci` failed. Please check `package-lock.json`.');
      report.push('```');
      report.push(ciResult.stderr.slice(-1000)); // Last 1000 chars
      report.push('```');
      // If ci fails, we can't really continue safely
    }

    // 2. Format
    log('Running formatter...');
    runCommand('npm', ['run', 'format']);
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
    const formattedFiles = gitStatus.split('\n')
      .filter(line => line.match(/^ M/)) // Modified files
      .map(line => line.substring(3));

    if (formattedFiles.length > 0) {
      report.push(`## 🎨 Formatting Suggestions`);
      report.push(`The following files need formatting. Run \`npm run format\` to fix.`);
      report.push('<ul>');
      formattedFiles.forEach(f => report.push(`<li>${f}</li>`));
      report.push('</ul>');
      report.push('');

      if (process.argv.includes('--apply-fixes')) {
        try {
          log('Applying formatting fixes...');
          execSync('git add .');
          execSync('git commit -m "fix(ai): formatting (agent)"');
          report.push('**Action:** Applied formatting fixes.');
          // Clear formattedFiles list since they are now committed (and presumably fixed in the working tree)
          // But wait, if we commit them, the next steps run on clean working tree but with new commit.
          // That is fine.
        } catch (e) {
          log(`Error applying fixes: ${e.message}`);
          report.push(`**Error:** Failed to apply formatting fixes: ${e.message}`);
        }
      }
    } else {
      report.push(`## ✅ Formatting`);
      report.push(`No formatting issues found.`);
    }

    // 3. Lint
    log('Running linter...');
    const lintResult = runCommand('npm', ['run', 'lint']);
    if (lintResult.status !== 0) {
      report.push(`## ⚠️ Linter Warnings/Errors`);
      report.push('`npm run lint` reported issues:');
      report.push('<details><summary>Show Lint Output</summary>');
      report.push('');
      report.push('```');
      report.push(lintResult.stdout);
      report.push(lintResult.stderr);
      report.push('```');
      report.push('</details>');
    } else {
      report.push(`## ✅ Linter`);
      report.push(`All lint checks passed.`);
    }

    // 4. Unit Tests
    log('Running unit tests...');
    const testResult = runCommand('npm', ['run', 'test:unit']);
    if (testResult.status !== 0) {
      report.push(`## ❌ Test Failures`);
      report.push('`npm run test:unit` failed. Inspect the stack traces below.');
      report.push('<details><summary>Show Test Output</summary>');
      report.push('');
      report.push('```');
      report.push(testResult.stdout.slice(-5000)); // Last 5000 chars
      report.push(testResult.stderr.slice(-5000));
      report.push('```');
      report.push('</details>');
    } else {
      report.push(`## ✅ Tests`);
      report.push(`Unit tests passed.`);
    }

    // 5. Sensitive Files Check
    const changedFiles = getChangedFiles();
    const sensitiveChanges = changedFiles.filter(file =>
      SENSITIVE_PATTERNS.some(pattern => file.match(pattern))
    );

    if (sensitiveChanges.length > 0) {
      report.push(`## 🔒 Security Review Required`);
      report.push(`This PR modifies sensitive files. **requires-security-review**, **requires-protocol-review**`);
      report.push('<ul>');
      sensitiveChanges.forEach(f => report.push(`<li>${f}</li>`));
      report.push('</ul>');
    }

    // Summary Recommendation
    report.push('## Summary');
    if (formattedFiles.length > 0 && lintResult.status === 0 && testResult.status === 0) {
      report.push('**Suggestion:** Apply `npm run format` and re-run tests.');
      report.push('Changes are only formatting related.');
    } else if (lintResult.status !== 0 || testResult.status !== 0) {
      report.push('**Status:** Changes requested. Please fix linter/test failures.');
    } else {
      report.push('**Status:** Checks passed. Ready for review.');
    }

    // Output
    fs.writeFileSync(LOG_FILE, report.join('\n'));
    log(`Report generated at ${LOG_FILE}`);
    console.log('\n--- REPORT PREVIEW ---\n');
    console.log(report.join('\n'));

    // Cleanup changes if we don't want to keep them?
    // The instructions say "offer to auto-commit".
    // I won't cleanup automatically. I'll leave it to the user.
    // But if I switched branches, I should switch back?
    // If I switched branches, the changes are now in that branch's working tree.
    // Switching back with dirty tree might fail.

    if (formattedFiles.length > 0 && !process.argv.includes('--apply-fixes')) {
        log('\nRunning: git checkout . (reverting formatting changes for safety)');
        execSync('git checkout .');
    }

    if (originalBranch) {
      log(`Switching back to original branch: ${originalBranch}`);
      execSync(`git checkout ${originalBranch}`);
    }

  } catch (error) {
    console.error('An error occurred during review:', error);
    if (originalBranch) execSync(`git checkout ${originalBranch}`);
    process.exit(1);
  }
}

main();
