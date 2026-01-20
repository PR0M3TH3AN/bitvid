import test from "node:test";
import assert from "node:assert/strict";

const {
  setActiveSigner,
  resolveActiveSigner,
  clearActiveSigner,
<<<<<<< HEAD
} = await import("../../js/nostr/client.js");
=======
} = await import("../../js/nostr.js");
>>>>>>> origin/main

test("setActiveSigner hydrates extension capabilities from window.nostr", async () => {
  clearActiveSigner();
  const originalWindow = globalThis.window;
  const signEvent = async (event) => ({ ...event, id: "signed", sig: "sig" });
  const extension = {
    signEvent,
    nip04: { encrypt: () => "cipher", decrypt: () => "plain" },
    nip44: { encrypt: () => "cipher44", decrypt: () => "plain44" },
  };
  globalThis.window = { nostr: extension };

  try {
    setActiveSigner({ type: "extension", pubkey: "deadbeef" });
    const signer = resolveActiveSigner("deadbeef");
    assert.ok(signer, "signer should be returned");
    assert.equal(typeof signer.signEvent, "function", "signEvent should be hydrated");
    const result = await signer.signEvent({ pubkey: "deadbeef", kind: 1, content: "" });
    assert.equal(result.id, "signed", "hydrated signEvent should be used");
    assert.equal(typeof signer.nip04Encrypt, "function", "nip04 alias should be attached");
    assert.equal(typeof signer.nip44Encrypt, "function", "nip44 alias should be attached");
  } finally {
    clearActiveSigner();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
