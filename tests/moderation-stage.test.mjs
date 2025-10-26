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
  assert.equal(whitelistedItem.video.moderation.blurReason, "trusted-report");
  assert.equal(whitelistedItem.metadata.moderation.blurReason, "trusted-report");
  assert.equal(whitelistedItem.video.moderation.adminWhitelist, true);
  assert.equal(whitelistedItem.video.moderation.adminWhitelistBypass, false);
  assert.equal(whitelistedItem.metadata.moderation.adminWhitelistBypass, false);

  const normalItem = result[1];
  assert.equal(normalItem.video.moderation.blockAutoplay, true);
  assert.equal(normalItem.video.moderation.blurThumbnail, true);
  assert.equal(normalItem.video.moderation.blurReason, "trusted-report");
  assert.equal(normalItem.metadata.moderation.blurReason, "trusted-report");

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
  assert.equal(strictResult[0].video.moderation.blurReason, undefined);

  const relaxedResult = await relaxedStage(items, {});
  assert.equal(relaxedResult.length, 1);
  assert.equal(relaxedResult[0].video.moderation.blockAutoplay, true);
  assert.equal(relaxedResult[0].video.moderation.blurThumbnail, true);
  assert.equal(relaxedResult[0].video.moderation.blurReason, "trusted-report");
  assert.equal(relaxedResult[0].metadata.moderation.blurReason, "trusted-report");
});

test("moderation stage respects runtime threshold changes", async () => {
  const videoId = "runtime-threshold";
  const authorHex = "e".repeat(64);

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
      return 3;
    },
    getTrustedReporters() {
      return [];
    },
  };

  const stage = createModerationStage({ service });

  const strictContext = {
    runtime: {
      moderationThresholds: {
        autoplayBlockThreshold: 1,
        blurThreshold: 1,
        trustedMuteHideThreshold: Number.POSITIVE_INFINITY,
        trustedSpamHideThreshold: 2,
      },
    },
    addWhy() {},
    log() {},
  };

  const relaxedContext = {
    runtime: {
      moderationThresholds: {
        autoplayBlockThreshold: 5,
        blurThreshold: 5,
        trustedMuteHideThreshold: Number.POSITIVE_INFINITY,
        trustedSpamHideThreshold: 10,
      },
    },
    addWhy() {},
    log() {},
  };

  const buildItem = () => ({ video: { id: videoId, pubkey: authorHex }, metadata: {} });

  const hiddenItems = [buildItem()];
  const hiddenResult = await stage(hiddenItems, strictContext);

  assert.equal(hiddenResult.length, 0);
  const hiddenMetadata = hiddenItems[0].metadata.moderation;
  assert.equal(hiddenMetadata.hidden, true);
  assert.equal(hiddenMetadata.hideReason, "trusted-report-hide");
  assert.equal(hiddenMetadata.blockAutoplay, true);
  assert.equal(hiddenMetadata.blurThumbnail, true);

  const visibleItems = [buildItem()];
  const visibleResult = await stage(visibleItems, relaxedContext);

  assert.equal(visibleResult.length, 1);
  const visibleModeration = visibleResult[0].video.moderation;
  assert.equal(visibleModeration.hidden, false);
  assert.equal(visibleModeration.blockAutoplay, false);
  assert.equal(visibleModeration.blurThumbnail, false);
});

test("moderation stage supports function-based threshold resolvers", async () => {
  const videoId = "resolver-threshold";
  const authorHex = "f".repeat(64);

  let autoplaySetting = 5;
  let blurSetting = 6;
  let hideSetting = Number.POSITIVE_INFINITY;

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
      return 2;
    },
    getTrustedReporters() {
      return [];
    },
  };

  const stage = createModerationStage({
    service,
    autoplayThreshold: () => autoplaySetting,
    blurThreshold: () => blurSetting,
    trustedReportHideThreshold: () => hideSetting,
  });

  const createContext = () => ({ addWhy() {}, log() {} });
  const buildItem = () => ({ video: { id: videoId, pubkey: authorHex }, metadata: {} });

  const relaxedItems = [buildItem()];
  const relaxedResult = await stage(relaxedItems, createContext());

  assert.equal(relaxedResult.length, 1);
  const relaxedModeration = relaxedResult[0].video.moderation;
  assert.equal(relaxedModeration.blockAutoplay, false);
  assert.equal(relaxedModeration.blurThumbnail, false);
  assert.equal(relaxedModeration.hidden, false);

  autoplaySetting = 1;
  blurSetting = 1;
  hideSetting = 1;

  const strictItems = [buildItem()];
  const strictResult = await stage(strictItems, createContext());

  assert.equal(strictResult.length, 0);
  const strictMetadata = strictItems[0].metadata.moderation;
  assert.equal(strictMetadata.blockAutoplay, true);
  assert.equal(strictMetadata.blurThumbnail, true);
  assert.equal(strictMetadata.hidden, true);
  assert.equal(strictMetadata.hideReason, "trusted-report-hide");
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
  assert.equal(whitelistedItem.metadata.moderation.blurReason, "trusted-report");
  assert.equal(whitelistedItem.video.moderation.adminWhitelistBypass, false);
  assert.equal(whitelistedItem.video.moderation.blurReason, "trusted-report");

  assert.equal(mutedItem.metadata.moderation.trustedMuted, true);
  assert.deepEqual(mutedItem.metadata.moderation.trustedMuters, [muterHex]);
  assert.equal(mutedItem.metadata.moderation.blockAutoplay, true);
  assert.equal(mutedItem.metadata.moderation.blurThumbnail, true);
  assert.equal(mutedItem.metadata.moderation.blurReason, "trusted-report");
  assert.equal(mutedItem.video.moderation.trustedMuted, true);
  assert.deepEqual(mutedItem.video.moderation.trustedMuters, [muterHex]);
  assert.equal(mutedItem.video.moderation.blurReason, "trusted-report");

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
  assert.equal(updatedMuted.metadata.moderation.blurReason, undefined);
  assert.equal(updatedMuted.video.moderation.trustedMuted, false);
  assert.equal(updatedMuted.video.moderation.blockAutoplay, false);
  assert.equal(updatedMuted.video.moderation.blurThumbnail, false);
  assert.equal(updatedMuted.video.moderation.blurReason, undefined);
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
