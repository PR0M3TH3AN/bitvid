import { sanitizeRelayList as defaultSanitizeRelayList } from "../nostr/nip46Client.js";
import { buildShareEvent as defaultBuildShareEvent } from "../nostrEventSchemas.js";
import {
  publishEventToRelays as defaultPublishEventToRelays,
  assertAnyRelayAccepted as defaultAssertAnyRelayAccepted,
} from "../nostrPublish.js";
import {
  getActiveSigner as defaultGetActiveSigner,
} from "../nostrClientRegistry.js";
import { queueSignEvent as defaultQueueSignEvent } from "../nostr/signRequestQueue.js";
import { DEFAULT_NIP07_PERMISSION_METHODS as defaultPermissionMethods } from "../nostr/nip07Permissions.js";
import { nostrClient as defaultNostrClient } from "../nostrClientFacade.js";
import { userLogger as defaultUserLogger, devLogger as defaultDevLogger } from "../utils/logger.js";

export default class ShareNostrController {
  constructor({ ui, state, services = {} }) {
    this.ui = ui;
    this.state = state;
    this.services = {
      sanitizeRelayList: services.sanitizeRelayList || defaultSanitizeRelayList,
      buildShareEvent: services.buildShareEvent || defaultBuildShareEvent,
      publishEventToRelays: services.publishEventToRelays || defaultPublishEventToRelays,
      assertAnyRelayAccepted: services.assertAnyRelayAccepted || defaultAssertAnyRelayAccepted,
      getActiveSigner: services.getActiveSigner || defaultGetActiveSigner,
      queueSignEvent: services.queueSignEvent || defaultQueueSignEvent,
      permissionMethods: services.permissionMethods || defaultPermissionMethods,
      nostrClient: services.nostrClient || defaultNostrClient,
      userLogger: services.userLogger || defaultUserLogger,
      devLogger: services.devLogger || defaultDevLogger,
    };
  }

  async openModal({ video, triggerElement } = {}) {
    const currentVideo = this.state.getCurrentVideo();
    const targetVideo =
      video && typeof video === "object" ? video : currentVideo || null;

    if (!targetVideo) {
      this.ui.showError("No video is available to share.");
      return;
    }

    const modal = this.ui.getModal();
    if (!modal) {
      this.services.devLogger.warn("[ShareNostrController] Share Nostr modal is unavailable.");
      this.ui.showError("Share modal is not ready yet.");
      return;
    }

    const shareUrl =
      typeof targetVideo.shareUrl === "string" && targetVideo.shareUrl.trim()
        ? targetVideo.shareUrl.trim()
        : this.state.buildShareUrlFromEventId(targetVideo.id);

    const payload = {
      id: targetVideo.id,
      title: targetVideo.title,
      pubkey: targetVideo.pubkey,
      authorName: targetVideo.creatorName || targetVideo.authorName || "",
      thumbnail: targetVideo.thumbnail,
      shareUrl,
    };

    try {
      await modal.open({
        video: payload,
        triggerElement,
      });
    } catch (error) {
      this.services.devLogger.error("[ShareNostrController] Failed to open Share Nostr modal:", error);
      this.ui.showError("Unable to open the share modal.");
    }
  }

  async handleShare(payload = {}) {
    const video = payload?.video || null;
    const videoId = typeof video?.id === "string" ? video.id.trim() : "";
    const videoTitle =
      typeof video?.title === "string" ? video.title.trim() : "";
    const videoPubkey =
      typeof video?.pubkey === "string" ? video.pubkey.trim() : "";

    if (!videoId || !videoTitle) {
      this.services.userLogger.warn("[ShareNostrController] Share post missing video details.");
      this.ui.showError("Missing video details for sharing.");
      throw new Error("share-missing-video-details");
    }

    const signer = this.services.getActiveSigner();
    if (!signer || typeof signer.signEvent !== "function") {
      this.services.userLogger.warn("[ShareNostrController] No active signer available for share.");
      this.ui.showError("Connect a Nostr signer to share.");
      throw new Error("share-missing-signer");
    }

    const pubkey = this.state.getPubkey();
    const activePubkey = this.state.normalizeHexPubkey(pubkey);
    const signerPubkey = this.state.normalizeHexPubkey(signer.pubkey);
    const eventPubkey = activePubkey || signerPubkey;

    if (!eventPubkey) {
      this.services.userLogger.warn("[ShareNostrController] Share post missing active pubkey.");
      this.ui.showError("Please log in to share on Nostr.");
      throw new Error("share-missing-pubkey");
    }

    if (activePubkey && signerPubkey && activePubkey !== signerPubkey) {
      this.services.userLogger.error(
        "[ShareNostrController] Active signer does not match current account for share.",
      );
      this.ui.showError("Active signer does not match your account.");
      throw new Error("share-signer-mismatch");
    }

    if (!this.services.nostrClient?.pool) {
      this.services.userLogger.error("[ShareNostrController] Share publish failed: relays not ready.");
      this.ui.showError("Nostr relays are not ready yet. Please try again.");
      throw new Error("share-relays-unavailable");
    }

    const relayEntries = Array.isArray(payload?.relays) ? payload.relays : [];
    const relayUrls = relayEntries
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (Array.isArray(entry) && entry.length) {
          if (entry[0] === "r") {
            return typeof entry[1] === "string" ? entry[1] : "";
          }
          return typeof entry[0] === "string" ? entry[0] : "";
        }
        if (entry && typeof entry === "object") {
          if (typeof entry.url === "string") {
            return entry.url;
          }
          if (typeof entry.relay === "string") {
            return entry.relay;
          }
        }
        return "";
      })
      .filter(Boolean);
    const relayTargets = this.services.sanitizeRelayList(relayUrls);

    if (!relayTargets.length) {
      this.services.userLogger.warn("[ShareNostrController] Share post missing relay targets.");
      this.ui.showError("Please choose at least one relay to share to.");
      throw new Error("share-missing-relays");
    }

    if (signer.type === "extension" && this.services.nostrClient.ensureExtensionPermissions) {
      const permissionResult = await this.services.nostrClient.ensureExtensionPermissions(
        this.services.permissionMethods,
      );
      if (!permissionResult?.ok) {
        this.services.userLogger.warn(
          "[ShareNostrController] Share publish blocked by signer permissions.",
          permissionResult?.error,
        );
        this.ui.showError("Signer permissions are required to post.");
        throw new Error("share-permission-denied");
      }
    }

    const event = this.services.buildShareEvent({
      pubkey: eventPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: typeof payload?.content === "string" ? payload.content : "",
      video: { id: videoId, pubkey: videoPubkey },
      relays: relayEntries,
    });

    let signedEvent;
    try {
      signedEvent = await this.services.queueSignEvent(signer, event);
    } catch (error) {
      this.services.userLogger.error("[ShareNostrController] Failed to sign share event.", error);
      this.ui.showError("Unable to sign the share event.");
      throw error;
    }

    const publishResults = await this.services.publishEventToRelays(
      this.services.nostrClient.pool,
      relayTargets,
      signedEvent,
    );

    let publishSummary;
    try {
      publishSummary = this.services.assertAnyRelayAccepted(publishResults, {
        context: "share note",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            this.services.userLogger.error(
              `[ShareNostrController] Relay ${url} rejected share note: ${reason}`,
              relayError || reason,
            );
          },
        );
      }
      this.ui.showError("Failed to share on Nostr. Please try again.");
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
        this.services.userLogger.warn(
          `[ShareNostrController] Relay ${url} did not acknowledge share note: ${reason}`,
          relayError,
        );
      });
    }

    this.services.userLogger.info(
      "[ShareNostrController] Share note published.",
      publishSummary.accepted.map(({ url }) => url),
    );
    this.ui.showSuccess("Shared to Nostr!");

    return {
      ok: true,
      event: signedEvent,
      accepted: publishSummary.accepted.map(({ url }) => url),
      failed: publishSummary.failed.map(({ url }) => url),
    };
  }
}
