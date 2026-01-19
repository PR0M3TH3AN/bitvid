import {
  getNostrEventSchema,
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildRelayListEvent,
  buildViewEvent,
  buildReactionEvent,
  buildCommentEvent,
  buildWatchHistoryEvent,
  buildSubscriptionListEvent,
  buildBlockListEvent,
  buildHashtagPreferenceEvent,
  buildAdminListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
  NOTE_TYPES,
  ADMIN_LIST_IDENTIFIERS
} from "../../js/nostrEventSchemas.js";

const TEST_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_TIMESTAMP = 1700000000;

function validateEvent(event, schema, label) {
  const errors = [];

  // Check Kind
  if (schema.kind !== undefined && event.kind !== schema.kind) {
    errors.push(`Kind mismatch: expected ${schema.kind}, got ${event.kind}`);
  }

  // Check Content Format
  if (schema.content) {
    if (schema.content.format === "json") {
      try {
        const parsed = JSON.parse(event.content);
        if (schema.content.fields) {
          for (const field of schema.content.fields) {
            if (field.required && parsed[field.key] === undefined) {
              errors.push(`Missing required content field: ${field.key}`);
            }
            if (parsed[field.key] !== undefined) {
               // Basic type checking
               if (field.type === 'number' && typeof parsed[field.key] !== 'number') {
                   errors.push(`Field ${field.key} expected number, got ${typeof parsed[field.key]}`);
               }
               if (field.type === 'string' && typeof parsed[field.key] !== 'string') {
                   errors.push(`Field ${field.key} expected string, got ${typeof parsed[field.key]}`);
               }
               if (field.type === 'boolean' && typeof parsed[field.key] !== 'boolean') {
                   errors.push(`Field ${field.key} expected boolean, got ${typeof parsed[field.key]}`);
               }
            }
          }
        }
      } catch (e) {
        errors.push(`Content is not valid JSON: ${e.message}`);
      }
    } else if (schema.content.format === "empty") {
      if (event.content !== "") {
        errors.push(`Content expected to be empty, got length ${event.content.length}`);
      }
    }
  }

  // Check Tags
  if (schema.topicTag) {
    const hasTag = event.tags.some(t => t[0] === schema.topicTag.name && t[1] === schema.topicTag.value);
    if (!hasTag) {
      errors.push(`Missing topic tag: ${schema.topicTag.name}=${schema.topicTag.value}`);
    }
  }

  if (schema.identifierTag) {
    const hasTag = event.tags.some(t => t[0] === schema.identifierTag.name);
    if (!hasTag) {
      errors.push(`Missing identifier tag: ${schema.identifierTag.name}`);
    }
     if (schema.identifierTag.value) {
        const hasValue = event.tags.some(t => t[0] === schema.identifierTag.name && t[1] === schema.identifierTag.value);
        if (!hasValue) {
            errors.push(`Missing identifier tag value: ${schema.identifierTag.name}=${schema.identifierTag.value}`);
        }
    }
  }

  // Append Tags Check (Simple existence check for fixed tags)
    if (schema.appendTags) {
        schema.appendTags.forEach(expectedTag => {
            if (Array.isArray(expectedTag)) {
                 const found = event.tags.some(t =>
                    t.length >= expectedTag.length &&
                    expectedTag.every((val, i) => t[i] === val)
                );
                if (!found) {
                     errors.push(`Missing appended tag: ${JSON.stringify(expectedTag)}`);
                }
            }
        });
    }


  if (errors.length > 0) {
    console.error(`❌ ${label} validation failed:`);
    errors.forEach(e => console.error(`  - ${e}`));
    return false;
  } else {
    console.log(`✅ ${label} validated successfully.`);
    return true;
  }
}

async function runValidation() {
  console.log("Starting Event Schema Validation...\n");
  let allPassed = true;

  // 1. Video Post
  {
    const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_POST);
    const event = buildVideoPostEvent({
      pubkey: TEST_PUBKEY,
      created_at: TEST_TIMESTAMP,
      dTagValue: "test-video",
      content: {
        version: 1,
        title: "Test Video",
        videoRootId: "root-id"
      }
    });
    if (!validateEvent(event, schema, "Video Post")) allPassed = false;
  }

  // 2. Video Mirror
  {
    const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_MIRROR);
    const event = buildVideoMirrorEvent({
        pubkey: TEST_PUBKEY,
        created_at: TEST_TIMESTAMP,
        content: "mirror description"
    });
    if (!validateEvent(event, schema, "Video Mirror")) allPassed = false;
  }

  // 3. Repost
  {
    const schema = getNostrEventSchema(NOTE_TYPES.REPOST);
    const event = buildRepostEvent({
        pubkey: TEST_PUBKEY,
        created_at: TEST_TIMESTAMP,
        eventId: "event-id",
        eventRelay: "wss://relay.example.com",
        serializedEvent: JSON.stringify({ id: "event-id", kind: 1, tags: [], content: "test" })
    });
    // Schema updated to expect JSON content, so this should pass now.
    if (!validateEvent(event, schema, "Repost")) allPassed = false;
  }

  // 4. Relay List
  {
      const schema = getNostrEventSchema(NOTE_TYPES.RELAY_LIST);
      const event = buildRelayListEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          relays: ["wss://relay.one", { url: "wss://relay.two", mode: "read" }]
      });
      if (!validateEvent(event, schema, "Relay List")) allPassed = false;
  }

  // 5. View Event
  {
      const schema = getNostrEventSchema(NOTE_TYPES.VIEW_EVENT);
      const event = buildViewEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          dedupeTag: "dedupe-val",
          includeSessionTag: true,
          content: "view log"
      });
      if (!validateEvent(event, schema, "View Event")) allPassed = false;
  }

  // 6. Reaction Event
  {
      const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_REACTION);
      const event = buildReactionEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          targetPointer: { type: "e", value: "target-id", relay: "wss://r.com" },
          content: "+"
      });
      if (!validateEvent(event, schema, "Reaction Event")) allPassed = false;
  }

  // 7. Comment Event
  {
      const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
      const event = buildCommentEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          videoEventId: "vid-id",
          content: "Nice video!"
      });
      if (!validateEvent(event, schema, "Comment Event")) allPassed = false;
  }

  // 8. Watch History
  {
      const schema = getNostrEventSchema(NOTE_TYPES.WATCH_HISTORY);
      const event = buildWatchHistoryEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          monthIdentifier: "2023-10",
          content: JSON.stringify(["watched-id-1"])
      });
      if (!validateEvent(event, schema, "Watch History")) allPassed = false;
  }

  // 9. Subscription List
  {
      const schema = getNostrEventSchema(NOTE_TYPES.SUBSCRIPTION_LIST);
      const event = buildSubscriptionListEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          content: "encrypted-stuff"
      });
      if (!validateEvent(event, schema, "Subscription List")) allPassed = false;
  }

  // 10. Block List
  {
      const schema = getNostrEventSchema(NOTE_TYPES.USER_BLOCK_LIST);
      const event = buildBlockListEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          content: "encrypted-stuff"
      });
      if (!validateEvent(event, schema, "Block List")) allPassed = false;
  }

  // 11. Hashtag Preference
  {
      const schema = getNostrEventSchema(NOTE_TYPES.HASHTAG_PREFERENCES);
      const event = buildHashtagPreferenceEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          content: JSON.stringify({ version: 1, interests: [], disinterests: [] })
      });
      if (!validateEvent(event, schema, "Hashtag Preferences")) allPassed = false;
  }

  // 12. Admin List (Moderation)
  {
      const schema = getNostrEventSchema(NOTE_TYPES.ADMIN_MODERATION_LIST);
      const event = buildAdminListEvent("moderation", {
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          hexPubkeys: ["0000000000000000000000000000000000000000000000000000000000000002"]
      });
      if (!validateEvent(event, schema, "Admin Moderation List")) allPassed = false;
  }

  // 13. Profile Metadata
  {
      const schema = getNostrEventSchema(NOTE_TYPES.PROFILE_METADATA);
      const event = buildProfileMetadataEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          metadata: { name: "Test User", about: "Testing" }
      });
      if (!validateEvent(event, schema, "Profile Metadata")) allPassed = false;
  }

  // 14. Mute List
  {
      const schema = getNostrEventSchema(NOTE_TYPES.MUTE_LIST);
      const event = buildMuteListEvent({
          pubkey: TEST_PUBKEY,
          created_at: TEST_TIMESTAMP,
          pTags: ["0000000000000000000000000000000000000000000000000000000000000002"]
      });
      if (!validateEvent(event, schema, "Mute List")) allPassed = false;
  }

  if (!allPassed) {
    console.error("\n❌ Some validations failed.");
    process.exit(1);
  } else {
    console.log("\n✅ All validations passed.");
  }
}

runValidation().catch(e => {
    console.error(e);
    process.exit(1);
});
