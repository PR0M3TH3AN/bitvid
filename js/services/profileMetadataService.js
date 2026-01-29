import { nostrClient } from "../nostrClientFacade.js";
import { devLogger } from "../utils/logger.js";

const DEFAULT_PROFILE_IMAGE = "assets/svg/default-profile.svg";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const inFlight = new Map();

function normalizePubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }

  const trimmed = pubkey.trim();
  if (!trimmed || !HEX64_REGEX.test(trimmed)) {
    return "";
  }

  return trimmed.toLowerCase();
}

function resolveRelays(relays, nostr) {
  if (Array.isArray(relays) && relays.length) {
    return relays.filter((relay) => typeof relay === "string" && relay.trim());
  }

  if (Array.isArray(nostr?.readRelays) && nostr.readRelays.length) {
    return nostr.readRelays.filter((relay) => typeof relay === "string" && relay.trim());
  }

  if (Array.isArray(nostr?.relays) && nostr.relays.length) {
    return nostr.relays.filter((relay) => typeof relay === "string" && relay.trim());
  }

  return [];
}

function parseProfileEvent(event, defaultProfileImage) {
  if (!event || typeof event !== "object" || !event.content) {
    return null;
  }

  try {
    const data = JSON.parse(event.content);
    const profile = {
      name: data?.display_name || data?.name || "Unknown",
      picture: data?.picture || defaultProfileImage,
    };

    const about = typeof data?.about === "string" ? data.about : "";
    if (about) {
      profile.about = about;
    }

    const website = typeof data?.website === "string" ? data.website : "";
    if (website) {
      profile.website = website;
    }

    const banner = typeof data?.banner === "string" ? data.banner : "";
    if (banner) {
      profile.banner = banner;
    }

    const lud16 = typeof data?.lud16 === "string" ? data.lud16 : "";
    if (lud16) {
      profile.lud16 = lud16;
    }

    const lud06 = typeof data?.lud06 === "string" ? data.lud06 : "";
    if (lud06) {
      profile.lud06 = lud06;
    }

    return profile;
  } catch (error) {
    devLogger.warn("[profileMetadata] Failed to parse profile event", error);
    return null;
  }
}

async function performProfileFetch({
  pubkeys,
  nostr,
  relays,
  logger,
  defaultProfileImage,
} = {}) {
  if (!nostr?.pool || typeof nostr.pool.list !== "function") {
    logger.warn("[profileMetadata] Relay pool is not ready; skipping profile fetch.");
    return new Map();
  }

  const relayUrls = resolveRelays(relays, nostr);
  if (!relayUrls.length) {
    logger.warn("[profileMetadata] No relays configured; skipping profile fetch.");
    return new Map();
  }

  const filter = {
    kinds: [0],
    authors: pubkeys,
    limit: pubkeys.length,
  };

  const newestProfiles = new Map();

  const results = await Promise.allSettled(
    relayUrls.map((relayUrl) =>
      nostr.pool
        .list([relayUrl], [filter])
        .then((events) => ({ relayUrl, events }))
    )
  );

  results.forEach((result, index) => {
    const relayUrl =
      result.status === "fulfilled"
        ? result.value.relayUrl
        : relayUrls[index];

    if (result.status !== "fulfilled") {
      logger.warn(
        `[profileMetadata] Failed to fetch profiles from relay ${relayUrl}:`,
        result.reason,
      );
      return;
    }

    const events = Array.isArray(result.value.events)
      ? result.value.events
      : [];
    if (!events.length) {
      return;
    }

    for (const event of events) {
      const pubkey = normalizePubkey(event?.pubkey);
      if (!pubkey) {
        continue;
      }

      const createdAt = Number.isFinite(event?.created_at)
        ? event.created_at
        : 0;
      const previous = newestProfiles.get(pubkey);
      if (previous && previous.createdAt >= createdAt) {
        continue;
      }

      const profile = parseProfileEvent(event, defaultProfileImage);
      if (!profile) {
        continue;
      }

      newestProfiles.set(pubkey, {
        createdAt,
        profile,
        event,
      });
    }
  });

  return newestProfiles;
}

export async function fetchProfileMetadataBatch({
  pubkeys,
  nostr = nostrClient,
  relays = null,
  logger = devLogger,
  defaultProfileImage = DEFAULT_PROFILE_IMAGE,
} = {}) {
  const normalizedPubkeys = Array.isArray(pubkeys)
    ? pubkeys.map(normalizePubkey).filter(Boolean)
    : [];

  if (!normalizedPubkeys.length) {
    return new Map();
  }

  const uniquePubkeys = Array.from(new Set(normalizedPubkeys));
  const results = new Map();
  const waiters = [];
  const toFetch = [];

  uniquePubkeys.forEach((pubkey) => {
    const existing = inFlight.get(pubkey);
    if (existing) {
      logger.debug?.("[profileMetadata] Reusing in-flight profile fetch", {
        pubkey,
      });
      waiters.push(
        existing.then((entry) => {
          if (entry) {
            results.set(pubkey, entry);
          }
        }),
      );
      return;
    }
    toFetch.push(pubkey);
  });

  let batchPromise = null;
  if (toFetch.length) {
    logger.debug?.("[profileMetadata] Fetching profile metadata", {
      count: toFetch.length,
    });
    const fetchPromise = performProfileFetch({
      pubkeys: toFetch,
      nostr,
      relays,
      logger,
      defaultProfileImage,
    });

    toFetch.forEach((pubkey) => {
      const perPubkeyPromise = fetchPromise
        .then((map) => map.get(pubkey) || null)
        .finally(() => {
          if (inFlight.get(pubkey) === perPubkeyPromise) {
            inFlight.delete(pubkey);
          }
        });
      inFlight.set(pubkey, perPubkeyPromise);
    });

    batchPromise = fetchPromise.then((map) => {
      map.forEach((value, pubkey) => results.set(pubkey, value));
    });
  }

  await Promise.all([...waiters, batchPromise].filter(Boolean));

  return results;
}

export async function fetchProfileMetadata(pubkey, options = {}) {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) {
    return null;
  }

  const results = await fetchProfileMetadataBatch({
    pubkeys: [normalized],
    ...options,
  });

  return results.get(normalized) || null;
}
