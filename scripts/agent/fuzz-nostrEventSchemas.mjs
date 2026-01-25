import {
  buildVideoPostEvent,
  buildHttpAuthEvent,
  buildReportEvent,
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
  buildAdminListEvent,
  validateEventStructure,
  sanitizeAdditionalTags,
  NOTE_TYPES
} from '../../js/nostrEventSchemas.js';

import {
  fuzzBoolean,
  fuzzInt,
  fuzzString,
  fuzzHexString,
  fuzzJSON,
  pickOne,
  fuzzSurrogatePairString,
  saveFuzzReport,
  saveReproducer
} from './fuzz-utils.mjs';

const ITERATIONS = 1000;
const FINDINGS = [];

function logError(target, input, error) {
  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  console.error(`[FAIL] ${target} crashed! ID: ${id}`);
  FINDINGS.push({
    id,
    target,
    error: error.message,
    stack: error.stack,
    input
  });
  saveReproducer(target, id, input, error);
}

function generateRandomParams() {
  const params = {};
  const keys = ['pubkey', 'created_at', 'content', 'tags', 'additionalTags', 'dTagValue', 'url', 'method', 'payload', 'eventId', 'userId', 'reportType', 'relayHint', 'recipientPubkey', 'ciphertext', 'attachment', 'messageKind', 'expiresAt', 'pointerValue', 'pointerTag', 'dedupeTag', 'amountSats', 'lnurl', 'coordinate', 'videoEventId', 'rootKind'];

  // Randomly select some keys to populate
  keys.forEach(key => {
    if (fuzzBoolean()) {
      if (key === 'created_at' || key === 'amountSats' || key === 'messageKind' || key === 'expiresAt') {
        params[key] = fuzzBoolean() ? fuzzInt() : fuzzString(); // Mix types
      } else if (key === 'pubkey' || key === 'recipientPubkey') {
        params[key] = fuzzBoolean() ? fuzzHexString() : fuzzString();
      } else if (key === 'tags' || key === 'additionalTags') {
        params[key] = fuzzBoolean() ? [] : fuzzJSON(2); // Can be valid array or random JSON
      } else if (key === 'content') {
        params[key] = fuzzBoolean() ? fuzzSurrogatePairString(100) : fuzzJSON(2);
      } else {
        params[key] = fuzzString();
      }
    }
  });

  return params;
}

function fuzzBuilder(name, builderFn, argsGenerator) {
  for (let i = 0; i < ITERATIONS; i++) {
    const args = argsGenerator();
    try {
      if (Array.isArray(args)) {
        builderFn(...args);
      } else {
        builderFn(args);
      }
    } catch (error) {
      logError(name, args, error);
    }
  }
}

console.log('Starting fuzzing for nostrEventSchemas.js...');

// Fuzz all builders
const builders = [
  { name: 'buildVideoPostEvent', fn: buildVideoPostEvent },
  { name: 'buildHttpAuthEvent', fn: buildHttpAuthEvent },
  { name: 'buildReportEvent', fn: buildReportEvent },
  { name: 'buildVideoMirrorEvent', fn: buildVideoMirrorEvent },
  { name: 'buildRepostEvent', fn: buildRepostEvent },
  { name: 'buildShareEvent', fn: buildShareEvent },
  { name: 'buildRelayListEvent', fn: buildRelayListEvent },
  { name: 'buildDmRelayListEvent', fn: buildDmRelayListEvent },
  { name: 'buildProfileMetadataEvent', fn: buildProfileMetadataEvent },
  { name: 'buildMuteListEvent', fn: buildMuteListEvent },
  { name: 'buildDeletionEvent', fn: buildDeletionEvent },
  { name: 'buildLegacyDirectMessageEvent', fn: buildLegacyDirectMessageEvent },
  { name: 'buildDmAttachmentEvent', fn: buildDmAttachmentEvent },
  { name: 'buildDmReadReceiptEvent', fn: buildDmReadReceiptEvent },
  { name: 'buildDmTypingIndicatorEvent', fn: buildDmTypingIndicatorEvent },
  { name: 'buildViewEvent', fn: buildViewEvent },
  { name: 'buildZapRequestEvent', fn: buildZapRequestEvent },
  { name: 'buildReactionEvent', fn: buildReactionEvent },
  { name: 'buildCommentEvent', fn: buildCommentEvent },
  { name: 'buildWatchHistoryEvent', fn: buildWatchHistoryEvent },
  { name: 'buildSubscriptionListEvent', fn: buildSubscriptionListEvent },
  { name: 'buildBlockListEvent', fn: buildBlockListEvent },
  { name: 'buildHashtagPreferenceEvent', fn: buildHashtagPreferenceEvent },
];

builders.forEach(({ name, fn }) => {
  fuzzBuilder(name, fn, () => [generateRandomParams()]);
});

// Special case for buildAdminListEvent
fuzzBuilder('buildAdminListEvent', buildAdminListEvent, () => {
  const listKey = pickOne(['moderation', 'editors', 'whitelist', 'blacklist', fuzzString()]);
  return [listKey, generateRandomParams()];
});

// Fuzz validateEventStructure
fuzzBuilder('validateEventStructure', validateEventStructure, () => {
  const type = pickOne([...Object.values(NOTE_TYPES), fuzzString()]);
  const event = fuzzJSON(2); // Random object/JSON
  return [type, event];
});

// Fuzz sanitizeAdditionalTags
fuzzBuilder('sanitizeAdditionalTags', sanitizeAdditionalTags, () => {
  // Random input: array of arrays, array of strings, random object, etc.
  if (fuzzBoolean()) {
    // structured but potentially malformed tags
    const tags = [];
    const count = fuzzInt(0, 10);
    for (let i = 0; i < count; i++) {
      if (fuzzBoolean()) {
        const tag = [fuzzString()];
        const args = fuzzInt(0, 5);
        for (let j = 0; j < args; j++) {
            tag.push(fuzzBoolean() ? fuzzString() : fuzzJSON(1));
        }
        tags.push(tag);
      } else {
        tags.push(pickOne([null, undefined, 123, {}, "string"]));
      }
    }
    return [tags];
  }
  // completely random input
  return [fuzzJSON(2)];
});

saveFuzzReport('nostrEventSchemas', FINDINGS);
console.log(`Fuzzing complete. Found ${FINDINGS.length} crashes.`);
if (FINDINGS.length > 0) {
    process.exit(1);
}
