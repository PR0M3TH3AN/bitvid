import test from "node:test";
import assert from "node:assert/strict";
import * as nostrTools from "nostr-tools";

import { accessControl } from "../js/accessControl.js";

// Bug: a genuinely whitelisted author was blocked at playback because canAccess
// checks the hex set when given hex and the npub set when given an npub, without
// cross-deriving. If an entry lands in only one representation (e.g. hex decode
// hadn't run when the list loaded), querying in the other format read as "not
// allowed". The fix cross-derives both forms and checks both sets.

// canAccess resolves NostrTools from window/globalThis for the cross-derive.
const priorTools = globalThis.NostrTools;
globalThis.NostrTools = { nip19: nostrTools.nip19 };

const sk = nostrTools.generateSecretKey();
const HEX = nostrTools.getPublicKey(sk);
const NPUB = nostrTools.nip19.npubEncode(HEX);

const otherSk = nostrTools.generateSecretKey();
const OTHER_HEX = nostrTools.getPublicKey(otherSk);
const OTHER_NPUB = nostrTools.nip19.npubEncode(OTHER_HEX);

function seed({ whitelist = [], whitelistHex = [] } = {}) {
  accessControl.whitelistEnabled = true;
  accessControl.whitelist = new Set(whitelist);
  accessControl.whitelistPubkeys = new Set(whitelistHex);
  accessControl.blacklist = new Set();
  accessControl.blacklistPubkeys = new Set();
  accessControl.editors = new Set(); // ensure the author isn't treated as admin
}

test.after(() => {
  globalThis.NostrTools = priorTools;
});

test("whitelisted by HEX only is recognized when queried by npub (cross-derive)", () => {
  seed({ whitelistHex: [HEX] }); // npub set deliberately empty
  assert.equal(accessControl.canAccess(NPUB), true, "npub query finds the hex-set author");
  assert.equal(accessControl.canAccess(HEX), true, "hex query still works");
});

test("whitelisted by NPUB only is recognized when queried by hex (cross-derive)", () => {
  seed({ whitelist: [NPUB] }); // hex set deliberately empty
  assert.equal(accessControl.canAccess(HEX), true, "hex query finds the npub-set author");
  assert.equal(accessControl.canAccess(NPUB), true, "npub query still works");
});

test("a non-whitelisted author is still denied in both formats (no over-allow)", () => {
  seed({ whitelist: [NPUB], whitelistHex: [HEX] });
  assert.equal(accessControl.canAccess(OTHER_NPUB), false);
  assert.equal(accessControl.canAccess(OTHER_HEX), false);
});

test("with whitelist mode OFF, any author is allowed regardless of sets", () => {
  seed({});
  accessControl.whitelistEnabled = false;
  assert.equal(accessControl.canAccess(OTHER_NPUB), true);
  assert.equal(accessControl.canAccess(OTHER_HEX), true);
});
