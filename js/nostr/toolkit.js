// js/nostr/toolkit.js

import { isDevMode } from "../config.js";
import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { recordReq } from "./reqTelemetry.js";

/**
 * The default relay set bitvid bootstraps with before loading a user's
 * preferences.
 */
export const DEFAULT_RELAY_URLS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
]);

export const RELAY_URLS = Array.from(DEFAULT_RELAY_URLS);

// Max relays to SUBSCRIBE/read from at once. Bounds REQ fan-out regardless of
// how large a user's NIP-65 list is.
export const MAX_SUBSCRIBE_RELAYS = 8;

// How many slots in the bounded read set are RESERVED for reliable defaults even
// when a user supplies enough relays of their own to fill the cap. This is the
// liveness guarantee for the "user has ~20 personal relays, all dead" case: at
// least this many known-good aggregators are always reachable so encrypted-list
// decryption isn't starved. Kept small so a user's own relays (where their data
// authoritatively lives) still dominate the set.
export const RESERVED_DEFAULT_RELAY_SLOTS = 2;

// The reliable relays to always seed reads with. In test mode this is the test
// relay override (keeps harnesses isolated); otherwise the bundled defaults.
function effectiveReadDefaults() {
  try {
    if (
      typeof window !== "undefined" &&
      Array.isArray(window.__bitvidTestRelays__) &&
      window.__bitvidTestRelays__.length
    ) {
      return window.__bitvidTestRelays__;
    }
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("__bitvidTestRelays__");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed;
        }
      }
    }
  } catch (_) {
    // ignore
  }
  return DEFAULT_RELAY_URLS;
}

// Build a bounded read/subscribe relay set.
//
// Goals (both must hold):
//   1. The user's OWN relays are prioritized — that's where their data (block
//      lists, hashtag prefs, etc.) authoritatively lives, and downstream callers
//      may slice this further to a tiny fast-path limit (e.g. 3). Defaults-first
//      ordering would crowd a small-relay user's own relays out of that slice and
//      silently drop their lists.
//   2. A small number of reliable defaults are ALWAYS guaranteed in the set, even
//      when the user supplies enough relays to fill the cap. This is the liveness
//      backstop for the "~20 personal relays, all dead" case that floods the main
//      thread and starves the nip-07 extension, timing out list decryption.
//
// So: take the user's relays first (up to cap minus the reserved slots), then
// guarantee the reserved defaults, then top up with any remaining defaults, all
// deduped and bounded. NOT for write paths (writes stay uncapped, no defaults).
export function capReadRelays(urls) {
  const provided = Array.isArray(urls)
    ? Array.from(
        new Set(urls.filter((u) => typeof u === "string" && u.trim())),
      )
    : [];
  const defaults = Array.from(new Set(effectiveReadDefaults()));

  if (!provided.length) {
    return defaults.slice(0, MAX_SUBSCRIBE_RELAYS);
  }

  const defaultsNotProvided = defaults.filter((d) => !provided.includes(d));
  const reservedDefaults = defaultsNotProvided.slice(
    0,
    RESERVED_DEFAULT_RELAY_SLOTS,
  );
  const userBudget = Math.max(
    0,
    MAX_SUBSCRIBE_RELAYS - reservedDefaults.length,
  );

  return Array.from(
    new Set([
      ...provided.slice(0, userBudget),
      ...reservedDefaults,
      ...defaultsNotProvided,
    ]),
  ).slice(0, MAX_SUBSCRIBE_RELAYS);
}

// Build the relay set for the main video feed.
//
// The subtle failure this guards: a user whose own relays are all DEAD but not
// yet probed (so they still pass the liveness filter) would otherwise have the
// feed subscribe only to those dead relays and hang on "Fetching…" forever,
// because the known-good defaults were never injected. capReadRelays always
// reserves a couple of reliable aggregator slots, so routing the healthy set
// through it guarantees the feed can reach live relays even when the user's
// entire personal list is broken. Falls back to the full default set if nothing
// survives at all.
export function buildFeedRelaySet(healthyRelays, fallbackRelays = []) {
  const healthy = Array.isArray(healthyRelays)
    ? healthyRelays.filter((u) => typeof u === "string" && u.trim())
    : [];
  const fallback = Array.isArray(fallbackRelays)
    ? fallbackRelays.filter((u) => typeof u === "string" && u.trim())
    : [];
  const base = healthy.length ? healthy : fallback;
  const capped = capReadRelays(base);
  return capped.length ? capped : Array.from(DEFAULT_RELAY_URLS);
}

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : null;

const SIMPLE_POOL_SHIM_KEY = Symbol.for("__bitvidSimplePoolShimApplied__");

const noop = () => {};

function normalizeRelayList(relays) {
  if (!Array.isArray(relays)) {
    if (typeof relays === "string" && relays.trim()) {
      return [relays.trim()];
    }
    return [];
  }
  return relays
    .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
    .filter((relay) => relay);
}

// Filter fields that relays hex-decode (from_hex) and therefore MUST contain
// 64-char lowercase hex. A single malformed/odd-length entry makes strict relays
// (e.g. primal) reject the whole REQ with "uneven size input to from_hex",
// silently dropping that subscription's results.
// Includes the NIP-22 UPPERCASE root-scope tags #E (root event id) and #P (root
// author pubkey) — relays hex-decode these too, and the kind-1111 comment
// subscriptions query by them, so an odd-length value there was bypassing the
// sanitizer and getting the whole REQ rejected with "uneven size input to from_hex".
const HEX64_FILTER_FIELDS = ["ids", "authors", "#e", "#p", "#q", "#E", "#P"];
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

// Strip invalid hex from the hex-only filter fields so one bad value can't get a
// whole REQ rejected. Returns the sanitized filter, or null if a hex field that
// had entries ends up empty (the query would be meaningless/over-broad without
// them, so the filter is dropped rather than silently widened).
export function sanitizeHexFilterFields(filter) {
  if (!filter || typeof filter !== "object") {
    return filter;
  }
  let sanitized = filter;
  for (const field of HEX64_FILTER_FIELDS) {
    const values = filter[field];
    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }
    const kept = [];
    for (const value of values) {
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (HEX64_PATTERN.test(normalized)) {
        kept.push(normalized);
      }
    }
    const changed =
      kept.length !== values.length || kept.some((value, i) => value !== values[i]);
    if (!changed) {
      continue;
    }
    const droppedCount = values.length - kept.length;
    if (droppedCount > 0) {
      devLogger.warn(
        `[toolkit] dropped ${droppedCount} invalid hex value(s) from filter "${field}"` +
          ` (kinds: ${Array.isArray(filter.kinds) ? filter.kinds.join(",") : "?"})`,
      );
    }
    if (kept.length === 0) {
      return null; // a once-populated hex field is now empty — drop the filter
    }
    if (sanitized === filter) {
      sanitized = { ...filter };
    }
    sanitized[field] = kept;
  }
  return sanitized;
}

function normalizeFilterList(filters) {
  if (!filters) {
    return [];
  }
  let list;
  if (!Array.isArray(filters)) {
    if (typeof filters === "object" && filters !== null) {
      list = [filters];
    } else {
      return [];
    }
  } else {
    list = filters.filter((candidate) => candidate && typeof candidate === "object");
  }
  return list
    .map((filter) => sanitizeHexFilterFields(filter))
    .filter((filter) => filter && typeof filter === "object");
}

function safeInvoke(handler, args, contextLabel) {
  if (typeof handler !== "function") {
    return;
  }
  try {
    handler(...args);
  } catch (error) {
    devLogger.warn(
      `[nostr] Legacy SimplePool ${contextLabel} handler threw:`,
      error
    );
  }
}

function createLegacySubscriptionContext(relays, filters) {
  const relayList = normalizeRelayList(relays);
  const filterList = normalizeFilterList(filters);

  const requests = [];
  if (relayList.length && filterList.length) {
    relayList.forEach((url) => {
      filterList.forEach((filter) => {
        requests.push({ url, filter });
      });
    });
  }

  return { relayList, filterList, requests };
}

const nostrToolsReadySource =
  globalScope &&
  globalScope.nostrToolsReady &&
  typeof globalScope.nostrToolsReady.then === "function"
    ? globalScope.nostrToolsReady
    : nostrToolsReady;

function ensureCanonicalCrypto(candidate, scope = globalScope) {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }

  const canonical =
    scope && typeof scope === "object"
      ? scope.__BITVID_CANONICAL_NOSTR_TOOLS__ || null
      : null;

  if (!canonical || typeof canonical !== "object") {
    return candidate;
  }

  const needsNip04 = !candidate.nip04 && canonical.nip04;
  const needsNip44 = !candidate.nip44 && canonical.nip44;

  if (!needsNip04 && !needsNip44) {
    return candidate;
  }

  if (Object.isFrozen(candidate)) {
    const augmented = { ...candidate };
    if (needsNip04) {
      augmented.nip04 = canonical.nip04;
    }
    if (needsNip44) {
      augmented.nip44 = canonical.nip44;
    }
    return Object.freeze(augmented);
  }

  if (needsNip04) {
    candidate.nip04 = canonical.nip04;
  }
  if (needsNip44) {
    candidate.nip44 = canonical.nip44;
  }

  return candidate;
}

export function normalizeToolkitCandidate(candidate) {
  if (
    candidate &&
    typeof candidate === "object" &&
    candidate.ok !== false &&
    typeof candidate.then !== "function"
  ) {
    return ensureCanonicalCrypto(candidate);
  }
  return null;
}

export function readToolkitFromScope(scope = globalScope) {
  if (!scope || typeof scope !== "object") {
    return null;
  }

  const candidates = [];

  const canonical = scope.__BITVID_CANONICAL_NOSTR_TOOLS__;
  if (canonical) {
    candidates.push(canonical);
  }

  const direct = scope.NostrTools;
  if (direct) {
    candidates.push(direct);
  }

  const nestedWindow =
    scope.window && scope.window !== scope && typeof scope.window === "object"
      ? scope.window
      : null;
  if (nestedWindow) {
    if (nestedWindow.__BITVID_CANONICAL_NOSTR_TOOLS__) {
      candidates.push(nestedWindow.__BITVID_CANONICAL_NOSTR_TOOLS__);
    }
    if (nestedWindow.NostrTools) {
      candidates.push(nestedWindow.NostrTools);
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeToolkitCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

const __nostrToolsBootstrapResult = await (async () => {
  try {
    const result = await nostrToolsReadySource;
    if (result && typeof result === "object" && result.ok === false) {
      return {
        toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
        failure: result,
      };
    }

    const normalized = normalizeToolkitCandidate(result);
    if (normalized) {
      return { toolkit: normalized, failure: null };
    }

    return {
      toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
      failure: null,
    };
  } catch (error) {
    return {
      toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
      failure: error,
    };
  }
})();

let cachedNostrTools = __nostrToolsBootstrapResult.toolkit || null;
export const nostrToolsBootstrapFailure =
  __nostrToolsBootstrapResult.failure || null;

if (!cachedNostrTools && nostrToolsBootstrapFailure && isDevMode) {
  userLogger.warn(
    "[nostr] nostr-tools helpers unavailable after bootstrap.",
    nostrToolsBootstrapFailure
  );
}

export function rememberNostrTools(candidate) {
  const normalized = normalizeToolkitCandidate(candidate);
  if (normalized) {
    cachedNostrTools = normalized;
  }
}

export function getCachedNostrTools() {
  const fallback = readToolkitFromScope();
  if (cachedNostrTools && fallback && fallback !== cachedNostrTools) {
    rememberNostrTools(fallback);
  } else if (!cachedNostrTools && fallback) {
    rememberNostrTools(fallback);
  }
  return cachedNostrTools || fallback || null;
}

export async function ensureNostrTools() {
  if (cachedNostrTools) {
    return cachedNostrTools;
  }

  try {
    const result = await nostrToolsReadySource;
    rememberNostrTools(result);
  } catch (error) {
    devLogger.warn("[nostr] Failed to resolve nostr-tools helpers.", error);
  }

  if (!cachedNostrTools) {
    rememberNostrTools(readToolkitFromScope());
  }

  return cachedNostrTools || null;
}

function isSimplePoolConstructor(candidate) {
  if (typeof candidate !== "function") {
    return false;
  }

  const prototype = candidate.prototype;
  if (!prototype || typeof prototype !== "object") {
    return false;
  }

  const hasSubscribeMethod =
    typeof prototype.sub === "function" ||
    typeof prototype.subscribe === "function" ||
    typeof prototype.subscribeMany === "function";

  const hasCloseMethod = typeof prototype.close === "function";

  return hasSubscribeMethod && hasCloseMethod;
}

function unwrapSimplePool(candidate) {
  if (!candidate) {
    return null;
  }

  if (isSimplePoolConstructor(candidate)) {
    return candidate;
  }

  if (typeof candidate === "object") {
    if (isSimplePoolConstructor(candidate.SimplePool)) {
      return candidate.SimplePool;
    }
    if (isSimplePoolConstructor(candidate.default)) {
      return candidate.default;
    }
  }

  return null;
}

export function resolveSimplePoolConstructor(tools, scope = globalScope) {
  const candidates = [
    tools?.SimplePool,
    tools?.pool?.SimplePool,
    tools?.pool,
    tools?.SimplePool?.SimplePool,
    tools?.SimplePool?.default,
    tools?.pool?.default,
    tools?.default?.SimplePool,
    tools?.default?.pool?.SimplePool,
    tools?.default?.pool,
  ];

  if (scope && typeof scope === "object") {
    candidates.push(scope?.SimplePool);
    candidates.push(scope?.pool?.SimplePool);
    candidates.push(scope?.pool);
    const scopedTools =
      scope?.NostrTools && scope.NostrTools !== tools ? scope.NostrTools : null;
    if (scopedTools) {
      candidates.push(scopedTools.SimplePool);
      candidates.push(scopedTools.pool?.SimplePool);
      candidates.push(scopedTools.pool);
    }
  }

  for (const candidate of candidates) {
    const resolved = unwrapSimplePool(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export { isSimplePoolConstructor, unwrapSimplePool };

export function shimLegacySimplePoolMethods(pool) {
  if (!pool || typeof pool !== "object" || pool[SIMPLE_POOL_SHIM_KEY]) {
    return pool || null;
  }

  const subscribeMap =
    typeof pool.subscribeMap === "function" ? pool.subscribeMap.bind(pool) : null;
  const subscribeMany =
    typeof pool.subscribeMany === "function" ? pool.subscribeMany.bind(pool) : null;
  const subscribeSingle =
    typeof pool.subscribe === "function" ? pool.subscribe.bind(pool) : null;

  const canSubscribe = subscribeMap || subscribeMany || subscribeSingle;

  if (canSubscribe && typeof pool.sub !== "function") {
    pool.sub = function legacySub(relays, filters, opts = {}) {
      const { relayList, filterList, requests } =
        createLegacySubscriptionContext(relays, filters);

      // #9 REQ tracer: every sub/list passes through here — record kinds,
      // fan-out, and the emitting call site (no-op unless tracing is armed).
      recordReq(relayList.length, filterList);

      const listeners = {
        event: new Set(),
        eose: new Set(),
        close: new Set(),
      };

      if (!requests.length) {
        const stub = {
          sub() {
            return stub;
          },
          on() {
            return stub;
          },
          off() {
            return stub;
          },
          unsub: noop,
        };

        queueMicrotask(() => {
          listeners.eose.forEach((listener) => safeInvoke(listener, [], "eose listener"));
          listeners.close.forEach((listener) =>
            safeInvoke(listener, [["no-filters"]], "close listener")
          );
        });

        return stub;
      }

      const seenIds = new Set();

      const subscribeParams = { ...opts };
      const originalOnevent = subscribeParams.onevent;
      const originalOneose = subscribeParams.oneose;
      const originalOnclose = subscribeParams.onclose;
      const originalAlreadyHaveEvent = subscribeParams.alreadyHaveEvent;
      delete subscribeParams.onevent;
      delete subscribeParams.oneose;
      delete subscribeParams.onclose;
      delete subscribeParams.alreadyHaveEvent;

      subscribeParams.alreadyHaveEvent = (id) => {
        if (!id) {
          return false;
        }
        if (seenIds.has(id)) {
          return true;
        }
        let skip = false;
        if (typeof originalAlreadyHaveEvent === "function") {
          try {
            skip = originalAlreadyHaveEvent(id) === true;
          } catch (error) {
            devLogger.warn(
              "[nostr] Legacy SimplePool alreadyHaveEvent hook threw:",
              error
            );
          }
        }
        if (skip) {
          return true;
        }
        seenIds.add(id);
        return false;
      };

      let closed = false;

      const invokeEventListeners = (event) => {
        if (closed) {
          return;
        }
        if (event && typeof event === "object" && event.id) {
          seenIds.add(event.id);
        }
        safeInvoke(originalOnevent, [event], "options.onevent");
        listeners.event.forEach((listener) =>
          safeInvoke(listener, [event], "event listener")
        );
      };

      const invokeEoseListeners = () => {
        if (closed) {
          return;
        }
        safeInvoke(originalOneose, [], "options.oneose");
        listeners.eose.forEach((listener) => safeInvoke(listener, [], "eose listener"));
      };

      const invokeCloseListeners = (reasons) => {
        if (closed) {
          return;
        }
        closed = true;
        safeInvoke(originalOnclose, [reasons], "options.onclose");
        listeners.close.forEach((listener) =>
          safeInvoke(listener, [reasons], "close listener")
        );
      };

      subscribeParams.onevent = (event) => {
        invokeEventListeners(event);
      };

      subscribeParams.oneose = () => {
        invokeEoseListeners();
      };

      subscribeParams.onclose = (reasons) => {
        invokeCloseListeners(reasons);
      };

      let closer;

      try {
        if (subscribeMap) {
          closer = subscribeMap(requests, subscribeParams);
        } else if (subscribeMany) {
          closer = subscribeMany(relayList, filterList, subscribeParams);
        } else if (subscribeSingle && filterList.length) {
          closer = subscribeSingle(relayList, filterList[0], subscribeParams);
        }
      } catch (error) {
        devLogger.warn("[nostr] Failed to open SimplePool subscription.", error);
        throw error;
      }

      const legacySub = {
        sub() {
          devLogger.warn("[nostr] legacy sub.sub() is unsupported with the new SimplePool API.");
          return legacySub;
        },
        on(type, handler) {
          if (typeof handler !== "function") {
            return legacySub;
          }
          if (type === "event") {
            listeners.event.add(handler);
          } else if (type === "eose") {
            listeners.eose.add(handler);
          } else if (type === "close" || type === "closed") {
            listeners.close.add(handler);
          }
          return legacySub;
        },
        off(type, handler) {
          if (typeof handler !== "function") {
            return legacySub;
          }
          if (type === "event") {
            listeners.event.delete(handler);
          } else if (type === "eose") {
            listeners.eose.delete(handler);
          } else if (type === "close" || type === "closed") {
            listeners.close.delete(handler);
          }
          return legacySub;
        },
        unsub() {
          if (closed) {
            return;
          }
          closed = true;
          try {
            if (typeof closer === "function") {
              closer();
            } else if (closer && typeof closer.close === "function") {
              closer.close("closed by caller");
            }
          } catch (error) {
            devLogger.warn("[nostr] Failed to close SimplePool subscription.", error);
          }
        },
      };

      return legacySub;
    };
  }

  if (typeof pool.list !== "function") {
    pool.list = async function legacyList(relays, filters, opts = {}) {
      const events = [];
      let subscription;
      try {
        subscription = this.sub(relays, filters, opts);
      } catch (error) {
        throw error;
      }

      return new Promise((resolve) => {
        let timer = null;

        const finish = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          resolve(events);
        };

        if (!subscription || typeof subscription.on !== "function") {
          finish();
          return;
        }

        subscription.on("event", (event) => {
          events.push(event);
        });
        subscription.on("eose", () => {
          try {
            subscription.unsub?.();
          } catch (error) {
            devLogger.warn("[nostr] Failed to unsubscribe after list EOSE.", error);
          }
          finish();
        });
        subscription.on("close", () => {
          finish();
        });

        // Prevent hanging indefinitely if relays fail to EOSE
        const timeoutMs =
          Number.isFinite(opts.timeout) && opts.timeout > 0
            ? opts.timeout
            : 7000;

        timer = setTimeout(() => {
          devLogger.warn(`[toolkit] pool.list timed out after ${timeoutMs}ms.`);
          timer = null;
          try {
            subscription.unsub?.();
          } catch (error) {
            // ignore
          }
          finish();
        }, timeoutMs);
      });
    };
  }

  pool[SIMPLE_POOL_SHIM_KEY] = true;
  return pool;
}
