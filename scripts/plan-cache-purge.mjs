#!/usr/bin/env node
import fs from 'node:fs';

const ALWAYS_PUBLISH_PATHS = new Set(['index.html', 'embed.html', 'sw.min.js', 'site.webmanifest']);
const NON_ASSET_CHANGED_PATHS = new Set(['asset-manifest.json', '_headers', '_redirects']);

function parseArgs(argv) {
  const args = {
    changedFile: null,
    outputFile: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--changed-file') {
      args.changedFile = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (arg === '--output-file') {
      args.outputFile = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/plan-cache-purge.mjs --changed-file <paths.txt> [--output-file <paths.txt>]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.changedFile) {
    throw new Error('--changed-file is required.');
  }

  return args;
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function isHashedFilename(filePath) {
  return /\.[a-f0-9]{16}\.[^./]+$/i.test(filePath);
}

function isHtmlOrServiceWorkerPath(filePath) {
  return ALWAYS_PUBLISH_PATHS.has(filePath);
}

function isNonAssetMetadataPath(filePath) {
  return NON_ASSET_CHANGED_PATHS.has(filePath);
}

function isUnhashedAssetPath(filePath) {
  if (isHtmlOrServiceWorkerPath(filePath) || isNonAssetMetadataPath(filePath)) {
    return false;
  }

  if (isHashedFilename(filePath)) {
    return false;
  }

  return /^(css|js|assets|vendor|components|views|content)\//.test(filePath);
}

function uniqueSorted(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const changedPaths = uniqueSorted(readLines(args.changedFile));
  const unhashedAssetPaths = changedPaths.filter(isUnhashedAssetPath);
  const hashedModeFullyActive = unhashedAssetPaths.length === 0;

  const purgePaths = hashedModeFullyActive
    ? changedPaths.filter(isHtmlOrServiceWorkerPath)
    : changedPaths;

  const uniquePurgePaths = uniqueSorted(purgePaths);

  if (args.outputFile) {
    fs.writeFileSync(args.outputFile, uniquePurgePaths.join('\n') + (uniquePurgePaths.length > 0 ? '\n' : ''));
  }

  const summary = {
    mode: hashedModeFullyActive ? 'hashed_full' : 'unhashed_detected',
    changedCount: changedPaths.length,
    purgeCount: uniquePurgePaths.length,
    unhashedAssetPaths
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
