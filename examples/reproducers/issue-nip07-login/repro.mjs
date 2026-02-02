import "../../../tests/test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { nostrClient } from "../../../js/nostrClientFacade.js";
import { NostrClient, __testExports } from "../../../js/nostr/client.js";
import nip07Provider from "../../../js/services/authProviders/nip07.js";
import { accessControl } from "../../../js/accessControl.js";

const {
  DEFAULT_NIP07_ENCRYPTION_METHODS,
} = __testExports ?? {};

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
    const result = await nip07Provider.login({ nostrClient });
    const pubkey = result.pubkey;
    assert.equal(pubkey, HEX_PUBKEY);
    assert.ok(env.enableCalls.length >= 2, "should retry with alternate payloads");
    const [objectCall, stringCall] = env.enableCalls;
    assert.ok(Array.isArray(objectCall?.permissions));
    assert.equal(
      typeof objectCall.permissions[0],
      "object",
      "structured permission request should be attempted first",
    );
    assert.ok(Array.isArray(stringCall?.permissions));
    assert.equal(
      typeof stringCall.permissions[0],
      "string",
      "string-based permissions should be attempted after structured payloads",
    );

    // THIS ASSERTION CAUSES ReferenceError: plainCall is not defined
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
