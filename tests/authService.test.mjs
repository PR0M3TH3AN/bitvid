import "./test-helpers/setup-localstorage.mjs";
import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import AuthService from "../js/services/authService.js";
import {
  getPubkey,
  setPubkey,
  getCurrentUserNpub,
  setCurrentUserNpub,
} from "../js/state/appState.js";
import {
  getSavedProfiles,
  mutateSavedProfiles,
  getActiveProfilePubkey,
  setActiveProfilePubkey,
} from "../js/state/cache.js";

// Mock dependencies
const mockNostrClient = {
  pubkey: null,
  logout: mock.fn(),
  pool: { list: mock.fn(async () => []) },
  relays: [],
  handleEvent: mock.fn(),
};

const mockUserBlocks = {
  loadBlocks: mock.fn(async () => true),
  reset: mock.fn(),
};

const mockRelayManager = {
  loadRelayList: mock.fn(async () => true),
  reset: mock.fn(),
};

const mockAccessControl = {
  isLockdownActive: mock.fn(() => false),
  isAdminEditor: mock.fn(() => false),
  canAccess: mock.fn(() => true),
  isBlacklisted: mock.fn(() => false),
};

const mockLogger = mock.fn();

const mockAuthProvider = {
  login: mock.fn(async () => ({ pubkey: "0000000000000000000000000000000000000000000000000000000000000001", authType: "nip07" })),
};

const mockGetAuthProvider = mock.fn((id) => mockAuthProvider);

describe("AuthService Coverage", () => {
  let authService;

  beforeEach(() => {
    // Reset global state
    setPubkey(null);
    setCurrentUserNpub(null);
    setActiveProfilePubkey(null, { persist: false });
    mutateSavedProfiles(() => [], { persist: false, persistActive: false });

    // Reset mocks
    mockNostrClient.logout.mock.resetCalls();
    mockUserBlocks.loadBlocks.mock.resetCalls();
    mockUserBlocks.reset.mock.resetCalls();
    mockRelayManager.loadRelayList.mock.resetCalls();
    mockRelayManager.reset.mock.resetCalls();
    mockAccessControl.isLockdownActive.mock.resetCalls();
    mockAuthProvider.login.mock.resetCalls();

    authService = new AuthService({
      nostrClient: mockNostrClient,
      userBlocks: mockUserBlocks,
      relayManager: mockRelayManager,
      logger: mockLogger,
      accessControl: mockAccessControl,
      getAuthProvider: mockGetAuthProvider,
    });
  });

  describe("login", () => {
    test("successfully logs in with valid pubkey", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
      const result = await authService.login(pubkey);

      assert.equal(getPubkey(), pubkey);
      assert.equal(getActiveProfilePubkey(), pubkey);
      assert.equal(result.pubkey, pubkey);

      const saved = getSavedProfiles();
      assert.equal(saved.length, 1);
      assert.equal(saved[0].pubkey, pubkey);
    });

    test("updates global state and calls post-login hooks", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000002";
      await authService.login(pubkey);

      assert.strictEqual(mockRelayManager.loadRelayList.mock.callCount(), 1);
      // Blocks are deferred by default in login flow, so loadBlocks should not be called immediately
      assert.strictEqual(mockUserBlocks.loadBlocks.mock.callCount(), 0);
    });

    test("throws if lockdown is active and user is not admin", async () => {
      mockAccessControl.isLockdownActive.mock.mockImplementation(() => true);
      mockAccessControl.isAdminEditor.mock.mockImplementation(() => false);

      await assert.rejects(
        async () => await authService.login("0000000000000000000000000000000000000000000000000000000000000003"),
        { code: "site-lockdown" }
      );
    });

    test("allows login if lockdown is active but user is admin", async () => {
      mockAccessControl.isLockdownActive.mock.mockImplementation(() => true);
      mockAccessControl.isAdminEditor.mock.mockImplementation(() => true);

      const pubkey = "0000000000000000000000000000000000000000000000000000000000000004";
      await authService.login(pubkey);
      assert.equal(getPubkey(), pubkey);
    });
  });

  describe("logout", () => {
    test("clears state and calls reset on dependencies", async () => {
      // Setup initial state
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000005";
      await authService.login(pubkey);

      await authService.logout();

      assert.equal(getPubkey(), null);
      assert.equal(getActiveProfilePubkey(), null);

      assert.strictEqual(mockNostrClient.logout.mock.callCount(), 1);
      assert.strictEqual(mockUserBlocks.reset.mock.callCount(), 1);
      assert.strictEqual(mockRelayManager.reset.mock.callCount(), 1);
    });
  });

  describe("requestLogin", () => {
    test("uses provider to login", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
      mockAuthProvider.login.mock.mockImplementation(async () => ({ pubkey, authType: "nip07" }));

      const result = await authService.requestLogin({ providerId: "nip07" });

      assert.equal(result.pubkey, pubkey);
      assert.strictEqual(mockAuthProvider.login.mock.callCount(), 1);
      // requestLogin calls login() internally if autoApply is true (default)
      assert.equal(getPubkey(), pubkey);
    });

    test("does not call login if autoApply is false", async () => {
      const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
      mockAuthProvider.login.mock.mockImplementation(async () => ({ pubkey, authType: "nip07" }));

      await authService.requestLogin({ providerId: "nip07", autoApply: false });

      assert.equal(getPubkey(), null);
    });
  });

  describe("switchProfile", () => {
    test("switches to an existing profile", async () => {
       const pubkey1 = "0000000000000000000000000000000000000000000000000000000000000001";
       const pubkey2 = "0000000000000000000000000000000000000000000000000000000000000002";

       await authService.login(pubkey1);
       // Reset mocks to clear login calls
       mockRelayManager.loadRelayList.mock.resetCalls();

       // Mock login for switch
       mockAuthProvider.login.mock.mockImplementation(async () => ({ pubkey: pubkey2, authType: "nip07" }));

       await authService.switchProfile(pubkey2, { providerId: "nip07" });

       assert.equal(getPubkey(), pubkey2);
       assert.equal(getActiveProfilePubkey(), pubkey2);
    });

    test("reorders saved profiles on switch", async () => {
        const pubkey1 = "0000000000000000000000000000000000000000000000000000000000000001";
        const pubkey2 = "0000000000000000000000000000000000000000000000000000000000000002";

        await authService.login(pubkey1);
        await authService.login(pubkey2);

        // At this point pubkey2 is active and likely last or first in savedProfiles depending on implementation.
        // mutateSavedProfiles pushes to end if new.
        // So [pubkey1, pubkey2].

        let saved = getSavedProfiles();
        assert.equal(saved.length, 2);
        assert.equal(saved[1].pubkey, pubkey2);

        // Switch back to pubkey1
        mockAuthProvider.login.mock.mockImplementation(async () => ({ pubkey: pubkey1, authType: "nip07" }));
        await authService.switchProfile(pubkey1);

        saved = getSavedProfiles();
        // Should be moved to front?
        // Code says: if (index > 0) { const [moved] = draft.splice(index, 1); draft.unshift(moved); }
        // So yes, moved to front.
        assert.equal(saved[0].pubkey, pubkey1);
    });
  });
});
