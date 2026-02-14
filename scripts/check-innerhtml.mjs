#!/usr/bin/env node

/**
 * Lint script: audit innerHTML usage in JavaScript source files.
 *
 * Maintains a baseline count of innerHTML assignments per file.  If a file
 * introduces NEW innerHTML usage beyond its baseline, the check fails.
 * This enforces a "no new innerHTML" policy while grandfathering existing usage.
 *
 * Usage:
 *   node scripts/check-innerhtml.mjs              # enforce (exit 1 on new usage)
 *   node scripts/check-innerhtml.mjs --report      # report all usage (exit 0)
 *   node scripts/check-innerhtml.mjs --update      # update baseline to current counts
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE_DIR = join(ROOT, "js");

// Baseline: file path (relative to repo root) → known innerHTML assignment count.
// Generated with --update flag.  Files not listed have a baseline of 0.
const BASELINE = {
  "js/app.js": 1,
  "js/app/feedCoordinator.js": 1,
  "js/docsView.js": 8,
  "js/exploreView.js": 1,
  "js/forYouView.js": 1,
  "js/historyView.js": 4,
  "js/index.js": 1,
  "js/kidsView.js": 1,
  "js/ui/components/DeleteModal.js": 3,
  "js/ui/components/EditModal.js": 1,
  "js/ui/components/EmbedVideoModal.js": 1,
  "js/ui/components/EventDetailsModal.js": 1,
  "js/ui/components/nip71FormManager.js": 1,
  "js/ui/components/ShareNostrModal.js": 3,
  "js/ui/components/UploadModal.js": 1,
  "js/ui/components/VideoModal.js": 1,
  "js/ui/dm/AppShell.js": 1,
  "js/ui/dm/Composer.js": 1,
  "js/ui/dm/ConversationList.js": 1,
  "js/ui/dm/DMRelaySettings.js": 1,
  "js/ui/dm/DMSettingsModalController.js": 3,
  "js/ui/dm/MessageThread.js": 1,
  "js/ui/dm/NotificationCenter.js": 1,
  "js/ui/loginModalController.js": 3,
  "js/ui/moreMenuController.js": 1,
  "js/ui/profileModalController.js": 1,
  "js/ui/subscriptionHistoryController.js": 7,
  "js/ui/videoListViewController.js": 1,
  "js/ui/views/VideoListView.js": 3,
  "js/utils/qrcode.js": 2,
  "js/viewManager.js": 3,
};

// Pattern to match innerHTML assignments: .innerHTML = or .innerHTML +=
const PATTERN = /\.innerHTML\s*[+]?=/g;

function collectJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(full);
    }
  }
  return results;
}

function countInnerHtmlUsage(filePath) {
  const content = readFileSync(filePath, "utf8");
  const matches = content.match(PATTERN);
  return matches ? matches.length : 0;
}

function findInnerHtmlLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    if (PATTERN.test(lines[i])) {
      results.push(i + 1);
    }
    // Reset regex lastIndex since we use global flag
    PATTERN.lastIndex = 0;
  }
  return results;
}

const mode = process.argv.includes("--update")
  ? "update"
  : process.argv.includes("--report")
    ? "report"
    : "enforce";

const files = collectJsFiles(SOURCE_DIR);
const violations = [];
const currentCounts = {};

for (const filePath of files) {
  const relPath = relative(ROOT, filePath);
  const count = countInnerHtmlUsage(filePath);

  if (count > 0) {
    currentCounts[relPath] = count;
  }

  const baseline = BASELINE[relPath] || 0;

  if (count > baseline) {
    const lineNums = findInnerHtmlLines(filePath);
    violations.push({
      file: relPath,
      count,
      baseline,
      added: count - baseline,
      lines: lineNums,
    });
  }
}

if (mode === "update") {
  // Print updated baseline for copy-pasting into this script
  console.log("// Updated BASELINE — copy this into check-innerhtml.mjs:");
  console.log("const BASELINE = {");
  const sorted = Object.entries(currentCounts).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [file, count] of sorted) {
    console.log(`  "${file}": ${count},`);
  }
  console.log("};");
  process.exit(0);
}

if (mode === "report") {
  const total = Object.values(currentCounts).reduce((a, b) => a + b, 0);
  console.log(`innerHTML usage: ${total} assignments across ${Object.keys(currentCounts).length} files\n`);
  const sorted = Object.entries(currentCounts).sort(([, a], [, b]) => b - a);
  for (const [file, count] of sorted) {
    const base = BASELINE[file] || 0;
    const status = count > base ? " ← NEW" : "";
    console.log(`  ${file}: ${count}${status}`);
  }
  process.exit(0);
}

// Enforce mode
if (violations.length > 0) {
  console.error(`${violations.length} file(s) introduced new innerHTML usage:\n`);
  for (const v of violations) {
    console.error(
      `  ✗ ${v.file}: ${v.count} total (baseline ${v.baseline}, +${v.added} new) at line(s) ${v.lines.join(", ")}`,
    );
  }
  console.error(
    "\nUse safe DOM APIs instead of innerHTML for new code:",
  );
  console.error(
    "  element.textContent = text;              // plain text (auto-escaped)  ",
  );
  console.error(
    "  element.appendChild(doc.createElement()); // structured DOM building",
  );
  console.error(
    "\nIf innerHTML is truly needed, use escapeHtml() for all interpolated values.",
  );
  console.error(
    "To update the baseline after intentional changes: node scripts/check-innerhtml.mjs --update",
  );
  process.exit(1);
}
