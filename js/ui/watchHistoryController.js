import { isDevMode } from "../config.js";
import {
  normalizePointerInput,
  pointerKey as derivePointerKey,
} from "../nostr.js";

const noop = () => {};

function resolveCardElement(trigger) {
  if (!(trigger instanceof HTMLElement)) {
    return null;
  }
  const candidate = trigger.closest(".video-card");
  return candidate instanceof HTMLElement ? candidate : null;
}

function safeInvoke(callback, payload) {
  if (typeof callback !== "function") {
    return;
  }
  try {
    callback(payload);
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryController] onStateChange handler failed:",
        error,
      );
    }
  }
}

export default class WatchHistoryController {
  constructor({
    watchHistoryService,
    nostrClient,
    showError,
    showSuccess,
    dropWatchHistoryMetadata,
    getActivePubkey,
  } = {}) {
    this.watchHistoryService = watchHistoryService || null;
    this.nostrClient = nostrClient || null;
    this.showError = typeof showError === "function" ? showError : noop;
    this.showSuccess = typeof showSuccess === "function" ? showSuccess : noop;
    this.dropWatchHistoryMetadata =
      typeof dropWatchHistoryMetadata === "function"
        ? dropWatchHistoryMetadata
        : noop;
    this.getActivePubkey =
      typeof getActivePubkey === "function" ? getActivePubkey : () => "";
  }

  buildPointerFromDataset(dataset = {}) {
    if (!dataset || typeof dataset !== "object") {
      return null;
    }

    const typeValue =
      typeof dataset.pointerType === "string" ? dataset.pointerType : "";
    const normalizedType = typeValue === "a" ? "a" : typeValue === "e" ? "e" : "";
    const value =
      typeof dataset.pointerValue === "string" && dataset.pointerValue.trim()
        ? dataset.pointerValue.trim()
        : "";

    if (!normalizedType || !value) {
      return null;
    }

    const pointer = { type: normalizedType, value };

    if (typeof dataset.pointerRelay === "string" && dataset.pointerRelay.trim()) {
      pointer.relay = dataset.pointerRelay.trim();
    }

    if (typeof dataset.pointerWatchedAt === "string" && dataset.pointerWatchedAt) {
      const parsed = Number.parseInt(dataset.pointerWatchedAt, 10);
      if (Number.isFinite(parsed)) {
        pointer.watchedAt = parsed;
      }
    }

    if (dataset.pointerSession === "true") {
      pointer.session = true;
    }

    return pointer;
  }

  resolvePointerKey(pointer, explicitKey) {
    if (typeof explicitKey === "string" && explicitKey.trim()) {
      return explicitKey.trim();
    }

    const normalized = normalizePointerInput(pointer);
    if (!normalized) {
      return "";
    }

    try {
      return derivePointerKey(normalized) || "";
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryController] Failed to derive pointer key:",
          error,
        );
      }
      return "";
    }
  }

  applyCardState(card, { status, removeCard } = {}) {
    if (!(card instanceof HTMLElement)) {
      return;
    }

    if (status === "pending") {
      card.dataset.historyRemovalPending = "true";
      card.classList.add("opacity-60");
      card.classList.add("pointer-events-none");
      return;
    }

    delete card.dataset.historyRemovalPending;
    card.classList.remove("opacity-60", "pointer-events-none");

    if (status === "removed" && removeCard) {
      card.remove();
    }
  }

  resolveActor(actor) {
    if (typeof actor === "string" && actor.trim()) {
      return actor.trim();
    }

    const candidate = this.getActivePubkey();
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    const sessionPubkey = this.nostrClient?.sessionActor?.pubkey;
    if (typeof sessionPubkey === "string" && sessionPubkey.trim()) {
      return sessionPubkey.trim();
    }

    return "";
  }

  async removeEntry(options = {}) {
    if (!this.watchHistoryService?.isEnabled?.()) {
      this.showError("Watch history sync is not available right now.");
      const error = new Error("watch-history-disabled");
      error.handled = true;
      throw error;
    }

    const {
      dataset = {},
      pointer: pointerInput = null,
      pointerKey: explicitPointerKey = "",
      reason: providedReason,
      trigger = null,
      removeCard = false,
      actor,
      items,
      onStateChange,
    } = options;

    const pointer = pointerInput || this.buildPointerFromDataset(dataset);
    const pointerKey = this.resolvePointerKey(pointer, explicitPointerKey || dataset.pointerKey);

    if (!pointerKey) {
      this.showError("Unable to determine which history entry to remove.");
      return null;
    }

    const reason =
      typeof providedReason === "string" && providedReason.trim()
        ? providedReason.trim()
        : typeof dataset.reason === "string" && dataset.reason.trim()
        ? dataset.reason.trim()
        : "remove-item";

    const card = resolveCardElement(trigger);
    this.applyCardState(card, { status: "pending" });
    safeInvoke(onStateChange, { status: "pending", card, removeCard });

    try {
      const result = await this.handleWatchHistoryRemoval({
        actor,
        items,
        reason,
        removed: {
          pointer,
          pointerKey,
        },
      });

      this.applyCardState(card, { status: removeCard ? "removed" : "idle", removeCard });
      safeInvoke(onStateChange, {
        status: removeCard ? "removed" : "idle",
        card,
        removeCard,
        result,
      });

      return result;
    } catch (error) {
      this.applyCardState(card, { status: "idle" });
      safeInvoke(onStateChange, { status: "error", card, error, removeCard });

      if (!error?.handled) {
        this.showError("Failed to remove from history. Please try again.");
      }

      throw error;
    }
  }

  async handleWatchHistoryRemoval(payload = {}) {
    if (!this.watchHistoryService?.isEnabled?.()) {
      const error = new Error("watch-history-disabled");
      error.handled = true;
      this.showError("Watch history sync is not available right now.");
      throw error;
    }

    const reason =
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : "remove-item";

    const actorCandidate = this.resolveActor(payload.actor);

    const removedPointerRaw =
      payload?.removed?.pointer || payload?.removed?.raw || payload?.removed || null;
    const removedPointerNormalized = normalizePointerInput(removedPointerRaw);
    let removedPointerKey =
      typeof payload?.removed?.pointerKey === "string"
        ? payload.removed.pointerKey
        : "";
    if (!removedPointerKey && removedPointerNormalized) {
      removedPointerKey = derivePointerKey(removedPointerNormalized) || "";
    }

    if (removedPointerKey) {
      this.dropWatchHistoryMetadata(removedPointerKey);
    }

    const normalizeEntry = (entry) => {
      if (!entry) {
        return null;
      }
      const pointer = normalizePointerInput(entry.pointer || entry);
      if (!pointer) {
        return null;
      }
      if (Number.isFinite(entry.watchedAt)) {
        pointer.watchedAt = Math.floor(entry.watchedAt);
      } else if (Number.isFinite(entry.pointer?.watchedAt)) {
        pointer.watchedAt = Math.floor(entry.pointer.watchedAt);
      }
      if (entry.pointer?.session === true || entry.session === true) {
        pointer.session = true;
      }
      return pointer;
    };

    let normalizedItems = null;

    if (Array.isArray(payload.items) && payload.items.length) {
      normalizedItems = payload.items.map(normalizeEntry).filter(Boolean);
    }

    if (!normalizedItems) {
      try {
        const latest = await this.watchHistoryService.loadLatest(
          actorCandidate,
          { allowStale: false },
        );
        normalizedItems = Array.isArray(latest)
          ? latest.map(normalizeEntry).filter(Boolean)
          : [];
      } catch (error) {
        this.showError("Failed to load watch history. Please try again.");
        if (error && typeof error === "object") {
          error.handled = true;
        }
        throw error;
      }
    }

    if (removedPointerKey) {
      normalizedItems = normalizedItems.filter((entry) => {
        try {
          return derivePointerKey(entry) !== removedPointerKey;
        } catch (error) {
          return true;
        }
      });
    }

    this.showSuccess("Removing from history…");

    try {
      const snapshotResult = await this.watchHistoryService.snapshot(normalizedItems, {
        actor: actorCandidate || undefined,
        reason,
      });

      try {
        await this.nostrClient?.updateWatchHistoryList?.(normalizedItems, {
          actorPubkey: actorCandidate || undefined,
          replace: true,
          source: reason,
        });
      } catch (updateError) {
        if (isDevMode) {
          console.warn(
            "[watchHistoryController] Failed to update local watch history list:",
            updateError,
          );
        }
      }

      this.showSuccess(
        "Removed from encrypted history. Relay sync may take a moment.",
      );

      return { handledToasts: true, snapshot: snapshotResult };
    } catch (error) {
      let message = "Failed to remove from history. Please try again.";
      if (error?.result?.retryable) {
        message =
          "Removal will retry once encrypted history is accepted by your relays.";
      }
      this.showError(message);
      if (error && typeof error === "object") {
        error.handled = true;
      }
      throw error;
    }
  }

  flush(reason = "session-end", context = "watch-history") {
    if (!this.watchHistoryService?.isEnabled?.()) {
      return Promise.resolve();
    }
    try {
      const result = this.watchHistoryService.snapshot(undefined, { reason });
      return Promise.resolve(result).catch((error) => {
        if (isDevMode) {
          console.warn(`[${context}] Watch history flush failed:`, error);
        }
        throw error;
      });
    } catch (error) {
      if (isDevMode) {
        console.warn(`[${context}] Failed to queue watch history flush:`, error);
      }
      return Promise.reject(error);
    }
  }
}
