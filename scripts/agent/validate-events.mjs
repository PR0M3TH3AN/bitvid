import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocket } from 'ws';

// Polyfills
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = crypto;
}
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// Helper to load module
const loadModule = async (filePath) => {
  return import(path.resolve(process.cwd(), filePath));
};

async function main() {
  const schemasModule = await loadModule('js/nostrEventSchemas.js');
  const {
    validateEventStructure,
    NOTE_TYPES,
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
  } = schemasModule;

  console.log("Starting Event Schema Validation...");

  let failureCount = 0;

  const validate = (type, builder, params, label) => {
    try {
        const event = builder(params);
        const { valid, errors } = validateEventStructure(type, event);
        if (!valid) {
            console.error(`[FAIL] ${label} (${type})`);
            errors.forEach(err => console.error(`  - ${err}`));
            console.error(`  Event:`, JSON.stringify(event, null, 2));
            failureCount++;
        } else {
            console.log(`[PASS] ${label} (${type})`);
        }
    } catch (e) {
        console.error(`[ERROR] Exception in builder for ${label} (${type})`);
        console.error(e);
        failureCount++;
    }
  };

  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  const created_at = Math.floor(Date.now() / 1000);

  // Test Cases
  validate(NOTE_TYPES.VIDEO_POST, buildVideoPostEvent, {
    pubkey,
    created_at,
    dTagValue: "test-video-id",
    content: {
        version: 3,
        title: "Test Video",
        videoRootId: "root-id",
    }
  }, "Basic Video Post");

  validate(NOTE_TYPES.HTTP_AUTH, buildHttpAuthEvent, {
      pubkey,
      created_at,
      url: "https://example.com/login",
      method: "POST"
  }, "HTTP Auth");

  validate(NOTE_TYPES.REPORT, buildReportEvent, {
      pubkey,
      created_at,
      eventId: "e".repeat(64),
      reportType: "spam"
  }, "Report");

  validate(NOTE_TYPES.VIDEO_MIRROR, buildVideoMirrorEvent, {
      pubkey,
      created_at,
      content: "mirror content"
  }, "Video Mirror");

  validate(NOTE_TYPES.REPOST, buildRepostEvent, {
      pubkey,
      created_at,
      eventId: "e".repeat(64),
      targetKind: 1 // Text Note Repost (Kind 6)
  }, "Repost");

  validate(NOTE_TYPES.GENERIC_REPOST, buildRepostEvent, {
      pubkey,
      created_at,
      eventId: "e".repeat(64),
      targetKind: 30078 // Video Post Repost (Kind 16)
  }, "Generic Repost");

  validate(NOTE_TYPES.SHARE, buildShareEvent, {
      pubkey,
      created_at,
      content: "Check this out",
      video: { id: "e".repeat(64), pubkey: "p".repeat(64) }
  }, "Share");

  validate(NOTE_TYPES.RELAY_LIST, buildRelayListEvent, {
      pubkey,
      created_at,
      relays: ["wss://relay.example.com"]
  }, "Relay List");

  validate(NOTE_TYPES.DM_RELAY_LIST, buildDmRelayListEvent, {
      pubkey,
      created_at,
      relays: ["wss://dm.example.com"]
  }, "DM Relay List");

  validate(NOTE_TYPES.PROFILE_METADATA, buildProfileMetadataEvent, {
      pubkey,
      created_at,
      metadata: { name: "Test User" }
  }, "Profile Metadata");

  validate(NOTE_TYPES.MUTE_LIST, buildMuteListEvent, {
      pubkey,
      created_at,
      pTags: ["p".repeat(64)]
  }, "Mute List");

  validate(NOTE_TYPES.DELETION, buildDeletionEvent, {
      pubkey,
      created_at,
      eventIds: ["e".repeat(64)]
  }, "Deletion");

  validate(NOTE_TYPES.LEGACY_DM, buildLegacyDirectMessageEvent, {
      pubkey,
      created_at,
      recipientPubkey: "p".repeat(64),
      ciphertext: "encrypted"
  }, "Legacy DM");

  validate(NOTE_TYPES.DM_ATTACHMENT, buildDmAttachmentEvent, {
      pubkey,
      created_at,
      recipientPubkey: "p".repeat(64),
      attachment: { url: "https://example.com/file.jpg", x: "hash" }
  }, "DM Attachment");

  validate(NOTE_TYPES.DM_READ_RECEIPT, buildDmReadReceiptEvent, {
      pubkey,
      created_at,
      recipientPubkey: "p".repeat(64),
      eventId: "e".repeat(64)
  }, "DM Read Receipt");

  validate(NOTE_TYPES.DM_TYPING, buildDmTypingIndicatorEvent, {
      pubkey,
      created_at,
      recipientPubkey: "p".repeat(64)
  }, "DM Typing Indicator");

  validate(NOTE_TYPES.VIEW_EVENT, buildViewEvent, {
      pubkey,
      created_at,
      pointerTag: ["e", "eventid", "relay"]
  }, "View Event");

  validate(NOTE_TYPES.ZAP_REQUEST, buildZapRequestEvent, {
      pubkey,
      created_at,
      recipientPubkey: "p".repeat(64),
      amountSats: 100,
      lnurl: "lnurl1...",
      relays: ["wss://relay.damus.io"]
  }, "Zap Request");

  validate(NOTE_TYPES.VIDEO_REACTION, buildReactionEvent, {
      pubkey,
      created_at,
      content: "+",
      targetPointer: { type: "e", value: "e".repeat(64) }
  }, "Reaction");

  validate(NOTE_TYPES.VIDEO_COMMENT, buildCommentEvent, {
      pubkey,
      created_at,
      content: "Great video!",
      videoEventId: "e".repeat(64)
  }, "Comment");

  validate(NOTE_TYPES.WATCH_HISTORY, buildWatchHistoryEvent, {
      pubkey,
      created_at,
      content: {},
      monthIdentifier: "2023-10" // Required for valid event
  }, "Watch History");

  validate(NOTE_TYPES.SUBSCRIPTION_LIST, buildSubscriptionListEvent, {
      pubkey,
      created_at,
      content: "encrypted_subs"
  }, "Subscription List");

  validate(NOTE_TYPES.USER_BLOCK_LIST, buildBlockListEvent, {
      pubkey,
      created_at,
      content: "encrypted_blocks"
  }, "Block List");

  validate(NOTE_TYPES.HASHTAG_PREFERENCES, buildHashtagPreferenceEvent, {
      pubkey,
      created_at,
      content: "encrypted_prefs"
  }, "Hashtag Preferences");

  // Admin Lists
  const adminBuilder = (params) => buildAdminListEvent("moderation", params);
  validate(NOTE_TYPES.ADMIN_MODERATION_LIST, adminBuilder, {
      pubkey,
      created_at,
      hexPubkeys: ["p".repeat(64)]
  }, "Admin Moderation List");


  if (failureCount > 0) {
      console.log(`\nValidation complete with ${failureCount} failures.`);
      process.exit(1);
  } else {
      console.log("\nAll checks passed!");
      process.exit(0);
  }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
