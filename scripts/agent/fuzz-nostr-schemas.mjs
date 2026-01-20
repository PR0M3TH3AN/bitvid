import { Fuzzer } from "./fuzz-lib.mjs";
import * as schemas from "../../js/nostrEventSchemas.js";

// Mock global dependencies if needed
if (typeof global.window === "undefined") {
  global.window = {};
}

const fuzzer = new Fuzzer("nostr-schemas");

// Builders take a params object.
const builders = [
  "buildVideoPostEvent",
  "buildVideoMirrorEvent",
  "buildRepostEvent",
  "buildRelayListEvent",
  "buildDmRelayListEvent",
  "buildProfileMetadataEvent",
  "buildMuteListEvent",
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
];

async function test(fuzzer, state) {
  const action = fuzzer.randInt(0, 3);
  let input = {};

  if (action === 0) {
    // Fuzz sanitizeAdditionalTags
    const tags = fuzzer.randArray(() => {
        if (fuzzer.randBool()) {
            return fuzzer.randArray(() => fuzzer.randString(10), 0, 5);
        } else {
            return fuzzer.randJSON(); // Garbage
        }
    }, 0, 20);
    input = { target: "sanitizeAdditionalTags", tags };
    state.input = input;
    schemas.sanitizeAdditionalTags(tags);

  } else if (action === 1) {
    // Fuzz validateEventAgainstSchema
    const types = Object.keys(schemas.NOTE_TYPES);
    const type = fuzzer.pick(types);
    const event = {
      kind: fuzzer.randInt(0, 40000),
      content: fuzzer.randUnicodeString(100),
      tags: fuzzer.randArray(() => fuzzer.randArray(() => fuzzer.randString(10), 0, 5), 0, 10),
      pubkey: fuzzer.randString(64, "0123456789abcdef"),
      created_at: Math.floor(Date.now() / 1000)
    };

    // Mutate event
    if (fuzzer.randBool()) event.content = fuzzer.randJSON();
    if (fuzzer.randBool()) event.tags = "not an array";

    input = { target: "validateEventAgainstSchema", type, event };
    state.input = input;
    schemas.validateEventAgainstSchema(type, event);

  } else if (action === 2) {
    // Fuzz Builders
    const builderName = fuzzer.pick(builders);
    const builderFn = schemas[builderName];

    // Generate random params
    const params = fuzzer.randObject({
      pubkey: () => fuzzer.randString(64, "0123456789abcdef"),
      created_at: () => Math.floor(Date.now() / 1000),
      content: () => fuzzer.randUnicodeString(50),
      additionalTags: () => fuzzer.randArray(() => [fuzzer.randString(5), fuzzer.randString(10)], 0, 5),
      dTagValue: () => fuzzer.randString(10),
      eventId: () => fuzzer.randString(64, "0123456789abcdef"),
      // Add more random keys that might be expected or unexpected
      [fuzzer.randString(5)]: () => fuzzer.randJSON()
    });

    input = { target: builderName, params };
    state.input = input;

    if (typeof builderFn === "function") {
        builderFn(params);
    }
  } else if (action === 3) {
      // buildAdminListEvent special case
      const listKey = fuzzer.pick(["moderation", "editors", "whitelist", "blacklist", fuzzer.randString(5)]);
      const params = {
          pubkey: fuzzer.randString(64, "0123456789abcdef"),
          hexPubkeys: fuzzer.randArray(() => fuzzer.randString(64, "0123456789abcdef"), 0, 5)
      };
      input = { target: "buildAdminListEvent", listKey, params };
      state.input = input;
      schemas.buildAdminListEvent(listKey, params);
  }
}

fuzzer.runFuzzLoop(2000, test);
