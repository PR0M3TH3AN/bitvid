import { isDevMode } from "./config.js";
import { DEFAULT_RELAY_URLS } from "./nostr/toolkit.js";
import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostrClientFacade.js";
import { getActiveSigner } from "./nostr/index.js";
import { buildRelayListEvent } from "./nostrEventSchemas.js";
import { devLogger, userLogger } from "./utils/logger.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "./nostrPublish.js";

const MODE_SEQUENCE = ["both", "read", "write"];

const FAST_RELAY_FETCH_LIMIT = 3;
const FAST_RELAY_TIMEOUT_MS = 2500;
const BACKGROUND_RELAY_TIMEOUT_MS = 6000;

function normalizeHexPubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }
  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

function normalizeRelayUrl(input) {
  if (typeof input !== "string") {
    return null;
  }

  let candidate = input.trim();
  if (!candidate) {
    return null;
  }

  if (!/^[a-z]+:\/\//i.test(candidate)) {
    candidate = `wss://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : "";
  let pathname = parsed.pathname || "";
  if (pathname !== "/") {
    pathname = pathname.replace(/\/+$/, "");
  }
  if (pathname === "/") {
    pathname = "";
  }
  const search = parsed.search || "";
  const hash = parsed.hash || "";

  return `${parsed.protocol}//${hostname}${port}${pathname}${search}${hash}`;
}

function deriveMode(marker) {
  if (typeof marker !== "string") {
    return "both";
  }
  const normalized = marker.trim().toLowerCase();
  if (normalized === "read") {
    return "read";
  }
  if (normalized === "write") {
    return "write";
  }
  return "both";
}

function createEntry(url, mode = "both") {
  const normalizedMode = deriveMode(mode);
  return {
    url,
    mode: normalizedMode,
    read: normalizedMode !== "write",
    write: normalizedMode !== "read",
  };
}

function cloneEntry(entry) {
  return {
    url: entry.url,
    mode: entry.mode,
    read: !!entry.read,
    write: !!entry.write,
  };
}

function serializeEntries(entries) {
  return JSON.stringify(
    entries.map((entry) => ({ url: entry.url, mode: entry.mode }))
  );
}

function parseRelayTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Map();
  const order = [];

  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }
    if (tag[0] !== "r") {
      return;
    }
    const normalizedUrl = normalizeRelayUrl(tag[1]);
    if (!normalizedUrl) {
      return;
    }
    if (!seen.has(normalizedUrl)) {
      seen.set(normalizedUrl, { read: false, write: false });
      order.push(normalizedUrl);
    }
    const record = seen.get(normalizedUrl);
    const mode = deriveMode(tag[2]);
    if (mode === "read") {
      record.read = true;
    } else if (mode === "write") {
      record.write = true;
    } else {
      record.read = true;
      record.write = true;
    }
  });

  return order.map((url) => {
    const record = seen.get(url) || { read: true, write: true };
    if (record.read && record.write) {
      return createEntry(url, "both");
    }
    if (record.read) {
      return createEntry(url, "read");
    }
    if (record.write) {
      return createEntry(url, "write");
    }
    return createEntry(url, "both");
  });
}

function resolveEntryInput(entry) {
  if (typeof entry === "string") {
    return { url: entry, mode: "both" };
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const url = typeof entry.url === "string" ? entry.url : "";
  let mode = entry.mode || entry.marker;
  if (!mode) {
    if (entry.read === true && entry.write === false) {
      mode = "read";
    } else if (entry.write === true && entry.read === false) {
      mode = "write";
    }
  }
  return { url, mode: deriveMode(mode) };
}

class RelayPreferencesManager {
  constructor() {
    this.entries = [];
    this.entryIndex = new Map();
    this.lastEvent = null;
    this.loadedPubkey = null;
    this.lastLoadSource = "default";
    this.defaultEntries = DEFAULT_RELAY_URLS.map((url) => {
      const normalized = normalizeRelayUrl(url) || url;
      return createEntry(normalized, "both");
    });
    this.setEntries(this.defaultEntries, { allowEmpty: false, updateClient: true });
  }

  snapshot() {
    return this.getEntries();
  }

  getEntries() {
    return this.entries.map((entry) => cloneEntry(entry));
  }

  getAllRelayUrls() {
    return this.entries.map((entry) => entry.url);
  }

  getReadRelayUrls() {
    return this.entries.filter((entry) => entry.read).map((entry) => entry.url);
  }

  getWriteRelayUrls() {
    return this.entries.filter((entry) => entry.write).map((entry) => entry.url);
  }

  syncClient() {
    if (nostrClient && typeof nostrClient.applyRelayPreferences === "function") {
      nostrClient.applyRelayPreferences({
        all: this.getAllRelayUrls(),
        read: this.getReadRelayUrls(),
        write: this.getWriteRelayUrls(),
      });
    } else if (nostrClient) {
      nostrClient.relays = this.getAllRelayUrls();
      const writeUrls = this.getWriteRelayUrls();
      if (Array.isArray(writeUrls) && writeUrls.length) {
        nostrClient.writeRelays = [...writeUrls];
      } else {
        nostrClient.writeRelays = this.getAllRelayUrls();
      }
    }
  }

  setEntries(entries, { allowEmpty = false, updateClient = true } = {}) {
    const nextEntries = [];
    const indexMap = new Map();

    if (Array.isArray(entries)) {
      entries.forEach((item) => {
        const resolved = resolveEntryInput(item);
        if (!resolved) {
          return;
        }
        const normalizedUrl = normalizeRelayUrl(resolved.url);
        if (!normalizedUrl || indexMap.has(normalizedUrl)) {
          return;
        }
        const normalizedEntry = createEntry(normalizedUrl, resolved.mode);
        indexMap.set(normalizedUrl, nextEntries.length);
        nextEntries.push(normalizedEntry);
      });
    }

    if (!nextEntries.length && !allowEmpty) {
      this.entries = this.defaultEntries.map((entry) => cloneEntry(entry));
      this.entryIndex = new Map(
        this.entries.map((entry, idx) => [entry.url, idx])
      );
      if (updateClient) {
        this.syncClient();
      }
      return this.getEntries();
    }

    this.entries = nextEntries.map((entry) => cloneEntry(entry));
    this.entryIndex = new Map(
      this.entries.map((entry, idx) => [entry.url, idx])
    );

    if (!this.entries.length && !allowEmpty) {
      this.entries = this.defaultEntries.map((entry) => cloneEntry(entry));
      this.entryIndex = new Map(
        this.entries.map((entry, idx) => [entry.url, idx])
      );
    }

    if (updateClient) {
      this.syncClient();
    }

    return this.getEntries();
  }

  addRelay(url, mode = "both") {
    const normalizedUrl = normalizeRelayUrl(url);
    if (!normalizedUrl) {
      const error = new Error("Enter a valid WSS relay URL.");
      error.code = "invalid";
      throw error;
    }
    if (this.entryIndex.has(normalizedUrl)) {
      return {
        changed: false,
        reason: "duplicate",
        entry: cloneEntry(this.entries[this.entryIndex.get(normalizedUrl)]),
      };
    }

    const nextEntries = this.getEntries();
    nextEntries.push({ url: normalizedUrl, mode });
    this.setEntries(nextEntries, { allowEmpty: false });

    return {
      changed: true,
      entry: cloneEntry(this.entries[this.entryIndex.get(normalizedUrl)]),
    };
  }

  updateRelayMode(url, mode = "both") {
    const normalizedUrl = normalizeRelayUrl(url);
    if (!normalizedUrl) {
      const error = new Error("Enter a valid relay URL.");
      error.code = "invalid";
      throw error;
    }
    if (!this.entryIndex.has(normalizedUrl)) {
      return { changed: false, reason: "missing" };
    }

    const normalizedMode = deriveMode(mode);
    const index = this.entryIndex.get(normalizedUrl);
    const current = this.entries[index];
    if (current.mode === normalizedMode) {
      return { changed: false, entry: cloneEntry(current) };
    }

    const nextEntries = this.getEntries();
    nextEntries[index].mode = normalizedMode;
    this.setEntries(nextEntries, { allowEmpty: false });

    return {
      changed: true,
      entry: cloneEntry(this.entries[this.entryIndex.get(normalizedUrl)]),
    };
  }

  cycleRelayMode(url) {
    const normalizedUrl = normalizeRelayUrl(url);
    if (!normalizedUrl) {
      const error = new Error("Enter a valid relay URL.");
      error.code = "invalid";
      throw error;
    }
    if (!this.entryIndex.has(normalizedUrl)) {
      const error = new Error("Relay not found.");
      error.code = "missing";
      throw error;
    }
    const index = this.entryIndex.get(normalizedUrl);
    const currentMode = this.entries[index].mode || "both";
    const currentIdx = MODE_SEQUENCE.indexOf(currentMode);
    const nextMode = MODE_SEQUENCE[(currentIdx + 1) % MODE_SEQUENCE.length];
    return this.updateRelayMode(normalizedUrl, nextMode);
  }

  removeRelay(url) {
    const normalizedUrl = normalizeRelayUrl(url);
    if (!normalizedUrl) {
      const error = new Error("Enter a valid relay URL to remove.");
      error.code = "invalid";
      throw error;
    }
    if (!this.entryIndex.has(normalizedUrl)) {
      return { changed: false, reason: "missing" };
    }
    if (this.entries.length <= 1) {
      const error = new Error("At least one relay is required.");
      error.code = "minimum";
      throw error;
    }

    const nextEntries = this.getEntries().filter((entry) => entry.url !== normalizedUrl);
    this.setEntries(nextEntries, { allowEmpty: false });
    return { changed: true };
  }

  restoreDefaults() {
    const before = serializeEntries(this.entries);
    this.setEntries(this.defaultEntries, { allowEmpty: false });
    const after = serializeEntries(this.entries);
    return { changed: before !== after };
  }

  reset() {
    this.lastEvent = null;
    this.loadedPubkey = null;
    this.lastLoadSource = "default";
    this.setEntries(this.defaultEntries, { allowEmpty: false });
  }

  getPublishTargets(customTargets = null) {
    const targets = new Set();
    const list =
      Array.isArray(customTargets) && customTargets.length
        ? customTargets
        : this.getAllRelayUrls();

    list.forEach((candidate) => {
      const normalized = normalizeRelayUrl(candidate);
      if (normalized) {
        targets.add(normalized);
      }
    });

    DEFAULT_RELAY_URLS.forEach((url) => {
      const normalized = normalizeRelayUrl(url) || url;
      targets.add(normalized);
    });

    return Array.from(targets);
  }

  async loadRelayList(pubkey) {
    const normalizedPubkey = normalizeHexPubkey(pubkey);
    this.loadedPubkey = normalizedPubkey;

    if (!normalizedPubkey) {
      this.lastLoadSource = "default";
      this.setEntries(this.defaultEntries, { allowEmpty: false });
      return { ok: false, reason: "invalid-pubkey" };
    }

    if (!nostrClient?.pool) {
      this.lastLoadSource = "default";
      this.setEntries(this.defaultEntries, { allowEmpty: false });
      return { ok: false, reason: "nostr-uninitialized" };
    }

    const filter = { kinds: [10002], authors: [normalizedPubkey], limit: 1 };
    const targetRelays = this.getPublishTargets();
    const applyEvents = (events, { skipIfEmpty = false } = {}) => {
      if (!Array.isArray(events) || !events.length) {
        if (skipIfEmpty) {
          return null;
        }
        this.lastEvent = null;
        this.lastLoadSource = "default";
        this.setEntries(this.defaultEntries, { allowEmpty: false });
        return { ok: true, source: "default", events: [] };
      }

      const sorted = events
        .filter((event) => event && event.pubkey === normalizedPubkey)
        .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

      if (!sorted.length) {
        if (skipIfEmpty) {
          return null;
        }
        this.lastEvent = null;
        this.lastLoadSource = "default";
        this.setEntries(this.defaultEntries, { allowEmpty: false });
        return { ok: true, source: "default", events: [] };
      }

      const newest = sorted[0];
      this.lastEvent = newest;

      const parsed = parseRelayTags(newest?.tags);
      if (parsed.length) {
        this.setEntries(parsed, { allowEmpty: false });
        this.lastLoadSource = "event";
        return { ok: true, source: "event", event: newest };
      }

      this.lastLoadSource = "default";
      this.setEntries(this.defaultEntries, { allowEmpty: false });
      return { ok: true, source: "default", event: newest };
    };

    const fetchFromRelay = (relayUrl, timeoutMs, requireEvent) => {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          const timeoutError = new Error(
            `Timed out fetching relay list from ${relayUrl} after ${timeoutMs}ms`
          );
          timeoutError.code = "timeout";
          timeoutError.relay = relayUrl;
          timeoutError.timeoutMs = timeoutMs;
          reject(timeoutError);
        }, timeoutMs);

        Promise.resolve()
          .then(() => nostrClient.pool.list([relayUrl], [filter]))
          .then((result) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            const events = Array.isArray(result)
              ? result.filter((event) => event && event.pubkey === normalizedPubkey)
              : [];
            if (requireEvent && !events.length) {
              const emptyError = new Error(
                `No relay list events returned from ${relayUrl}`
              );
              emptyError.code = "empty";
              emptyError.relay = relayUrl;
              reject(emptyError);
              return;
            }
            resolve({ relayUrl, events });
          })
          .catch((error) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            const wrapped =
              error instanceof Error ? error : new Error(String(error));
            wrapped.relay = relayUrl;
            reject(wrapped);
          });
      });
    };

    const fastRelays = targetRelays.slice(0, FAST_RELAY_FETCH_LIMIT);
    const backgroundRelays = targetRelays.slice(fastRelays.length);

    const fastPromises = fastRelays.map((relayUrl) =>
      fetchFromRelay(relayUrl, FAST_RELAY_TIMEOUT_MS, true)
    );
    const backgroundPromises = backgroundRelays.map((relayUrl) =>
      fetchFromRelay(relayUrl, BACKGROUND_RELAY_TIMEOUT_MS, false)
    );

    const background = Promise.allSettled([
      ...fastPromises,
      ...backgroundPromises,
    ])
      .then((outcomes) => {
        const aggregated = [];
        outcomes.forEach((outcome) => {
          if (outcome.status === "fulfilled") {
            const events = Array.isArray(outcome.value?.events)
              ? outcome.value.events
              : [];
            if (events.length) {
              aggregated.push(...events);
            }
          } else {
            const reason = outcome.reason;
            if (reason?.code === "timeout") {
              devLogger.warn(
              `[relayManager] Relay ${reason.relay} timed out while loading relay list (${reason.timeoutMs}ms)`
              );
            } else devLogger.warn(
 `[relayManager] Relay ${reason?.relay || "unknown"} failed while loading relay list:`,
 reason
 );
          }
        });

        if (!aggregated.length) {
          return;
        }

        applyEvents(aggregated, { skipIfEmpty: true });
      })
      .catch((error) => {
        devLogger.warn("[relayManager] Background relay refresh failed", error);
      });

    let fastResult = null;
    if (fastPromises.length) {
      try {
        fastResult = await Promise.any(fastPromises);
      } catch (error) {
        if (error instanceof AggregateError) {
          error.errors?.forEach((err) => {
            if (err?.code === "timeout" && isDevMode) {
              userLogger.warn(
                `[relayManager] Relay ${err.relay} timed out while loading relay list (${err.timeoutMs}ms)`
              );
            }
          });
        } else devLogger.warn("[relayManager] Fast relay fetch failed", error);
      }
    }

    if (fastResult?.events?.length) {
      const result = applyEvents(fastResult.events);
      background.catch(() => {});
      return result;
    }

    const fallback = applyEvents([], { skipIfEmpty: false });
    background.catch(() => {});
    return fallback;
  }

  async publishRelayList(pubkey, options = {}) {
    const normalizedPubkey = normalizeHexPubkey(pubkey);
    if (!normalizedPubkey) {
      const error = new Error(
        "A valid pubkey is required to publish relay preferences."
      );
      error.code = "invalid-pubkey";
      throw error;
    }

    const signer = getActiveSigner();
    if (!signer || typeof signer.signEvent !== "function") {
      const error = new Error(
        "An active signer with signEvent support is required to publish relay preferences."
      );
      error.code = "nostr-extension-missing";
      throw error;
    }

    if (signer.type === "extension") {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        userLogger.warn(
          "[RelayPreferencesManager] Signer permissions denied while publishing relay preferences.",
          permissionResult.error,
        );
        const error = new Error(
          "The active signer must allow signing before publishing relay preferences.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult.error;
        throw error;
      }
    }

    if (!nostrClient?.pool) {
      const error = new Error(
        "Nostr is not connected yet. Please try again once relays are ready."
      );
      error.code = "nostr-uninitialized";
      throw error;
    }

    const entries = this.getEntries();
    if (!entries.length) {
      const error = new Error("Add at least one relay before publishing.");
      error.code = "empty";
      throw error;
    }

    const event = buildRelayListEvent({
      pubkey: normalizedPubkey,
      created_at: Math.floor(Date.now() / 1000),
      relays: entries,
    });

    const signedEvent = await signer.signEvent(event);
    const targets = this.getPublishTargets(options?.relayUrls);

    if (!targets.length) {
      const error = new Error("No relay targets are available for publishing.");
      error.code = "no-targets";
      throw error;
    }

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      targets,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "relay preferences update",
        message: "No relays accepted the update.",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[RelayPreferencesManager] Relay ${url} rejected relay list: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[RelayPreferencesManager] Relay ${url} did not acknowledge relay list: ${reason}`,
          relayError
        );
      });
    }

    const accepted = publishSummary.accepted.map(({ url }) => url);
    const failed = publishSummary.failed.map(({ url, error: relayError }) => ({
      url,
      reason: relayError || null,
    }));

    this.lastEvent = signedEvent;

    return { ok: true, event: signedEvent, accepted, failed, targets };
  }

  getLastLoadSource() {
    return this.lastLoadSource;
  }
}

export const relayManager = new RelayPreferencesManager();

export function normalizeRelayUrlForDisplay(value) {
  return normalizeRelayUrl(value);
}
