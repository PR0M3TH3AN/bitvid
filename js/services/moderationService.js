import { nostrClient } from "../nostr.js";
import { publishEventToRelays, assertAnyRelayAccepted } from "../nostrPublish.js";
import logger from "../utils/logger.js";

class SimpleEventEmitter {
  constructor(logHandler = null) {
    this.listeners = new Map();
    this.logHandler = typeof logHandler === "function" ? logHandler : null;
  }

  on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return () => {};
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        if (this.logHandler) {
          try {
            this.logHandler(`moderationService listener for "${eventName}" threw`, error);
          } catch (logError) {
            logger.user.warn("[moderationService] listener logger threw", logError);
          }
        }
      }
    }
  }
}

function normalizeLogger(candidate) {
  if (typeof candidate === "function") {
    return candidate;
  }
  if (candidate && typeof candidate.log === "function") {
    return (...args) => candidate.log(...args);
  }
  if (
    candidate &&
    typeof candidate.dev === "object" &&
    typeof candidate.dev.log === "function"
  ) {
    return (...args) => candidate.dev.log(...args);
  }
  return () => {};
}

function normalizeHex(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed && /^[0-9a-f]{40,64}$/i.test(trimmed) ? trimmed : "";
}

function normalizeEventId(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed && /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed : "";
}

function normalizeReportType(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : "";
}

function cloneSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return { eventId: "", totalTrusted: 0, types: {}, updatedAt: 0 };
  }
  const types = summary.types && typeof summary.types === "object" ? summary.types : {};
  const clonedTypes = {};
  for (const [key, value] of Object.entries(types)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    clonedTypes[key] = {
      trusted: Number.isFinite(value.trusted) ? value.trusted : 0,
      total: Number.isFinite(value.total) ? value.total : 0,
      latest: Number.isFinite(value.latest) ? value.latest : 0,
    };
  }
  return {
    eventId: typeof summary.eventId === "string" ? summary.eventId : "",
    totalTrusted: Number.isFinite(summary.totalTrusted) ? summary.totalTrusted : 0,
    types: clonedTypes,
    updatedAt: Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0,
  };
}

function resolveRelayList(client, { write = false } = {}) {
  if (!client) {
    return [];
  }
  const source = write ? client.writeRelays : client.relays;
  const fallback = client.relays;
  const raw = Array.isArray(source) && source.length ? source : fallback;
  if (!Array.isArray(raw)) {
    return [];
  }
  const urls = [];
  const seen = new Set();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    urls.push(trimmed);
  }
  return urls;
}

function findReportedEventId(event) {
  if (!event || !Array.isArray(event.tags)) {
    return "";
  }
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    if (tag[0] !== "e") {
      continue;
    }
    const candidate = normalizeEventId(tag[1]);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function extractReportType(event, targetEventId = "") {
  if (!event || !Array.isArray(event.tags)) {
    return "";
  }

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const [marker, value] = tag;
    if (marker === "report" || marker === "type") {
      const normalized = normalizeReportType(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  if (targetEventId) {
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag[0] !== "e") {
        continue;
      }
      if (normalizeEventId(tag[1]) !== targetEventId) {
        continue;
      }
      const typeCandidate = normalizeReportType(tag[2] || "");
      if (typeCandidate) {
        return typeCandidate;
      }
    }
  }

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag[0] !== "t") {
      continue;
    }
    const normalized = normalizeReportType(tag[1] || "");
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function ensureNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class ModerationService {
  constructor({ nostrClient: client = null, logger: log = null } = {}) {
    this.nostrClient = client;
    this.log = normalizeLogger(log);

    this.viewerPubkey = "";
    this.trustedContacts = new Set();

    this.contactSubscription = null;
    this.contactListPromise = null;

    this.reportEvents = new Map();
    this.reportSummaries = new Map();
    this.activeSubscriptions = new Map();
    this.activeEventIds = new Set();

    this.emitter = new SimpleEventEmitter((message, error) => {
      try {
        this.log(message, error);
      } catch (logError) {
        logger.user.warn("[moderationService] logger threw", logError);
      }
    });
  }

  setLogger(newLogger) {
    this.log = normalizeLogger(newLogger);
  }

  setNostrClient(client) {
    if (client && client !== this.nostrClient) {
      this.nostrClient = client;
    }
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  emit(eventName, detail) {
    this.emitter.emit(eventName, detail);
  }

  async ensurePool() {
    if (!this.nostrClient || typeof this.nostrClient.ensurePool !== "function") {
      throw new Error("nostr-client-unavailable");
    }
    return this.nostrClient.ensurePool();
  }

  async refreshViewerFromClient() {
    const clientPubkey = normalizeHex(this.nostrClient?.pubkey);
    if (clientPubkey === this.viewerPubkey) {
      if (this.contactListPromise) {
        try {
          await this.contactListPromise;
        } catch (error) {
          this.log("[moderationService] contact hydration failed", error);
        }
      }
      return this.viewerPubkey;
    }
    return this.setViewerPubkey(clientPubkey);
  }

  async setViewerPubkey(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (normalized === this.viewerPubkey && this.contactListPromise) {
      try {
        await this.contactListPromise;
      } catch (error) {
        this.log("[moderationService] contact hydration failed", error);
      }
      return this.viewerPubkey;
    }

    this.viewerPubkey = normalized;
    this.trustedContacts.clear();
    this.recomputeAllSummaries();

    if (this.contactSubscription && typeof this.contactSubscription.unsub === "function") {
      try {
        this.contactSubscription.unsub();
      } catch (error) {
        this.log("[moderationService] failed to teardown contact subscription", error);
      }
    }
    this.contactSubscription = null;

    if (!normalized) {
      return this.viewerPubkey;
    }

    this.contactListPromise = this.fetchTrustedContacts(normalized)
      .catch((error) => {
        this.log("[moderationService] failed to load contact list", error);
        return null;
      })
      .finally(() => {
        this.contactListPromise = null;
      });

    try {
      await this.contactListPromise;
    } catch (error) {
      this.log("[moderationService] contact promise rejected", error);
    }

    this.subscribeToContactList(normalized).catch((error) => {
      this.log("[moderationService] failed to subscribe to contact list", error);
    });

    return this.viewerPubkey;
  }

  async fetchTrustedContacts(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      this.trustedContacts.clear();
      this.emit("contacts", { size: 0 });
      return;
    }

    try {
      await this.ensurePool();
    } catch (error) {
      this.log("[moderationService] ensurePool failed while fetching contacts", error);
      return;
    }

    const relays = resolveRelayList(this.nostrClient);
    if (!relays.length) {
      this.trustedContacts.clear();
      this.emit("contacts", { size: 0 });
      return;
    }

    const filter = { kinds: [3], authors: [normalized], limit: 1 };

    let events = [];
    try {
      events = await this.nostrClient.pool.list(relays, [filter]);
    } catch (error) {
      this.log("[moderationService] failed to list contact events", error);
      events = [];
    }

    if (!Array.isArray(events) || !events.length) {
      this.trustedContacts.clear();
      this.emit("contacts", { size: 0 });
      this.recomputeAllSummaries();
      return;
    }

    let latest = events[0];
    for (const event of events) {
      if (!event || typeof event.created_at !== "number") {
        continue;
      }
      if (!latest || ensureNumber(event.created_at) > ensureNumber(latest.created_at)) {
        latest = event;
      }
    }

    this.applyContactEvent(latest);
  }

  applyContactEvent(event) {
    if (!event || !Array.isArray(event.tags)) {
      this.trustedContacts.clear();
      this.emit("contacts", { size: 0 });
      this.recomputeAllSummaries();
      return;
    }

    const nextSet = new Set();
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag[0] !== "p") {
        continue;
      }
      const candidate = normalizeHex(tag[1]);
      if (candidate) {
        nextSet.add(candidate);
      }
    }

    this.trustedContacts = nextSet;
    this.emit("contacts", { size: nextSet.size });
    this.recomputeAllSummaries();
  }

  async subscribeToContactList(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return;
    }

    try {
      await this.ensurePool();
    } catch (error) {
      this.log("[moderationService] ensurePool failed while subscribing to contacts", error);
      return;
    }

    const relays = resolveRelayList(this.nostrClient);
    if (!relays.length) {
      return;
    }

    const filter = { kinds: [3], authors: [normalized], limit: 1 };

    try {
      const sub = this.nostrClient.pool.sub(relays, [filter]);
      sub.on("event", (event) => {
        this.applyContactEvent(event);
      });
      sub.on("eose", () => {});
      this.contactSubscription = {
        unsub: typeof sub.unsub === "function" ? () => sub.unsub() : null,
      };
    } catch (error) {
      this.log("[moderationService] failed to create contact subscription", error);
    }
  }

  async setActiveEventIds(ids = []) {
    const nextIds = new Set();
    if (Array.isArray(ids) || ids instanceof Set) {
      for (const value of ids) {
        const normalized = normalizeEventId(value);
        if (normalized) {
          nextIds.add(normalized);
        }
      }
    }

    for (const existing of Array.from(this.activeSubscriptions.keys())) {
      if (!nextIds.has(existing)) {
        this.teardownReportSubscription(existing);
      }
    }

    const tasks = [];
    for (const id of nextIds) {
      if (this.activeSubscriptions.has(id)) {
        const entry = this.activeSubscriptions.get(id);
        if (entry?.promise) {
          tasks.push(entry.promise.catch(() => {}));
        }
        continue;
      }
      const promise = this.subscribeToReports(id);
      tasks.push(promise.catch((error) => {
        this.log(`(moderationService) failed to subscribe to reports for ${id}`, error);
      }));
    }

    this.activeEventIds = nextIds;

    if (tasks.length) {
      await Promise.all(tasks);
    }
  }

  teardownReportSubscription(eventId) {
    const normalized = normalizeEventId(eventId);
    const entry = this.activeSubscriptions.get(normalized);
    if (!entry) {
      return;
    }
    if (typeof entry.unsub === "function") {
      try {
        entry.unsub();
      } catch (error) {
        this.log("[moderationService] failed to unsubscribe from report stream", error);
      }
    }
    this.activeSubscriptions.delete(normalized);
  }

  async subscribeToReports(eventId) {
    const normalized = normalizeEventId(eventId);
    if (!normalized) {
      return;
    }

    const record = { unsub: null, promise: null };
    this.activeSubscriptions.set(normalized, record);

    record.promise = (async () => {
      await this.ensurePool();
      const relays = resolveRelayList(this.nostrClient);
      if (!relays.length) {
        return;
      }

      const filter = { kinds: [1984], "#e": [normalized], limit: 500 };

      let events = [];
      try {
        events = await this.nostrClient.pool.list(relays, [filter]);
      } catch (error) {
        this.log(`(moderationService) failed to backfill reports for ${normalized}`, error);
        events = [];
      }

      if (Array.isArray(events)) {
        for (const event of events) {
          this.ingestReportEvent(event);
        }
      }

      try {
        const sub = this.nostrClient.pool.sub(relays, [filter]);
        sub.on("event", (event) => {
          this.ingestReportEvent(event);
        });
        sub.on("eose", () => {});
        record.unsub = typeof sub.unsub === "function" ? () => sub.unsub() : null;
      } catch (error) {
        this.log(`(moderationService) failed to subscribe to reports for ${normalized}`, error);
      }
    })();

    try {
      await record.promise;
    } catch (error) {
      this.log("[moderationService] report subscription promise rejected", error);
    } finally {
      record.promise = null;
    }
  }

  ingestReportEvent(event) {
    if (!event || event.kind !== 1984) {
      return;
    }

    const reporter = normalizeHex(event.pubkey);
    if (!reporter) {
      return;
    }

    const targetEventId = findReportedEventId(event);
    const normalizedEventId = normalizeEventId(targetEventId);
    if (!normalizedEventId) {
      return;
    }

    const reportType = extractReportType(event, normalizedEventId);
    if (!reportType) {
      return;
    }

    let eventReports = this.reportEvents.get(normalizedEventId);
    if (!eventReports) {
      eventReports = new Map();
      this.reportEvents.set(normalizedEventId, eventReports);
    }

    let reporterEntry = eventReports.get(reporter);
    if (!reporterEntry) {
      reporterEntry = new Map();
      eventReports.set(reporter, reporterEntry);
    }

    const existing = reporterEntry.get(reportType);
    const createdAt = ensureNumber(event.created_at);

    if (!existing || createdAt >= ensureNumber(existing.created_at)) {
      reporterEntry.set(reportType, {
        created_at: createdAt,
        id: typeof event.id === "string" ? event.id : "",
      });
    }

    this.recomputeSummaryForEvent(normalizedEventId);
  }

  recomputeAllSummaries() {
    for (const eventId of this.reportEvents.keys()) {
      this.recomputeSummaryForEvent(eventId);
    }
  }

  recomputeSummaryForEvent(eventId) {
    const normalized = normalizeEventId(eventId);
    if (!normalized) {
      return;
    }

    const eventReports = this.reportEvents.get(normalized);
    if (!eventReports || !eventReports.size) {
      this.reportSummaries.delete(normalized);
      this.emit("summary", { eventId: normalized, summary: null });
      return;
    }

    const typeStats = new Map();
    let totalTrusted = 0;

    for (const [reporter, typeMap] of eventReports.entries()) {
      const isTrusted = this.trustedContacts.has(reporter);
      for (const [type, detail] of typeMap.entries()) {
        let stats = typeStats.get(type);
        if (!stats) {
          stats = { trusted: 0, total: 0, latest: 0 };
          typeStats.set(type, stats);
        }
        stats.total += 1;
        const createdAt = ensureNumber(detail?.created_at);
        if (createdAt > stats.latest) {
          stats.latest = createdAt;
        }
        if (isTrusted) {
          stats.trusted += 1;
          totalTrusted += 1;
        }
      }
    }

    const types = {};
    for (const [type, stats] of typeStats.entries()) {
      types[type] = {
        trusted: stats.trusted,
        total: stats.total,
        latest: stats.latest,
      };
    }

    const summary = {
      eventId: normalized,
      totalTrusted,
      types,
      updatedAt: Date.now(),
    };

    this.reportSummaries.set(normalized, summary);
    this.emit("summary", { eventId: normalized, summary: cloneSummary(summary) });
  }

  getTrustedReportSummary(eventId) {
    const normalized = normalizeEventId(eventId);
    if (!normalized) {
      return { eventId: "", totalTrusted: 0, types: {}, updatedAt: 0 };
    }
    const summary = this.reportSummaries.get(normalized);
    if (!summary) {
      return { eventId: normalized, totalTrusted: 0, types: {}, updatedAt: 0 };
    }
    return cloneSummary(summary);
  }

  getTrustedReporters(eventId, type) {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return [];
    }

    const eventReports = this.reportEvents.get(normalizedEventId);
    if (!eventReports || !eventReports.size) {
      return [];
    }

    const normalizedType = normalizeReportType(type);
    const results = [];

    for (const [reporter, typeMap] of eventReports.entries()) {
      if (!this.trustedContacts.has(reporter)) {
        continue;
      }

      if (normalizedType) {
        const detail = typeMap.get(normalizedType);
        if (!detail) {
          continue;
        }
        results.push({
          pubkey: reporter,
          latest: ensureNumber(detail?.created_at),
        });
        continue;
      }

      let latest = 0;
      for (const entry of typeMap.values()) {
        const candidate = ensureNumber(entry?.created_at);
        if (candidate > latest) {
          latest = candidate;
        }
      }
      results.push({ pubkey: reporter, latest });
    }

    if (!results.length) {
      return [];
    }

    results.sort((a, b) => ensureNumber(b.latest) - ensureNumber(a.latest));
    return results.map((entry) => ({
      pubkey: entry.pubkey,
      latest: ensureNumber(entry.latest),
    }));
  }

  trustedReportCount(eventId, type) {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      return 0;
    }
    const summary = this.reportSummaries.get(normalizedEventId);
    if (!summary) {
      return 0;
    }
    const normalizedType = normalizeReportType(type);
    const entry = normalizedType ? summary.types[normalizedType] : null;
    if (!entry) {
      return 0;
    }
    return Number.isFinite(entry.trusted) ? entry.trusted : 0;
  }

  async submitReport({ eventId, type, targetPubkey = "", content = "" } = {}) {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      const error = new Error("invalid-event-id");
      error.code = "invalid-event-id";
      throw error;
    }

    const normalizedType = normalizeReportType(type);
    if (!normalizedType) {
      const error = new Error("invalid-type");
      error.code = "invalid-type";
      throw error;
    }

    const reporterPubkey = normalizeHex(this.nostrClient?.pubkey);
    if (!reporterPubkey) {
      const error = new Error("viewer-not-logged-in");
      error.code = "viewer-not-logged-in";
      throw error;
    }

    const extension = typeof window !== "undefined" ? window.nostr : null;
    if (!extension) {
      const error = new Error("nostr-extension-missing");
      error.code = "nostr-extension-missing";
      throw error;
    }

    if (typeof this.nostrClient?.ensureExtensionPermissions === "function") {
      const permissionResult = await this.nostrClient.ensureExtensionPermissions([
        "sign_event",
        "get_public_key",
      ]);
      if (!permissionResult?.ok) {
        const error = new Error("extension-permission-denied");
        error.code = "extension-permission-denied";
        error.details = permissionResult?.error || null;
        throw error;
      }
    }

    const tags = [
      ["e", normalizedEventId, "", normalizedType],
      ["report", normalizedType],
      ["t", normalizedType],
    ];

    const normalizedTarget = normalizeHex(targetPubkey);
    if (normalizedTarget) {
      tags.push(["p", normalizedTarget]);
    }

    const event = {
      kind: 1984,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: typeof content === "string" ? content : "",
      pubkey: reporterPubkey,
    };

    let signedEvent;
    try {
      signedEvent = await extension.signEvent(event);
    } catch (error) {
      const wrapped = new Error("signature-failed");
      wrapped.code = "signature-failed";
      wrapped.details = error;
      throw wrapped;
    }

    await this.ensurePool();
    const relays = resolveRelayList(this.nostrClient, { write: true });
    if (!relays.length) {
      const error = new Error("no-relays-configured");
      error.code = "no-relays-configured";
      throw error;
    }

    let results = [];
    try {
      results = await publishEventToRelays(this.nostrClient.pool, relays, signedEvent);
      assertAnyRelayAccepted(results, { context: "report" });
    } catch (error) {
      const wrapped = new Error("report-publish-failed");
      wrapped.code = "report-publish-failed";
      wrapped.details = error;
      throw wrapped;
    }

    this.ingestReportEvent(signedEvent);
    return { ok: true, event: signedEvent, results };
  }
}

const moderationService = new ModerationService({
  nostrClient,
  logger,
});

export default moderationService;
