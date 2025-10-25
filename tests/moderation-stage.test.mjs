import test from "node:test";
import assert from "node:assert/strict";
import { createModerationStage } from "../js/feedEngine/stages.js";
import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
} from "../js/constants.js";

test("moderation stage enforces admin lists without whitelist bypass", async () => {
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
    autoplayThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    blurThreshold: DEFAULT_BLUR_THRESHOLD,
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
  assert.equal(whitelistedItem.video.moderation.blockAutoplay, true);
  assert.equal(whitelistedItem.video.moderation.blurThumbnail, true);
  assert.equal(whitelistedItem.video.moderation.adminWhitelist, true);
  assert.equal(whitelistedItem.video.moderation.adminWhitelistBypass, false);
  assert.equal(whitelistedItem.metadata.moderation.adminWhitelistBypass, false);

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

test("moderation stage applies provided thresholds", async () => {
  const videoId = "custom-threshold";
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
      return 4;
    },
    getTrustedReporters() {
      return [];
    },
  };

  const items = [{ video: { id: videoId, pubkey: "a".repeat(64) }, metadata: {} }];

  const strictStage = createModerationStage({
    service,
    autoplayThreshold: 5,
    blurThreshold: 6,
  });

  const relaxedStage = createModerationStage({
    service,
    autoplayThreshold: 1,
    blurThreshold: 1,
  });

  const strictResult = await strictStage(items, {});
  assert.equal(strictResult.length, 1);
  assert.equal(strictResult[0].video.moderation.blockAutoplay, false);
  assert.equal(strictResult[0].video.moderation.blurThumbnail, false);

  const relaxedResult = await relaxedStage(items, {});
  assert.equal(relaxedResult.length, 1);
  assert.equal(relaxedResult[0].video.moderation.blockAutoplay, true);
  assert.equal(relaxedResult[0].video.moderation.blurThumbnail, true);
});

test("moderation stage propagates whitelist, muters, and threshold updates", async () => {
  const whitelistedHex = "a".repeat(64);
  const mutedHex = "b".repeat(64);
  const muterHex = "c".repeat(64);

  const state = {
    whitelistHex: new Set([whitelistedHex]),
    summaryById: new Map([
      [
        "muted-video",
        {
          eventId: "muted-video",
          totalTrusted: 3,
          types: { nudity: { trusted: 3, total: 3, latest: 1_700_000_000 } },
          updatedAt: 1_700_000_100,
        },
      ],
    ]),
    trustedCounts: new Map([
      ["whitelisted-video", 4],
      ["muted-video", 3],
    ]),
    reportersById: new Map([
      ["muted-video", [{ pubkey: muterHex, latest: 1_700_000_050 }]],
    ]),
    mutedAuthors: new Set([mutedHex]),
    mutersByAuthor: new Map([[mutedHex, [muterHex]]]),
  };

  const service = {
    async refreshViewerFromClient() {},
    async setActiveEventIds() {},
    getAdminListSnapshot() {
      return {
        whitelist: new Set([`npub${whitelistedHex}`]),
        whitelistHex: new Set(state.whitelistHex),
        blacklist: new Set(),
        blacklistHex: new Set(),
      };
    },
    getAccessControlStatus(identifier) {
      const normalized = typeof identifier === "string" ? identifier.trim().toLowerCase() : "";
      return {
        hex: normalized,
        whitelisted: state.whitelistHex.has(normalized),
        blacklisted: false,
      };
    },
    getTrustedReportSummary(videoId) {
      return state.summaryById.get(videoId) || null;
    },
    trustedReportCount(videoId) {
      return state.trustedCounts.get(videoId) || 0;
    },
    getTrustedReporters(videoId) {
      return state.reportersById.get(videoId) || [];
    },
    isAuthorMutedByTrusted(pubkey) {
      return state.mutedAuthors.has(pubkey);
    },
    getTrustedMutersForAuthor(pubkey) {
      return state.mutersByAuthor.get(pubkey) || [];
    },
  };

  const stage = createModerationStage({
    service,
    autoplayThreshold: 1,
    blurThreshold: 1,
    reportType: "nudity",
  });

  const items = [
    { video: { id: "whitelisted-video", pubkey: whitelistedHex }, metadata: {} },
    { video: { id: "muted-video", pubkey: mutedHex }, metadata: {} },
  ];

  const reasons = [];
  const context = {
    feedName: "discovery",
    addWhy(detail) {
      reasons.push(detail);
      return detail;
    },
    log() {},
  };

  const firstPass = await stage(items, context);
  const whitelistedItem = firstPass.find((entry) => entry.video.id === "whitelisted-video");
  const mutedItem = firstPass.find((entry) => entry.video.id === "muted-video");

  assert.ok(whitelistedItem);
  assert.ok(mutedItem);

  assert.equal(whitelistedItem.metadata.moderation.adminWhitelist, true);
  assert.equal(whitelistedItem.metadata.moderation.blockAutoplay, true);
  assert.equal(whitelistedItem.metadata.moderation.blurThumbnail, true);
  assert.equal(whitelistedItem.video.moderation.adminWhitelistBypass, false);

  assert.equal(mutedItem.metadata.moderation.trustedMuted, true);
  assert.deepEqual(mutedItem.metadata.moderation.trustedMuters, [muterHex]);
  assert.equal(mutedItem.metadata.moderation.blockAutoplay, true);
  assert.equal(mutedItem.metadata.moderation.blurThumbnail, true);
  assert.equal(mutedItem.video.moderation.trustedMuted, true);
  assert.deepEqual(mutedItem.video.moderation.trustedMuters, [muterHex]);

  state.summaryById.set("muted-video", {
    eventId: "muted-video",
    totalTrusted: 0,
    types: { nudity: { trusted: 0, total: 0, latest: 1_700_000_500 } },
    updatedAt: 1_700_000_600,
  });
  state.trustedCounts.set("muted-video", 0);
  state.mutersByAuthor.set(mutedHex, []);
  state.mutedAuthors.delete(mutedHex);

  const secondPass = await stage(firstPass, context);
  const updatedMuted = secondPass.find((entry) => entry.video.id === "muted-video");

  assert.ok(updatedMuted);
  assert.equal(updatedMuted.metadata.moderation.trustedMuted, false);
  assert.deepEqual(updatedMuted.metadata.moderation.trustedMuters, []);
  assert.equal(updatedMuted.metadata.moderation.blockAutoplay, false);
  assert.equal(updatedMuted.metadata.moderation.blurThumbnail, false);
  assert.equal(updatedMuted.video.moderation.trustedMuted, false);
  assert.equal(updatedMuted.video.moderation.blockAutoplay, false);
  assert.equal(updatedMuted.video.moderation.blurThumbnail, false);
});

test("moderation stage clears cached reporters and muters after service signals", async () => {
  const reporterHex = "d".repeat(64);
  const muterHex = "e".repeat(64);
  const authorHex = "f".repeat(64);
  const videoId = "9".repeat(64);

  const listeners = new Map();

  const service = {
    reporters: [{ pubkey: reporterHex, latest: 1_700_000_100 }],
    muters: [muterHex],
    async refreshViewerFromClient() {},
    async setActiveEventIds() {},
    getAdminListSnapshot() {
      return { whitelist: new Set(), whitelistHex: new Set(), blacklist: new Set(), blacklistHex: new Set() };
    },
    getAccessControlStatus(identifier) {
      return { hex: identifier, whitelisted: false, blacklisted: false };
    },
    getTrustedReportSummary(targetId) {
      const trusted = this.reporters.length;
      return {
        eventId: targetId,
        totalTrusted: trusted,
        types: {
          nudity: {
            trusted,
            total: trusted,
            latest: this.reporters[0]?.latest ?? 0,
          },
        },
        updatedAt: Date.now(),
      };
    },
    trustedReportCount() {
      return this.reporters.length;
    },
    getTrustedReporters() {
      return this.reporters.slice();
    },
    isAuthorMutedByTrusted() {
      return this.muters.length > 0;
    },
    getTrustedMutersForAuthor() {
      return this.muters.slice();
    },
    on(eventName, handler) {
      if (typeof handler !== "function") {
        return () => {};
      }
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      const bucket = listeners.get(eventName);
      bucket.add(handler);
      return () => {
        bucket.delete(handler);
        if (!bucket.size) {
          listeners.delete(eventName);
        }
      };
    },
    emit(eventName, detail) {
      const bucket = listeners.get(eventName);
      if (!bucket) {
        return;
      }
      for (const handler of Array.from(bucket)) {
        handler(detail);
      }
    },
  };

  const stage = createModerationStage({ service, reportType: "nudity" });

  const context = {
    addWhy() {},
    log() {},
  };

  const items = [{ video: { id: videoId, pubkey: authorHex }, metadata: {} }];

  const firstPass = await stage(items, context);
  const firstVideo = firstPass[0].video;

  assert.equal(firstVideo.moderation.trustedCount, 1);
  assert.equal(firstVideo.moderation.trustedMuted, true);
  assert.deepEqual(firstVideo.moderation.trustedMuters, [muterHex]);
  assert.deepEqual(firstVideo.moderation.trustedReporters, [{ pubkey: reporterHex, latest: 1_700_000_100 }]);

  service.reporters = [];
  service.muters = [];
  service.emit("user-blocks", { action: "block", targetPubkey: reporterHex });
  service.emit("trusted-mutes", { total: 0 });

  const secondPass = await stage(firstPass, context);
  const updatedVideo = secondPass[0].video;
  const updatedMetadata = secondPass[0].metadata.moderation;

  assert.equal(updatedVideo.moderation.trustedCount, 0);
  assert.equal(updatedVideo.moderation.trustedMuted, false);
  assert.equal("trustedMuters" in updatedVideo.moderation, false);
  assert.equal("trustedReporters" in updatedVideo.moderation, false);
  assert.ok(Array.isArray(updatedMetadata.trustedReporters));
  assert.equal(updatedMetadata.trustedReporters.length, 0);
  assert.ok(Array.isArray(updatedMetadata.trustedMuters));
  assert.equal(updatedMetadata.trustedMuters.length, 0);
});
