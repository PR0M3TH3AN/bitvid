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

test("moderation stage annotates trusted mute metadata", async () => {
  const mutedHex = "9".repeat(64);
  const muterHex = "8".repeat(64);

  const service = {
    async refreshViewerFromClient() {},
    async setActiveEventIds() {},
    getAdminListSnapshot() {
      return { whitelist: new Set(), whitelistHex: new Set(), blacklist: new Set(), blacklistHex: new Set() };
    },
    getAccessControlStatus(identifier) {
      return { hex: identifier, whitelisted: false, blacklisted: false };
    },
    getTrustedReportSummary() {
      return null;
    },
    trustedReportCount() {
      return 0;
    },
    getTrustedReporters() {
      return [];
    },
    isAuthorMutedByTrusted(pubkey) {
      return pubkey === mutedHex;
    },
    getTrustedMutersForAuthor(pubkey) {
      return pubkey === mutedHex ? [muterHex] : [];
    },
  };

  const stage = createModerationStage({ service });

  const items = [
    { video: { id: "muted", pubkey: mutedHex }, metadata: {} },
    { video: { id: "normal", pubkey: "7".repeat(64) }, metadata: {} },
  ];

  const reasons = [];
  const context = {
    addWhy(detail) {
      reasons.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 2);

  const mutedItem = result.find((entry) => entry.video.id === "muted");
  assert.ok(mutedItem);
  assert.equal(mutedItem.video.moderation.trustedMuted, true);
  assert.deepEqual(mutedItem.video.moderation.trustedMuters, [muterHex]);
  assert.equal(mutedItem.video.moderation.trustedMuteCount, 1);
  assert.equal(mutedItem.metadata.moderation.trustedMuted, true);
  assert.equal(mutedItem.metadata.moderation.trustedMuteCount, 1);

  const trustedMuteReason = reasons.find((entry) => entry.reason === "trusted-mute");
  assert.ok(trustedMuteReason);
  assert.equal(trustedMuteReason.videoId, "muted");
});
