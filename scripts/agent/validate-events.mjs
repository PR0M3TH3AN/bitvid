
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
  getNostrEventSchema,
  NOTE_TYPES,
} from "../../js/nostrEventSchemas.js";

const VALIDATION_FAILURES = [];

function assertEventValid(label, event, type) {
  if (!event) {
    console.error(`❌ [${label}] Builder returned null or undefined`);
    VALIDATION_FAILURES.push({ label, error: "Builder returned null/undefined" });
    return;
  }

  const { valid, errors } = validateEventStructure(type, event);
  if (!valid) {
    console.error(`❌ [${label}] Validation failed for type ${type}:`);
    errors.forEach((err) => console.error(`   - ${err}`));
    VALIDATION_FAILURES.push({ label, errors });
  } else {
    console.log(`✅ [${label}] Valid`);
  }
}

async function runValidation() {
  console.log("Starting Event Builder Validation...\n");

  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  const created_at = Math.floor(Date.now() / 1000);

  // 1. Video Post
  assertEventValid(
    "Video Post",
    buildVideoPostEvent({
      pubkey,
      created_at,
      dTagValue: "test-d-tag",
      content: {
        version: 3,
        title: "Test Video",
        videoRootId: "root-id",
        url: "https://example.com/video.mp4",
        magnet: "magnet:?xt=urn:btih:...",
        thumbnail: "https://example.com/thumb.jpg",
        description: "Test description",
        mode: "live",
        deleted: false,
        isPrivate: false,
        isNsfw: false,
        isForKids: false,
        enableComments: true,
      },
      additionalTags: [["t", "extra"]],
    }),
    NOTE_TYPES.VIDEO_POST
  );

  // 2. Video Mirror
  assertEventValid(
    "Video Mirror",
    buildVideoMirrorEvent({
      pubkey,
      created_at,
      tags: [["e", "event-id"], ["p", pubkey]],
      content: { some: "metadata" },
    }),
    NOTE_TYPES.VIDEO_MIRROR
  );

  // 3. Repost
  assertEventValid(
    "Repost",
    buildRepostEvent({
      pubkey,
      created_at,
      eventId: "original-event-id",
      eventRelay: "wss://relay.example.com",
      authorPubkey: pubkey,
    }),
    NOTE_TYPES.REPOST
  );

  // 4. Share
  assertEventValid(
    "Share",
    buildShareEvent({
      pubkey,
      created_at,
      content: "Check this out!",
      video: { id: "video-id", pubkey: "author-pubkey" },
      relays: ["wss://relay.example.com"],
    }),
    NOTE_TYPES.SHARE
  );

  // 5. Relay List
  assertEventValid(
    "Relay List",
    buildRelayListEvent({
      pubkey,
      created_at,
      relays: [
        { url: "wss://relay1.com", mode: "read" },
        { url: "wss://relay2.com", mode: "write" },
      ],
    }),
    NOTE_TYPES.RELAY_LIST
  );

  // 6. DM Relay List
  assertEventValid(
    "DM Relay List",
    buildDmRelayListEvent({
      pubkey,
      created_at,
      relays: ["wss://relay1.com", "wss://relay2.com"],
    }),
    NOTE_TYPES.DM_RELAY_LIST
  );

  // 7. Profile Metadata
  assertEventValid(
    "Profile Metadata",
    buildProfileMetadataEvent({
      pubkey,
      created_at,
      metadata: { name: "Test User", about: "Testing" },
    }),
    NOTE_TYPES.PROFILE_METADATA
  );

  // 8. Mute List
  assertEventValid(
    "Mute List",
    buildMuteListEvent({
      pubkey,
      created_at,
      pTags: ["mute-pubkey-1", "mute-pubkey-2"],
    }),
    NOTE_TYPES.MUTE_LIST
  );

  // 9. Deletion
  assertEventValid(
    "Deletion",
    buildDeletionEvent({
      pubkey,
      created_at,
      eventIds: ["event-id-1"],
      reason: "Mistake",
    }),
    NOTE_TYPES.DELETION
  );

  // 10. Legacy DM
  assertEventValid(
    "Legacy DM",
    buildLegacyDirectMessageEvent({
      pubkey,
      created_at,
      recipientPubkey: "recipient-pubkey",
      ciphertext: "encrypted-content",
    }),
    NOTE_TYPES.LEGACY_DM
  );

  // 11. DM Attachment
  assertEventValid(
    "DM Attachment",
    buildDmAttachmentEvent({
      pubkey,
      created_at,
      recipientPubkey: "recipient-pubkey",
      attachment: { url: "https://example.com/file.jpg", type: "image/jpeg" },
    }),
    NOTE_TYPES.DM_ATTACHMENT
  );

  // 12. DM Read Receipt
  assertEventValid(
    "DM Read Receipt",
    buildDmReadReceiptEvent({
      pubkey,
      created_at,
      recipientPubkey: "recipient-pubkey",
      eventId: "event-id",
      messageKind: 4,
    }),
    NOTE_TYPES.DM_READ_RECEIPT
  );

  // 13. DM Typing Indicator
  assertEventValid(
    "DM Typing Indicator",
    buildDmTypingIndicatorEvent({
      pubkey,
      created_at,
      recipientPubkey: "recipient-pubkey",
      eventId: "event-id",
    }),
    NOTE_TYPES.DM_TYPING
  );

  // 14. View Event
  assertEventValid(
    "View Event",
    buildViewEvent({
      pubkey,
      created_at,
      pointerTag: ["a", "kind:pubkey:dtag"],
    }),
    NOTE_TYPES.VIEW_EVENT
  );

  // 15. Zap Request
  assertEventValid(
    "Zap Request",
    buildZapRequestEvent({
      pubkey,
      created_at,
      recipientPubkey: "recipient-pubkey",
      amountSats: 100,
      relays: ["wss://relay.com"],
    }),
    NOTE_TYPES.ZAP_REQUEST
  );

  // 16. Reaction
  assertEventValid(
    "Reaction",
    buildReactionEvent({
      pubkey,
      created_at,
      pointerTag: ["e", "event-id"],
      content: "+",
    }),
    NOTE_TYPES.VIDEO_REACTION
  );

  // 17. Comment
  assertEventValid(
    "Comment",
    buildCommentEvent({
      pubkey,
      created_at,
      videoEventId: "video-event-id",
      content: "Nice video!",
    }),
    NOTE_TYPES.VIDEO_COMMENT
  );

  // 18. Watch History
  assertEventValid(
    "Watch History",
    buildWatchHistoryEvent({
      pubkey,
      created_at,
      monthIdentifier: "2023-10",
      content: { "video-id": 1234567890 },
    }),
    NOTE_TYPES.WATCH_HISTORY
  );

  // 19. Subscription List
  assertEventValid(
    "Subscription List",
    buildSubscriptionListEvent({
      pubkey,
      created_at,
      content: [["p", "pubkey"]],
    }),
    NOTE_TYPES.SUBSCRIPTION_LIST
  );

  // 20. Block List
  assertEventValid(
    "Block List",
    buildBlockListEvent({
      pubkey,
      created_at,
      content: [["p", "blocked-pubkey"]],
    }),
    NOTE_TYPES.USER_BLOCK_LIST
  );

  // 21. Hashtag Preference
  assertEventValid(
    "Hashtag Preference",
    buildHashtagPreferenceEvent({
      pubkey,
      created_at,
      content: { interests: ["nostr"], disinterests: ["crypto"] },
    }),
    NOTE_TYPES.HASHTAG_PREFERENCES
  );

  // 22. Admin List (Moderation)
  assertEventValid(
    "Admin Moderation List",
    buildAdminListEvent("moderation", {
      pubkey,
      created_at,
      hexPubkeys: ["mod-pubkey"],
    }),
    NOTE_TYPES.ADMIN_MODERATION_LIST
  );

  // 23. HTTP Auth
  assertEventValid(
    "HTTP Auth",
    buildHttpAuthEvent({
      pubkey,
      created_at,
      url: "https://example.com/auth",
      method: "GET",
    }),
    NOTE_TYPES.HTTP_AUTH
  );

  // 24. Report
  assertEventValid(
    "Report",
    buildReportEvent({
      pubkey,
      created_at,
      eventId: "reported-event-id",
      reportType: "spam",
    }),
    NOTE_TYPES.REPORT
  );


  if (VALIDATION_FAILURES.length > 0) {
    console.error("\n❌ Validation Validation Failed!");
    console.error(JSON.stringify(VALIDATION_FAILURES, null, 2));
    process.exit(1);
  } else {
    console.log("\n✅ All validations passed!");
  }
}

runValidation().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
