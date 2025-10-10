import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { nostrClient, __testExports } from "../js/nostr.js";
import { accessControl } from "../js/accessControl.js";

const { runNip07WithRetry } = __testExports ?? {};

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

  if (
    nostrClient.extensionPermissionCache &&
    typeof nostrClient.extensionPermissionCache.clear === "function"
  ) {
    nostrClient.extensionPermissionCache.clear();
  }

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

      if (
        nostrClient.extensionPermissionCache &&
        typeof nostrClient.extensionPermissionCache.clear === "function"
      ) {
        nostrClient.extensionPermissionCache.clear();
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
    assert.ok(
      nostrClient.extensionPermissionCache.has("nip04.decrypt"),
      "nip04.decrypt permission should be tracked as granted",
    );
    assert.ok(
      nostrClient.extensionPermissionCache.has("nip04.encrypt"),
      "nip04.encrypt permission should be tracked as granted",
    );
    assert.ok(
      nostrClient.extensionPermissionCache.has("sign_event"),
      "sign_event permission should be tracked as granted",
    );
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
    assert.equal(env.enableCalls.length >= 3, true, "should retry with alternate payloads");
    const [firstCall, secondCall, thirdCall] = env.enableCalls;
    assert.equal(firstCall, undefined, "first attempt should try plain enable() call");
    assert.ok(Array.isArray(secondCall?.permissions));
    assert.equal(
      typeof secondCall.permissions[0],
      "object",
      "second attempt should use structured permission objects",
    );
    assert.ok(Array.isArray(thirdCall?.permissions));
    assert.equal(
      typeof thirdCall.permissions[0],
      "string",
      "third attempt should fall back to string permissions",
    );
  } finally {
    env.restore();
    nostrClient.logout();
  }
});

test("NIP-07 login supports extensions that only allow enable() without payload", async () => {
  const env = setupLoginEnvironment({
    enableImpl(options) {
      if (options !== undefined) {
        return Promise.reject(new Error("payloads not supported"));
      }
      return Promise.resolve();
    },
  });

  try {
    const pubkey = await nostrClient.login();
    assert.equal(pubkey, HEX_PUBKEY);
    assert.equal(env.enableCalls.length, 1, "should not need alternate payloads when plain enable works");
    assert.equal(env.enableCalls[0], undefined, "plain enable should be attempted first");
  } finally {
    env.restore();
    nostrClient.logout();
  }
});

test("NIP-07 login quickly retries when a permission payload stalls", async () => {
  const originalOverride = global.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__;
  global.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__ = 80;

  const env = setupLoginEnvironment({
    enableImpl(options) {
      if (options === undefined) {
        return Promise.reject(new Error("needs permissions"));
      }
      if (
        options &&
        Array.isArray(options.permissions) &&
        options.permissions.length &&
        typeof options.permissions[0] === "object"
      ) {
        return new Promise(() => {});
      }
      return Promise.resolve();
    },
  });

  try {
    const start = Date.now();
    const pubkey = await nostrClient.login();
    const duration = Date.now() - start;
    assert.equal(pubkey, HEX_PUBKEY);
    assert.ok(
      duration < 500,
      `login should fall back quickly from stalled enable payloads (duration: ${duration}ms)`,
    );
    assert.equal(env.enableCalls.length, 3, "should attempt all payload variants");
    const [, objectCall, stringCall] = env.enableCalls;
    assert.ok(Array.isArray(objectCall?.permissions));
    assert.equal(typeof objectCall.permissions[0], "object");
    assert.ok(Array.isArray(stringCall?.permissions));
    assert.equal(typeof stringCall.permissions[0], "string");
  } finally {
    env.restore();
    nostrClient.logout();
    if (originalOverride === undefined) {
      delete global.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__;
    } else {
      global.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__ = originalOverride;
    }
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

if (typeof runNip07WithRetry === "function") {
  test("runNip07WithRetry respects timeout without retry multiplier", async () => {
    const start = Date.now();
    await assert.rejects(
      () =>
        runNip07WithRetry(() => new Promise(() => {}), {
          label: "test-op",
          timeoutMs: 60,
          retryMultiplier: 1,
        }),
      (error) =>
        error instanceof Error &&
        error.message ===
          "Timed out waiting for the NIP-07 extension. Confirm the extension prompt in your browser toolbar and try again.",
    );
    const duration = Date.now() - start;
    assert.ok(duration < 400, `operation should reject promptly (duration: ${duration}ms)`);
  });
}
