import test from "node:test";
import assert from "node:assert/strict";
import {
  withMockedNostrTools,
  createModerationServiceHarness,
  createReportEvent,
  applyTrustedContacts,
} from "../helpers/moderation-test-helpers.mjs";

function createReport(options) {
  return createReportEvent(options);
}

test("trustedReportCount dedupes multiple reports from the same trusted reporter", (t) => {
  withMockedNostrTools(t);

  const eventId = "f".repeat(64);
  const reporterHex = "a".repeat(64);

  const { service } = createModerationServiceHarness(t);

  applyTrustedContacts(service, [reporterHex]);

  const firstReport = createReport({
    id: "1".repeat(64),
    reporter: reporterHex,
    eventId,
    createdAt: 1_700_000_000,
  });

  const duplicateReport = createReport({
    id: "2".repeat(64),
    reporter: reporterHex,
    eventId,
    createdAt: 1_700_000_500,
  });

  service.ingestReportEvent(firstReport);
  service.ingestReportEvent(duplicateReport);

  const summary = service.getTrustedReportSummary(eventId);
  assert.equal(summary.types.nudity.total, 1);
  assert.equal(summary.types.nudity.trusted, 1);
  assert.equal(service.trustedReportCount(eventId, "nudity"), 1);
});

test("trustedReportCount ignores reports from muted or blocked reporters", (t) => {
  withMockedNostrTools(t);

  const eventId = "e".repeat(64);
  const mutedReporter = "b".repeat(64);
  const trustedReporter = "c".repeat(64);

  const userBlocks = {
    async ensureLoaded() {},
    isBlocked(pubkey) {
      return pubkey === mutedReporter;
    },
  };

  const { service } = createModerationServiceHarness(t, { userBlocks });

  applyTrustedContacts(service, [mutedReporter, trustedReporter]);

  const mutedReport = createReport({
    id: "3".repeat(64),
    reporter: mutedReporter,
    eventId,
    createdAt: 1_700_000_100,
  });

  const trustedReport = createReport({
    id: "4".repeat(64),
    reporter: trustedReporter,
    eventId,
    createdAt: 1_700_000_200,
  });

  service.ingestReportEvent(mutedReport);
  service.ingestReportEvent(trustedReport);

  const summary = service.getTrustedReportSummary(eventId);
  assert.equal(summary.types.nudity.total, 1);
  assert.equal(summary.types.nudity.trusted, 1);
  assert.equal(service.trustedReportCount(eventId, "nudity"), 1);
  const reporters = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(reporters.map((entry) => entry.pubkey), [trustedReporter]);
});

test("blocking and unblocking reporters recomputes trusted summaries", async (t) => {
  withMockedNostrTools(t);

  const eventId = "d".repeat(64);
  const reporterHex = "a".repeat(64);

  const blocked = new Set();
  const listeners = new Set();
  const userBlocksMock = {
    async ensureLoaded() {},
    isBlocked(pubkey) {
      return blocked.has(pubkey);
    },
    on(eventName, handler) {
      if (eventName !== "change" || typeof handler !== "function") {
        return () => {};
      }
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    emit(detail) {
      for (const handler of Array.from(listeners)) {
        handler(detail);
      }
    },
  };

  const { service } = createModerationServiceHarness(t, { userBlocks: userBlocksMock });

  applyTrustedContacts(service, [reporterHex]);

  const report = createReport({
    id: "b".repeat(64),
    reporter: reporterHex,
    eventId,
    createdAt: 1_700_000_300,
  });

  service.ingestReportEvent(report);

  assert.equal(service.trustedReportCount(eventId, "nudity"), 1);

  const teardownCalls = [];
  const setActiveCalls = [];
  service.activeEventIds = new Set([eventId]);
  service.activeSubscriptions.set(eventId, {});
  service.teardownReportSubscription = (id) => {
    if (!service.activeSubscriptions.has(id)) {
      return;
    }
    teardownCalls.push(id);
    service.activeSubscriptions.delete(id);
  };
  service.setActiveEventIds = async (ids) => {
    setActiveCalls.push([...ids]);
    service.activeEventIds = new Set(ids);
  };

  blocked.add(reporterHex);
  userBlocksMock.emit({ action: "block", targetPubkey: reporterHex });
  await service.awaitUserBlockRefresh();

  const summaryAfterBlock = service.getTrustedReportSummary(eventId);
  assert.equal(summaryAfterBlock.totalTrusted, 0);
  assert.equal(summaryAfterBlock.types.nudity?.trusted ?? 0, 0);
  assert.deepEqual(teardownCalls, [eventId]);
  assert.deepEqual(setActiveCalls, [[eventId]]);

  blocked.delete(reporterHex);
  userBlocksMock.emit({ action: "unblock", targetPubkey: reporterHex });
  await service.awaitUserBlockRefresh();

  const summaryAfterUnblock = service.getTrustedReportSummary(eventId);
  assert.equal(summaryAfterUnblock.types.nudity.trusted, 1);
  assert.equal(service.trustedReportCount(eventId, "nudity"), 1);
  assert.deepEqual(setActiveCalls, [[eventId], [eventId]]);
});

test("trustedReportCount only counts eligible F1 reporters and admin whitelist", (t) => {
  withMockedNostrTools(t);

  const eventId = "c".repeat(64);
  const viewerBlocked = "1".repeat(64);
  const f1Reporter = "2".repeat(64);
  const f2Reporter = "3".repeat(64);
  const adminWhitelisted = "4".repeat(64);
  const adminBlacklisted = "5".repeat(64);

  const userBlocks = {
    async ensureLoaded() {},
    isBlocked(pubkey) {
      return pubkey === viewerBlocked;
    },
  };

  const accessControl = {
    getWhitelist() {
      return [`npub${adminWhitelisted}`];
    },
    getBlacklist() {
      return [`npub${adminBlacklisted}`];
    },
  };

  const { service } = createModerationServiceHarness(t, { userBlocks, accessControl });

  applyTrustedContacts(service, [f1Reporter, viewerBlocked]);

  const reports = [
    { id: "r1".repeat(32), reporter: f1Reporter, createdAt: 1_700_000_000 },
    { id: "r2".repeat(32), reporter: viewerBlocked, createdAt: 1_700_000_050 },
    { id: "r3".repeat(32), reporter: f2Reporter, createdAt: 1_700_000_100 },
    { id: "r4".repeat(32), reporter: adminWhitelisted, createdAt: 1_700_000_200 },
    { id: "r5".repeat(32), reporter: adminBlacklisted, createdAt: 1_700_000_300 },
  ];

  for (const entry of reports) {
    service.ingestReportEvent(
      createReport({
        id: entry.id.padEnd(64, entry.id[0]),
        reporter: entry.reporter,
        eventId,
        createdAt: entry.createdAt,
      }),
    );
  }

  const summary = service.getTrustedReportSummary(eventId);
  assert.equal(summary.totalTrusted, 2);
  assert.equal(summary.types.nudity.total, 3);
  assert.equal(summary.types.nudity.trusted, 2);
  assert.equal(service.trustedReportCount(eventId, "nudity"), 2);

  const reporters = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(
    reporters.map((entry) => entry.pubkey).sort(),
    [adminWhitelisted, f1Reporter].sort(),
  );
});
