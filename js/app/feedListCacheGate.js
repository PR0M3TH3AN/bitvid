// Cache-aware early release for the post-login feed gate. The login flow holds
// the video grid until blocks/subscriptions/hashtag lists settle (so the feed
// never flashes unfiltered content), time-boxed at several seconds. But on every
// warm boot those services hydrate valid per-pubkey CACHES almost immediately —
// filtering with cached lists is accurate, and the relay sync keeps running in
// the background (its change events re-filter when fresh data lands). This probe
// lets the gate open as soon as all three caches are usable instead of waiting
// for full relay sync + NIP-07 decryption ("Fetching subscriptions…" stall).

// Builds a () => boolean probe: true when all three list services hold a valid
// cache for the active pubkey. Mirrors the hasValid*Cache checks used by the
// login list-sync bookkeeping.
export function createListCacheProbe({
  userBlocks,
  subscriptions,
  hashtagPreferences,
  normalizeHexPubkey,
  activePubkey,
} = {}) {
  const normalize =
    typeof normalizeHexPubkey === "function"
      ? normalizeHexPubkey
      : (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
  const target = normalize(activePubkey);

  return () => {
    if (!target) {
      return false;
    }
    const blocksReady =
      Boolean(userBlocks) &&
      userBlocks.loaded === true &&
      normalize(userBlocks.activePubkey) === target;
    const subscriptionsReady =
      Boolean(subscriptions) &&
      subscriptions.loaded === true &&
      normalize(subscriptions.currentUserPubkey) === target;
    const hashtagsReady =
      Boolean(hashtagPreferences) &&
      hashtagPreferences.loaded === true &&
      normalize(hashtagPreferences.activePubkey) === target;
    return blocksReady && subscriptionsReady && hashtagsReady;
  };
}

// Resolves "cache" as soon as the probe passes, or null at the timeout. Polls on
// a short interval — the caches hydrate within the first ticks on warm boots.
export function waitForListCaches(
  probe,
  { timeoutMs = 8000, intervalMs = 150 } = {},
) {
  return new Promise((resolve) => {
    if (typeof probe !== "function") {
      resolve(null);
      return;
    }
    const startedAt = Date.now();
    const check = () => {
      let ready = false;
      try {
        ready = probe() === true;
      } catch (error) {
        ready = false;
      }
      if (ready) {
        resolve("cache");
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

export default waitForListCaches;
