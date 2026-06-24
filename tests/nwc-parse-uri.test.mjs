// Real-tools regression test for the NWC URI parse fix. Unlike nwc-client.test.mjs
// (which mocks nostr-tools and is currently shadowed by the frozen canonical
// toolkit the bootstrap installs), this runs against the real nostr-tools — which
// is exactly the environment the production bug occurs in.
import test from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const { __TESTING__ } = await import("../js/payments/nwcClient.js");
const { parseNwcUri } = __TESTING__;

test("parseNwcUri derives clientPubkey from a hex secret without throwing", () => {
  // Regression (#3 NWC): nostr-tools >= 2.x getPublicKey requires a Uint8Array,
  // not a hex string. parseNwcUri passed the hex secret directly, so it threw
  // "expected Uint8Array, got type=string" and NWC wallet connection failed
  // entirely (the only zap payment path). The fix converts hex -> bytes.
  const walletPubkey = "b".repeat(64);
  const secretKey = "a".repeat(64); // a valid secp256k1 scalar (0 < k < n)
  const relay = "wss://relay.example";
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent(relay)}` +
    `&secret=${secretKey}`;

  const parsed = parseNwcUri(uri);

  assert.equal(parsed.secretKey, secretKey);
  assert.equal(parsed.walletPubkey, walletPubkey);
  assert.deepEqual(parsed.relays, [relay]);
  assert.match(
    parsed.clientPubkey,
    /^[0-9a-f]{64}$/,
    "clientPubkey must be derived as 64-char hex (getPublicKey accepted the secret)",
  );
});

test("parseNwcUri rejects a non-hex / wrong-length secret", () => {
  const walletPubkey = "b".repeat(64);
  const uri =
    `nostr+walletconnect://${walletPubkey}` +
    `?relay=${encodeURIComponent("wss://relay.example")}` +
    `&secret=not-a-valid-secret`;
  assert.throws(() => parseNwcUri(uri), /secret must be a 64 character hex string/i);
});
