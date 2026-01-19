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
  console.log(`[ReviewAgent] ${message}`);
}

function runCommand(command, args = [], options = {}) {
  log(`> Running: ${command} ${args.join(' ')}`);
  return spawnSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false, // Turn off shell for security unless needed, but spawnSync defaults to false.
    // However, if I used shell: true before, args might need care.
    // If shell is false, args are safe.
    ...options
  });
}

function checkGhAvailability() {
  try {
    const res = spawnSync('gh', ['--version'], { encoding: 'utf-8' });
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

function getChangedFiles(baseBranch = 'origin/main') {
  try {
    const res = spawnSync('git', ['diff', '--name-only', `${baseBranch}...HEAD`], { encoding: 'utf-8' });
    if (res.status !== 0) throw new Error(res.stderr);
    return res.stdout.trim().split('\n').filter(Boolean);
  } catch (error) {
    log(`Warning: Could not determine changed files against ${baseBranch}. Using local changes if any.`);
    return [];
  }
}

async function reviewContext(contextName, options) {
  const report = [];
  report.push(`# Automated PR Review`);
  report.push(`**Context:** ${contextName}`);
  report.push(`**Date:** ${new Date().toISOString()}`);
  report.push('');

  let failed = false;

  try {
    // 1. Install dependencies
    if (!options.noInstall) {
      log('Installing dependencies (npm ci)...');
      // On Windows, npm is a cmd. Using shell: true might be needed for 'npm' command,
      // or use 'npm.cmd'. Linux is fine.
      // Safe to use shell: true for static commands.
      const ciResult = spawnSync('npm', ['ci'], { encoding: 'utf-8', shell: true });
      if (ciResult.status !== 0) {
        report.push(`## 🚨 Dependency Installation Failed`);
        report.push('`npm ci` failed. Please check `package-lock.json`.');
        report.push('```');
        report.push(ciResult.stderr ? ciResult.stderr.slice(-1000) : 'Unknown error');
        report.push('```');
        failed = true;
      }
    } else {
      log('Skipping dependency installation (--no-install).');
    }

    // 2. Format
    if (!failed) {
      log('Running formatter...');
      spawnSync('npm', ['run', 'format'], { shell: true });
      const gitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf-8' });
      const formattedFiles = gitStatus.stdout.split('\n')
        .filter(line => line.match(/^ M/)) // Modified files
        .map(line => line.substring(3).trim());

      if (formattedFiles.length > 0) {
        report.push(`## 🎨 Formatting Suggestions`);
        report.push(`The following files need formatting. Run \`npm run format\` to fix.`);
        report.push('<ul>');
        formattedFiles.forEach(f => report.push(`<li>${f}</li>`));
        report.push('</ul>');
        report.push('');

        // Fast-path suggestion
        report.push('**Suggestion:** Apply `npm run format` and re-run tests.');

        if (options.applyFixes) {
          try {
            log('Applying formatting fixes...');
            runCommand('git', ['add', '.']);
            runCommand('git', ['commit', '-m', 'fix(ai): formatting (agent)']);

            log('Pushing changes...');
            const pushResult = runCommand('git', ['push']);

            if (pushResult.status === 0) {
                 report.push('**Action:** Applied and pushed formatting fixes (agent).');
            } else {
                 log(`Push failed: ${pushResult.stderr}`);
                 report.push('**Action:** Applied formatting fixes locally, but failed to push.');
                 report.push(`**Error:** ${pushResult.stderr}`);

                 // Attempt fallback: Create new branch?
                 // If we are in a detached HEAD or locked branch, pushing might fail.
                 // "open a follow-up PR if you could not directly update the PR branch"
                 // If we have GH CLI...
                 if (checkGhAvailability()) {
                      const newBranch = `fix/ai-formatting-${Date.now()}`;
                      log(`Attempting fallback: creating new branch ${newBranch}...`);
                      runCommand('git', ['checkout', '-b', newBranch]);
                      const pushNew = runCommand('git', ['push', '-u', 'origin', newBranch]);
                      if (pushNew.status === 0) {
                          // Create PR
                          log('Creating fallback PR...');
                          // We need to target the original branch? Or main?
                          // Let's target the current context if possible.
                          // But we don't know the original target easily without GH CLI.
                          // We'll just create a PR against default.
                          const prRes = spawnSync('gh', ['pr', 'create', '--title', 'fix(ai): formatting (agent)', '--body', 'Automated formatting fixes.', '--fill'], { encoding: 'utf-8' });
                          if (prRes.status === 0) {
                              report.push(`**Action:** Created follow-up PR: ${prRes.stdout.trim()}`);
                          } else {
                              report.push(`**Error:** Failed to create follow-up PR: ${prRes.stderr}`);
                          }
                      } else {
                           report.push(`**Error:** Failed to push fallback branch: ${pushNew.stderr}`);
                      }

                      // Switch back?
                      // reviewContext usually assumes we stay on the branch or restore.
                 }
            }

          } catch (e) {
            log(`Error applying fixes: ${e.message}`);
            report.push(`**Error:** Failed to apply formatting fixes: ${e.message}`);
          }
        } else {
           // Revert changes so checking other things is clean?
           // If we don't apply fixes, we should revert.
        }
      } else {
        report.push(`## ✅ Formatting`);
        report.push(`No formatting issues found.`);
      }
    }

    // 3. Lint
    if (!failed) {
      log('Running linter...');
      const lintResult = spawnSync('npm', ['run', 'lint'], { encoding: 'utf-8', shell: true });
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

        if (lintResult.stdout && lintResult.stdout.includes('Design token lint failed')) {
            report.push('**Note:** Design token violations detected. Please check `css/tokens.css`.');
        }
      } else {
        report.push(`## ✅ Linter`);
        report.push(`All lint checks passed.`);
      }
    }

    // 4. Unit Tests
    if (!failed) {
      log('Running unit tests...');
      const testResult = spawnSync('npm', ['run', 'test:unit'], { encoding: 'utf-8', shell: true, timeout: 300000 });
      if (testResult.error && testResult.error.code === 'ETIMEDOUT') {
         report.push(`## ❌ Test Timeout`);
         report.push('`npm run test:unit` timed out after 5 minutes.');
      } else if (testResult.status !== 0) {
        report.push(`## ❌ Test Failures`);
        report.push('`npm run test:unit` failed. Inspect the stack traces below.');
        report.push('<details><summary>Show Test Output</summary>');
        report.push('');
        report.push('```');
        report.push(testResult.stdout ? testResult.stdout.slice(-5000) : 'No stdout');
        report.push(testResult.stderr ? testResult.stderr.slice(-5000) : 'No stderr');
        report.push('```');
        report.push('</details>');
      } else {
        report.push(`## ✅ Tests`);
        report.push(`Unit tests passed.`);
      }
    }

    // 5. Sensitive Files
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

    // Cleanup formatting if not applied
    if (!options.applyFixes) {
        try {
            spawnSync('git', ['checkout', '.'], { stdio: 'ignore' });
        } catch (e) {}
    }

    return report.join('\n');

  } catch (error) {
    log(`Error reviewing ${contextName}: ${error.message}`);
    return `Error reviewing ${contextName}: ${error.message}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    noInstall: args.includes('--no-install'),
    applyFixes: args.includes('--apply-fixes'),
    all: args.includes('--all'),
    pr: args.indexOf('--pr') > -1 ? args[args.indexOf('--pr') + 1] : null,
  };

  const branchArg = args.find(a => !a.startsWith('--') && args.indexOf(a) !== args.indexOf('--pr') + 1);

  const ghAvailable = checkGhAvailability();

  if (options.all) {
    if (!ghAvailable) {
      console.error('Error: `gh` CLI not found. Cannot list open PRs.');
      process.exit(1);
    }
    // Fetch PRs
    log('Fetching open PRs...');
    try {
        const prsJson = spawnSync('gh', ['pr', 'list', '--json', 'number,headRefName,url'], { encoding: 'utf-8' });
        if (prsJson.status !== 0) throw new Error(prsJson.stderr);
        const prs = JSON.parse(prsJson.stdout);
        log(`Found ${prs.length} open PRs.`);

        for (const pr of prs) {
            log(`Checking out PR #${pr.number} (${pr.headRefName})...`);
            try {
                spawnSync('gh', ['pr', 'checkout', pr.number]);
                const report = await reviewContext(`PR #${pr.number}`, options);

                // Post comment
                const tempFile = `pr_review_${pr.number}.md`;
                fs.writeFileSync(tempFile, report);
                log(`Posting comment to PR #${pr.number}...`);
                spawnSync('gh', ['pr', 'comment', pr.number, '-F', tempFile]);
                fs.unlinkSync(tempFile);

            } catch (e) {
                log(`Failed to process PR #${pr.number}: ${e.message}`);
            }
        }
    } catch (e) {
        console.error('Error listing/processing PRs:', e);
        process.exit(1);
    }
  } else if (options.pr) {
      if (!ghAvailable) {
          console.error('Error: `gh` CLI not found.');
          process.exit(1);
      }
      log(`Checking out PR #${options.pr}...`);
      try {
          const res = spawnSync('gh', ['pr', 'checkout', options.pr], { encoding: 'utf-8' });
          if (res.status !== 0) throw new Error(res.stderr);

          const report = await reviewContext(`PR #${options.pr}`, options);
          console.log(report);

          fs.writeFileSync(LOG_FILE, report);
          log(`Report saved to ${LOG_FILE}`);

      } catch (e) {
          console.error(e);
          process.exit(1);
      }
  } else {
      // Current branch or specified branch
      let originalBranch;
      if (branchArg) {
          try {
              originalBranch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf-8' }).stdout.trim();
              const res = spawnSync('git', ['checkout', branchArg]);
              if (res.status !== 0) throw new Error(`Could not checkout ${branchArg}`);
          } catch(e) {
              console.error(e.message);
              process.exit(1);
          }
      }

      const currentBranch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf-8' }).stdout.trim();
      const report = await reviewContext(currentBranch, options);

      console.log('\n--- REPORT ---\n');
      console.log(report);
      fs.writeFileSync(LOG_FILE, report);
      log(`Report saved to ${LOG_FILE}`);

      if (originalBranch) {
          spawnSync('git', ['checkout', originalBranch]);
      }
  }
}

main();
