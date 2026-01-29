import "./setup-test-env.js";
import { Fuzzer } from "./fuzz-lib.mjs";
import * as schemas from "../../js/nostrEventSchemas.js";

const fuzzer = new Fuzzer("nostrEventSchemas");

// Mappers for build functions
const BUILDERS = Object.keys(schemas)
  .filter(k => k.startsWith('build'))
  .map(k => ({ name: k, fn: schemas[k] }));

async function fuzzTest(fuzzer, state) {
  // 1. Fuzz Builder Functions
  const builder = fuzzer.pick(BUILDERS);

  // Generate random params
  const params = fuzzer.randJSON();

  // Inject huge strings occasionally
  if (Math.random() < 0.05) {
      if (!params || typeof params !== 'object') {
          // make it an object
      } else {
          // add huge string field
          params.hugeField = "A".repeat(1000000); // 1MB
      }
  }

  state.input = {
    target: builder.name,
    params: params
  };

  try {
    let args = [params];
    if (builder.name === 'buildAdminListEvent') {
        const listKeys = ["moderation", "editors", "whitelist", "blacklist", "invalid", null];
        args = [fuzzer.pick(listKeys), params];
    }

    const event = builder.fn(...args);

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
      target: "validateEventStructure",
      type: type,
      event: randomEvent
    };

    schemas.validateEventStructure(type, randomEvent);
  }
}

// Run for 5000 iterations
fuzzer.runFuzzLoop(5000, fuzzTest).catch(console.error);
