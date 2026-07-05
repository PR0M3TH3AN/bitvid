// js/nostr/reqTelemetry.js
//
// Dev-gated REQ tracer for TODO #9 (cold-login relay-REQ storm). Every
// subscription that goes through the shimmed pool.sub/pool.list choke point is
// recorded — kinds, relay fan-out, and the first call site outside the nostr
// plumbing — so one traced cold login tells us exactly WHICH code paths emit
// the burst (the storm's remaining sources are unpinned; see the TODO).
//
// Zero-cost when off: recordReq is a single boolean check. Enable with
//   localStorage.setItem("bitvid:reqTrace", "1")  (then reload)
// or automatically in dev mode. Read results from the periodic
// "[req-trace]" logs or on demand via window.__bitvidReqTrace.report().

import { isDevMode } from "../config.js";
import { userLogger } from "../utils/logger.js";

const STORAGE_FLAG = "bitvid:reqTrace";
const REPORT_WINDOW_MS = 10000;
const PLUMBING_FRAME = /reqTelemetry\.js|toolkit\.js|relaySubscriptionService|subscriptionManager|nostrPublish\.js|node_modules|^Error/i;

function readStorageFlag() {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(STORAGE_FLAG) === "1"
    );
  } catch (error) {
    return false;
  }
}

// First stack frame that is application code rather than pool plumbing.
export function extractCallSite(stack) {
  if (typeof stack !== "string" || !stack) {
    return "unknown";
  }
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim();
    if (!line || PLUMBING_FRAME.test(line)) {
      continue;
    }
    // "at fn (url:line:col)" / "fn@url:line:col" → keep it short but unique
    // enough to identify the module (strip origin, keep path:line).
    const match = line.match(/((?:[\w./-]+\/)?[\w.-]+\.m?js):(\d+)(?::\d+)?/);
    if (match) {
      const fnMatch = line.match(/at ([\w.<>$[\]]+) |^([\w.<>$[\]]+)@/);
      const fn = fnMatch ? fnMatch[1] || fnMatch[2] : "";
      return `${fn ? `${fn} ` : ""}${match[1]}:${match[2]}`.trim();
    }
    return line.slice(0, 120);
  }
  return "unknown";
}

export function createReqTelemetry({
  now = () => Date.now(),
  log = (payload) => userLogger.info("[req-trace]", payload),
  windowMs = REPORT_WINDOW_MS,
} = {}) {
  const state = {
    enabled: false,
    entries: new Map(), // key: `${kinds}|${callSite}` → { kinds, callSite, count, relayFanout }
    total: 0,
    relayFanout: 0,
    windowStart: 0,
    timer: null,
  };

  const reset = () => {
    state.entries.clear();
    state.total = 0;
    state.relayFanout = 0;
    state.windowStart = now();
  };

  const record = (relayCount, filters, stack) => {
    if (!state.enabled) {
      return;
    }
    const list = Array.isArray(filters) ? filters : filters ? [filters] : [];
    const kinds = Array.from(
      new Set(
        list.flatMap((filter) =>
          Array.isArray(filter?.kinds) ? filter.kinds : [],
        ),
      ),
    )
      .sort((a, b) => a - b)
      .join(",");
    const callSite = extractCallSite(stack);
    const key = `${kinds || "?"}|${callSite}`;
    const entry = state.entries.get(key) || {
      kinds: kinds || "?",
      callSite,
      count: 0,
      relayFanout: 0,
    };
    entry.count += 1;
    entry.relayFanout += Number.isFinite(relayCount) ? relayCount : 0;
    state.entries.set(key, entry);
    state.total += 1;
    state.relayFanout += Number.isFinite(relayCount) ? relayCount : 0;
  };

  const report = ({ emit = true } = {}) => {
    const elapsedMs = Math.max(1, now() - state.windowStart);
    const rows = Array.from(state.entries.values()).sort(
      (a, b) => b.count - a.count,
    );
    const payload = {
      windowSeconds: Math.round(elapsedMs / 100) / 10,
      totalSubs: state.total,
      totalRelayReqs: state.relayFanout,
      perSecond: Math.round((state.relayFanout / elapsedMs) * 10000) / 10,
      byKindsAndCaller: rows.slice(0, 15).map((row) => ({
        kinds: row.kinds,
        caller: row.callSite,
        subs: row.count,
        relayReqs: row.relayFanout,
      })),
    };
    if (emit && state.total > 0) {
      log(payload);
    }
    return payload;
  };

  const start = () => {
    if (state.enabled) {
      return;
    }
    state.enabled = true;
    reset();
    if (typeof setInterval === "function" && !state.timer) {
      state.timer = setInterval(() => {
        report();
        reset();
      }, windowMs);
      if (typeof state.timer?.unref === "function") {
        state.timer.unref();
      }
    }
  };

  const stop = () => {
    state.enabled = false;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  };

  return {
    get enabled() {
      return state.enabled;
    },
    start,
    stop,
    reset,
    record,
    report,
  };
}

const defaultTelemetry = createReqTelemetry();

// Auto-arm in dev mode or when the localStorage flag is set; expose a console
// handle either way so it can be started on a production build too.
if (isDevMode || readStorageFlag()) {
  defaultTelemetry.start();
}
if (typeof window !== "undefined") {
  window.__bitvidReqTrace = defaultTelemetry;
}

// Hot-path hook for the pool shim: one boolean check when tracing is off.
export function recordReq(relayCount, filters) {
  if (!defaultTelemetry.enabled) {
    return;
  }
  defaultTelemetry.record(relayCount, filters, new Error().stack);
}

export default defaultTelemetry;
