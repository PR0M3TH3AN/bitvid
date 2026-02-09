
import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { NostrClient, setActiveSigner, getActiveSigner } from "../js/nostr/client.js";

const HEX_PUBKEY = "a".repeat(64);

test("ensureActiveSignerForPubkey prefers concurrent login over late extension injection", async () => {
  // 1. Setup Environment
  const originalWindow = global.window;
  global.window = {};

  try {
    const client = new NostrClient();
    client.pubkey = HEX_PUBKEY;
    // Pre-condition: Cache permissions to trigger the waitForNip07Extension logic
    client.extensionPermissionCache.add("sign_event");

    // Mock a NIP-46 signer that might be set during the race
    const mockNip46Signer = {
      type: "nip46",
      pubkey: HEX_PUBKEY,
      signEvent: async () => ({ id: "mock-signed" }),
      nip04: { encrypt: async () => "enc", decrypt: async () => "dec" }
    };

    // Mock the NIP-07 extension that appears late
    const mockExtension = {
      getPublicKey: async () => HEX_PUBKEY,
      signEvent: async () => ({ id: "ext-signed" }),
      nip04: { encrypt: async () => "ext-enc", decrypt: async () => "ext-dec" }
    };

    // 2. Start the race
    // Calling ensureActiveSignerForPubkey while window.nostr is missing but permissions exist
    // causes it to enter waitForNip07Extension loop (polling).
    const ensurePromise = client.ensureActiveSignerForPubkey(HEX_PUBKEY);

    // 3. Simulate Concurrent Login (e.g. NIP-46 restore completes)
    // We wait a small amount to ensure ensureActiveSignerForPubkey has started polling
    await new Promise(resolve => setTimeout(resolve, 50));

    setActiveSigner(mockNip46Signer);

    // 4. Simulate Extension Loading late
    global.window.nostr = mockExtension;

    // 5. Await result
    const resultSigner = await ensurePromise;

    // 6. Assertions
    const finalActiveSigner = getActiveSigner();

    // We expect the NIP-46 signer to be preserved and not overwritten by the NIP-07 fallback
    assert.equal(finalActiveSigner.type, "nip46", "Race condition! NIP-46 signer was overwritten by NIP-07 fallback.");
    assert.equal(resultSigner.type, "nip46", "Returned signer should be the NIP-46 one.");
  } finally {
    if (originalWindow) {
      global.window = originalWindow;
    } else {
      delete global.window;
    }
  }
});
