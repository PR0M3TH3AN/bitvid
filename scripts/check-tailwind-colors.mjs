#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const TARGET_DIRECTORIES = ["components", "js", "views"];
const IGNORED_DIRECTORIES = new Set(["ed-legacy", "legacy", "__snapshots__"]);
const LEGACY_ALLOWLIST = new Set([
  "components/ed-/revert-video-modal.html",
  "components/ed-/profile-modal.html",
]);

const COLOR_PATTERN =
  /\b(?:text|bg|border|divide|ring|stroke|fill|outline|shadow|accent|placeholder)-(?:slate|gray|zinc|stone|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[\w/]+)?\b/gim;

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

async function collectFiles() {
  const results = new Set();
  for (const directory of TARGET_DIRECTORIES) {
    const absolute = path.resolve(repoRoot, directory);
    await walkDirectory(absolute, results);
  }
  return [...results];
}

async function walkDirectory(dir, results) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      await walkDirectory(fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    results.add(fullPath);
  }
}

function buildLineIndex(content) {
  const lines = [0];
  let index = 0;
  while ((index = content.indexOf("\n", index)) !== -1) {
    lines.push(index + 1);
    index += 1;
  }
  return lines;
}

function getLineNumber(indexes, matchIndex) {
  let low = 0;
  let high = indexes.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (indexes[mid] <= matchIndex) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

async function main() {
  const files = await collectFiles();
  const violations = [];

  for (const filePath of files) {
    const rel = toPosix(path.relative(repoRoot, filePath));
    if (LEGACY_ALLOWLIST.has(rel)) {
      continue;
    }

    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      continue;
    }

    const lineIndex = buildLineIndex(content);
    let match;
    COLOR_PATTERN.lastIndex = 0;
    while ((match = COLOR_PATTERN.exec(content))) {
      const line = getLineNumber(lineIndex, match.index);
      violations.push({
        file: rel,
        line,
        value: match[0],
      });
    }
  }

  if (violations.length > 0) {
    console.error("Tailwind color lint failed: raw palette classes detected.\n");
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} → ${violation.value}`);
    }
    console.error(
      "\nReplace raw tailwind colors with semantic utilities (text-muted, bg-status-warning-surface, etc.)."
    );
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to check Tailwind color usage.");
  console.error(error);
  process.exit(1);
});
