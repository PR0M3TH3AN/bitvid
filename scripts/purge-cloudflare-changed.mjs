#!/usr/bin/env node
import fs from 'node:fs';

const MAX_URLS_PER_REQUEST = 30;

function parseArgs(argv) {
  const args = {
    changedPathsFile: null,
    changedPaths: [],
    baseUrl: process.env.CLOUDFLARE_PURGE_BASE_URL ?? '',
    allowPurgeAll: false,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--changed-file') {
      args.changedPathsFile = argv[i + 1] ?? args.changedPathsFile;
      i += 1;
      continue;
    }

    if (arg === '--changed') {
      args.changedPaths.push(argv[i + 1] ?? '');
      i += 1;
      continue;
    }

    if (arg === '--base-url') {
      args.baseUrl = argv[i + 1] ?? args.baseUrl;
      i += 1;
      continue;
    }

    if (arg === '--allow-purge-all') {
      args.allowPurgeAll = true;
      continue;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/purge-cloudflare-changed.mjs --changed-file <paths.txt> [--base-url https://example.com] [--dry-run]'
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readChangedPaths(args) {
  const output = [];

  if (args.changedPathsFile) {
    const fileContents = fs.readFileSync(args.changedPathsFile, 'utf8');
    output.push(...fileContents.split(/\r?\n/));
  }

  output.push(...args.changedPaths);

  const normalized = output.map((value) => value.trim()).filter(Boolean);

  if (normalized.includes('index.html')) {
    normalized.push('/');
  }

  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function toAbsoluteUrl(baseUrl, relativePath) {
  if (!baseUrl) {
    return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${normalizedBase}${normalizedPath}`;
}

function chunk(array, size) {
  const parts = [];
  for (let i = 0; i < array.length; i += size) {
    parts.push(array.slice(i, i + size));
  }
  return parts;
}

async function purgeBatch({ zoneId, apiToken, urls, dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] Would purge ${urls.length} URLs`);
    return;
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: urls })
  });

  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare purge failed: ${JSON.stringify(payload)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const changedPaths = readChangedPaths(args);

  if (changedPaths.length === 0) {
    console.log('No changed paths supplied. Skipping Cloudflare purge.');
    return;
  }

  if (changedPaths.includes('*') && !args.allowPurgeAll) {
    throw new Error('Refusing to purge all cache by default. Remove wildcard path or pass --allow-purge-all explicitly.');
  }

  const urls = changedPaths.map((relativePath) => toAbsoluteUrl(args.baseUrl, relativePath));

  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!args.dryRun && (!zoneId || !apiToken)) {
    throw new Error('Missing CLOUDFLARE_ZONE_ID or CLOUDFLARE_API_TOKEN environment variables.');
  }

  const batches = chunk(urls, MAX_URLS_PER_REQUEST);
  for (const [index, batch] of batches.entries()) {
    console.log(`Purging batch ${index + 1}/${batches.length} (${batch.length} URLs)`);
    await purgeBatch({ zoneId, apiToken, urls: batch, dryRun: args.dryRun });
  }

  console.log(`Cloudflare targeted purge complete. URLs purged: ${urls.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
