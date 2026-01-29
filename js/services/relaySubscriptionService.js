import { devLogger, userLogger } from "../utils/logger.js";

function normalizeRelayList(relays) {
  if (!Array.isArray(relays)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  relays
    .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
    .filter(Boolean)
    .forEach((relay) => {
      if (!seen.has(relay)) {
        seen.add(relay);
        normalized.push(relay);
      }
    });

  normalized.sort();
  return normalized;
}

function normalizeFilterValue(value) {
  if (Array.isArray(value)) {
    const normalizedArray = value.map((entry) => normalizeFilterValue(entry));
    const isPrimitiveArray = normalizedArray.every(
      (entry) => typeof entry === "string" || typeof entry === "number",
    );
    if (isPrimitiveArray) {
      return normalizedArray
        .slice()
        .sort((a, b) => String(a).localeCompare(String(b)));
    }
    return normalizedArray;
  }

  if (value && typeof value === "object") {
    return normalizeFilter(value);
  }

  return value;
}

function normalizeFilter(filter) {
  if (!filter || typeof filter !== "object") {
    return {};
  }

  const entries = Object.entries(filter)
    .filter(([key]) => typeof key === "string")
    .sort(([a], [b]) => a.localeCompare(b));

  const normalized = {};
  entries.forEach(([key, value]) => {
    normalized[key] = normalizeFilterValue(value);
  });

  return normalized;
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters)) {
    return [];
  }

  return filters.map((filter) => normalizeFilter(filter));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildSignature({ relays, filters }) {
  return stableStringify({
    relays: normalizeRelayList(relays),
    filters: normalizeFilters(filters),
  });
}

class RelaySubscriptionService {
  constructor() {
    this.subscriptions = new Map();
  }

  ensureSubscription({
    key,
    pool,
    relays,
    filters,
    label = "subscription",
    onEvent,
    onEose,
    onClose,
  } = {}) {
    if (!key || typeof key !== "string") {
      return null;
    }

    if (!pool || typeof pool.sub !== "function") {
      devLogger.warn("[relaySubscriptions] Pool unavailable; skipping subscription", {
        key,
        label,
      });
      return null;
    }

    const signature = buildSignature({ relays, filters });
    const existing = this.subscriptions.get(key);

    if (existing && existing.signature === signature && existing.subscription) {
      devLogger.log("[relaySubscriptions] Reusing existing subscription", {
        key,
        label,
        relays: existing.relays,
      });
      return existing.subscription;
    }

    if (existing && existing.unsubscribe) {
      devLogger.warn("[relaySubscriptions] Replacing existing subscription", {
        key,
        label,
      });
      try {
        existing.unsubscribe();
      } catch (error) {
        userLogger.warn("[relaySubscriptions] Failed to unsubscribe existing subscription", error);
      }
    }

    const relayList = normalizeRelayList(relays);
    const filterList = normalizeFilters(filters);

    if (!relayList.length || !filterList.length) {
      devLogger.warn("[relaySubscriptions] Missing relays or filters; skipping subscription", {
        key,
        label,
        relays: relayList,
        filters: filterList,
      });
      return null;
    }

    let subscription;
    try {
      subscription = pool.sub(relayList, filterList);
    } catch (error) {
      userLogger.warn("[relaySubscriptions] Failed to create relay subscription", error);
      return null;
    }

    const unsubscribe = () => {
      try {
        if (typeof subscription?.unsub === "function") {
          subscription.unsub();
        }
      } catch (error) {
        userLogger.warn("[relaySubscriptions] Failed to unsubscribe relay subscription", error);
      }
    };

    if (subscription && typeof subscription.on === "function") {
      if (typeof onEvent === "function") {
        subscription.on("event", (event) => {
          try {
            onEvent(event);
          } catch (error) {
            userLogger.warn("[relaySubscriptions] Event handler threw", error);
          }
        });
      }
      if (typeof onEose === "function") {
        subscription.on("eose", () => {
          try {
            onEose();
          } catch (error) {
            userLogger.warn("[relaySubscriptions] EOSE handler threw", error);
          }
        });
      }
      if (typeof onClose === "function") {
        subscription.on("close", (reasons) => {
          try {
            onClose(reasons);
          } catch (error) {
            userLogger.warn("[relaySubscriptions] Close handler threw", error);
          }
        });
      }
    }

    this.subscriptions.set(key, {
      signature,
      subscription,
      unsubscribe,
      label,
      relays: relayList,
      filters: filterList,
    });

    devLogger.log("[relaySubscriptions] Subscription activated", {
      key,
      label,
      relays: relayList,
      filters: filterList,
    });

    return subscription;
  }

  stopSubscription(key, reason = "") {
    if (!key || typeof key !== "string") {
      return;
    }

    const existing = this.subscriptions.get(key);
    if (!existing) {
      return;
    }

    try {
      existing.unsubscribe?.();
    } finally {
      this.subscriptions.delete(key);
      devLogger.log("[relaySubscriptions] Subscription stopped", {
        key,
        label: existing.label,
        reason,
      });
    }
  }

  getSignature({ relays, filters }) {
    return buildSignature({ relays, filters });
  }
}

export const relaySubscriptionService = new RelaySubscriptionService();
