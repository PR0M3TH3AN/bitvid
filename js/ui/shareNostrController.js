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
import { nip71MirrorService as defaultMirrorService } from "../services/nip71MirrorService.js";
import {
  buildMirrorCoordinate,
  buildMirrorNaddr,
  resolveMirrorKind,
} from "../nostr/mirrorPointer.js";

// Best-effort: a share must never hang on a relay read. If the mirror lookup
// doesn't answer in time we simply fall back to the thumbnail-URL note.
const MIRROR_LOOKUP_TIMEOUT_MS = 2500;

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
      mirrorService:
        services.mirrorService === undefined
          ? defaultMirrorService
          : services.mirrorService,
      nip19: services.nip19 || null,
    };
  }

  resolveNip19() {
    return (
      this.services.nip19 ||
      (typeof window !== "undefined" ? window?.NostrTools?.nip19 : null) ||
      null
    );
  }

  /**
   * Resolve an `naddr` for the video's NIP-71 mirror, or "" when there isn't
   * one. Embedding this makes nostr clients render a native video quote card
   * instead of a bare link — but ONLY when the mirror actually exists on
   * relays. A pointer to a missing event renders as a broken/empty quote box,
   * which is worse than the plain-link fallback, so this verifies before
   * pointing and stays silent on any failure.
   */
  async resolveMirrorPointer(video) {
    const mirrorService = this.services.mirrorService;
    const pubkey = typeof video?.pubkey === "string" ? video.pubkey.trim() : "";
    const videoRootId =
      typeof video?.videoRootId === "string" ? video.videoRootId.trim() : "";

    if (!pubkey || !videoRootId || !mirrorService) {
      return { naddr: "", coordinate: "" };
    }
    if (
      typeof mirrorService.isAvailable === "function" &&
      !mirrorService.isAvailable()
    ) {
      return { naddr: "", coordinate: "" };
    }
    if (typeof mirrorService.findMirror !== "function") {
      return { naddr: "", coordinate: "" };
    }

    let result = null;
    try {
      result = await Promise.race([
        mirrorService.findMirror({ pubkey, videoRootId }),
        new Promise((resolve) =>
          setTimeout(() => resolve(null), MIRROR_LOOKUP_TIMEOUT_MS)
        ),
      ]);
    } catch (error) {
      this.services.devLogger.warn(
        "[ShareNostrController] Mirror lookup failed; sharing without a quote.",
        error
      );
      return { naddr: "", coordinate: "" };
    }

    if (!result?.mirrored) {
      return { naddr: "", coordinate: "" };
    }

    const kind = resolveMirrorKind({
      kinds: result.kinds,
      width: video?.width,
      height: video?.height,
    });
    const relays = Array.isArray(this.services.nostrClient?.writeRelays)
      ? this.services.nostrClient.writeRelays
      : this.services.nostrClient?.relays || [];

    return {
      naddr: buildMirrorNaddr({
        pubkey,
        videoRootId,
        kind,
        relays,
        nip19: this.resolveNip19(),
      }),
      coordinate: buildMirrorCoordinate({ pubkey, videoRootId, kind }),
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

    const mirror = await this.resolveMirrorPointer(targetVideo);

    const payload = {
      id: targetVideo.id,
      title: targetVideo.title,
      pubkey: targetVideo.pubkey,
      authorName: targetVideo.creatorName || targetVideo.authorName || "",
      thumbnail: targetVideo.thumbnail,
      shareUrl,
      // Present only when a NIP-71 mirror was confirmed on relays. Drives the
      // quote-card note body and the `a` tag on the published event.
      mirrorNaddr: mirror.naddr,
      mirrorCoordinate: mirror.coordinate,
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

    if ((signer.type === "extension" || signer.type === "nip07") && this.services.nostrClient.ensureExtensionPermissions) {
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
      // title/thumbnail drive the NIP-92 `imeta` hint so the thumbnail URL in
      // the note body renders as an image rather than a bare link. When a
      // mirror pointer is present the note quotes the mirror instead, and
      // buildShareEvent drops the imeta so the image isn't rendered twice.
      video: {
        id: videoId,
        pubkey: videoPubkey,
        title: videoTitle,
        thumbnail:
          typeof video?.thumbnail === "string" ? video.thumbnail.trim() : "",
        mirrorNaddr:
          typeof video?.mirrorNaddr === "string" ? video.mirrorNaddr.trim() : "",
        mirrorCoordinate:
          typeof video?.mirrorCoordinate === "string"
            ? video.mirrorCoordinate.trim()
            : "",
      },
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
