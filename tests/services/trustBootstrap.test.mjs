import { test, describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// Setup global mocks before imports
if (typeof global.localStorage === "undefined") {
  global.localStorage = {
    getItem: mock.fn(() => null),
    setItem: mock.fn(),
    removeItem: mock.fn(),
    clear: mock.fn(),
  };
}

// Dynamic imports to ensure globals are set before modules load
const { bootstrapTrustedSeeds } = await import("../../js/services/trustBootstrap.js");
const { setTrustSeedsEnabled } = await import("../../js/constants.js");
const { accessControl } = await import("../../js/accessControl.js");
const moderationService = (await import("../../js/services/moderationService.js")).default;
const nostrService = (await import("../../js/services/nostrService.js")).default;
const { userLogger, devLogger } = await import("../../js/utils/logger.js");

describe("trustBootstrap", () => {
  let originalAccessControlMethods = {};
  let originalModerationServiceMethods = {};
  let originalNostrServiceMethods = {};
  let originalUserLoggerMethods = {};
  let originalDevLoggerMethods = {};

  beforeEach(() => {
    // Enable feature flag by default
    setTrustSeedsEnabled(true);

    // Mock logger to suppress noise
    originalUserLoggerMethods = {
        warn: userLogger.warn,
        info: userLogger.info,
        error: userLogger.error
    };
    originalDevLoggerMethods = {
        warn: devLogger.warn,
        info: devLogger.info,
        error: devLogger.error
    };

    try {
        userLogger.warn = mock.fn();
        userLogger.info = mock.fn();
        userLogger.error = mock.fn();
        devLogger.warn = mock.fn();
        devLogger.info = mock.fn();
        devLogger.error = mock.fn();
    } catch (e) {
        // If frozen, we can't mock. That's fine.
    }

    // Mock accessControl
    originalAccessControlMethods = {
      waitForReady: accessControl.waitForReady,
      getEditors: accessControl.getEditors,
      onWhitelistChange: accessControl.onWhitelistChange,
      onEditorsChange: accessControl.onEditorsChange,
      onBlacklistChange: accessControl.onBlacklistChange,
    };

    accessControl.waitForReady = mock.fn(async () => {});
    accessControl.getEditors = mock.fn(() => []);
    accessControl.onWhitelistChange = mock.fn(() => {});
    accessControl.onEditorsChange = mock.fn(() => {});
    accessControl.onBlacklistChange = mock.fn(() => {});

    // Mock moderationService
    originalModerationServiceMethods = {
      setTrustedSeeds: moderationService.setTrustedSeeds,
      updateTrustedSeedOnlyStatus: moderationService.updateTrustedSeedOnlyStatus,
      recomputeAllSummaries: moderationService.recomputeAllSummaries,
    };
    moderationService.setTrustedSeeds = mock.fn();
    moderationService.updateTrustedSeedOnlyStatus = mock.fn();
    moderationService.recomputeAllSummaries = mock.fn();

    // Mock nostrService
    originalNostrServiceMethods = {
      nostrClient: nostrService.nostrClient,
    };
    nostrService.nostrClient = {
      pool: {},
      relays: ["wss://relay.example.com"], // Simulate ready state
    };
  });

  afterEach(() => {
    // Restore accessControl
    accessControl.waitForReady = originalAccessControlMethods.waitForReady;
    accessControl.getEditors = originalAccessControlMethods.getEditors;
    accessControl.onWhitelistChange = originalAccessControlMethods.onWhitelistChange;
    accessControl.onEditorsChange = originalAccessControlMethods.onEditorsChange;
    accessControl.onBlacklistChange = originalAccessControlMethods.onBlacklistChange;

    // Restore moderationService
    moderationService.setTrustedSeeds = originalModerationServiceMethods.setTrustedSeeds;
    moderationService.updateTrustedSeedOnlyStatus = originalModerationServiceMethods.updateTrustedSeedOnlyStatus;
    moderationService.recomputeAllSummaries = originalModerationServiceMethods.recomputeAllSummaries;

    // Restore nostrService
    nostrService.nostrClient = originalNostrServiceMethods.nostrClient;

    // Restore loggers if they were mocked
    if (userLogger.warn.mock) userLogger.warn = originalUserLoggerMethods.warn;
    if (userLogger.info.mock) userLogger.info = originalUserLoggerMethods.info;
    if (userLogger.error.mock) userLogger.error = originalUserLoggerMethods.error;
    if (devLogger.warn.mock) devLogger.warn = originalDevLoggerMethods.warn;
    if (devLogger.info.mock) devLogger.info = originalDevLoggerMethods.info;
    if (devLogger.error.mock) devLogger.error = originalDevLoggerMethods.error;

    // Reset mocks
    mock.reset();
  });

  it("should return early if feature is disabled", async () => {
    setTrustSeedsEnabled(false);
    await bootstrapTrustedSeeds();
    assert.equal(moderationService.setTrustedSeeds.mock.callCount(), 0);
  });

  it("should apply seeds when accessControl is ready", async () => {
    accessControl.getEditors.mock.mockImplementation(() => ["editor1"]);

    await bootstrapTrustedSeeds();

    assert.equal(moderationService.setTrustedSeeds.mock.callCount(), 1);
    const seeds = moderationService.setTrustedSeeds.mock.calls[0].arguments[0];
    assert.ok(seeds instanceof Set);
    assert.ok(seeds.has("editor1"));
  });

  it("should subscribe to accessControl changes", async () => {
    await bootstrapTrustedSeeds();

    assert.equal(accessControl.onWhitelistChange.mock.callCount(), 1);
    assert.equal(accessControl.onEditorsChange.mock.callCount(), 1);
    assert.equal(accessControl.onBlacklistChange.mock.callCount(), 1);
  });

  it("should handle accessControl timeout and apply seeds anyway", async () => {
    // Mock waitForAccessControl to timeout (reject)
    accessControl.waitForReady.mock.mockImplementation(async () => {
      throw new Error("accessControl ready check timed out");
    });

    await bootstrapTrustedSeeds();

    // Even if it times out, it should eventually apply seeds (fallback path)
    assert.equal(moderationService.setTrustedSeeds.mock.callCount(), 1);
  });

  it("should recompute summaries after applying seeds", async () => {
    await bootstrapTrustedSeeds();
    assert.equal(moderationService.recomputeAllSummaries.mock.callCount(), 1);
  });

  it("should wait for relays if hydration fails initially", async () => {
    // First hydration attempt fails
    accessControl.waitForReady.mock.mockImplementationOnce(async () => {
      throw new Error("accessControl failed");
    });

    // Initially no relays
    nostrService.nostrClient.relays = [];

    // Start bootstrap in background since it might wait
    const bootstrapPromise = bootstrapTrustedSeeds();

    // Verify it hasn't applied seeds yet (it's waiting or retrying)
    // Note: because we are using real timers (and maybe mock Date in other tests?),
    // the code might run fast or slow.
    // With no relays, runAsyncRetry -> waitForRelaysReady loops.
    // So setTrustedSeeds should NOT be called immediately.
    assert.equal(moderationService.setTrustedSeeds.mock.callCount(), 0);

    // Simulate relays becoming ready after a short delay
    setTimeout(() => {
        nostrService.nostrClient.relays = ["wss://new.relay"];
    }, 150); // > 125ms used in waitForRelaysReady

    // Wait for logic to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have applied seeds eventually
    assert.ok(moderationService.setTrustedSeeds.mock.callCount() >= 1);
  });
});
