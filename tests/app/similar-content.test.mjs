import { test } from "node:test";
import assert from "node:assert/strict";

import SimilarContentController from "../../js/ui/similarContentController.js";

function createAppStub({ videos = [] } = {}) {
  const videosMap = new Map();
  for (const video of videos) {
    if (video && typeof video.id === "string") {
      videosMap.set(video.id, video);
    }
  }

  const appStub = {
    videoListView: { currentVideos: videos },
    videosMap,
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
    deriveVideoPointerInfo(video) {
      if (video?.pointerInfo) {
        return video.pointerInfo;
      }
      if (typeof video?.pointerKey === "string" && video.pointerKey.trim()) {
        return { key: video.pointerKey.trim() };
      }
      return null;
    },
    isAuthorBlocked() {
      return false;
    },
  };

  const controller = new SimilarContentController({
    services: {
      nostrClient: {
        getActiveVideos: () => videos,
      },
    },
    callbacks: {
      isAuthorBlocked: (pubkey) => appStub.isAuthorBlocked(pubkey),
      decorateVideoModeration: (video) => video,
      decorateVideoCreatorIdentity: (video) => video,
    },
    state: {
      getVideoListView: () => appStub.videoListView,
      getVideosMap: () => appStub.videosMap,
    },
    helpers: {
      getKnownVideoPostedAt: (video) => appStub.getKnownVideoPostedAt(video),
      buildShareUrlFromEventId: (id) => appStub.buildShareUrlFromEventId(id),
      formatTimeAgo: (ts) => appStub.formatTimeAgo(ts),
    },
  });

  appStub.similarContentController = controller;
  appStub.computeSimilarContentCandidates = function (options) {
    return this.similarContentController.computeCandidates(options);
  };

  return appStub;
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

  const app = createAppStub({
    videos: [candidateA, candidateB, candidateC],
  });

  const matches = app.computeSimilarContentCandidates({
    activeVideo,
    maxItems: 5,
  });
  assert.equal(matches.length, 3);
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

  const app = createAppStub({ videos: [candidate] });
  const matches = app.computeSimilarContentCandidates({
    activeVideo,
    maxItems: 5,
  });
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

  const app = createAppStub({
    videos: [candidateWithTags, candidateWithoutTags],
  });

  const matches = app.computeSimilarContentCandidates({
    activeVideo,
    maxItems: 5,
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].video.id, "video-a");
});

test("filters NSFW and private videos when NSFW content is disabled", () => {
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

  const app = createAppStub({
    videos: [publicVideo, nsfwVideo, privateVideo],
  });

  const matches = app.computeSimilarContentCandidates({
    activeVideo,
    maxItems: 5,
  });
  assert.deepEqual(
    matches.map((entry) => entry.video.id),
    ["video-public"],
  );
});
