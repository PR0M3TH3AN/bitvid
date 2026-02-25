import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BACKUP_ROOT = path.resolve(process.cwd(), '.torch/backups');

// Paths to snapshot on each backup run
const STATE_SOURCES = [
  '.scheduler-memory/memory-store.json',
  'task-logs/daily/.scheduler-run-state.json',
];

/**
 * Creates a timestamped snapshot of TORCH runtime state under .torch/backups/<timestamp>/.
 *
 * Files captured (if they exist):
 *   - .scheduler-memory/memory-store.json   (agent long-term memory)
 *   - task-logs/daily/.scheduler-run-state.json  (scheduler deferral state)
 *
 * A backup-manifest.json is always written recording what was captured,
 * the git commit at backup time, and an ISO timestamp.
 *
 * @param {Object} [opts]
 * @param {string|null} [opts.output] - Override destination directory (default: .torch/backups/<ts>)
 * @returns {Promise<{backupDir: string, manifest: Object}>}
 */
export async function cmdBackup({ output = null } = {}) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = output
    ? path.resolve(process.cwd(), output)
    : path.join(BACKUP_ROOT, ts);

  await fs.mkdir(backupDir, { recursive: true });

  let gitCommit = null;
  try {
    gitCommit = execSync('git rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
  } catch {
    // Not in a git repo or git unavailable
  }

  const captured = [];
  const skipped = [];

  for (const relPath of STATE_SOURCES) {
    const src = path.resolve(process.cwd(), relPath);
    const dest = path.join(backupDir, relPath.replace(/\//g, '__'));
    try {
      await fs.copyFile(src, dest);
      captured.push(relPath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        skipped.push({ path: relPath, reason: 'not found' });
      } else {
        skipped.push({ path: relPath, reason: e.message });
      }
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    gitCommit,
    backupDir,
    captured,
    skipped,
  };

  await fs.writeFile(
    path.join(backupDir, 'backup-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(JSON.stringify({ success: true, ...manifest }, null, 2));
  return { backupDir, manifest };
}

/**
 * Lists all available backups under .torch/backups/, newest first.
 *
 * @returns {Promise<Array<{id: string, createdAt: string|null, backupDir: string}>>}
 */
export async function listBackups() {
  try {
    const entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const backupDir = path.join(BACKUP_ROOT, entry.name);
      let manifest = null;
      try {
        manifest = JSON.parse(await fs.readFile(path.join(backupDir, 'backup-manifest.json'), 'utf8'));
      } catch {
        // No manifest
      }
      backups.push({
        id: entry.name,
        createdAt: manifest?.createdAt ?? null,
        gitCommit: manifest?.gitCommit ?? null,
        captured: manifest?.captured ?? [],
        backupDir,
      });
    }
    // Newest first (ISO timestamp sort)
    backups.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return backups;
  } catch {
    return [];
  }
}
