import test from "node:test";
import assert from "node:assert/strict";
import { createModerationStage } from "../js/feedEngine/stages.js";

test("moderation stage enforces admin lists and whitelist bypass", async () => {
  const whitelistedHex = "1".repeat(64);
  const blockedHex = "2".repeat(64);
  const blacklistedHex = "3".repeat(64);
  const normalHex = "4".repeat(64);

  const service = {
    async refreshViewerFromClient() {},
    async setActiveEventIds() {},
    getAdminListSnapshot() {
      return {
        whitelist: new Set([`npub${whitelistedHex}`]),
        whitelistHex: new Set([whitelistedHex]),
        blacklist: new Set([`npub${blacklistedHex}`]),
        blacklistHex: new Set([blacklistedHex]),
      };
    },
    getAccessControlStatus(identifier) {
      const normalized = typeof identifier === "string" ? identifier.trim().toLowerCase() : "";
      if (normalized === whitelistedHex) {
        return { hex: whitelistedHex, whitelisted: true, blacklisted: false };
      }
      if (normalized === blacklistedHex) {
        return { hex: blacklistedHex, whitelisted: false, blacklisted: true };
      }
      if (normalized === blockedHex) {
        return { hex: blockedHex, whitelisted: false, blacklisted: false };
      }
      if (normalized === normalHex) {
        return { hex: normalHex, whitelisted: false, blacklisted: false };
      }
      return { hex: normalized, whitelisted: false, blacklisted: false };
    },
    getTrustedReportSummary() {
      return null;
    },
    trustedReportCount(videoId) {
      if (videoId === "c") {
        return 5;
      }
      if (videoId === "d") {
        return 3;
      }
      return 0;
    },
    getTrustedReporters() {
      return [];
    },
  };

  const stage = createModerationStage({
    service,
    reportType: "nudity",
    autoplayThreshold: 2,
    blurThreshold: 3,
  });

  const items = [
    { video: { id: "a", pubkey: blockedHex }, metadata: {} },
    { video: { id: "b", pubkey: blacklistedHex }, metadata: {} },
    { video: { id: "c", pubkey: whitelistedHex }, metadata: {} },
    { video: { id: "d", pubkey: normalHex }, metadata: {} },
  ];

  const why = [];
  const context = {
    feedName: "discovery",
    runtime: {
      isAuthorBlocked: (pubkey) => pubkey === blockedHex,
    },
    addWhy(detail) {
      why.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((entry) => entry.video.id),
    ["c", "d"]
  );

  const whitelistedItem = result[0];
  assert.equal(whitelistedItem.video.moderation.blockAutoplay, false);
  assert.equal(whitelistedItem.video.moderation.blurThumbnail, false);
  assert.equal(whitelistedItem.video.moderation.adminWhitelist, true);
  assert.equal(whitelistedItem.video.moderation.adminWhitelistBypass, true);
  assert.equal(whitelistedItem.metadata.moderation.adminWhitelistBypass, true);

  const normalItem = result[1];
  assert.equal(normalItem.video.moderation.blockAutoplay, true);
  assert.equal(normalItem.video.moderation.blurThumbnail, true);

  const reasons = why.map((entry) => entry.reason);
  assert(reasons.includes("viewer-block"));
  assert(reasons.includes("admin-blacklist"));
  assert(reasons.includes("blur"));
});
