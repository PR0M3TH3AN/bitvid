// Run with: node tests/auth-service.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

import AuthService from "../js/services/authService.js";
import {
  setPubkey,
  setCurrentUserNpub,
} from "../js/state/appState.js";
import {
  mutateSavedProfiles,
  setActiveProfilePubkey,
  getProfileCacheMap,
} from "../js/state/cache.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

if (!globalThis.window.NostrTools.nip19) {
  globalThis.window.NostrTools.nip19 = {
    decode(value) {
      if (typeof value !== "string") {
        throw new Error("invalid value");
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error("empty value");
      }
      if (trimmed.startsWith("npub1")) {
        return { type: "npub", data: trimmed.slice(5) || "" };
      }
      return { type: "hex", data: trimmed };
    },
    npubEncode(hex) {
      if (typeof hex !== "string") {
        throw new Error("invalid hex");
      }
      const trimmed = hex.trim();
      if (!trimmed) {
        throw new Error("empty hex");
      }
      return `npub1${trimmed}`;
    },
  };
}

const SAMPLE_PUBKEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function resetState() {
  setPubkey(null);
  setCurrentUserNpub(null);
  setActiveProfilePubkey(null, { persist: false });
  mutateSavedProfiles(() => [], { persist: false, persistActive: false });
  const cache = getProfileCacheMap();
  if (cache && typeof cache.clear === "function") {
    cache.clear();
  }
}

await (async () => {
  resetState();
  setPubkey(SAMPLE_PUBKEY);

  const calls = [];
  let resolveBlocks;

  const service = new AuthService({
    userBlocks: {
      loadBlocks: () => {
        calls.push("blocks:start");
        return new Promise((resolve) => {
          resolveBlocks = resolve;
        });
      },
    },
    relayManager: {
      loadRelayList: () => {
        calls.push("relays:start");
        return Promise.resolve("relays");
      },
    },
  });

  service.loadOwnProfile = () => {
    calls.push("profile:start");
    return Promise.resolve({ name: "Test User" });
  };

  const promise = service.applyPostLoginState();

  await Promise.resolve();

  assert.deepEqual(calls, ["blocks:start", "relays:start", "profile:start"]);

  resolveBlocks();

  const detail = await promise;

  assert.equal(detail.pubkey, SAMPLE_PUBKEY);
  assert.equal(detail.blocksLoaded, true);
  assert.equal(detail.relaysLoaded, true);
  assert.deepEqual(detail.profile, { name: "Test User" });
})();

await (async () => {
  resetState();
  setPubkey(SAMPLE_PUBKEY);

  const logs = [];
  const service = new AuthService({
    userBlocks: {
      loadBlocks: () => {
        throw new Error("blocks failed synchronously");
      },
    },
    relayManager: {
      loadRelayList: () => Promise.reject(new Error("relays failed")),
    },
  });

  service.log = (message, error) => {
    logs.push({ message, error });
  };

  service.loadOwnProfile = () => Promise.reject(new Error("profile failed"));

  const detail = await service.applyPostLoginState();

  assert.equal(detail.pubkey, SAMPLE_PUBKEY);
  assert.equal(detail.blocksLoaded, false);
  assert.equal(detail.relaysLoaded, false);
  assert.equal(detail.profile, null);

  assert.equal(logs.length, 3);
  assert(logs.some(({ message }) => message.includes("block list")));
  assert(logs.some(({ message }) => message.includes("relay list")));
  assert(logs.some(({ message }) => message.includes("own profile")));
})();

await (async () => {
  resetState();

  const service = new AuthService();
  const detail = await service.applyPostLoginState();

  assert.deepEqual(detail, {
    pubkey: null,
    blocksLoaded: false,
    relaysLoaded: false,
    profile: null,
  });
})();

await (async () => {
  resetState();

  const service = new AuthService();
  const postLogin = {
    pubkey: SAMPLE_PUBKEY,
    blocksLoaded: true,
    relaysLoaded: false,
    profile: { name: "Stub" },
  };

  service.applyPostLoginState = async () => postLogin;

  const detail = await service.login(SAMPLE_PUBKEY);

  await detail.postLoginPromise;

  assert.equal(detail.postLogin, postLogin);
  assert.deepEqual(detail.postLogin, postLogin);
})();

await (async () => {
  resetState();

  const adminCheckCalls = [];
  const service = new AuthService({
    accessControl: {
      isLockdownActive: () => true,
      isAdminEditor: (npub) => {
        adminCheckCalls.push(npub);
        return false;
      },
    },
  });

  let error;
  try {
    await service.login(SAMPLE_PUBKEY);
  } catch (err) {
    error = err;
  }

  assert(error instanceof Error);
  assert.equal(error.code, "site-lockdown");
  assert.match(error.message, /locked down/i);
  assert.equal(adminCheckCalls.length, 1);
  assert.equal(typeof adminCheckCalls[0], "string");
  assert(adminCheckCalls[0].length > 0);
})();

await (async () => {
  resetState();

  const service = new AuthService({
    accessControl: {
      isLockdownActive: () => true,
      isAdminEditor: () => true,
    },
  });

  const detail = await service.login(SAMPLE_PUBKEY);

  assert.ok(detail);
  assert.equal(detail.pubkey, SAMPLE_PUBKEY);
})();
