import test from "node:test";
import assert from "node:assert/strict";
import { ModerationService } from "../../js/services/moderationService.js";

const nip19 = {
  npubEncode(hex) {
    if (typeof hex !== "string" || !hex) {
      throw new Error("invalid hex");
    }
    return `npub${hex}`;
  },
  decode(value) {
    if (typeof value !== "string" || !value.startsWith("npub")) {
      throw new Error("invalid npub");
    }
    return { type: "npub", data: value.slice(4) };
  },
};

function withMockedNostrTools(t) {
  const hadWindow = typeof globalThis.window !== "undefined";
  const previousWindow = hadWindow ? globalThis.window : undefined;
  if (!hadWindow) {
    globalThis.window = {};
  }
  const previousGlobalTools = globalThis.NostrTools;
  const previousWindowTools = globalThis.window?.NostrTools;

  globalThis.NostrTools = { nip19 };
  if (globalThis.window) {
    globalThis.window.NostrTools = globalThis.NostrTools;
  }

  t.after(() => {
    if (typeof previousGlobalTools === "undefined") {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousGlobalTools;
    }

    if (globalThis.window) {
      if (typeof previousWindowTools === "undefined") {
        delete globalThis.window.NostrTools;
      } else {
        globalThis.window.NostrTools = previousWindowTools;
      }
    }

    if (!hadWindow) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  });
}

function createReport({ id, reporter, eventId, createdAt, type = "nudity" }) {
  return {
    kind: 1984,
    id,
    pubkey: reporter,
    created_at: createdAt,
    tags: [
      ["e", eventId],
      ["report", type],
    ],
    content: "fixture report",
  };
}

test("trustedReportCount dedupes multiple reports from the same trusted reporter", (t) => {
  withMockedNostrTools(t);

  const eventId = "f".repeat(64);
  const reporterHex = "a".repeat(64);

  const service = new ModerationService({
    logger: () => {},
    userBlocks: {
      async ensureLoaded() {},
      isBlocked() {
        return false;
      },
    },
  });

  service.trustedContacts = new Set([reporterHex]);

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

  const service = new ModerationService({
    logger: () => {},
    userBlocks: {
      async ensureLoaded() {},
      isBlocked(pubkey) {
        return pubkey === mutedReporter;
      },
    },
  });

  service.trustedContacts = new Set([mutedReporter, trustedReporter]);

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

  const service = new ModerationService({
    logger: () => {},
    userBlocks: userBlocksMock,
  });

  service.trustedContacts = new Set([reporterHex]);

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
