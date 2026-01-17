import test from "node:test";
import assert from "node:assert/strict";
import { ModerationService } from "../js/services/moderationService.js";
import { USER_BLOCK_EVENTS } from "../js/userBlocks.js";

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

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const noopUserLogger = { info: () => {} };

test("trusted report summaries respect personal blocks and admin lists", async (t) => {
  const previousTools = globalThis.NostrTools;
  const previousWindowTools = globalThis.window?.NostrTools;

  globalThis.NostrTools = { nip19 };
  if (globalThis.window) {
    globalThis.window.NostrTools = globalThis.NostrTools;
  }

  t.after(() => {
    if (typeof previousTools === "undefined") {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousTools;
    }

    if (globalThis.window) {
      if (typeof previousWindowTools === "undefined") {
        delete globalThis.window.NostrTools;
      } else {
        globalThis.window.NostrTools = previousWindowTools;
      }
    }
  });

  const trustedHex = "a".repeat(64);
  const whitelistedHex = "b".repeat(64);
  const blacklistedHex = "c".repeat(64);
  const blockedHex = "d".repeat(64);
  const randomHex = "e".repeat(64);
  const eventId = "f".repeat(64);

  const userBlocksMock = {
    async ensureLoaded() {},
    isBlocked(pubkey) {
      return pubkey === blockedHex;
    },
  };

  const accessControlMock = {
    getWhitelist() {
      return [`npub${whitelistedHex}`];
    },
    getBlacklist() {
      return [`npub${blacklistedHex}`];
    },
  };

  const service = new ModerationService({
    logger: () => {},
    userBlocks: userBlocksMock,
    accessControl: accessControlMock,
    userLogger: noopUserLogger,
  });

  service.trustedContacts = new Set([trustedHex]);

  const reports = new Map();
  reports.set(trustedHex, new Map([["nudity", { created_at: 100 }]]));
  reports.set(whitelistedHex, new Map([["nudity", { created_at: 400 }]]));
  reports.set(blacklistedHex, new Map([["nudity", { created_at: 500 }]]));
  reports.set(blockedHex, new Map([["nudity", { created_at: 600 }]]));
  reports.set(randomHex, new Map([["nudity", { created_at: 300 }]]));
  service.reportEvents.set(eventId, reports);

  service.recomputeSummaryForEvent(eventId);

  const summary = service.getTrustedReportSummary(eventId);
  assert.equal(summary.totalTrusted, 2);
  assert.equal(summary.types.nudity.total, 3);
  assert.equal(summary.types.nudity.trusted, 2);
  assert.equal(summary.types.nudity.latest, 400);

  const reporters = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(
    reporters.map((entry) => entry.pubkey),
    [whitelistedHex, trustedHex]
  );
  assert.equal(service.trustedReportCount(eventId, "nudity"), 2);
});

test("user block updates recompute summaries and emit notifications", async (t) => {
  const blockedHex = "1".repeat(64);
  const trustedHex = "2".repeat(64);
  const randomHex = "3".repeat(64);
  const eventId = "4".repeat(64);

  class FakeUserBlocks {
    constructor() {
      this.blocked = new Set();
      this.listeners = new Set();
    }

    async ensureLoaded() {}

    isBlocked(pubkey) {
      return this.blocked.has(pubkey);
    }

    on(eventName, handler) {
      if (eventName !== USER_BLOCK_EVENTS.CHANGE || typeof handler !== "function") {
        return () => {};
      }
      this.listeners.add(handler);
      return () => {
        this.listeners.delete(handler);
      };
    }

    emitChange(detail) {
      for (const handler of Array.from(this.listeners)) {
        handler(detail);
      }
    }
  }

  const userBlocks = new FakeUserBlocks();
  const service = new ModerationService({ logger: () => {}, userBlocks, userLogger: noopUserLogger });

  service.trustedContacts = new Set([blockedHex, trustedHex]);

  const reports = new Map();
  reports.set(
    blockedHex,
    new Map([["nudity", { created_at: 200 }]]),
  );
  reports.set(
    trustedHex,
    new Map([["nudity", { created_at: 150 }]]),
  );
  reports.set(
    randomHex,
    new Map([["nudity", { created_at: 100 }]]),
  );

  service.reportEvents.set(eventId, reports);
  service.recomputeSummaryForEvent(eventId);

  const initialSummary = service.getTrustedReportSummary(eventId);
  assert.equal(initialSummary.totalTrusted, 2);
  assert.equal(initialSummary.types.nudity.total, 3);
  assert.equal(initialSummary.types.nudity.trusted, 2);

  const initialReporters = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(
    initialReporters.map((entry) => entry.pubkey),
    [blockedHex, trustedHex],
  );

  const blockEvent = new Promise((resolve) => {
    const unsubscribe = service.on("user-blocks", (detail) => {
      unsubscribe?.();
      resolve(detail);
    });
  });

  userBlocks.blocked.add(blockedHex);
  userBlocks.emitChange({ action: "block", targetPubkey: blockedHex });

  const blockDetail = await blockEvent;
  assert.equal(blockDetail.action, "block");
  assert.equal(blockDetail.targetPubkey, blockedHex);

  const afterBlockSummary = service.getTrustedReportSummary(eventId);
  assert.equal(afterBlockSummary.totalTrusted, 1);
  assert.equal(afterBlockSummary.types.nudity.total, 2);
  assert.equal(afterBlockSummary.types.nudity.trusted, 1);
  assert.equal(service.trustedReportCount(eventId, "nudity"), 1);

  const reportersAfterBlock = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(reportersAfterBlock.map((entry) => entry.pubkey), [trustedHex]);

  const unblockEvent = new Promise((resolve) => {
    const unsubscribe = service.on("user-blocks", (detail) => {
      unsubscribe?.();
      resolve(detail);
    });
  });

  userBlocks.blocked.delete(blockedHex);
  userBlocks.emitChange({ action: "unblock", targetPubkey: blockedHex });

  const unblockDetail = await unblockEvent;
  assert.equal(unblockDetail.action, "unblock");
  assert.equal(unblockDetail.targetPubkey, blockedHex);

  const afterUnblockSummary = service.getTrustedReportSummary(eventId);
  assert.equal(afterUnblockSummary.totalTrusted, 2);
  assert.equal(afterUnblockSummary.types.nudity.total, 3);
  assert.equal(afterUnblockSummary.types.nudity.trusted, 2);
  assert.equal(service.trustedReportCount(eventId, "nudity"), 2);

  const reportersAfterUnblock = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(
    reportersAfterUnblock.map((entry) => entry.pubkey),
    [blockedHex, trustedHex],
  );
});

test("moderation thresholds emit logger hooks only when crossing", async (t) => {
  const calls = [];
  const userLoggerMock = {
    info: (...args) => {
      calls.push(args);
    },
  };

  const service = new ModerationService({ logger: () => {}, userLogger: userLoggerMock });

  const eventId = "9".repeat(64);
  const reportType = "nudity";
  const trustedReporters = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];

  service.trustedContacts = new Set(trustedReporters);

  const reports = new Map();
  service.reportEvents.set(eventId, reports);

  const createReporterEntry = (timestamp) => new Map([[reportType, { created_at: timestamp }]]);

  const expectActions = (...expected) => {
    assert.equal(calls.length, expected.length);
    expected.forEach((entry, index) => {
      const [message, detail] = calls[index];
      assert.equal(message, "[moderationService] moderation threshold crossed");
      assert.equal(detail.action, entry.action);
      assert.equal(detail.eventId, eventId);
      assert.equal(detail.reportType, reportType);
      assert.equal(detail.trustedCount, entry.count);
    });
    calls.length = 0;
  };

  const expectNoAction = () => {
    assert.equal(calls.length, 0);
  };

  reports.set(trustedReporters[0], createReporterEntry(100));
  service.recomputeSummaryForEvent(eventId);
  expectActions(
    { action: "autoplay-block-enabled", count: 1 },
    { action: "blur-enabled", count: 1 },
  );

  service.recomputeSummaryForEvent(eventId);
  expectNoAction();

  reports.set(trustedReporters[1], createReporterEntry(200));
  service.recomputeSummaryForEvent(eventId);
  expectNoAction();

  reports.set(trustedReporters[2], createReporterEntry(300));
  service.recomputeSummaryForEvent(eventId);
  expectNoAction();

  service.recomputeSummaryForEvent(eventId);
  expectNoAction();

  reports.delete(trustedReporters[2]);
  service.recomputeSummaryForEvent(eventId);
  expectNoAction();

  reports.delete(trustedReporters[1]);
  service.recomputeSummaryForEvent(eventId);
  expectNoAction();

  reports.delete(trustedReporters[0]);
  service.recomputeSummaryForEvent(eventId);
  expectActions(
    { action: "autoplay-block-cleared", count: 0 },
    { action: "blur-cleared", count: 0 },
  );

  service.recomputeSummaryForEvent(eventId);
  expectNoAction();
});

test("trusted mute aggregation tracks F1 mute lists", () => {
  const service = new ModerationService({ logger: () => {}, userLogger: noopUserLogger });

  const contactA = "a".repeat(64);
  const contactB = "b".repeat(64);
  const mutedAuthor = "c".repeat(64);

  service.trustedContacts = new Set([contactA, contactB]);

  service.ingestTrustedMuteEvent({
    kind: 10000,
    pubkey: contactA,
    created_at: 100,
    id: "1".repeat(64),
    tags: [["p", mutedAuthor]],
  });

  assert.equal(service.isAuthorMutedByTrusted(mutedAuthor), true);
  assert.deepEqual(service.getTrustedMutersForAuthor(mutedAuthor), [contactA]);

  service.ingestTrustedMuteEvent({
    kind: 10000,
    pubkey: contactB,
    created_at: 105,
    id: "2".repeat(64),
    tags: [["p", mutedAuthor]],
  });

  const muters = new Set(service.getTrustedMutersForAuthor(mutedAuthor));
  assert.equal(muters.size, 2);
  assert(muters.has(contactA));
  assert(muters.has(contactB));

  service.applyTrustedMuteEvent(contactA, {
    kind: 10000,
    pubkey: contactA,
    created_at: 200,
    id: "3".repeat(64),
    tags: [],
  });

  const remaining = service.getTrustedMutersForAuthor(mutedAuthor);
  assert.deepEqual(remaining, [contactB]);
  assert.equal(service.isAuthorMutedByTrusted(mutedAuthor), true);

  service.applyTrustedMuteEvent(contactB, {
    kind: 10000,
    pubkey: contactB,
    created_at: 210,
    id: "4".repeat(64),
    tags: [],
  });

  assert.equal(service.isAuthorMutedByTrusted(mutedAuthor), false);
  assert.deepEqual(service.getTrustedMutersForAuthor(mutedAuthor), []);
});

test("viewer mute list publishes and updates aggregation", async (t) => {
  const publishCalls = [];
  const nostrClient = {
    pool: {
      list: async () => [],
      sub: () => ({
        on: () => {},
        unsub: () => {},
      }),
      publish: (urls, event) => {
        publishCalls.push({ urls, event });
        return {
          on: (eventName, handler) => {
            if (eventName === "ok") {
              handler();
            }
          },
        };
      },
    },
    relays: ["wss://relay.example"],
    ensurePool: async () => {},
    ensureExtensionPermissions: async () => ({ ok: true }),
  };

  const service = new ModerationService({
    logger: () => {},
    nostrClient,
    userLogger: noopUserLogger,
  });

  const previousNostr = globalThis.window.nostr;
  globalThis.window.nostr = {
    async signEvent(event) {
      return { ...event, id: "signed-event-id" };
    },
  };

  t.after(() => {
    globalThis.window.nostr = previousNostr;
  });

  const viewerHex = "f".repeat(64);
  await service.setViewerPubkey(viewerHex);

  const targetHex = "e".repeat(64);

  await service.addAuthorToViewerMuteList(targetHex);

  assert.equal(service.isAuthorMutedByViewer(targetHex), true);
  assert.equal(service.isAuthorMutedByTrusted(targetHex), true);
  assert.deepEqual(service.getTrustedMutersForAuthor(targetHex), [viewerHex]);

  assert.equal(publishCalls.length, 1);
  const firstEvent = publishCalls[0].event;
  assert.equal(firstEvent.tags.length, 1);
  assert.deepEqual(firstEvent.tags[0], ["p", targetHex]);

  await service.removeAuthorFromViewerMuteList(targetHex);

  assert.equal(service.isAuthorMutedByViewer(targetHex), false);
  assert.equal(service.isAuthorMutedByTrusted(targetHex), false);
  assert.deepEqual(service.getTrustedMutersForAuthor(targetHex), []);

  assert.equal(publishCalls.length, 2);
  const secondEvent = publishCalls[1].event;
  assert.equal(secondEvent.tags.length, 0);
});
