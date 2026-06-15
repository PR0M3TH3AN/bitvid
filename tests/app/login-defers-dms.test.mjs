// Scenario (SCN-login-defers-dms):
//   Given a user logs in via the auth session coordinator,
//   When the post-login hydration runs (profile + feed-driving lists settle),
//   Then the coordinator MUST NOT eagerly load the full direct-message history
//     (a cold limit:50 DM load is a burst of nip-07 decrypts that competes with
//     blocks/subscriptions/hashtags for the single-threaded extension channel
//     during the fragile handshake window — see KNOWN_BUGS #0). DMs load lazily
//     when the Messages tab is opened instead.
//   And the DM loading state is reported as "deferred" (not "ready"/"loading"),
//   And the lightweight unread indicator still runs so the badge stays accurate.

import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal browser shim: handleAuthLogin reads window.location.search. The unit
// suite shares one process, so a sibling test may have already installed a
// window (possibly without a usable location, or carrying a "?v=" param that
// routes login differently) — normalize it for this scenario either way.
if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}
globalThis.window.location = { search: "", href: "http://localhost/" };

const { createAuthSessionCoordinator } = await import(
  "../../js/app/authSessionCoordinator.js"
);

const ACTIVE_PUBKEY = "a".repeat(64);

function makeCoordinator({ loadDirectMessages, refreshUnreadDmIndicator }) {
  const noop = () => {};
  const asyncNoop = async () => {};
  const logger = { warn: noop, info: noop, log: noop, error: noop, debug: noop };

  const coord = createAuthSessionCoordinator({
    devLogger: logger,
    userLogger: logger,
    nostrClient: {
      // Signer resolves so the readiness gate completes (non-extension type so
      // it doesn't attempt a real permission prompt).
      ensureActiveSignerForPubkey: async () => ({ type: "nsec", pubkey: ACTIVE_PUBKEY }),
      ensureExtensionPermissions: async () => ({ ok: true }),
    },
    accessControl: { ensureReady: asyncNoop, getBlacklist: () => [] },
    userBlocks: {
      getBlockedPubkeys: () => [],
      seedWithNpubs: asyncNoop,
    },
    subscriptions: { ensureLoaded: asyncNoop, lastLoadError: null },
    hashtagPreferences: { load: asyncNoop, lastLoadError: null },
    storageService: {},
    relayManager: {},
    torrentClient: {},
    getHashViewName: () => "",
    setHashView: noop,
    DEFAULT_NIP07_PERMISSION_METHODS: [],
    RELAY_UI_BATCH_DELAY_MS: 0,
    sanitizeRelayList: (x) => x,
    buildDmRelayListEvent: noop,
    publishEventToRelays: noop,
    assertAnyRelayAccepted: noop,
    queueSignEvent: noop,
    bootstrapTrustedSeeds: noop,
    getModerationSettings: () => ({}),
    getActiveProfilePubkey: () => null,
  });

  // Collaborators the login flow touches on `this` — stub as inert so the flow
  // runs end to end without real UI/services.
  coord.pubkey = ACTIVE_PUBKEY;
  coord.profileController = null;
  coord.commentController = null;
  coord.nwcSettingsService = null;
  coord.authService = {
    loadBlocksForPubkey: async () => true,
  };
  coord.nostrService = {
    loadDirectMessages,
    listDirectMessageConversationSummaries: async () => [],
  };

  const inert = [
    "applyAuthenticatedUiState",
    "capturePermissionPromptFromError",
    "dispatchAuthChange",
    "forceRefreshAllProfiles",
    "maybeShowExperimentalLoginWarning",
    "reinitializeVideoListView",
    "renderSavedProfiles",
    "refreshAllVideoGrids",
    "resetPermissionPromptState",
    "resetViewLoggingState",
    "updateActiveProfileUI",
    "updateCachedHashtagPreferences",
    "updateShareNostrAuthState",
  ];
  for (const name of inert) {
    coord[name] = noop;
  }
  coord.normalizeHexPubkey = (x) => x;
  coord.refreshUnreadDmIndicator = refreshUnreadDmIndicator;
  coord.updateAuthLoadingState = (patch) => {
    coord.authLoadingState = { ...(coord.authLoadingState || {}), ...patch };
  };
  coord.authLoadingState = { profile: "idle", lists: "idle", dms: "idle" };

  return coord;
}

test("login does not eagerly load DM history; it is deferred", async () => {
  // Re-normalize at call time in case a sibling test mutated window/location.
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {};
  }
  globalThis.window.location = { search: "", href: "http://localhost/" };

  let loadDmCalls = 0;
  let unreadIndicatorCalls = 0;
  const coord = makeCoordinator({
    loadDirectMessages: async () => {
      loadDmCalls += 1;
      return { ok: true };
    },
    refreshUnreadDmIndicator: async () => {
      unreadIndicatorCalls += 1;
    },
  });

  await coord.handleAuthLogin({
    pubkey: ACTIVE_PUBKEY,
    identityChanged: true,
    postLogin: { profile: { name: "tester" } },
    postLoginPromise: Promise.resolve({ profile: { name: "tester" } }),
  });

  // Let every post-login promise chain (profile -> dm/nwc, feed sync) settle.
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    loadDmCalls,
    0,
    "login must NOT eagerly load DM history (it competes with feed lists for the nip-07 channel)",
  );
  assert.equal(
    coord.authLoadingState.dms,
    "deferred",
    "DM loading state should be reported as deferred at login",
  );
  assert.ok(
    unreadIndicatorCalls >= 1,
    "the lightweight unread DM indicator should still run so the badge stays accurate",
  );
});
