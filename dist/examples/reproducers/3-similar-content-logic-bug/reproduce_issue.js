
import Application from "../../../js/app.js";
import assert from "assert";

// Mock the method we want to test by grabbing it from the prototype
// Note: We use the prototype because the test file did so.
const computeSimilarContent = Application.prototype.computeSimilarContentCandidates;

function createAppStub({ videos = [] } = {}) {
  const videosMap = new Map();
  for (const video of videos) {
    if (video && typeof video.id === "string") {
      videosMap.set(video.id, video);
    }
  }

  return {
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

function runTests() {
  console.log("Running Similar Content Logic Reproducer...\n");
  let failed = false;

  // Test 1: Ordering by shared tags then timestamp
  try {
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

    const matches = computeSimilarContent.call(app, { activeVideo, maxItems: 5 });

    if (matches.length !== 3) {
      throw new Error(`Expected 3 matches, got ${matches.length}`);
    }

    const ids = matches.map((entry) => entry.video.id);
    const counts = matches.map((entry) => entry.sharedTagCount);

    const expectedIds = ["video-a", "video-c", "video-b"];
    const expectedCounts = [2, 2, 1];

    if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
        throw new Error(`Order mismatch. Expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(ids)}`);
    }

     if (JSON.stringify(counts) !== JSON.stringify(expectedCounts)) {
        throw new Error(`Counts mismatch. Expected ${JSON.stringify(expectedCounts)}, got ${JSON.stringify(counts)}`);
    }

    console.log("PASS: orders similar videos by shared tags then timestamp");

  } catch (error) {
    console.error("FAIL: orders similar videos by shared tags then timestamp");
    console.error("  ", error.message);
    failed = true;
  }

  // Test 2: Skips candidates without tag metadata
  try {
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

    const matches = computeSimilarContent.call(app, { activeVideo, maxItems: 5 });

    if (matches.length !== 1) {
        throw new Error(`Expected 1 match, got ${matches.length}`);
    }
    if (matches[0].video.id !== "video-a") {
        throw new Error(`Expected 'video-a', got '${matches[0]?.video?.id}'`);
    }

    console.log("PASS: skips candidates without tag metadata");

  } catch (error) {
    console.error("FAIL: skips candidates without tag metadata");
     console.error("  ", error.message);
    failed = true;
  }

  // Test 3: Filters NSFW and private videos
  try {
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

    const matches = computeSimilarContent.call(app, { activeVideo, maxItems: 5 });

    const matchedIds = matches.map((entry) => entry.video.id);
    const expectedIds = ["video-public"];

    if (JSON.stringify(matchedIds) !== JSON.stringify(expectedIds)) {
        throw new Error(`Expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(matchedIds)}`);
    }

    console.log("PASS: filters NSFW and private videos when NSFW content is disabled");

  } catch (error) {
    console.error("FAIL: filters NSFW and private videos when NSFW content is disabled");
    console.error("  ", error.message);
    failed = true;
  }

  if (failed) {
    console.log("\nSummary: FAIL");
    process.exit(1);
  } else {
    console.log("\nSummary: PASS");
  }
}

runTests();
