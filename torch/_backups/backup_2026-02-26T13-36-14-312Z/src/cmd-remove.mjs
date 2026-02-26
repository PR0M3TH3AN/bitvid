import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { TORCH_HOST_SCRIPTS } from './constants.mjs';

/**
 * Detects the TORCH install directory within a project.
 *
 * Strategy:
 * 1. If a 'torch/' directory exists with a roster.json or bin/, it's the install dir.
 * 2. If the current directory's package.json has name "torch-lock", installed to '.'.
 * 3. Returns null if TORCH is not detected.
 *
 * @param {string} cwd - The project root directory
 * @returns {string|null} - The install directory name ('torch', '.', etc.) or null
 */
export function detectTorchInstallDir(cwd) {
  // Check for 'torch/' subdirectory with TORCH markers
  const torchSubdir = path.join(cwd, 'torch');
  if (fs.existsSync(torchSubdir)) {
    const hasRoster = fs.existsSync(path.join(torchSubdir, 'roster.json'));
    const hasBin = fs.existsSync(path.join(torchSubdir, 'bin'));
    if (hasRoster || hasBin) {
      return 'torch';
    }
  }

  // Check if installed to current directory
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === 'torch-lock') {
        return '.';
      }
    } catch (_e) {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Removes a directory or file if it exists, logging the action.
 *
 * @param {string} target - Absolute path to remove
 * @param {string} label - Human-readable label for log output
 * @param {Function} log - Logging function
 * @returns {boolean} - True if something was removed
 */
export function removeIfExists(target, label, log) {
  if (!fs.existsSync(target)) return false;

  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
  } else {
    fs.unlinkSync(target);
  }
  log(`  Removed ${label}`);
  return true;
}

/**
 * Removes TORCH torch:* scripts from the host package.json.
 *
 * @param {string} hostRoot - Project root containing package.json
 * @param {Function} log - Logging function
 * @returns {boolean} - True if any scripts were removed
 */
export function removeHostScripts(hostRoot, log) {
  const hostPkgPath = path.join(hostRoot, 'package.json');
  if (!fs.existsSync(hostPkgPath)) return false;

  try {
    const raw = fs.readFileSync(hostPkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    if (!pkg.scripts) return false;

    let modified = false;
    for (const key of TORCH_HOST_SCRIPTS) {
      if (key in pkg.scripts) {
        delete pkg.scripts[key];
        log(`  Removed script: "${key}"`);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(hostPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      log('  Updated package.json.');
    }
    return modified;
  } catch (e) {
    log(`  Warning: Could not update package.json: ${e.message}`);
    return false;
  }
}

/**
 * Completely removes TORCH from a project that installed it via
 * `npm install <torch-tarball> && npx torch-lock init`.
 *
 * What it removes:
 * 1. The torch/ install directory (or equivalent)
 * 2. torch-config.json at the project root
 * 3. .torch/ hidden directory (prompt history)
 * 4. .scheduler-memory/ directory (runtime memory store)
 * 5. task-logs/ directory (scheduler run logs)
 * 6. src/proposals/ directory (governance proposals)
 * 7. torch:* scripts from the host package.json
 * 8. The torch-lock npm package (node_modules/torch-lock)
 *
 * @param {boolean} force - If true, skip the confirmation prompt
 * @param {string} cwd - Working directory (project root)
 * @param {Object|null} mockAnswers - For testing: { confirm: true/false }
 * @returns {Promise<void>}
 */
export async function cmdRemove(force = false, cwd = process.cwd(), mockAnswers = null) {
  const log = console.log;
  const installDir = detectTorchInstallDir(cwd);

  if (!installDir) {
    log('No TORCH installation detected in this directory.');
    log('Looked for:');
    log('  - A torch/ subdirectory containing roster.json or bin/');
    log('  - A package.json with name "torch-lock" (root install)');
    return;
  }

  const isRootInstall = installDir === '.';
  const torchDir = path.resolve(cwd, installDir);

  // Build a manifest of what will be removed
  const targets = [];

  if (!isRootInstall && fs.existsSync(torchDir)) {
    targets.push({ path: torchDir, label: `${installDir}/  (TORCH install directory)` });
  }

  const configPath = path.join(cwd, 'torch-config.json');
  if (fs.existsSync(configPath)) {
    targets.push({ path: configPath, label: 'torch-config.json' });
  }

  const dotTorch = path.join(cwd, '.torch');
  if (fs.existsSync(dotTorch)) {
    targets.push({ path: dotTorch, label: '.torch/  (prompt history)' });
  }

  const schedulerMemory = path.join(cwd, '.scheduler-memory');
  if (fs.existsSync(schedulerMemory)) {
    targets.push({ path: schedulerMemory, label: '.scheduler-memory/  (memory store)' });
  }

  const taskLogs = path.join(cwd, 'task-logs');
  if (fs.existsSync(taskLogs)) {
    targets.push({ path: taskLogs, label: 'task-logs/  (scheduler logs)' });
  }

  const proposals = path.join(cwd, 'src', 'proposals');
  if (fs.existsSync(proposals)) {
    targets.push({ path: proposals, label: 'src/proposals/  (governance proposals)' });
  }

  // Check for host scripts
  const hostPkgPath = path.join(cwd, 'package.json');
  let hasHostScripts = false;
  if (fs.existsSync(hostPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8'));
      if (pkg.scripts) {
        hasHostScripts = TORCH_HOST_SCRIPTS.some(key => key in pkg.scripts);
      }
    } catch (_e) { /* ignore */ }
  }

  if (targets.length === 0 && !hasHostScripts) {
    log('Nothing to remove — no TORCH artifacts found.');
    return;
  }

  // Show what will be removed
  log('\nThe following TORCH artifacts will be removed:\n');
  for (const t of targets) {
    log(`  - ${t.label}`);
  }
  if (hasHostScripts) {
    log('  - torch:* scripts from package.json');
  }
  log('  - torch-lock npm package (via npm uninstall)');
  log('');

  // Confirm unless --force
  if (!force) {
    let confirmed;

    if (mockAnswers) {
      confirmed = mockAnswers.confirm;
    } else {
      const rl = readline.createInterface({ input, output });
      try {
        const answer = await rl.question('Proceed with removal? (yes/no): ');
        confirmed = answer.trim().toLowerCase() === 'yes';
      } finally {
        rl.close();
      }
    }

    if (!confirmed) {
      log('Removal cancelled.');
      return;
    }
  }

  log('\nRemoving TORCH...\n');

  // 1. Remove directories and files
  for (const t of targets) {
    removeIfExists(t.path, t.label, log);
  }

  // 2. Clean up empty src/ directory if proposals was the only thing in it
  const srcDir = path.join(cwd, 'src');
  if (fs.existsSync(srcDir)) {
    try {
      const entries = fs.readdirSync(srcDir);
      if (entries.length === 0) {
        fs.rmdirSync(srcDir);
        log('  Removed empty src/ directory');
      }
    } catch (_e) { /* leave it if not empty or permission error */ }
  }

  // 3. Remove host package.json scripts
  if (hasHostScripts) {
    removeHostScripts(cwd, log);
  }

  // 4. Uninstall the npm package
  log('\n  Running npm uninstall torch-lock...');
  try {
    const { execSync } = await import('node:child_process');
    execSync('npm uninstall torch-lock', { cwd, stdio: 'pipe' });
    log('  Uninstalled torch-lock package.');
  } catch (e) {
    log(`  Warning: npm uninstall torch-lock failed: ${e.message}`);
    log('  You may need to run "npm uninstall torch-lock" manually.');
  }

  log('\nTORCH has been completely removed from this project.');
  log('If you used TORCH environment variables (NOSTR_LOCK_*, TORCH_*),');
  log('remember to remove them from your shell profile or CI configuration.');
}
