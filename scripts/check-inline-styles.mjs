#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".cache",
  ".astro",
  ".svelte-kit",
  ".vercel",
  "tmp",
  "logs",
]);

const DIST_SCAN_PREFIXES = new Set([
  "torrent/dist",
]);
const DIST_SCAN_PREFIXES_ARRAY = [...DIST_SCAN_PREFIXES];

const IGNORED_FILES = new Set([
  "css/tailwind.generated.css",
  "js/webtorrent.min.js",
  "js/webtorrent.min.js.map",
  "scripts/check-inline-styles.mjs",
  "sw.min.js",
]);

const VIOLATION_ALLOWLIST = new Map([
  [
    "torrent/dist/beacon.vendor.js",
    new Set(["Direct .style usage", "style.cssText usage"]),
  ],
  ["js/ui/utils/positionFloatingPanel.js", new Set(["Direct .style usage"])],
]);

const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".cjs",
  ".html",
  ".htm",
  ".js",
  ".jsx",
  ".liquid",
  ".mjs",
  ".njk",
  ".svelte",
  ".svg",
  ".ts",
  ".tsx",
  ".vue",
]);

const INLINE_STYLE_ATTR_REGEX = /<[^>]*\sstyle\s*=/gim;
const DIRECT_STYLE_REGEX = /(?<!['"`])\.\s*style\b/gim;

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
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

function collectViolations(relPath, content) {
  const lineBreaks = buildLineBreaks(content);
  const results = [];

  let match;

  INLINE_STYLE_ATTR_REGEX.lastIndex = 0;
  while ((match = INLINE_STYLE_ATTR_REGEX.exec(content))) {
    const index = match.index;
    results.push({
      file: toPosix(relPath),
      line: getLineNumber(lineBreaks, index),
      label: "Inline style attribute",
      snippet: getLineSnippet(content, index),
    });
  }

  DIRECT_STYLE_REGEX.lastIndex = 0;
  while ((match = DIRECT_STYLE_REGEX.exec(content))) {
    const index = match.index;
    const after = content.slice(DIRECT_STYLE_REGEX.lastIndex);
    const isCssText = /^\s*\.\s*cssText/i.test(after);
    results.push({
      file: toPosix(relPath),
      line: getLineNumber(lineBreaks, index),
      label: isCssText ? "style.cssText usage" : "Direct .style usage",
      snippet: getLineSnippet(content, index),
    });
  }

  return results;
}

function shouldIgnore(relPath) {
  const posixPath = toPosix(relPath);
  const parts = posixPath.split("/");
  for (const part of parts) {
    if (!IGNORED_DIRS.has(part)) {
      continue;
    }

    if (
      part === "dist" &&
      DIST_SCAN_PREFIXES_ARRAY.some(
        (prefix) => posixPath === prefix || posixPath.startsWith(`${prefix}/`)
      )
    ) {
      continue;
    }

    return true;
  }

  if (IGNORED_FILES.has(posixPath)) {
    return true;
  }

  return false;
}

function shouldCheckFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === "") {
    return false;
  }
  return TEXT_EXTENSIONS.has(ext);
}

async function walk(dir, results) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(repoRoot, fullPath);

    if (shouldIgnore(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!shouldCheckFile(relPath)) {
      continue;
    }

    const content = await readFile(fullPath, "utf8");
    const fileViolations = collectViolations(relPath, content);
    results.push(...fileViolations);
  }
}

async function main() {
  const results = [];
  await walk(repoRoot, results);

  const filteredResults = results.filter((violation) => {
    const allowlistedLabels = VIOLATION_ALLOWLIST.get(violation.file);
    if (!allowlistedLabels) {
      return true;
    }
    return !allowlistedLabels.has(violation.label);
  });

  if (filteredResults.length > 0) {
    console.error("\nInline style usage detected:\n");
    for (const violation of filteredResults) {
      console.error(
        `${violation.file}:${violation.line} — ${violation.label}\n  ${violation.snippet}\n`
      );
    }
    console.error("Inline styles are disallowed. Move styles into tokens or CSS.");
    process.exitCode = 1;
    return;
  }

  console.log("No inline style usage found.");
}

main().catch((error) => {
  console.error("Failed to scan for inline styles.");
  console.error(error);
  process.exitCode = 1;
});
