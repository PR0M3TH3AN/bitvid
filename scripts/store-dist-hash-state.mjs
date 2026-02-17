#!/usr/bin/env node
import fs from 'node:fs';

function parseArgs(argv) {
  const args = {
    input: null,
    uploadUrl: process.env.DIST_HASH_STATE_UPLOAD_URL ?? '',
    method: process.env.DIST_HASH_STATE_UPLOAD_METHOD ?? 'PUT',
    ifMatch: process.env.DIST_HASH_STATE_IF_MATCH ?? '',
    ifVersion: process.env.DIST_HASH_STATE_IF_VERSION ?? '',
    ifUnmodifiedSince: process.env.DIST_HASH_STATE_IF_UNMODIFIED_SINCE ?? ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === '--upload-url') {
      args.uploadUrl = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--method') {
      args.method = argv[i + 1] ?? args.method;
      i += 1;
      continue;
    }
    if (arg === '--if-match') {
      args.ifMatch = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--if-version') {
      args.ifVersion = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--if-unmodified-since') {
      args.ifUnmodifiedSince = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/store-dist-hash-state.mjs --input <hash-state.json> [--upload-url <url>] [--method PUT] [--if-match <etag>] [--if-version <version>] [--if-unmodified-since <http-date>]'
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) {
    throw new Error('--input is required.');
  }
  if (!args.uploadUrl) {
    throw new Error('Missing upload URL. Provide --upload-url or DIST_HASH_STATE_UPLOAD_URL.');
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const body = fs.readFileSync(args.input);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (args.ifMatch) {
    headers['If-Match'] = args.ifMatch;
  }
  if (args.ifVersion) {
    headers['X-If-Version'] = args.ifVersion;
  }
  if (args.ifUnmodifiedSince) {
    headers['If-Unmodified-Since'] = args.ifUnmodifiedSince;
  }

  const response = await fetch(args.uploadUrl, {
    method: args.method,
    headers,
    body
  });

  if (response.status === 409 || response.status === 412) {
    const errorText = await response.text();
    console.error(`CAS_CONFLICT ${response.status}: ${errorText}`);
    process.exit(3);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload hash state (${response.status}): ${errorText}`);
  }

  console.log(`Uploaded dist hash state to ${args.uploadUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
