
import { decryptDM } from "../../js/dmDecryptor.js";
import { runFuzzer, randomString, randomInt, randomJSON, randomHex, randomBoolean, randomItem } from "./fuzz-shared.mjs";

async function fuzzDmDecryptor(iteration) {
  const schemes = ["nip04", "nip44", "nip44_v2", randomString(5)];

  const mockDecryptor = (scheme) => ({
    scheme,
    decrypt: async (pubkey, ciphertext, options) => {
      // Simulate random failures
      if (Math.random() < 0.1) throw new Error("Decryption failed");

      // Simulate random return values
      const type = randomInt(0, 3);
      if (type === 0) return randomString(20);
      if (type === 1) return JSON.stringify(randomJSON(2, 2)); // Return JSON string
      if (type === 2) return ""; // Empty string
      if (type === 3) return ciphertext; // Echo
    },
    source: "mock-fuzzer",
    priority: randomInt(0, 10),
    supportsGiftWrap: scheme.startsWith("nip44")
  });

  const decryptors = [];
  const numDecryptors = randomInt(0, 3);
  for (let i = 0; i < numDecryptors; i++) {
    decryptors.push(mockDecryptor(randomItem(schemes)));
  }

  const event = {
    kind: randomItem([4, 1059, randomInt(0, 20000)]),
    pubkey: randomHex(64),
    created_at: randomInt(1000000000, 2000000000),
    tags: randomJSON(2, 3), // Tags can be anything in fuzzing
    content: randomString(100)
  };

  // Sometimes provide malformed event
  if (Math.random() < 0.05) {
    event.kind = "string";
  }
  if (Math.random() < 0.05) {
    event.tags = "string";
  }

  const context = {
    actorPubkey: randomHex(64),
    decryptors
  };

  const input = {
    event,
    context
  };

  await decryptDM(event, context);

  return input;
}

runFuzzer("dmDecryptor", fuzzDmDecryptor, 5000);
