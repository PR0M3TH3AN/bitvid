// js/utils/profileBatchFetcher.js

import { nostrClient } from "../nostr.js";
import { devLogger } from "./logger.js";

const DEFAULT_PROFILE_IMAGE = "assets/svg/default-profile.svg";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

export async function batchFetchProfilesFromRelays({
  authorSet,
  getProfileCacheEntry,
  setProfileCacheEntry,
  updateProfileInDOM,
  nostr = nostrClient,
  logger = devLogger,
  hex64Regex = HEX64_REGEX,
  defaultProfileImage = DEFAULT_PROFILE_IMAGE,
} = {}) {
  if (typeof getProfileCacheEntry !== "function") {
    throw new TypeError("getProfileCacheEntry callback is required");
  }
  if (typeof setProfileCacheEntry !== "function") {
    throw new TypeError("setProfileCacheEntry callback is required");
  }
  if (typeof updateProfileInDOM !== "function") {
    throw new TypeError("updateProfileInDOM callback is required");
  }

  const pubkeys = Array.isArray(authorSet)
    ? authorSet
    : Array.from(authorSet || []);
  if (!pubkeys.length) {
    return;
  }

  const toFetch = [];

  pubkeys.forEach((pubkey) => {
    const normalizedPubkey =
      typeof pubkey === "string" ? pubkey.trim() : "";
    const hasValidPubkey =
      normalizedPubkey && hex64Regex.test(normalizedPubkey);

    if (!hasValidPubkey) {
      return;
    }

    const cacheEntry = getProfileCacheEntry(normalizedPubkey);
    if (cacheEntry) {
      updateProfileInDOM(normalizedPubkey, cacheEntry.profile);
    } else {
      toFetch.push(normalizedPubkey);
    }
  });

  if (!toFetch.length) {
    return;
  }

  if (!nostr?.pool || typeof nostr.pool.list !== "function") {
    logger.warn(
      "[batchFetchProfiles] Relay pool is not ready; skipping profile fetch.",
    );
    return;
  }

  const filter = {
    kinds: [0],
    authors: toFetch,
    limit: toFetch.length,
  };

  const newestProfiles = new Map();

  const applyProfileEvent = (evt, relayUrl) => {
    if (!evt || typeof evt !== "object") {
      return;
    }

    const pubkey =
      typeof evt.pubkey === "string" && hex64Regex.test(evt.pubkey)
        ? evt.pubkey
        : null;
    if (!pubkey) {
      return;
    }

    const createdAt = Number.isFinite(evt.created_at) ? evt.created_at : 0;
    const previous = newestProfiles.get(pubkey);
    if (previous && previous.createdAt >= createdAt) {
      return;
    }

    try {
      const data = JSON.parse(evt.content);
      const profile = {
        name: data?.name || data?.display_name || "Unknown",
        picture: data?.picture || defaultProfileImage,
      };

      newestProfiles.set(pubkey, { createdAt, profile });
      setProfileCacheEntry(pubkey, profile);
      updateProfileInDOM(pubkey, profile);
    } catch (error) {
      logger.warn(
        `[batchFetchProfiles] Profile parse error for ${pubkey} from ${relayUrl}:`,
        error,
      );
    }
  };

  const relayPromises = (Array.isArray(nostr.relays) ? nostr.relays : []).map(
    (relayUrl) =>
      nostr.pool
        .list([relayUrl], [filter])
        .then((events) => ({ relayUrl, events })),
  );

  if (!relayPromises.length) {
    logger.warn(
      "[batchFetchProfiles] No relays configured; skipping profile fetch.",
    );
    return;
  }

  const results = await Promise.allSettled(relayPromises);

  results.forEach((result, index) => {
    const relayUrl =
      result.status === "fulfilled"
        ? result.value.relayUrl
        : nostr.relays[index];

    if (result.status === "fulfilled") {
      const events = Array.isArray(result.value.events)
        ? result.value.events
        : [];
      if (!events.length) {
        return;
      }

      const newestByPubkey = new Map();
      for (const evt of events) {
        if (!evt || typeof evt !== "object") {
          continue;
        }
        const pubkey =
          typeof evt.pubkey === "string" && hex64Regex.test(evt.pubkey)
            ? evt.pubkey
            : null;
        if (!pubkey) {
          continue;
        }
        const createdAt = Number.isFinite(evt.created_at)
          ? evt.created_at
          : 0;
        const prior = newestByPubkey.get(pubkey);
        if (!prior || createdAt > prior.createdAt) {
          newestByPubkey.set(pubkey, { createdAt, event: evt });
        }
      }

      newestByPubkey.forEach(({ event }) => {
        applyProfileEvent(event, relayUrl);
      });
    } else if (relayUrl) {
      logger.warn(
        `[batchFetchProfiles] Failed to fetch profiles from relay ${relayUrl}:`,
        result.reason,
      );
    }
  });
}
