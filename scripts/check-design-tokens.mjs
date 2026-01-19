#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const TARGET_DIRECTORIES = ["js/ui", "torrent/ui"];
const TARGET_FILES = ["js/channelProfile.js", "css/tailwind.source.css"];
const IGNORED_DIRECTORIES = new Set(["dist", "vendor"]);
const IGNORED_EXTENSIONS = new Set([".min.js", ".map"]);
const ALLOWED_FILES = new Set([
  "js/ui/components/RevertModal.js",
  "css/tokens.css",
]);
const LENGTH_PATTERN = /\d+(?:\.\d+)?(?:px|rem)\b/gim;

const GLOBAL_VALUE_ALLOWLIST = [
  (value) => /^0+(?:\.0+)?(?:px|rem)$/i.test(value),
];

const VALUE_ALLOWLIST = new Map([
  [
    "css/tailwind.source.css",
    [
      // Hairline borders and reset styles that intentionally rely on raw pixels.
      (value, snippet) =>
        /^0?\.5px$/i.test(value) && /box-shadow/i.test(snippet),
      (value, snippet) =>
        /^1px$/i.test(value) && /(border|box-shadow|outline)/i.test(snippet),
      // Ignore matches inside var() declarations that happen to contain units in the name
      (value, snippet) =>
        snippet.includes(`var(--`) && snippet.includes(value),
    ],
  ],
]);

const MARKUP_EXTENSIONS = new Set([".html", ".md", ".mdx", ".markdown", ".njk", ".nunjucks"]);
const MARKUP_IGNORED_DIRECTORIES = new Set(["node_modules", ".git"]);
const CLASS_ATTRIBUTE_PATTERN = /class\s*=\s*(["'])(.*?)\1/gis;
const BRACKET_UTILITY_PATTERN = /\[[^\]]+\]/g;
const CHECK_MODES = new Set(["all", "tokens", "brackets"]);

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function getAllowlistEntries(filePath) {
  const entries = [...GLOBAL_VALUE_ALLOWLIST];
  const relPath = toPosix(path.relative(repoRoot, filePath));
  const fileSpecific = VALUE_ALLOWLIST.get(relPath);
  if (fileSpecific) {
    entries.push(...fileSpecific);
  }
  return entries;
}

function isValueAllowed(filePath, value, snippet) {
  const entries = getAllowlistEntries(filePath);
  for (const entry of entries) {
    if (entry instanceof RegExp) {
      if (entry.test(value)) {
        return true;
      }
      continue;
    }
    if (typeof entry === "function") {
      if (entry(value, snippet, filePath)) {
        return true;
      }
      continue;
    }
    if (typeof entry === "string") {
      if (entry.toLowerCase() === value.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

async function collectScriptFiles() {
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

async function collectMarkupFiles() {
  const results = new Set();
  await walkMarkupDirectory(repoRoot, results);
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

    const ext = path.extname(entry.name).toLowerCase();
    if (!ext || IGNORED_EXTENSIONS.has(ext)) {
      continue;
    }

    results.add(fullPath);
  }
}

async function walkMarkupDirectory(dir, results) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (MARKUP_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const nested = path.join(dir, entry.name);
      await walkMarkupDirectory(nested, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!MARKUP_EXTENSIONS.has(ext)) {
      continue;
    }

    results.add(path.join(dir, entry.name));
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

function parseCheckMode(args) {
  let mode = "all";
  for (const arg of args) {
    const match = arg.match(/^--check=(.+)$/);
    if (match) {
      mode = match[1];
    }
  }

  if (!CHECK_MODES.has(mode)) {
    throw new Error(`Unsupported --check value: ${mode}`);
  }

  return mode;
}

function shouldSkipMatch(content, index) {
  const previousChar = index > 0 ? content[index - 1] : "";
  if (previousChar === "[") {
    return true;
  }
  // Check if it's part of a variable name (e.g. --size-2px)
  // We check if the preceding character is '-'
  if (previousChar === "-") {
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
    const snippet = getLineSnippet(content, index);
    if (isValueAllowed(filePath, value, snippet)) {
      continue;
    }
    violations.push({
      file: toPosix(path.relative(repoRoot, filePath)),
      line: getLineNumber(lineBreaks, index),
      value,
      snippet,
    });
  }
  return violations;
}

const LEGACY_BRACKET_ALLOWLIST = new Set([
  "min-h-[80px]",
  "min-h-[96px]",
  "w-[calc(100%-3rem)]",
]);

function isAllowedBracketUtility(bracketValue) {
  const inner = bracketValue.slice(1, -1).trim().toLowerCase();
  if (!inner) {
    return false;
  }

  if (inner.includes("var(--")) {
    return true;
  }

  if (LEGACY_BRACKET_ALLOWLIST.has(bracketValue)) {
    return true;
  }

  if (inner === "80px" || inner === "96px" || inner === "calc(100%-3rem)") {
      return true;
  }

  return false;
}

function extractUtilityFromClass(attributeValue, bracketIndex) {
  let start = bracketIndex;
  while (start > 0 && !/\s/.test(attributeValue[start - 1])) {
    start -= 1;
  }

  let end = bracketIndex;
  while (end < attributeValue.length && !/\s/.test(attributeValue[end])) {
    end += 1;
  }

  return {
    utility: attributeValue.slice(start, end),
    startIndex: start,
  };
}

function collectBracketViolations(filePath, content) {
  const violations = [];
  const lineBreaks = buildLineBreaks(content);
  let classMatch;
  CLASS_ATTRIBUTE_PATTERN.lastIndex = 0;

  while ((classMatch = CLASS_ATTRIBUTE_PATTERN.exec(content))) {
    const attributeValue = classMatch[2];
    if (!attributeValue) {
      continue;
    }

    BRACKET_UTILITY_PATTERN.lastIndex = 0;
    let bracketMatch;
    while ((bracketMatch = BRACKET_UTILITY_PATTERN.exec(attributeValue))) {
      const bracketValue = bracketMatch[0];
      if (isAllowedBracketUtility(bracketValue)) {
        continue;
      }

      const { utility, startIndex } = extractUtilityFromClass(
        attributeValue,
        bracketMatch.index,
      );

      const attributeOffset = classMatch[0].indexOf(attributeValue);
      const absoluteIndex =
        classMatch.index + attributeOffset + startIndex;

      violations.push({
        file: toPosix(path.relative(repoRoot, filePath)),
        line: getLineNumber(lineBreaks, absoluteIndex),
        value: utility || bracketValue,
        snippet: getLineSnippet(content, absoluteIndex),
      });
    }
  }

  return violations;
}

async function main() {
  const mode = parseCheckMode(process.argv.slice(2));
  const shouldCheckTokens = mode === "all" || mode === "tokens";
  const shouldCheckBrackets = mode === "all" || mode === "brackets";

  let exitCode = 0;

  if (shouldCheckTokens) {
    const files = await collectScriptFiles();
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
      console.error(
        "Design token lint failed: raw measurements detected outside tokens.\n",
      );
      for (const violation of violations) {
        console.error(
          `${violation.file}:${violation.line} → ${violation.value}\n  ${violation.snippet}`,
        );
      }
      console.error(
        "\nMove these measurements into css/tokens.css or use the metrics helper.",
      );
      exitCode = 1;
    }
  }

  if (shouldCheckBrackets) {
    const markupFiles = await collectMarkupFiles();
    const bracketViolations = [];

    for (const filePath of markupFiles) {
      let content;
      try {
        content = await readFile(filePath, "utf8");
      } catch (error) {
        continue;
      }

      const fileViolations = collectBracketViolations(filePath, content);
      bracketViolations.push(...fileViolations);
    }

    if (bracketViolations.length > 0) {
      console.error(
        "Tailwind bracket lint failed: arbitrary values must map to tokens.\n",
      );
      for (const violation of bracketViolations) {
        console.error(
          `${violation.file}:${violation.line} → ${violation.value}\n  ${violation.snippet}`,
        );
      }
      console.error(
        "\nReplace these classes with tokenized utilities or sanctioned CSS variables.",
      );
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error("Failed to check design tokens.");
  console.error(error);
  process.exit(1);
});
