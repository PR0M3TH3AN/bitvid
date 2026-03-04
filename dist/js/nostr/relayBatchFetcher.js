import { isDevMode } from "../config.js";
import { devLogger } from "../utils/logger.js";
import { withRequestTimeout } from "../utils/asyncUtils.js";
import { normalizeNostrPubkey, sanitizeRelayList } from "./nip46Client.js";
import { DEFAULT_RELAY_URLS, RELAY_URLS } from "./toolkit.js";
import { STANDARD_TIMEOUT_MS } from "../constants.js";

export class RelayBatchFetcher {
  constructor(client) {
    this.client = client;
  }

  async fetchListIncrementally({
    kind,
    pubkey,
    dTag,
    relayUrls,
    fetchFn,
    since,
    timeoutMs = STANDARD_TIMEOUT_MS,
    maxRelays = 8,
  } = {}) {
    if (!kind || !pubkey) {
      throw new Error("fetchListIncrementally requires kind and pubkey");
    }

    const normalizedPubkey = normalizeNostrPubkey(pubkey);
    if (!normalizedPubkey) {
      throw new Error("Invalid pubkey for fetchListIncrementally");
    }

    const relaysToUse = Array.isArray(relayUrls) && relayUrls.length
      ? relayUrls
      : this.client.relays;
    const sanitizedRequestedRelays = sanitizeRelayList(relaysToUse);

    const healthyCandidates = this.client.getHealthyRelays(sanitizedRequestedRelays);
    const healthySet = new Set(healthyCandidates);
    const remainingRequested = sanitizedRequestedRelays.filter(
      (relayUrl) => !healthySet.has(relayUrl),
    );
    let relayCandidates = [...healthyCandidates, ...remainingRequested];
    if (!healthyCandidates.length && relaysToUse.length) {
      const defaultFallback = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
      relayCandidates = sanitizedRequestedRelays.length
        ? sanitizedRequestedRelays
        : defaultFallback.length
          ? defaultFallback
          : sanitizeRelayList(Array.from(RELAY_URLS));
      devLogger.warn(
        "[fetchListIncrementally] Healthy relays exhausted; using fallback relay list for one-off fetch.",
        {
          requested: relaysToUse,
          fallback: relayCandidates,
        },
      );
    }
    const readPreferences = new Set(Array.isArray(this.client.readRelays) ? this.client.readRelays : []);

    // Sort relays: prefer user's read relays first
    const sortedRelays = [...relayCandidates].sort((a, b) => {
      const aPreferred = readPreferences.has(a);
      const bPreferred = readPreferences.has(b);
      const aHealthy = healthySet.has(a);
      const bHealthy = healthySet.has(b);
      if (aHealthy && !bHealthy) return -1;
      if (!aHealthy && bHealthy) return 1;
      if (aPreferred && !bPreferred) return -1;
      if (!aPreferred && bPreferred) return 1;
      return 0;
    });

    // Cap the number of relays to avoid excessive requests
    const relayCap = Number.isFinite(maxRelays)
      ? Math.max(1, Math.floor(maxRelays))
      : 8;
    const cappedRelays = sortedRelays.slice(0, relayCap);
    const normalizedRelays = sanitizeRelayList(cappedRelays);

    if (isDevMode) {
      devLogger.log("[fetchListIncrementally] Selected relays:", {
        count: normalizedRelays.length,
        relays: normalizedRelays,
      });
    }

    const results = [];
    const concurrencyLimit = 8;

    // We'll use the pool's list method if fetchFn isn't provided,
    // but we need to call it per-relay.
    const pool = await this.client.ensurePool();
    const actualFetchFn = typeof fetchFn === "function"
      ? fetchFn
      : (r, f, timeout) => pool.list([r], [f], { timeout });

    const chunks = [];
    for (let i = 0; i < normalizedRelays.length; i += concurrencyLimit) {
      chunks.push(normalizedRelays.slice(i, i + concurrencyLimit));
    }

    let anySuccess = false;
    const failures = [];

    for (const chunk of chunks) {
      const promises = chunk.map(async (relayUrl) => {
        let lastSeen = this.client.getSyncLastSeen(
          kind,
          normalizedPubkey,
          dTag,
          relayUrl,
        );

        // If an explicit 'since' override is provided, use it instead of storage.
        // This allows services to anchor fetching to their own known state.
        if (since !== undefined) {
          const overrideSince = Number(since);
          lastSeen =
            Number.isFinite(overrideSince) && overrideSince >= 0
              ? Math.floor(overrideSince)
              : 0;
        }

        const filter = {
          kinds: [kind],
          authors: [normalizedPubkey],
        };

        if (dTag) {
          filter["#d"] = [dTag];
        }

        // Strategy:
        // If we have a lastSeen, ask for since = lastSeen + 1.
        // If that fails or returns nothing, we don't necessarily fall back
        // unless there's an error.
        // Wait, requirements say:
        // "If metadata is missing for a relay → do a full fetch"
        // "If a relay returns an error ... fall back to full fetch"

        let doFullFetch = true;
        if (lastSeen > 0) {
          filter.since = lastSeen + 1;
          doFullFetch = false;
        }

        // Allow callers to override list fetch timeouts without changing non-list query behavior.
        const listTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : STANDARD_TIMEOUT_MS;

        try {
          // Wrap fetch with a timeout to prevent hanging on slow relays
          let events = await withRequestTimeout(
            actualFetchFn(relayUrl, filter, listTimeoutMs),
            listTimeoutMs,
            null,
            `Fetch from ${relayUrl} timed out`
          );

          // If incremental returned empty, we assume no updates (success).
          // But if we did a full fetch (no since), empty means empty.

          if (!events || !Array.isArray(events)) {
             events = [];
          }

          // On success, update lastSeen with max created_at
          let maxCreated = 0;
          for (const ev of events) {
            if (ev.created_at > maxCreated) {
              maxCreated = ev.created_at;
            }
          }

          if (maxCreated > 0) {
            // Only update if we found something newer or if we did a full fetch
            // Actually, if we did incremental and found new stuff, maxCreated > lastSeen.
            // If we did full fetch, maxCreated is the latest.
            this.client.updateSyncLastSeen(kind, normalizedPubkey, dTag, relayUrl, maxCreated);
          }

          return { events, ok: true };
        } catch (error) {
          // Fallback to full fetch if incremental failed or if relay error
          if (!doFullFetch) {
            try {
              delete filter.since;
              const events = await withRequestTimeout(
                actualFetchFn(relayUrl, filter, listTimeoutMs),
                listTimeoutMs,
                null,
                `Full fetch fallback from ${relayUrl} timed out`
              );
              // Update lastSeen on success of fallback
              let maxCreated = 0;
              if (Array.isArray(events)) {
                for (const ev of events) {
                  if (ev.created_at > maxCreated) {
                    maxCreated = ev.created_at;
                  }
                }
              }
              if (maxCreated > 0) {
                 this.client.updateSyncLastSeen(kind, normalizedPubkey, dTag, relayUrl, maxCreated);
              }
              return { events: events || [], ok: true };
            } catch (fallbackError) {
              devLogger.warn(`[fetchListIncrementally] Full fetch fallback failed for ${relayUrl}`, fallbackError);
              return { error: fallbackError, ok: false };
            }
          } else {
             devLogger.warn(`[fetchListIncrementally] Fetch failed for ${relayUrl}`, error);
             this.client.markRelayUnreachable(relayUrl);
             return { error, ok: false };
          }
        }
      });

      const chunkResults = await Promise.all(promises);
      for (const res of chunkResults) {
        if (res.ok) {
          anySuccess = true;
          if (Array.isArray(res.events)) {
            results.push(...res.events);
          }
        } else {
          failures.push(res.error);
        }
      }
    }

    if (!anySuccess && normalizedRelays.length > 0) {
      const error = new Error("All relays failed to fetch list.");
      error.code = "fetch-failed";
      error.failures = failures;
      throw error;
    }

    // Deduplicate by ID
    const uniqueEvents = new Map();
    for (const ev of results) {
      if (ev && ev.id) {
        uniqueEvents.set(ev.id, ev);
      }
    }

    return Array.from(uniqueEvents.values());
  }
}
