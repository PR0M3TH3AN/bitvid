
import {
  buildVideoPostEvent,
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
  buildHttpAuthEvent,
  buildReportEvent,
  validateEventStructure,
  NOTE_TYPES
} from "../../js/nostrEventSchemas.js";

const TEST_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_EVENT_ID = "1111111111111111111111111111111111111111111111111111111111111111";
const TEST_TIMESTAMP = 1700000000;

const testCases = [
  {
    name: "Video Post",
    builder: buildVideoPostEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      dTagValue: "test-video-d-tag",
      content: {
        version: 3,
        title: "Test Video",
        url: "https://example.com/video.mp4",
        magnet: "magnet:?xt=urn:btih:example",
        thumbnail: "https://example.com/thumb.jpg",
        description: "A test video",
        mode: "live",
        videoRootId: "root-id-123",
        deleted: false,
        isPrivate: false,
        isNsfw: false,
        isForKids: true,
        enableComments: true,
        ws: "https://webseed.example.com",
        xs: "http://xseed.example.com"
      }
    },
    type: NOTE_TYPES.VIDEO_POST
  },
  {
    name: "Video Mirror",
    builder: buildVideoMirrorEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      tags: [["url", "https://example.com"], ["m", "video/mp4"]],
      content: "Mirroring video..."
    },
    type: NOTE_TYPES.VIDEO_MIRROR
  },
  {
    name: "Repost",
    builder: buildRepostEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      eventId: TEST_EVENT_ID,
      eventRelay: "wss://relay.example.com",
      authorPubkey: TEST_PUBKEY,
      targetEvent: { id: TEST_EVENT_ID, kind: 1, content: "test" }
    },
    type: NOTE_TYPES.REPOST
  },
  {
    name: "Share",
    builder: buildShareEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: "Check this out!",
      video: { id: TEST_EVENT_ID, pubkey: TEST_PUBKEY },
      relays: ["wss://relay.example.com"]
    },
    type: NOTE_TYPES.SHARE
  },
  {
    name: "Relay List",
    builder: buildRelayListEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      relays: [
        { url: "wss://read.example.com", mode: "read" },
        { url: "wss://write.example.com", mode: "write" }
      ]
    },
    type: NOTE_TYPES.RELAY_LIST
  },
  {
    name: "DM Relay List",
    builder: buildDmRelayListEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      relays: ["wss://dm.example.com"]
    },
    type: NOTE_TYPES.DM_RELAY_LIST
  },
  {
    name: "Profile Metadata",
    builder: buildProfileMetadataEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      metadata: {
        name: "Alice",
        about: "Hello world",
        picture: "https://example.com/pic.jpg"
      }
    },
    type: NOTE_TYPES.PROFILE_METADATA
  },
  {
    name: "Mute List",
    builder: buildMuteListEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      pTags: [TEST_PUBKEY]
    },
    type: NOTE_TYPES.MUTE_LIST
  },
  {
    name: "Deletion",
    builder: buildDeletionEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      eventIds: [TEST_EVENT_ID],
      reason: "Mistake"
    },
    type: NOTE_TYPES.DELETION
  },
  {
    name: "Legacy Direct Message",
    builder: buildLegacyDirectMessageEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      ciphertext: "secretstuff"
    },
    type: NOTE_TYPES.LEGACY_DM
  },
  {
    name: "DM Attachment",
    builder: buildDmAttachmentEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      attachment: {
        x: "hashhash",
        url: "https://example.com/file",
        name: "file.txt",
        type: "text/plain",
        size: 100
      }
    },
    type: NOTE_TYPES.DM_ATTACHMENT
  },
  {
    name: "DM Read Receipt",
    builder: buildDmReadReceiptEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      eventId: TEST_EVENT_ID
    },
    type: NOTE_TYPES.DM_READ_RECEIPT
  },
  {
    name: "DM Typing Indicator",
    builder: buildDmTypingIndicatorEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      eventId: TEST_EVENT_ID,
      expiresAt: TEST_TIMESTAMP + 60
    },
    type: NOTE_TYPES.DM_TYPING
  },
  {
    name: "View Event",
    builder: buildViewEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      pointerValue: TEST_EVENT_ID,
      dedupeTag: "dedupe-123"
    },
    type: NOTE_TYPES.VIEW_EVENT
  },
  {
    name: "Zap Request",
    builder: buildZapRequestEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      recipientPubkey: TEST_PUBKEY,
      relays: ["wss://relay.example.com"],
      amountSats: 100,
      lnurl: "lnurl1...",
      eventId: TEST_EVENT_ID
    },
    type: NOTE_TYPES.ZAP_REQUEST
  },
  {
    name: "Reaction",
    builder: buildReactionEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      pointerValue: TEST_EVENT_ID,
      targetPointer: { type: "e", value: TEST_EVENT_ID, relay: "wss://relay.example.com" },
      content: "+"
    },
    type: NOTE_TYPES.VIDEO_REACTION
  },
  {
    name: "Comment",
    builder: buildCommentEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      videoEventId: TEST_EVENT_ID,
      content: "Nice video!"
    },
    type: NOTE_TYPES.VIDEO_COMMENT
  },
  {
    name: "Watch History",
    builder: buildWatchHistoryEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      monthIdentifier: "2023-11",
      content: { version: 2, month: "2023-11", items: [] }
    },
    type: NOTE_TYPES.WATCH_HISTORY
  },
  {
    name: "Subscription List",
    builder: buildSubscriptionListEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: "ciphertext",
      encryption: "nip04"
    },
    type: NOTE_TYPES.SUBSCRIPTION_LIST
  },
  {
    name: "Block List",
    builder: buildBlockListEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: "ciphertext",
      encryption: "nip04"
    },
    type: NOTE_TYPES.USER_BLOCK_LIST
  },
  {
    name: "Hashtag Preference",
    builder: buildHashtagPreferenceEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      content: "ciphertext"
    },
    type: NOTE_TYPES.HASHTAG_PREFERENCES
  },
  {
    name: "Admin Moderation List",
    builder: (params) => buildAdminListEvent("moderation", params),
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      hexPubkeys: [TEST_PUBKEY]
    },
    type: NOTE_TYPES.ADMIN_MODERATION_LIST
  },
  {
    name: "HTTP Auth",
    builder: buildHttpAuthEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      url: "https://auth.example.com",
      method: "POST",
      payload: "hash"
    },
    type: NOTE_TYPES.HTTP_AUTH
  },
  {
    name: "Report",
    builder: buildReportEvent,
    params: {
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      eventId: TEST_EVENT_ID,
      userId: TEST_PUBKEY,
      reportType: "spam",
      relayHint: "wss://relay.example.com"
    },
    type: NOTE_TYPES.REPORT
  }
];

let hasError = false;

console.log("Running Nostr Event Builder Validation...\n");

for (const testCase of testCases) {
  try {
    const event = testCase.builder(testCase.params);
    const { valid, errors } = validateEventStructure(testCase.type, event);

    if (valid) {
      console.log(`✅ ${testCase.name}`);
    } else {
      console.error(`❌ ${testCase.name} FAILED validation:`);
      errors.forEach(err => console.error(`   - ${err}`));
      console.error("   Produced Event:", JSON.stringify(event, null, 2));
      hasError = true;
    }
  } catch (error) {
    console.error(`❌ ${testCase.name} CRASHED:`, error);
    hasError = true;
  }
}

if (hasError) {
  console.log("\nValidation FAILED.");
  process.exit(1);
} else {
  console.log("\nAll builders produced valid events.");
  process.exit(0);
}
