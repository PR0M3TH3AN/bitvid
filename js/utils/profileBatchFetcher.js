// js/utils/profileBatchFetcher.js

import { nostrClient } from "../nostrClientFacade.js";
import { devLogger } from "./logger.js";
import { fetchProfileMetadataBatch } from "../services/profileMetadataService.js";

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

  const profileResults = await fetchProfileMetadataBatch({
    pubkeys: toFetch,
    nostr,
    logger,
    defaultProfileImage,
  });

  profileResults.forEach((entry, pubkey) => {
    if (!entry?.profile) {
      return;
    }
    setProfileCacheEntry(pubkey, entry.profile);
    updateProfileInDOM(pubkey, entry.profile);
  });
}
