// Opt-in encrypted settings sync (todo #15): bitvid settings are published as
// NIP-78 (kind 30078) replaceable events, encrypted to the user's own key, read
// back newest-per-d-tag. These scenarios assert the observable boundary outcomes:
//   - a pushed secret round-trips through encrypt -> relay -> decrypt
//   - the secret is NEVER stored in cleartext on the relay (encryption is real)
//   - the NEWEST event wins (a stale device cannot clobber newer settings)
//   - clear() makes a subsequent pull report "no data" (cleared)
//   - NIP-04 is used when the signer lacks NIP-44
//
// Uses the REAL publishEventToRelays/summarizePublishResults so the publish
// boundary is exercised, with a faithful in-memory relay + a reversible fake
// signer (so "encryption" is observable but not identity passthrough).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createEncryptedSyncManager } from "../js/nostr/encryptedSync.js";
import {
  publishEventToRelays,
  summarizePublishResults,
} from "../js/nostrPublish.js";

const PUBKEY = "d".repeat(64);
const D_TAG = "bitvid:storage-connections";

// Reversible, non-identity "encryption": base64 so the plaintext secret is not a
// literal substring of the ciphertext. Tagged by scheme so we can prove which
// path (nip44 vs nip04) was used.
function makeSigner({ nip44 = true } = {}) {
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");
  const enc = (scheme) => async (_pk, text) => `${scheme}|${b64(text)}`;
  const dec = (scheme) => async (_pk, cipher) => {
    const [usedScheme, payload] = String(cipher).split("|");
    assert.equal(usedScheme, scheme, "decrypt scheme must match encrypt scheme");
    return unb64(payload);
  };
  const signer = {
    capabilities: { nip04: true, nip44 },
    nip04Encrypt: enc("nip04"),
    nip04Decrypt: dec("nip04"),
  };
  if (nip44) {
    signer.nip44Encrypt = enc("nip44");
    signer.nip44Decrypt = dec("nip44");
  }
  return signer;
}

function makeRelay() {
  const events = [];
  return {
    events,
    publish(_urls, event) {
      events.push(event);
      return Promise.resolve(); // thenable -> publishEventToRelay success path
    },
    async list(_relays, filters) {
      const f = filters[0];
      return events.filter(
        (e) =>
          f.kinds.includes(e.kind) &&
          f.authors.includes(e.pubkey) &&
          Array.isArray(e.tags) &&
          e.tags.some((t) => t[0] === "d" && f["#d"].includes(t[1])),
      );
    },
  };
}

function makeManager({ nip44 = true } = {}) {
  const relay = makeRelay();
  const clock = { ms: 1_700_000_000_000 };
  const signer = makeSigner({ nip44 });
  const manager = createEncryptedSyncManager({
    getActivePubkey: () => PUBKEY,
    getSigner: () => signer,
    getWriteRelays: () => ["wss://write.relay"],
    getReadRelays: () => ["wss://read.relay"],
    getPool: () => relay,
    listEvents: (relays, filters) => relay.list(relays, filters),
    publishEventToRelays,
    summarizePublishResults,
    signEvent: async (tpl) => ({
      ...tpl,
      id: `id-${tpl.created_at}-${relay.events.length}`,
      sig: "sig",
    }),
    now: () => clock.ms,
  });
  return { manager, relay, clock };
}

test("push -> pull round-trips a secret without ever storing it in cleartext", async () => {
  const { manager, relay } = makeManager();
  const secret = "SUPER-SECRET-R2-ACCESS-KEY-xyz";
  const payload = { accessKeyId: secret, bucket: "my-bucket" };

  const pushed = await manager.push(D_TAG, payload);
  assert.equal(pushed.ok, true, "push must succeed when a relay accepts");
  assert.ok(pushed.accepted >= 1);

  // Anti-cheat: the secret must NOT appear in cleartext anywhere on the relay.
  const stored = relay.events[0];
  assert.equal(stored.kind, 30078);
  assert.ok(
    !stored.content.includes(secret),
    "the raw secret must never be stored in cleartext on the relay",
  );
  assert.ok(
    !stored.content.includes("my-bucket"),
    "plaintext metadata (bucket) must be encrypted too",
  );

  const pulled = await manager.pull(D_TAG);
  assert.equal(pulled.found, true, "pull must find the pushed note");
  assert.deepEqual(
    pulled.payload,
    payload,
    "decrypted payload must match what was pushed",
  );
});

test("the NEWEST event wins — a stale copy cannot clobber newer settings", async () => {
  const { manager, relay, clock } = makeManager();

  await manager.push(D_TAG, { generation: "old", bucket: "old-bucket" });
  clock.ms += 120_000; // 2 minutes later
  await manager.push(D_TAG, { generation: "new", bucket: "new-bucket" });

  // Both events exist on the relay (replaceable selection happens on read).
  assert.equal(relay.events.length, 2, "both copies are present on the relay");

  const pulled = await manager.pull(D_TAG);
  assert.equal(pulled.found, true);
  assert.equal(
    pulled.payload.generation,
    "new",
    "pull must return the newest event's payload, not a stale one",
  );
});

test("clear() makes a subsequent pull report cleared / no data", async () => {
  const { manager, clock } = makeManager();
  await manager.push(D_TAG, { secret: "to-be-wiped" });

  clock.ms += 60_000;
  const cleared = await manager.clear(D_TAG);
  assert.equal(cleared.ok, true, "clear must publish successfully");

  const pulled = await manager.pull(D_TAG);
  assert.equal(pulled.found, false, "cleared settings must not be found");
  assert.equal(pulled.cleared, true, "pull must report the cleared marker");
});

test("falls back to NIP-04 when the signer lacks NIP-44", async () => {
  const { manager, relay } = makeManager({ nip44: false });
  const payload = { nwcUri: "nostr+walletconnect://deadbeef" };

  const pushed = await manager.push("bitvid:nwc", payload);
  assert.equal(pushed.ok, true);

  const envelope = JSON.parse(relay.events[0].content);
  assert.equal(envelope.alg, "nip04", "must record the nip04 scheme actually used");

  const pulled = await manager.pull("bitvid:nwc");
  assert.deepEqual(pulled.payload, payload);
});

test("isAvailable() is false without a signer or pubkey", async () => {
  const manager = createEncryptedSyncManager({
    getActivePubkey: () => "",
    getSigner: () => null,
  });
  assert.equal(manager.isAvailable(), false);
});
