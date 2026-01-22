
import {
  getNostrEventSchema,
  NOTE_TYPES,
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
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

const COLORS = {
  RESET: "\x1b[0m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
};

let errorCount = 0;
let successCount = 0;

function logError(msg) {
  console.error(`${COLORS.RED}[FAIL] ${msg}${COLORS.RESET}`);
  errorCount++;
}

function logSuccess(msg) {
  console.log(`${COLORS.GREEN}[PASS] ${msg}${COLORS.RESET}`);
  successCount++;
}

function logInfo(msg) {
  console.log(`${COLORS.BLUE}[INFO] ${msg}${COLORS.RESET}`);
}

function hasTag(tags, tagName, tagValue = null) {
  if (!Array.isArray(tags)) return false;
  return tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === tagName &&
      (tagValue === null || tag[1] === tagValue)
  );
}

function validateEvent(type, event, description) {
  const schema = getNostrEventSchema(type);
  if (!schema) {
    logError(`${description}: No schema found for type ${type}`);
    return;
  }

  let valid = true;
  const errors = [];

  // Validate Kind
  if (event.kind !== schema.kind) {
    errors.push(`Kind mismatch: expected ${schema.kind}, got ${event.kind}`);
    valid = false;
  }

  // Validate Topic Tag
  if (schema.topicTag) {
    if (!hasTag(event.tags, schema.topicTag.name, schema.topicTag.value)) {
      errors.push(`Missing topic tag: ${schema.topicTag.name}=${schema.topicTag.value}`);
      valid = false;
    }
  }

  // Validate Identifier Tag
  if (schema.identifierTag) {
    const expectedValue = schema.identifierTag.value;
    if (expectedValue) {
        if (!hasTag(event.tags, schema.identifierTag.name, expectedValue)) {
            errors.push(`Missing identifier tag: ${schema.identifierTag.name}=${expectedValue}`);
            valid = false;
        }
    } else {
        // If value is not fixed in schema, just check tag name presence if it's supposed to be there.
        // Usually d-tags are present.
        if (!hasTag(event.tags, schema.identifierTag.name)) {
             errors.push(`Missing identifier tag: ${schema.identifierTag.name}`);
             valid = false;
        }
    }
  }

  // Validate Append Tags
  if (schema.appendTags) {
    schema.appendTags.forEach((appendTag) => {
      if (Array.isArray(appendTag) && appendTag.length >= 2) {
        const tagName = appendTag[0];
        const tagValue = appendTag[1];
        if (!hasTag(event.tags, tagName, tagValue)) {
          errors.push(`Missing append tag: ${tagName}=${tagValue}`);
          valid = false;
        }
      }
    });
  }

  // Validate Content Format
  if (schema.content) {
    if (schema.content.format === "json") {
      try {
        JSON.parse(event.content);
      } catch (e) {
        errors.push(`Content is not valid JSON`);
        valid = false;
      }
    } else if (schema.content.format === "empty") {
      if (event.content !== "") {
        errors.push(`Content should be empty, got: "${event.content}"`);
        valid = false;
      }
    }
  }

  if (valid) {
    logSuccess(`${description}`);
  } else {
    logError(`${description}`);
    errors.forEach(e => console.error(`  - ${e}`));
    console.log("  Event:", JSON.stringify(event, null, 2));
  }
}

async function main() {
  logInfo("Starting Event Validation...");

  // 1. VIDEO_POST
  validateEvent(NOTE_TYPES.VIDEO_POST, buildVideoPostEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    dTagValue: "video-id",
    content: { title: "Test Video", videoRootId: "root-id" }
  }), "buildVideoPostEvent (standard)");

  validateEvent(NOTE_TYPES.VIDEO_POST, buildVideoPostEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    dTagValue: "video-id-minimal",
    content: { version: 1, title: "Minimal", videoRootId: "root" }
  }), "buildVideoPostEvent (minimal)");

  // 2. VIDEO_MIRROR
  validateEvent(NOTE_TYPES.VIDEO_MIRROR, buildVideoMirrorEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    content: "Alt text"
  }), "buildVideoMirrorEvent");

  // 3. REPOST
  validateEvent(NOTE_TYPES.REPOST, buildRepostEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    eventId: "hex-id",
    eventRelay: "wss://relay.example.com",
    targetKind: 1,
    serializedEvent: JSON.stringify({ kind: 1, content: "test" })
  }), "buildRepostEvent (event pointer)");

  // 4. RELAY_LIST
  validateEvent(NOTE_TYPES.RELAY_LIST, buildRelayListEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    relays: ["wss://relay.example.com"]
  }), "buildRelayListEvent");

  // 5. DM_RELAY_LIST
  validateEvent(NOTE_TYPES.DM_RELAY_LIST, buildDmRelayListEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    relays: ["wss://relay.example.com"]
  }), "buildDmRelayListEvent");

  // 6. PROFILE_METADATA
  validateEvent(NOTE_TYPES.PROFILE_METADATA, buildProfileMetadataEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    metadata: { name: "Test User" }
  }), "buildProfileMetadataEvent");

  // 7. MUTE_LIST
  validateEvent(NOTE_TYPES.MUTE_LIST, buildMuteListEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    pTags: ["hex-pubkey"]
  }), "buildMuteListEvent");

  // 8. DELETION
  validateEvent(NOTE_TYPES.DELETION, buildDeletionEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    eventIds: ["hex-id"]
  }), "buildDeletionEvent");

  // 9. LEGACY_DM
  validateEvent(NOTE_TYPES.LEGACY_DM, buildLegacyDirectMessageEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    recipientPubkey: "hex-recipient",
    ciphertext: "encrypted-content"
  }), "buildLegacyDirectMessageEvent");

  // 10. DM_ATTACHMENT
  validateEvent(NOTE_TYPES.DM_ATTACHMENT, buildDmAttachmentEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    recipientPubkey: "hex-recipient",
    attachment: { url: "https://example.com/file", x: "hash" }
  }), "buildDmAttachmentEvent");

  // 11. DM_READ_RECEIPT
  validateEvent(NOTE_TYPES.DM_READ_RECEIPT, buildDmReadReceiptEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    recipientPubkey: "hex-recipient",
    eventId: "hex-event-id"
  }), "buildDmReadReceiptEvent");

  // 12. DM_TYPING
  validateEvent(NOTE_TYPES.DM_TYPING, buildDmTypingIndicatorEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    recipientPubkey: "hex-recipient",
    eventId: "hex-event-id",
    expiresAt: 1234567899
  }), "buildDmTypingIndicatorEvent");

  // 13. VIEW_EVENT
  validateEvent(NOTE_TYPES.VIEW_EVENT, buildViewEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    pointerValue: "video-d-tag",
    dedupeTag: "unique-session-view-id",
    includeSessionTag: true
  }), "buildViewEvent");

  // 14. ZAP_REQUEST
  validateEvent(NOTE_TYPES.ZAP_REQUEST, buildZapRequestEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    recipientPubkey: "hex-recipient",
    amountSats: 100,
    relays: ["wss://relay.example.com"]
  }), "buildZapRequestEvent");

  // 15. VIDEO_REACTION
  validateEvent(NOTE_TYPES.VIDEO_REACTION, buildReactionEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    targetPointer: { type: "e", value: "hex-id" },
    content: "+"
  }), "buildReactionEvent");

  // 16. VIDEO_COMMENT
  validateEvent(NOTE_TYPES.VIDEO_COMMENT, buildCommentEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    content: "This is a comment",
    videoEventId: "hex-video-id"
  }), "buildCommentEvent (root)");

  validateEvent(NOTE_TYPES.VIDEO_COMMENT, buildCommentEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    content: "This is a reply",
    videoEventId: "hex-video-id",
    rootIdentifier: "root-id",
    parentCommentId: "parent-id"
  }), "buildCommentEvent (reply)");

  // 17. WATCH_HISTORY
  validateEvent(NOTE_TYPES.WATCH_HISTORY, buildWatchHistoryEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    monthIdentifier: "2023-10",
    content: "[]"
  }), "buildWatchHistoryEvent");

  // 18. SUBSCRIPTION_LIST
  validateEvent(NOTE_TYPES.SUBSCRIPTION_LIST, buildSubscriptionListEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    content: "encrypted-json"
  }), "buildSubscriptionListEvent");

  // 19. USER_BLOCK_LIST
  validateEvent(NOTE_TYPES.USER_BLOCK_LIST, buildBlockListEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    content: "encrypted-json"
  }), "buildBlockListEvent");

  // 20. HASHTAG_PREFERENCES
  validateEvent(NOTE_TYPES.HASHTAG_PREFERENCES, buildHashtagPreferenceEvent({
    pubkey: "pubkey",
    created_at: 1234567890,
    content: "encrypted-json"
  }), "buildHashtagPreferenceEvent");

  // 21. ADMIN_MODERATION_LIST
  validateEvent(NOTE_TYPES.ADMIN_MODERATION_LIST, buildAdminListEvent("moderation", {
    pubkey: "pubkey",
    created_at: 1234567890,
    hexPubkeys: ["hex-pubkey"]
  }), "buildAdminListEvent (moderation)");

  // 22. ADMIN_BLACKLIST
  validateEvent(NOTE_TYPES.ADMIN_BLACKLIST, buildAdminListEvent("blacklist", {
    pubkey: "pubkey",
    created_at: 1234567890,
    hexPubkeys: ["hex-pubkey"]
  }), "buildAdminListEvent (blacklist)");

  // 23. ADMIN_WHITELIST
  validateEvent(NOTE_TYPES.ADMIN_WHITELIST, buildAdminListEvent("whitelist", {
    pubkey: "pubkey",
    created_at: 1234567890,
    hexPubkeys: ["hex-pubkey"]
  }), "buildAdminListEvent (whitelist)");

  console.log(`\nResults: ${successCount} passed, ${errorCount} failed.`);
  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
