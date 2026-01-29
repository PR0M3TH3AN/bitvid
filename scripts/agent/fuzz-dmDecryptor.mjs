import "./setup-test-env.js";
import { Fuzzer } from "./fuzz-lib.mjs";
import { decryptDM } from "../../js/dmDecryptor.js";

const fuzzer = new Fuzzer("dmDecryptor");

class MockDecryptor {
  constructor(scheme, shouldFail = false) {
    this.scheme = scheme;
    this.shouldFail = shouldFail;
    this.supportsGiftWrap = scheme === "nip44" || scheme === "nip44_v2";
  }

  async decrypt(pubkey, ciphertext) {
    if (this.shouldFail) {
      throw new Error("Decryption failed (mock)");
    }
    // Return something that might be JSON or might be garbage
    if (fuzzer.randBool()) {
        // Return valid JSON event string (inner rumor)
        return JSON.stringify({
            kind: 1,
            content: "Hello world " + fuzzer.randString(10),
            pubkey: fuzzer.randString(64, "0123456789abcdef"),
            created_at: Math.floor(Date.now() / 1000),
            tags: []
        });
    } else {
        // Return garbage string
        return fuzzer.randString(50);
    }
  }
}

async function fuzzTest(fuzzer, state) {
  const schemes = ["nip04", "nip44", "nip44_v2", "unknown", null];

  // Create decryptors
  const decryptors = [];
  const numDecryptors = fuzzer.randInt(0, 3);
  for(let i=0; i<numDecryptors; i++) {
      const scheme = fuzzer.pick(schemes);
      decryptors.push(new MockDecryptor(scheme, fuzzer.randBool()));
  }

  // Create event
  // kinds: 4 (legacy), 1059 (gift wrap), random
  const kinds = [4, 1059, fuzzer.randInt(0, 20000)];
  const kind = fuzzer.pick(kinds);

  const event = {
      kind: kind,
      pubkey: fuzzer.randString(64, "0123456789abcdef"),
      content: fuzzer.randString(100), // ciphertext
      created_at: Math.floor(Date.now() / 1000),
      tags: []
  };

  // Add random tags
  const numTags = fuzzer.randInt(0, 5);
  for(let i=0; i<numTags; i++) {
      event.tags.push(fuzzer.randArray(() => fuzzer.randString(10), 1, 4));
  }

  // Context
  const context = {
      actorPubkey: fuzzer.randString(64, "0123456789abcdef"),
      decryptors: decryptors
  };

  state.input = {
      event,
      context
  };

  try {
      await decryptDM(event, context);
  } catch (err) {
      // We expect decryptDM to handle errors gracefully and return { ok: false, errors: ... }
      // If it throws, it's a bug (except maybe argument validation if we pass null event)
      throw err;
  }
}

fuzzer.runFuzzLoop(5000, fuzzTest).catch(console.error);
