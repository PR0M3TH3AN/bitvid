import test from "node:test";
import assert from "node:assert/strict";
import * as nostrTools from "nostr-tools";

import { validateNpubHex } from "../js/utils/validateNpub.js";

// Use the real nostr-tools nip19 so we exercise actual bech32 decoding, not a
// mirror of the implementation. Generate a real key pair for the happy path.
const nip19 = nostrTools.nip19;
const secret = nostrTools.generateSecretKey();
const hex = nostrTools.getPublicKey(secret);
const npub = nip19.npubEncode(hex);

test("accepts a well-formed npub and returns its lowercase hex pubkey", () => {
  const result = validateNpubHex(npub, { nip19 });
  assert.equal(result, hex);
  assert.match(result, /^[0-9a-f]{64}$/);
});

test("tolerates surrounding whitespace", () => {
  assert.equal(validateNpubHex(`  ${npub}\n`, { nip19 }), hex);
});

test("rejects free-text spam that is not an npub", () => {
  for (const junk of [
    "",
    "   ",
    "hello world",
    "spammer@example.com",
    "not-an-npub",
    npub.replace("npub1", "note1"), // wrong NIP-19 prefix
  ]) {
    assert.equal(validateNpubHex(junk, { nip19 }), null, `should reject: ${junk}`);
  }
});

test("rejects an npub with a corrupted checksum", () => {
  // Flip the last character — the bech32 checksum no longer validates.
  const tampered = npub.slice(0, -1) + (npub.endsWith("q") ? "p" : "q");
  assert.equal(validateNpubHex(tampered, { nip19 }), null);
});

test("rejects a wrong NIP-19 entity (nprofile) even though it decodes", () => {
  const nprofile = nip19.nprofileEncode({ pubkey: hex, relays: [] });
  assert.equal(validateNpubHex(nprofile, { nip19 }), null);
});

test("rejects non-string input", () => {
  for (const value of [null, undefined, 42, {}, [], true]) {
    assert.equal(validateNpubHex(value, { nip19 }), null);
  }
});

test("returns null (instead of throwing) when no decoder is available", () => {
  assert.equal(validateNpubHex(npub, { nip19: null }), null);
});
