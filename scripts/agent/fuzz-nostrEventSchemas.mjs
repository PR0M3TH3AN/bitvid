
import { runFuzzer, rng } from "./fuzz-shared.mjs";
import { TextEncoder, TextDecoder } from "util";

// Polyfills
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.window = {
  bitvidNostrEventOverrides: {}
};

// Import the target module
// Note: We are in scripts/agent/
import * as Schemas from "../../js/nostrEventSchemas.js";

async function fuzzTest(iteration) {
  // We choose a random function to fuzz in each iteration or fuzz all of them?
  // Let's pick one random target per iteration to keep it simple and isolate crashes.

  const targets = [
    "buildVideoPostEvent",
    "buildViewEvent",
    "buildCommentEvent",
    "buildReactionEvent",
    "buildZapRequestEvent",
    "sanitizeAdditionalTags",
    "validateEventStructure",
    "setNostrEventSchemaOverrides"
  ];

  const targetName = rng.oneOf(targets);
  let inputs = {};

  // Helper to generate a comprehensive random params object
  const genParams = () => {
    // 50% chance of being undefined/null/non-object to test robustness
    if (Math.random() < 0.1) return rng.nastyString();
    if (Math.random() < 0.1) return null;

    // Otherwise generate a rich object
    const params = {
      pubkey: rng.mixedString(64),
      created_at: rng.bool() ? rng.int(0, 2000000000) : rng.nastyString(),
      content: rng.bool() ? rng.mixedString(1000) : rng.recursiveObject(2),
      additionalTags: rng.bool() ? rng.array(() => rng.array(() => rng.mixedString(20), 5), 10) : rng.nastyString(),
    };

    // Add specific fields that might be used by specific builders
    const extraFields = [
        "dTagValue", "url", "magnet", "thumbnail", "description", "mode", "videoRootId",
        "pointerValue", "pointerTag", "pointerTags", "dedupeTag", "includeSessionTag",
        "videoEventId", "videoEventRelay", "videoDefinitionAddress", "rootIdentifier",
        "parentCommentId", "rootKind", "rootAuthorPubkey", "parentKind",
        "recipientPubkey", "relays", "amountSats", "lnurl", "eventId", "coordinate",
        "targetPointer", "targetAuthorPubkey"
    ];

    extraFields.forEach(field => {
        if (rng.bool()) {
            params[field] = rng.mixedString(50);
        } else if (rng.bool()) {
            params[field] = rng.recursiveObject(1); // Potentially invalid type
        }
    });

    return params;
  };

  switch (targetName) {
    case "buildVideoPostEvent":
      inputs = genParams();
      Schemas.buildVideoPostEvent(inputs);
      break;

    case "buildViewEvent":
      inputs = genParams();
      Schemas.buildViewEvent(inputs);
      break;

    case "buildCommentEvent":
      inputs = genParams();
      Schemas.buildCommentEvent(inputs);
      break;

    case "buildReactionEvent":
      inputs = genParams();
      Schemas.buildReactionEvent(inputs);
      break;

    case "buildZapRequestEvent":
      inputs = genParams();
      Schemas.buildZapRequestEvent(inputs);
      break;

    case "sanitizeAdditionalTags":
      // sanitizeAdditionalTags expects an array of tags (arrays)
      if (rng.bool()) {
        inputs = rng.array(() => rng.array(() => rng.mixedString(20), 5), 20);
      } else {
        inputs = rng.nastyString(); // or object, etc.
      }
      Schemas.sanitizeAdditionalTags(inputs);
      break;

    case "validateEventStructure":
       const type = rng.oneOf(Object.values(Schemas.NOTE_TYPES));
       let event = genParams(); // repurpose genParams to make a fake event
       // Ensure event is an object for this specific test setup, unless we want to fuzz that too.
       // validateEventStructure checks: if (!event || typeof event !== "object") return { valid: false ... }
       // So passing a string is valid input for the function (should not crash),
       // but my fuzzer crashes trying to assign .kind to it.
       if (event && typeof event === 'object') {
           event.kind = rng.int(0, 50000);
           event.tags = rng.array(() => rng.array(() => rng.mixedString(10), 3), 5);
       }
       inputs = { type, event };
       Schemas.validateEventStructure(type, event);
       break;

    case "setNostrEventSchemaOverrides":
       const randomType = rng.oneOf(Object.values(Schemas.NOTE_TYPES));
       if (rng.bool()) {
           // Circular object
           const obj = { foo: "bar" };
           obj.self = obj;
           inputs = { [randomType]: obj };
       } else {
           inputs = { [randomType]: genParams() };
       }
       // If we set overrides, we should also trigger usage of them to see if it crashes later
       Schemas.setNostrEventSchemaOverrides(inputs);
       // Trigger usage
       Schemas.getNostrEventSchema(randomType);
       break;
  }

  return { target: targetName, inputs };
}

runFuzzer("nostrEventSchemas", 5000, fuzzTest).catch(err => {
    console.error("Fatal fuzzer error:", err);
    process.exit(1);
});
