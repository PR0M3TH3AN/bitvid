import { spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPORT_FILE = 'PR_REVIEW.md';
const APPLY_FIXES = process.argv.includes('--apply-fixes');

function run(command, args, opts = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  return spawnSync(command, args, { encoding: 'utf-8', stdio: 'pipe', ...opts });
}

function getDiffFiles() {
  try {
    // Try to compare against origin/main, fallback to HEAD~1 or just check current changes if no upstream
    // Since this runs on a checkout, we want to see what this branch touches compared to main.
    // If origin/main is not available, we might fail.
    const hasMain = run('git', ['rev-parse', '--verify', 'origin/main']).status === 0;
    const base = hasMain ? 'origin/main' : 'HEAD';

    // Check if we are on main? No, we are on a PR branch usually.
    // We want the diff of the *current* code vs main.
    const res = run('git', ['diff', '--name-only', base, 'HEAD']);
    if (res.error || res.status !== 0) return [];
    return res.stdout.trim().split('\n').filter(Boolean);
  } catch (e) {
    console.error("Error getting diff:", e);
    return [];
  }
}

function main() {
  const report = [];
  report.push('# Automated PR Review');
  report.push(`Date: ${new Date().toISOString()}`);
  report.push('');

  // 1. npm ci
  console.log('Running npm ci...');
  const ci = run('npm', ['ci']);
  if (ci.status !== 0) {
    report.push('## 🚨 Dependency Install Failed');
    report.push('```');
    report.push(ci.stderr || ci.stdout);
    report.push('```');
    // If ci fails, we probably can't run other scripts, but we try.
  } else {
    report.push('## ✅ Dependencies Installed');
  }

  // 2. Format
  console.log('Running npm run format...');
  run('npm', ['run', 'format']); // This modifies files

  const status = run('git', ['status', '--porcelain']).stdout;
  const formattedFiles = status.split('\n').filter(l => l.trim()).map(l => l.slice(3));

  if (formattedFiles.length > 0) {
    report.push('## ⚠️ Formatting Changes');
    report.push('The following files were reformatted:');
    report.push(formattedFiles.map(f => `- ${f}`).join('\n'));

    if (APPLY_FIXES) {
      console.log('Applying formatting fixes...');
      run('git', ['add', '.']);
      run('git', ['commit', '-m', 'fix(ai): automated formatting (agent)']);
      report.push('\n**Changes have been automatically committed.**');
    } else {
      report.push('\n**Run `npm run format` to fix these issues.**');
    }
  } else {
    report.push('## ✅ Formatting Passed');
  }

  // 3. Lint
  console.log('Running npm run lint...');
  const lint = run('npm', ['run', 'lint']);
  if (lint.status !== 0) {
    report.push('## ⚠️ Lint Warnings/Errors');
    report.push('<details><summary>Show Lint Output</summary>');
    report.push('');
    report.push('```');
    report.push(lint.stdout + '\n' + lint.stderr);
    report.push('```');
    report.push('</details>');
  } else {
    report.push('## ✅ Lint Passed');
  }

  // 4. Unit Tests
  console.log('Running npm run test:unit...');
  const test = run('npm', ['run', 'test:unit']);
  if (test.status !== 0) {
    report.push('## ❌ Unit Tests Failed');
    report.push('<details><summary>Show Test Output</summary>');
    report.push('');
    report.push('```');
    report.push(test.stdout + '\n' + test.stderr);
    report.push('```');
    report.push('</details>');
  } else {
    report.push('## ✅ Unit Tests Passed');
  }

  // 5. Guardrails
  const diffFiles = getDiffFiles();
  const sensitivePatterns = [
    /^js\/nostr\//,
    /^js\/services\/storageService/,
    /^js\/services\/r2Service/,
    /crypto/i
  ];

  const sensitiveChanges = diffFiles.filter(f => sensitivePatterns.some(p => p.test(f)));

  if (sensitiveChanges.length > 0) {
    report.push('## 🛡️ Security & Protocol Review Required');
    report.push('The following sensitive files were modified:');
    report.push(sensitiveChanges.map(f => `- ${f}`).join('\n'));
    report.push('\n**Flags:** `requires-security-review`, `requires-protocol-review`');
  }

  fs.writeFileSync(REPORT_FILE, report.join('\n'));
  console.log(`Report generated at ${REPORT_FILE}`);
}

main();
