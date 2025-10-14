#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const TARGET_DIRECTORIES = ["js/ui"];
const TARGET_FILES = ["js/channelProfile.js"];
const IGNORED_EXTENSIONS = new Set([".min.js", ".map"]);
const ALLOWED_FILES = new Set(["js/ui/components/RevertModal.js"]);
const LENGTH_PATTERN = /\d+(?:\.\d+)?(?:px|rem)\b/gim;

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

async function collectTargetFiles() {
  const results = new Set();

  for (const target of TARGET_DIRECTORIES) {
    const absolute = path.resolve(repoRoot, target);
    await walkDirectory(absolute, results);
  }

  for (const file of TARGET_FILES) {
    const absolute = path.resolve(repoRoot, file);
    results.add(absolute);
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
      await walkDirectory(fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!ext || IGNORED_EXTENSIONS.has(ext)) {
      continue;
    }

    results.add(fullPath);
  }
}

function buildLineBreaks(content) {
  const breaks = [];
  let index = content.indexOf("\n");
  while (index !== -1) {
    breaks.push(index);
    index = content.indexOf("\n", index + 1);
  }
  return breaks;
}

function getLineNumber(lineBreaks, index) {
  let low = 0;
  let high = lineBreaks.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (index <= lineBreaks[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low + 1;
}

function getLineSnippet(content, index) {
  const start = content.lastIndexOf("\n", index - 1) + 1;
  let end = content.indexOf("\n", index);
  if (end === -1) {
    end = content.length;
  }
  return content.slice(start, end).trim();
}

function shouldSkipMatch(content, index) {
  const previousChar = index > 0 ? content[index - 1] : "";
  if (previousChar === "[") {
    return true;
  }
  return false;
}

function collectViolations(filePath, content) {
  const violations = [];
  const lineBreaks = buildLineBreaks(content);
  let match;
  LENGTH_PATTERN.lastIndex = 0;
  while ((match = LENGTH_PATTERN.exec(content))) {
    const index = match.index;
    if (shouldSkipMatch(content, index)) {
      continue;
    }
    const value = match[0];
    if (/^0+(?:\.0+)?(?:px|rem)$/i.test(value)) {
      continue;
    }
    violations.push({
      file: toPosix(path.relative(repoRoot, filePath)),
      line: getLineNumber(lineBreaks, index),
      value,
      snippet: getLineSnippet(content, index),
    });
  }
  return violations;
}

async function main() {
  const files = await collectTargetFiles();
  const violations = [];

  for (const filePath of files) {
    const rel = toPosix(path.relative(repoRoot, filePath));
    if (ALLOWED_FILES.has(rel)) {
      continue;
    }
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      continue;
    }
    const fileViolations = collectViolations(filePath, content);
    violations.push(...fileViolations);
  }

  if (violations.length > 0) {
    console.error("Design token lint failed: raw measurements detected outside tokens.\n");
    for (const violation of violations) {
      console.error(
        `${violation.file}:${violation.line} → ${violation.value}\n  ${violation.snippet}`,
      );
    }
    console.error("\nMove these measurements into css/tokens.css or use the metrics helper.");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to check design tokens.");
  console.error(error);
  process.exit(1);
});
