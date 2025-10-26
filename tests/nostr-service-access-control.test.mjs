import assert from "node:assert/strict";
import test from "node:test";

import "./test-helpers/setup-localstorage.mjs";
import { AccessControl } from "../js/accessControl.js";
import { NostrService } from "../js/services/nostrService.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const whitelistHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const whitelistNpub = "npub1whitelistcandidate";
const blacklistHex = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const blacklistNpub = "npub1blacklistcandidate";

const toolkit = {
  nip19: {
    decode(value) {
      if (typeof value !== "string") {
        throw new Error("invalid value");
      }

      const trimmed = value.trim();
      if (trimmed === whitelistNpub) {
        return { type: "npub", data: whitelistHex };
      }
      if (trimmed === blacklistNpub) {
        return { type: "npub", data: blacklistHex };
      }
      throw new Error("unsupported npub");
    },
    npubEncode(value) {
      if (value === whitelistHex) {
        return whitelistNpub;
      }
      if (value === blacklistHex) {
        return blacklistNpub;
      }
      throw new Error("unsupported hex");
    },
  },
};

const originalWindowNostrTools = globalThis.window.NostrTools;
const originalGlobalNostrTools = globalThis.NostrTools;

globalThis.window.NostrTools = toolkit;
globalThis.NostrTools = toolkit;

test.after(() => {
  if (originalWindowNostrTools === undefined) {
    delete globalThis.window.NostrTools;
  } else {
    globalThis.window.NostrTools = originalWindowNostrTools;
  }

  if (originalGlobalNostrTools === undefined) {
    delete globalThis.NostrTools;
  } else {
    globalThis.NostrTools = originalGlobalNostrTools;
  }
});

function createServiceWithAccessControl() {
  const service = new NostrService();
  const accessControl = new AccessControl();
  accessControl._hydrateFromCache = () => {};
  accessControl._scheduleHydrateFromCache = () => {};
  accessControl.whitelist = new Set([whitelistNpub]);
  accessControl.whitelistPubkeys = new Set([whitelistHex]);
  accessControl.blacklist = new Set([blacklistNpub]);
  accessControl.blacklistPubkeys = new Set([blacklistHex]);
  accessControl.whitelistEnabled = true;
  service.accessControl = accessControl;
  return service;
}

test("shouldIncludeVideo returns true for whitelist author when npubEncode throws", () => {
  const service = createServiceWithAccessControl();
  const originalEncode = globalThis.window.NostrTools.nip19.npubEncode;
  globalThis.window.NostrTools.nip19.npubEncode = () => {
    throw new Error("encode failure");
  };

  try {
    const video = {
      id: "video-whitelist",
      kind: 30078,
      pubkey: whitelistHex,
    };

    assert.equal(service.shouldIncludeVideo(video), true);
  } finally {
    globalThis.window.NostrTools.nip19.npubEncode = originalEncode;
  }
});

test("shouldIncludeVideo rejects blacklisted authors provided as npub", () => {
  const service = createServiceWithAccessControl();
  const video = {
    id: "video-blacklist-npub",
    kind: 30078,
    pubkey: blacklistHex,
    npub: blacklistNpub,
  };

  assert.equal(service.shouldIncludeVideo(video), false);
});

test("shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws", () => {
  const service = createServiceWithAccessControl();
  const originalEncode = globalThis.window.NostrTools.nip19.npubEncode;
  globalThis.window.NostrTools.nip19.npubEncode = () => {
    throw new Error("encode failure");
  };

  try {
    const video = {
      id: "video-blacklist-hex",
      kind: 30078,
      pubkey: blacklistHex,
    };

    assert.equal(service.shouldIncludeVideo(video), false);
  } finally {
    globalThis.window.NostrTools.nip19.npubEncode = originalEncode;
  }
});
