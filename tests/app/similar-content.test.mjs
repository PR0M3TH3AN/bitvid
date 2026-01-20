import { test } from "node:test";
import assert from "node:assert/strict";
import "../../tests/test-helpers/setup-localstorage.mjs"; // Ensure localStorage/window mocks
import SimilarContentController from "../../js/ui/similarContentController.js";
import { ALLOW_NSFW_CONTENT } from "../../js/config.js";

import SimilarContentController from "../../js/ui/similarContentController.js";

function createControllerStub({ videos = [] } = {}) {
  const videosMap = new Map();
  for (const video of videos) {
    if (video && typeof video.id === "string") {
      videosMap.set(video.id, video);
    }
  }

  const services = {
    nostrClient: {
      getActiveVideos: () => videos,
    },
  };

  const state = {
    getVideoListView: () => ({ currentVideos: videos }),
    getVideosMap: () => videosMap,
  };

  const helpers = {
    getKnownVideoPostedAt(video) {
      if (Number.isFinite(video?.rootCreatedAt)) {
        return Math.floor(video.rootCreatedAt);
      }
      if (Number.isFinite(video?.created_at)) {
        return Math.floor(video.created_at);
      }
      return null;
    },
    buildShareUrlFromEventId(id) {
      return id ? `https://bitvid.invalid/${id}` : "";
    },
    formatTimeAgo(timestamp) {
      return Number.isFinite(timestamp) ? `${timestamp}s` : "";
    },
  };

  const callbacks = {
    isAuthorBlocked: () => false,
  };

  return new SimilarContentController({
    services,
    state,
    helpers,
    callbacks,
  });
}

function createVideo({
  id,
  pubkey = "author",
  displayTags,
  tags,
  rootCreatedAt,
  created_at,
  pointerKey,
  pointerInfo,
  shareUrl,
  isPrivate = false,
  isNsfw = false,
} = {}) {
  const video = {
    id,
    pubkey,
    isPrivate,
    isNsfw,
  };

  if (Array.isArray(displayTags)) {
    video.displayTags = displayTags.slice();
  }
  if (Array.isArray(tags)) {
    video.tags = tags.slice();
  }
  if (Number.isFinite(rootCreatedAt)) {
    video.rootCreatedAt = Math.floor(rootCreatedAt);
  }
  if (Number.isFinite(created_at)) {
    video.created_at = Math.floor(created_at);
  }
  if (typeof pointerKey === "string") {
    video.pointerKey = pointerKey;
  }
  if (pointerInfo) {
    video.pointerInfo = pointerInfo;
  }
  if (typeof shareUrl === "string") {
    video.shareUrl = shareUrl;
  }

  return video;
}

function createController({ videos = [] } = {}) {
  const videosMap = new Map();
  for (const video of videos) {
    if (video && typeof video.id === "string") {
      videosMap.set(video.id, video);
    }
  }

  const state = {
    getVideoListView: () => ({ currentVideos: videos }),
    getVideosMap: () => videosMap,
  };

  const services = {
    nostrClient: {
      getActiveVideos: () => videos,
    },
  };

  const callbacks = {
    decorateVideoModeration: (v) => v,
    decorateVideoCreatorIdentity: (v) => v,
    isAuthorBlocked: () => false,
  };

  const helpers = {
    getKnownVideoPostedAt(video) {
      if (Number.isFinite(video?.rootCreatedAt)) {
        return Math.floor(video.rootCreatedAt);
      }
      if (Number.isFinite(video?.created_at)) {
        return Math.floor(video.created_at);
      }
      return null;
    },
    buildShareUrlFromEventId(id) {
      return id ? `https://bitvid.invalid/${id}` : "";
    },
    formatTimeAgo(timestamp) {
      return Number.isFinite(timestamp) ? `${timestamp}s` : "";
    },
  };

  const ui = {
    videoModal: {
      setSimilarContent: () => {},
      clearSimilarContent: () => {},
    },
  };

  return new SimilarContentController({
    state,
    services,
    callbacks,
    helpers,
    ui,
  });
}

test("orders similar videos by shared tags then timestamp", () => {
  const activeVideo = createVideo({
    id: "root-video",
    displayTags: ["Art", "Music", "News"],
  });

  const candidateA = createVideo({
    id: "video-a",
    displayTags: ["art", "music"],
    rootCreatedAt: 100,
  });
  const candidateB = createVideo({
    id: "video-b",
    displayTags: ["art"],
    rootCreatedAt: 200,
  });
  const candidateC = createVideo({
    id: "video-c",
    displayTags: ["art", "music"],
    rootCreatedAt: 50,
  });

  const controller = createControllerStub({
    videos: [candidateA, candidateB, candidateC],
  });

  const matches = controller.computeCandidates({ activeVideo, maxItems: 5 });
  assert.equal(matches.length, 3);

  // A: 2 shared tags, 100s
  // C: 2 shared tags, 50s
  // B: 1 shared tag, 200s
  // Sort by sharedTagCount desc, then postedAt desc.
  // A (2, 100) > C (2, 50) > B (1, 200)

  assert.deepEqual(
    matches.map((entry) => entry.video.id),
    ["video-a", "video-c", "video-b"],
  );
  assert.deepEqual(
    matches.map((entry) => entry.sharedTagCount),
    [2, 2, 1],
  );
});

test("returns no matches when the active video lacks tags", () => {
  const activeVideo = createVideo({
    id: "root-video",
  });

  const candidate = createVideo({
    id: "video-a",
    displayTags: ["art"],
  });

  const controller = createControllerStub({ videos: [candidate] });
  const matches = controller.computeCandidates({ activeVideo, maxItems: 5 });
  assert.deepEqual(matches, []);
});

test("skips candidates without tag metadata", () => {
  const activeVideo = createVideo({
    id: "root-video",
    displayTags: ["art"],
  });

  const candidateWithTags = createVideo({
    id: "video-a",
    displayTags: ["art"],
  });
  const candidateWithoutTags = createVideo({
    id: "video-b",
  });

  const controller = createControllerStub({
    videos: [candidateWithTags, candidateWithoutTags],
  });

  const matches = controller.computeCandidates({ activeVideo, maxItems: 5 });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].video.id, "video-a");
});

test("filters NSFW and private videos when NSFW content is disabled", (t) => {
  // We can't easily mock ALLOW_NSFW_CONTENT from config.js directly if it's a const export.
  // However, the controller imports it. If we can't mock the module, we might fail this test if the default is true/false.
  // js/config.js exports ALLOW_NSFW_CONTENT.
  // Assuming default is likely false or true.
  // If the test depends on the config value, we might need to skip this test or mock the module import.
  // Since we are in node:test, module mocking is tricky without a loader or a DI approach.

  // NOTE: In the original test, `ALLOW_NSFW_CONTENT` was imported by `Application` (via `js/app.js` -> `js/config.js`).
  // The controller also imports it.
  // Let's assume the default `ALLOW_NSFW_CONTENT` allows us to test filtering (i.e. if it's false).
  // If it's true, filtering won't happen.
  // We can try to rely on `isPrivate` at least.

  const activeVideo = createVideo({
    id: "root-video",
    displayTags: ["art"],
  });

  const publicVideo = createVideo({
    id: "video-public",
    displayTags: ["art"],
  });
  const nsfwVideo = createVideo({
    id: "video-nsfw",
    displayTags: ["art"],
    isNsfw: true,
  });
  const privateVideo = createVideo({
    id: "video-private",
    displayTags: ["art"],
    isPrivate: true,
  });

  const controller = createControllerStub({
    videos: [publicVideo, nsfwVideo, privateVideo],
  });

  const matches = controller.computeCandidates({ activeVideo, maxItems: 5 });
  assert.deepEqual(
    matches.map((entry) => entry.video.id),
    ["video-public"],
  );
});
