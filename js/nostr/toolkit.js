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
