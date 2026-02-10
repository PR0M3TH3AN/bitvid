import {
  randomInt,
  randomBoolean,
  randomString,
  randomHex,
  randomArray,
  randomValue,
  randomObject,
  runFuzzer,
} from "./fuzz-utils.mjs";
import * as Schemas from "../../js/nostrEventSchemas.js";

function genTag() {
  return randomArray(() => randomString(randomInt(0, 20), true), 0, 5);
}

function genAdditionalTags() {
  const choice = randomInt(0, 3);
  if (choice === 0) return [null]; // Invalid input
  if (choice === 1) return [randomString(100)]; // Invalid input
  return [randomArray(genTag, 0, 10)];
}

function genEvent() {
  return {
    kind: randomInt(0, 50000),
    pubkey: randomHex(64),
    created_at: randomInt(0, 2000000000),
    tags: randomArray(genTag, 0, 20),
    content: randomString(randomInt(0, 1000), true),
  };
}

function genValidateEventStructureArgs() {
  const type = randomArray(() => randomString(10), 1)[0]; // Random type
  // Also pick a valid type sometimes
  const validTypes = Object.values(Schemas.NOTE_TYPES);
  const selectedType =
    Math.random() < 0.5
      ? validTypes[randomInt(0, validTypes.length - 1)]
      : type;

  const event = Math.random() < 0.1 ? null : genEvent();
  return [selectedType, event];
}

function genParams(extraKeys = []) {
  const base = randomObject(2, 2);
  const commonKeys = [
    "pubkey",
    "created_at",
    "additionalTags",
    "content",
    "tags",
  ];
  const keys = [...commonKeys, ...extraKeys];

  keys.forEach((key) => {
    if (Math.random() < 0.7) {
      if (key === "additionalTags") {
        base[key] = randomArray(genTag, 0, 5);
      } else if (key === "created_at") {
        base[key] = randomInt(0, 2000000000);
      } else if (key === "pubkey") {
        base[key] = randomHex(64);
      } else {
        base[key] = randomValue(0, 2);
      }
    }
  });

  return [base];
}

async function main() {
  await runFuzzer(
    "sanitizeAdditionalTags",
    Schemas.sanitizeAdditionalTags,
    genAdditionalTags
  );
  await runFuzzer(
    "validateEventStructure",
    Schemas.validateEventStructure,
    genValidateEventStructureArgs
  );

  // Build functions
  const buildFunctions = [
    {
      name: "buildVideoPostEvent",
      fn: Schemas.buildVideoPostEvent,
      keys: ["dTagValue", "infoHash", "url", "videoRootId"],
    },
    {
      name: "buildHttpAuthEvent",
      fn: Schemas.buildHttpAuthEvent,
      keys: ["url", "method", "payload"],
    },
    {
      name: "buildReportEvent",
      fn: Schemas.buildReportEvent,
      keys: ["eventId", "userId", "reportType", "relayHint"],
    },
    {
      name: "buildGiftWrapEvent",
      fn: Schemas.buildGiftWrapEvent,
      keys: ["recipientPubkey", "ciphertext", "relayHint"],
    },
    {
      name: "buildSealEvent",
      fn: Schemas.buildSealEvent,
      keys: ["ciphertext"],
    },
    {
      name: "buildChatMessageEvent",
      fn: Schemas.buildChatMessageEvent,
      keys: ["recipientPubkey"],
    },
    {
      name: "buildVideoMirrorEvent",
      fn: Schemas.buildVideoMirrorEvent,
      keys: [],
    },
    {
      name: "buildRepostEvent",
      fn: Schemas.buildRepostEvent,
      keys: [
        "eventId",
        "eventRelay",
        "address",
        "addressRelay",
        "authorPubkey",
        "repostKind",
        "targetKind",
        "targetEvent",
        "serializedEvent",
      ],
    },
    {
      name: "buildShareEvent",
      fn: Schemas.buildShareEvent,
      keys: ["video", "relays"],
    },
    {
      name: "buildRelayListEvent",
      fn: Schemas.buildRelayListEvent,
      keys: ["relays"],
    },
    {
      name: "buildDmRelayListEvent",
      fn: Schemas.buildDmRelayListEvent,
      keys: ["relays"],
    },
    {
      name: "buildProfileMetadataEvent",
      fn: Schemas.buildProfileMetadataEvent,
      keys: ["metadata"],
    },
    {
      name: "buildMuteListEvent",
      fn: Schemas.buildMuteListEvent,
      keys: ["pTags", "encrypted", "encryptionTag"],
    },
    {
      name: "buildDeletionEvent",
      fn: Schemas.buildDeletionEvent,
      keys: ["eventIds", "addresses", "reason"],
    },
    {
      name: "buildLegacyDirectMessageEvent",
      fn: Schemas.buildLegacyDirectMessageEvent,
      keys: ["recipientPubkey", "ciphertext"],
    },
    {
      name: "buildDmAttachmentEvent",
      fn: Schemas.buildDmAttachmentEvent,
      keys: ["recipientPubkey", "attachment"],
    },
    {
      name: "buildDmReadReceiptEvent",
      fn: Schemas.buildDmReadReceiptEvent,
      keys: ["recipientPubkey", "eventId", "messageKind"],
    },
    {
      name: "buildDmTypingIndicatorEvent",
      fn: Schemas.buildDmTypingIndicatorEvent,
      keys: ["recipientPubkey", "eventId", "expiresAt"],
    },
    {
      name: "buildViewEvent",
      fn: Schemas.buildViewEvent,
      keys: [
        "pointerValue",
        "pointerTag",
        "pointerTags",
        "dedupeTag",
        "includeSessionTag",
      ],
    },
    {
      name: "buildZapRequestEvent",
      fn: Schemas.buildZapRequestEvent,
      keys: [
        "recipientPubkey",
        "relays",
        "amountSats",
        "lnurl",
        "eventId",
        "coordinate",
      ],
    },
    {
      name: "buildReactionEvent",
      fn: Schemas.buildReactionEvent,
      keys: [
        "pointerValue",
        "pointerTag",
        "pointerTags",
        "targetPointer",
        "targetAuthorPubkey",
      ],
    },
    {
      name: "buildCommentEvent",
      fn: Schemas.buildCommentEvent,
      keys: [
        "videoEventId",
        "videoEventRelay",
        "videoDefinitionAddress",
        "videoDefinitionRelay",
        "rootIdentifier",
        "rootIdentifierRelay",
        "parentCommentId",
        "parentCommentRelay",
        "threadParticipantPubkey",
        "threadParticipantRelay",
        "parentIdentifier",
        "parentIdentifierRelay",
        "rootKind",
        "rootAuthorPubkey",
        "rootAuthorRelay",
        "parentAuthorPubkey",
        "parentAuthorRelay",
        "parentKind",
      ],
    },
    {
      name: "buildWatchHistoryEvent",
      fn: Schemas.buildWatchHistoryEvent,
      keys: ["monthIdentifier", "pointerTags"],
    },
    {
      name: "buildSubscriptionListEvent",
      fn: Schemas.buildSubscriptionListEvent,
      keys: ["encryption"],
    },
    {
      name: "buildBlockListEvent",
      fn: Schemas.buildBlockListEvent,
      keys: ["encryption"],
    },
    {
      name: "buildHashtagPreferenceEvent",
      fn: Schemas.buildHashtagPreferenceEvent,
      keys: [],
    },
  ];

  for (const { name, fn, keys } of buildFunctions) {
    await runFuzzer(name, fn, () => genParams(keys));
  }

  // buildAdminListEvent needs special handling for 2 args
  await runFuzzer(
    "buildAdminListEvent",
    Schemas.buildAdminListEvent,
    () => {
        const listKey = Math.random() < 0.5 ? randomString(10) : (Math.random() < 0.5 ? "moderation" : "blacklist");
        const params = genParams(["hexPubkeys"])[0];
        return [listKey, params];
    }
  );
}

main().catch(console.error);
