
import { decryptDM } from "../js/dmDecryptor.js";

// Valid 64-char hex strings
const WRAP_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const SEAL_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000002";
const SENDER_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000003";
const RECIPIENT_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000004";

const sealEvent = {
  id: "seal-event",
  pubkey: SEAL_PUBKEY,
  content: "seal-ciphertext",
  created_at: Math.floor(Date.now() / 1000),
};

const rumorEvent = {
  id: "rumor-event",
  pubkey: SENDER_PUBKEY,
  content: "Hello World",
  created_at: Math.floor(Date.now() / 1000),
  tags: [["p", RECIPIENT_PUBKEY]],
};

const wrapEvent = {
  kind: 1059,
  pubkey: WRAP_PUBKEY,
  content: "wrap-ciphertext",
  created_at: Math.floor(Date.now() / 1000),
  tags: [["p", RECIPIENT_PUBKEY]],
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createDecryptor = (name, shouldFail, delayMs) => {
  return {
    scheme: "nip44",
    supportsGiftWrap: true,
    decrypt: async (pubkey, ciphertext, context) => {
      await delay(delayMs);
      if (shouldFail) {
        throw new Error(`${name} failed`);
      }

      // If we are unwrapping the outer wrap, return the seal
      if (context.stage === "wrap") {
        return JSON.stringify(sealEvent);
      }
      // If we are unwrapping the seal, return the rumor
      if (context.stage === "seal") {
        return JSON.stringify(rumorEvent);
      }

      return "";
    },
  };
};

async function runBenchmark() {
  console.log("Running DM Decrypt Benchmark...");

  const decryptors = [
    createDecryptor("D1", true, 100),
    createDecryptor("D2", true, 100),
    createDecryptor("D3", false, 50),
  ];

  const context = {
    actorPubkey: RECIPIENT_PUBKEY,
    decryptors: decryptors,
  };

  const start = performance.now();
  const result = await decryptDM(wrapEvent, context);
  const end = performance.now();

  console.log(`Result OK: ${result.ok}`);
  if (!result.ok) {
    const errorMessages = result.errors.map(e => ({stage: e.stage, message: e.error.message}));
    console.log("Errors:", JSON.stringify(errorMessages, null, 2));
  }
  console.log(`Time taken: ${(end - start).toFixed(2)}ms`);
}

runBenchmark();
