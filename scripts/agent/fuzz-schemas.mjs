import './fuzz-setup.mjs';
import * as schemas from '../../js/nostrEventSchemas.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPRODUCER_DIR = 'examples/reproducers';
const REPORT_FILE = 'artifacts/fuzz-report-schemas.json';

const ITERATIONS = 5000;

// Fuzzing inputs generator
function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getRandomString(length = 100) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+{}|:"<>?~`-=[]\;\',./';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRandomUnicodeString(length = 100) {
    let result = '';
    // Include surrogates and other edge cases
    for (let i = 0; i < length; i++) {
        if (Math.random() < 0.1) {
            // Surrogate pair halves
             result += String.fromCharCode(0xD800 + Math.random() * 0x800);
        } else {
             result += String.fromCharCode(Math.random() * 0xFFFF);
        }
    }
    return result;
}

function getRandomValue(depth = 0) {
  if (depth > 3) return null;
  const type = Math.random();
  if (type < 0.1) return null;
  if (type < 0.2) return undefined;
  if (type < 0.3) return getRandomInt(100000);
  if (type < 0.5) return getRandomString(getRandomInt(50));
  if (type < 0.6) return getRandomUnicodeString(getRandomInt(50));
  if (type < 0.7) return true;
  if (type < 0.8) return false;
  if (type < 0.9) {
      const arr = [];
      const len = getRandomInt(5);
      for(let i=0; i<len; i++) arr.push(getRandomValue(depth + 1));
      return arr;
  }
  const obj = {};
  const len = getRandomInt(5);
  for(let i=0; i<len; i++) {
      obj[getRandomString(5)] = getRandomValue(depth + 1);
  }
  return obj;
}

const interestingValues = [
    null,
    undefined,
    0,
    1,
    -1,
    Infinity,
    -Infinity,
    NaN,
    "",
    " ",
    "\n",
    "\t",
    "{}",
    "[]",
    "true",
    "false",
    "null",
    "undefined",
    { toString: () => { throw new Error('toString throw'); } },
    { toJSON: () => { throw new Error('toJSON throw'); } },
    new Array(1000).fill('a').join(''), // large string
    "javascript:alert(1)",
    "__proto__",
    "constructor",
];

function generateFuzzInput(paramsSchema) {
    // If we knew the schema of params, we could be smarter.
    // For now, generate a random object with random keys, plus keys that likely exist.
    const input = {};
    const commonKeys = [
        'pubkey', 'created_at', 'content', 'tags', 'additionalTags',
        'id', 'kind', 'dTagValue', 'eventId', 'eventRelay', 'address',
        'addressRelay', 'authorPubkey', 'repostKind', 'targetKind',
        'targetEvent', 'serializedEvent', 'video', 'relays', 'metadata',
        'pTags', 'eventIds', 'addresses', 'reason', 'recipientPubkey',
        'ciphertext', 'attachment', 'messageKind', 'expiresAt',
        'pointerValue', 'pointerTag', 'pointerTags', 'dedupeTag',
        'includeSessionTag', 'amountSats', 'lnurl', 'coordinate',
        'targetPointer', 'targetAuthorPubkey', 'videoEventId',
        'videoEventRelay', 'videoDefinitionAddress', 'rootIdentifier',
        'parentCommentId', 'threadParticipantPubkey', 'rootKind',
        'monthIdentifier', 'encryption', 'hexPubkeys', 'listKey'
    ];

    // Pick some common keys and assign random or interesting values
    const numKeys = getRandomInt(10);
    for (let i = 0; i < numKeys; i++) {
        const key = commonKeys[getRandomInt(commonKeys.length)];
        const useInteresting = Math.random() < 0.2;
        input[key] = useInteresting ? interestingValues[getRandomInt(interestingValues.length)] : getRandomValue();
    }

    // Also add completely random keys
    const numRandomKeys = getRandomInt(3);
    for (let i = 0; i < numRandomKeys; i++) {
        input[getRandomString(5)] = getRandomValue();
    }

    return input;
}

async function run() {
    console.log(`Starting fuzzing schemas for ${ITERATIONS} iterations...`);

    const functionsToFuzz = [
        { name: 'buildVideoPostEvent', fn: schemas.buildVideoPostEvent },
        { name: 'buildVideoMirrorEvent', fn: schemas.buildVideoMirrorEvent },
        { name: 'buildRepostEvent', fn: schemas.buildRepostEvent },
        { name: 'buildShareEvent', fn: schemas.buildShareEvent },
        { name: 'buildRelayListEvent', fn: schemas.buildRelayListEvent },
        { name: 'buildDmRelayListEvent', fn: schemas.buildDmRelayListEvent },
        { name: 'buildProfileMetadataEvent', fn: schemas.buildProfileMetadataEvent },
        { name: 'buildMuteListEvent', fn: schemas.buildMuteListEvent },
        { name: 'buildDeletionEvent', fn: schemas.buildDeletionEvent },
        { name: 'buildLegacyDirectMessageEvent', fn: schemas.buildLegacyDirectMessageEvent },
        { name: 'buildDmAttachmentEvent', fn: schemas.buildDmAttachmentEvent },
        { name: 'buildDmReadReceiptEvent', fn: schemas.buildDmReadReceiptEvent },
        { name: 'buildDmTypingIndicatorEvent', fn: schemas.buildDmTypingIndicatorEvent },
        { name: 'buildViewEvent', fn: schemas.buildViewEvent },
        { name: 'buildZapRequestEvent', fn: schemas.buildZapRequestEvent },
        { name: 'buildReactionEvent', fn: schemas.buildReactionEvent },
        { name: 'buildCommentEvent', fn: schemas.buildCommentEvent },
        { name: 'buildWatchHistoryEvent', fn: schemas.buildWatchHistoryEvent },
        { name: 'buildSubscriptionListEvent', fn: schemas.buildSubscriptionListEvent },
        { name: 'buildBlockListEvent', fn: schemas.buildBlockListEvent },
        { name: 'buildHashtagPreferenceEvent', fn: schemas.buildHashtagPreferenceEvent },
        { name: 'buildAdminListEvent', fn: (params) => schemas.buildAdminListEvent(params.listKey, params) }, // Wrapper since it takes 2 args
    ];

    const report = {
        target: 'js/nostrEventSchemas.js',
        timestamp: new Date().toISOString(),
        iterations: ITERATIONS,
        crashes: [],
    };

    const uniqueCrashes = new Set();

    for (const { name, fn } of functionsToFuzz) {
        for (let i = 0; i < ITERATIONS; i++) {
            const input = generateFuzzInput();
            try {
                const result = fn(input);
                // Optional: validate output structure
                // if (result) {
                //    schemas.validateEventAgainstSchema(result.kind, result);
                // }
            } catch (err) {
                const crashKey = `${name}:${err.message}`;
                if (uniqueCrashes.has(crashKey)) {
                    continue;
                }
                uniqueCrashes.add(crashKey);

                let safeInput = "Could not stringify input";
                try {
                    safeInput = JSON.stringify(input, (k, v) => v === undefined ? '__undefined__' : v);
                } catch (e) {
                    safeInput = "[Input causes JSON.stringify to throw]";
                }

                const crashInfo = {
                    function: name,
                    input: safeInput,
                    error: err.toString(),
                    stack: err.stack,
                };

                // Save reproducer
                const hash = crypto.createHash('sha256').update(JSON.stringify(crashInfo)).digest('hex').slice(0, 8);
                const filename = `crash-schemas-${name}-${hash}.json`;
                fs.writeFileSync(path.join(REPRODUCER_DIR, filename), JSON.stringify(crashInfo, null, 2));

                report.crashes.push({
                    file: filename,
                    function: name,
                    error: err.message
                });

                console.error(`[CRASH] ${name} failed! Saved to ${filename}`);
            }
        }
    }

    if (!fs.existsSync(path.dirname(REPORT_FILE))) {
        fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    }
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`Fuzzing complete. Report saved to ${REPORT_FILE}. Crashes: ${report.crashes.length}`);
}

run();
