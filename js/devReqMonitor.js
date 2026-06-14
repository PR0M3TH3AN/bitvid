// Dev-only relay REQ-rate monitor.
//
// Patches WebSocket.send to count outgoing Nostr REQ frames and, every 2s,
// console.warns when the rate exceeds a threshold — naming the storming filter
// kinds. This runs inside the real browser session against real relays/lists,
// which the headless harness cannot fully reproduce. It is purely observational
// and only activates on localhost (or when `localStorage.__bitvidReqMonitor__`
// is set), so production is unaffected.
//
// Remove this import from index.js once the login-perf work is done.

(function installReqMonitor() {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return;

  const enabled =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    (() => {
      try {
        return localStorage.getItem("__bitvidReqMonitor__") === "1";
      } catch {
        return false;
      }
    })();
  if (!enabled || window.__bitvidReqMonitorInstalled) return;
  window.__bitvidReqMonitorInstalled = true;

  const THRESHOLD = 15; // REQ/s above this is a storm worth reporting
  const WINDOW_MS = 2000;
  let windowReqs = 0;
  const byKind = new Map();

  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    try {
      if (typeof data === "string" && data.startsWith('["REQ"')) {
        windowReqs += 1;
        const msg = JSON.parse(data);
        for (const f of msg.slice(2)) {
          const k = Array.isArray(f?.kinds) ? `kind ${f.kinds.join("/")}` : "kind ?";
          byKind.set(k, (byKind.get(k) || 0) + 1);
        }
      }
    } catch {
      /* ignore */
    }
    return origSend.apply(this, arguments);
  };

  setInterval(() => {
    const perSec = (windowReqs / WINDOW_MS) * 1000;
    if (perSec >= THRESHOLD) {
      const top = [...byKind.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, n]) => `${k}=${n}`)
        .join(", ");
      // eslint-disable-next-line no-console
      console.warn(
        `[req-monitor] RELAY STORM ${perSec.toFixed(0)} REQ/s over ${WINDOW_MS / 1000}s → ${top}`,
      );
    }
    windowReqs = 0;
    byKind.clear();
  }, WINDOW_MS);

  // eslint-disable-next-line no-console
  console.info("[req-monitor] active — will warn if relay REQ rate spikes.");
})();
