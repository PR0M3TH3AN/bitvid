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
import { profileCache } from "../js/state/profileCache.js";

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
  if (profileCache && typeof profileCache.reset === "function") {
    profileCache.reset();
  }
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
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

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(calls, ["relays:start", "blocks:start", "profile:start"]);

  resolveBlocks();

  const result = await promise;
  const detail = result.detail;
  await result.completionPromise;

  assert.equal(detail.pubkey, SAMPLE_PUBKEY);
  assert.equal(detail.blocksLoaded, true);
  assert.equal(detail.relaysLoaded, true);
  assert.deepEqual(detail.profile, { name: "Test User" });
})();

await (async () => {
  resetState();
  setPubkey(SAMPLE_PUBKEY);

  const calls = [];
  // We leave resolveBlocks undefined/pending forever to simulate slow/hanging blocks
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

  // Test deferBlocks: true
  const promise = service.applyPostLoginState({ deferBlocks: true });

  await new Promise((resolve) => setTimeout(resolve, 10));

  // Blocks should NOT be started if deferred
  // Wait, deferBlocks just means it's not awaited in completionPromise?
  // No, checking code:
  // if (!deferBlocks) { const blocksOperation = this.createBlocksLoadOperation... }
  // So it shouldn't even be called/pushed to concurrentOps.

  assert.deepEqual(calls, ["relays:start", "profile:start"]);

  const result = await promise;
  // This should resolve even if blocks are not loaded
  await result.completionPromise;

  assert.equal(result.detail.blocksLoaded, null);
  assert.equal(result.detail.relaysLoaded, true);
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

  const result = service.applyPostLoginState();
  const detail = result.detail;
  await result.completionPromise;

  assert.equal(detail.pubkey, SAMPLE_PUBKEY);
  assert.equal(detail.blocksLoaded, false);
  assert.equal(detail.relaysLoaded, false);
  assert.deepEqual(detail.profile, {
    name: "Unknown",
    picture: "assets/svg/default-profile.svg",
    about: "",
    website: "",
    banner: "",
    lud16: "",
    lud06: "",
  });

  assert.equal(logs.length, 3);
  assert(logs.some(({ message }) => message.includes("block list")));
  assert(logs.some(({ message }) => message.includes("relay list")));
  assert(logs.some(({ message }) => message.includes("own profile")));
})();

await (async () => {
  resetState();

  const service = new AuthService();
  const result = service.applyPostLoginState();
  const detail = result.detail;
  await result.completionPromise;

  assert.deepEqual(detail, {
    pubkey: null,
    blocksLoaded: false,
    relaysLoaded: false,
    profile: {
      name: "Unknown",
      picture: "assets/svg/default-profile.svg",
      about: "",
      website: "",
      banner: "",
      lud16: "",
      lud06: "",
    },
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

  service.applyPostLoginState = () => ({
    detail: postLogin,
    completionPromise: Promise.resolve(postLogin),
  });

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
