
import { normalizeHashtag } from "../js/utils/hashtagNormalization.js";
import { getVideoTags } from "../js/feedEngine/utils.js";

// Mock video object
function createMockVideo(tagCount) {
  const tags = [];
  for (let i = 0; i < tagCount; i++) {
    tags.push(["t", `tag${i}`]);
  }
  return {
    id: "video-" + Math.random(),
    tags: tags,
    nip71: {
      hashtags: ["extra1", "extra2"]
    }
  };
}

// Legacy Uncached collectVideoTags (for comparison)
function collectVideoTags(video) {
  const videoTags = new Set();

  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (Array.isArray(tag) && tag[0] === "t" && typeof tag[1] === "string") {
        const normalized = normalizeHashtag(tag[1]);
        if (normalized) {
          videoTags.add(normalized);
        }
      }
    }
  }

  if (Array.isArray(video.nip71?.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      if (typeof tag === "string") {
        const normalized = normalizeHashtag(tag);
        if (normalized) {
          videoTags.add(normalized);
        }
      }
    }
  }

  return videoTags;
}

// Benchmark
const VIDEOS_COUNT = 10000;
const TAGS_PER_VIDEO = 10;
const ITERATIONS = 100;

const videos = [];
for (let i = 0; i < VIDEOS_COUNT; i++) {
  videos.push(createMockVideo(TAGS_PER_VIDEO));
}

console.log(`Benchmarking with ${VIDEOS_COUNT} videos, ${ITERATIONS} iterations.`);

console.time("Uncached (collectVideoTags)");
for (let i = 0; i < ITERATIONS; i++) {
  for (const video of videos) {
    collectVideoTags(video);
  }
}
console.timeEnd("Uncached (collectVideoTags)");

console.time("Cached (getVideoTags) - First Run");
for (const video of videos) {
  getVideoTags(video);
}
console.timeEnd("Cached (getVideoTags) - First Run");

console.time("Cached (getVideoTags) - Second Run");
for (let i = 0; i < ITERATIONS - 1; i++) {
  for (const video of videos) {
    getVideoTags(video);
  }
}
console.timeEnd("Cached (getVideoTags) - Second Run");
