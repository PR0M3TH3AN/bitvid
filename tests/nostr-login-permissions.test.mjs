import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { nostrClient } from "../js/nostr.js";
import { accessControl } from "../js/accessControl.js";

const HEX_PUBKEY = "f".repeat(64);

function setupLoginEnvironment({ enableImpl, getPublicKey = HEX_PUBKEY } = {}) {
  const previousWindow = typeof global.window === "undefined" ? undefined : global.window;
  const previousGlobalNostr = global.nostr;
  const previousGlobalNostrTools = global.NostrTools;
  const previousCanonicalTools = global.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrToolsReady = global.nostrToolsReady;

  const windowRef = previousWindow ?? global;
  global.window = windowRef;

  const previousWindowNostr = previousWindow?.nostr;
  const previousWindowNostrTools = previousWindow?.NostrTools;

  const enableCalls = [];
  const nostrStub = {
    enable: (options) => {
      enableCalls.push(options);
      if (typeof enableImpl === "function") {
        return Promise.resolve(enableImpl(options, enableCalls.length));
      }
      return Promise.resolve();
    },
    getPublicKey: () => Promise.resolve(getPublicKey),
  };

  windowRef.nostr = nostrStub;
  global.nostr = nostrStub;

  const toolkitStub = {
    nip19: {
      npubEncode: (hex) => `npub${hex}`,
    },
  };

  windowRef.NostrTools = toolkitStub;
  global.NostrTools = toolkitStub;
  global.__BITVID_CANONICAL_NOSTR_TOOLS__ = toolkitStub;
  global.nostrToolsReady = Promise.resolve({ ok: true, value: toolkitStub });

  const originalAccessControl = {
    canAccess: accessControl.canAccess,
    getWhitelist: accessControl.getWhitelist,
    getBlacklist: accessControl.getBlacklist,
    isBlacklisted: accessControl.isBlacklisted,
  };

  accessControl.canAccess = () => true;
  accessControl.getWhitelist = () => [];
  accessControl.getBlacklist = () => [];
  accessControl.isBlacklisted = () => false;

  return {
    enableCalls,
    restore() {
      accessControl.canAccess = originalAccessControl.canAccess;
      accessControl.getWhitelist = originalAccessControl.getWhitelist;
      accessControl.getBlacklist = originalAccessControl.getBlacklist;
      accessControl.isBlacklisted = originalAccessControl.isBlacklisted;

      if (previousWindow === undefined) {
        delete global.window;
      } else {
        global.window = previousWindow;
        if (previousWindow) {
          previousWindow.nostr = previousWindowNostr;
          previousWindow.NostrTools = previousWindowNostrTools;
        }
      }

      if (previousGlobalNostr === undefined) {
        delete global.nostr;
      } else {
        global.nostr = previousGlobalNostr;
      }

      if (previousGlobalNostrTools === undefined) {
        delete global.NostrTools;
      } else {
        global.NostrTools = previousGlobalNostrTools;
      }

      global.__BITVID_CANONICAL_NOSTR_TOOLS__ = previousCanonicalTools;

      if (previousNostrToolsReady === undefined) {
        delete global.nostrToolsReady;
      } else {
        global.nostrToolsReady = previousNostrToolsReady;
      }
    },
  };
}

test("NIP-07 login requests decrypt permissions upfront", async () => {
  const env = setupLoginEnvironment();
  try {
    const pubkey = await nostrClient.login();
    assert.equal(pubkey, HEX_PUBKEY);
    assert.ok(env.enableCalls.length >= 1, "extension.enable should be invoked");
    const firstCall = env.enableCalls[0];
    assert.equal(typeof firstCall, "object");
    assert.ok(Array.isArray(firstCall.permissions), "permissions array should be provided");
    const methods = firstCall.permissions.map((entry) =>
      typeof entry === "string" ? entry : entry?.method,
    );
    assert.ok(methods.includes("nip04.decrypt"), "nip04.decrypt permission should be requested");
    assert.ok(methods.includes("nip04.encrypt"), "nip04.encrypt permission should be requested");
    assert.ok(methods.includes("sign_event"), "sign_event permission should be requested");
  } finally {
    env.restore();
    nostrClient.logout();
  }
});

test("NIP-07 login falls back when structured permissions fail", async () => {
  const env = setupLoginEnvironment({
    enableImpl(options) {
      if (
        options &&
        Array.isArray(options.permissions) &&
        options.permissions.length &&
        typeof options.permissions[0] === "object"
      ) {
        return Promise.reject(new Error("object permissions unsupported"));
      }
      if (options && Array.isArray(options.permissions)) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("unexpected enable invocation"));
    },
  });

  try {
    const pubkey = await nostrClient.login();
    assert.equal(pubkey, HEX_PUBKEY);
    assert.equal(env.enableCalls.length >= 2, true, "should retry with alternate payload");
    const [firstCall, secondCall] = env.enableCalls;
    assert.ok(Array.isArray(firstCall?.permissions));
    assert.equal(
      typeof firstCall.permissions[0],
      "object",
      "first attempt should use structured permission objects",
    );
    assert.ok(Array.isArray(secondCall?.permissions));
    assert.equal(
      typeof secondCall.permissions[0],
      "string",
      "second attempt should fall back to string permissions",
    );
  } finally {
    env.restore();
    nostrClient.logout();
  }
});

test("NIP-07 login surfaces enable permission errors", async () => {
  const env = setupLoginEnvironment({
    enableImpl() {
      return Promise.reject(new Error("permission denied"));
    },
  });

  try {
    await assert.rejects(() => nostrClient.login(), /permission denied/);
  } finally {
    env.restore();
    nostrClient.logout();
  }
});
