import { profileCache } from "../js/state/profileCache.js";

class LegacyProfileCache {
  constructor() {
    this.memoryCache = new Map();
  }

  set(pubkey, section, data) {
    this.memoryCache.set(`${pubkey}:${section}`, data);
  }

  clearMemoryCache(pubkey) {
    const prefix = `${pubkey}:`;
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }
}

function generatePubkey(i) {
  return i.toString(16).padStart(64, '0');
}

function runBenchmark() {
  const legacy = new LegacyProfileCache();

  // Clean actual cache just in case
  profileCache.memoryCache.clear();

  const PUBKEY_COUNT = 1000;
  const SECTIONS_PER_PUBKEY = 20;
  const TARGET_PUBKEY = generatePubkey(500); // Middle one

  console.log(`Setting up caches with ${PUBKEY_COUNT} pubkeys x ${SECTIONS_PER_PUBKEY} sections...`);

  // Populate
  for (let i = 0; i < PUBKEY_COUNT; i++) {
    const pubkey = generatePubkey(i);
    for (let s = 0; s < SECTIONS_PER_PUBKEY; s++) {
      const section = `section-${s}`;
      const data = { value: `data-${i}-${s}` };

      // Legacy
      legacy.set(pubkey, section, data);

      // Actual (Optimized)
      // We use setMemoryDataForPubkey to bypass storage/logic overhead
      profileCache.setMemoryDataForPubkey(pubkey, section, data);
    }
  }

  console.log(`Total entries: ${PUBKEY_COUNT * SECTIONS_PER_PUBKEY}`);

  // Measure Legacy
  const startLegacy = performance.now();
  legacy.clearMemoryCache(TARGET_PUBKEY);
  const endLegacy = performance.now();
  const timeLegacy = endLegacy - startLegacy;

  // Measure Optimized
  const startOptimized = performance.now();
  profileCache.clearMemoryCache(TARGET_PUBKEY);
  const endOptimized = performance.now();
  const timeOptimized = endOptimized - startOptimized;

  console.log(`\nResults:`);
  console.log(`Legacy (Linear Scan): ${timeLegacy.toFixed(4)} ms`);
  console.log(`Optimized (Nested Map): ${timeOptimized.toFixed(4)} ms`);

  if (timeLegacy > timeOptimized) {
      const factor = timeLegacy / (timeOptimized || 0.001); // avoid div by zero
      console.log(`Improvement: ~${factor.toFixed(1)}x faster`);
  } else {
      console.log("No improvement detected (dataset might be too small or optimized code has overhead)");
  }

  // Verification
  if (profileCache.memoryCache.has(TARGET_PUBKEY)) {
      console.error("FAIL: Optimized cache did not clear the pubkey!");
      process.exit(1);
  } else {
      console.log("PASS: Optimized cache cleared successfully.");
  }
}

runBenchmark();
