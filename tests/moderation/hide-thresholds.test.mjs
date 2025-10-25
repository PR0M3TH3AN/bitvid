import test from "node:test";
import assert from "node:assert/strict";

import { createModerationStage } from "../../js/feedEngine/stages.js";

const hex = (value) => value.repeat(64).slice(0, 64);

test("moderation stage hides videos muted by trusted when threshold met", async () => {
  const muterHex = hex("a");
  const mutedHex = hex("b");
  const videoId = hex("1");

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

  const stage = createModerationStage({
    service,
    trustedMuteHideThreshold: 1,
    trustedReportHideThreshold: 99,
  });

  const items = [{ video: { id: videoId, pubkey: mutedHex }, metadata: {} }];
  const why = [];
  const context = {
    runtime: {},
    addWhy(detail) {
      why.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 0);

  const metadata = items[0].metadata.moderation;
  assert.equal(metadata.hidden, true);
  assert.equal(metadata.hideReason, "trusted-mute-hide");
  assert.deepEqual(metadata.hideCounts, { trustedMuteCount: 1, trustedReportCount: 0 });
  assert.equal(metadata.hideBypass ?? null, null);

  const videoModeration = items[0].video.moderation;
  assert.equal(videoModeration.hidden, true);
  assert.equal(videoModeration.hideReason, "trusted-mute-hide");
  assert.deepEqual(videoModeration.hideCounts, { trustedMuteCount: 1, trustedReportCount: 0 });

  const hideWhy = why.find((entry) => entry.reason === "trusted-mute-hide");
  assert.ok(hideWhy);
  assert.equal(hideWhy.hidden, true);
  assert.equal(hideWhy.trustedMuteCount, 1);
  assert.equal(hideWhy.trustedReportCount, 0);
});

test("moderation stage hides videos when trusted reports exceed threshold", async () => {
  const reporterHex = hex("c");
  const videoId = hex("2");

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
      return 5;
    },
    getTrustedReporters() {
      return [{ pubkey: reporterHex, latest: 1_700_000_000 }];
    },
  };

  const stage = createModerationStage({
    service,
    trustedMuteHideThreshold: 50,
    trustedReportHideThreshold: 3,
  });

  const items = [{ video: { id: videoId, pubkey: hex("d") }, metadata: {} }];
  const why = [];
  const context = {
    runtime: {},
    addWhy(detail) {
      why.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 0);

  const metadata = items[0].metadata.moderation;
  assert.equal(metadata.hidden, true);
  assert.equal(metadata.hideReason, "trusted-report-hide");
  assert.deepEqual(metadata.hideCounts, { trustedMuteCount: 0, trustedReportCount: 5 });

  const videoModeration = items[0].video.moderation;
  assert.equal(videoModeration.hidden, true);
  assert.equal(videoModeration.hideReason, "trusted-report-hide");
  assert.deepEqual(videoModeration.hideCounts, { trustedMuteCount: 0, trustedReportCount: 5 });

  const hideWhy = why.find((entry) => entry.reason === "trusted-report-hide");
  assert.ok(hideWhy);
  assert.equal(hideWhy.hidden, true);
  assert.equal(hideWhy.trustedReportCount, 5);
  assert.equal(hideWhy.hideBypass ?? null, null);
});

test("moderation stage bypasses hard hides on home feed", async () => {
  const videoId = hex("3");

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

  const stage = createModerationStage({
    service,
    trustedMuteHideThreshold: 10,
    trustedReportHideThreshold: 1,
  });

  const items = [{ video: { id: videoId, pubkey: hex("e") }, metadata: {} }];
  const why = [];
  const context = {
    feedName: "home",
    runtime: { feedVariant: "home" },
    addWhy(detail) {
      why.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 1);

  const metadata = result[0].metadata.moderation;
  assert.equal(metadata.hidden, false);
  assert.equal(metadata.hideReason, "trusted-report-hide");
  assert.deepEqual(metadata.hideCounts, { trustedMuteCount: 0, trustedReportCount: 4 });
  assert.equal(metadata.hideBypass, "feed-policy");

  const hideWhy = why.find((entry) => entry.reason === "trusted-report-hide");
  assert.ok(hideWhy);
  assert.equal(hideWhy.hidden, false);
  assert.equal(hideWhy.hideBypass, "feed-policy");
});

test("moderation stage hides admin-whitelisted videos once thresholds fire", async () => {
  const whitelistedHex = hex("f");
  const videoId = hex("4");

  const service = {
    async refreshViewerFromClient() {},
    async setActiveEventIds() {},
    getAdminListSnapshot() {
      return {
        whitelist: new Set([`npub${whitelistedHex}`]),
        whitelistHex: new Set([whitelistedHex]),
        blacklist: new Set(),
        blacklistHex: new Set(),
      };
    },
    getAccessControlStatus(identifier) {
      const normalized = typeof identifier === "string" ? identifier.trim().toLowerCase() : "";
      return { hex: normalized, whitelisted: normalized === whitelistedHex, blacklisted: false };
    },
    getTrustedReportSummary() {
      return null;
    },
    trustedReportCount() {
      return 6;
    },
    getTrustedReporters() {
      return [];
    },
  };

  const stage = createModerationStage({
    service,
    trustedMuteHideThreshold: 1,
    trustedReportHideThreshold: 2,
  });

  const items = [{ video: { id: videoId, pubkey: whitelistedHex }, metadata: {} }];
  const why = [];
  const context = {
    runtime: {},
    addWhy(detail) {
      why.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 0);

  const metadata = items[0].metadata.moderation;
  assert.equal(metadata.hidden, true);
  assert.equal(metadata.hideReason, "trusted-report-hide");
  assert.equal(metadata.hideBypass ?? null, null);
  assert.equal(metadata.adminWhitelist, true);
  assert.deepEqual(metadata.hideCounts, { trustedMuteCount: 0, trustedReportCount: 6 });

  const videoModeration = items[0].video.moderation;
  assert.equal(videoModeration.hidden, true);
  assert.equal(videoModeration.hideReason, "trusted-report-hide");
  assert.equal(videoModeration.hideBypass ?? null, null);
  assert.deepEqual(videoModeration.hideCounts, { trustedMuteCount: 0, trustedReportCount: 6 });

  const hideWhy = why.find((entry) => entry.reason === "trusted-report-hide");
  assert.ok(hideWhy);
  assert.equal(hideWhy.hidden, true);
  assert.equal(hideWhy.hideBypass ?? null, null);
  assert.equal(hideWhy.adminWhitelist, true);
  assert.equal(hideWhy.trustedReportCount, 6);
});

