import { devLogger, userLogger } from "../utils/logger.js";

const TELEMETRY_STORAGE_KEY = "bitvid:relay-health-telemetry-opt-in";

function resolveLogger(logger) {
  if (logger && logger.dev && logger.user) {
    return logger;
  }
  return { dev: devLogger, user: userLogger };
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function readTelemetryOptIn() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const stored = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
    return stored === "true";
  } catch (error) {
    userLogger.warn(
      "[relayHealth] Failed to read telemetry preference from storage.",
      error,
    );
    return false;
  }
}

function writeTelemetryOptIn(nextValue) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      TELEMETRY_STORAGE_KEY,
      nextValue ? "true" : "false",
    );
  } catch (error) {
    userLogger.warn(
      "[relayHealth] Failed to persist telemetry preference.",
      error,
    );
  }
}

class RelayHealthService {
  constructor({ relayManager, nostrClient, logger, telemetryEmitter } = {}) {
    this.relayManager = relayManager || null;
    this.nostrClient = nostrClient || null;
    this.logger = resolveLogger(logger);
    this.telemetryEmitter =
      typeof telemetryEmitter === "function" ? telemetryEmitter : null;
    this.relayStates = new Map();
    this.attachedRelays = new Set();
    this.cachedTelemetryOptIn = readTelemetryOptIn();
  }

  getTelemetryOptIn() {
    return this.cachedTelemetryOptIn;
  }

  setTelemetryOptIn(value) {
    const normalized = Boolean(value);
    this.cachedTelemetryOptIn = normalized;
    writeTelemetryOptIn(normalized);
    return normalized;
  }

  getRelayUrls() {
    if (!this.relayManager || typeof this.relayManager.getEntries !== "function") {
      return [];
    }
    const entries = this.relayManager.getEntries();
    return entries
      .map((entry) => (typeof entry?.url === "string" ? entry.url.trim() : ""))
      .filter(Boolean);
  }

  ensureRelayState(relayUrl) {
    if (!this.relayStates.has(relayUrl)) {
      this.relayStates.set(relayUrl, {
        url: relayUrl,
        connected: false,
        lastLatencyMs: null,
        errorCount: 0,
        lastCheckedAt: null,
        lastErrorAt: null,
      });
    }

    return this.relayStates.get(relayUrl);
  }

  attachRelayListeners(relayUrl, relay) {
    if (!relay || typeof relay.on !== "function") {
      return;
    }
    if (this.attachedRelays.has(relayUrl)) {
      return;
    }

    try {
      relay.on("connect", () => {
        this.recordRelaySuccess(relayUrl, null);
      });
      relay.on("disconnect", () => {
        this.recordRelayFailure(relayUrl, new Error("relay-disconnect"));
      });
      relay.on("error", (error) => {
        this.recordRelayFailure(relayUrl, error);
      });
      this.attachedRelays.add(relayUrl);
    } catch (error) {
      this.logger.dev.warn(
        "[relayHealth] Failed to attach relay listeners.",
        error,
      );
    }
  }

  recordRelaySuccess(relayUrl, latencyMs) {
    const state = this.ensureRelayState(relayUrl);
    state.connected = true;
    state.lastCheckedAt = Date.now();
    if (Number.isFinite(latencyMs)) {
      state.lastLatencyMs = Math.max(0, Math.round(latencyMs));
    }
  }

  recordRelayFailure(relayUrl, error) {
    const state = this.ensureRelayState(relayUrl);
    state.connected = false;
    state.errorCount += 1;
    state.lastCheckedAt = Date.now();
    state.lastErrorAt = Date.now();

    this.logger.dev.warn("[relayHealth] Relay check failed.", {
      relayUrl,
      error,
    });
  }

  async checkRelay(relayUrl) {
    if (!relayUrl) {
      return;
    }

    if (!this.nostrClient) {
      this.recordRelayFailure(relayUrl, new Error("nostr-client-unavailable"));
      return;
    }

    try {
      if (typeof this.nostrClient.ensurePool === "function") {
        await this.nostrClient.ensurePool();
      }
    } catch (error) {
      this.recordRelayFailure(relayUrl, error);
      return;
    }

    if (!this.nostrClient.pool || typeof this.nostrClient.pool.ensureRelay !== "function") {
      this.recordRelayFailure(relayUrl, new Error("relay-pool-unavailable"));
      return;
    }

    const start = nowMs();
    try {
      const relay = await this.nostrClient.pool.ensureRelay(relayUrl);
      if (!relay) {
        throw new Error("relay-unavailable");
      }

      this.attachRelayListeners(relayUrl, relay);
      this.recordRelaySuccess(relayUrl, nowMs() - start);
    } catch (error) {
      this.recordRelayFailure(relayUrl, error);
    }
  }

  getSnapshot(relayUrls = null) {
    const urls = Array.isArray(relayUrls) ? relayUrls : this.getRelayUrls();
    return urls.map((url) => ({ ...this.ensureRelayState(url) }));
  }

  async refresh(relayUrls = null) {
    const urls = Array.isArray(relayUrls) ? relayUrls : this.getRelayUrls();
    if (!urls.length) {
      return [];
    }

    await Promise.allSettled(urls.map((url) => this.checkRelay(url)));
    const snapshot = this.getSnapshot(urls);
    this.emitTelemetry(snapshot);
    return snapshot;
  }

  emitTelemetry(snapshot) {
    if (!this.telemetryEmitter || !this.getTelemetryOptIn()) {
      return;
    }

    const payload = {
      sampledAt: Date.now(),
      relays: Array.isArray(snapshot)
        ? snapshot.map((entry) => ({
            url: entry.url,
            connected: Boolean(entry.connected),
            latencyMs:
              Number.isFinite(entry.lastLatencyMs) ? entry.lastLatencyMs : null,
            errorCount: Number.isFinite(entry.errorCount)
              ? entry.errorCount
              : 0,
          }))
        : [],
    };

    try {
      this.telemetryEmitter("relay_health_snapshot", payload);
    } catch (error) {
      this.logger.user.warn(
        "[relayHealth] Failed to emit relay health telemetry.",
        error,
      );
    }
  }
}

export default RelayHealthService;
