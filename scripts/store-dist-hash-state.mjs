#!/usr/bin/env node
import fs from 'node:fs';

function parseArgs(argv) {
  const args = {
    input: null,
    uploadUrl: process.env.DIST_HASH_STATE_UPLOAD_URL ?? '',
    method: process.env.DIST_HASH_STATE_UPLOAD_METHOD ?? 'PUT'
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
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/store-dist-hash-state.mjs --input <hash-state.json> [--upload-url <url>] [--method PUT]');
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

  const response = await fetch(args.uploadUrl, {
    method: args.method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body
  });

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
