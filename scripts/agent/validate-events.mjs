import {
  NOTE_TYPES,
  getNostrEventSchema,
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildRelayListEvent,
  buildDmRelayListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
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

import { buildNip71VideoEvent } from "../../js/nostr/nip71.js";

// Mock data
const MOCK_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const MOCK_EVENT_ID = "0000000000000000000000000000000000000000000000000000000000000002";
const MOCK_TIMESTAMP = 1700000000;
const MOCK_URL = "https://example.com/video.mp4";
const MOCK_THUMBNAIL = "https://example.com/thumb.jpg";
const MOCK_MAGNET = "magnet:?xt=urn:btih:example";
const MOCK_RELAY = "wss://relay.example.com";
const MOCK_D_TAG = "mock-d-tag";

// Helper to check if a tag exists
function hasTag(tags, tagName, tagValue = null) {
  return tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === tagName &&
      (tagValue === null || tag[1] === tagValue)
  );
}

// Validation logic
function validateEvent(type, event) {
  const schema = getNostrEventSchema(type);
  const errors = [];

  if (!schema) {
    return [`Schema not found for type: ${type}`];
  }

  // 1. Validate Kind
  if (event.kind !== schema.kind) {
    errors.push(`Kind mismatch: expected ${schema.kind}, got ${event.kind}`);
  }

  // 2. Validate Required Tags
  // Topic tag
  if (schema.topicTag) {
    if (!hasTag(event.tags, schema.topicTag.name, schema.topicTag.value)) {
      errors.push(
        `Missing topic tag: ${schema.topicTag.name}=${schema.topicTag.value}`
      );
    }
  }

  // Identifier tag (d tag)
  if (schema.identifierTag) {
    // For lists with fixed identifier values (like subscription list), check the value
    const expectedValue = schema.identifierTag.value;
    if (!hasTag(event.tags, schema.identifierTag.name, expectedValue)) {
      errors.push(
        `Missing identifier tag: ${schema.identifierTag.name}${
          expectedValue ? "=" + expectedValue : ""
        }`
      );
    }
  }

  // Append tags
  if (schema.appendTags) {
    schema.appendTags.forEach((appendTag) => {
      const tagName = appendTag[0];
      const tagValue = appendTag[1];
      if (!hasTag(event.tags, tagName, tagValue)) {
        errors.push(`Missing append tag: ${tagName}=${tagValue}`);
      }
    });
  }

  // Specific schema tags
  if (schema.relayTagName) {
      // Check if at least one relay tag exists if we added relays in mock data
      // This is slightly context dependent, but we can check if the builder respects the tag name
      // Logic: if we expect the builder to use 'r' or 'relay', we can't easily verify generally unless we check specific output
      // But we can check if any tag with that name exists IF we passed relays.
  }

  // 3. Validate Content Format
  if (schema.content) {
    if (schema.content.format === "json") {
      try {
        JSON.parse(event.content);
        // TODO: Validate JSON schema fields if defined (schema.content.fields)
        if (schema.content.fields) {
            const parsed = JSON.parse(event.content);
            schema.content.fields.forEach(field => {
                if (field.required && parsed[field.key] === undefined) {
                    errors.push(`Missing required content field: ${field.key}`);
                }
                if (parsed[field.key] !== undefined) {
                    if (field.type === 'number' && typeof parsed[field.key] !== 'number') {
                         errors.push(`Invalid type for content field ${field.key}: expected number, got ${typeof parsed[field.key]}`);
                    }
                    if (field.type === 'string' && typeof parsed[field.key] !== 'string') {
                        errors.push(`Invalid type for content field ${field.key}: expected string, got ${typeof parsed[field.key]}`);
                   }
                   if (field.type === 'boolean' && typeof parsed[field.key] !== 'boolean') {
                        errors.push(`Invalid type for content field ${field.key}: expected boolean, got ${typeof parsed[field.key]}`);
                   }
                }
            });
        }
      } catch (e) {
        errors.push("Content is not valid JSON");
      }
    } else if (schema.content.format === "empty") {
      if (event.content !== "") {
        errors.push("Content should be empty");
      }
    } else if (
      schema.content.format === "text" ||
      schema.content.format === "encrypted-tag-list" ||
      schema.content.format === "nip44-json"
    ) {
      if (typeof event.content !== "string") {
        errors.push("Content must be a string");
      }
    }
  }

  return errors;
}

// Test cases
const tests = [
  {
    name: "Video Post",
    type: NOTE_TYPES.VIDEO_POST,
    builder: buildVideoPostEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      dTagValue: MOCK_D_TAG,
      content: {
        version: 3,
        title: "Test Video",
        videoRootId: MOCK_EVENT_ID,
      },
    },
  },
  {
    name: "Video Mirror",
    type: NOTE_TYPES.VIDEO_MIRROR,
    builder: buildVideoMirrorEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      content: "Alt text",
      tags: [["magnet", MOCK_MAGNET]],
    },
  },
  {
    name: "Repost",
    type: NOTE_TYPES.REPOST,
    builder: buildRepostEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      eventId: MOCK_EVENT_ID,
      eventRelay: MOCK_RELAY,
      targetEvent: { id: MOCK_EVENT_ID, pubkey: MOCK_PUBKEY, kind: 1, content: "test", tags: [], created_at: MOCK_TIMESTAMP },
    },
  },
  {
    name: "Relay List",
    type: NOTE_TYPES.RELAY_LIST,
    builder: buildRelayListEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      relays: [
        { url: "wss://r1.com", read: true, write: true },
        { url: "wss://r2.com", read: true, write: false },
      ],
    },
  },
  {
    name: "DM Relay List",
    type: NOTE_TYPES.DM_RELAY_LIST,
    builder: buildDmRelayListEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      relays: ["wss://dm.relay.com"],
    },
  },
  {
    name: "Profile Metadata",
    type: NOTE_TYPES.PROFILE_METADATA,
    builder: buildProfileMetadataEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      metadata: { name: "TestUser", about: "Testing" },
    },
  },
  {
    name: "Mute List",
    type: NOTE_TYPES.MUTE_LIST,
    builder: buildMuteListEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      pTags: [MOCK_PUBKEY],
    },
  },
  {
    name: "DM Attachment",
    type: NOTE_TYPES.DM_ATTACHMENT,
    builder: buildDmAttachmentEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      recipientPubkey: MOCK_PUBKEY,
      attachment: { x: "hash", url: MOCK_URL, type: "image/jpeg" },
    },
  },
  {
    name: "DM Read Receipt",
    type: NOTE_TYPES.DM_READ_RECEIPT,
    builder: buildDmReadReceiptEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      recipientPubkey: MOCK_PUBKEY,
      eventId: MOCK_EVENT_ID,
      messageKind: 4,
    },
  },
  {
    name: "DM Typing Indicator",
    type: NOTE_TYPES.DM_TYPING,
    builder: buildDmTypingIndicatorEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      recipientPubkey: MOCK_PUBKEY,
      eventId: MOCK_EVENT_ID,
      expiresAt: MOCK_TIMESTAMP + 60,
    },
  },
  {
    name: "View Event",
    type: NOTE_TYPES.VIEW_EVENT,
    builder: buildViewEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      pointerTag: ["e", MOCK_EVENT_ID],
      dedupeTag: "unique-view-id",
    },
  },
  {
    name: "Zap Request",
    type: NOTE_TYPES.ZAP_REQUEST,
    builder: buildZapRequestEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      recipientPubkey: MOCK_PUBKEY,
      amountSats: 100,
      relays: [MOCK_RELAY],
      eventId: MOCK_EVENT_ID,
    },
  },
  {
    name: "Reaction",
    type: NOTE_TYPES.VIDEO_REACTION,
    builder: buildReactionEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      targetPointer: { type: "e", value: MOCK_EVENT_ID, relay: MOCK_RELAY },
      content: "+",
    },
  },
  {
    name: "Video Comment",
    type: NOTE_TYPES.VIDEO_COMMENT,
    builder: buildCommentEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      videoEventId: MOCK_EVENT_ID,
      videoEventRelay: MOCK_RELAY,
      content: "Great video!",
    },
  },
  {
    name: "Watch History",
    type: NOTE_TYPES.WATCH_HISTORY,
    builder: buildWatchHistoryEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      monthIdentifier: "2023-11",
      pointerTags: [["e", MOCK_EVENT_ID]],
      content: JSON.stringify({ version: 2, month: "2023-11", items: [] }),
    },
  },
  {
    name: "Subscription List",
    type: NOTE_TYPES.SUBSCRIPTION_LIST,
    builder: buildSubscriptionListEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      content: "encrypted-content",
      encryption: "nip44",
    },
  },
  {
    name: "Block List",
    type: NOTE_TYPES.USER_BLOCK_LIST,
    builder: buildBlockListEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      content: "encrypted-content",
      encryption: "nip44",
    },
  },
  {
    name: "Hashtag Preferences",
    type: NOTE_TYPES.HASHTAG_PREFERENCES,
    builder: buildHashtagPreferenceEvent,
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      content: "encrypted-content",
    },
  },
  {
    name: "Admin Moderation List",
    type: NOTE_TYPES.ADMIN_MODERATION_LIST,
    builder: (params) => buildAdminListEvent("moderation", params),
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      hexPubkeys: [MOCK_PUBKEY],
    },
  },
  {
    name: "Admin Blacklist",
    type: NOTE_TYPES.ADMIN_BLACKLIST,
    builder: (params) => buildAdminListEvent("blacklist", params),
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      hexPubkeys: [MOCK_PUBKEY],
    },
  },
  {
    name: "Admin Whitelist",
    type: NOTE_TYPES.ADMIN_WHITELIST,
    builder: (params) => buildAdminListEvent("whitelist", params),
    params: {
      pubkey: MOCK_PUBKEY,
      created_at: MOCK_TIMESTAMP,
      hexPubkeys: [MOCK_PUBKEY],
    },
  },
  {
    name: "NIP-71 Video",
    type: NOTE_TYPES.NIP71_VIDEO,
    builder: buildNip71VideoEvent,
    params: {
      metadata: {
        kind: 21,
        title: "Test NIP-71 Video",
        summary: "This is a test summary",
      },
      pubkey: MOCK_PUBKEY,
      title: "Test NIP-71 Video",
    },
  },
];

// Execution
console.log("Starting Event Validation...");
let failCount = 0;

tests.forEach((test) => {
  try {
    const event = test.builder(test.params);
    const errors = validateEvent(test.type, event);

    if (errors.length > 0) {
      console.error(`❌ ${test.name} Failed:`);
      errors.forEach((err) => console.error(`   - ${err}`));
      failCount++;
    } else {
      console.log(`✅ ${test.name} Passed`);
    }
  } catch (e) {
    console.error(`❌ ${test.name} threw exception:`, e);
    failCount++;
  }
});

if (failCount > 0) {
  console.log(`\nValidation failed with ${failCount} errors.`);
  process.exit(1);
} else {
  console.log("\nAll events validated successfully!");
  process.exit(0);
}
