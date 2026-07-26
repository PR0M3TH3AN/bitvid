// Local-only performance measurement harness.
//
// This intentionally observes rather than changes application behavior. It is
// available only on a loopback host *and* after an explicit localStorage opt-in,
// so a production visitor cannot accidentally enable it.

const STORAGE_KEY = "__bitvidPerformanceHarness__";
const GLOBAL_KEY = "__bitvidPerformance";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MAX_LONG_TASKS = 200;
const MAX_MARKS = 200;

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch (_) {
    return null;
  }
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizeMarkName(name) {
  return typeof name === "string" ? name.trim().slice(0, 120) : "";
}

export function isLocalPerformanceHarnessEnabled({
  locationRef = typeof location !== "undefined" ? location : null,
  storage = typeof localStorage !== "undefined" ? localStorage : null,
} = {}) {
  const hostname = typeof locationRef?.hostname === "string"
    ? locationRef.hostname.toLowerCase()
    : "";
  return LOCAL_HOSTS.has(hostname) && readStorage(storage, STORAGE_KEY) === "1";
}

export class PerformanceHarness {
  constructor({ scope, performanceRef, PerformanceObserverClass } = {}) {
    this.scope = scope || null;
    this.performance = performanceRef || this.scope?.performance || null;
    this.PerformanceObserverClass =
      PerformanceObserverClass || this.scope?.PerformanceObserver || null;
    this.startedAt = 0;
    this.longTasks = [];
    this.marks = [];
    this.gauges = new Map();
    this.longTaskObserver = null;
    this.started = false;
  }

  start() {
    if (this.started) {
      return this;
    }
    this.started = true;
    this.startedAt = this.now();
    this.observeLongTasks();
    this.mark("harness-start");
    if (this.scope) {
      this.scope[GLOBAL_KEY] = this.publicApi();
    }
    return this;
  }

  stop() {
    try {
      this.longTaskObserver?.disconnect?.();
    } catch (_) {
      // Diagnostics must never affect application teardown.
    }
    this.longTaskObserver = null;
    this.started = false;
    if (this.scope?.[GLOBAL_KEY]) {
      delete this.scope[GLOBAL_KEY];
    }
  }

  now() {
    return finiteNumber(this.performance?.now?.(), Date.now());
  }

  observeLongTasks() {
    if (typeof this.PerformanceObserverClass !== "function") {
      return;
    }
    try {
      const observer = new this.PerformanceObserverClass((list) => {
        const entries = list?.getEntries?.() || [];
        for (const entry of entries) {
          this.recordLongTask(entry);
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      this.longTaskObserver = observer;
    } catch (_) {
      // Long Task timing is optional and unsupported in several browsers.
    }
  }

  recordLongTask(entry) {
    const task = {
      startTime: finiteNumber(entry?.startTime),
      duration: finiteNumber(entry?.duration),
      name: typeof entry?.name === "string" ? entry.name : "longtask",
    };
    this.longTasks.push(task);
    if (this.longTasks.length > MAX_LONG_TASKS) {
      this.longTasks.splice(0, this.longTasks.length - MAX_LONG_TASKS);
    }
  }

  mark(name, detail = {}) {
    const normalizedName = normalizeMarkName(name);
    if (!normalizedName) {
      return false;
    }
    const entry = {
      name: normalizedName,
      at: this.now(),
      detail: detail && typeof detail === "object" ? { ...detail } : {},
    };
    this.marks.push(entry);
    if (this.marks.length > MAX_MARKS) {
      this.marks.splice(0, this.marks.length - MAX_MARKS);
    }
    try {
      this.performance?.mark?.(`bitvid:${normalizedName}`);
    } catch (_) {
      // User Timing is also optional; retain the local mark either way.
    }
    return true;
  }

  setGauge(name, value) {
    const normalizedName = normalizeMarkName(name);
    if (!normalizedName || !Number.isFinite(value)) {
      return false;
    }
    this.gauges.set(normalizedName, Number(value));
    return true;
  }

  increment(name, amount = 1) {
    const normalizedName = normalizeMarkName(name);
    if (!normalizedName || !Number.isFinite(amount)) {
      return false;
    }
    return this.setGauge(normalizedName, (this.gauges.get(normalizedName) || 0) + amount);
  }

  snapshot() {
    const resources = this.performance?.getEntriesByType?.("resource") || [];
    const navigation = this.performance?.getEntriesByType?.("navigation")?.[0] || null;
    const memory = this.performance?.memory;
    const longTaskDurationMs = this.longTasks.reduce(
      (total, task) => total + finiteNumber(task.duration),
      0,
    );
    return {
      enabled: this.started,
      startedAt: this.startedAt,
      elapsedMs: Math.max(0, this.now() - this.startedAt),
      longTasks: {
        count: this.longTasks.length,
        totalDurationMs: longTaskDurationMs,
        recent: this.longTasks.slice(-20),
      },
      marks: this.marks.slice(-50),
      gauges: Object.fromEntries(this.gauges.entries()),
      resources: {
        count: resources.length,
        transferSize: resources.reduce(
          (total, entry) => total + finiteNumber(entry?.transferSize),
          0,
        ),
      },
      navigation: navigation
        ? {
            domContentLoadedMs: finiteNumber(navigation.domContentLoadedEventEnd),
            loadEventMs: finiteNumber(navigation.loadEventEnd),
          }
        : null,
      memory: memory
        ? {
            usedJsHeapSize: finiteNumber(memory.usedJSHeapSize),
            totalJsHeapSize: finiteNumber(memory.totalJSHeapSize),
            jsHeapSizeLimit: finiteNumber(memory.jsHeapSizeLimit),
          }
        : null,
    };
  }

  reset() {
    this.longTasks.length = 0;
    this.marks.length = 0;
    this.gauges.clear();
    this.mark("harness-reset");
  }

  publicApi() {
    return Object.freeze({
      snapshot: () => this.snapshot(),
      mark: (name, detail) => this.mark(name, detail),
      setGauge: (name, value) => this.setGauge(name, value),
      increment: (name, amount) => this.increment(name, amount),
      reset: () => this.reset(),
      stop: () => this.stop(),
    });
  }
}

export function initPerformanceHarness({
  scope = typeof window !== "undefined" ? window : null,
  locationRef = scope?.location,
  storage = scope?.localStorage,
  performanceRef = scope?.performance,
  PerformanceObserverClass = scope?.PerformanceObserver,
} = {}) {
  if (!scope || !isLocalPerformanceHarnessEnabled({ locationRef, storage })) {
    return null;
  }
  if (scope[GLOBAL_KEY]) {
    return scope[GLOBAL_KEY];
  }
  const harness = new PerformanceHarness({
    scope,
    performanceRef,
    PerformanceObserverClass,
  });
  harness.start();
  return scope[GLOBAL_KEY];
}

export const PERFORMANCE_HARNESS_STORAGE_KEY = STORAGE_KEY;
