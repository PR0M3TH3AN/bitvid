import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { SimilarContentCard } from "../../js/ui/components/SimilarContentCard.js";
import { formatShortNpub } from "../../js/utils/formatters.js";

function createDom() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://example.com/",
  });
  const { document } = dom.window;
  return {
    dom,
    document,
    window: dom.window,
    cleanup: () => dom.window.close(),
  };
}

function createVideo(overrides = {}) {
  return {
    id: "video-123",
    title: "Sample Video",
    thumbnail: "https://cdn.example.com/thumb.jpg",
    moderation: {},
    ...overrides,
  };
}

test("uses cached thumbnails without lazy-loading and preserves backdrop", (t) => {
  const { document, cleanup } = createDom();
  t.after(cleanup);

  const cachedSrc = "https://cdn.example.com/thumb.jpg";
  const cache = new Map([["video-123", cachedSrc]]);

  const card = new SimilarContentCard({
    document,
    video: createVideo(),
    thumbnailCache: cache,
    fallbackThumbnailSrc: "https://cdn.example.com/fallback.jpg",
  });

  const root = card.getRoot();
  const img = root.querySelector("img[data-video-thumbnail]");
  assert(img, "thumbnail element should exist");

  assert.equal(img.src, cachedSrc);
  assert.equal(img.hasAttribute("data-lazy"), false);
  assert.equal(
    root.style.getPropertyValue("--similar-card-thumb-url"),
    `url("${cachedSrc}")`,
  );
});

test("lazy loads uncached thumbnails, caches on load, and keeps blur state", (t) => {
  const { document, window, cleanup } = createDom();
  t.after(cleanup);

  const fallback = "https://cdn.example.com/fallback.jpg";
  const remoteThumb = "https://cdn.example.com/remote.jpg";
  const cache = new Map();

  const card = new SimilarContentCard({
    document,
    video: createVideo({
      id: "video-456",
      thumbnail: remoteThumb,
      moderation: { blurThumbnail: true },
    }),
    thumbnailCache: cache,
    fallbackThumbnailSrc: fallback,
  });

  const root = card.getRoot();
  const img = root.querySelector("img[data-video-thumbnail]");
  assert(img);

  assert.equal(img.getAttribute("src"), fallback);
  assert.equal(img.dataset.lazy, remoteThumb);
  assert.equal(img.dataset.fallbackSrc, fallback);
  assert.equal(img.dataset.thumbnailState, "blurred");
  assert.equal(
    root.style.getPropertyValue("--similar-card-thumb-url"),
    `url("${fallback}")`,
  );

  img.src = remoteThumb;
  img.dispatchEvent(new window.Event("load"));

  assert.equal(cache.get("video-456"), remoteThumb);
  assert.equal(
    root.style.getPropertyValue("--similar-card-thumb-url"),
    `url("${remoteThumb}")`,
  );
  assert.equal(img.dataset.thumbnailState, "blurred");
});

test("primary clicks trigger onPlay, modifiers and right clicks do not", (t) => {
  const { document, window, cleanup } = createDom();
  t.after(cleanup);

  const card = new SimilarContentCard({
    document,
    video: createVideo({ id: "video-play" }),
  });

  let callCount = 0;
  let lastPayload = null;
  card.onPlay = (payload) => {
    callCount += 1;
    lastPayload = payload;
  };

  const mediaLink = card.getRoot().querySelector("a[data-primary-action=play]");
  assert(mediaLink);

  mediaLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 0 })
  );
  assert.equal(callCount, 1);
  assert.equal(lastPayload?.video?.id, "video-play");

  mediaLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 0, metaKey: true })
  );
  mediaLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 2 })
  );
  assert.equal(callCount, 1);

  const titleLink = card.getRoot().querySelector(
    ".player-modal__similar-card-title"
  );
  assert(titleLink);
  titleLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 0 })
  );
  assert.equal(callCount, 2);
});

test("renders author identity fields with provided datasets", (t) => {
  const { document, cleanup } = createDom();
  t.after(cleanup);

  const identity = {
    name: "Satoshi",
    npub: "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    pubkey: "pubkey-satoshi",
  };

  const card = new SimilarContentCard({
    document,
    video: createVideo({ id: "identity" }),
    identity,
  });

  const root = card.getRoot();
  const nameEl = root.querySelector(".author-name");
  const npubEl = root.querySelector(".author-npub");
  assert(nameEl);
  assert(npubEl);

  assert.equal(nameEl.textContent, identity.name);
  assert.equal(nameEl.dataset.pubkey, identity.pubkey);

  const expectedShort = formatShortNpub(identity.npub);
  assert.equal(npubEl.textContent, expectedShort);
  assert.equal(npubEl.dataset.pubkey, identity.pubkey);
  assert.equal(npubEl.getAttribute("title"), identity.npub);
  assert.equal(npubEl.getAttribute("aria-hidden"), "false");
});

test("exposes view count element wired to pointer info", (t) => {
  const { document, cleanup } = createDom();
  t.after(cleanup);

  const pointerInfo = {
    key: "views:123",
    pointer: ["a", "b", "wss://relay.example"],
  };

  const card = new SimilarContentCard({
    document,
    video: createVideo({ id: "views" }),
    pointerInfo,
  });

  const viewEl = card.getViewCountElement();
  assert(viewEl);
  assert.equal(viewEl.dataset.viewPointer, pointerInfo.key);
  assert.equal(viewEl.dataset.viewCount, "");
  assert.equal(viewEl.textContent, "– views");
});
