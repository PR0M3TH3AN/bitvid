import "./setup-test-env.js";
import { Fuzzer } from "./fuzz-lib.mjs";
import * as schemas from "../../js/nostrEventSchemas.js";

const fuzzer = new Fuzzer("nostr-schemas");

// Mappers for build functions
const BUILDERS = [
  { name: "buildVideoPostEvent", fn: schemas.buildVideoPostEvent },
  { name: "buildVideoMirrorEvent", fn: schemas.buildVideoMirrorEvent },
  { name: "buildRepostEvent", fn: schemas.buildRepostEvent },
  { name: "buildRelayListEvent", fn: schemas.buildRelayListEvent },
  { name: "buildDmRelayListEvent", fn: schemas.buildDmRelayListEvent },
  { name: "buildProfileMetadataEvent", fn: schemas.buildProfileMetadataEvent },
  { name: "buildMuteListEvent", fn: schemas.buildMuteListEvent },
  { name: "buildDmAttachmentEvent", fn: schemas.buildDmAttachmentEvent },
  { name: "buildDmReadReceiptEvent", fn: schemas.buildDmReadReceiptEvent },
  { name: "buildDmTypingIndicatorEvent", fn: schemas.buildDmTypingIndicatorEvent },
  { name: "buildViewEvent", fn: schemas.buildViewEvent },
  { name: "buildZapRequestEvent", fn: schemas.buildZapRequestEvent },
  { name: "buildReactionEvent", fn: schemas.buildReactionEvent },
  { name: "buildCommentEvent", fn: schemas.buildCommentEvent },
  { name: "buildWatchHistoryEvent", fn: schemas.buildWatchHistoryEvent },
  { name: "buildSubscriptionListEvent", fn: schemas.buildSubscriptionListEvent },
  { name: "buildBlockListEvent", fn: schemas.buildBlockListEvent },
  { name: "buildHashtagPreferenceEvent", fn: schemas.buildHashtagPreferenceEvent },
];

async function fuzzTest(fuzzer, state) {
  // 1. Fuzz Builder Functions
  const builder = fuzzer.pick(BUILDERS);

  // Generate random params
  const params = fuzzer.randJSON();
  state.input = {
    target: builder.name,
    params: params
  };

  try {
    // Some builders require specific args like buildAdminListEvent(listKey, params)
    // but most take a single params object.
    // We didn't include buildAdminListEvent in the list above because it takes 2 args.

    const event = builder.fn(params);

    // 2. Validate the generated event
    if (event && event.kind) {
      // Find schema type for this kind to validate
      let type = null;
      for (const [key, val] of Object.entries(schemas.NOTE_TYPES)) {
        const schema = schemas.getNostrEventSchema(val);
        if (schema && schema.kind === event.kind) {
            type = val;
            break;
        }
      }

      if (type) {
         schemas.validateEventAgainstSchema(type, event);
      }
    }
  } catch (err) {
    throw err;
  }

  // 3. Fuzz Validation directly with random events
  if (fuzzer.randBool()) {
    const types = Object.values(schemas.NOTE_TYPES);
    const type = fuzzer.pick(types);
    const randomEvent = fuzzer.randJSON();

    state.input = {
      target: "validateEventAgainstSchema",
      type: type,
      event: randomEvent
    };

    schemas.validateEventAgainstSchema(type, randomEvent);
  }
}

// Run for 5000 iterations
fuzzer.runFuzzLoop(5000, fuzzTest).catch(console.error);
