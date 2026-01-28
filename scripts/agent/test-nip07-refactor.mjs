import './setup-test-env.js';
import { NostrClient, getActiveSigner } from '../../js/nostr/client.js';
// import { userLogger, devLogger } from '../../js/utils/logger.js';

// Polyfill window.nostr
const mockPubkey = "0000000000000000000000000000000000000000000000000000000000000001";
const mockNostr = {
  getPublicKey: async () => mockPubkey,
  signEvent: async (e) => {
    e.sig = "mock-sig";
    e.id = "mock-id";
    return e;
  },
  nip04: {
    encrypt: async () => "mock-ciphertext",
    decrypt: async () => "mock-plaintext"
  }
};

global.window.nostr = mockNostr;

async function run() {
  console.log("Starting NIP-07 Refactor Verification...");

  const client = new NostrClient();
  // Skip client.init() to avoid network/relay connection attempts in this isolated test
  // await client.init();

  console.log("Testing loginWithExtension...");
  try {
    const result = await client.loginWithExtension();
    console.log("Login returned:", { pubkey: result.pubkey, hasSigner: !!result.signer });

    if (result.pubkey !== mockPubkey) {
      throw new Error(`Pubkey mismatch: expected ${mockPubkey}, got ${result.pubkey}`);
    }

    const activeSigner = getActiveSigner();
    if (!activeSigner) {
      throw new Error("Active signer was not set!");
    }

    if (activeSigner.pubkey !== mockPubkey) {
        throw new Error(`Active signer pubkey mismatch: ${activeSigner.pubkey}`);
    }

    console.log("Testing validator failure...");
    try {
      await client.loginWithExtension({
        validator: async () => false // should fail
      });
      console.error("Validator failure test FAILED: Should have thrown error");
      process.exit(1);
    } catch (error) {
      if (error.message.includes("Access denied")) {
        console.log("Validator failure test SUCCESS!");
      } else {
        console.error("Validator failure test FAILED: Wrong error", error);
        process.exit(1);
      }
    }

    console.log("Verification SUCCESS!");
  } catch (error) {
    console.error("Verification FAILED:", error);
    process.exit(1);
  }
}

run();
