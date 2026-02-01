import assert from "node:assert/strict";
import test from "node:test";

import { createNip07Adapter } from "../../js/nostr/adapters/nip07Adapter.js";
import { createNip46Adapter } from "../../js/nostr/adapters/nip46Adapter.js";
import { createNsecAdapter } from "../../js/nostr/adapters/nsecAdapter.js";
import { Nip46RpcClient } from "../../js/nostr/nip46Client.js";

const buildHex = (value) => value.repeat(64);

const buildEvent = (pubkey) => ({
  kind: 1,
  pubkey,
  created_at: 1,
  tags: [],
  content: "",
});

test("createNsecAdapter wires signing and cipher capabilities", async () => {
  const previousCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrTools = globalThis.NostrTools;
  const previousReady = globalThis.nostrToolsReady;

  const nostrTools = await import("nostr-tools");
  const canonicalTools = { ...nostrTools };

  try {
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = canonicalTools;
    globalThis.NostrTools = canonicalTools;
    globalThis.nostrToolsReady = Promise.resolve({
      ok: true,
      value: canonicalTools,
    });

    const privateKeyBytes = nostrTools.generateSecretKey();
    const privateKeyHex = nostrTools.utils.bytesToHex(privateKeyBytes);
    const pubkey = nostrTools.getPublicKey(privateKeyBytes);

    const signer = await createNsecAdapter({
      privateKey: privateKeyHex,
      pubkey,
    });

    assert.equal(signer.pubkey, pubkey);
    assert.equal(signer.canSign(), true, "signer should allow signing");
    assert.equal(signer.capabilities.nip04, true);
    assert.equal(signer.capabilities.nip44, true);
    assert.equal(typeof signer.nip04Encrypt, "function");
    assert.equal(typeof signer.nip44Encrypt, "function");

    const signed = await signer.signEvent(buildEvent(pubkey));
    assert.equal(typeof signed.id, "string");
    assert.equal(typeof signed.sig, "string");
  } finally {
    if (previousCanonical === undefined) {
      delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
    } else {
      globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = previousCanonical;
    }

    if (previousNostrTools === undefined) {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousNostrTools;
    }

    if (previousReady === undefined) {
      delete globalThis.nostrToolsReady;
    } else {
      globalThis.nostrToolsReady = previousReady;
    }
  }
});

test("createNip07Adapter maps extension methods and permissions", async () => {
  const originalWindow = globalThis.window;
  const pubkey = buildHex("a");
  let requestedPermissions = null;

  const extension = {
    getPublicKey: async () => pubkey.toUpperCase(),
    signEvent: async (event) => ({ ...event, id: "signed", sig: "sig" }),
    nip04: { encrypt: () => "cipher", decrypt: () => "plain" },
    nip44: {
      v2: {
        encrypt: () => "cipher44",
        decrypt: () => "plain44",
      },
    },
    requestPermissions: async ({ permissions }) => {
      requestedPermissions = permissions;
      return { ok: true };
    },
  };

  globalThis.window = { nostr: extension };

  try {
    const signer = await createNip07Adapter();

    assert.equal(signer.pubkey, pubkey);
    assert.equal(signer.capabilities.sign, true);
    assert.equal(signer.capabilities.nip44, true);
    assert.equal(signer.capabilities.nip04, true);
    assert.equal(typeof signer.nip44Encrypt, "function");

    const permissions = await signer.requestPermissions(["sign_event"]);
    assert.equal(permissions.ok, true);
    assert.deepEqual(requestedPermissions, ["sign_event"]);

    const signed = await signer.signEvent(buildEvent(pubkey));
    assert.equal(signed.id, "signed");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("createNip46Adapter wraps the remote signer client", async () => {
  const pubkey = buildHex("b");
  const mockClient = Object.create(Nip46RpcClient.prototype);
  let destroyed = false;

  Object.assign(mockClient, {
    userPubkey: "",
    getUserPubkey: async () => pubkey,
    metadata: { name: "Remote signer" },
    relays: ["wss://relay.example"],
    destroyed: false,
    signEvent: async (event) => ({ ...event, id: "remote", sig: "sig" }),
    destroy: () => {
      destroyed = true;
      mockClient.destroyed = true;
    },
    nip04Encrypt: async () => "cipher",
    nip04Decrypt: async () => "plain",
    nip44Encrypt: async () => "cipher44",
    nip44Decrypt: async () => "plain44",
  });

  const signer = await createNip46Adapter(mockClient);

  assert.equal(signer.pubkey, pubkey);
  assert.equal(signer.capabilities.sign, true);
  assert.equal(signer.capabilities.nip04, true);
  assert.equal(signer.capabilities.nip44, true);

  const signed = await signer.signEvent(buildEvent(pubkey));
  assert.equal(signed.id, "remote");

  await signer.destroy();
  assert.equal(destroyed, true);
});
