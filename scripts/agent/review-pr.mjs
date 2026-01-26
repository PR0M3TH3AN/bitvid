import { spawnSync } from 'child_process';
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
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
    ...options
  });
}

function checkGhAvailability() {
  try {
    const res = runCommand('gh', ['--version']);
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

function getChangedFiles(baseBranch = 'origin/main') {
  try {
    const res = runCommand('git', ['diff', '--name-only', `${baseBranch}...HEAD`]);
    if (res.status !== 0) {
        // Fallback: use local changes
        const local = runCommand('git', ['diff', '--name-only', 'HEAD']);
        return local.stdout ? local.stdout.trim().split('\n').filter(Boolean) : [];
    }
    return res.stdout.trim().split('\n').filter(Boolean);
  } catch (error) {
    log(`Warning: Could not determine changed files. Using local changes if any.`);
    return [];
  }
}

async function reviewContext(contextName, options) {
  const report = [];
  report.push(`# Automated PR Review & Suggested Improvements`);
  report.push(`**Context:** ${contextName}`);
  report.push(`**Date:** ${new Date().toISOString()}`);
  report.push('');

  // Release Channel Guidance
  if (options.baseBranch) {
      report.push(`## ℹ️ Release Channel Guidance`);
      if (options.baseBranch === 'main') {
         report.push('**Target: Main (Production)**');
         report.push('- Commits must be atomic.');
         report.push('- No destructive migrations.');
         report.push('- Feature flags must default to `false`.');
         report.push('- Ensure UX and magnet safety guarantees are preserved.');
      } else if (options.baseBranch === 'unstable') {
         report.push('**Target: Unstable (Experimentation)**');
         report.push('- Gate risky behavior behind feature flags (`js/constants.js`).');
         report.push('- Document toggle/rollback plans in PR description.');
      } else {
         report.push(`Target: ${options.baseBranch}`);
         report.push('Please refer to `AGENTS.md` for release channel guidance.');
      }
      report.push('');
  }

  let failed = false;

  try {
    // 1. Install dependencies
    if (!options.noInstall) {
      log('Installing dependencies (npm ci)...');
      const ciResult = runCommand('npm', ['ci'], { shell: true });
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
      runCommand('npm', ['run', 'format'], { shell: true });
      const gitStatus = runCommand('git', ['status', '--porcelain']);
      const formattedFiles = gitStatus.stdout.split('\n')
        .filter(line => line.match(/^ M/)) // Modified files
        .map(line => line.substring(3).trim());

      if (formattedFiles.length > 0) {
        report.push(`## 🎨 Formatting Suggestions`);
        report.push(`The following files need formatting:`);
        report.push('<ul>');
        formattedFiles.forEach(f => report.push(`<li>${f}</li>`));
        report.push('</ul>');
        report.push('');

        // Fast-path suggestion
        report.push('**Suggestion:** apply `npm run format` and re-run tests');

        if (options.applyFixes) {
          try {
            log('Applying formatting fixes...');
            runCommand('git', ['add', '.']);
            // Explicit wording: fix(ai): <short> (agent)
            runCommand('git', ['commit', '-m', 'fix(ai): formatting (agent)']);

            log('Pushing changes...');
            const pushResult = runCommand('git', ['push']);

            if (pushResult.status === 0) {
                 report.push('**Action:** Applied and pushed formatting fixes (agent).');
            } else {
                 log(`Push failed: ${pushResult.stderr}`);
                 report.push('**Action:** Applied formatting fixes locally, but failed to push.');
                 report.push(`**Error:** ${pushResult.stderr}`);

                 if (checkGhAvailability()) {
                      const newBranch = `fix/ai-formatting-${Date.now()}`;
                      log(`Attempting fallback: creating new branch ${newBranch}...`);
                      runCommand('git', ['checkout', '-b', newBranch]);
                      const pushNew = runCommand('git', ['push', '-u', 'origin', newBranch]);
                      if (pushNew.status === 0) {
                          log('Creating fallback PR...');
                          const prRes = spawnSync('gh', ['pr', 'create', '--title', 'fix(ai): formatting (agent)', '--body', 'Automated formatting fixes.', '--fill'], { encoding: 'utf-8' });
                          if (prRes.status === 0) {
                              report.push(`**Action:** Created follow-up PR: ${prRes.stdout.trim()}`);
                          } else {
                              report.push(`**Error:** Failed to create follow-up PR: ${prRes.stderr}`);
                          }
                      }
                 }
            }
          } catch (e) {
            log(`Error applying fixes: ${e.message}`);
            report.push(`**Error:** Failed to apply formatting fixes: ${e.message}`);
          }
        } else {
           // If we're not applying fixes, we should revert the formatting changes so they don't affect subsequent steps?
           // However, keeping them might be good for running tests on clean code?
           // But if tests rely on formatting (unlikely), it matters.
           // Usually we revert so the working tree matches the PR state for further analysis.
           runCommand('git', ['checkout', '.'], { stdio: 'ignore' });
        }
      } else {
        report.push(`## ✅ Formatting`);
        report.push(`No formatting issues found.`);
      }
    }

    // 3. Lint
    if (!failed) {
      log('Running linter...');
      const lintResult = runCommand('npm', ['run', 'lint'], { shell: true });
      if (lintResult.status !== 0) {
        report.push(`## ⚠️ Linter Warnings/Errors`);
        report.push('`npm run lint` reported issues:');

        // Extract lines with "Error" or "Warning"
        const lines = (lintResult.stdout + '\n' + lintResult.stderr).split('\n');
        const issues = lines.filter(l => l.match(/error|warning/i)).slice(0, 20); // Limit to 20

        report.push('<details><summary>Show Lint Output</summary>');
        report.push('');
        report.push('```');
        if (issues.length > 0) {
            report.push(issues.join('\n'));
            if (lines.length > issues.length) report.push('...');
        } else {
            report.push(lintResult.stdout.slice(-1000));
            report.push(lintResult.stderr.slice(-1000));
        }
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
      const testResult = runCommand('npm', ['run', 'test:unit'], { shell: true, timeout: 300000 });
      if (testResult.error && testResult.error.code === 'ETIMEDOUT') {
         report.push(`## ❌ Test Timeout`);
         report.push('`npm run test:unit` timed out after 5 minutes.');
      } else if (testResult.status !== 0) {
        report.push(`## ❌ Test Failures`);
        report.push('`npm run test:unit` failed.');

        // Analyze stdout for failing test file
        // Expecting "→ Running tests/..." lines.
        const output = testResult.stdout || '';
        const runningLines = output.match(/→ Running (.*)/g);
        let lastTest = 'Unknown';
        if (runningLines && runningLines.length > 0) {
            lastTest = runningLines[runningLines.length - 1].replace('→ Running ', '').trim();
        }

        report.push(`**Possible culprit:** \`${lastTest}\``);
        report.push('Suggested area to inspect: check the stack trace below for the failing assertion.');

        report.push('<details><summary>Show Test Output</summary>');
        report.push('');
        report.push('```');
        // Capture context around the failure?
        // Usually the end of stdout has the failure.
        report.push(output.slice(-3000));
        report.push((testResult.stderr || '').slice(-3000));
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
      report.push(`This PR modifies sensitive files.`);
      report.push(`**Flags:** \`requires-security-review\`, \`requires-protocol-review\``);
      report.push('<ul>');
      sensitiveChanges.forEach(f => report.push(`<li>${f}</li>`));
      report.push('</ul>');
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
    log('Fetching open PRs...');
    try {
        const prsJson = runCommand('gh', ['pr', 'list', '--json', 'number,headRefName,baseRefName,url']);
        if (prsJson.status !== 0) throw new Error(prsJson.stderr);
        const prs = JSON.parse(prsJson.stdout);
        log(`Found ${prs.length} open PRs.`);

        for (const pr of prs) {
            log(`Checking out PR #${pr.number} (${pr.headRefName})...`);
            try {
                runCommand('gh', ['pr', 'checkout', pr.number]);
                // Pass baseBranch from PR details
                options.baseBranch = pr.baseRefName;
                const report = await reviewContext(`PR #${pr.number}`, options);
                const tempFile = `pr_review_${pr.number}.md`;
                fs.writeFileSync(tempFile, report);
                log(`Posting comment to PR #${pr.number}...`);
                runCommand('gh', ['pr', 'comment', pr.number, '-F', tempFile]);
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
          // Fetch base branch first
          const viewRes = runCommand('gh', ['pr', 'view', options.pr, '--json', 'baseRefName']);
          if (viewRes.status === 0) {
              const prDetails = JSON.parse(viewRes.stdout);
              options.baseBranch = prDetails.baseRefName;
          }

          const res = runCommand('gh', ['pr', 'checkout', options.pr]);
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
      let originalBranch;
      if (branchArg) {
          try {
              originalBranch = runCommand('git', ['branch', '--show-current']).stdout.trim();
              const res = runCommand('git', ['checkout', branchArg]);
              if (res.status !== 0) throw new Error(`Could not checkout ${branchArg}`);
          } catch(e) {
              console.error(e.message);
              process.exit(1);
          }
      }

      const currentBranch = runCommand('git', ['branch', '--show-current']).stdout.trim();
      // Logic for local run: can we guess the target?
      // Usually local run is 'against' something.
      // But we can just skip or default.

      const report = await reviewContext(currentBranch, options);

      console.log('\n--- REPORT ---\n');
      console.log(report);
      fs.writeFileSync(LOG_FILE, report);
      log(`Report saved to ${LOG_FILE}`);

      if (originalBranch) {
          runCommand('git', ['checkout', originalBranch]);
      }
  }
}

main();
