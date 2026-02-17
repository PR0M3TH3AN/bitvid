#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    current: null,
    previous: null,
    outputJson: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--current') {
      args.current = argv[i + 1] ?? args.current;
      i += 1;
      continue;
    }

    if (arg === '--previous') {
      args.previous = argv[i + 1] ?? args.previous;
      i += 1;
      continue;
    }

    if (arg === '--json') {
      args.outputJson = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/diff-dist-hashes.mjs --current <json> --previous <json> [--json]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.current || !args.previous) {
    throw new Error('Both --current and --previous are required.');
  }

  return args;
}

function readHashState(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Hash state file not found: ${resolved}`);
  }

  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(payload.files)) {
    throw new Error(`Invalid hash state format in ${resolved}: missing files[] array.`);
  }

  return payload;
}

function toMap(state) {
  return new Map(state.files.map((entry) => [entry.path, entry.sha256]));
}

function getChangedPaths(currentState, previousState) {
  const current = toMap(currentState);
  const previous = toMap(previousState);
  const allPaths = new Set([...current.keys(), ...previous.keys()]);

  return [...allPaths]
    .filter((filePath) => current.get(filePath) !== previous.get(filePath))
    .sort((a, b) => a.localeCompare(b));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentState = readHashState(args.current);
  const previousState = readHashState(args.previous);
  const changedPaths = getChangedPaths(currentState, previousState);

  if (args.outputJson) {
    console.log(JSON.stringify({ changed: changedPaths }, null, 2));
    return;
  }

  for (const changedPath of changedPaths) {
    console.log(changedPath);
  }
}

main();
