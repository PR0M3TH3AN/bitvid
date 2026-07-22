import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  providers,
  providersForModal,
} from "../js/services/authProviders/index.js";
import bitloginProvider, {
  setPendingBitloginResult,
} from "../js/services/authProviders/bitlogin.js";
import { createBitloginAdapter } from "../js/nostr/adapters/bitloginAdapter.js";
import { accessControl } from "../js/accessControl.js";

const HEX_PUBKEY = "a".repeat(64);

describe("BitLogin auth provider", () => {
  const originalCanAccess = accessControl.canAccess;
  const originalIsBlacklisted = accessControl.isBlacklisted;

  afterEach(() => {
    setPendingBitloginResult(null);
    accessControl.canAccess = originalCanAccess;
    accessControl.isBlacklisted = originalIsBlacklisted;
  });

  it("registers in the resolvable provider registry but not the modal grid", () => {
    // AuthService.resolveAuthProvider() must be able to find "bitlogin" ...
    assert.equal(providers.bitlogin, bitloginProvider);
    // ... but the login modal's grid (LoginModalController) must never render
    // a redundant button for it -- BitLogin gets its own permanent widget in
    // components/login-modal.html instead.
    assert.equal(providersForModal.bitlogin, undefined);
    assert.equal(providersForModal.nip07, providers.nip07);
  });

  it("refuses to log in before the widget has actually produced a pubkey", async () => {
    accessControl.canAccess = () => true;
    setPendingBitloginResult(null);

    await assert.rejects(
      () => bitloginProvider.login({ nostrClient: {} }),
      /hasn't completed yet/i,
    );
  });

  it("activates the signer and resolves once the widget's result is pending", async () => {
    accessControl.canAccess = () => true;
    let activated = null;
    const fakeSigner = { type: "bitlogin", pubkey: HEX_PUBKEY };
    const fakeNostrClient = {
      signerManager: {
        setActiveSigner: (signer) => {
          activated = signer;
        },
      },
    };

    setPendingBitloginResult({ pubkey: HEX_PUBKEY, signer: fakeSigner });

    const result = await bitloginProvider.login({ nostrClient: fakeNostrClient });

    assert.equal(result.authType, "bitlogin");
    assert.equal(result.pubkey, HEX_PUBKEY);
    assert.equal(result.signer, fakeSigner);
    assert.equal(activated, fakeSigner);
  });

  it("consumes the pending result exactly once (no replay across calls)", async () => {
    accessControl.canAccess = () => true;
    const fakeNostrClient = { signerManager: { setActiveSigner: () => {} } };
    setPendingBitloginResult({ pubkey: HEX_PUBKEY, signer: {} });

    await bitloginProvider.login({ nostrClient: fakeNostrClient });

    await assert.rejects(
      () => bitloginProvider.login({ nostrClient: fakeNostrClient }),
      /hasn't completed yet/i,
    );
  });

  it("never activates a signer for a blacklisted pubkey", async () => {
    accessControl.canAccess = () => false;
    accessControl.isBlacklisted = () => true;
    let activated = null;
    const fakeNostrClient = {
      signerManager: {
        setActiveSigner: (signer) => {
          activated = signer;
        },
      },
    };

    setPendingBitloginResult({ pubkey: HEX_PUBKEY, signer: { type: "bitlogin" } });

    await assert.rejects(
      () => bitloginProvider.login({ nostrClient: fakeNostrClient }),
      /blocked/i,
    );
    assert.equal(activated, null);
  });
});

describe("createBitloginAdapter", () => {
  it("delegates signing and NIP-44/NIP-04 calls to the live widget element, never window.nostr", async () => {
    const calls = [];
    const fakeWidget = {
      signEvent: async (event) => {
        calls.push(["signEvent", event]);
        return { ...event, id: "signed" };
      },
      nip44Encrypt: async (peer, plaintext) => {
        calls.push(["nip44Encrypt", peer, plaintext]);
        return "ciphertext";
      },
      nip44Decrypt: async (peer, payload) => {
        calls.push(["nip44Decrypt", peer, payload]);
        return "plaintext";
      },
      nip04Encrypt: async (peer, plaintext) => {
        calls.push(["nip04Encrypt", peer, plaintext]);
        return "legacy-ciphertext";
      },
      nip04Decrypt: async (peer, payload) => {
        calls.push(["nip04Decrypt", peer, payload]);
        return "legacy-plaintext";
      },
      logout: async () => {
        calls.push(["logout"]);
      },
    };

    const adapter = createBitloginAdapter(fakeWidget, HEX_PUBKEY);

    assert.equal(adapter.type, "bitlogin");
    assert.equal(adapter.pubkey, HEX_PUBKEY);
    assert.equal(adapter.canSign(), true);
    // NIP-04 is real, load-bearing capability info: js/nostr/client.js only offers a
    // nip04Encrypt/Decrypt code path to callers when signerCapabilities.nip04 is true.
    assert.deepEqual(adapter.capabilities, { sign: true, nip44: true, nip04: true });

    const signed = await adapter.signEvent({ kind: 1, content: "hi" });
    assert.equal(signed.id, "signed");

    await adapter.nip44Encrypt("peer-pubkey", "hello");
    await adapter.nip44Decrypt("peer-pubkey", "ciphertext");
    await adapter.nip04Encrypt("peer-pubkey", "hello");
    await adapter.nip04Decrypt("peer-pubkey", "legacy-ciphertext");
    await adapter.destroy();

    assert.deepEqual(calls, [
      ["signEvent", { kind: 1, content: "hi" }],
      ["nip44Encrypt", "peer-pubkey", "hello"],
      ["nip44Decrypt", "peer-pubkey", "ciphertext"],
      ["nip04Encrypt", "peer-pubkey", "hello"],
      ["nip04Decrypt", "peer-pubkey", "legacy-ciphertext"],
      ["logout"],
    ]);
  });
});
