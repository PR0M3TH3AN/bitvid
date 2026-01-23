import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import "../../../tests/test-helpers/setup-localstorage.mjs";
import { VideoCard } from "../../../js/ui/components/VideoCard.js";
import { clearModerationOverride, setModerationOverride } from "../../../js/state/cache.js";
import {
  withMockedNostrTools,
  createModerationAppHarness,
} from "../../../tests/helpers/moderation-test-helpers.mjs";
import {
  applyModerationContextDatasets,
  normalizeVideoModerationContext,
} from "../../../js/ui/moderationUiHelpers.js";
import { buildModerationBadgeText } from "../../../js/ui/moderationCopy.js";
import { userBlocks } from "../../../js/userBlocks.js";

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

  // Mock navigator safely
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    writable: true,
    configurable: true,
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
    // Restore navigator
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  return { window, document: window.document };
}

// Reproducer for skipped test: "VideoCard block action restores trusted mute hide state after override"
test("VideoCard block action restores trusted mute hide state after override", async (t) => {
  const { document } = setupDom(t);
  withMockedNostrTools(t);

  const app = await createModerationAppHarness();
  app.getActiveModerationThresholds = () => ({
    autoplayBlockThreshold: Number.POSITIVE_INFINITY,
    blurThreshold: Number.POSITIVE_INFINITY,
    trustedMuteHideThreshold: 1,
    trustedSpamHideThreshold: Number.POSITIVE_INFINITY,
  });
  app.pubkey = "f".repeat(64);
  app.isUserLoggedIn = () => true;
  app.showStatus = () => {};
  app.showError = () => {};
  app.onVideosShouldRefresh = async () => {};

  const originalEnsureLoaded = userBlocks.ensureLoaded;
  const originalAddBlock = userBlocks.addBlock;
  const originalIsBlocked = userBlocks.isBlocked;

  userBlocks.ensureLoaded = async () => {};
  userBlocks.addBlock = async () => ({ ok: true });
  userBlocks.isBlocked = () => false;

  t.after(() => {
    userBlocks.ensureLoaded = originalEnsureLoaded;
    userBlocks.addBlock = originalAddBlock;
    userBlocks.isBlocked = originalIsBlocked;
  });

  const videoId = "d".repeat(64);
  const video = {
    id: videoId,
    title: "Muted Hide Clip",
    pubkey: "e".repeat(64),
    moderation: {
      trustedMuted: true,
      trustedMuteCount: 1,
      trustedMuters: ["f".repeat(64)],
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

  assert.equal(
    normalizeVideoModerationContext(card.video?.moderation).activeHidden,
    true,
  );
  assert.equal(card.getRoot().dataset.moderationHidden, "true");

  card.onModerationOverride = ({ video: overrideVideo, card: overrideCard }) =>
    app.handleModerationOverride({ video: overrideVideo, card: overrideCard });

  card.moderationActionButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const contextAfterOverride = normalizeVideoModerationContext(
    card.video?.moderation,
  );
  assert.equal(contextAfterOverride.overrideActive, true);
  assert.equal(contextAfterOverride.activeHidden, false);
  assert.ok(card.moderationBlockButton);

  card.onModerationBlock = ({ video: targetVideo, card: targetCard }) =>
    app.handleModerationBlock({ video: targetVideo, card: targetCard });

  card.moderationBlockButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const contextAfterHide = normalizeVideoModerationContext(card.video?.moderation);
  assert.equal(contextAfterHide.overrideActive, false);
  assert.equal(contextAfterHide.activeHidden, true);
  assert.equal(card.getRoot().dataset.moderationHidden, "true");
  assert.equal(card.moderationBlockButton, null);
});
