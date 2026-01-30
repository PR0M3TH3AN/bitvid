// scripts/agent/validate-events.mjs
import WebSocket from 'ws';
import { webcrypto } from 'node:crypto';

// Polyfill WebSocket
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

// Polyfill window and self
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

// Polyfill crypto
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Polyfill localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(String(k), String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    key: (i) => Array.from(storage.keys())[i] || null,
    get length() { return storage.size; }
  };
}

if (typeof globalThis.window.localStorage === 'undefined') {
    globalThis.window.localStorage = globalThis.localStorage;
}

// Mock navigator
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node' };
}

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
  NOTE_TYPES,
  ADMIN_LIST_IDENTIFIERS
} from '../../js/nostrEventSchemas.js';
import { buildNip71VideoEvent } from '../../js/nostr/nip71.js';

// Note: Most builders are defined in js/nostrEventSchemas.js and are already instrumented
// with validation checks (validateEventAgainstSchema) when running in Dev Mode.
// buildNip71VideoEvent was instrumented in js/nostr/nip71.js as part of this work.
// This script verifies that all builders produce valid events according to the schema.

const testCases = [
  {
    name: 'Video Post',
    type: NOTE_TYPES.VIDEO_POST,
    builder: buildVideoPostEvent,
    params: {
      pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
      created_at: 1234567890,
      dTagValue: 'test-video',
      content: {
        version: 3,
        title: 'Test Video',
        videoRootId: 'test-root',
      }
    }
  },
  {
    name: 'HTTP Auth',
    type: NOTE_TYPES.HTTP_AUTH,
    builder: buildHttpAuthEvent,
    params: {
      pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
      created_at: 1234567890,
      url: 'https://example.com',
      method: 'GET'
    }
  },
  {
    name: 'Report',
    type: NOTE_TYPES.REPORT,
    builder: buildReportEvent,
    params: {
      pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
      created_at: 1234567890,
      eventId: '0000000000000000000000000000000000000000000000000000000000000002',
      reportType: 'nudity'
    }
  },
  {
    name: 'Video Mirror',
    type: NOTE_TYPES.VIDEO_MIRROR,
    builder: buildVideoMirrorEvent,
    params: {
      pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
      created_at: 1234567890,
      content: 'Alt text'
    }
  },
  {
    name: 'Repost',
    type: NOTE_TYPES.REPOST,
    builder: buildRepostEvent,
    params: {
      pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
      created_at: 1234567890,
      eventId: '0000000000000000000000000000000000000000000000000000000000000002',
      targetKind: 1
    }
  },
  {
    name: 'Share',
    type: NOTE_TYPES.SHARE,
    builder: buildShareEvent,
    params: {
      pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
      created_at: 1234567890,
      content: 'Check this out',
      video: { id: '0000000000000000000000000000000000000000000000000000000000000002' }
    }
  },
  {
    name: 'Relay List',
    type: NOTE_TYPES.RELAY_LIST,
    builder: buildRelayListEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        relays: ['wss://relay.example.com']
    }
  },
  {
    name: 'DM Relay List',
    type: NOTE_TYPES.DM_RELAY_LIST,
    builder: buildDmRelayListEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        relays: ['wss://relay.example.com']
    }
  },
  {
    name: 'Profile Metadata',
    type: NOTE_TYPES.PROFILE_METADATA,
    builder: buildProfileMetadataEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        metadata: { name: 'Alice' }
    }
  },
  {
    name: 'Mute List',
    type: NOTE_TYPES.MUTE_LIST,
    builder: buildMuteListEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        pTags: ['0000000000000000000000000000000000000000000000000000000000000002']
    }
  },
  {
    name: 'Deletion',
    type: NOTE_TYPES.DELETION,
    builder: buildDeletionEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        eventIds: ['0000000000000000000000000000000000000000000000000000000000000002']
    }
  },
  {
    name: 'Legacy DM',
    type: NOTE_TYPES.LEGACY_DM,
    builder: buildLegacyDirectMessageEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        recipientPubkey: '0000000000000000000000000000000000000000000000000000000000000002',
        ciphertext: 'base64ciphertext'
    }
  },
  {
    name: 'DM Attachment',
    type: NOTE_TYPES.DM_ATTACHMENT,
    builder: buildDmAttachmentEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        recipientPubkey: '0000000000000000000000000000000000000000000000000000000000000002',
        attachment: { url: 'https://example.com/file.jpg', x: 'hash' }
    }
  },
  {
    name: 'DM Read Receipt',
    type: NOTE_TYPES.DM_READ_RECEIPT,
    builder: buildDmReadReceiptEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        recipientPubkey: '0000000000000000000000000000000000000000000000000000000000000002',
        eventId: '0000000000000000000000000000000000000000000000000000000000000002'
    }
  },
  {
    name: 'DM Typing Indicator',
    type: NOTE_TYPES.DM_TYPING,
    builder: buildDmTypingIndicatorEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        recipientPubkey: '0000000000000000000000000000000000000000000000000000000000000002',
        expiresAt: 1234567900
    }
  },
  {
    name: 'View Event',
    type: NOTE_TYPES.VIEW_EVENT,
    builder: buildViewEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        pointerValue: '0000000000000000000000000000000000000000000000000000000000000002'
    }
  },
  {
    name: 'Zap Request',
    type: NOTE_TYPES.ZAP_REQUEST,
    builder: buildZapRequestEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        recipientPubkey: '0000000000000000000000000000000000000000000000000000000000000002',
        amountSats: 100
    }
  },
  {
    name: 'Reaction',
    type: NOTE_TYPES.VIDEO_REACTION,
    builder: buildReactionEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        pointerValue: '0000000000000000000000000000000000000000000000000000000000000002',
        content: '+'
    }
  },
  {
    name: 'Comment',
    type: NOTE_TYPES.VIDEO_COMMENT,
    builder: buildCommentEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        videoEventId: '0000000000000000000000000000000000000000000000000000000000000002',
        content: 'Nice video'
    }
  },
  {
    name: 'Watch History',
    type: NOTE_TYPES.WATCH_HISTORY,
    builder: buildWatchHistoryEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        monthIdentifier: 'watch-history:2025-01',
        content: { version: 2, month: '2025-01', items: [] }
    }
  },
  {
    name: 'Subscription List',
    type: NOTE_TYPES.SUBSCRIPTION_LIST,
    builder: buildSubscriptionListEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        content: 'encrypted-payload'
    }
  },
  {
    name: 'Block List',
    type: NOTE_TYPES.USER_BLOCK_LIST,
    builder: buildBlockListEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        content: 'encrypted-payload'
    }
  },
  {
    name: 'Hashtag Preferences',
    type: NOTE_TYPES.HASHTAG_PREFERENCES,
    builder: buildHashtagPreferenceEvent,
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        content: JSON.stringify({ version: 1, interests: [], disinterests: [] })
    }
  },
  {
    name: 'Admin List (Moderation)',
    type: NOTE_TYPES.ADMIN_MODERATION_LIST,
    builder: (params) => buildAdminListEvent(ADMIN_LIST_IDENTIFIERS.moderation, params),
    params: {
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        created_at: 1234567890,
        hexPubkeys: []
    }
  },
  {
      name: 'NIP-71 Video',
      type: NOTE_TYPES.NIP71_VIDEO,
      builder: buildNip71VideoEvent,
      params: {
          pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
          title: 'Test NIP-71',
          metadata: { kind: 21, title: 'Test NIP-71' },
          pointerIdentifiers: { videoRootId: 'test-root' }
      }
  }
];

let failed = false;

for (const testCase of testCases) {
    try {
        const event = testCase.builder(testCase.params);
        if (!event) {
             console.error(`[FAIL] ${testCase.name}: Builder returned null`);
             failed = true;
             continue;
        }
        const { valid, errors } = validateEventStructure(testCase.type, event);
        if (!valid) {
            console.error(`[FAIL] ${testCase.name}:`);
            errors.forEach(err => console.error(`  - ${err}`));
            failed = true;
        } else {
            console.log(`[PASS] ${testCase.name}`);
        }
    } catch (err) {
        console.error(`[FAIL] ${testCase.name} threw error:`, err);
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}
