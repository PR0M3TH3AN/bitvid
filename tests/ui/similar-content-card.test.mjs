import test from "node:test";
import assert from "node:assert/strict";

import { SimilarContentCard } from "../../js/ui/components/SimilarContentCard.js";
import { formatShortNpub } from "../../js/utils/formatters.js";
import { createUiDom } from "./helpers/jsdom-test-helpers.mjs";

function createVideo(overrides = {}) {
  return {
    id: "video-123",
    title: "Sample Video",
    thumbnail: "https://cdn.example.com/thumb.jpg",
    moderation: {},
    ...overrides,
  };
}

function renderCard(t, options = {}) {
  const { document, window, cleanup } = createUiDom();
  t.after(cleanup);

  const { video: videoOverrides, ...rest } = options;

  const card = new SimilarContentCard({
    document,
    video: createVideo(videoOverrides),
    ...rest,
  });

  return { card, document, window };
}

test("cached thumbnails reuse existing src without lazy-loading", (t) => {
  const cachedSrc = "https://cdn.example.com/thumb.jpg";
  const cache = new Map([["video-123", cachedSrc]]);

  const { card, window } = renderCard(t, {
    thumbnailCache: cache,
    fallbackThumbnailSrc: "https://cdn.example.com/fallback.jpg",
  });

  const root = card.getRoot();
  const img = root.querySelector("img[data-video-thumbnail]");
  assert(img, "thumbnail element should exist");

  assert.equal(img.src, cachedSrc);
  assert.equal(img.dataset.lazy, undefined);
  assert.equal(
    window.getComputedStyle(root).getPropertyValue("--similar-card-thumb-url").trim(),
    `url("${cachedSrc}")`,
  );
});

test("uncached thumbnails use fallback, cache on load, and retain blur state", (t) => {
  const fallbackSrc = "https://cdn.example.com/fallback.jpg";
  const remoteThumb = "https://cdn.example.com/remote.jpg";
  const cache = new Map();

  const { card, window } = renderCard(t, {
    video: {
      id: "video-456",
      thumbnail: remoteThumb,
      moderation: { blurThumbnail: true },
    },
    thumbnailCache: cache,
    fallbackThumbnailSrc: fallbackSrc,
  });

  const root = card.getRoot();
  const img = root.querySelector("img[data-video-thumbnail]");
  assert(img);

  assert.equal(img.getAttribute("src"), fallbackSrc);
  assert.equal(img.dataset.fallbackSrc, fallbackSrc);
  assert.equal(img.dataset.lazy, remoteThumb);
  assert.equal(img.dataset.thumbnailState, "blurred");
  assert.equal(
    window.getComputedStyle(root).getPropertyValue("--similar-card-thumb-url").trim(),
    `url("${fallbackSrc}")`,
  );

  img.src = remoteThumb;
  img.dispatchEvent(new window.Event("load"));

  assert.equal(cache.get("video-456"), remoteThumb);
  assert.equal(
    window.getComputedStyle(root).getPropertyValue("--similar-card-thumb-url").trim(),
    `url("${remoteThumb}")`,
  );
  assert.equal(img.dataset.thumbnailState, "blurred");
});

test("primary clicks trigger onPlay while modifiers and right clicks do not", (t) => {
  const { card, window } = renderCard(t, {
    video: { id: "video-play" },
  });

  let callCount = 0;
  card.onPlay = (payload) => {
    callCount += 1;
    assert.equal(payload.video.id, "video-play");
  };

  const mediaLink = card.getRoot().querySelector("a[data-primary-action=play]");
  const titleLink = card.getRoot().querySelector(
    ".player-modal__similar-card-title",
  );
  assert(mediaLink);
  assert(titleLink);

  mediaLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 0 }),
  );
  assert.equal(callCount, 1);

  mediaLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 0, metaKey: true }),
  );
  mediaLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 2 }),
  );
  assert.equal(callCount, 1);

  titleLink.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, button: 0 }),
  );
  assert.equal(callCount, 2);
});

test("author identity fields render supplied values and datasets", (t) => {
  const identity = {
    name: "Satoshi Nakamoto",
    npub: "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    pubkey: "pubkey-satoshi",
    picture: "https://cdn.example.com/avatar.png",
  };

  const { card } = renderCard(t, {
    video: { id: "identity" },
    identity,
  });

  const root = card.getRoot();
  const nameEl = root.querySelector(".author-name");
  const npubEl = root.querySelector(".author-npub");
  const avatarEl = root.querySelector(
    ".player-modal__similar-card-avatar-img",
  );

  assert(nameEl);
  assert(npubEl);
  assert(avatarEl);

  assert.equal(nameEl.textContent, identity.name);
  assert.equal(nameEl.dataset.pubkey, identity.pubkey);

  const expectedShort = formatShortNpub(identity.npub);
  assert.equal(npubEl.textContent, expectedShort);
  assert.equal(npubEl.dataset.pubkey, identity.pubkey);
  assert.equal(npubEl.dataset.npub, identity.npub);
  assert.equal(npubEl.getAttribute("title"), identity.npub);
  assert.equal(npubEl.hidden, false);
  assert.equal(npubEl.getAttribute("aria-hidden"), "false");

  assert.equal(avatarEl.dataset.pubkey, identity.pubkey);
  assert.equal(avatarEl.src, identity.picture);
  assert.match(avatarEl.alt, /Satoshi/);
});

test("view counter wiring exposes pointer datasets", (t) => {
  const pointerInfo = {
    key: "views:123",
    pointer: ["a", "kind:views", "wss://relay.example"],
  };

  const { card } = renderCard(t, {
    video: { id: "views" },
    pointerInfo,
  });

  const viewEl = card.getViewCountElement();
  assert(viewEl);
  assert.equal(viewEl.dataset.viewPointer, pointerInfo.key);
  assert.equal(viewEl.dataset.viewCount, "");
  assert.equal(viewEl.textContent, "– views");

  const root = card.getRoot();
  assert.equal(root.dataset.pointerKey, pointerInfo.key);
  assert.equal(root.dataset.pointerType, pointerInfo.pointer[0]);
  assert.equal(root.dataset.pointerValue, pointerInfo.pointer[1]);
  assert.equal(root.dataset.pointerRelay, pointerInfo.pointer[2]);
});
