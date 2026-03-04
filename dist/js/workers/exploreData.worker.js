// js/workers/exploreData.worker.js

// Configure local NostrTools entrypoint for the bootstrap logic
self.__BITVID_LOCAL_NOSTR_TOOLS_ENTRY__ = "../../vendor/nostr-tools.bundle.min.js";

import { collectVideoTags } from "../utils/videoTags.js";
import { normalizePointerInput } from "../utils/pointerNormalization.js";
import { buildVideoAddressPointer } from "../utils/videoPointer.js";
import { normalizeHashtag } from "../utils/hashtagNormalization.js";

function normalizeAddressKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toLowerCase();
}

async function buildWatchHistoryTagCounts({ items, videosMap, videosArray }) {
  // videosMap is passed as an object or Map. Serialization converts Map to object?
  // Structured Clone Algorithm supports Map since recently.
  // Assuming browser supports Map transfer/clone.
  // If items are raw objects, we process them.

  const counts = new Map();
  if (!Array.isArray(items)) {
    return counts;
  }

  // Reconstruct Map if needed, but if we pass Map, it works.
  // However, videosMap might be huge.
  // If we pass array of videos, we can build a temporary map.

  let lookupMap = videosMap;
  if (Array.isArray(videosMap)) {
      lookupMap = new Map(videosMap.map(v => [v.id, v]));
  } else if (!(videosMap instanceof Map) && videosArray) {
      lookupMap = new Map(videosArray.map(v => [v.id, v]));
  }

  const needsAddressIndex = items.some((item) => {
    const pointer = normalizePointerInput(item?.pointer || item);
    return pointer?.type === "a";
  });

  let addressIndex = null;
  if (needsAddressIndex && lookupMap) {
    addressIndex = new Map();
    for (const video of lookupMap.values()) {
      const address = buildVideoAddressPointer(video);
      const key = normalizeAddressKey(address);
      if (key) {
        addressIndex.set(key, video);
      }
    }
  }

  for (let i = 0; i < items.length; i++) {
    const entry = items[i];
    const pointer = normalizePointerInput(entry?.pointer || entry);
    let video = entry?.video || entry?.metadata?.video || null;

    if (pointer?.type === "e" && pointer.value) {
      const eventId = typeof pointer.value === "string" ? pointer.value.trim() : "";
      if (eventId && lookupMap) {
        video = lookupMap.get(eventId) || lookupMap.get(eventId.toLowerCase()) || video;
      }
    } else if (pointer?.type === "a" && pointer.value && addressIndex) {
      const key = normalizeAddressKey(pointer.value);
      if (key && addressIndex.has(key)) {
        video = addressIndex.get(key);
      }
    }

    if (!video) {
      continue;
    }

    const tags = collectVideoTags(video);
    for (const tag of tags) {
      const normalized = normalizeHashtag(tag);
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }
  }

  return counts;
}

async function buildTagIdf({ videos }) {
  const idf = new Map();
  const list = Array.isArray(videos) ? videos : [];
  if (!list.length) {
    return idf;
  }

  const docFrequency = new Map();
  const totalDocs = list.length;

  for (let i = 0; i < list.length; i++) {
    const video = list[i];
    const tags = collectVideoTags(video);
    if (tags && (tags.length || tags.size)) {
      for (const tag of tags) {
        const normalized = normalizeHashtag(tag);
        if (normalized) {
          docFrequency.set(normalized, (docFrequency.get(normalized) || 0) + 1);
        }
      }
    }
  }

  for (const [tag, df] of docFrequency.entries()) {
    const ratio = (totalDocs + 1) / (df + 1);
    const value = 1 + Math.log(ratio);
    if (Number.isFinite(value) && value > 0) {
      idf.set(tag, value);
    }
  }

  return idf;
}

self.onmessage = async (e) => {
  const { type, id, payload } = e.data;

  try {
    let result;
    if (type === 'CALC_HISTORY_COUNTS') {
      result = await buildWatchHistoryTagCounts(payload);
    } else if (type === 'CALC_IDF') {
      result = await buildTagIdf(payload);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
