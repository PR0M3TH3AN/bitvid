import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Configurations
const SENSITIVE_PATHS = [
  /^js\/nostr\//,
  /^js\/storage\//,
  /^js\/auth\//,
  /^js\/dmDecryptor\.js$/,
  /^js\/magnetUtils\.js$/,
  /^js\/nostr\/adapters\/nip07Adapter\.js$/,
  /^js\/services\/storageService\.js$/,
  /^js\/services\/attachmentService\.js$/,
  /^js\/services\/hashtagPreferencesService\.js$/,
  /^js\/utils\/storage\.js$/
];

function runCommand(command, args = [], options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf-8', ...options });

  if (result.error) {
    throw new Error(`Failed to execute command "${command}": ${result.error.message}`);
  }
  return result;
}

function getChangedFiles(baseRef) {
  try {
    const baseUrl = process.env.GITHUB_BASE_REPO_URL;
    let remote = 'origin';

    if (baseUrl) {
      remote = 'upstream';
      try {
        execSync(`git remote add upstream ${baseUrl}`, { stdio: 'ignore' });
      } catch (e) {
        // Ignore if remote already exists
      }
      console.log(`Fetching ${remote}/${baseRef} from ${baseUrl}...`);
      try {
        execSync(`git fetch ${remote} ${baseRef}`, { stdio: 'pipe', encoding: 'utf-8' });
      } catch (e) {
        console.error(`Failed to fetch ${remote}/${baseRef}:`, e.stderr || e.message);
      }
    } else {
      // Fallback for local testing or if env var missing
      try {
        execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'pipe', encoding: 'utf-8' });
      } catch (e) {
        // Ignore
      }
    }

    // We want the files changed in this PR.
    // Use 3-dot diff to compare HEAD against the merge base with upstream
    const cmd = `git diff --name-only ${remote}/${baseRef}...HEAD`;
    console.log(`Running diff: ${cmd}`);
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output.split('\n').filter(Boolean).map(f => f.trim());
  } catch (error) {
    console.error('Error getting changed files:', error.stderr || error.message);
    // Fallback: try 2-dot diff if 3-dot failed (e.g. shallow clone issues)
    try {
       const remote = process.env.GITHUB_BASE_REPO_URL ? 'upstream' : 'origin';
       const cmd = `git diff --name-only ${remote}/${baseRef} HEAD`;
       console.log(`Retrying with 2-dot diff: ${cmd}`);
       const output = execSync(cmd, { encoding: 'utf-8' });
       return output.split('\n').filter(Boolean).map(f => f.trim());
    } catch (e) {
       console.error('Fallback diff failed:', e.stderr || e.message);
       return [];
    }
  }
}

function checkReleaseChannel(changedFiles, baseRef) {
  const warnings = [];

  if (baseRef === 'main') {
    const criticalFiles = ['js/constants.js', 'config/instance-config.js'];
    const modifiedCriticalFiles = changedFiles.filter(f => criticalFiles.includes(f));

    if (modifiedCriticalFiles.length > 0) {
      warnings.push(`⚠️ **Release Channel Warning**: This PR targets \`main\` but modifies the following critical configuration files: ${modifiedCriticalFiles.map(f => `\`${f}\``).join(', ')}.`);
      warnings.push(`> **Guidance:** \`main\` is the production track. Ensure feature flags in \`js/constants.js\` are set to safe defaults (usually \`false\`) and \`config/instance-config.js\` has production-appropriate settings (e.g. \`IS_DEV_MODE\`).`);
    }
  } else if (baseRef === 'unstable') {
     const criticalFiles = ['js/constants.js'];
     const modifiedCriticalFiles = changedFiles.filter(f => criticalFiles.includes(f));
     if (modifiedCriticalFiles.length > 0) {
         warnings.push(`ℹ️ **Release Channel Info**: This PR targets \`unstable\`.`);
         warnings.push(`> **Guidance:** \`unstable\` is the experimentation lane. If you are adding risky behavior, gate it behind feature flags in \`js/constants.js\` and document the toggle/rollback plan. See \`AGENTS.md\` for details.`);
     }
  }
  return warnings;
}

async function reviewPR(prNumber, baseRef) {
  console.log(`Starting Automated PR Review for PR #${prNumber} (base: ${baseRef})...`);
  let commentBody = '## 🤖 Automated PR Review\n\n';
  let hasFailures = false;
  let hasFormatChanges = false;

  // 1. Install Dependencies
  if (process.env.CI || process.argv.includes('--force-ci')) {
      runCommand('npm', ['ci']);
  }

  // 2. Format
  console.log('Checking formatting...');
  const formatRes = runCommand('npm', ['run', 'format']);
  try {
    const diff = execSync('git diff --name-only', { encoding: 'utf-8' });
    if (diff.trim().length > 0) {
      hasFormatChanges = true;
      commentBody += '### 🎨 Formatting\n\n';
      commentBody += 'Formatting changes detected.\n\n';
    }
  } catch (e) {
    console.error('Error checking git diff for format:', e);
  }

  // 3. Lint
  console.log('Running lint...');
  const lintRes = runCommand('npm', ['run', 'lint']);
  if (lintRes.status !== 0) {
    hasFailures = true;
    commentBody += '### ⚠️ Lint Warnings/Errors\n\n';
    commentBody += '```\n' + lintRes.stdout + '\n' + lintRes.stderr + '\n```\n\n';

    if (lintRes.stdout.includes('stylelint') || lintRes.stderr.includes('stylelint')) {
       commentBody += '> **💡 Tip:** Try running `npm run lint:css -- --fix` to automatically resolve some style issues.\n\n';
    }
  }

  // 4. Unit Tests
  console.log('Running unit tests...');
  const testRes = runCommand('npm', ['run', 'test:unit']);
  if (testRes.status !== 0) {
    hasFailures = true;
    commentBody += '### ❌ Test Failures\n\n';
    commentBody += '```\n' + testRes.stdout + '\n' + testRes.stderr + '\n```\n\n';

    // Extract failing test files
    const failingTests = [];
    const failureRegex = /✖\s+(tests\/[\w\-\.\/]+)\s+failed with exit code 1/g;
    let match;
    while ((match = failureRegex.exec(testRes.stdout + '\n' + testRes.stderr)) !== null) {
        failingTests.push(match[1]);
    }

    if (failingTests.length > 0) {
        commentBody += `> **Suggested areas to inspect:** ${failingTests.map(f => `\`${f}\``).join(', ')}\n`;
    }
    commentBody += '> **Suggestion:** Inspect the stack trace above. Run `npm run test:unit` locally to reproduce.\n\n';
  } else {
    commentBody += '### ✅ Tests Passed\n\nAll unit tests passed.\n\n';
  }

  // 5. Security/Protocol Review Flags
  const changedFiles = getChangedFiles(baseRef);
  const sensitiveChanges = changedFiles.filter(file =>
    SENSITIVE_PATHS.some(pattern => pattern.test(file))
  );

  // Release Channel Check
  const channelWarnings = checkReleaseChannel(changedFiles, baseRef);
  if (channelWarnings.length > 0) {
      commentBody += '### 🚀 Release Channel Checks\n\n';
      channelWarnings.forEach(w => commentBody += `${w}\n\n`);
  }

  if (sensitiveChanges.length > 0) {
    commentBody += '### 🛡️ Guardrails\n\n';
    commentBody += 'This PR modifies sensitive files. **Security and Protocol Review Required.**\n';
    commentBody += '`requires-security-review` `requires-protocol-review`\n\n';
    commentBody += '<details><summary>Sensitive Files Touched</summary>\n\n';
    sensitiveChanges.forEach(f => commentBody += `- ${f}\n`);
    commentBody += '\n</details>\n\n';
  }

  // Audit Log
  commentBody += '### 📝 Audit Log\n\n';
  commentBody += '| Check | Status | Details |\n';
  commentBody += '| :--- | :--- | :--- |\n';
  commentBody += `| **Formatting** | ${hasFormatChanges ? '⚠️ Changes' : '✅ Pass'} | ${hasFormatChanges ? 'Fixes applied/suggested' : 'No issues'} |\n`;
  commentBody += `| **Lint** | ${lintRes.status === 0 ? '✅ Pass' : '⚠️ Warnings'} | ${lintRes.status === 0 ? '-' : 'See output above'} |\n`;
  commentBody += `| **Unit Tests** | ${testRes.status === 0 ? '✅ Pass' : '❌ Fail'} | ${testRes.status === 0 ? '-' : 'See failures above'} |\n`;
  commentBody += `| **Security** | ${sensitiveChanges.length > 0 ? '🛡️ Review Req' : '✅ Pass'} | ${sensitiveChanges.length > 0 ? `${sensitiveChanges.length} sensitive files` : 'No sensitive files'} |\n`;
  commentBody += `| **Release Channel** | ${channelWarnings.length > 0 ? '⚠️ Warning' : '✅ Pass'} | ${channelWarnings.length > 0 ? 'Critical config modified' : 'Safe'} |\n`;
  commentBody += '\n';

  // 6. Post Comment (if in CI)
  if (process.env.GITHUB_TOKEN && prNumber) {
    // Verify gh CLI is available
    console.log('Verifying GitHub CLI...');
    runCommand('gh', ['--version']);

    // Attempt Micro-fixes
    if (hasFormatChanges) {
        console.log('Attempting to commit formatting fixes...');
        try {
            execSync('git config user.name "bitvid-agent"');
            execSync('git config user.email "agent@bitvid.network"');
            execSync('git add .');
            execSync('git commit -m "fix(ai): formatting (agent) suggested"');
            execSync('git push');

            commentBody += '> **✅ Micro-fixes applied:** Formatting fixes have been committed to this branch.\n\n';
        } catch (e) {
            console.error('Failed to push to PR branch:', e.message);

            // Fallback: Create a new branch and open a PR
            try {
                console.log('Attempting to create a follow-up PR with fixes...');
                const fixBranchName = `agent-fix/pr-${prNumber}-${Date.now()}`;

                // Push the current HEAD (with fixes) to a new branch on origin
                execSync(`git push origin HEAD:refs/heads/${fixBranchName}`);

                const prTitle = `fix(ai): formatting fixes for PR #${prNumber}`;
                const prBody = `This PR applies automated formatting fixes for PR #${prNumber}.`;

                const ghCmd = ['pr', 'create', '--base', baseRef, '--head', fixBranchName, '--title', prTitle, '--body', prBody];
                const ghRes = spawnSync('gh', ghCmd, { encoding: 'utf-8' });

                if (ghRes.status === 0) {
                     const newPrUrl = ghRes.stdout.trim();
                     commentBody += `> **ℹ️ Micro-fixes available:** I could not push to your branch, but I have created a follow-up PR with the fixes: ${newPrUrl}\n\n`;
                } else {
                     throw new Error(`gh pr create failed: ${ghRes.stderr}`);
                }

            } catch (fallbackError) {
                console.error('Failed to create follow-up PR:', fallbackError.message);
                commentBody += '> **ℹ️ Micro-fixes available:** Formatting issues were found. Please apply `npm run format` and re-run tests.\n\n';
            }
        }
    }

    console.log('Posting comment to PR #' + prNumber);
    try {
      const gh = spawnSync('gh', ['pr', 'comment', prNumber, '-F', '-'], {
        input: commentBody,
        stdio: ['pipe', 'inherit', 'inherit']
      });

      if (gh.status !== 0) {
          console.error('Failed to post comment via gh CLI');
      }
    } catch (e) {
      console.error('Error posting comment:', e);
    }

  }

  // Always print the report to stdout
  console.log('---------------------------------------------------');
  console.log(`PR Review Report for PR #${prNumber}:`);
  console.log(commentBody);
  console.log('---------------------------------------------------');

  if (hasFailures) {
    throw new Error('Lint or Test failures detected.');
  }
}

async function main() {
  try {
    const isAll = process.argv.includes('--all');

    if (isAll) {
      console.log('Fetching all open PRs...');
      // Get list of open PRs
      const listCmd = ['pr', 'list', '--state', 'open', '--json', 'number,baseRefName,headRefName'];
      const result = spawnSync('gh', listCmd, { encoding: 'utf-8' });

      if (result.error || result.status !== 0) {
        throw new Error(`Failed to list PRs: ${result.stderr || result.error?.message}`);
      }

      const prs = JSON.parse(result.stdout);
      console.log(`Found ${prs.length} open PRs.`);

      let hasGlobalFailures = false;

      // Save current branch to restore later
      let originalBranch;
      try {
        originalBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      } catch (e) {
        // Ignore
      }

      for (const pr of prs) {
        try {
          console.log(`\n=== Processing PR #${pr.number} ===`);

          // Checkout PR
          runCommand('gh', ['pr', 'checkout', pr.number]);

          // Run Review
          await reviewPR(pr.number, pr.baseRefName);

        } catch (e) {
          console.error(`❌ Failed to process PR #${pr.number}:`, e.message);
          hasGlobalFailures = true;
          // Continue to next PR
        } finally {
            // Clean up or reset if needed?
            // Since we use gh pr checkout, we are on a different branch.
            // Next iteration will checkout another branch.
        }
      }

      if (originalBranch) {
        console.log(`Restoring original branch: ${originalBranch}`);
        try {
            execSync(`git checkout ${originalBranch}`);
        } catch(e) {
            console.error('Failed to restore original branch');
        }
      }

      if (hasGlobalFailures) {
        process.exit(1);
      }

    } else {
      const prNumber = process.env.PR_NUMBER;
      const baseRef = process.env.GITHUB_BASE_REF || 'main';

      if (prNumber) {
          await reviewPR(prNumber, baseRef);
      } else {
          // Local run or manual invocation without specific PR env vars
          console.log('No PR_NUMBER found and no --all flag. Running local review against ' + baseRef);
          await reviewPR('local', baseRef);
      }
    }
  } catch (error) {
    console.error('Automated PR Review failed:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error in main execution:', error);
  process.exit(1);
});
