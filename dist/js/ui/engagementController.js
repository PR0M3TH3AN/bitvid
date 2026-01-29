import { devLogger } from "../utils/logger.js";

export default class EngagementController {
  constructor({ services = {}, ui = {}, state = {} } = {}) {
    this.services = {
      nostrClient: services.nostrClient,
    };
    this.ui = {
      showError: ui.showError || (() => {}),
      showSuccess: ui.showSuccess || (() => {}),
      showStatus: ui.showStatus || (() => {}),
    };
    this.state = {
      getCurrentVideo: state.getCurrentVideo || (() => null),
      getCurrentVideoPointer: state.getCurrentVideoPointer || (() => null),
    };
  }

  derivePointerFromDataset(dataset = {}, context = "") {
    const type =
      typeof dataset.pointerType === "string" ? dataset.pointerType.trim() : "";
    const value =
      typeof dataset.pointerValue === "string"
        ? dataset.pointerValue.trim()
        : "";
    const relay =
      typeof dataset.pointerRelay === "string"
        ? dataset.pointerRelay.trim()
        : "";

    if (type && value) {
      return relay ? [type, value, relay] : [type, value];
    }

    const currentVideoPointer = this.state.getCurrentVideoPointer();
    if (
      context === "modal" &&
      Array.isArray(currentVideoPointer) &&
      currentVideoPointer.length >= 2
    ) {
      return currentVideoPointer;
    }

    const currentVideo = this.state.getCurrentVideo();
    if (
      context === "modal" &&
      Array.isArray(currentVideo?.pointer) &&
      currentVideo.pointer.length >= 2
    ) {
      return currentVideo.pointer;
    }

    return null;
  }

  async handleRepostAction(dataset = {}) {
    const context = typeof dataset.context === "string" ? dataset.context : "";
    const explicitEventId =
      typeof dataset.eventId === "string" && dataset.eventId.trim()
        ? dataset.eventId.trim()
        : "";

    const currentVideo = this.state.getCurrentVideo();
    const fallbackEventId =
      context === "modal" && currentVideo?.id ? currentVideo.id : "";
    const targetEventId = explicitEventId || fallbackEventId;

    if (!targetEventId) {
      this.ui.showError("No event is available to repost.");
      return;
    }

    const pointer = this.derivePointerFromDataset(dataset, context);

    let author =
      typeof dataset.author === "string" ? dataset.author.trim() : "";
    if (!author && context === "modal" && currentVideo?.pubkey) {
      author = currentVideo.pubkey;
    }

    const rawKindValue = (() => {
      if (typeof dataset.kind === "string" && dataset.kind.trim()) {
        const parsed = Number.parseInt(dataset.kind.trim(), 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (Number.isFinite(dataset.kind)) {
        return Number(dataset.kind);
      }
      if (Number.isFinite(currentVideo?.kind)) {
        return Number(currentVideo.kind);
      }
      return null;
    })();

    const options = {
      pointer,
      pointerType: dataset.pointerType,
      pointerValue: dataset.pointerValue,
      pointerRelay: dataset.pointerRelay,
      authorPubkey: author,
    };

    if (Number.isFinite(rawKindValue)) {
      options.kind = Math.floor(rawKindValue);
    }

    try {
      const result = await this.services.nostrClient.repostEvent(
        targetEventId,
        options
      );

      if (!result?.ok) {
        const code = result?.error || "repost-failed";
        switch (code) {
          case "invalid-event-id":
            this.ui.showError("No event is available to repost.");
            break;
          case "missing-actor":
            this.ui.showError(
              "Cannot sign the repost right now. Please refresh and try again."
            );
            break;
          case "pool-unavailable":
            this.ui.showError(
              "Cannot reach relays right now. Please try again later."
            );
            break;
          case "publish-rejected":
            this.ui.showError("No relay accepted the repost attempt.");
            break;
          case "signing-failed":
            this.ui.showError("Failed to sign the repost. Please try again.");
            break;
          default:
            this.ui.showError(
              "Failed to repost the video. Please try again later."
            );
            break;
        }
        return;
      }

      const acceptedCount = Array.isArray(result.summary?.accepted)
        ? result.summary.accepted.length
        : 0;
      const relayCount =
        acceptedCount > 0
          ? acceptedCount
          : Array.isArray(result.relays)
          ? result.relays.length
          : acceptedCount;

      const fragments = [];
      if (relayCount > 0) {
        fragments.push(
          `Reposted to ${relayCount} relay${relayCount === 1 ? "" : "s"}.`
        );
      } else {
        fragments.push("Reposted.");
      }

      if (result.sessionActor) {
        fragments.push("Boost as session user.");
      }

      this.ui.showSuccess(fragments.join(" ").trim());
    } catch (error) {
      devLogger.warn("[EngagementController] Repost action failed:", error);
      this.ui.showError("Failed to repost the video. Please try again later.");
    }
  }

  async handleMirrorAction(dataset = {}) {
    const context = typeof dataset.context === "string" ? dataset.context : "";
    const explicitEventId =
      typeof dataset.eventId === "string" && dataset.eventId.trim()
        ? dataset.eventId.trim()
        : "";

    const currentVideo = this.state.getCurrentVideo();
    const fallbackEventId =
      context === "modal" && currentVideo?.id ? currentVideo.id : "";
    const targetEventId = explicitEventId || fallbackEventId;

    if (!targetEventId) {
      this.ui.showError("No event is available to mirror.");
      return;
    }

    const explicitUrl =
      typeof dataset.url === "string" && dataset.url.trim()
        ? dataset.url.trim()
        : "";
    const fallbackUrl =
      context === "modal" && typeof currentVideo?.url === "string"
        ? currentVideo.url.trim()
        : "";
    const targetUrl = explicitUrl || fallbackUrl;

    if (!targetUrl) {
      this.ui.showError("This video does not expose a hosted URL to mirror.");
      return;
    }

    const rawMagnet =
      typeof dataset.magnet === "string" && dataset.magnet.trim()
        ? dataset.magnet.trim()
        : "";
    const fallbackMagnet =
      context === "modal"
        ? currentVideo?.magnet || currentVideo?.originalMagnet || ""
        : "";
    const magnet = rawMagnet || fallbackMagnet;

    const thumbnail =
      typeof dataset.thumbnail === "string" && dataset.thumbnail.trim()
        ? dataset.thumbnail.trim()
        : context === "modal" && typeof currentVideo?.thumbnail === "string"
        ? currentVideo.thumbnail.trim()
        : "";

    const description =
      typeof dataset.description === "string" && dataset.description.trim()
        ? dataset.description.trim()
        : context === "modal" && typeof currentVideo?.description === "string"
        ? currentVideo.description.trim()
        : "";

    const title =
      typeof dataset.title === "string" && dataset.title.trim()
        ? dataset.title.trim()
        : context === "modal" && typeof currentVideo?.title === "string"
        ? currentVideo.title.trim()
        : "";

    const datasetPrivate =
      dataset.isPrivate === "true" || dataset.isPrivate === true ? true : false;
    const fallbackPrivate =
      context === "modal" && currentVideo?.isPrivate === true;
    const isPrivate = datasetPrivate || fallbackPrivate;

    if (isPrivate) {
      this.ui.showError("Mirroring is unavailable for private videos.");
      return;
    }

    const options = {
      url: targetUrl,
      magnet,
      thumbnail,
      description,
      title,
      isPrivate,
    };

    try {
      const result = await this.services.nostrClient.mirrorVideoEvent(
        targetEventId,
        options
      );

      if (!result?.ok) {
        const code = result?.error || "mirror-failed";
        switch (code) {
          case "invalid-event-id":
            this.ui.showError("No event is available to mirror.");
            break;
          case "missing-url":
            this.ui.showError(
              "This video does not expose a hosted URL to mirror."
            );
            break;
          case "missing-actor":
            this.ui.showError(
              "Cannot sign the mirror right now. Please refresh and try again."
            );
            break;
          case "pool-unavailable":
            this.ui.showError(
              "Cannot reach relays right now. Please try again later."
            );
            break;
          case "publish-rejected":
            this.ui.showError("No relay accepted the mirror attempt.");
            break;
          case "signing-failed":
            this.ui.showError("Failed to sign the mirror. Please try again.");
            break;
          default:
            this.ui.showError(
              "Failed to mirror the video. Please try again later."
            );
            break;
        }
        return;
      }

      const acceptedCount = Array.isArray(result.summary?.accepted)
        ? result.summary.accepted.length
        : 0;
      const relayCount =
        acceptedCount > 0
          ? acceptedCount
          : Array.isArray(result.relays)
          ? result.relays.length
          : acceptedCount;

      const fragments = [];
      if (relayCount > 0) {
        fragments.push(
          `Mirrored to ${relayCount} relay${relayCount === 1 ? "" : "s"}.`
        );
      } else {
        fragments.push("Mirrored.");
      }

      if (result.sessionActor) {
        fragments.push("Boost as session user.");
      }

      this.ui.showSuccess(fragments.join(" ").trim());
    } catch (error) {
      devLogger.warn("[EngagementController] Mirror action failed:", error);
      this.ui.showError("Failed to mirror the video. Please try again later.");
    }
  }

  async handleEnsurePresenceAction(dataset = {}) {
    const context = typeof dataset.context === "string" ? dataset.context : "";
    const explicitEventId =
      typeof dataset.eventId === "string" && dataset.eventId.trim()
        ? dataset.eventId.trim()
        : "";

    const currentVideo = this.state.getCurrentVideo();
    const fallbackEventId =
      context === "modal" && currentVideo?.id ? currentVideo.id : "";
    const targetEventId = explicitEventId || fallbackEventId;

    if (!targetEventId) {
      this.ui.showError("No event is available to rebroadcast.");
      return;
    }

    const explicitPubkey =
      typeof dataset.pubkey === "string" && dataset.pubkey.trim()
        ? dataset.pubkey.trim()
        : "";
    const datasetAuthor =
      typeof dataset.author === "string" && dataset.author.trim()
        ? dataset.author.trim()
        : "";
    const fallbackPubkey =
      context === "modal" && typeof currentVideo?.pubkey === "string"
        ? currentVideo.pubkey
        : datasetAuthor;
    const targetPubkey = explicitPubkey || fallbackPubkey || "";

    try {
      const result = await this.services.nostrClient.rebroadcastEvent(
        targetEventId,
        {
          pubkey: targetPubkey,
        }
      );

      if (result?.throttled) {
        const remainingMs = Math.max(
          0,
          Number(result?.cooldown?.remainingMs) || 0
        );
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        const message =
          remainingSeconds > 0
            ? `Rebroadcast is cooling down. Try again in ${remainingSeconds}s.`
            : "Rebroadcast is cooling down. Try again soon.";
        this.ui.showStatus(message);
        if (
          typeof window !== "undefined" &&
          typeof window.setTimeout === "function"
        ) {
          window.setTimeout(() => {
            this.ui.showStatus("");
          }, 5000);
        }
        return;
      }

      if (!result?.ok) {
        const code = result?.error || "rebroadcast-failed";
        switch (code) {
          case "event-not-found":
            this.ui.showError(
              "Original event payload is unavailable. Reload and try again."
            );
            break;
          case "publish-rejected":
            this.ui.showError("No relay accepted the rebroadcast attempt.");
            break;
          case "pool-unavailable":
            this.ui.showError(
              "Cannot reach relays right now. Please try again later."
            );
            break;
          default:
            this.ui.showError(
              "Failed to rebroadcast. Please try again later."
            );
            break;
        }
        return;
      }

      if (result?.alreadyPresent) {
        this.ui.showSuccess("Relays already have this revision.");
        return;
      }

      this.ui.showSuccess("Rebroadcast requested across relays.");
    } catch (error) {
      devLogger.warn("[EngagementController] Rebroadcast action failed:", error);
      this.ui.showError("Failed to rebroadcast. Please try again later.");
    }
  }
}
