#!/usr/bin/env node

/**
 * Lint: enforce the SubscriptionManager (L1) chokepoint.
 *
 * Per docs/architecture-refactor.md, relay reads must go through
 * js/nostr/subscriptionManager.js — nothing else should call pool.sub /
 * pool.list / legacySub / legacyList / subscribeMap directly.
 *
 * Files that still do are GRANDFATHERED below; the allowlist must only SHRINK as
 * phases migrate subsystems. A new file using direct pool access fails the lint;
 * an allowlisted file is reported as a remaining migration target.
 *
 * Usage:
 *   node scripts/check-direct-pool-access.mjs            # enforce (exit 1)
 *   node scripts/check-direct-pool-access.mjs --report   # report only (exit 0)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE_DIR = join(ROOT, "js");

// Patterns that indicate a direct relay-read outside L1.
const PATTERNS = [
  /\bpool\.sub\(/,
  /\bpool\.list\(/,
  /\blegacySub\(/,
  /\blegacyList\(/,
  /\bsubscribeMap\(/,
];

// The only modules allowed to touch the pool directly.
const L1_FILES = new Set([
  "js/nostr/subscriptionManager.js",
  "js/services/relaySubscriptionService.js",
  "js/nostr/toolkit.js", // vendored pool shim (defines legacySub/legacyList)
  "js/nostr/managers/ConnectionManager.js", // owns the pool lifecycle / health probe
]);

// Grandfathered: not yet migrated. SHRINK this list as phases land; do not grow.
const GRANDFATHERED = new Set([
  "js/adminListStore.js",
  "js/app.js",
  "js/channelProfile.js",
  "js/embed.js",
  "js/feedEngine/watchHistoryFeed.js",
  "js/nostr/client.js",
  "js/nostr/commentEvents.js",
  "js/nostr/nip46Client.js",
  "js/nostr/nip46Connector.js",
  "js/nostr/reactionEvents.js",
  "js/nostr/relayBatchFetcher.js",
  // Inherited verbatim from SignerManager._waitForRemoteSignerHandshake during
  // file-size decomposition (the pool.sub usage pre-dates this split). Migration
  // target like the rest — route through subscriptionManager when touched.
  "js/nostr/signerRemoteHandshake.js",
  "js/nostr/viewEvents.js",
  "js/nostr/watchHistory.js",
  "js/payments/platformAddress.js",
  "js/payments/zapReceiptValidator.js",
  "js/reactionCounter.js",
  "js/relayManager.js",
  "js/searchView.js",
  "js/services/authService.js",
  "js/services/dmNostrService.js",
  "js/services/moderationService.js",
  "js/services/nostrService.js",
]);

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const reportOnly = process.argv.includes("--report");
const violations = [];
const remaining = [];

for (const filePath of collectJsFiles(SOURCE_DIR)) {
  const rel = relative(ROOT, filePath);
  if (rel.endsWith(".min.js") || L1_FILES.has(rel)) continue;
  const content = readFileSync(filePath, "utf8");
  if (!PATTERNS.some((re) => re.test(content))) continue;
  if (GRANDFATHERED.has(rel)) remaining.push(rel);
  else violations.push(rel);
}

// Allowlist entries that no longer need to be there (already migrated) — nudge.
const stale = [...GRANDFATHERED].filter(
  (rel) => !remaining.includes(rel),
);

if (remaining.length) {
  console.log(`\n${remaining.length} file(s) still using direct pool access (migration targets):`);
  for (const r of remaining.sort()) console.log(`  • ${r}`);
}
if (stale.length) {
  console.log(`\n${stale.length} allowlist entr(y/ies) can be REMOVED (already migrated):`);
  for (const r of stale.sort()) console.log(`  ✓ ${r}`);
}

if (violations.length) {
  console.error(`\n${violations.length} NEW direct pool access violation(s):`);
  for (const v of violations.sort()) console.error(`  ✗ ${v}`);
  console.error(
    "\nRoute relay reads through js/nostr/subscriptionManager.js (subscribe/list).",
  );
  if (!reportOnly) process.exit(1);
} else {
  console.log("\nNo new direct pool access. (Allowlist must only shrink.)");
}
