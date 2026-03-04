import { devLogger, userLogger } from "../utils/logger.js";
import { FEATURE_PUBLISH_NIP71 } from "../constants.js";
import { prepareVideoMirrorOptions, extractVideoPublishPayload } from "./videoPayloadBuilder.js";
import {
  buildNip71VideoEvent,
  buildVideoPointerValue,
  stringFromInput
} from "./nip71.js";

/**
 * Handles NIP-94 mirroring for a published video.
 *
 * @param {import("./client.js").NostrClient} client - The client instance.
 * @param {import("nostr-tools").Event} signedEvent - The signed video event.
 * @param {object} context - The publish context returned by prepareVideoPublishPayload.
 */
export async function handlePublishNip94(client, signedEvent, context) {
    const { finalUrl } = context;

    if (!finalUrl) {
      devLogger.log("Skipping NIP-94 mirror: no hosted URL provided.");
      return;
    }

    const {
      videoData,
      videoPayload,
      finalMagnet,
      finalThumbnail,
      finalDescription,
      finalTitle,
      mimeType,
      fileSha256,
      originalFileSha256,
      normalizedPubkey,
      createdAt,
      contentObject,
    } = context;

    const mirrorOptions = await prepareVideoMirrorOptions({
      videoData,
      videoPayload,
      finalUrl,
      finalMagnet,
      finalThumbnail,
      finalDescription,
      finalTitle,
      mimeType,
      fileSha256,
      originalFileSha256,
      pubkey: normalizedPubkey,
      createdAt,
      isPrivate: contentObject.isPrivate,
    });

    try {
      const mirrorResult = await client.mirrorVideoEvent(
        signedEvent.id,
        mirrorOptions,
      );

      if (mirrorResult?.ok) {
        devLogger.log("Prepared NIP-94 mirror event:", mirrorResult.event);
        devLogger.log("NIP-94 mirror dispatched for hosted URL:", finalUrl);
      } else if (mirrorResult) {
        devLogger.warn(
          "[nostr] NIP-94 mirror rejected:",
          mirrorResult.error || "mirror-failed",
          mirrorResult.details || null,
        );
      }
    } catch (mirrorError) {
      devLogger.warn(
        "[nostr] Failed to publish NIP-94 mirror:",
        mirrorError,
      );
    }
}

/**
 * Handles NIP-71 metadata publishing.
 *
 * @param {import("./client.js").NostrClient} client - The client instance.
 * @param {import("nostr-tools").Event} signedEvent - The signed video event.
 * @param {object} context - The publish context returned by prepareVideoPublishPayload.
 */
export async function handlePublishNip71(client, signedEvent, context) {
    const {
      videoPayload,
      nip71Metadata,
      contentObject,
      wantPrivate,
      normalizedPubkey,
      videoRootId,
      dTagValue,
    } = context;

    const userPubkeyLower = normalizedPubkey.toLowerCase();

    const nip71EditedFlag =
      videoPayload && typeof videoPayload === "object"
        ? videoPayload.nip71Edited
        : null;
    const hasMetadataObject =
      nip71Metadata && typeof nip71Metadata === "object";
    const metadataWasEdited =
      nip71EditedFlag === true ||
      (nip71EditedFlag == null && hasMetadataObject);
    const shouldAttemptNip71 = !wantPrivate && metadataWasEdited;

    if (shouldAttemptNip71) {
      const metadataLegacyFormData = {
        title: contentObject.title,
        description: contentObject.description,
        url: contentObject.url,
        magnet: contentObject.magnet,
        thumbnail: contentObject.thumbnail,
        mode: contentObject.mode,
        isPrivate: wantPrivate,
        isNsfw: contentObject.isNsfw,
        isForKids: contentObject.isForKids,
      };

      if (contentObject.ws) {
        metadataLegacyFormData.ws = contentObject.ws;
      }

      if (contentObject.xs) {
        metadataLegacyFormData.xs = contentObject.xs;
      }

      try {
        await publishNip71Video(
          client,
          {
            nip71: nip71Metadata,
            legacyFormData: metadataLegacyFormData,
          },
          userPubkeyLower,
          {
            videoRootId,
            dTag: dTagValue,
            eventId: signedEvent.id,
          },
        );
      } catch (nip71Error) {
        userLogger.warn(
          "[nostr] Failed to publish NIP-71 metadata for edit:",
          nip71Error,
        );
      }
    }
}

/**
 * Publishes a NIP-71 video event.
 *
 * @param {import("./client.js").NostrClient} client - The client instance.
 * @param {object} videoPayload - The video payload.
 * @param {string} pubkey - The publisher's pubkey.
 * @param {object} pointerOptions - The pointer options.
 */
export async function publishNip71Video(client, videoPayload, pubkey, pointerOptions = {}) {
    if (!FEATURE_PUBLISH_NIP71) {
      return null;
    }

    if (!pubkey) {
      throw new Error("Not logged in to publish video.");
    }

    const { videoData, nip71Metadata } = extractVideoPublishPayload(videoPayload);

    if (!nip71Metadata || typeof nip71Metadata !== "object") {
      devLogger.log("[nostr] Skipping NIP-71 publish: metadata missing.");
      return null;
    }

    const title = stringFromInput(videoData?.title);
    const description = stringFromInput(videoData?.description);

    const pointerIdentifiers =
      pointerOptions && typeof pointerOptions === "object"
        ? pointerOptions
        : {};

    const event = buildNip71VideoEvent({
      metadata: nip71Metadata,
      pubkey,
      title,
      summaryFallback: description,
      pointerIdentifiers: {
        videoRootId: pointerIdentifiers.videoRootId,
        dTag: pointerIdentifiers.dTag,
        eventId: pointerIdentifiers.eventId,
      },
      createdAt: Math.floor(Date.now() / 1000),
    });

    if (!event) {
      devLogger.warn("[nostr] Skipping NIP-71 publish: builder produced no event.");
      return null;
    }

    devLogger.log("Prepared NIP-71 video event:", event);

    const { signedEvent } = await client.signAndPublishEvent(event, {
      context: "NIP-71 video",
      logName: "NIP-71 video",
      devLogLabel: "NIP-71 video",
      rejectionLogLevel: "warn",
      resolveActiveSigner: (p) => client.signerManager.resolveActiveSigner(p),
    });

    const pointerMap = new Map();
    if (pointerIdentifiers.videoRootId) {
      const pointerValue = buildVideoPointerValue(
        pubkey,
        pointerIdentifiers.videoRootId
      );
      if (pointerValue) {
        pointerMap.set(pointerValue, {
          videoRootId: pointerIdentifiers.videoRootId,
          pointerValue,
          videoEventIds: new Set(
            pointerIdentifiers.eventId ? [pointerIdentifiers.eventId] : []
          ),
          dTags: new Set(pointerIdentifiers.dTag ? [pointerIdentifiers.dTag] : []),
        });
      }
    }

    client.processNip71Events([signedEvent], pointerMap);

    return signedEvent;
}
