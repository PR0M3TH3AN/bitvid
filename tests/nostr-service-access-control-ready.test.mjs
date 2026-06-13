// Verifies ensureAccessControlReady no longer blocks the feed on the remote
// admin-list fetch except on a first-ever cold load in whitelist mode.
//
// Scenario (SCN-access-control-non-blocking-feed):
//   - admin state hydrated (cache or loaded)  => background refresh (ensureReady)
//   - cold + whitelist mode                   => block (waitForReady)
//   - cold + blacklist-only mode              => background refresh (ensureReady)

import assert from "node:assert/strict";
import test from "node:test";

import "./test-helpers/setup-localstorage.mjs";
import moderationService from "../js/services/moderationService.js";
import { NostrService } from "../js/services/nostrService.js";

// Stub background timers the service may schedule.
if (moderationService) {
  moderationService.scheduleTrustedMuteSubscriptionRefresh = () => {};
  moderationService.refreshTrustedMuteSubscriptions = async () => {};
}
if (typeof globalThis.window === "undefined") globalThis.window = {};

function makeAccessControl({ hydrated, whitelist }) {
  const calls = { ensureReady: 0, waitForReady: 0 };
  return {
    calls,
    isHydrated: () => hydrated,
    whitelistMode: () => whitelist,
    ensureReady: async () => {
      calls.ensureReady += 1;
    },
    waitForReady: async () => {
      calls.waitForReady += 1;
    },
  };
}

test("hydrated => background refresh, never blocks on waitForReady", async () => {
  const service = new NostrService();
  const ac = makeAccessControl({ hydrated: true, whitelist: true });
  service.accessControl = ac;
  await service.ensureAccessControlReady();
  assert.equal(ac.calls.ensureReady, 1);
  assert.equal(ac.calls.waitForReady, 0);
});

test("cold + whitelist mode => blocks on waitForReady (correctness)", async () => {
  const service = new NostrService();
  const ac = makeAccessControl({ hydrated: false, whitelist: true });
  service.accessControl = ac;
  await service.ensureAccessControlReady();
  assert.equal(ac.calls.waitForReady, 1);
  assert.equal(ac.calls.ensureReady, 0);
});

test("cold + blacklist-only mode => background refresh (no block)", async () => {
  const service = new NostrService();
  const ac = makeAccessControl({ hydrated: false, whitelist: false });
  service.accessControl = ac;
  await service.ensureAccessControlReady();
  assert.equal(ac.calls.ensureReady, 1);
  assert.equal(ac.calls.waitForReady, 0);
});

test("missing access control is a no-op", async () => {
  const service = new NostrService();
  service.accessControl = null;
  await service.ensureAccessControlReady(); // must not throw
  assert.ok(true);
});
