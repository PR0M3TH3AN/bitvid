
import fs from "fs";
import path from "path";
import { runFuzzer, rng } from "./fuzz-shared.mjs";

const originalPath = "../../js/dmDecryptor.js";
const tempPath = "./temp_dmDecryptor.mjs";

// Read original file
const originalContent = fs.readFileSync(new URL(originalPath, import.meta.url), "utf-8");

// Replace import
// The original file has: import { normalizeActorKey } from "./nostr/watchHistory.js";
// We want to point to ./mocks/watchHistory.js
const patchedContent = originalContent.replace(
  /import \{ normalizeActorKey \} from "\.\/nostr\/watchHistory\.js";/,
  'import { normalizeActorKey } from "./mocks/watchHistory.js";'
);

// Write temp file
fs.writeFileSync(new URL(tempPath, import.meta.url), patchedContent);

// Import the patched module
const DmDecryptor = await import(tempPath);

async function fuzzTest(iteration) {
  const genEvent = () => {
    const tags = rng.array(() => rng.array(() => rng.mixedString(20), 5), 5);
    if (rng.bool()) {
        // Circular tag structure
        const circularTag = ["p"];
        circularTag.push(circularTag); // Circular reference
        tags.push(circularTag);
    }
    return {
      kind: rng.oneOf([4, 1059, rng.int(0, 20000)]),
      pubkey: rng.mixedString(64),
      created_at: rng.int(0, 2000000000),
      content: rng.mixedString(100),
      tags
    };
  };

  const genDecryptor = () => {
    return {
       scheme: rng.oneOf(["nip04", "nip44", "nip44_v2", rng.mixedString(10)]),
       decrypt: async (pubkey, ciphertext) => {
           if (rng.bool()) {
               throw new Error("Decryption failed " + rng.mixedString(10));
           }
           // Return either a string (valid) or garbage
           if (rng.bool()) {
               return JSON.stringify({ content: "decrypted message" });
           }
           return rng.nastyString();
       }
    };
  };

  const event = rng.bool() ? genEvent() : rng.nastyString();
  const context = {
    actorPubkey: rng.mixedString(64),
    decryptors: rng.array(genDecryptor, 3)
  };

  // Run the target
  await DmDecryptor.decryptDM(event, context);

  return { event, context };
}

runFuzzer("dmDecryptor", 5000, fuzzTest)
  .catch(err => {
    console.error("Fatal fuzzer error:", err);
    process.exit(1);
  })
  .finally(() => {
    // Cleanup
    if (fs.existsSync(new URL(tempPath, import.meta.url))) {
      fs.unlinkSync(new URL(tempPath, import.meta.url));
    }
  });
