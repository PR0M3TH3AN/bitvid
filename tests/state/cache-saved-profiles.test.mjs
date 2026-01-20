<<<<<<< HEAD
import "../test-helpers/setup-localstorage.mjs";
=======
>>>>>>> origin/main
import test from "node:test";
import assert from "node:assert/strict";

import {
  setSavedProfiles,
  persistSavedProfiles,
  loadSavedProfilesFromStorage,
  mutateSavedProfiles,
  setActiveProfilePubkey,
} from "../../js/state/cache.js";

const STORAGE_KEY = "bitvid:savedProfiles:v1";
const SAMPLE_PUBKEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function resetSavedProfilesState() {
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }

  mutateSavedProfiles(() => [], { persist: false, persistActive: false });
  setActiveProfilePubkey(null, { persist: false });

  loadSavedProfilesFromStorage();

  mutateSavedProfiles(() => [], { persist: false, persistActive: false });
  setActiveProfilePubkey(null, { persist: false });

  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
}

test("persistSavedProfiles preserves custom authType strings", () => {
  resetSavedProfilesState();

  setSavedProfiles(
    [
      {
        pubkey: SAMPLE_PUBKEY,
        npub: null,
        name: "",
        picture: "",
        authType: "custom-wallet",
        providerId: "custom-wallet",
      },
    ],
    { persist: false, persistActive: false },
  );

  persistSavedProfiles({ persistActive: false });

  const storedRaw = localStorage.getItem(STORAGE_KEY);
  assert.ok(storedRaw, "expected saved profiles to be written to storage");

  const stored = JSON.parse(storedRaw);
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].authType, "custom-wallet");
  assert.equal(stored.entries[0].providerId, "custom-wallet");
});

test("loadSavedProfilesFromStorage retains custom provider authType", () => {
  resetSavedProfilesState();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      entries: [
        {
          pubkey: SAMPLE_PUBKEY,
          npub: null,
          name: "",
          picture: "",
          authType: "nostr-wallet-connect",
          providerId: "nostr-wallet-connect",
        },
      ],
      activePubkey: null,
    }),
  );

  const { profiles } = loadSavedProfilesFromStorage();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].authType, "nostr-wallet-connect");
  assert.equal(profiles[0].providerId, "nostr-wallet-connect");

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.entries[0].authType, "nostr-wallet-connect");
  assert.equal(stored.entries[0].providerId, "nostr-wallet-connect");
});

test("loadSavedProfilesFromStorage migrates missing authType to nip07", () => {
  resetSavedProfilesState();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      entries: [
        {
          pubkey: SAMPLE_PUBKEY,
          npub: null,
          name: "",
          picture: "",
        },
      ],
      activePubkey: null,
    }),
  );

  const { profiles } = loadSavedProfilesFromStorage();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].authType, "nip07");
  assert.equal(profiles[0].providerId, "nip07");

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.entries[0].authType, "nip07");
  assert.equal(stored.entries[0].providerId, "nip07");
});

test("loadSavedProfilesFromStorage trims stored authType values", () => {
  resetSavedProfilesState();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      entries: [
        {
          pubkey: SAMPLE_PUBKEY,
          npub: null,
          name: "",
          picture: "",
          authType: "  extension-provider  ",
          providerId: "  extension-provider  ",
        },
      ],
      activePubkey: null,
    }),
  );

  const { profiles } = loadSavedProfilesFromStorage();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].authType, "extension-provider");
  assert.equal(profiles[0].providerId, "extension-provider");

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.entries[0].authType, "extension-provider");
  assert.equal(stored.entries[0].providerId, "extension-provider");
});
<<<<<<< HEAD

test("loadSavedProfilesFromStorage ignores legacy userPubKey", () => {
  resetSavedProfilesState();

  localStorage.setItem("userPubKey", SAMPLE_PUBKEY);
  // Ensure the modern key is missing/empty
  localStorage.removeItem(STORAGE_KEY);

  const { profiles } = loadSavedProfilesFromStorage();
  assert.equal(profiles.length, 0, "Expected no profiles to be loaded from legacy key");
});
=======
>>>>>>> origin/main
