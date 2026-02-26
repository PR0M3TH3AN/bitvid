import fs from 'node:fs';
import path from 'node:path';
import { detectTorchInstallDir } from './cmd-remove.mjs';

const MEMORY_HEADING = '## TORCH Memory Integration';
const MEMORY_READ_LINE = '`.scheduler-memory/latest/${cadence}/memories.md`';
const MEMORY_WRITE_LINE = '`memory-update.md`';

function parseMajorNodeVersion(version) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  return Number.isFinite(major) ? major : null;
}

function createCheck(id, status, summary, fix = null) {
  return { id, status, summary, fix };
}

function hasMemoryHook(content) {
  return content.includes(MEMORY_HEADING)
    && content.includes(MEMORY_READ_LINE)
    && content.includes(MEMORY_WRITE_LINE);
}

/**
 * Runs setup and install diagnostics for a TORCH-enabled repository.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd]
 * @param {string} [opts.nodeVersion]
 * @returns {{
 *   ok: boolean,
 *   summary: { passed: number, warned: number, failed: number },
 *   checks: Array<{ id: string, status: 'pass'|'warn'|'fail', summary: string, fix: string|null }>
 * }}
 */
export function runDoctorChecks(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const nodeVersion = opts.nodeVersion || process.versions.node;
  const checks = [];

  const nodeMajor = parseMajorNodeVersion(nodeVersion);
  if (nodeMajor !== null && nodeMajor >= 22) {
    checks.push(createCheck('node-version', 'pass', `Node.js ${nodeVersion} meets requirement (>= 22).`));
  } else {
    checks.push(createCheck(
      'node-version',
      'fail',
      `Node.js ${nodeVersion} is below requirement (>= 22).`,
      'Install Node.js 22+ and rerun `npx --no-install torch-lock doctor`.',
    ));
  }

  const installDir = detectTorchInstallDir(cwd);
  if (!installDir) {
    checks.push(createCheck(
      'install-detection',
      'fail',
      'No TORCH installation detected.',
      'Run `npm install <torch-tarball> --force && npx --no-install torch-lock init`.',
    ));
  } else {
    const installLabel = installDir === '.' ? 'root install (.)' : `${installDir}/`;
    checks.push(createCheck('install-detection', 'pass', `Detected TORCH install at ${installLabel}.`));
  }

  const configPath = path.join(cwd, 'torch-config.json');
  let config = null;
  if (!fs.existsSync(configPath)) {
    checks.push(createCheck(
      'torch-config',
      'fail',
      'Missing torch-config.json in project root.',
      'Run `npx --no-install torch-lock init --force` or `npx --no-install torch-lock update --force`.',
    ));
  } else {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      checks.push(createCheck('torch-config', 'pass', 'torch-config.json exists and parses as JSON.'));
    } catch (error) {
      checks.push(createCheck(
        'torch-config',
        'fail',
        `torch-config.json is invalid JSON: ${error.message}`,
        'Fix JSON syntax or regenerate with `npx --no-install torch-lock update --force`.',
      ));
    }
  }

  if (config) {
    const dailyHandoff = config?.scheduler?.handoffCommandByCadence?.daily;
    const weeklyHandoff = config?.scheduler?.handoffCommandByCadence?.weekly;
    if (dailyHandoff && weeklyHandoff) {
      checks.push(createCheck('handoff-config', 'pass', 'Scheduler handoff commands are configured for daily and weekly.'));
    } else {
      checks.push(createCheck(
        'handoff-config',
        'fail',
        'Scheduler handoff command is missing for daily and/or weekly cadence.',
        'Run `npx --no-install torch-lock update --force` to rehydrate scheduler config.',
      ));
    }
  }

  if (installDir) {
    const installRoot = path.resolve(cwd, installDir);
    const expectedPaths = [
      path.join(installRoot, 'roster.json'),
      path.join(installRoot, 'prompts', 'daily'),
      path.join(installRoot, 'prompts', 'weekly'),
      path.join(installRoot, 'scripts', 'agent', 'run-selected-prompt.mjs'),
    ];
    const missing = expectedPaths.filter((targetPath) => !fs.existsSync(targetPath));
    if (missing.length === 0) {
      checks.push(createCheck('install-files', 'pass', 'Core TORCH install files are present.'));
    } else {
      const missingRel = missing.map((targetPath) => path.relative(cwd, targetPath)).join(', ');
      checks.push(createCheck(
        'install-files',
        'fail',
        `Missing install artifacts: ${missingRel}`,
        'Run `npx --no-install torch-lock update --force` to repair copied files.',
      ));
    }

    const nodeModulesPath = path.join(installRoot, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      checks.push(createCheck('install-deps', 'pass', `${path.relative(cwd, nodeModulesPath)} exists.`));
    } else {
      checks.push(createCheck(
        'install-deps',
        'warn',
        `${path.relative(cwd, nodeModulesPath)} is missing; TORCH package dependencies may not be installed yet.`,
        `Run \`npm install --prefix ${installDir === '.' ? '.' : installDir}\`.`,
      ));
    }
  }

  const promptFiles = ['AGENTS.md', 'CLAUDE.md']
    .map((name) => ({ name, filePath: path.join(cwd, name) }))
    .filter((entry) => fs.existsSync(entry.filePath));

  if (promptFiles.length === 0) {
    checks.push(createCheck(
      'memory-hook',
      'warn',
      'No AGENTS.md or CLAUDE.md found in repository root.',
      'Run `npx --no-install torch-lock update --force` to create/update agent prompt hooks.',
    ));
  } else {
    const withHook = [];
    const withoutHook = [];
    for (const entry of promptFiles) {
      const content = fs.readFileSync(entry.filePath, 'utf8');
      if (hasMemoryHook(content)) {
        withHook.push(entry.name);
      } else {
        withoutHook.push(entry.name);
      }
    }

    if (withHook.length > 0 && withoutHook.length === 0) {
      checks.push(createCheck('memory-hook', 'pass', `Memory hook present in: ${withHook.join(', ')}.`));
    } else if (withHook.length > 0) {
      checks.push(createCheck(
        'memory-hook',
        'warn',
        `Memory hook present in ${withHook.join(', ')} but missing in ${withoutHook.join(', ')}.`,
        'Run `npx --no-install torch-lock update --force` to upsert missing prompt hooks.',
      ));
    } else {
      checks.push(createCheck(
        'memory-hook',
        'fail',
        `Memory hook missing from: ${withoutHook.join(', ')}.`,
        'Run `npx --no-install torch-lock update --force` to inject TORCH memory integration.',
      ));
    }
  }

  const summary = {
    passed: checks.filter((check) => check.status === 'pass').length,
    warned: checks.filter((check) => check.status === 'warn').length,
    failed: checks.filter((check) => check.status === 'fail').length,
  };

  return {
    ok: summary.failed === 0,
    summary,
    checks,
  };
}

/**
 * Prints a human-readable setup diagnostic report.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd]
 * @param {boolean} [opts.json]
 * @param {Function} [opts.log]
 * @returns {ReturnType<typeof runDoctorChecks>}
 */
export function cmdDoctor(opts = {}) {
  const {
    cwd = process.cwd(),
    json = false,
    log = console.log,
  } = opts;

  const report = runDoctorChecks({ cwd, nodeVersion: opts.nodeVersion });
  if (json) {
    log(JSON.stringify(report, null, 2));
    return report;
  }

  log('TORCH Doctor Report');
  log(`Root: ${cwd}`);
  for (const check of report.checks) {
    const badge = check.status === 'pass' ? '[PASS]' : check.status === 'warn' ? '[WARN]' : '[FAIL]';
    log(`${badge} ${check.id}: ${check.summary}`);
  }

  log('');
  log(`Summary: ${report.summary.passed} passed, ${report.summary.warned} warned, ${report.summary.failed} failed.`);
  if (report.summary.warned > 0 || report.summary.failed > 0) {
    log('Recommended fixes:');
    for (const check of report.checks.filter((item) => item.status !== 'pass' && item.fix)) {
      log(`- ${check.fix}`);
    }
  }

  return report;
}
