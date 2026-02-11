#!/usr/bin/env node

/**
 * Lint script: enforce maximum file size for JavaScript source files.
 *
 * Files that already exceed the threshold are grandfathered in an allowlist.
 * The allowlist records each file's line count at the time it was added.
 * A grandfathered file may NOT grow — if its current line count exceeds the
 * recorded count, the check fails.  New files that exceed the threshold
 * without an allowlist entry also fail.
 *
 * Usage:
 *   node scripts/check-file-size.mjs            # enforce (exit 1 on failure)
 *   node scripts/check-file-size.mjs --report    # report only (exit 0)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE_DIR = join(ROOT, "js");
const THRESHOLD = 1000; // lines — new files must stay under this
const GROWTH_MARGIN = 50; // lines — allowlisted files may grow by this much for minor fixes

// Grandfathered files: path relative to repo root → line count when recorded.
// These files are known to be oversized and are decomposition targets.
// They must NOT grow beyond (recorded + GROWTH_MARGIN).
const GRANDFATHERED = {
  "js/ui/profileModalController.js": 8753,
  "js/ui/components/VideoModal.js": 6284,
  "js/app.js": 5602,
  "js/channelProfile.js": 5529,
  "js/nostr/client.js": 4356,
  "js/ui/components/VideoCard.js": 3129,
  "js/nostrEventSchemas.js": 2906,
  "js/ui/loginModalController.js": 2552,
  "js/historyView.js": 2545,
  "js/services/moderationService.js": 2512,
  "js/subscriptions.js": 2374,
  "js/userBlocks.js": 2297,
  "js/services/nostrService.js": 2227,
  "js/nostr/watchHistory.js": 2211,
  "js/nostr/nip46Client.js": 2102,
  "js/state/cache.js": 1827,
  "js/app/feedCoordinator.js": 1767,
  "js/app/authSessionCoordinator.js": 1743,
  "js/ui/components/RevertModal.js": 1663,
  "js/payments/nwcClient.js": 1642,
  "js/ui/moreMenuController.js": 1601,
  "js/nostr/commentEvents.js": 1571,
  "js/nostr/nip71.js": 1531,
  "js/services/hashtagPreferencesService.js": 1434,
  "js/nostr/publishHelpers.js": 1415,
  "js/index.js": 1412,
  "js/watchHistoryService.js": 1395,
  "js/app/playbackCoordinator.js": 1376,
  "js/feedEngine/stages.js": 1370,
  "js/ui/views/VideoListView.js": 1359,
  "js/ui/components/UploadModal.js": 1319,
  "js/ui/components/SimilarContentCard.js": 1303,
  "js/services/playbackService.js": 1289,
  "js/services/authService.js": 1276,
  "js/ui/zapController.js": 1206,
  "js/services/r2Service.js": 1194,
  "js/ui/applicationBootstrap.js": 1163,
  "js/ui/components/EditModal.js": 1130,
  "js/services/commentThreadService.js": 1122,
  "js/nostr/managers/SignerManager.js": 1106,
  "js/nostr/nip46Connector.js": 1094,
  "js/ui/overlay/popoverEngine.js": 1070,
  "js/webtorrent.js": 1037,
  "js/adminListStore.js": 1033,
};

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

function countLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  return content.split("\n").length;
}

const reportOnly = process.argv.includes("--report");
const files = collectJsFiles(SOURCE_DIR);
const violations = [];
const warnings = [];

for (const filePath of files) {
  const relPath = relative(ROOT, filePath);
  const lines = countLines(filePath);

  if (relPath in GRANDFATHERED) {
    const recorded = GRANDFATHERED[relPath];
    const limit = recorded + GROWTH_MARGIN;
    if (lines > limit) {
      violations.push(
        `GREW: ${relPath} (${lines} lines, was ${recorded}, limit ${limit})`,
      );
    } else if (lines > THRESHOLD) {
      warnings.push(`grandfathered: ${relPath} (${lines} lines)`);
    }
  } else if (lines > THRESHOLD) {
    violations.push(`NEW: ${relPath} (${lines} lines, threshold ${THRESHOLD})`);
  }
}

if (warnings.length > 0 && (reportOnly || violations.length > 0)) {
  console.log(`\n${warnings.length} grandfathered oversized file(s):`);
  for (const w of warnings) {
    console.log(`  ⚠ ${w}`);
  }
}

if (violations.length > 0) {
  console.error(`\n${violations.length} file size violation(s):`);
  for (const v of violations) {
    console.error(`  ✗ ${v}`);
  }
  console.error(
    `\nNew files must stay under ${THRESHOLD} lines. Grandfathered files must not grow.`,
  );
  console.error(
    "To decompose a large file, extract logic into smaller modules and re-export.",
  );
  if (!reportOnly) {
    process.exit(1);
  }
} else {
  if (reportOnly && warnings.length > 0) {
    console.log(
      `\nNo violations. ${warnings.length} grandfathered file(s) remain as decomposition targets.`,
    );
  }
}
