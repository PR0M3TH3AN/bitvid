import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schemas from '../../js/nostrEventSchemas.js';
import { buildNip71VideoEvent } from '../../js/nostr/nip71.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock window for compatibility
if (typeof window === 'undefined') {
  global.window = {};
}

const results = [];

const builders = {
  ...schemas,
  buildNip71VideoEvent
};

function runTest(builderName, testName, args, expectedValid = true) {
  try {
    const builder = builders[builderName];
    if (typeof builder !== 'function') {
      throw new Error(`Builder ${builderName} not found`);
    }

    // Handle arguments: if args is an array, apply it. If it's an object, assume single argument (params).
    // Exception: buildAdminListEvent takes (listKey, params).
    let event;
    if (Array.isArray(args)) {
      event = builder(...args);
    } else {
      event = builder(args);
    }

    if (!event) {
       throw new Error(`Builder ${builderName} returned null/undefined`);
    }

    let type;
    const builderToType = {
      buildVideoPostEvent: schemas.NOTE_TYPES.VIDEO_POST,
      buildVideoMirrorEvent: schemas.NOTE_TYPES.VIDEO_MIRROR,
      buildRepostEvent: schemas.NOTE_TYPES.REPOST,
      buildShareEvent: schemas.NOTE_TYPES.SHARE,
      buildRelayListEvent: schemas.NOTE_TYPES.RELAY_LIST,
      buildDmRelayListEvent: schemas.NOTE_TYPES.DM_RELAY_LIST,
      buildProfileMetadataEvent: schemas.NOTE_TYPES.PROFILE_METADATA,
      buildMuteListEvent: schemas.NOTE_TYPES.MUTE_LIST,
      buildDeletionEvent: schemas.NOTE_TYPES.DELETION,
      buildLegacyDirectMessageEvent: schemas.NOTE_TYPES.LEGACY_DM,
      buildDmAttachmentEvent: schemas.NOTE_TYPES.DM_ATTACHMENT,
      buildDmReadReceiptEvent: schemas.NOTE_TYPES.DM_READ_RECEIPT,
      buildDmTypingIndicatorEvent: schemas.NOTE_TYPES.DM_TYPING,
      buildViewEvent: schemas.NOTE_TYPES.VIEW_EVENT,
      buildZapRequestEvent: schemas.NOTE_TYPES.ZAP_REQUEST,
      buildReactionEvent: schemas.NOTE_TYPES.VIDEO_REACTION,
      buildCommentEvent: schemas.NOTE_TYPES.VIDEO_COMMENT,
      buildWatchHistoryEvent: schemas.NOTE_TYPES.WATCH_HISTORY,
      buildSubscriptionListEvent: schemas.NOTE_TYPES.SUBSCRIPTION_LIST,
      buildBlockListEvent: schemas.NOTE_TYPES.USER_BLOCK_LIST,
      buildHashtagPreferenceEvent: schemas.NOTE_TYPES.HASHTAG_PREFERENCES,
      buildAdminListEvent: schemas.NOTE_TYPES.ADMIN_MODERATION_LIST, // Default
      buildGiftWrapEvent: schemas.NOTE_TYPES.GIFT_WRAP,
      buildSealEvent: schemas.NOTE_TYPES.SEAL,
      buildChatMessageEvent: schemas.NOTE_TYPES.CHAT_MESSAGE,
      buildHttpAuthEvent: schemas.NOTE_TYPES.HTTP_AUTH,
      buildReportEvent: schemas.NOTE_TYPES.REPORT,
      buildNip71VideoEvent: schemas.NOTE_TYPES.NIP71_VIDEO // Default
    };

    type = builderToType[builderName];

    // Special cases for type resolution
    if (builderName === 'buildRepostEvent' && event.kind === 16) {
      type = schemas.NOTE_TYPES.GENERIC_REPOST;
    }
    if (builderName === 'buildAdminListEvent') {
      const listKey = Array.isArray(args) ? args[0] : args; // assuming first arg is listKey
      if (listKey === 'moderation' || listKey === 'editors') type = schemas.NOTE_TYPES.ADMIN_MODERATION_LIST;
      else if (listKey === 'whitelist') type = schemas.NOTE_TYPES.ADMIN_WHITELIST;
      else if (listKey === 'blacklist') type = schemas.NOTE_TYPES.ADMIN_BLACKLIST;
    }
    if (builderName === 'buildNip71VideoEvent') {
      if (event.kind === 22) type = schemas.NOTE_TYPES.NIP71_SHORT_VIDEO;
      else type = schemas.NOTE_TYPES.NIP71_VIDEO;
    }

    const validation = schemas.validateEventStructure(type, event);

    results.push({
      builder: builderName,
      testName,
      inputs: args,
      event,
      valid: validation.valid === expectedValid,
      validationResult: validation,
      expectedValid
    });

  } catch (error) {
    results.push({
      builder: builderName,
      testName,
      inputs: args,
      error: error.message,
      stack: error.stack,
      valid: false
    });
  }
}

// --- Test Cases ---

const PUBKEY = '0000000000000000000000000000000000000000000000000000000000000001';
const CREATED_AT = 1700000000;

// Video Post
runTest('buildVideoPostEvent', 'Basic Video Post', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  dTagValue: 'video-1',
  content: {
    version: 3,
    title: 'My Video',
    videoRootId: 'video-1',
    url: 'https://example.com/video.mp4'
  }
});

runTest('buildVideoPostEvent', 'Video Post with Magnet', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  dTagValue: 'video-2',
  content: {
    version: 3,
    title: 'My Magnet Video',
    videoRootId: 'video-2',
    magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=video'
  }
});

// Video Mirror
runTest('buildVideoMirrorEvent', 'Video Mirror', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  tags: [['url', 'https://example.com/mirror.mp4'], ['m', 'video/mp4']],
  content: 'Alt text'
});

// Repost
runTest('buildRepostEvent', 'Repost Event', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  eventId: '1111111111111111111111111111111111111111111111111111111111111111',
  eventRelay: 'wss://relay.example.com'
});

runTest('buildRepostEvent', 'Generic Repost (Kind 16)', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  targetKind: 30078,
  serializedEvent: JSON.stringify({ kind: 30078, tags: [], content: '{}' })
});

// Share
runTest('buildShareEvent', 'Share Event', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  content: 'Check this out!',
  video: { id: '2222222222222222222222222222222222222222222222222222222222222222', pubkey: PUBKEY },
  relays: ['wss://relay.example.com']
});

// Relay List
runTest('buildRelayListEvent', 'Relay List', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  relays: [
    { url: 'wss://relay1.com', read: true, write: true },
    { url: 'wss://relay2.com', read: true, write: false }
  ]
});

// DM Relay List
runTest('buildDmRelayListEvent', 'DM Relay List', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  relays: ['wss://relay.dm.com']
});

// Profile Metadata
runTest('buildProfileMetadataEvent', 'Profile Metadata', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  metadata: { name: 'Alice', about: 'Hello' }
});

// Mute List
runTest('buildMuteListEvent', 'Mute List', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  pTags: [PUBKEY],
  content: '{ "blockedPubkeys": [] }',
  encrypted: true,
  encryptionTag: 'nip44_v2'
});

// Deletion
runTest('buildDeletionEvent', 'Deletion', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  eventIds: ['3333333333333333333333333333333333333333333333333333333333333333'],
  reason: 'Mistake'
});

// Legacy DM
runTest('buildLegacyDirectMessageEvent', 'Legacy DM', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  ciphertext: 'encrypted_content'
});

// DM Attachment
runTest('buildDmAttachmentEvent', 'DM Attachment', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  attachment: { url: 'https://example.com/file.jpg', x: 'hash', type: 'image/jpeg' }
});

// DM Read Receipt
runTest('buildDmReadReceiptEvent', 'DM Read Receipt', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  eventId: '4444444444444444444444444444444444444444444444444444444444444444'
});

// DM Typing
runTest('buildDmTypingIndicatorEvent', 'DM Typing', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  expiresAt: CREATED_AT + 60
});

// View Event
runTest('buildViewEvent', 'View Event', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  pointerValue: 'video-1',
  dedupeTag: 'session-1',
  includeSessionTag: true
});

// Zap Request
runTest('buildZapRequestEvent', 'Zap Request', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  amountSats: 100,
  relays: ['wss://relay.zap.com']
});

// Reaction
runTest('buildReactionEvent', 'Reaction', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  targetPointer: { type: 'e', value: '5555555555555555555555555555555555555555555555555555555555555555' },
  content: '+'
});

// Comment
runTest('buildCommentEvent', 'Comment', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  content: 'Nice video!',
  videoEventId: '6666666666666666666666666666666666666666666666666666666666666666',
  rootKind: '30078'
});

// Watch History
runTest('buildWatchHistoryEvent', 'Watch History', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  monthIdentifier: '2023-11',
  content: { version: 2, month: '2023-11', items: [] }
});

// Subscription List
runTest('buildSubscriptionListEvent', 'Subscription List', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  content: 'encrypted_subscriptions',
  encryption: 'nip44_v2'
});

// Block List
runTest('buildBlockListEvent', 'Block List', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  content: 'encrypted_blocks',
  encryption: 'nip44_v2'
});

// Hashtag Preferences
runTest('buildHashtagPreferenceEvent', 'Hashtag Preferences', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  content: 'encrypted_preferences'
});

// Admin Lists
runTest('buildAdminListEvent', 'Admin Moderation List', ['moderation', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  hexPubkeys: [PUBKEY]
}]);

runTest('buildAdminListEvent', 'Admin Whitelist', ['whitelist', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  hexPubkeys: [PUBKEY]
}]);

// Gift Wrap
runTest('buildGiftWrapEvent', 'Gift Wrap', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  ciphertext: 'sealed_message'
});

// Seal
runTest('buildSealEvent', 'Seal', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  ciphertext: 'rumor_message'
});

// Chat Message
runTest('buildChatMessageEvent', 'Chat Message', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  recipientPubkey: PUBKEY,
  content: 'Hello'
});

// HTTP Auth
runTest('buildHttpAuthEvent', 'HTTP Auth', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  url: 'https://example.com/auth',
  method: 'GET'
});

// Report
runTest('buildReportEvent', 'Report', {
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  eventId: '7777777777777777777777777777777777777777777777777777777777777777',
  reportType: 'spam'
});

// NIP-71 Video
runTest('buildNip71VideoEvent', 'NIP-71 Video', {
  metadata: {
    title: 'My NIP-71 Video',
    summary: 'Summary',
    kind: 21,
    publishedAt: 1700000000
  },
  pubkey: PUBKEY,
  title: 'My NIP-71 Video',
  created_at: CREATED_AT
});

// --- CLI Handling ---

const args = process.argv.slice(2);
let outFile = 'artifacts/validate-events-latest.json';
const dryRun = args.includes('--dry-run');

args.forEach(arg => {
  if (arg.startsWith('--out=')) {
    outFile = arg.split('=')[1];
  }
});

// Summary
const total = results.length;
const passed = results.filter(r => r.valid).length;
const failed = total - passed;

console.log(`\nValidation Summary: ${passed}/${total} passed`);

if (failed > 0) {
  console.log(`⚠️  ${failed} failures found:`);
  results.filter(r => !r.valid).forEach(r => {
    console.log(`\n[FAIL] ${r.builder}: ${r.testName}`);
    if (r.error) {
      console.log(`  Error: ${r.error}`);
    } else if (r.validationResult && r.validationResult.errors) {
      r.validationResult.errors.forEach(e => console.log(`  Schema Error: ${e}`));
    }
  });
} else {
  console.log('✓ All builders validated successfully.');
}

if (!dryRun) {
  const dir = path.dirname(outFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nReport written to ${outFile}`);
}
