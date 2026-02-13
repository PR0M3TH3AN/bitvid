import {
  buildVideoPostEvent,
  buildHttpAuthEvent,
  buildReportEvent,
  buildGiftWrapEvent,
  buildSealEvent,
  buildChatMessageEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildShareEvent,
  buildRelayListEvent,
  buildDmRelayListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
  buildDeletionEvent,
  buildLegacyDirectMessageEvent,
  buildDmAttachmentEvent,
  buildDmReadReceiptEvent,
  buildDmTypingIndicatorEvent,
  buildViewEvent,
  buildZapRequestEvent,
  buildReactionEvent,
  buildCommentEvent,
  buildWatchHistoryEvent,
  buildSubscriptionListEvent,
  buildBlockListEvent,
  buildHashtagPreferenceEvent,
  validateEventStructure,
  NOTE_TYPES
} from '../../js/nostrEventSchemas.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPRO_DIR = path.join(__dirname, '../../examples/reproducers');
const ARTIFACTS_DIR = path.join(__dirname, '../../artifacts');

// Ensure directories exist
if (!fs.existsSync(REPRO_DIR)) fs.mkdirSync(REPRO_DIR, { recursive: true });
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const TARGETS = {
  buildVideoPostEvent,
  buildHttpAuthEvent,
  buildReportEvent,
  buildGiftWrapEvent,
  buildSealEvent,
  buildChatMessageEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildShareEvent,
  buildRelayListEvent,
  buildDmRelayListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
  buildDeletionEvent,
  buildLegacyDirectMessageEvent,
  buildDmAttachmentEvent,
  buildDmReadReceiptEvent,
  buildDmTypingIndicatorEvent,
  buildViewEvent,
  buildZapRequestEvent,
  buildReactionEvent,
  buildCommentEvent,
  buildWatchHistoryEvent,
  buildSubscriptionListEvent,
  buildBlockListEvent,
  buildHashtagPreferenceEvent,
};

// Fuzzing Configuration
const CONFIG = {
  iterations: 2000,
  seed: process.env.SEED || Date.now().toString(),
  maxDepth: 3,
  maxStringLength: 1024,
  timeoutMs: 5000 // Per function call
};

console.log(`[Fuzz] Starting fuzz run with seed: ${CONFIG.seed}`);

// Random Generator
class Random {
  constructor(seed) {
    this.state = BigInt(seed);
  }

  next() {
    // Simple LCG
    this.state = (this.state * 6364136223846793005n + 1442695040888963407n) % 18446744073709551616n;
    return Number(this.state) / Number(18446744073709551616n);
  }

  bool() { return this.next() > 0.5; }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(arr) {
    if (arr.length === 0) return undefined;
    return arr[this.int(0, arr.length - 1)];
  }

  string(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}|:"<>?';
    let res = '';
    const len = this.int(0, length);
    for (let i = 0; i < len; i++) res += this.pick(chars);
    return res;
  }

  unicodeString(length = 10) {
    let res = '';
    const len = this.int(0, length);
    for (let i = 0; i < len; i++) res += String.fromCodePoint(this.int(0, 0x10FFFF));
    return res;
  }
}

const rng = new Random(CONFIG.seed);

// Input Generators
const GENERATORS = {
  null: () => null,
  undefined: () => undefined,
  number: () => rng.int(-10000, 10000),
  float: () => rng.next() * 10000,
  boolean: () => rng.bool(),
  string: () => rng.string(rng.int(0, 100)),
  longString: () => rng.string(rng.int(1000, CONFIG.maxStringLength)),
  unicodeString: () => rng.unicodeString(rng.int(0, 100)),
  emptyArray: () => [],
  emptyObject: () => ({}),

  // Specific nasty inputs
  surrogatePair: () => '\uD800', // Unmatched surrogate
  constructorKey: () => 'constructor',
  prototypeKey: () => '__proto__',

  // Composite generators
  array: (depth = 0) => {
    if (depth > CONFIG.maxDepth) return [];
    const len = rng.int(0, 5);
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push(generateAny(depth + 1));
    }
    return arr;
  },

  object: (depth = 0) => {
    if (depth > CONFIG.maxDepth) return {};
    const len = rng.int(0, 5);
    const obj = {};
    for (let i = 0; i < len; i++) {
      obj[rng.string(5)] = generateAny(depth + 1);
    }
    return obj;
  }
};

function generateAny(depth = 0) {
  const types = Object.keys(GENERATORS).filter(k => k !== 'array' && k !== 'object');
  // 20% chance of composite types if depth allows
  if (depth < CONFIG.maxDepth && rng.bool()) {
    types.push('array', 'object');
  }
  const type = rng.pick(types);
  return GENERATORS[type](depth);
}

// Generate specifically malicious params for builder functions
function generateParams() {
  // Sometimes return non-object
  if (rng.next() < 0.1) return generateAny();

  const params = {};
  const keys = [
    'pubkey', 'created_at', 'content', 'additionalTags', 'tags', 'relays',
    'id', 'eventId', 'recipientPubkey', 'url', 'magnet', 'title', 'dTagValue',
    'metadata', 'reason', 'attachment', 'pTags'
  ];

  // Fuzz common keys
  keys.forEach(key => {
    if (rng.bool()) params[key] = generateAny();
  });

  // Inject specific structure for additionalTags (common crash point: expecting array of arrays)
  if (rng.bool()) {
    params.additionalTags = rng.next() < 0.5
      ? generateAny() // Random junk
      : [generateAny(), generateAny()]; // Array of junk
  }

  return params;
}

// Report
const report = {
  target: 'nostrEventSchemas.js',
  seed: CONFIG.seed,
  iterations: CONFIG.iterations,
  startTime: new Date().toISOString(),
  failures: []
};

// Runner
function runFuzz() {
  let passed = 0;
  let failed = 0;

  for (const [funcName, func] of Object.entries(TARGETS)) {
    console.log(`Fuzzing ${funcName}...`);
    for (let i = 0; i < CONFIG.iterations; i++) {
      const input = generateParams();

      try {
        func(input);
        passed++;
      } catch (err) {
        failed++;
        console.error(`[FAILURE] ${funcName} crashed!`);
        console.error(err);

        const caseId = `${funcName}-${Date.now()}-${i}`;
        const reproPath = path.join(REPRO_DIR, `fuzz-nostr-schemas-${new Date().toISOString().split('T')[0]}`, caseId);

        fs.mkdirSync(reproPath, { recursive: true });

        // Save Input
        fs.writeFileSync(path.join(reproPath, 'input.json'), JSON.stringify(input, null, 2));

        // Save Repro Script
        const reproScript = `
import { ${funcName} } from '../../../../../js/nostrEventSchemas.js';
const input = ${JSON.stringify(input, null, 2)};
try {
  ${funcName}(input);
  console.log('Did not crash.');
} catch (e) {
  console.error('Crashed:', e);
  process.exit(1);
}
`;
        fs.writeFileSync(path.join(reproPath, 'repro.mjs'), reproScript);

        report.failures.push({
          caseId,
          function: funcName,
          error: err.message,
          stack: err.stack,
          reproPath
        });
      }
    }
  }

  report.endTime = new Date().toISOString();
  report.summary = { passed, failed };

  // Write report
  const reportPath = path.join(ARTIFACTS_DIR, `fuzz-report-nostr-schemas-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[Fuzz] Finished. Passed: ${passed}, Failed: ${failed}`);
  console.log(`[Fuzz] Report saved to ${reportPath}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFuzz();
