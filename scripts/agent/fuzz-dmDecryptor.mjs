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
import { decryptDM } from "../../js/dmDecryptor.js";

function genEvent() {
  const kind = Math.random() < 0.8 ? (Math.random() < 0.5 ? 4 : 1059) : randomInt(0, 20000);
  const tags = randomArray(() => {
    const tagName = Math.random() < 0.5 ? "p" : (Math.random() < 0.5 ? "encrypted" : randomString(5));
    return [tagName, randomString(20), randomString(10)];
  }, 0, 10);

  return {
    kind,
    pubkey: randomHex(64),
    created_at: randomInt(0, 2000000000),
    tags,
    content: randomString(randomInt(0, 500)),
  };
}

function mockDecryptor(behavior) {
  return {
    scheme: Math.random() < 0.5 ? "nip44" : "nip04",
    decrypt: async (pubkey, ciphertext) => {
      if (behavior === "fail") {
        throw new Error("Decryption failed");
      }
      if (behavior === "invalid") {
        return 123; // Invalid return type
      }
      if (behavior === "empty") {
        return "";
      }
      if (behavior === "garbage") {
        return randomString(100); // Not JSON
      }
      // Success
      const innerEvent = {
        kind: randomInt(0, 20000),
        pubkey: randomHex(64),
        created_at: randomInt(0, 2000000000),
        content: randomString(50),
        tags: [],
      };
      return JSON.stringify(innerEvent);
    },
    supportsGiftWrap: Math.random() < 0.7,
  };
}

function genDecryptors() {
  const count = randomInt(0, 5);
  const decryptors = [];
  for (let i = 0; i < count; i++) {
    const behaviors = ["success", "fail", "invalid", "empty", "garbage"];
    const behavior = behaviors[randomInt(0, behaviors.length - 1)];
    decryptors.push(mockDecryptor(behavior));
  }
  // Sometimes add invalid decryptor objects
  if (Math.random() < 0.2) {
    decryptors.push(null);
    decryptors.push({});
    decryptors.push({ decrypt: "not a function" });
  }
  return decryptors;
}

function genContext() {
  return {
    actorPubkey: randomHex(64),
    decryptors: genDecryptors(),
  };
}

function genArgs() {
  return [genEvent(), genContext()];
}

async function main() {
  await runFuzzer("decryptDM", decryptDM, genArgs);
}

main().catch(console.error);
