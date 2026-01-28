
import {
  NOTE_TYPES,
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
} from "../../js/nostrEventSchemas.js";

const PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const CREATED_AT = 1700000000;

const TESTS = [
  {
    name: "Video Post",
    builder: buildVideoPostEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      dTagValue: "test-video-id",
      content: {
        version: 3,
        title: "Test Video",
        videoRootId: "test-video-id",
        infoHash: "0123456789abcdef0123456789abcdef01234567",
      },
    },
    type: NOTE_TYPES.VIDEO_POST,
  },
  {
    name: "Video Post (URL)",
    builder: buildVideoPostEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      dTagValue: "test-video-url",
      content: {
        version: 3,
        title: "Test Video URL",
        videoRootId: "test-video-url",
        url: "https://example.com/video.mp4",
      },
    },
    type: NOTE_TYPES.VIDEO_POST,
  },
  {
    name: "HTTP Auth",
    builder: buildHttpAuthEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      url: "https://example.com/auth",
      method: "GET",
      payload: "hash",
    },
    type: NOTE_TYPES.HTTP_AUTH,
  },
  {
    name: "Report",
    builder: buildReportEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      eventId: "e".repeat(64),
      reportType: "nudity",
    },
    type: NOTE_TYPES.REPORT,
  },
  {
    name: "Video Mirror",
    builder: buildVideoMirrorEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      tags: [["url", "https://example.com/video.mp4"], ["m", "video/mp4"]],
      content: "Mirroring video",
    },
    type: NOTE_TYPES.VIDEO_MIRROR,
  },
  {
    name: "Repost",
    builder: buildRepostEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      eventId: "e".repeat(64),
      eventRelay: "wss://relay.example.com",
    },
    type: NOTE_TYPES.REPOST,
  },
  {
    name: "Generic Repost (Video)",
    builder: buildRepostEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      targetKind: 30078,
      eventId: "e".repeat(64),
    },
    type: NOTE_TYPES.GENERIC_REPOST,
  },
  {
    name: "Share",
    builder: buildShareEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      video: { id: "e".repeat(64), pubkey: PUBKEY },
      relays: ["wss://relay.example.com"],
      content: "Check this out",
    },
    type: NOTE_TYPES.SHARE,
  },
  {
    name: "Relay List",
    builder: buildRelayListEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      relays: [{ url: "wss://relay.example.com", read: true, write: true }],
    },
    type: NOTE_TYPES.RELAY_LIST,
  },
  {
    name: "DM Relay List",
    builder: buildDmRelayListEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      relays: ["wss://relay.example.com"],
    },
    type: NOTE_TYPES.DM_RELAY_LIST,
  },
  {
    name: "Profile Metadata",
    builder: buildProfileMetadataEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      metadata: { name: "Test User", about: "Testing" },
    },
    type: NOTE_TYPES.PROFILE_METADATA,
  },
  {
    name: "Mute List",
    builder: buildMuteListEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      pTags: [PUBKEY],
    },
    type: NOTE_TYPES.MUTE_LIST,
  },
  {
    name: "Deletion",
    builder: buildDeletionEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      eventIds: ["e".repeat(64)],
      reason: "mistake",
    },
    type: NOTE_TYPES.DELETION,
  },
  {
    name: "Legacy DM",
    builder: buildLegacyDirectMessageEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      ciphertext: "encrypted",
    },
    type: NOTE_TYPES.LEGACY_DM,
  },
  {
    name: "DM Attachment",
    builder: buildDmAttachmentEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      attachment: { url: "https://example.com/file", x: "hash", type: "image/jpeg" },
    },
    type: NOTE_TYPES.DM_ATTACHMENT,
  },
  {
    name: "DM Read Receipt",
    builder: buildDmReadReceiptEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      eventId: "e".repeat(64),
    },
    type: NOTE_TYPES.DM_READ_RECEIPT,
  },
  {
    name: "DM Typing Indicator",
    builder: buildDmTypingIndicatorEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      expiresAt: CREATED_AT + 60,
    },
    type: NOTE_TYPES.DM_TYPING,
  },
  {
    name: "View Event",
    builder: buildViewEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      pointerValue: "e".repeat(64),
      pointerTag: ["e", "e".repeat(64)],
    },
    type: NOTE_TYPES.VIEW_EVENT,
  },
  {
    name: "Zap Request",
    builder: buildZapRequestEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      amountSats: 100,
      relays: ["wss://relay.example.com"],
    },
    type: NOTE_TYPES.ZAP_REQUEST,
  },
  {
    name: "Video Reaction",
    builder: buildReactionEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      pointerValue: "e".repeat(64),
      targetPointer: { type: "e", value: "e".repeat(64) },
      content: "+",
    },
    type: NOTE_TYPES.VIDEO_REACTION,
  },
  {
    name: "Video Comment",
    builder: buildCommentEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      videoEventId: "e".repeat(64),
      content: "Nice video",
    },
    type: NOTE_TYPES.VIDEO_COMMENT,
  },
  {
    name: "Watch History",
    builder: buildWatchHistoryEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      monthIdentifier: "2023-01",
      content: { version: 2, month: "2023-01", items: [] },
    },
    type: NOTE_TYPES.WATCH_HISTORY,
  },
  {
    name: "Subscription List",
    builder: buildSubscriptionListEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      content: "encrypted-json",
      encryption: "nip44_v2",
    },
    type: NOTE_TYPES.SUBSCRIPTION_LIST,
  },
  {
    name: "Block List",
    builder: buildBlockListEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      content: "encrypted-json",
      encryption: "nip44_v2",
    },
    type: NOTE_TYPES.USER_BLOCK_LIST,
  },
  {
    name: "Hashtag Preferences",
    builder: buildHashtagPreferenceEvent,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      content: "encrypted-json",
    },
    type: NOTE_TYPES.HASHTAG_PREFERENCES,
  },
  {
    name: "Admin Moderation List",
    builder: buildAdminListEvent,
    // buildAdminListEvent takes (listKey, params)
    args: ["moderation", {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      hexPubkeys: [PUBKEY],
    }],
    type: NOTE_TYPES.ADMIN_MODERATION_LIST,
  },
  {
    name: "Admin Blacklist",
    builder: buildAdminListEvent,
    args: ["blacklist", {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      hexPubkeys: [PUBKEY],
    }],
    type: NOTE_TYPES.ADMIN_BLACKLIST,
  },
  {
    name: "Admin Whitelist",
    builder: buildAdminListEvent,
    args: ["whitelist", {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      hexPubkeys: [PUBKEY],
    }],
    type: NOTE_TYPES.ADMIN_WHITELIST,
  },
];

async function run() {
  console.log("Running Event Schema Validation...");
  let failureCount = 0;

  for (const test of TESTS) {
    try {
      let event;
      if (test.args) {
        event = test.builder(...test.args);
      } else {
        event = test.builder(test.params);
      }

      const { valid, errors } = validateEventStructure(test.type, event);

      if (valid) {
        console.log(`[PASS] ${test.name}`);
      } else {
        console.error(`[FAIL] ${test.name}`);
        errors.forEach((err) => console.error(`  - ${err}`));
        failureCount++;
      }
    } catch (e) {
      console.error(`[ERROR] ${test.name} threw an exception:`, e);
      failureCount++;
    }
  }

  if (failureCount > 0) {
    console.error(`\nValidation failed with ${failureCount} errors.`);
    process.exit(1);
  } else {
    console.log("\nAll events validated successfully.");
    process.exit(0);
  }
}

run();
