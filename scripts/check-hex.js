#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const SEARCH_PATTERN = '\\b#[0-9a-fA-F]{3,8}\\b';
// Allow-list tokens and vector logos so brand assets can keep their baked colors.
const IGNORED_GLOBS = [
  '!css/tokens.css',
  '!**/*.svg',
  '!**/node_modules/**',
  '!.git/**'
];

const rgArgs = [
  '--color=never',
  '--no-heading',
  '-n'
];

for (const glob of IGNORED_GLOBS) {
  rgArgs.push('--glob', glob);
}

rgArgs.push('--regexp', SEARCH_PATTERN, '.');

const result = spawnSync('rg', rgArgs, { encoding: 'utf8' });

if (result.error) {
  console.error('Failed to execute ripgrep:', result.error.message);
  process.exit(2);
}

// ripgrep exits with:
//   0 when matches are found,
//   1 when no matches are found,
//   2+ on errors.
if (result.status === 0 && result.stdout.trim()) {
  console.error('Hex colors detected outside tokens or SVG assets:');
  console.error(result.stdout.trimEnd());
  console.error('\nAllowed exceptions: tokens (css/tokens.css) and vector logos (*.svg).');
  process.exit(1);
}

if (result.status && result.status !== 1) {
  console.error('ripgrep reported an error while scanning for hex values.');
  if (result.stderr) {
    console.error(result.stderr.trimEnd());
  }
  process.exit(result.status);
}

process.exit(0);
