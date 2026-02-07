import crypto from 'node:crypto';

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
  buildAdminListEvent
} from '../../js/nostrEventSchemas.js';

import { buildNip71VideoEvent } from '../../js/nostr/nip71.js';

const TEST_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000001';
const TEST_TIMESTAMP = 1672531200; // 2023-01-01

function runTest(name, builderFn, input, expectedType) {
  console.log(`\nTesting: ${name}`);
  try {
    const event = builderFn(input);
    if (!event) {
      console.error(`❌ Builder returned null or undefined`);
      return false;
    }

    const { valid, errors } = validateEventStructure(expectedType, event);
    if (valid) {
      console.log(`✅ Valid ${expectedType} (Kind: ${event.kind})`);
      return true;
    } else {
      console.error(`❌ Invalid ${expectedType}:`);
      errors.forEach(err => console.error(`   - ${err}`));
      return false;
    }
  } catch (error) {
    console.error(`❌ Exception during build:`, error);
    return false;
  }
}

async function main() {
  console.log('Starting Event Schema Validation...');
  let failures = 0;

  // 1. Video Post
  const videoInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    dTagValue: 'test-video-id',
    content: {
      version: 3,
      title: 'Test Video',
      videoRootId: 'test-video-id',
      url: 'https://example.com/video.mp4',
      magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      thumbnail: 'https://example.com/thumb.jpg',
      description: 'A test video',
      mode: 'live',
      isPrivate: false,
      isNsfw: false,
      isForKids: true,
      enableComments: true
    }
  };
  if (!runTest('buildVideoPostEvent', buildVideoPostEvent, videoInput, NOTE_TYPES.VIDEO_POST)) failures++;

  // 2. Relay List
  const relayListInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    relays: [
      { url: 'wss://relay.example.com', mode: 'read' },
      { url: 'wss://relay.other.com', mode: 'write' },
      'wss://relay.both.com'
    ]
  };
  if (!runTest('buildRelayListEvent', buildRelayListEvent, relayListInput, NOTE_TYPES.RELAY_LIST)) failures++;

  // 3. Hashtag Preferences
  const hashtagInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    content: JSON.stringify({ interests: ['art', 'code'], disinterests: ['spam'] })
  };
  if (!runTest('buildHashtagPreferenceEvent', buildHashtagPreferenceEvent, hashtagInput, NOTE_TYPES.HASHTAG_PREFERENCES)) failures++;

  // 4. HTTP Auth
  const httpAuthInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    url: 'https://api.example.com/auth',
    method: 'POST',
    payload: 'sha256-hash-of-body'
  };
  if (!runTest('buildHttpAuthEvent', buildHttpAuthEvent, httpAuthInput, NOTE_TYPES.HTTP_AUTH)) failures++;

  // 5. Report
  const reportInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    eventId: 'e'.repeat(64),
    reportType: 'spam',
    content: 'This is spam'
  };
  if (!runTest('buildReportEvent', buildReportEvent, reportInput, NOTE_TYPES.REPORT)) failures++;

  // 6. Video Mirror (NIP-94)
  const mirrorInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    content: 'Mirror description'
  };
  if (!runTest('buildVideoMirrorEvent', buildVideoMirrorEvent, mirrorInput, NOTE_TYPES.VIDEO_MIRROR)) failures++;

  // 7. Repost
  const repostInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    eventId: 'e'.repeat(64),
    eventRelay: 'wss://relay.example.com'
  };
  if (!runTest('buildRepostEvent', buildRepostEvent, repostInput, NOTE_TYPES.REPOST)) failures++;

  // 8. Share
  const shareInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    content: 'Check this out',
    video: { id: 'e'.repeat(64), pubkey: TEST_PUBKEY }
  };
  if (!runTest('buildShareEvent', buildShareEvent, shareInput, NOTE_TYPES.SHARE)) failures++;

  // 9. DM Relay List
  const dmRelayListInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    relays: ['wss://dm.relay.com']
  };
  if (!runTest('buildDmRelayListEvent', buildDmRelayListEvent, dmRelayListInput, NOTE_TYPES.DM_RELAY_LIST)) failures++;

  // 10. Profile Metadata
  const profileInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    metadata: { name: 'Alice', about: 'Test user' }
  };
  if (!runTest('buildProfileMetadataEvent', buildProfileMetadataEvent, profileInput, NOTE_TYPES.PROFILE_METADATA)) failures++;

  // 11. Mute List
  const muteListInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    pTags: [TEST_PUBKEY]
  };
  if (!runTest('buildMuteListEvent', buildMuteListEvent, muteListInput, NOTE_TYPES.MUTE_LIST)) failures++;

  // 12. Deletion
  const deletionInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    eventIds: ['e'.repeat(64)],
    reason: 'Mistake'
  };
  if (!runTest('buildDeletionEvent', buildDeletionEvent, deletionInput, NOTE_TYPES.DELETION)) failures++;

  // 13. Legacy DM
  const legacyDmInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    recipientPubkey: TEST_PUBKEY,
    ciphertext: 'encrypted-stuff'
  };
  if (!runTest('buildLegacyDirectMessageEvent', buildLegacyDirectMessageEvent, legacyDmInput, NOTE_TYPES.LEGACY_DM)) failures++;

  // 14. DM Attachment
  const dmAttachmentInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    recipientPubkey: TEST_PUBKEY,
    attachment: { url: 'https://example.com/file.jpg', type: 'image/jpeg' }
  };
  if (!runTest('buildDmAttachmentEvent', buildDmAttachmentEvent, dmAttachmentInput, NOTE_TYPES.DM_ATTACHMENT)) failures++;

  // 15. DM Read Receipt
  const dmReadReceiptInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    recipientPubkey: TEST_PUBKEY,
    eventId: 'e'.repeat(64)
  };
  if (!runTest('buildDmReadReceiptEvent', buildDmReadReceiptEvent, dmReadReceiptInput, NOTE_TYPES.DM_READ_RECEIPT)) failures++;

  // 16. DM Typing Indicator
  const dmTypingInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    recipientPubkey: TEST_PUBKEY
  };
  if (!runTest('buildDmTypingIndicatorEvent', buildDmTypingIndicatorEvent, dmTypingInput, NOTE_TYPES.DM_TYPING)) failures++;

  // 17. View Event
  const viewInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    pointerValue: 'test-pointer',
    pointerTag: ['a', 'test-pointer']
  };
  if (!runTest('buildViewEvent', buildViewEvent, viewInput, NOTE_TYPES.VIEW_EVENT)) failures++;

  // 18. Zap Request
  const zapRequestInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    recipientPubkey: TEST_PUBKEY,
    amountSats: 100,
    relays: ['wss://relay.zap.com']
  };
  if (!runTest('buildZapRequestEvent', buildZapRequestEvent, zapRequestInput, NOTE_TYPES.ZAP_REQUEST)) failures++;

  // 19. Reaction
  const reactionInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    pointerTag: ['e', 'e'.repeat(64)],
    content: '+'
  };
  if (!runTest('buildReactionEvent', buildReactionEvent, reactionInput, NOTE_TYPES.VIDEO_REACTION)) failures++;

  // 20. Comment
  const commentInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    videoEventId: 'e'.repeat(64),
    content: 'Nice video!'
  };
  if (!runTest('buildCommentEvent', buildCommentEvent, commentInput, NOTE_TYPES.VIDEO_COMMENT)) failures++;

  // 21. Watch History
  const watchHistoryInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    monthIdentifier: '2023-01',
    content: JSON.stringify({ ['e'.repeat(64)]: 123456 })
  };
  if (!runTest('buildWatchHistoryEvent', buildWatchHistoryEvent, watchHistoryInput, NOTE_TYPES.WATCH_HISTORY)) failures++;

  // 22. Subscription List
  const subListInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP
  };
  if (!runTest('buildSubscriptionListEvent', buildSubscriptionListEvent, subListInput, NOTE_TYPES.SUBSCRIPTION_LIST)) failures++;

  // 23. Block List
  const blockListInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP
  };
  if (!runTest('buildBlockListEvent', buildBlockListEvent, blockListInput, NOTE_TYPES.USER_BLOCK_LIST)) failures++;

  // 24. Admin List
  const adminListInput = {
    pubkey: TEST_PUBKEY,
    created_at: TEST_TIMESTAMP,
    hexPubkeys: [TEST_PUBKEY]
  };
  if (!runTest('buildAdminListEvent (moderation)', (i) => buildAdminListEvent(ADMIN_LIST_IDENTIFIERS.moderation, i), adminListInput, NOTE_TYPES.ADMIN_MODERATION_LIST)) failures++;

  // 25. NIP-71 Video
  const nip71Input = {
    pubkey: TEST_PUBKEY,
    title: 'NIP-71 Video',
    metadata: {
      kind: 21,
      title: 'NIP-71 Video',
      publishedAt: TEST_TIMESTAMP,
      hashtags: ['test']
    },
    pointerIdentifiers: { videoRootId: 'test-root' }
  };
  if (!runTest('buildNip71VideoEvent', buildNip71VideoEvent, nip71Input, NOTE_TYPES.NIP71_VIDEO)) failures++;


  console.log('\n-----------------------------------');
  if (failures === 0) {
    console.log('🎉 All schema validation tests passed!');
    process.exit(0);
  } else {
    console.error(`💥 ${failures} tests failed.`);
    process.exit(1);
  }
}

main();
