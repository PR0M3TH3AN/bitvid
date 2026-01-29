import assert from "node:assert/strict";
import { SimilarContentCard } from "../../../js/ui/components/SimilarContentCard.js";
import { createUiDom } from "../../../tests/ui/helpers/jsdom-test-helpers.mjs";

console.log("Reproducing issue: Uncached thumbnails should use fallback and retain blur state");

const { document, window, cleanup } = createUiDom();
try {
  const fallbackSrc = "https://cdn.example.com/fallback.jpg";
  const remoteThumb = "https://cdn.example.com/remote.jpg";
  const cache = new Map();

  const card = new SimilarContentCard({
    document,
    video: {
      id: "video-456",
      title: "Test Video",
      thumbnail: remoteThumb,
      moderation: { blurThumbnail: true },
    },
    thumbnailCache: cache,
    fallbackThumbnailSrc: fallbackSrc,
  });

  const root = card.getRoot();
  const img = root.querySelector("img[data-video-thumbnail]");
  assert(img, "Thumbnail image should exist");

  const cssVar = window.getComputedStyle(root).getPropertyValue("--similar-card-thumb-url").trim();
  console.log(`CSS Variable: '${cssVar}'`);

  assert.equal(
    cssVar,
    `url("${fallbackSrc}")`,
    `CSS variable should be set to fallback src. Expected url("${fallbackSrc}"), got '${cssVar}'`
  );

  console.log("Test PASSED (Unexpectedly?)");
} catch (error) {
  console.error("Test FAILED (As expected for a reproducer):");
  console.error(error.message);
  process.exit(1);
} finally {
  cleanup();
}
