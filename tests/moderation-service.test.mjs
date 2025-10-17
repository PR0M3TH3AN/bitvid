import test from "node:test";
import assert from "node:assert/strict";
import { ModerationService } from "../js/services/moderationService.js";

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
