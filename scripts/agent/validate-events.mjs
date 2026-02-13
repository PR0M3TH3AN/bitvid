import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Polyfills for browser environment
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
  }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

process.env.NODE_ENV = 'test';

if (!global.crypto) {
    global.crypto = crypto;
}
global.WebSocket = MockWebSocket;
global.window = {
  crypto: global.crypto,
  WebSocket: MockWebSocket,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  location: { protocol: 'https:' },
  navigator: { userAgent: 'Node.js' },
  __TEST_MODE__: true,
};
global.document = {
  createElement: () => ({}),
  addEventListener: () => {},
};
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Import schemas and builders
import {
  NOTE_TYPES,
  ADMIN_LIST_IDENTIFIERS,
  validateEventStructure,
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
  buildGiftWrapEvent,
  buildSealEvent,
  buildChatMessageEvent,
  getNostrEventSchema,
  getAllNostrEventSchemas,
  sanitizeAdditionalTags
} from '../../js/nostrEventSchemas.js';

import { buildNip71VideoEvent } from '../../js/nostr/nip71.js';

// --- CLI argument parsing ---
function parseArgs(argv) {
  const args = { dryRun: false, out: null, only: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
    } else if (arg.startsWith('--only=')) {
      args.only = arg.slice('--only='.length);
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv);

const TEST_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000001';
const TEST_TIMESTAMP = 1672531200; // 2023-01-01

// Known runtime construction sites (from codebase scan)
const RUNTIME_SITES = [
  { builder: 'buildVideoPostEvent', file: 'js/nostr/videoPayloadBuilder.js', line: 172, context: 'normalizeVideoNotePayload()' },
  { builder: 'buildVideoPostEvent', file: 'js/nostr/videoPayloadBuilder.js', line: 462, context: 'updateVideoPayloadVersion()' },
  { builder: 'buildVideoPostEvent', file: 'js/nostr/publishHelpers.js', line: 1405, context: 'buildVideoEventFromPayload()' },
  { builder: 'buildVideoMirrorEvent', file: 'js/nostr/publishHelpers.js', line: 1164, context: 'mirrorVideoEvent()' },
  { builder: 'buildNip71VideoEvent', file: 'js/nostr/videoPublisher.js', line: 187, context: 'publishNip71Video()' },
  { builder: 'buildProfileMetadataEvent', file: 'js/ui/profileModalController.js', line: 5081, context: 'profile save handler' },
  { builder: 'buildShareEvent', file: 'js/ui/shareNostrController.js', line: 166, context: 'handleShareEvent()' },
  { builder: 'buildRepostEvent', file: 'js/nostr/publishHelpers.js', line: 930, context: 'createRepostEvent()' },
  { builder: 'buildCommentEvent', file: 'js/nostr/commentEvents.js', line: 233, context: 'publishCommentEvent()' },
  { builder: 'buildReactionEvent', file: 'js/nostr/reactionEvents.js', line: 414, context: 'publishReactionEvent()' },
  { builder: 'buildViewEvent', file: 'js/nostr/viewEvents.js', line: 782, context: 'recordVideoViewWithTracking()' },
  { builder: 'buildWatchHistoryEvent', file: 'js/nostr/watchHistory.js', line: 1445, context: 'publishRecords()' },
  { builder: 'buildChatMessageEvent', file: 'js/nostr/client.js', line: 1719, context: 'sendDirectMessage()' },
  { builder: 'buildDmAttachmentEvent', file: 'js/nostr/client.js', line: 1744, context: 'sendDirectMessage()' },
  { builder: 'buildSealEvent', file: 'js/nostr/client.js', line: 1763, context: 'NIP-59 seal for gift wrap' },
  { builder: 'buildGiftWrapEvent', file: 'js/nostr/client.js', line: 1794, context: 'NIP-59 gift wrap for DM' },
  { builder: 'buildLegacyDirectMessageEvent', file: 'js/nostr/client.js', line: 2013, context: 'NIP-04 legacy DM' },
  { builder: 'buildDmReadReceiptEvent', file: 'js/nostr/dmSignalEvents.js', line: 75, context: 'DM read receipt signal' },
  { builder: 'buildDmTypingIndicatorEvent', file: 'js/nostr/dmSignalEvents.js', line: 216, context: 'DM typing indicator signal' },
  { builder: 'buildMuteListEvent', file: 'js/userBlocks.js', line: 2224, context: 'updateUserBlocks()' },
  { builder: 'buildAdminListEvent', file: 'js/adminListStore.js', line: 700, context: 'buildListEvent()' },
  { builder: 'buildReportEvent', file: 'js/services/moderationService.js', line: 2449, context: 'publishReport()' },
  { builder: 'buildSubscriptionListEvent', file: 'js/subscriptions.js', line: 1456, context: 'publishing subscription list' },
  { builder: 'buildHashtagPreferenceEvent', file: 'js/services/hashtagPreferencesService.js', line: 1365, context: 'buildEvent()' },
  { builder: 'buildRelayListEvent', file: 'js/relayManager.js', line: 699, context: 'updateRelayList()' },
  { builder: 'buildDmRelayListEvent', file: 'js/app.js', line: 2839, context: 'DM relay sync' },
  { builder: 'buildZapRequestEvent', file: 'js/payments/zapRequests.js', line: 88, context: 'createZapRequest()' },
  { builder: 'buildDeletionEvent', file: 'js/nostr/client.js', line: 3060, context: 'deletePublishedVideos()' },
  { builder: 'buildHttpAuthEvent', file: 'js/nostr/client.js', line: 0, context: 'HTTP auth flow (if used)' },
];

// --- Test case definitions ---
const TEST_CASES = [
  {
    name: 'buildVideoPostEvent (Real Usage - Auto Storage Pointer)',
    builder: 'buildVideoPostEvent',
    builderFn: buildVideoPostEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      dTagValue: 'test-video-id-123',
      content: {
        version: 3,
        title: 'Real World Video',
        videoRootId: 'test-video-id-123',
        url: 'https://example.com/video.mp4',
        mode: 'live',
        deleted: false,
        isPrivate: false,
        isNsfw: false,
        isForKids: false,
        enableComments: true
      },
      additionalTags: [['t', 'art']]
    },
    expectedType: NOTE_TYPES.VIDEO_POST,
    additionalCheck: (event) => {
      const sTag = event.tags.find(t => t[0] === 's');
      if (!sTag) throw new Error("Missing 's' tag (Storage Pointer) which should have been auto-generated from URL");
      if (!sTag[1].startsWith('url:')) throw new Error(`'s' tag should start with 'url:', got ${sTag[1]}`);
    }
  },
  {
    name: 'buildRelayListEvent (Real Usage)',
    builder: 'buildRelayListEvent',
    builderFn: buildRelayListEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      relays: [
        { url: 'wss://relay.damus.io', mode: 'read' },
        { url: 'wss://nos.lol', mode: 'write' },
        { url: 'wss://relay.primal.net', mode: 'both' }
      ]
    },
    expectedType: NOTE_TYPES.RELAY_LIST,
    additionalCheck: (event) => {
      const rTags = event.tags.filter(t => t[0] === 'r');
      if (rTags.length !== 3) throw new Error(`Expected 3 'r' tags, got ${rTags.length}`);
      const damus = rTags.find(t => t[1] === 'wss://relay.damus.io');
      if (!damus || damus[2] !== 'read') throw new Error("Damus relay missing or incorrect marker");
    }
  },
  {
    name: 'buildHashtagPreferenceEvent (Real Usage - Encrypted)',
    builder: 'buildHashtagPreferenceEvent',
    builderFn: buildHashtagPreferenceEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: "nip44:ciphertext-blob-simulated",
      additionalTags: [['encrypted', 'nip44']]
    },
    expectedType: NOTE_TYPES.HASHTAG_PREFERENCES,
    additionalCheck: (event) => {
      if (event.content !== "nip44:ciphertext-blob-simulated") throw new Error("Content mismatch");
      const dTag = event.tags.find(t => t[0] === 'd');
      if (!dTag || dTag[1] !== 'bitvid:tag-preferences') throw new Error("Incorrect 'd' tag identifier");
    }
  },
  {
    name: 'buildHttpAuthEvent',
    builder: 'buildHttpAuthEvent',
    builderFn: buildHttpAuthEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      url: 'https://api.example.com/auth',
      method: 'POST',
      payload: 'sha256-hash-of-body'
    },
    expectedType: NOTE_TYPES.HTTP_AUTH
  },
  {
    name: 'buildReportEvent',
    builder: 'buildReportEvent',
    builderFn: buildReportEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      eventId: 'e'.repeat(64),
      reportType: 'spam',
      content: 'This is spam'
    },
    expectedType: NOTE_TYPES.REPORT
  },
  {
    name: 'buildVideoMirrorEvent',
    builder: 'buildVideoMirrorEvent',
    builderFn: buildVideoMirrorEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: 'Mirror description'
    },
    expectedType: NOTE_TYPES.VIDEO_MIRROR
  },
  {
    name: 'buildRepostEvent',
    builder: 'buildRepostEvent',
    builderFn: buildRepostEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      eventId: 'e'.repeat(64),
      eventRelay: 'wss://relay.example.com'
    },
    expectedType: NOTE_TYPES.REPOST
  },
  {
    name: 'buildShareEvent',
    builder: 'buildShareEvent',
    builderFn: buildShareEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: 'Check this out',
      video: { id: 'e'.repeat(64), pubkey: TEST_PUBKEY }
    },
    expectedType: NOTE_TYPES.SHARE
  },
  {
    name: 'buildDmRelayListEvent',
    builder: 'buildDmRelayListEvent',
    builderFn: buildDmRelayListEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      relays: ['wss://dm.relay.com']
    },
    expectedType: NOTE_TYPES.DM_RELAY_LIST
  },
  {
    name: 'buildProfileMetadataEvent',
    builder: 'buildProfileMetadataEvent',
    builderFn: buildProfileMetadataEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      metadata: { name: 'Alice', about: 'Test user' }
    },
    expectedType: NOTE_TYPES.PROFILE_METADATA
  },
  {
    name: 'buildMuteListEvent',
    builder: 'buildMuteListEvent',
    builderFn: buildMuteListEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      pTags: [TEST_PUBKEY]
    },
    expectedType: NOTE_TYPES.MUTE_LIST
  },
  {
    name: 'buildDeletionEvent',
    builder: 'buildDeletionEvent',
    builderFn: buildDeletionEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      eventIds: ['e'.repeat(64)],
      reason: 'Mistake'
    },
    expectedType: NOTE_TYPES.DELETION
  },
  {
    name: 'buildLegacyDirectMessageEvent',
    builder: 'buildLegacyDirectMessageEvent',
    builderFn: buildLegacyDirectMessageEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      ciphertext: 'encrypted-stuff'
    },
    expectedType: NOTE_TYPES.LEGACY_DM
  },
  {
    name: 'buildDmAttachmentEvent',
    builder: 'buildDmAttachmentEvent',
    builderFn: buildDmAttachmentEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      attachment: { url: 'https://example.com/file.jpg', type: 'image/jpeg' }
    },
    expectedType: NOTE_TYPES.DM_ATTACHMENT
  },
  {
    name: 'buildDmReadReceiptEvent',
    builder: 'buildDmReadReceiptEvent',
    builderFn: buildDmReadReceiptEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      eventId: 'e'.repeat(64)
    },
    expectedType: NOTE_TYPES.DM_READ_RECEIPT
  },
  {
    name: 'buildDmTypingIndicatorEvent',
    builder: 'buildDmTypingIndicatorEvent',
    builderFn: buildDmTypingIndicatorEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY
    },
    expectedType: NOTE_TYPES.DM_TYPING
  },
  {
    name: 'buildViewEvent',
    builder: 'buildViewEvent',
    builderFn: buildViewEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      pointerValue: 'test-pointer',
      pointerTag: ['a', 'test-pointer']
    },
    expectedType: NOTE_TYPES.VIEW_EVENT
  },
  {
    name: 'buildZapRequestEvent',
    builder: 'buildZapRequestEvent',
    builderFn: buildZapRequestEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      amountSats: 100,
      relays: ['wss://relay.zap.com']
    },
    expectedType: NOTE_TYPES.ZAP_REQUEST
  },
  {
    name: 'buildReactionEvent',
    builder: 'buildReactionEvent',
    builderFn: buildReactionEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      pointerTag: ['e', 'e'.repeat(64)],
      content: '+'
    },
    expectedType: NOTE_TYPES.VIDEO_REACTION
  },
  {
    name: 'buildCommentEvent',
    builder: 'buildCommentEvent',
    builderFn: buildCommentEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      videoEventId: 'e'.repeat(64),
      content: 'Nice video!'
    },
    expectedType: NOTE_TYPES.VIDEO_COMMENT
  },
  {
    name: 'buildWatchHistoryEvent',
    builder: 'buildWatchHistoryEvent',
    builderFn: buildWatchHistoryEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      monthIdentifier: '2023-01',
      content: JSON.stringify({ ['e'.repeat(64)]: 123456 })
    },
    expectedType: NOTE_TYPES.WATCH_HISTORY
  },
  {
    name: 'buildSubscriptionListEvent',
    builder: 'buildSubscriptionListEvent',
    builderFn: buildSubscriptionListEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP
    },
    expectedType: NOTE_TYPES.SUBSCRIPTION_LIST
  },
  {
    name: 'buildBlockListEvent',
    builder: 'buildBlockListEvent',
    builderFn: buildBlockListEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP
    },
    expectedType: NOTE_TYPES.USER_BLOCK_LIST
  },
  {
    name: 'buildAdminListEvent (moderation)',
    builder: 'buildAdminListEvent',
    builderFn: (i) => buildAdminListEvent(ADMIN_LIST_IDENTIFIERS.moderation, i),
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      hexPubkeys: [TEST_PUBKEY]
    },
    expectedType: NOTE_TYPES.ADMIN_MODERATION_LIST
  },
  {
    name: 'buildNip71VideoEvent',
    builder: 'buildNip71VideoEvent',
    builderFn: buildNip71VideoEvent,
    input: {
      pubkey: TEST_PUBKEY,
      title: 'NIP-71 Video',
      metadata: {
        kind: 21,
        title: 'NIP-71 Video',
        publishedAt: TEST_TIMESTAMP,
        hashtags: ['test']
      },
      pointerIdentifiers: { videoRootId: 'test-root' }
    },
    expectedType: NOTE_TYPES.NIP71_VIDEO
  },
  {
    name: 'buildGiftWrapEvent',
    builder: 'buildGiftWrapEvent',
    builderFn: buildGiftWrapEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      ciphertext: 'encrypted-seal',
      relayHint: 'wss://relay.example.com'
    },
    expectedType: NOTE_TYPES.GIFT_WRAP
  },
  {
    name: 'buildSealEvent',
    builder: 'buildSealEvent',
    builderFn: buildSealEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      ciphertext: 'encrypted-rumor'
    },
    expectedType: NOTE_TYPES.SEAL
  },
  {
    name: 'buildChatMessageEvent',
    builder: 'buildChatMessageEvent',
    builderFn: buildChatMessageEvent,
    input: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      content: 'Hello World'
    },
    expectedType: NOTE_TYPES.CHAT_MESSAGE
  },
];

// --- Sanitizer test cases ---
const SANITIZER_TESTS = [
  {
    name: 'sanitizeAdditionalTags (valid tags)',
    input: [['t', 'video'], ['p', TEST_PUBKEY]],
    check: (result) => {
      if (!Array.isArray(result) || result.length !== 2) throw new Error(`Expected 2 tags, got ${result.length}`);
      if (result[0][0] !== 't' || result[0][1] !== 'video') throw new Error('First tag mismatch');
    }
  },
  {
    name: 'sanitizeAdditionalTags (filters invalid)',
    input: [['', 'value'], [123, 'value'], ['valid', 'ok']],
    check: (result) => {
      if (result.length !== 1) throw new Error(`Expected 1 valid tag after filtering, got ${result.length}`);
      if (result[0][0] !== 'valid') throw new Error('Surviving tag should be "valid"');
    }
  },
  {
    name: 'sanitizeAdditionalTags (empty input)',
    input: [],
    check: (result) => {
      if (!Array.isArray(result) || result.length !== 0) throw new Error('Expected empty array');
    }
  },
];

function runTest(testCase) {
  const { name, builderFn, input, expectedType, additionalCheck } = testCase;
  const result = {
    builder: testCase.builder,
    name,
    constructed_by: `validate-events.mjs (test harness)`,
    input: '(redacted — see test case definition)',
    event: null,
    validation: { status: 'PASS', failures: [] },
    suggested_fix: null,
    runtime_sites: RUNTIME_SITES.filter(s => s.builder === testCase.builder),
  };

  try {
    const event = builderFn(input);
    if (!event) {
      result.validation.status = 'FAIL';
      result.validation.failures.push({ path: 'builder', message: 'Builder returned null or undefined' });
      return result;
    }

    result.event = { kind: event.kind, tags_count: event.tags?.length, content_length: event.content?.length };

    const { valid, errors } = validateEventStructure(expectedType, event);
    if (!valid) {
      result.validation.status = 'FAIL';
      result.validation.failures = errors.map(msg => ({ path: 'schema', message: msg }));
      return result;
    }

    if (additionalCheck) {
      try {
        additionalCheck(event);
      } catch (checkError) {
        result.validation.status = 'FAIL';
        result.validation.failures.push({ path: 'additional_check', message: checkError.message });
        return result;
      }
    }
  } catch (error) {
    result.validation.status = 'FAIL';
    result.validation.failures.push({ path: 'exception', message: error.message });
  }

  return result;
}

function runSanitizerTest(testCase) {
  const result = {
    builder: 'sanitizeAdditionalTags',
    name: testCase.name,
    validation: { status: 'PASS', failures: [] },
  };

  try {
    const output = sanitizeAdditionalTags(testCase.input);
    testCase.check(output);
  } catch (error) {
    result.validation.status = 'FAIL';
    result.validation.failures.push({ path: 'sanitizer', message: error.message });
  }

  return result;
}

function verifySchemaRegistry() {
  const results = [];
  const allSchemas = getAllNostrEventSchemas();
  const schemaKeys = Object.keys(allSchemas);
  const noteTypeValues = Object.values(NOTE_TYPES);

  // Check that every NOTE_TYPE has a corresponding schema
  for (const noteType of noteTypeValues) {
    const schema = getNostrEventSchema(noteType);
    const result = {
      builder: 'getNostrEventSchema',
      name: `Schema registry: ${noteType}`,
      validation: { status: 'PASS', failures: [] },
    };
    if (!schema) {
      result.validation.status = 'FAIL';
      result.validation.failures.push({ path: 'registry', message: `No schema found for NOTE_TYPE: ${noteType}` });
    } else if (typeof schema.kind !== 'number') {
      result.validation.status = 'FAIL';
      result.validation.failures.push({ path: 'registry', message: `Schema for ${noteType} has non-numeric kind: ${schema.kind}` });
    }
    results.push(result);
  }

  // Verify getAllNostrEventSchemas returns all types
  const registryResult = {
    builder: 'getAllNostrEventSchemas',
    name: 'Schema registry completeness',
    validation: { status: 'PASS', failures: [] },
  };
  if (schemaKeys.length < noteTypeValues.length) {
    registryResult.validation.status = 'FAIL';
    registryResult.validation.failures.push({
      path: 'registry',
      message: `getAllNostrEventSchemas returned ${schemaKeys.length} schemas but NOTE_TYPES has ${noteTypeValues.length} values`
    });
  }
  results.push(registryResult);

  return results;
}

async function main() {
  const testCases = cliArgs.only
    ? TEST_CASES.filter(tc => tc.builder === cliArgs.only)
    : TEST_CASES;

  if (cliArgs.only && testCases.length === 0) {
    console.error(`No test cases matched --only=${cliArgs.only}`);
    process.exit(1);
  }

  console.log('Starting Event Schema Validation...');
  if (cliArgs.only) console.log(`  Filtered to: ${cliArgs.only}`);
  if (cliArgs.dryRun) console.log('  (dry-run mode — no report file will be written)');

  const report = {
    timestamp: new Date().toISOString(),
    cli_args: { dry_run: cliArgs.dryRun, out: cliArgs.out, only: cliArgs.only },
    builder_results: [],
    sanitizer_results: [],
    schema_registry_results: [],
    runtime_sites: RUNTIME_SITES,
    summary: { total: 0, passed: 0, failed: 0 },
  };

  // Run builder tests
  let failures = 0;
  for (const tc of testCases) {
    const result = runTest(tc);
    report.builder_results.push(result);
    if (result.validation.status === 'PASS') {
      console.log(`\n✅ ${result.name} (Kind: ${result.event?.kind})`);
    } else {
      failures++;
      console.error(`\n❌ ${result.name}`);
      result.validation.failures.forEach(f => console.error(`   - [${f.path}] ${f.message}`));
    }
  }

  // Run sanitizer tests (unless --only filters them out)
  if (!cliArgs.only || cliArgs.only === 'sanitizeAdditionalTags') {
    for (const st of SANITIZER_TESTS) {
      const result = runSanitizerTest(st);
      report.sanitizer_results.push(result);
      if (result.validation.status === 'PASS') {
        console.log(`\n✅ ${result.name}`);
      } else {
        failures++;
        console.error(`\n❌ ${result.name}`);
        result.validation.failures.forEach(f => console.error(`   - [${f.path}] ${f.message}`));
      }
    }
  }

  // Run schema registry checks (unless --only filters them out)
  if (!cliArgs.only) {
    const registryResults = verifySchemaRegistry();
    report.schema_registry_results = registryResults;
    for (const rr of registryResults) {
      if (rr.validation.status === 'PASS') {
        // Don't spam console for per-type registry checks; just count
      } else {
        failures++;
        console.error(`\n❌ ${rr.name}`);
        rr.validation.failures.forEach(f => console.error(`   - [${f.path}] ${f.message}`));
      }
    }
    const regPassed = registryResults.filter(r => r.validation.status === 'PASS').length;
    const regFailed = registryResults.filter(r => r.validation.status !== 'PASS').length;
    console.log(`\n📋 Schema registry: ${regPassed} passed, ${regFailed} failed`);
  }

  // Compute summary
  const allResults = [...report.builder_results, ...report.sanitizer_results, ...report.schema_registry_results];
  report.summary.total = allResults.length;
  report.summary.passed = allResults.filter(r => r.validation.status === 'PASS').length;
  report.summary.failed = allResults.filter(r => r.validation.status !== 'PASS').length;

  // Write report
  if (cliArgs.out && !cliArgs.dryRun) {
    const outDir = path.dirname(cliArgs.out);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(cliArgs.out, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report written to: ${cliArgs.out}`);
  }

  console.log('\n-----------------------------------');
  if (failures === 0) {
    console.log(`✓ All ${report.summary.total} validation checks passed!`);
    process.exit(0);
  } else {
    console.error(`${failures} checks failed out of ${report.summary.total}.`);
    process.exit(1);
  }
}

main();
