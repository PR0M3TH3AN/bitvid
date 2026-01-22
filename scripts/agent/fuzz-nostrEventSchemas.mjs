
import * as schemas from "../../js/nostrEventSchemas.js";
import { runFuzzer, randomString, randomInt, randomJSON, randomHex, randomBoolean, randomItem } from "./fuzz-shared.mjs";

async function fuzzNostrEventSchemas(iteration) {
  // Randomly select an action
  const actions = [
    "sanitizeAdditionalTags",
    "buildVideoPostEvent",
    "buildVideoMirrorEvent",
    "buildRepostEvent",
    "buildRelayListEvent",
    "buildDmRelayListEvent",
    "buildProfileMetadataEvent",
    "buildMuteListEvent",
    "buildDeletionEvent",
    "buildLegacyDirectMessageEvent",
    "buildDmAttachmentEvent",
    "buildDmReadReceiptEvent",
    "buildDmTypingIndicatorEvent",
    "buildViewEvent",
    "buildZapRequestEvent",
    "buildReactionEvent",
    "buildCommentEvent",
    "buildWatchHistoryEvent",
    "buildSubscriptionListEvent",
    "buildBlockListEvent",
    "buildHashtagPreferenceEvent",
    "buildAdminListEvent"
  ];

  const action = actions[iteration % actions.length];
  // Introduce randomness within the cycle
  // const action = randomItem(actions);

  let input = { action };

  try {
    switch (action) {
      case "sanitizeAdditionalTags": {
        input.args = [randomJSON(2, 5)];
        schemas.sanitizeAdditionalTags(input.args[0]);
        break;
      }
      case "buildVideoPostEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          dTagValue: randomString(10),
          content: randomJSON(2, 3),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildVideoPostEvent(input.args[0]);
        break;
      }
      case "buildVideoMirrorEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          tags: randomJSON(2, 3),
          content: randomString(100)
        }];
        schemas.buildVideoMirrorEvent(input.args[0]);
        break;
      }
      case "buildRepostEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          eventId: randomHex(64),
          eventRelay: randomString(20),
          address: randomString(20),
          addressRelay: randomString(20),
          authorPubkey: randomHex(64),
          additionalTags: randomJSON(2, 3),
          repostKind: randomInt(0, 10000),
          targetKind: randomInt(0, 10000),
          targetEvent: randomJSON(2, 3),
          serializedEvent: randomString(50)
        }];
        schemas.buildRepostEvent(input.args[0]);
        break;
      }
      case "buildRelayListEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          relays: randomJSON(2, 3),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildRelayListEvent(input.args[0]);
        break;
      }
      case "buildDmRelayListEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          relays: randomJSON(1, 5),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildDmRelayListEvent(input.args[0]);
        break;
      }
      case "buildProfileMetadataEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          metadata: randomJSON(2, 3),
          content: randomString(50),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildProfileMetadataEvent(input.args[0]);
        break;
      }
      case "buildMuteListEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          pTags: [randomHex(64), randomHex(64)],
          content: randomString(50),
          encrypted: randomBoolean(),
          encryptionTag: randomString(10),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildMuteListEvent(input.args[0]);
        break;
      }
      case "buildDeletionEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          eventIds: [randomHex(64)],
          addresses: [randomString(20)],
          reason: randomString(50),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildDeletionEvent(input.args[0]);
        break;
      }
      case "buildLegacyDirectMessageEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          recipientPubkey: randomHex(64),
          ciphertext: randomString(100),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildLegacyDirectMessageEvent(input.args[0]);
        break;
      }
      case "buildDmAttachmentEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          recipientPubkey: randomHex(64),
          attachment: randomJSON(1, 3),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildDmAttachmentEvent(input.args[0]);
        break;
      }
      case "buildDmReadReceiptEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          recipientPubkey: randomHex(64),
          eventId: randomHex(64),
          messageKind: randomInt(0, 10000),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildDmReadReceiptEvent(input.args[0]);
        break;
      }
      case "buildDmTypingIndicatorEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          recipientPubkey: randomHex(64),
          eventId: randomHex(64),
          expiresAt: randomInt(1000000000, 2000000000),
          additionalTags: randomJSON(2, 3)
        }];
        schemas.buildDmTypingIndicatorEvent(input.args[0]);
        break;
      }
      case "buildViewEvent": {
        // High fuzz target for ensureValidUtf8Content
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          pointerValue: randomString(50),
          pointerTag: [randomString(5), randomString(20)],
          pointerTags: randomJSON(2, 3),
          dedupeTag: randomString(20),
          includeSessionTag: randomBoolean(),
          additionalTags: randomJSON(2, 3),
          content: randomString(200) + "\uD800" + randomString(10) // Surrogate pair
        }];
        schemas.buildViewEvent(input.args[0]);
        break;
      }
      case "buildZapRequestEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          recipientPubkey: randomHex(64),
          relays: [randomString(20)],
          amountSats: randomInt(0, 1000000),
          lnurl: randomString(50),
          eventId: randomHex(64),
          coordinate: randomString(50),
          additionalTags: randomJSON(2, 3),
          content: randomString(50)
        }];
        schemas.buildZapRequestEvent(input.args[0]);
        break;
      }
      case "buildReactionEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          pointerValue: randomString(20),
          pointerTag: [randomString(5), randomString(20)],
          pointerTags: randomJSON(2, 3),
          targetPointer: randomJSON(1, 3),
          targetAuthorPubkey: randomHex(64),
          additionalTags: randomJSON(2, 3),
          content: randomString(10)
        }];
        schemas.buildReactionEvent(input.args[0]);
        break;
      }
      case "buildCommentEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          videoEventId: randomHex(64),
          videoEventRelay: randomString(20),
          videoDefinitionAddress: randomString(50),
          videoDefinitionRelay: randomString(20),
          rootIdentifier: randomString(50),
          rootIdentifierRelay: randomString(20),
          parentCommentId: randomHex(64),
          parentCommentRelay: randomString(20),
          threadParticipantPubkey: randomHex(64),
          threadParticipantRelay: randomString(20),
          rootKind: randomInt(0, 10000),
          rootAuthorPubkey: randomHex(64),
          rootAuthorRelay: randomString(20),
          parentKind: randomInt(0, 10000),
          parentAuthorPubkey: randomHex(64),
          parentAuthorRelay: randomString(20),
          parentIdentifier: randomString(50),
          parentIdentifierRelay: randomString(20),
          additionalTags: randomJSON(2, 3),
          content: randomString(100)
        }];
        schemas.buildCommentEvent(input.args[0]);
        break;
      }
      case "buildWatchHistoryEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          monthIdentifier: randomString(10),
          pointerTags: randomJSON(2, 3),
          content: randomJSON(2, 3)
        }];
        schemas.buildWatchHistoryEvent(input.args[0]);
        break;
      }
      case "buildSubscriptionListEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          content: randomString(50),
          encryption: randomString(10)
        }];
        schemas.buildSubscriptionListEvent(input.args[0]);
        break;
      }
      case "buildBlockListEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          content: randomString(50),
          encryption: randomString(10)
        }];
        schemas.buildBlockListEvent(input.args[0]);
        break;
      }
      case "buildHashtagPreferenceEvent": {
        input.args = [{
          pubkey: randomHex(64),
          created_at: randomInt(1000000000, 2000000000),
          content: randomString(50)
        }];
        schemas.buildHashtagPreferenceEvent(input.args[0]);
        break;
      }
      case "buildAdminListEvent": {
        input.args = [
          randomItem(["moderation", "editors", "whitelist", "blacklist", randomString(5)]),
          {
            pubkey: randomHex(64),
            created_at: randomInt(1000000000, 2000000000),
            hexPubkeys: [randomHex(64), randomHex(64)]
          }
        ];
        schemas.buildAdminListEvent(input.args[0], input.args[1]);
        break;
      }
    }

    return input;
  } catch (error) {
    throw error;
  }
}

// 5000 iterations to get good coverage
runFuzzer("nostrEventSchemas", fuzzNostrEventSchemas, 5000);
