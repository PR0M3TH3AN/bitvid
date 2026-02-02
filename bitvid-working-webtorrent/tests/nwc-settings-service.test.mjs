import test from "node:test";
import assert from "node:assert/strict";

import NwcSettingsService from "../js/services/nwcSettingsService.js";

const DEFAULT_SETTINGS = {
  nwcUri: "",
  defaultZap: null,
  lastChecked: null,
  version: "",
};

function createService({ saved = new Map(), activeRef }) {
  const service = new NwcSettingsService({
    normalizeHexPubkey: (value) => (typeof value === "string" ? value : null),
    getActivePubkey: () => activeRef.value,
    loadSettings: async (pubkey) => saved.get(pubkey),
    saveSettings: async (pubkey, partial = {}) => {
      const current = saved.get(pubkey) || {};
      const next = { ...current, ...partial };
      saved.set(pubkey, next);
      return next;
    },
    clearSettings: async (pubkey) => {
      saved.delete(pubkey);
    },
    createDefaultSettings: () => ({ ...DEFAULT_SETTINGS }),
  });
  return service;
}

test("nwc settings service preserves settings across profile switches", async () => {
  const saved = new Map([
    ["pub1", { nwcUri: "nostr+walletconnect://pub1?relay=wss://one" }],
    ["pub2", { nwcUri: "nostr+walletconnect://pub2?relay=wss://two" }],
  ]);
  const activeRef = { value: null };
  const service = createService({ saved, activeRef });

  activeRef.value = "pub1";
  await service.onLogin({ pubkey: "pub1", identityChanged: true });
  const first = service.getActiveNwcSettings();
  assert.equal(first.nwcUri, "nostr+walletconnect://pub1?relay=wss://one");

  activeRef.value = "pub2";
  await service.onLogin({
    pubkey: "pub2",
    previousPubkey: "pub1",
    identityChanged: true,
  });
  const second = service.getActiveNwcSettings();
  assert.equal(second.nwcUri, "nostr+walletconnect://pub2?relay=wss://two");

  assert.equal(saved.has("pub1"), true, "previous profile data should stay persisted");
  assert.equal(service.cache.has("pub1"), true, "previous profile should remain cached");

  activeRef.value = "pub1";
  await service.onLogin({
    pubkey: "pub1",
    previousPubkey: "pub2",
    identityChanged: true,
  });
  const roundTrip = service.getActiveNwcSettings();
  assert.equal(roundTrip.nwcUri, "nostr+walletconnect://pub1?relay=wss://one");

  roundTrip.nwcUri = "mutated";
  const unchanged = service.getActiveNwcSettings();
  assert.equal(
    unchanged.nwcUri,
    "nostr+walletconnect://pub1?relay=wss://one",
    "mutating returned settings should not affect cached data",
  );

  activeRef.value = "pub2";
  await service.onLogout({ pubkey: "pub2" });
  assert.equal(saved.has("pub2"), true, "logout should not clear persisted settings");
  assert.equal(service.cache.has("pub2"), false, "logout should drop cached entry for account");
});

test("updateActiveNwcSettings returns cloned values", async () => {
  const saved = new Map();
  const activeRef = { value: "pub3" };
  const service = createService({ saved, activeRef });

  const updated = await service.updateActiveNwcSettings({
    nwcUri: "nostr+walletconnect://pub3?relay=wss://three",
    defaultZap: 777,
  });

  assert.equal(updated.nwcUri, "nostr+walletconnect://pub3?relay=wss://three");
  assert.equal(updated.defaultZap, 777);

  updated.nwcUri = "mutated";
  const cached = service.getActiveNwcSettings();
  assert.equal(cached.nwcUri, "nostr+walletconnect://pub3?relay=wss://three");
  assert.equal(saved.get("pub3").nwcUri, "nostr+walletconnect://pub3?relay=wss://three");
});
