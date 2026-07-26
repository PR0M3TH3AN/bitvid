// Local-only relay REQ-rate monitor.
//
// It patches WebSocket.send for a real-session relay-storm investigation, so
// normal localhost development must opt in explicitly. Public deployments can
// never enable it, even if a storage key is present.

export const REQUEST_MONITOR_STORAGE_KEY = "__bitvidReqMonitor__";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const THRESHOLD = 15;
const WINDOW_MS = 2000;

function readStorage(storage) {
  try {
    return storage?.getItem?.(REQUEST_MONITOR_STORAGE_KEY) ?? null;
  } catch (_) {
    return null;
  }
}

export function isRequestMonitorEnabled({ locationRef, storage } = {}) {
  const hostname = typeof locationRef?.hostname === "string"
    ? locationRef.hostname.toLowerCase()
    : "";
  return LOCAL_HOSTS.has(hostname) && readStorage(storage) === "1";
}

export function installRequestMonitor({
  scope = typeof window !== "undefined" ? window : null,
  locationRef = scope?.location,
  storage = scope?.localStorage,
  WebSocketClass = scope?.WebSocket,
  setIntervalFn = scope?.setInterval?.bind(scope),
  clearIntervalFn = scope?.clearInterval?.bind(scope),
  logger = scope?.console || console,
} = {}) {
  if (
    !scope ||
    !WebSocketClass?.prototype ||
    typeof WebSocketClass.prototype.send !== "function" ||
    typeof setIntervalFn !== "function" ||
    !isRequestMonitorEnabled({ locationRef, storage })
  ) {
    return null;
  }
  if (scope.__bitvidReqMonitorInstalled) {
    return scope.__bitvidReqMonitorInstalled;
  }

  let windowReqs = 0;
  const byKind = new Map();
  const originalSend = WebSocketClass.prototype.send;

  WebSocketClass.prototype.send = function monitoredSend(data) {
    try {
      if (typeof data === "string" && data.startsWith('["REQ"')) {
        windowReqs += 1;
        const message = JSON.parse(data);
        for (const filter of message.slice(2)) {
          const kind = Array.isArray(filter?.kinds)
            ? `kind ${filter.kinds.join("/")}`
            : "kind ?";
          byKind.set(kind, (byKind.get(kind) || 0) + 1);
        }
      }
    } catch (_) {
      // Diagnostics must never affect a WebSocket send.
    }
    return originalSend.apply(this, arguments);
  };

  const intervalId = setIntervalFn(() => {
    const perSecond = (windowReqs / WINDOW_MS) * 1000;
    if (perSecond >= THRESHOLD) {
      const top = [...byKind.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(", ");
      logger?.warn?.(
        `[req-monitor] RELAY STORM ${perSecond.toFixed(0)} REQ/s over ${WINDOW_MS / 1000}s → ${top}`,
      );
    }
    windowReqs = 0;
    byKind.clear();
  }, WINDOW_MS);

  const monitor = {
    stop() {
      WebSocketClass.prototype.send = originalSend;
      if (typeof clearIntervalFn === "function") {
        clearIntervalFn(intervalId);
      }
      if (scope.__bitvidReqMonitorInstalled === monitor) {
        delete scope.__bitvidReqMonitorInstalled;
      }
    },
  };
  scope.__bitvidReqMonitorInstalled = monitor;
  logger?.info?.("[req-monitor] active — will warn if relay REQ rate spikes.");
  return monitor;
}

installRequestMonitor();
