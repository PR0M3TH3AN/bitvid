import { devLogger, userLogger } from "./utils/logger.js";
const REMOTE_IMPORT_TIMEOUT = 4500;
const LOCAL_IMPORT_TIMEOUT = 2500;
const NODE_IMPORT_TIMEOUT = 1500;
const SCRIPT_FALLBACK_TIMEOUT = 6000;
const CDN_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/nostr-tools@2.10.4/lib/nostr.bundle.min.js";
const LOCAL_BUNDLE_RELATIVE_URL = "../vendor/nostr-tools.bundle.min.js";

const moduleUrl =
  typeof import.meta !== "undefined" && import.meta?.url ? import.meta.url : null;

const resolveRelativeUrl = (relativePath) => {
  if (!relativePath) {
    return relativePath;
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relativePath)) {
    return relativePath;
  }
  if (moduleUrl) {
    try {
      return new URL(relativePath, moduleUrl).href;
    } catch (error) {
      // Fall through to other resolution strategies
    }
  }
  if (typeof window !== "undefined" && window?.location?.href) {
    try {
      return new URL(relativePath, window.location.href).href;
    } catch (error) {
      return relativePath;
    }
  }
  return relativePath;
};

const LOCAL_BUNDLE_URL = resolveRelativeUrl(LOCAL_BUNDLE_RELATIVE_URL);

let bootstrapPromise = null;

const getGlobalScope = () => {
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  return null;
};

const hasWorkingNip04 = (candidate) =>
  !!(
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.encrypt === "function" &&
    typeof candidate.decrypt === "function"
  );

const toSerializableError = (error) => {
  if (!error) {
    return null;
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { ...error };
  } catch (serializationError) {
    return { message: String(error) };
  }
};

const withTimeout = (factory, ms, label) =>
  new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    let timeoutId;
    const finalize = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve({
        label,
        duration: Date.now() - start,
        ...result,
      });
    };

    const runner = Promise.resolve().then(factory);

    timeoutId = setTimeout(() => {
      finalize({
        ok: false,
        timedOut: true,
        error: new Error(
          `[bitvid][nostr-tools] ${label} timed out after ${ms}ms`
        ),
      });
      runner.catch(() => {});
    }, ms);

    runner.then(
      (value) => finalize({ ok: true, value, timedOut: false }),
      (error) => finalize({ ok: false, error, timedOut: false })
    );
  });

const discoverLocalEntrypoints = (scope) => {
  if (!scope || typeof scope !== "object") {
    return [];
  }

  const entrypoints = [];
  const configuredEntrypoints = scope.__BITVID_LOCAL_NOSTR_TOOLS_ENTRY__;
  if (typeof configuredEntrypoints === "string") {
    entrypoints.push(configuredEntrypoints);
  } else if (Array.isArray(configuredEntrypoints)) {
    configuredEntrypoints
      .filter((candidate) => typeof candidate === "string" && candidate)
      .forEach((candidate) => entrypoints.push(candidate));
  }

  if (scope.document) {
    const localScripts = scope.document.querySelectorAll(
      "script[data-nostr-tools-entry]"
    );
    localScripts.forEach((script) => {
      const candidate = script.getAttribute("data-nostr-tools-entry");
      if (candidate) {
        entrypoints.push(candidate);
      }
    });
  }

  return Array.from(new Set(entrypoints));
};

const extractToolsFromModule = (moduleLike) => {
  if (!moduleLike || typeof moduleLike !== "object") {
    return null;
  }
  const { default: defaultExport, ...named } = moduleLike;
  if (defaultExport && typeof defaultExport === "object") {
    return { ...defaultExport, ...named };
  }
  return { ...named };
};

const ensureGlobalReadyPromise = (scope, promise) => {
  if (!scope || typeof scope !== "object") {
    return;
  }
  try {
    Object.defineProperty(scope, "nostrToolsReady", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: promise,
    });
  } catch (error) {
    scope.nostrToolsReady = promise;
  }
};

const loadScriptBundle = (scope, url, label) => {
  if (!scope?.document) {
    return Promise.resolve({
      label,
      ok: false,
      timedOut: false,
      duration: 0,
      error: new Error("Document is unavailable for script loading."),
    });
  }

  return withTimeout(
    () =>
      new Promise((resolve, reject) => {
        const { document } = scope;
        const target = document.head || document.body || document.documentElement;
        if (!target) {
          reject(new Error("Unable to locate a DOM target for script injection."));
          return;
        }

        const script = document.createElement("script");
        script.async = true;
        script.src = url;
        script.crossOrigin = "anonymous";

        const cleanup = () => {
          script.onload = null;
          script.onerror = null;
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
        };

        script.onload = () => {
          cleanup();
          resolve(scope?.NostrTools || null);
        };
        script.onerror = (event) => {
          cleanup();
          if (event?.error instanceof Error) {
            reject(event.error);
          } else {
            reject(new Error(`nostr-tools bundle failed to load: ${url}`));
          }
        };

        target.appendChild(script);
      }),
    SCRIPT_FALLBACK_TIMEOUT,
    label
  );
};

export function bootstrapNostrTools() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  const scope = getGlobalScope();

  bootstrapPromise = (async () => {
    if (!scope) {
      const error = {
        ok: false,
        reason: "Global scope is unavailable.",
        attempts: [],
      };
      return error;
    }

    const attempts = [];

    const isNodeLike =
      typeof process !== "undefined" &&
      !!process?.versions?.node &&
      (!scope || typeof scope.document === "undefined");

    const nodeImports = isNodeLike
      ? [
          withTimeout(
            () => import("nostr-tools"),
            NODE_IMPORT_TIMEOUT,
            "node-main"
          ),
          withTimeout(
            () => import("nostr-tools/nip04"),
            NODE_IMPORT_TIMEOUT,
            "node-nip04"
          ),
        ]
      : [];

    const remoteImports = [
      withTimeout(
        () => import("https://esm.sh/nostr-tools@1.8.3"),
        REMOTE_IMPORT_TIMEOUT,
        "esm-main"
      ),
      withTimeout(
        () =>
          import(
            "https://esm.sh/nostr-tools@1.8.3?target=es2022&exports=nip04"
          ),
        REMOTE_IMPORT_TIMEOUT,
        "esm-nip04"
      ),
    ];

    const localEntrypoints = discoverLocalEntrypoints(scope);
    const localImports = localEntrypoints.map((entry, index) =>
      withTimeout(
        () => import(entry),
        LOCAL_IMPORT_TIMEOUT,
        `local-${index}`
      )
    );

    const dynamicResults = await Promise.allSettled([
      ...nodeImports,
      ...remoteImports,
      ...localImports,
    ]);

    const resolvedModules = [];
    let resolvedNip04 = null;

    dynamicResults.forEach((settledResult) => {
      if (settledResult.status !== "fulfilled") {
        return;
      }
      const result = settledResult.value;
      attempts.push({
        target: result.label,
        ok: result.ok,
        timedOut: !!result.timedOut,
        duration: result.duration,
        error: result.ok ? null : toSerializableError(result.error),
      });
      if (!result.ok) {
        return;
      }
      if (result.label === "esm-nip04" && hasWorkingNip04(result.value?.nip04)) {
        resolvedNip04 = result.value.nip04;
        return;
      }
      const extracted = extractToolsFromModule(result.value);
      if (extracted && Object.keys(extracted).length > 0) {
        resolvedModules.push({ source: result.label, tools: extracted });
        if (!resolvedNip04 && hasWorkingNip04(extracted?.nip04)) {
          resolvedNip04 = extracted.nip04;
        }
      }
    });

    dynamicResults.forEach((settledResult) => {
      if (settledResult.status !== "fulfilled") {
        const { reason } = settledResult;
        attempts.push({
          target: "unknown",
          ok: false,
          timedOut: false,
          duration: 0,
          error: toSerializableError(reason),
        });
        return;
      }
      const result = settledResult.value;
      if (result && !attempts.find((entry) => entry.target === result.label)) {
        attempts.push({
          target: result.label,
          ok: result.ok,
          timedOut: !!result.timedOut,
          duration: result.duration,
          error: result.ok ? null : toSerializableError(result.error),
        });
      }
    });

    const allDynamicTimedOut =
      attempts.length > 0 &&
      attempts.every(
        (attempt) =>
          attempt &&
          attempt.target &&
          attempt.target.startsWith("esm")
            ? attempt.timedOut
            : true
      );

    const shouldAttemptScriptFallback =
      !!scope.document && (resolvedModules.length === 0 || allDynamicTimedOut);

    if (shouldAttemptScriptFallback) {
      const scriptSources = [
        LOCAL_BUNDLE_URL
          ? { url: LOCAL_BUNDLE_URL, label: "local-bundle" }
          : null,
        { url: CDN_BUNDLE_URL, label: "cdn-bundle" },
      ].filter(Boolean);

      for (const source of scriptSources) {
        const scriptLoadResult = await loadScriptBundle(
          scope,
          source.url,
          source.label
        );

        attempts.push({
          target: scriptLoadResult.label,
          ok: scriptLoadResult.ok,
          timedOut: !!scriptLoadResult.timedOut,
          duration: scriptLoadResult.duration,
          error: scriptLoadResult.ok
            ? null
            : toSerializableError(scriptLoadResult.error),
        });

        if (!scriptLoadResult.ok) {
          continue;
        }

        const extracted = extractToolsFromModule(scriptLoadResult.value);
        if (extracted && Object.keys(extracted).length > 0) {
          resolvedModules.push({ source: source.label, tools: extracted });
          if (!resolvedNip04 && hasWorkingNip04(extracted?.nip04)) {
            resolvedNip04 = extracted.nip04;
          }
          break;
        }
      }
    }

    const existingGlobalTools = scope?.NostrTools;
    if (existingGlobalTools && typeof existingGlobalTools === "object") {
      resolvedModules.push({ source: "global", tools: existingGlobalTools });
      if (!resolvedNip04 && hasWorkingNip04(existingGlobalTools?.nip04)) {
        resolvedNip04 = existingGlobalTools.nip04;
      }
    }

    if (resolvedModules.length === 0 && !resolvedNip04) {
      const failure = {
        ok: false,
        reason: "Failed to resolve any nostr-tools helpers.",
        attempts,
      };
      userLogger.warn("[bitvid] nostr-tools bootstrap failed", failure);
      return failure;
    }

    const toolSources = resolvedModules.map((entry) => entry.tools);
    const canonicalTools = Object.assign({}, ...toolSources);

    const normalizedGeneratePrivateKey =
      typeof canonicalTools.generatePrivateKey === "function"
        ? canonicalTools.generatePrivateKey
        : typeof canonicalTools.generateSecretKey === "function"
        ? canonicalTools.generateSecretKey
        : undefined;

    const normalizedGenerateSecretKey =
      typeof canonicalTools.generateSecretKey === "function"
        ? canonicalTools.generateSecretKey
        : typeof canonicalTools.generatePrivateKey === "function"
        ? canonicalTools.generatePrivateKey
        : undefined;

    if (normalizedGeneratePrivateKey) {
      canonicalTools.generatePrivateKey = normalizedGeneratePrivateKey;
    }
    if (normalizedGenerateSecretKey) {
      canonicalTools.generateSecretKey = normalizedGenerateSecretKey;
    }

    if (resolvedNip04) {
      canonicalTools.nip04 = resolvedNip04;
      devLogger.info("[bitvid] Initialized nostr nip04 helpers.");
    } else {
      userLogger.warn(
        "[bitvid] NIP-04 helpers unavailable after bootstrap attempts."
      );
    }

    const frozenCanonical = Object.freeze({ ...canonicalTools });

    try {
      Object.defineProperty(scope, "__BITVID_CANONICAL_NOSTR_TOOLS__", {
        configurable: true,
        enumerable: false,
        writable: false,
        value: frozenCanonical,
      });
    } catch (error) {
      scope.__BITVID_CANONICAL_NOSTR_TOOLS__ = frozenCanonical;
    }

    let activeTools = canonicalTools;
    const mergeWithCanonical = (candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return activeTools;
      }
      const merged = Object.assign({}, frozenCanonical, candidate);
      if (!merged.nip04 && frozenCanonical.nip04) {
        merged.nip04 = frozenCanonical.nip04;
      }
      if (
        typeof merged.generatePrivateKey !== "function" &&
        typeof merged.generateSecretKey === "function"
      ) {
        merged.generatePrivateKey = merged.generateSecretKey;
      }
      if (
        typeof merged.generateSecretKey !== "function" &&
        typeof merged.generatePrivateKey === "function"
      ) {
        merged.generateSecretKey = merged.generatePrivateKey;
      }
      return merged;
    };

    const applyActive = (candidate) => {
      activeTools = mergeWithCanonical(candidate);
      return activeTools;
    };

    try {
      Object.defineProperty(scope, "NostrTools", {
        configurable: true,
        enumerable: true,
        get() {
          return activeTools;
        },
        set(value) {
          applyActive(value);
        },
      });
    } catch (error) {
      userLogger.warn("[bitvid] Failed to install NostrTools guard.", error);
    }

    applyActive(existingGlobalTools);
    scope.NostrTools = canonicalTools;

    return frozenCanonical;
  })()
    .catch((error) => ({
      ok: false,
      reason: "nostr-tools bootstrap threw unexpectedly.",
      error: toSerializableError(error),
    }));

  ensureGlobalReadyPromise(scope, bootstrapPromise);

  return bootstrapPromise;
}

const nostrToolsReady = bootstrapNostrTools();

export { nostrToolsReady };
export default nostrToolsReady;

await nostrToolsReady;