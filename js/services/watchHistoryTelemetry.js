import { isDevMode } from "../config.js";
import { pointerArrayToKey } from "../utils/pointer.js";
import { devLogger, userLogger } from "../utils/logger.js";
import {
  ingestLocalViewEvent as defaultIngestLocalViewEvent,
} from "../viewCounter.js";

const DEFAULT_VIEW_THRESHOLD_SECONDS = 12;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeVideoMetadata(video) {
  if (!video || typeof video !== "object") {
    return null;
  }

  // Transport identifiers (URL, magnet, hashes) are intentionally omitted so
  // watch history storage never persists playback endpoints. Only surface the
  // minimal fields needed to render the saved entry.
  const createdAtCandidates = [
    video.rootCreatedAt,
    video.created_at,
    video.createdAt,
    video.publishedAt,
  ];

  let createdAt = null;
  for (const candidate of createdAtCandidates) {
    if (Number.isFinite(candidate)) {
      createdAt = Math.floor(candidate);
      break;
    }
  }

  return {
    id: typeof video.id === "string" ? video.id : "",
    title: typeof video.title === "string" ? video.title : "",
    thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
    pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
    created_at: createdAt,
  };
}

export default class WatchHistoryTelemetry {
  constructor({
    watchHistoryService = null,
    watchHistoryController = null,
    nostrClient = null,
    log,
    normalizeHexPubkey,
    getActiveUserPubkey,
    ingestLocalViewEvent = defaultIngestLocalViewEvent,
    onViewLogged,
    viewThresholdSeconds = DEFAULT_VIEW_THRESHOLD_SECONDS,
  } = {}) {
    this.watchHistoryService = watchHistoryService;
    this.watchHistoryController = watchHistoryController;
    this.nostrClient = nostrClient;
    this.log = typeof log === "function" ? log : () => {};
    this.normalizeHexPubkey =
      typeof normalizeHexPubkey === "function"
        ? normalizeHexPubkey
        : () => null;
    this.getActiveUserPubkey =
      typeof getActiveUserPubkey === "function" ? getActiveUserPubkey : () => null;
    this.ingestLocalViewEvent =
      typeof ingestLocalViewEvent === "function"
        ? ingestLocalViewEvent
        : defaultIngestLocalViewEvent;
    this.onViewLogged = typeof onViewLogged === "function" ? onViewLogged : null;
    this.viewThresholdSeconds = Number.isFinite(viewThresholdSeconds)
      ? Math.max(0, viewThresholdSeconds)
      : DEFAULT_VIEW_THRESHOLD_SECONDS;

    this.watchHistoryPreferenceUnsubscribe = null;
    this.playbackTelemetryState = null;
    this.loggedViewPointerKeys = new Set();
  }

  destroy() {
    this.resetPlaybackLoggingState();
    this._clearPreferenceSubscription();
  }

  async initPreferenceSync() {
    return null;
  }

  refreshPreferenceSettings() {
    return false;
  }

  isMetadataPreferenceEnabled() {
    return false;
  }

  persistMetadataForVideo(video, pointerInfo) {
    // Deprecated
  }

  dropMetadata(pointerKey) {
    // Deprecated
  }

  async handleRemoval(payload = {}) {
    if (!this.watchHistoryController) {
      const error = new Error("watch-history-disabled");
      error.handled = true;
      throw error;
    }

    return this.watchHistoryController.handleWatchHistoryRemoval(payload);
  }

  flush(reason = "session-end", context = "watch-history") {
    if (!this.watchHistoryController) {
      return Promise.resolve();
    }

    try {
      return this.watchHistoryController.flush(reason, context);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  cancelPlaybackLogging({
    reason = "session-end",
    context = "cancelPendingViewLogging",
  } = {}) {
    const state = this.playbackTelemetryState;
    if (!state) {
      return;
    }

    if (state.viewTimerId) {
      this._getTimerHost().clearTimeout(state.viewTimerId);
    }

    if (Array.isArray(state.handlers) && state.videoEl) {
      for (const { eventName, handler } of state.handlers) {
        try {
          state.videoEl.removeEventListener(eventName, handler);
        } catch (error) {
          devLogger.warn(
          `[watchHistoryTelemetry] Failed to detach ${eventName} listener:`,
          error,
          );
        }
      }
    }

    this.playbackTelemetryState = null;

    this.flush(reason, context).catch((error) => {
      const message = normalizeString(error?.message) || String(error ?? "unknown");
      this.log(
        `[watchHistoryTelemetry] Watch history flush failed: ${message}`,
      );
    });
  }

  resetPlaybackLoggingState() {
    this.cancelPlaybackLogging();
    if (this.loggedViewPointerKeys.size > 0) {
      this.loggedViewPointerKeys.clear();
    }
  }

  preparePlaybackLogging({
    videoElement,
    pointer,
    pointerKey: explicitPointerKey,
    video,
  } = {}) {
    this.cancelPlaybackLogging();

    if (!videoElement || typeof videoElement.addEventListener !== "function") {
      return;
    }

    const pointerKey = explicitPointerKey || pointerArrayToKey(pointer);
    if (!pointer || !pointerKey) {
      return;
    }

    const viewerIdentityKey = this.getActiveViewIdentityKey();
    const cooldownKey = this.buildViewCooldownKey(pointerKey, viewerIdentityKey);
    if (cooldownKey && this.loggedViewPointerKeys.has(cooldownKey)) {
      return;
    }

    const state = {
      videoEl: videoElement,
      pointer,
      pointerKey,
      viewerIdentityKey,
      handlers: [],
      viewTimerId: null,
      viewFired: false,
      videoMetadata: sanitizeVideoMetadata(video),
    };

    const clearTimer = (timerKey) => {
      const property = `${timerKey}TimerId`;
      if (state[property]) {
        this._getTimerHost().clearTimeout(state[property]);
        state[property] = null;
      }
    };

    const finalizeView = () => {
      if (state.viewFired) {
        return;
      }
      state.viewFired = true;
      clearTimer("view");
      this.cancelPlaybackLogging();

      const { pointer: thresholdPointer, pointerKey: thresholdPointerKey } =
        state;

      (async () => {
        let viewResult;
        try {
          const canUseWatchHistoryService =
            typeof this.watchHistoryService?.publishView === "function";

          if (canUseWatchHistoryService) {
            viewResult = await this.watchHistoryService.publishView(
              thresholdPointer,
              undefined,
            );
          } else if (typeof this.nostrClient?.recordVideoView === "function") {
            viewResult = await this.nostrClient.recordVideoView(
              thresholdPointer,
            );
          } else {
            viewResult = { ok: false, error: "view-logging-unavailable" };
          }
        } catch (error) {
          devLogger.warn(
            "[watchHistoryTelemetry] Exception while recording video view:",
            error,
          );
        }

        const viewOk = !!viewResult?.ok;
        if (viewOk) {
          const eventIdentityKey =
            this.deriveViewIdentityKeyFromEvent(viewResult?.event) ||
            state.viewerIdentityKey ||
            this.getActiveViewIdentityKey();
          const keyToPersist = this.buildViewCooldownKey(
            thresholdPointerKey,
            eventIdentityKey,
          );
          if (keyToPersist) {
            this.loggedViewPointerKeys.add(keyToPersist);
          }
          if (viewResult?.event && this.ingestLocalViewEvent) {
            try {
              this.ingestLocalViewEvent({
                event: viewResult.event,
                pointer: thresholdPointer,
              });
            } catch (error) {
              devLogger.warn(
                "[watchHistoryTelemetry] Failed to ingest local view event:",
                error,
              );
            }
          }
          if (this.onViewLogged) {
            try {
              this.onViewLogged({
                pointer: thresholdPointer,
                pointerKey: thresholdPointerKey,
                video: state.videoMetadata,
                event: viewResult?.event || null,
                result: viewResult || null,
              });
            } catch (error) {
              devLogger.warn(
                "[watchHistoryTelemetry] onViewLogged handler failed:",
                error,
              );
            }
          }
        } else if (isDevMode && viewResult) {
          userLogger.warn(
            "[watchHistoryTelemetry] View event rejected by relays:",
            viewResult,
          );
        }
      })().catch((error) => {
        devLogger.warn(
          "[watchHistoryTelemetry] Unexpected error while recording video view:",
          error,
        );
      });
    };

    const scheduleTimer = (timerKey, thresholdSeconds, callback) => {
      const firedKey = `${timerKey}Fired`;
      const idKey = `${timerKey}TimerId`;
      if (state[firedKey] || state[idKey]) {
        return;
      }
      const currentSeconds = Number.isFinite(videoElement.currentTime)
        ? videoElement.currentTime
        : 0;
      const remainingMs = Math.max(
        0,
        Math.ceil((thresholdSeconds - currentSeconds) * 1000),
      );
      if (remainingMs <= 0) {
        callback();
        return;
      }
      state[idKey] = this._getTimerHost().setTimeout(callback, remainingMs);
    };

    const registerHandler = (eventName, handler) => {
      videoElement.addEventListener(eventName, handler);
      state.handlers.push({ eventName, handler });
    };

    registerHandler("timeupdate", () => {
      if (!state.viewFired && videoElement.currentTime >= this.viewThresholdSeconds) {
        finalizeView();
      }
    });

    const cancelOnPause = () => {
      if (!state.viewFired) {
        clearTimer("view");
      }
    };

    ["pause", "waiting", "stalled", "ended", "emptied"].forEach((event) =>
      registerHandler(event, cancelOnPause),
    );

    const resumeIfNeeded = () => {
      if (state.viewFired) {
        return;
      }
      scheduleTimer("view", this.viewThresholdSeconds, finalizeView);
    };

    ["play", "playing"].forEach((event) =>
      registerHandler(event, resumeIfNeeded),
    );

    this.playbackTelemetryState = state;

    if (!videoElement.paused && videoElement.currentTime > 0) {
      resumeIfNeeded();
    }
  }

  getActiveViewIdentityKey() {
    const normalizedUser = this.normalizeHexPubkey(this.getActiveUserPubkey());
    if (normalizedUser) {
      return `actor:${normalizedUser}`;
    }

    const sessionActorPubkey = this.normalizeHexPubkey(
      this.nostrClient?.sessionActor?.pubkey,
    );
    if (sessionActorPubkey) {
      return `actor:${sessionActorPubkey}`;
    }

    return "actor:anonymous";
  }

  deriveViewIdentityKeyFromEvent(event) {
    if (!event || typeof event !== "object") {
      return "";
    }

    const normalizedPubkey = this.normalizeHexPubkey(event.pubkey);
    if (!normalizedPubkey) {
      return "";
    }

    return `actor:${normalizedPubkey}`;
  }

  buildViewCooldownKey(pointerKey, identityKey) {
    const normalizedPointerKey = normalizeString(pointerKey);
    if (!normalizedPointerKey) {
      return "";
    }

    const normalizedIdentity = normalizeString(identityKey).toLowerCase();

    return normalizedIdentity
      ? `${normalizedPointerKey}::${normalizedIdentity}`
      : normalizedPointerKey;
  }

  _clearPreferenceSubscription() {
    if (typeof this.watchHistoryPreferenceUnsubscribe === "function") {
      try {
        this.watchHistoryPreferenceUnsubscribe();
      } catch (error) {
        userLogger.warn(
          "[watchHistoryTelemetry] Failed to unsubscribe watch history preference:",
          error,
        );
      }
    }
    this.watchHistoryPreferenceUnsubscribe = null;
  }

  _getTimerHost() {
    if (typeof window !== "undefined" && window) {
      return window;
    }
    return globalThis;
  }
}
