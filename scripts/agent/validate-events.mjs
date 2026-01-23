import { strict as assert } from 'node:assert';

// Hook console.warn to capture validation warnings
const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => {
  // Capture only [schema] or [nostrEventSchemas] warnings
  const msg = args.join(' ');
  if (msg.includes('[schema]') || msg.includes('[nostrEventSchemas]')) {
    warnings.push(msg);
  }
  // We can still print to stdout if needed, but for validation we want to capture
  // originalWarn.apply(console, args);
};

// Import schemas AFTER hooking console
const schemas = await import('../../js/nostrEventSchemas.js');
const {
  validateEventAgainstSchema,
  NOTE_TYPES,
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
  buildAdminListEvent
} = schemas;

console.log("Running Event Schema Validator...");

const failures = [];

function check(name, builder, params, expectedType) {
  warnings.length = 0; // Clear warnings
  try {
    const event = builder(params);
    validateEventAgainstSchema(expectedType || event.kind, event); // Pass type if known, else relies on implementation or event.kind mapping

    // Some builders might not set the type explicitly in validate calls if we don't instrument them yet.
    // So we manually call validateEventAgainstSchema with the expected NOTE_TYPE.
    if (expectedType) {
        validateEventAgainstSchema(expectedType, event);
    }

    if (warnings.length > 0) {
      failures.push({ name, error: `Generated warnings: ${JSON.stringify(warnings)}` });
    }

    // specific checks can go here
    if (!event.created_at) failures.push({ name, error: "Missing created_at" });
    if (!event.pubkey) failures.push({ name, error: "Missing pubkey" });

  } catch (e) {
    failures.push({ name, error: `Threw exception: ${e.message}` });
  }
}

const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
const created_at = Math.floor(Date.now() / 1000);

// Test cases
check("buildVideoPostEvent", buildVideoPostEvent, {
  pubkey,
  created_at,
  dTagValue: "video-123",
  content: {
    version: 3,
    title: "Test Video",
    videoRootId: "root-123",
    url: "https://example.com/video.mp4"
  }
}, NOTE_TYPES.VIDEO_POST);

check("buildVideoMirrorEvent", buildVideoMirrorEvent, {
  pubkey,
  created_at,
  tags: [["t", "test"]],
  content: "Mirror description"
}, NOTE_TYPES.VIDEO_MIRROR);

check("buildRepostEvent", buildRepostEvent, {
  pubkey,
  created_at,
  eventId: "1111111111111111111111111111111111111111111111111111111111111111",
  eventRelay: "wss://relay.example.com",
  serializedEvent: JSON.stringify({ id: "111", kind: 1 })
}, NOTE_TYPES.REPOST);

check("buildShareEvent", buildShareEvent, {
  pubkey,
  created_at,
  content: "Check this out",
  video: { id: "2222222222222222222222222222222222222222222222222222222222222222" }
}, NOTE_TYPES.SHARE);

check("buildRelayListEvent", buildRelayListEvent, {
  pubkey,
  created_at,
  relays: ["wss://relay.example.com", { url: "wss://read.example.com", mode: "read" }]
}, NOTE_TYPES.RELAY_LIST);

check("buildDmRelayListEvent", buildDmRelayListEvent, {
  pubkey,
  created_at,
  relays: ["wss://dm.example.com"]
}, NOTE_TYPES.DM_RELAY_LIST);

check("buildProfileMetadataEvent", buildProfileMetadataEvent, {
  pubkey,
  created_at,
  metadata: { name: "Test User", about: "Testing" }
}, NOTE_TYPES.PROFILE_METADATA);

check("buildMuteListEvent", buildMuteListEvent, {
  pubkey,
  created_at,
  pTags: ["3333333333333333333333333333333333333333333333333333333333333333"]
}, NOTE_TYPES.MUTE_LIST);

check("buildDeletionEvent", buildDeletionEvent, {
  pubkey,
  created_at,
  eventIds: ["4444444444444444444444444444444444444444444444444444444444444444"],
  reason: "Mistake"
}, NOTE_TYPES.DELETION);

check("buildLegacyDirectMessageEvent", buildLegacyDirectMessageEvent, {
  pubkey,
  created_at,
  recipientPubkey: "5555555555555555555555555555555555555555555555555555555555555555",
  ciphertext: "encryped_content"
}, NOTE_TYPES.LEGACY_DM);

check("buildDmAttachmentEvent", buildDmAttachmentEvent, {
  pubkey,
  created_at,
  recipientPubkey: "6666666666666666666666666666666666666666666666666666666666666666",
  attachment: { url: "https://example.com/file.jpg", x: "hash" }
}, NOTE_TYPES.DM_ATTACHMENT);

check("buildDmReadReceiptEvent", buildDmReadReceiptEvent, {
  pubkey,
  created_at,
  recipientPubkey: "7777777777777777777777777777777777777777777777777777777777777777",
  eventId: "8888888888888888888888888888888888888888888888888888888888888888"
}, NOTE_TYPES.DM_READ_RECEIPT);

check("buildDmTypingIndicatorEvent", buildDmTypingIndicatorEvent, {
  pubkey,
  created_at,
  recipientPubkey: "9999999999999999999999999999999999999999999999999999999999999999"
}, NOTE_TYPES.DM_TYPING);

check("buildViewEvent", buildViewEvent, {
  pubkey,
  created_at,
  pointerValue: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  pointerTag: ["e", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  dedupeTag: "session-123"
}, NOTE_TYPES.VIEW_EVENT);

check("buildZapRequestEvent", buildZapRequestEvent, {
  pubkey,
  created_at,
  recipientPubkey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  amountSats: 100,
  relays: ["wss://zap.relay.com"]
}, NOTE_TYPES.ZAP_REQUEST);

check("buildReactionEvent", buildReactionEvent, {
  pubkey,
  created_at,
  pointerTag: ["e", "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
  content: "+"
}, NOTE_TYPES.VIDEO_REACTION);

check("buildCommentEvent", buildCommentEvent, {
  pubkey,
  created_at,
  videoEventId: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  content: "Nice video!"
}, NOTE_TYPES.VIDEO_COMMENT);

check("buildWatchHistoryEvent", buildWatchHistoryEvent, {
  pubkey,
  created_at,
  monthIdentifier: "2023-10",
  content: JSON.stringify({ version: 2, month: "2023-10", items: [] })
}, NOTE_TYPES.WATCH_HISTORY);

check("buildSubscriptionListEvent", buildSubscriptionListEvent, {
  pubkey,
  created_at,
  content: "encrypted_subs"
}, NOTE_TYPES.SUBSCRIPTION_LIST);

check("buildBlockListEvent", buildBlockListEvent, {
  pubkey,
  created_at,
  content: "encrypted_blocks"
}, NOTE_TYPES.USER_BLOCK_LIST);

check("buildHashtagPreferenceEvent", buildHashtagPreferenceEvent, {
  pubkey,
  created_at,
  content: "encrypted_prefs"
}, NOTE_TYPES.HASHTAG_PREFERENCES);

check("buildAdminListEvent (moderation)", (p) => buildAdminListEvent("moderation", p), {
  pubkey,
  created_at,
  hexPubkeys: ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]
}, NOTE_TYPES.ADMIN_MODERATION_LIST);

if (failures.length > 0) {
  console.error("\n❌ Validation Failed:");
  failures.forEach(f => {
    console.error(`- ${f.name}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log("\n✅ All events validated successfully.");
  process.exit(0);
}
