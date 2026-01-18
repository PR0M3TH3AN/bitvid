import assert from "node:assert/strict";
import test from "node:test";

import {
  registerSigner,
  setActiveSigner,
  resolveActiveSigner,
  onActiveSignerChanged,
  clearActiveSigner,
} from "../../js/nostrClientRegistry.js";

const buildHex = (value) => value.repeat(64);

test("registerSigner stores and resolves signer entries", () => {
  const pubkey = buildHex("c");
  const signer = { pubkey };

  registerSigner(pubkey, signer, { permissions: ["sign_event"] });

  assert.equal(resolveActiveSigner(pubkey), signer);

  registerSigner(pubkey, null);
  assert.equal(resolveActiveSigner(pubkey), null);
});

test("setActiveSigner notifies listeners and resolves by pubkey", () => {
  const pubkey = buildHex("d");
  const signer = { pubkey };
  const events = [];
  let enabled = true;

  onActiveSignerChanged((payload) => {
    if (!enabled) {
      return;
    }
    events.push(payload);
  });

  registerSigner(pubkey, signer);
  const resolved = setActiveSigner(pubkey);

  assert.equal(resolved, signer);
  assert.equal(resolveActiveSigner(pubkey), signer);
  assert.equal(events.length, 1);
  assert.equal(events[0].pubkey, pubkey);
  assert.equal(events[0].previousSigner, null);

  enabled = false;
  clearActiveSigner();
  registerSigner(pubkey, null);
});
