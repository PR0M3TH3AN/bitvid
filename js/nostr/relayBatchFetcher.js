import { isDevMode } from "../config.js";
import { DEFAULT_RELAY_URLS, RELAY_URLS } from "./toolkit.js";
import { normalizeNostrPubkey, sanitizeRelayList } from "./nip46Client.js";
import { withRequestTimeout } from "../utils/asyncUtils.js";

export class RelayBatchFetcher {
  constructor({
    client,
    kind,
    pubkey,
    dTag,
    fetchFn,
    since,
    timeoutMs,
    devLogger,
  }) {
    this.client = client;
    this.kind = kind;
    this.pubkey = pubkey;
    this.dTag = dTag;
    this.fetchFn = fetchFn;
    this.since = since;
    this.timeoutMs = timeoutMs;
    this.devLogger = devLogger;
  }

  async fetch(relayUrls) {
    if (!this.kind || !this.pubkey) {
      throw new Error("fetchListIncrementally requires kind and pubkey");
    }

    const normalizedPubkey = normalizeNostrPubkey(this.pubkey);
    if (!normalizedPubkey) {
      throw new Error("Invalid pubkey for fetchListIncrementally");
    }

    const relaysToUse = Array.isArray(relayUrls) && relayUrls.length
      ? relayUrls
      : this.client.relays;

    const healthyCandidates = this.client.getHealthyRelays(relaysToUse);
    let relayCandidates = healthyCandidates;
    if (!healthyCandidates.length && relaysToUse.length) {
      const sanitizedFallback = sanitizeRelayList(relaysToUse);
      const defaultFallback = sanitizeRelayList(Array.from(DEFAULT_RELAY_URLS));
      relayCandidates = sanitizedFallback.length
        ? sanitizedFallback
        : defaultFallback.length
          ? defaultFallback
          : sanitizeRelayList(Array.from(RELAY_URLS));
      this.devLogger.warn(
        "[fetchListIncrementally] Healthy relays exhausted; using fallback relay list for one-off fetch.",
        {
          requested: relaysToUse,
          fallback: relayCandidates,
        },
      );
    }
    const readPreferences = new Set(Array.isArray(this.client.readRelays) ? this.client.readRelays : []);

    // Sort relays: prefer user's read relays first
    const sortedRelays = relayCandidates.sort((a, b) => {
      const aPreferred = readPreferences.has(a);
      const bPreferred = readPreferences.has(b);
      if (aPreferred && !bPreferred) return -1;
      if (!aPreferred && bPreferred) return 1;
      return 0;
    });

    // Cap the number of relays to avoid excessive requests
    const cappedRelays = sortedRelays.slice(0, 8);
    const normalizedRelays = sanitizeRelayList(cappedRelays);

    if (isDevMode) {
      this.devLogger.log("[fetchListIncrementally] Selected relays:", {
        count: normalizedRelays.length,
        relays: normalizedRelays,
      });
    }

    const results = [];
    const concurrencyLimit = 8;

    const pool = await this.client.ensurePool();
    const actualFetchFn = typeof this.fetchFn === "function"
      ? this.fetchFn
      : (r, f, timeout) => pool.list([r], [f], { timeout });

    const chunks = [];
    for (let i = 0; i < normalizedRelays.length; i += concurrencyLimit) {
      chunks.push(normalizedRelays.slice(i, i + concurrencyLimit));
    }

    let anySuccess = false;
    const failures = [];

    for (const chunk of chunks) {
      const promises = chunk.map((relayUrl) =>
        this._fetchFromRelay(relayUrl, normalizedPubkey, actualFetchFn)
      );

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

  async _fetchFromRelay(relayUrl, normalizedPubkey, fetchFn) {
    let lastSeen = this.client.getSyncLastSeen(
      this.kind,
      normalizedPubkey,
      this.dTag,
      relayUrl,
    );

    // If an explicit 'since' override is provided, use it instead of storage.
    // This allows services to anchor fetching to their own known state.
    if (this.since !== undefined) {
      const overrideSince = Number(this.since);
      lastSeen =
        Number.isFinite(overrideSince) && overrideSince >= 0
          ? Math.floor(overrideSince)
          : 0;
    }

    const filter = {
      kinds: [this.kind],
      authors: [normalizedPubkey],
    };

    if (this.dTag) {
      filter["#d"] = [this.dTag];
    }

    let doFullFetch = true;
    if (lastSeen > 0) {
      filter.since = lastSeen + 1;
      doFullFetch = false;
    }

    // Allow callers to override list fetch timeouts without changing non-list query behavior.
    const listTimeoutMs = Number.isFinite(this.timeoutMs) && this.timeoutMs > 0 ? this.timeoutMs : 10000;

    try {
      // Wrap fetch with a timeout to prevent hanging on slow relays
      let events = await withRequestTimeout(
        fetchFn(relayUrl, filter, listTimeoutMs),
        listTimeoutMs,
        null,
        `Fetch from ${relayUrl} timed out`
      );

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
        this.client.updateSyncLastSeen(this.kind, normalizedPubkey, this.dTag, relayUrl, maxCreated);
      }

      return { events, ok: true };
    } catch (error) {
      // Fallback to full fetch if incremental failed or if relay error
      if (!doFullFetch) {
        try {
          delete filter.since;
          const events = await withRequestTimeout(
            fetchFn(relayUrl, filter, listTimeoutMs),
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
             this.client.updateSyncLastSeen(this.kind, normalizedPubkey, this.dTag, relayUrl, maxCreated);
          }
          return { events: events || [], ok: true };
        } catch (fallbackError) {
          this.devLogger.warn(`[fetchListIncrementally] Full fetch fallback failed for ${relayUrl}`, fallbackError);
          return { error: fallbackError, ok: false };
        }
      } else {
         this.devLogger.warn(`[fetchListIncrementally] Fetch failed for ${relayUrl}`, error);
         this.client.markRelayUnreachable(relayUrl);
         return { error, ok: false };
      }
    }
  }
}
