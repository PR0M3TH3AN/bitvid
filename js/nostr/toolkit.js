// js/nostr/toolkit.js

import { isDevMode } from "../config.js";
import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import { devLogger, userLogger } from "../utils/logger.js";

/**
 * The default relay set bitvid bootstraps with before loading a user's
 * preferences.
 */
export const DEFAULT_RELAY_URLS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
]);

export const RELAY_URLS = Array.from(DEFAULT_RELAY_URLS);

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

function normalizeFilterList(filters) {
  if (!filters) {
    return [];
  }
  if (!Array.isArray(filters)) {
    if (typeof filters === "object" && filters !== null) {
      return [filters];
    }
    return [];
  }
  return filters.filter((candidate) => candidate && typeof candidate === "object");
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
            closer?.close?.("closed by caller");
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
