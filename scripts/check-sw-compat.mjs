import { execSync } from 'node:child_process';

const ENTRY_HTML_FILES = ['index.html', 'embed.html'];
const REQUIRED_COMPANION_FILES = ['_headers', ...ENTRY_HTML_FILES];
const CRITICAL_FILES = ['sw.min.js', 'js/webtorrent.js'];
const CRITICAL_PATH_PATTERNS = [
  '/webtorrent/',
  '/sw.min.js',
  'scope: "/"',
  'scope:"/"',
  'SERVICE_WORKER_PATH',
  'SERVICE_WORKER_SCOPE'
];

function getChangedFilesAgainstHeadParent() {
  let hasHeadParent;
  try {
    hasHeadParent = execSync('git rev-parse --verify --quiet HEAD^', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (error) {
    return [];
  }

  if (!hasHeadParent) {
    return [];
  }

  const output = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
    encoding: 'utf8'
  }).trim();

  if (!output) {
    return [];
  }

  return output.split('\n').map((value) => value.trim()).filter(Boolean);
}

function getCriticalPathDiff() {
  const output = execSync(
    `git diff --unified=0 HEAD^ HEAD -- ${CRITICAL_FILES.join(' ')}`,
    { encoding: 'utf8' }
  );
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'));
}

function hasCriticalPathChange(diffLines) {
  return diffLines.some((line) =>
    CRITICAL_PATH_PATTERNS.some((pattern) => line.includes(pattern))
  );
}

function main() {
  const changedFiles = getChangedFilesAgainstHeadParent();
  if (!changedFiles.length) {
    console.log('[sw-compat] No commit delta found; skipping compatibility check.');
    return;
  }

  const touchedCriticalFile = changedFiles.some((file) => CRITICAL_FILES.includes(file));
  if (!touchedCriticalFile) {
    console.log('[sw-compat] No service worker files changed; compatibility check passed.');
    return;
  }

  const diffLines = getCriticalPathDiff();
  const criticalPathChanged = hasCriticalPathChange(diffLines);
  if (!criticalPathChanged) {
    console.log('[sw-compat] Service worker changes did not alter critical runtime paths.');
    return;
  }

  const missingCompanionFiles = REQUIRED_COMPANION_FILES.filter(
    (file) => !changedFiles.includes(file)
  );

  if (missingCompanionFiles.length > 0) {
    const messageLines = [
      '[sw-compat] Detected service worker scope/runtime path changes.',
      '[sw-compat] Update deployment compatibility files in the same commit:',
      ...missingCompanionFiles.map((file) => `  - ${file}`),
      '[sw-compat] Required companion files: _headers, index.html, embed.html'
    ];
    throw new Error(messageLines.join('\n'));
  }

  console.log('[sw-compat] Critical service worker path updates include required companion files.');
}

main();
