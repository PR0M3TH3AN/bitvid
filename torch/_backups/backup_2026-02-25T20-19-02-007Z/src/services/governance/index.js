import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const PROPOSALS_DIR = path.resolve(process.cwd(), 'src/proposals');
const HISTORY_DIR = path.resolve(process.cwd(), '.torch/prompt-history');
const ALLOWED_TARGET_DIRS = [
  path.resolve(process.cwd(), 'src/prompts/daily'),
  path.resolve(process.cwd(), 'src/prompts/weekly'),
];

async function ensureDirs() {
  await fs.mkdir(PROPOSALS_DIR, { recursive: true });
  await fs.mkdir(HISTORY_DIR, { recursive: true });
}

function resolveAndValidateTarget(target) {
  const absoluteTarget = path.resolve(process.cwd(), target);
  const isAllowed = ALLOWED_TARGET_DIRS.some(allowed => absoluteTarget.startsWith(allowed));
  return { absoluteTarget, isAllowed };
}

export async function listProposals() {
  await ensureDirs();
  const entries = await fs.readdir(PROPOSALS_DIR, { withFileTypes: true });
  const proposals = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metaPath = path.join(PROPOSALS_DIR, entry.name, 'meta.json');
      try {
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaContent);
        proposals.push({
          id: entry.name,
          ...meta
        });
      } catch (_e) {
        // Ignore invalid proposals
      }
    }
  }
  return proposals;
}

export async function getProposal(id) {
  const dir = path.join(PROPOSALS_DIR, id);
  const metaPath = path.join(dir, 'meta.json');
  const newPath = path.join(dir, 'new.md');
  const diffPath = path.join(dir, 'change.diff');

  try {
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    const newContent = await fs.readFile(newPath, 'utf8');
    let diff = '';
    try {
      diff = await fs.readFile(diffPath, 'utf8');
    } catch {
      // Ignore missing diff
    }

    return {
      id,
      meta,
      newContent,
      diff,
      dir
    };
  } catch (e) {
    throw new Error(`Proposal ${id} not found or invalid: ${e.message}`, { cause: e });
  }
}

export async function createProposal({ agent, target, newContent, reason }) {
  await ensureDirs();

  // Validate target path is allowed
  const { absoluteTarget, isAllowed } = resolveAndValidateTarget(target);

  if (!isAllowed) {
    throw new Error(`Target ${target} is not in an allowed directory (src/prompts/daily or src/prompts/weekly).`);
  }

  // Generate ID
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${timestamp}_${agent}`;
  const dir = path.join(PROPOSALS_DIR, id);

  await fs.mkdir(dir, { recursive: true });

  // Write content
  await fs.writeFile(path.join(dir, 'new.md'), newContent);

  // Generate Diff if target exists
  let diff = '';
  try {
    // Check if target exists
    await fs.access(absoluteTarget);

    // Create a temporary file for the diff logic to work cleanly
    // But direct path is fine.
    const newFile = path.join(dir, 'new.md');
    try {
      // Use execFileSync to avoid command injection via shell
      execFileSync('git', ['diff', '--no-index', '--color=never', absoluteTarget, newFile], { stdio: 'pipe' });
    } catch (e) {
      if (e.status === 1 && e.stdout) {
        diff = e.stdout.toString();
      } else if (e.status !== 1) {
          // Some other error
          console.error('Diff generation failed:', e.message);
      }
    }
  } catch (_err) {
    diff = '(New File)';
  }

  await fs.writeFile(path.join(dir, 'change.diff'), diff);

  const meta = {
    id,
    author: agent,
    target,
    reason,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };

  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  return { id, diff };
}

export async function validateProposal(proposalOrId) {
  let proposal;
  if (typeof proposalOrId === 'string') {
    proposal = await getProposal(proposalOrId);
  } else {
    proposal = proposalOrId;
  }
  const { meta, newContent } = proposal;

  // 1. Allowlist check (redundant but safe)
  const { isAllowed } = resolveAndValidateTarget(meta.target);
  if (!isAllowed) {
    return { valid: false, reason: 'Target not in allowed directories.' };
  }

  // 2. Invariant checks
  // Check for required headers based on common prompt structure
  const requiredPatterns = [
    /Shared contract \(required\):/i,
    /Required startup \+ artifacts \+ memory \+ issue capture/i,
  ];

  for (const pattern of requiredPatterns) {
    if (!pattern.test(newContent)) {
       return { valid: false, reason: `Missing required header pattern: ${pattern}` };
    }
  }

  return { valid: true };
}

export async function applyProposal(id) {
  const proposal = await getProposal(id);
  const { meta, newContent, dir } = proposal;

  if (meta.status !== 'pending') {
    throw new Error(`Proposal is ${meta.status}, cannot apply.`);
  }

  const validation = await validateProposal(proposal);
  if (!validation.valid) {
    // Mark as rejected if validation fails?
    // Or just throw? The governance agent should decide.
    // We throw here to prevent accidental application.
    throw new Error(`Validation failed: ${validation.reason}`);
  }

  const { absoluteTarget } = resolveAndValidateTarget(meta.target);

  // Archive old
  try {
    const oldContent = await fs.readFile(absoluteTarget, 'utf8');
    const hash = createHash('sha256').update(oldContent).digest('hex');
    const archiveDir = path.join(HISTORY_DIR, path.dirname(meta.target));
    await fs.mkdir(archiveDir, { recursive: true });

    // Filename: <base>_<timestamp>_<hash>.md for deterministic sort by name
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(meta.target, '.md');
    const archiveName = `${baseName}_${ts}_${hash}.md`;
    const archivePath = path.join(archiveDir, archiveName);
    await fs.writeFile(archivePath, oldContent);

    // Write sidecar metadata for rich version listing
    const archiveMeta = {
      proposalId: id,
      author: meta.author,
      reason: meta.reason,
      target: meta.target,
      hash,
      archivedAt: new Date().toISOString(),
    };
    await fs.writeFile(archivePath.replace(/\.md$/, '.meta.json'), JSON.stringify(archiveMeta, null, 2));
  } catch (_e) {
    // If file didn't exist, nothing to archive
  }

  // Apply new
  await fs.mkdir(path.dirname(absoluteTarget), { recursive: true });
  await fs.writeFile(absoluteTarget, newContent);

  // Update meta
  meta.status = 'applied';
  meta.appliedAt = new Date().toISOString();
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  // Git Commit (optional)
  try {
    // We use execFileSync for git operations to avoid command injection
    // Ensure we are in repo root? cwd is repo root.
    execFileSync('git', ['add', meta.target]);
    const commitMsg = `feat(prompts): apply proposal ${id} by ${meta.author}`;
    execFileSync('git', ['commit', '-m', commitMsg]);
    meta.gitCommit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  } catch (gitErr) {
    console.warn('Git commit failed (ignoring):', gitErr.message);
  }

  return { success: true };
}

export async function rejectProposal(id, reason) {
  const proposal = await getProposal(id);
  const { meta, dir } = proposal;

  meta.status = 'rejected';
  meta.rejectionReason = reason;
  meta.rejectedAt = new Date().toISOString();

  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { success: true };
}

export async function listPromptVersions(target) {
  // target is relative path e.g. src/prompts/daily/agent.md
  const archiveDir = path.join(HISTORY_DIR, path.dirname(target));
  const targetBase = path.basename(target, '.md');
  const prefix = targetBase + '_';

  const versions = [];
  try {
    const files = await fs.readdir(archiveDir);
    const archiveFiles = files.filter(f => f.startsWith(prefix) && f.endsWith('.md'));

    for (const file of archiveFiles) {
      const filePath = path.join(archiveDir, file);
      const metaPath = filePath.replace(/\.md$/, '.meta.json');

      let meta = null;
      try {
        meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      } catch {
        // No sidecar — legacy archive or missing
      }

      // Extract timestamp and hash from filename: <base>_<timestamp>_<hash>.md
      // Legacy format: <base>_<hash>.md (40-char hex)
      const withoutPrefix = file.slice(prefix.length, -3); // strip prefix and .md
      const parts = withoutPrefix.split('_');
      let archivedAt = null;
      let hash = null;

      if (parts.length >= 2) {
        // New format: timestamp_hash (timestamp has dashes instead of colons)
        hash = parts[parts.length - 1];
        const tsPart = parts.slice(0, -1).join('_');
        // Convert back: YYYY-MM-DDTHH-MM-SS-mmmZ -> ISO
        archivedAt = tsPart.replace(
          /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
          '$1:$2:$3.$4Z'
        );
        if (archivedAt === tsPart) archivedAt = null; // parse failed
      } else {
        // Legacy: single part = hash only, use file stat for date
        hash = withoutPrefix;
        try {
          const stat = await fs.stat(filePath);
          archivedAt = stat.mtime.toISOString();
        } catch {
          // ignore
        }
      }

      versions.push({
        filename: file,
        archivedAt: meta?.archivedAt ?? archivedAt,
        hash: meta?.hash ?? hash,
        proposalId: meta?.proposalId ?? null,
        author: meta?.author ?? null,
        reason: meta?.reason ?? null,
      });
    }
  } catch (_e) {
    // archiveDir doesn't exist — no versions yet
  }

  // Sort newest first, using archivedAt string (ISO sorts lexicographically)
  versions.sort((a, b) => {
    if (a.archivedAt && b.archivedAt) return b.archivedAt.localeCompare(a.archivedAt);
    return 0;
  });

  return versions;
}

export async function rollbackPrompt(target, hashOrStrategy = 'latest') {
  // target is relative path e.g. src/prompts/daily/agent.md
  const archiveDir = path.join(HISTORY_DIR, path.dirname(target));
  const { absoluteTarget } = resolveAndValidateTarget(target);

  let sourceContent = null;
  let sourceName = null;

  try {
    if (hashOrStrategy === 'latest') {
      const versions = await listPromptVersions(target);
      if (versions.length > 0) {
        sourceName = versions[0].filename;
        sourceContent = await fs.readFile(path.join(archiveDir, sourceName), 'utf8');
      }
    } else {
      // Try to find file containing the hash or timestamp fragment
      const files = await fs.readdir(archiveDir);
      const match = files.find(f => f.includes(hashOrStrategy) && f.endsWith('.md'));
      if (match) {
        sourceName = match;
        sourceContent = await fs.readFile(path.join(archiveDir, match), 'utf8');
      }
    }
  } catch (_e) {
    // Archive lookup failed
  }

  if (sourceContent) {
    await fs.writeFile(absoluteTarget, sourceContent);
    return { success: true, source: 'archive', restored: sourceName };
  }

  // Fallback to Git
  try {
    const commit = hashOrStrategy === 'latest' ? 'HEAD' : hashOrStrategy;
    if (commit.startsWith('-')) {
      throw new Error(`Invalid commit/strategy: ${commit} (cannot start with '-')`);
    }
    execFileSync('git', ['checkout', commit, '--', target]);
    return { success: true, source: 'git', restored: commit };
  } catch (e) {
    throw new Error(`Rollback failed: Local archive not found and git failed (${e.message})`, { cause: e });
  }
}
