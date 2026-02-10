#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const args = {
    distDir: 'dist',
    output: null,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dist') {
      args.distDir = argv[i + 1] ?? args.distDir;
      i += 1;
      continue;
    }

    if (arg === '--output') {
      args.output = argv[i + 1] ?? args.output;
      i += 1;
      continue;
    }

    if (arg === '--compact') {
      args.pretty = false;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/hash-dist.mjs [--dist <dir>] [--output <file>] [--compact]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function toPosixRelative(baseDir, filePath) {
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files.sort((a, b) => toPosixRelative(rootDir, a).localeCompare(toPosixRelative(rootDir, b)));
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildHashState(distDir) {
  const resolvedDistDir = path.resolve(distDir);
  if (!fs.existsSync(resolvedDistDir)) {
    throw new Error(`Dist directory does not exist: ${resolvedDistDir}`);
  }

  const files = walkFiles(resolvedDistDir).map((filePath) => {
    const contents = fs.readFileSync(filePath);
    return {
      path: toPosixRelative(resolvedDistDir, filePath),
      sha256: hashBuffer(contents)
    };
  });

  const combinedInput = files
    .map((entry) => `${entry.path}:${entry.sha256}`)
    .join('\n');

  return {
    combined: hashBuffer(Buffer.from(combinedInput, 'utf8')),
    files
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const hashState = buildHashState(args.distDir);
  const serialized = JSON.stringify(hashState, null, args.pretty ? 2 : 0);

  if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${serialized}\n`);
    console.log(`Wrote hash state to ${outputPath}`);
    return;
  }

  console.log(serialized);
}

main();
