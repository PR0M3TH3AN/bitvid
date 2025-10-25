import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import "../test-helpers/setup-localstorage.mjs";
import { VideoCard } from "../../js/ui/components/VideoCard.js";
import { clearModerationOverride, setModerationOverride } from "../../js/state/cache.js";
import {
  withMockedNostrTools,
  createModerationAppHarness,
} from "../helpers/moderation-test-helpers.mjs";

function setupDom(t) {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://example.com",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const previous = new Map();
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "MouseEvent",
    "CustomEvent",
    "ResizeObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "navigator",
  ];

  keys.forEach((key) => {
    const hadValue = Object.prototype.hasOwnProperty.call(globalThis, key);
    previous.set(key, hadValue ? globalThis[key] : Symbol.for("__undefined__"));
    if (key === "requestAnimationFrame" && typeof window[key] !== "function") {
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    } else if (key === "cancelAnimationFrame" && typeof window[key] !== "function") {
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    } else if (key === "ResizeObserver" && typeof window[key] !== "function") {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    globalThis[key] = window[key];
  });

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  }

  if (!window.ResizeObserver) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverStub;
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  t.after(() => {
    dom.window.close();
    keys.forEach((key) => {
      const previousValue = previous.get(key);
      if (previousValue === Symbol.for("__undefined__")) {
        delete globalThis[key];
      } else {
        globalThis[key] = previousValue;
      }
    });
  });

  return { window, document: window.document };
}

test("VideoCard renders moderation badges and respects viewer override", async (t) => {
  const { document } = setupDom(t);
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  const videoId = "a".repeat(64);

  const video = {
    id: videoId,
    title: "Blurred Clip",
    pubkey: "d".repeat(64),
    moderation: {
      blockAutoplay: true,
      blurThumbnail: true,
      reportType: "nudity",
      trustedCount: 3,
      summary: {
        eventId: videoId,
        totalTrusted: 3,
        types: { nudity: { trusted: 3, total: 3, latest: 1_700_000_000 } },
        updatedAt: 1_700_000_100,
      },
      trustedReporters: [{ pubkey: "e".repeat(64), latest: 1_700_000_050 }],
      adminWhitelist: false,
      trustedMuted: false,
    },
  };

  t.after(() => {
    clearModerationOverride(video.id, { persist: false });
  });

  app.videosMap.set(video.id, video);
  app.currentVideo = video;
  app.decorateVideoModeration(video);

  const card = new VideoCard({
    document,
    video,
    formatters: {
      formatTimeAgo: () => "moments ago",
    },
    helpers: {
      isMagnetSupported: () => false,
    },
  });

  document.body.appendChild(card.getRoot());

  assert.equal(card.getRoot().dataset.autoplayPolicy, "blocked");
  assert.equal(card.thumbnailEl.dataset.thumbnailState, "blurred");
  assert.equal(card.getRoot().dataset.moderationReportCount, "3");
  assert.ok(card.moderationBadgeEl);
  assert.equal(card.moderationBadgeEl.dataset.moderationState, "hidden");
  assert.equal(card.getRoot().dataset.moderationHidden, "true");
  assert.equal(card.getRoot().dataset.moderationHideReason, "trusted-report-hide");
  assert.equal(card.getRoot().dataset.moderationHideTrustedReportCount, "3");
  assert.ok(card.hiddenSummaryEl);
  assert.equal(card.hiddenSummaryEl.parentElement, card.getRoot());
  assert.equal(card.anchorEl.hasAttribute("hidden"), true);
  assert.equal(card.contentEl.hasAttribute("hidden"), true);
  assert.ok(card.moderationActionButton);

  card.onModerationOverride = ({ video: overrideVideo }) => {
    app.videosMap.set(overrideVideo.id, overrideVideo);
    app.currentVideo = overrideVideo;
    setModerationOverride(overrideVideo.id, { showAnyway: true, updatedAt: Date.now() }, { persist: false });
    app.decorateVideoModeration(overrideVideo);
    card.refreshModerationUi();
    return true;
  };

  card.moderationActionButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const contextAfterOverride = card.getModerationContext();
  assert.equal(contextAfterOverride.overrideActive, true);
  assert.equal(contextAfterOverride.activeBlockAutoplay, false);

  assert.equal(card.getRoot().dataset.autoplayPolicy, undefined);
  assert.equal(card.getRoot().dataset.moderationOverride, "show-anyway");
  assert.equal(card.thumbnailEl.dataset.thumbnailState, undefined);
  assert.equal(card.moderationBadgeEl.dataset.moderationState, "override");
  assert.equal(card.getRoot().dataset.moderationHidden, undefined);
  assert.equal(card.getRoot().dataset.moderationHideReason, undefined);
  assert.equal(card.getRoot().dataset.moderationHideTrustedReportCount, undefined);
  assert.equal(card.anchorEl.hasAttribute("hidden"), false);
  assert.equal(card.contentEl.hasAttribute("hidden"), false);
  assert.ok(!card.hiddenSummaryEl || card.hiddenSummaryEl.parentElement !== card.getRoot());
  assert.ok(card.moderationBadgeEl.textContent.includes("Showing despite"));
});

test(
  "VideoCard hides content when hide metadata is present and override unmasks it",
  async (t) => {
    const { document } = setupDom(t);
    withMockedNostrTools(t);

    const app = await createModerationAppHarness();
    const videoId = "b".repeat(64);

    const video = {
      id: videoId,
      title: "Hidden Clip",
      pubkey: "c".repeat(64),
      moderation: {
        blockAutoplay: true,
        blurThumbnail: true,
        reportType: "spam",
        trustedCount: 3,
        trustedReporters: [
          { pubkey: "d".repeat(64), latest: 1_700_000_001 },
          { pubkey: "e".repeat(64), latest: 1_700_000_002 },
          { pubkey: "f".repeat(64), latest: 1_700_000_003 },
        ],
      },
    };

    t.after(() => {
      clearModerationOverride(video.id, { persist: false });
    });

    app.videosMap.set(video.id, video);
    app.currentVideo = video;
    app.decorateVideoModeration(video);

    const card = new VideoCard({
      document,
      video,
      formatters: {
        formatTimeAgo: () => "moments ago",
      },
      helpers: {
        isMagnetSupported: () => true,
      },
    });

    document.body.appendChild(card.getRoot());

    const contextBeforeOverride = card.getModerationContext();
    assert.equal(contextBeforeOverride.activeHidden, true);
    assert.equal(contextBeforeOverride.effectiveHideReason, "trusted-report-hide");
    assert.equal(contextBeforeOverride.allowOverride, true);

    assert.equal(card.getRoot().dataset.moderationHidden, "true");
    assert.equal(card.getRoot().dataset.moderationHideReason, "trusted-report-hide");
    assert.equal(card.getRoot().dataset.moderationHideTrustedReportCount, "3");
    assert.ok(card.hiddenSummaryEl);
    assert.equal(card.anchorEl.hasAttribute("hidden"), true);
    assert.equal(card.contentEl.hasAttribute("hidden"), true);
    assert.ok(card.moderationActionButton);
    assert.ok(card.moderationBadgeEl.textContent.includes("Hidden"));

    card.onModerationOverride = ({ video: overrideVideo, card: overrideCard }) =>
      app.handleModerationOverride({ video: overrideVideo, card: overrideCard });

    card.moderationActionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const contextAfterOverride = card.getModerationContext();
    assert.equal(contextAfterOverride.overrideActive, true);
    assert.equal(contextAfterOverride.activeHidden, false);
    assert.equal(contextAfterOverride.effectiveHideReason, "trusted-report-hide");

    assert.equal(card.getRoot().dataset.moderationHidden, undefined);
    assert.equal(card.getRoot().dataset.moderationOverride, "show-anyway");
    assert.equal(card.getRoot().dataset.moderationHideReason, undefined);
    assert.equal(card.getRoot().dataset.moderationHideTrustedReportCount, undefined);
    assert.equal(card.anchorEl.hasAttribute("hidden"), false);
    assert.equal(card.contentEl.hasAttribute("hidden"), false);
    assert.ok(!card.hiddenSummaryEl || card.hiddenSummaryEl.parentElement !== card.getRoot());
    assert.ok(card.moderationBadgeEl.textContent.includes("Showing despite"));
  },
);

test("VideoCard blurs thumbnails when trusted mute triggers without reports", async (t) => {
  const { document } = setupDom(t);
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  app.getActiveModerationThresholds = () => ({
    autoplayBlockThreshold: Number.POSITIVE_INFINITY,
    blurThreshold: Number.POSITIVE_INFINITY,
    trustedMuteHideThreshold: 2,
    trustedSpamHideThreshold: Number.POSITIVE_INFINITY,
  });
  const videoId = "c".repeat(64);

  const video = {
    id: videoId,
    title: "Muted Clip",
    pubkey: "d".repeat(64),
    moderation: {
      trustedMuted: true,
      trustedMuteCount: 1,
      blockAutoplay: false,
      blurThumbnail: false,
      trustedCount: 0,
      reportType: "nudity",
    },
  };

  app.videosMap.set(video.id, video);
  app.currentVideo = video;
  app.decorateVideoModeration(video);

  const card = new VideoCard({
    document,
    video,
    formatters: {
      formatTimeAgo: () => "moments ago",
    },
    helpers: {
      isMagnetSupported: () => false,
    },
  });

  document.body.appendChild(card.getRoot());

  assert.equal(video.moderation.blurThumbnail, true);
  assert.equal(video.moderation.blurReason, "trusted-mute");
  assert.equal(card.getModerationContext().activeBlur, true);
  assert.equal(card.thumbnailEl.dataset.thumbnailState, "blurred");
  assert.equal(card.moderationBadgeEl.dataset.moderationState, "trusted-mute");
  assert.equal(card.moderationBadgeTextEl.textContent, "Muted by a trusted contact");
});
