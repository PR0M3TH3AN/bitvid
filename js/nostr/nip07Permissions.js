import { devLogger, userLogger } from "../utils/logger.js";
import { SHORT_TIMEOUT_MS } from "../constants.js";

export const NIP07_LOGIN_TIMEOUT_MS = 60_000; // 60 seconds
export const NIP07_EXTENSION_WAIT_TIMEOUT_MS = SHORT_TIMEOUT_MS;
export const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Confirm the extension prompt in your browser toolbar and try again.";
const NIP07_PERMISSIONS_STORAGE_KEY = "bitvid:nip07:permissions";

// Give the NIP-07 extension enough time to surface its approval prompt and let
// users unlock/authorize it. Seven seconds proved too aggressive once vendors
// started requiring an unlock step, so we extend the window substantially while
// still allowing manual overrides via __BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__.
const DEFAULT_ENABLE_VARIANT_TIMEOUT_MS = 45_000;

// Timeout for the SPECIFIC (silent, payload-carrying) permission variants we
// probe before the no-arg prompt. This is NOT a "fail fast" budget: real
// extensions REJECT a payload shape they don't support almost immediately, and
// a fast rejection moves us to the next variant right away. The timeout only
// bounds a variant that HANGS — so a tiny 3s cap added no real safety against
// unsupported variants but DID kill slow-but-responsive signers mid-grant,
// forcing 3 wasted attempts before the prompt variant succeeded (~25s of dead
// time on a 16s/call signer in the channel-sim). Give it real room.
const SPECIFIC_VARIANT_TIMEOUT_MS = 20_000;

export const DEFAULT_NIP07_ENCRYPTION_METHODS = Object.freeze([
  // Encryption helpers — request both legacy NIP-04 and modern NIP-44 upfront
  "nip04.encrypt",
  "nip04.decrypt",
  "nip44.encrypt",
  "nip44.decrypt",
  "nip44.v2.encrypt",
  "nip44.v2.decrypt",
]);

export const DEFAULT_NIP07_CORE_METHODS = Object.freeze([
  // Core auth + relay metadata
  "get_public_key",
  "sign_event",
]);

export const DEFAULT_NIP07_PERMISSION_METHODS = Object.freeze([
  ...DEFAULT_NIP07_CORE_METHODS,
  ...DEFAULT_NIP07_ENCRYPTION_METHODS,
]);

export const NIP07_PRIORITY = Object.freeze({
  // CRITICAL is reserved for establishing the signer channel itself (the
  // permission/enable handshake behind the readiness gate). It must outrank
  // list decryption (HIGH): otherwise a flood of HIGH-priority decrypts jumps
  // ahead of the gate in the queue and starves it, so the channel never gets
  // warmed and every decrypt keeps timing out (the real-env ~48s "signer-ready"
  // — KNOWN_BUGS #0).
  CRITICAL: 20,
  HIGH: 10,
  NORMAL: 5,
  LOW: 1,
});

class Nip07RequestQueue {
  // `reservedForForeground` slots are kept available for non-background
  // (priority > LOW) work, so a flood of LOW-priority background decrypts
  // (DM backfill, watch-history months) can never occupy every slot and
  // starve the feed-driving lists. Background work is therefore capped at
  // `maxConcurrent - reservedForForeground` concurrent slots (min 1).
  constructor(maxConcurrent = 2, reservedForForeground = 1) {
    this.queue = [];
    this.maxConcurrent =
      Number.isFinite(maxConcurrent) && maxConcurrent > 0 ? maxConcurrent : 2;
    const reserved =
      Number.isFinite(reservedForForeground) && reservedForForeground >= 0
        ? Math.floor(reservedForForeground)
        : 1;
    // Never reserve so much that background work could never run.
    this.backgroundConcurrencyCap = Math.max(1, this.maxConcurrent - reserved);
    this.activeCount = 0;
    this.backgroundActiveCount = 0;
  }

  isBackground(priority) {
    return Number.isFinite(priority) && priority <= NIP07_PRIORITY.LOW;
  }

  enqueue(task, priority = NIP07_PRIORITY.NORMAL) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        priority: Number.isFinite(priority) ? priority : NIP07_PRIORITY.NORMAL,
        resolve,
        reject,
        addedAt: Date.now(),
      });
      // Sort by priority (descending), then by insertion time (ascending) for fairness
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.addedAt - b.addedAt;
      });
      this.process();
    });
  }

  async process() {
    if (this.activeCount >= this.maxConcurrent) return;

    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      // Peek the highest-priority item. The queue is sorted priority-desc, so
      // if the head is background-class and the background cap is already
      // saturated, every remaining item is background too — stop, keeping the
      // free slot(s) reserved for any foreground work that arrives later.
      const head = this.queue[0];
      const headIsBackground = this.isBackground(head.priority);
      if (
        headIsBackground &&
        this.backgroundActiveCount >= this.backgroundConcurrencyCap
      ) {
        break;
      }

      const item = this.queue.shift();
      if (!item) break;

      const itemIsBackground = this.isBackground(item.priority);
      this.activeCount++;
      if (itemIsBackground) {
        this.backgroundActiveCount++;
      }
      const { task, resolve, reject } = item;

      // We don't await the task here to allow parallelism loop to continue
      Promise.resolve()
        .then(() => task())
        .then((result) => {
          resolve(result);
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          this.activeCount--;
          if (itemIsBackground) {
            this.backgroundActiveCount--;
          }
          this.process();
        });
    }
  }
}

// Module-level priority queue to serialize NIP-07 extension requests.
// This prevents "message channel closed" errors caused by race conditions
// when multiple components (blocks, DMs, auth) query the extension simultaneously,
// while allowing critical tasks (e.g. blocklist decryption) to jump the line.
// Stability: keep extension request concurrency conservative. Some NIP-07
// providers/content scripts drop channels under high parallel load, which
// manifests as "message channel closed" and repeated decrypt timeouts.
const requestQueue = new Nip07RequestQueue(2);

export const NIP07_CHANNEL_UNRESPONSIVE_ERROR_MESSAGE =
  "The NIP-07 signer channel is unresponsive. It usually recovers shortly; if it persists, refresh the page or re-open your extension.";

// Circuit breaker for a dead/unresponsive nip-07 message channel.
//
// Real-env failure mode (KNOWN_BUGS #0): under the post-login burst the
// extension's single content-script message port drops ("message channel
// closed"). After that EVERY decrypt call hangs to its full timeout (~15s).
// Each list service (blocks, hashtags, subscriptions, watch history)
// independently retries on that timeout, so the app sits in a permanent loop of
// 15s-blocking extension calls — pinning the CPU ("fans at max") and never
// recovering until a manual page refresh.
//
// The breaker converts that into: a few timeouts OPEN the circuit, after which
// calls fail FAST (no 15s wait) so the retry loops become cheap and the CPU
// settles. While open, a single periodic PROBE is allowed through to detect
// recovery; one success CLOSES the circuit and normal decryption resumes — no
// refresh required. Interactive permission prompts bypass the breaker so a user
// taking their time at the extension UI can never trip or be blocked by it.
const CIRCUIT_TIMEOUT_THRESHOLD = 3; // consecutive timeouts before opening
const CIRCUIT_OPEN_MS = 30_000; // how long the circuit stays open
const CIRCUIT_PROBE_INTERVAL_MS = 8_000; // min spacing between recovery probes
const channelBreaker = {
  consecutiveTimeouts: 0,
  openUntil: 0,
  lastProbeAt: 0,
};

export function getNip07ChannelBreakerState() {
  const now = Date.now();
  return {
    open: channelBreaker.openUntil > now,
    consecutiveTimeouts: channelBreaker.consecutiveTimeouts,
    openUntil: channelBreaker.openUntil,
  };
}

export function resetNip07ChannelBreaker() {
  channelBreaker.consecutiveTimeouts = 0;
  channelBreaker.openUntil = 0;
  channelBreaker.lastProbeAt = 0;
}

function isCircuitOpen(now) {
  return channelBreaker.openUntil > now;
}

// While open, allow exactly one probe per CIRCUIT_PROBE_INTERVAL_MS so we can
// detect recovery without re-flooding the channel.
function claimProbeSlot(now) {
  if (now - channelBreaker.lastProbeAt >= CIRCUIT_PROBE_INTERVAL_MS) {
    channelBreaker.lastProbeAt = now;
    return true;
  }
  return false;
}

function recordChannelSuccess() {
  const wasOpen = channelBreaker.openUntil > Date.now();
  channelBreaker.consecutiveTimeouts = 0;
  channelBreaker.openUntil = 0;
  if (wasOpen) {
    userLogger.info(
      "[nostr] NIP-07 signer channel recovered; resuming normal requests.",
    );
  }
}

function recordChannelTimeout() {
  channelBreaker.consecutiveTimeouts += 1;
  if (
    channelBreaker.consecutiveTimeouts >= CIRCUIT_TIMEOUT_THRESHOLD &&
    channelBreaker.openUntil <= Date.now()
  ) {
    channelBreaker.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    userLogger.warn(
      `[nostr] NIP-07 signer channel unresponsive after ${channelBreaker.consecutiveTimeouts} timeouts; ` +
        `failing fast for ${CIRCUIT_OPEN_MS / 1000}s and probing for recovery.`,
    );
  }
}

// Some non-timeout failures are actually dead-channel signals, NOT "the
// extension answered with an error." When the content-script message port is
// severed the call rejects synchronously with one of these messages — which is
// the very condition the breaker exists for, so they must count TOWARD opening
// the circuit (not reset it). Matching the real-env "message channel closed"
// case (KNOWN_BUGS #0) is the whole point.
const CHANNEL_DEATH_PATTERNS = [
  "message channel closed",
  "could not establish connection",
  "receiving end does not exist",
  "extension context invalidated",
  "connection lost",
];
function isChannelDeathError(error) {
  const message =
    error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (!message) return false;
  return CHANNEL_DEATH_PATTERNS.some((pattern) => message.includes(pattern));
}

// A non-timeout failure where the extension genuinely RESPONDED (e.g. user
// rejection, "permission denied", unsupported method) means the channel is
// alive — clear the timeout streak so we don't open on unrelated errors.
function recordChannelResponsiveFailure() {
  channelBreaker.consecutiveTimeouts = 0;
}

export function getEnableVariantTimeoutMs() {
  const overrideValue =
    typeof globalThis !== "undefined" &&
    globalThis !== null &&
    Number.isFinite(globalThis.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__)
      ? Math.floor(globalThis.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__)
      : null;

  if (overrideValue !== null && overrideValue > 0) {
    return Math.max(50, overrideValue);
  }

  return DEFAULT_ENABLE_VARIANT_TIMEOUT_MS;
}

export function normalizePermissionMethod(method) {
  return typeof method === "string" && method.trim() ? method.trim() : "";
}

function getNip07PermissionStorage() {
  const scope =
    typeof globalThis !== "undefined" && globalThis ? globalThis : undefined;
  const browserWindow =
    typeof window !== "undefined" && window ? window : undefined;

  if (browserWindow?.localStorage) {
    return browserWindow.localStorage;
  }

  if (scope?.localStorage) {
    return scope.localStorage;
  }

  return null;
}

export function readStoredNip07Permissions() {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return new Set();
  }

  let rawValue = null;
  try {
    rawValue = storage.getItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    return new Set();
  }

  if (!rawValue) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(rawValue);
    const storedMethods = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.grantedMethods)
        ? parsed.grantedMethods
        : Array.isArray(parsed?.methods)
          ? parsed.methods
          : [];
    return new Set(
      storedMethods
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean),
    );
  } catch (error) {
    clearStoredNip07Permissions();
    return new Set();
  }
}

export function writeStoredNip07Permissions(methods) {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return;
  }

  const normalized = Array.from(
    new Set(
      Array.from(methods || [])
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean),
    ),
  );

  try {
    if (!normalized.length) {
      storage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
      return;
    }

    storage.setItem(
      NIP07_PERMISSIONS_STORAGE_KEY,
      JSON.stringify({ grantedMethods: normalized }),
    );
  } catch (error) {
    // ignore persistence failures
  }
}

export function clearStoredNip07Permissions() {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    // ignore cleanup issues
  }
}

export function withNip07Timeout(
  operation,
  {
    timeoutMs = NIP07_LOGIN_TIMEOUT_MS,
    message = NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
  } = {},
) {
  const numericTimeout = Number(timeoutMs);
  const effectiveTimeout =
    Number.isFinite(numericTimeout) && numericTimeout > 0
      ? numericTimeout
      : NIP07_LOGIN_TIMEOUT_MS;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, effectiveTimeout);
  });

  let operationResult;
  try {
    operationResult = operation();
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw err;
  }

  const operationPromise = Promise.resolve(operationResult);

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export async function runNip07WithRetry(
  operation,
  {
    label = "NIP-07 operation",
    timeoutMs = NIP07_LOGIN_TIMEOUT_MS,
    retryMultiplier = 2,
    priority = NIP07_PRIORITY.NORMAL,
    // Interactive permission prompts bypass the circuit breaker: a user taking
    // their time at the extension UI is not a dead channel, and the prompt must
    // always be allowed through (and can itself heal the channel).
    bypassCircuitBreaker = false,
  } = {},
) {
  // We wrap the entire retry logic in a queue task to ensure only one
  // request hits the extension at a time (per slot).
  const executeTask = async () => {
    // Circuit breaker: when the channel has been declared unresponsive, fail
    // fast (no multi-second hang) for everything except a single periodic probe
    // — this stops the per-list retry loops from pinning the CPU on a dead
    // channel, while still detecting recovery without a page refresh.
    let isProbe = false;
    if (!bypassCircuitBreaker) {
      const now = Date.now();
      if (isCircuitOpen(now)) {
        if (claimProbeSlot(now)) {
          isProbe = true;
        } else {
          const fastFail = new Error(
            NIP07_CHANNEL_UNRESPONSIVE_ERROR_MESSAGE,
          );
          fastFail.code = "nip07-channel-unresponsive";
          throw fastFail;
        }
      }
    }

    // We wrap the operation invocation to ensure it returns a fresh promise each time
    // we attempt it. This is critical for retries: if the first attempt stalls (dropped
    // by extension), re-awaiting the same promise would just keep waiting on the dead request.
    const invokeOperation = () => Promise.resolve(operation());

    const onResult = (result) => {
      if (!bypassCircuitBreaker) {
        recordChannelSuccess();
      }
      return result;
    };
    const onTimeout = () => {
      if (!bypassCircuitBreaker) {
        recordChannelTimeout();
      }
    };
    const onResponsiveFailure = () => {
      if (!bypassCircuitBreaker) {
        recordChannelResponsiveFailure();
      }
    };

    try {
      const result = await withNip07Timeout(invokeOperation, {
        timeoutMs,
        message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
      });
      return onResult(result);
    } catch (error) {
      const isTimeoutError =
        error instanceof Error &&
        error.message === NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE;

      if (!isTimeoutError) {
        // A severed message port rejects with a channel-death message — that IS
        // the dead-channel condition, so count it toward opening the circuit.
        // Any other error means the extension actually responded (channel alive).
        if (isChannelDeathError(error)) {
          onTimeout();
        } else {
          onResponsiveFailure();
        }
        throw error;
      }

      // A probe that times out leaves the circuit open; don't waste a longer
      // retry on a channel we already believe is dead.
      if (retryMultiplier <= 1 || isProbe) {
        onTimeout();
        throw error;
      }

      const extendedTimeout = Math.max(
        timeoutMs,
        Math.round(timeoutMs * retryMultiplier),
      );

      devLogger.warn(
        `[nostr] ${label} taking longer than ${timeoutMs}ms. Retrying with ${extendedTimeout}ms timeout.`,
      );

      // On retry, we invoke operation() again to send a fresh request to the extension.
      try {
        const result = await withNip07Timeout(invokeOperation, {
          timeoutMs: extendedTimeout,
          message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
        });
        return onResult(result);
      } catch (retryError) {
        const retryTimedOut =
          retryError instanceof Error &&
          retryError.message === NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE;
        if (retryTimedOut || isChannelDeathError(retryError)) {
          onTimeout();
        } else {
          onResponsiveFailure();
        }
        throw retryError;
      }
    }
  };

  return requestQueue.enqueue(executeTask, priority);
}

export async function requestEnablePermissions(
  extension,
  outstandingMethods,
  { isDevMode = false } = {},
) {
  if (!extension) {
    return { ok: false, error: new Error("extension-unavailable") };
  }

  const hasRequestPermissions = typeof extension.requestPermissions === "function";
  const hasEnable = typeof extension.enable === "function";

  const normalized = Array.isArray(outstandingMethods)
    ? outstandingMethods
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean)
    : [];

  const permissionVariants = (() => {
    const variants = [];
    if (normalized.length) {
      variants.push({
        permissions: normalized.map((method) => ({ method })),
      });
      variants.push({ permissions: normalized });
      variants.push(normalized);
    }
    variants.push(null);
    return variants;
  })();

  if (!hasRequestPermissions && !hasEnable) {
    return { ok: true, code: "enable-unavailable" };
  }

  let lastError = null;
  const runPermissionMethod = async (methodName, method) => {
    for (const options of permissionVariants) {
      // Specific (silent) payload variants get a generous bound so a slow signer
      // can actually answer the FIRST supported one (unsupported shapes still
      // reject fast and fall through immediately). The no-arg prompt variant
      // gets the full window so users have time to confirm in the extension UI.
      const variantTimeoutOverrides = options
        ? {
            timeoutMs: Math.min(
              SPECIFIC_VARIANT_TIMEOUT_MS,
              getEnableVariantTimeoutMs(),
            ),
            retryMultiplier: 1,
          }
        : {
            timeoutMs: Math.min(
              NIP07_LOGIN_TIMEOUT_MS,
              getEnableVariantTimeoutMs(),
            ),
            retryMultiplier: 1,
          };

      try {
        await runNip07WithRetry(
          () =>
            options === null
              ? method()
              : methodName === "enable"
                ? method(options)
                : method(options),
          {
            label: `extension.${methodName}`,
            ...variantTimeoutOverrides,
            // Interactive grant — never gated by (and can heal) the breaker.
            bypassCircuitBreaker: true,
            // Establishing the channel must outrank list decryption so the
            // handshake isn't starved by a flood of HIGH-priority decrypts.
            priority: NIP07_PRIORITY.CRITICAL,
          },
        );
        return true;
      } catch (error) {
        lastError = error;
        if (options && isDevMode) {
          userLogger.warn(
            `[nostr] extension.${methodName} permission request failed:`,
            error,
          );
        }
      }
    }
    return false;
  };

  // Compatibility-first: prefer standard NIP-07 enable() where available.
  if (hasEnable) {
    const enableSucceeded = await runPermissionMethod(
      "enable",
      extension.enable.bind(extension),
    );
    if (enableSucceeded) {
      return { ok: true };
    }
  }

  // Fallback for extensions that implement requestPermissions() but not enable(),
  // or where enable() payload handling is broken.
  if (hasRequestPermissions) {
    const requestPermissionsSucceeded = await runPermissionMethod(
      "requestPermissions",
      extension.requestPermissions.bind(extension),
    );
    if (requestPermissionsSucceeded) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    error: lastError || new Error("permission-denied"),
  };
}

export const __testExports = {
  requestEnablePermissions,
  runNip07WithRetry,
  withNip07Timeout,
  getEnableVariantTimeoutMs,
  readStoredNip07Permissions,
  writeStoredNip07Permissions,
  clearStoredNip07Permissions,
  normalizePermissionMethod,
  getNip07ChannelBreakerState,
  resetNip07ChannelBreaker,
  CIRCUIT_TIMEOUT_THRESHOLD,
  CIRCUIT_OPEN_MS,
  CIRCUIT_PROBE_INTERVAL_MS,
};

export function waitForNip07Extension(timeoutMs = NIP07_EXTENSION_WAIT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.nostr) {
      resolve(window.nostr);
      return;
    }

    if (typeof window === "undefined") {
      reject(new Error("Not running in a browser environment."));
      return;
    }

    const start = Date.now();
    let resolved = false;

    const finish = (ext) => {
      if (resolved) return;
      resolved = true;
      clearInterval(interval);
      resolve(ext);
    };

    const fail = () => {
      if (resolved) return;
      resolved = true;
      clearInterval(interval);
      reject(new Error("Nostr extension not found within timeout."));
    };

    // Poll every 50ms for window.nostr injection.
    const interval = setInterval(() => {
      if (window.nostr) {
        finish(window.nostr);
      } else if (Date.now() - start > timeoutMs) {
        fail();
      }
    }, 50);

    // Additionally listen for the DOMContentLoaded event — many extensions
    // inject window.nostr during this phase, and detecting it via the event
    // can be faster than waiting for the next poll tick.
    if (typeof document !== "undefined" && document.readyState === "loading") {
      const onReady = () => {
        document.removeEventListener("DOMContentLoaded", onReady);
        if (window.nostr) {
          finish(window.nostr);
        }
      };
      document.addEventListener("DOMContentLoaded", onReady);
    }
  });
}
