import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";

<<<<<<< HEAD
import { nostrClient } from "../js/nostrClientFacade.js";
import { NostrClient, __testExports } from "../js/nostr/client.js";
=======
import { NostrClient, nostrClient, __testExports } from "../js/nostr.js";
>>>>>>> origin/main
import { accessControl } from "../js/accessControl.js";

const {
  runNip07WithRetry,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
} = __testExports ?? {};

const EXPECTED_ENCRYPTION_PERMISSIONS = Array.isArray(
  DEFAULT_NIP07_ENCRYPTION_METHODS,
)
  ? DEFAULT_NIP07_ENCRYPTION_METHODS
  : ["nip04.encrypt", "nip04.decrypt", "nip44.encrypt", "nip44.decrypt"];

const HEX_PUBKEY = "f".repeat(64);
const PERMISSIONS_STORAGE_KEY = "bitvid:nip07:permissions";

function clearStoredPermissions() {
  if (typeof localStorage === "undefined" || !localStorage) {
    return;
  }
  try {
    localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    // Ignore storage cleanup issues in tests
  }
}

test.beforeEach(() => {
  clearStoredPermissions();
});

test.afterEach(() => {
  clearStoredPermissions();
});

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
  clearStoredPermissions();

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
      clearStoredPermissions();
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
      nostrClient.extensionPermissionCache.has("nip04.encrypt"),
      "nip04.encrypt permission should be tracked as granted",
    );
    assert.ok(
      nostrClient.extensionPermissionCache.has("nip04.decrypt"),
      "nip04.decrypt permission should be tracked as granted",
    );
    assert.ok(
      nostrClient.extensionPermissionCache.has("nip44.encrypt"),
      "nip44.encrypt permission should be tracked as granted",
    );
    assert.ok(
      nostrClient.extensionPermissionCache.has("nip44.decrypt"),
      "nip44.decrypt permission should be tracked as granted",
    );
    for (const method of EXPECTED_ENCRYPTION_PERMISSIONS) {
      assert.ok(
        nostrClient.extensionPermissionCache.has(method),
        `${method} permission should be tracked as granted`,
      );
    }
    assert.ok(
      nostrClient.extensionPermissionCache.has("sign_event"),
      "sign_event permission should be tracked as granted",
    );
  } finally {
    env.restore();
    nostrClient.logout();
    clearStoredPermissions();
  }
});

test("NIP-07 decrypt reuses cached extension permissions", async () => {
  const env = setupLoginEnvironment();
  try {
    const decryptCalls = {
      nip04: 0,
      nip44: 0,
    };
    window.nostr.nip04 = {
      decrypt: async (actorKey, ciphertext) => {
        decryptCalls.nip04 += 1;
        assert.equal(actorKey, HEX_PUBKEY);
        return `plaintext:${ciphertext}`;
      },
    };
    window.nostr.nip44 = {
      decrypt: async (actorKey, ciphertext) => {
        decryptCalls.nip44 += 1;
        assert.equal(actorKey, HEX_PUBKEY);
        return `plaintext44:${ciphertext}`;
      },
    };

    const pubkey = await nostrClient.login();
    assert.equal(pubkey, HEX_PUBKEY);
    for (const method of EXPECTED_ENCRYPTION_PERMISSIONS) {
      assert.ok(
        nostrClient.extensionPermissionCache.has(method),
        `nostrClient should track ${method} after login`,
      );
    }

    const storedRaw = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
    assert.ok(storedRaw, "extension permissions should persist to localStorage");
    let storedMethods = [];
    try {
      const parsed = JSON.parse(storedRaw);
      storedMethods = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.grantedMethods)
          ? parsed.grantedMethods
          : [];
    } catch (error) {
      storedMethods = [];
    }
    const storedSet = new Set(
      storedMethods
        .filter((method) => typeof method === "string")
        .map((method) => method.trim())
        .filter(Boolean),
    );
    for (const method of EXPECTED_ENCRYPTION_PERMISSIONS) {
      assert.ok(
        storedSet.has(method),
        `stored permissions should include ${method}`,
      );
    }
    const baselineEnableCalls = env.enableCalls.length;
    const freshClient = new NostrClient();
    freshClient.pubkey = HEX_PUBKEY;

    for (const method of EXPECTED_ENCRYPTION_PERMISSIONS) {
      assert.ok(
        freshClient.extensionPermissionCache.has(method),
        `fresh client should hydrate ${method} from storage`,
      );
    }

    for (const method of ["nip04.decrypt", "nip44.decrypt"]) {
      const permissionResult = await freshClient.ensureExtensionPermissions([
        method,
      ]);
      assert.equal(permissionResult.ok, true);
      assert.equal(
        env.enableCalls.length,
        baselineEnableCalls,
        `cached permissions should prevent extra enable() calls for ${method}`,
      );
    }

    const plaintext = await window.nostr.nip04.decrypt(HEX_PUBKEY, "ciphertext");
    assert.equal(plaintext, "plaintext:ciphertext");
    const plaintext44 = await window.nostr.nip44.decrypt(
      HEX_PUBKEY,
      "ciphertext44",
    );
    assert.equal(plaintext44, "plaintext44:ciphertext44");
    assert.equal(
      env.enableCalls.length,
      baselineEnableCalls,
      "decrypt calls should not trigger additional enable() prompts",
    );
    assert.equal(decryptCalls.nip04, 1);
    assert.equal(decryptCalls.nip44, 1);
  } finally {
    env.restore();
    nostrClient.logout();
    clearStoredPermissions();
  }
});

test("NIP-07 login falls back when structured permissions fail", async () => {
  clearStoredPermissions();
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
    assert.ok(env.enableCalls.length >= 2, "should retry with alternate payloads");
    const [objectCall, stringCall, plainCall] = env.enableCalls;
    assert.ok(Array.isArray(objectCall?.permissions));
    assert.equal(
      typeof objectCall.permissions[0],
      "object",
      "structured permission request should be attempted",
    );
    assert.ok(Array.isArray(stringCall?.permissions));
    assert.equal(
      typeof stringCall.permissions[0],
      "string",
      "string-based permissions should be attempted after structured payloads",
    );
    assert.equal(
      plainCall,
      undefined,
      "plain enable() should only be attempted if prior payloads fail",
    );
  } finally {
    env.restore();
    nostrClient.logout();
    clearStoredPermissions();
  }
});

test("NIP-07 login supports extensions that only allow enable() without payload", async () => {
  clearStoredPermissions();
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
    assert.equal(
      env.enableCalls.length,
      3,
      "should fall back to plain enable() after payload rejections",
    );
    const [objectCall, stringCall, plainCall] = env.enableCalls;
    assert.ok(Array.isArray(objectCall?.permissions));
    assert.equal(
      typeof objectCall.permissions[0],
      "object",
      "structured permissions should be attempted before falling back",
    );
    assert.ok(Array.isArray(stringCall?.permissions));
    assert.equal(
      typeof stringCall.permissions[0],
      "string",
      "string permissions should be attempted before plain enable()",
    );
    assert.equal(plainCall, undefined, "final attempt should use plain enable()");
  } finally {
    env.restore();
    nostrClient.logout();
    clearStoredPermissions();
  }
});

test("NIP-07 login quickly retries when a permission payload stalls", async () => {
  const originalOverride = global.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__;
  global.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__ = 80;

  clearStoredPermissions();
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
    assert.equal(env.enableCalls.length, 2, "should attempt structured and string payload variants");
    const [objectCall, stringCall] = env.enableCalls;
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
    clearStoredPermissions();
  }
});

test("NIP-07 login surfaces enable permission errors", async () => {
  clearStoredPermissions();
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
    clearStoredPermissions();
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
