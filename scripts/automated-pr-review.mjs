import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Configurations
const SENSITIVE_PATHS = [
  /^js\/nostr\//,
  /^js\/storage\//,
  /^js\/dmDecryptor\.js$/
];

function runCommand(command, args = [], options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  return spawnSync(command, args, { stdio: 'pipe', encoding: 'utf-8', ...options });
}

function getChangedFiles() {
  try {
    const baseRef = process.env.GITHUB_BASE_REF || 'main';
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
        execSync(`git fetch ${remote} ${baseRef}`, { stdio: 'ignore' });
      } catch (e) {
        console.error(`Failed to fetch ${remote}/${baseRef}:`, e.message);
      }
    } else {
      // Fallback for local testing or if env var missing
      try {
        execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'ignore' });
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
    console.error('Error getting changed files:', error.message);
    // Fallback: try 2-dot diff if 3-dot failed (e.g. shallow clone issues)
    try {
       const baseRef = process.env.GITHUB_BASE_REF || 'main';
       const remote = process.env.GITHUB_BASE_REPO_URL ? 'upstream' : 'origin';
       const cmd = `git diff --name-only ${remote}/${baseRef} HEAD`;
       console.log(`Retrying with 2-dot diff: ${cmd}`);
       const output = execSync(cmd, { encoding: 'utf-8' });
       return output.split('\n').filter(Boolean).map(f => f.trim());
    } catch (e) {
       console.error('Fallback diff failed:', e.message);
       return [];
    }
  }
}

async function main() {
  console.log('Starting Automated PR Review...');
  let commentBody = '## 🤖 Automated PR Review\n\n';
  let hasFailures = false;
  let hasFormatChanges = false;
  let microFixesStatus = '';

  // 1. Install Dependencies
  if (process.env.CI) {
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
  }

  // 4. Unit Tests
  console.log('Running unit tests...');
  const testRes = runCommand('npm', ['run', 'test:unit']);
  if (testRes.status !== 0) {
    hasFailures = true;
    commentBody += '### ❌ Test Failures\n\n';
    commentBody += '```\n' + testRes.stdout + '\n' + testRes.stderr + '\n```\n\n';
    commentBody += '> **Suggestion:** Inspect the stack trace above. Run `npm run test:unit` locally to reproduce.\n\n';
  } else {
    commentBody += '### ✅ Tests Passed\n\nAll unit tests passed.\n\n';
  }

  // 5. Security/Protocol Review Flags
  const changedFiles = getChangedFiles();
  const sensitiveChanges = changedFiles.filter(file =>
    SENSITIVE_PATHS.some(pattern => pattern.test(file))
  );

  if (sensitiveChanges.length > 0) {
    commentBody += '### 🛡️ Guardrails\n\n';
    commentBody += 'This PR modifies sensitive files. **Security and Protocol Review Required.**\n';
    commentBody += '`requires-security-review` `requires-protocol-review`\n\n';
    commentBody += '<details><summary>Sensitive Files Touched</summary>\n\n';
    sensitiveChanges.forEach(f => commentBody += `- ${f}\n`);
    commentBody += '\n</details>\n\n';
  }

  // 6. Post Comment (if in CI)
  if (process.env.GITHUB_TOKEN && process.env.PR_NUMBER) {

    // Attempt Micro-fixes
    if (hasFormatChanges) {
        console.log('Attempting to commit formatting fixes...');
        try {
            execSync('git config user.name "bitvid-agent"');
            execSync('git config user.email "agent@bitvid.network"');
            execSync('git add .');
            execSync('git commit -m "fix(ai): formatting (agent)"');
            execSync('git push');

            commentBody += '> **✅ Micro-fixes applied:** Formatting fixes have been committed to this branch.\n\n';
        } catch (e) {
            console.error('Failed to auto-commit/push:', e.message);
            commentBody += '> **ℹ️ Micro-fixes available:** Formatting issues were found, but I could not automatically commit the fixes (likely due to permissions on a fork). Please run `npm run format` locally and push.\n\n';
        }
    }

    console.log('Posting comment to PR #' + process.env.PR_NUMBER);
    try {
      const gh = spawnSync('gh', ['pr', 'comment', process.env.PR_NUMBER, '-F', '-'], {
        input: commentBody,
        stdio: ['pipe', 'inherit', 'inherit']
      });

      if (gh.status !== 0) {
          console.error('Failed to post comment via gh CLI');
      }
    } catch (e) {
      console.error('Error posting comment:', e);
    }

  } else {
    console.log('Not in CI or missing tokens. Printing report to stdout:');
    console.log('---------------------------------------------------');
    console.log(commentBody);
    console.log('---------------------------------------------------');
  }

  if (hasFailures) {
    process.exit(1);
  }
}

main();
