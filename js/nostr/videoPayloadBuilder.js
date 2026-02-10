import { HEX64_REGEX, normalizeHexHash } from "../utils/hex.js";
import { infoHashFromMagnet } from "../magnets.js";
import { resolveStoragePointerValue, getStoragePointerFromTags } from "../utils/storagePointer.js";
import { buildNip71MetadataTags, extractNip71MetadataFromTags } from "./nip71.js";
import { buildVideoPostEvent } from "../nostrEventSchemas.js";
import { computeSha256HexFromValue } from "../utils/cryptoUtils.js";
import { inferMimeTypeFromUrl } from "../utils/mime.js";
import { devLogger } from "../utils/logger.js";

export function extractVideoPublishPayload(rawPayload) {
  let videoData = rawPayload;
  let nip71Metadata = null;

  if (rawPayload && typeof rawPayload === "object") {
    if (rawPayload.nip71 && typeof rawPayload.nip71 === "object") {
      nip71Metadata = rawPayload.nip71;
    }
    if (
      rawPayload.legacyFormData &&
      typeof rawPayload.legacyFormData === "object"
    ) {
      videoData = rawPayload.legacyFormData;
    } else if (
      Object.prototype.hasOwnProperty.call(rawPayload, "legacyFormData")
    ) {
      videoData = rawPayload.legacyFormData || {};
    }
  }

  if (!videoData || typeof videoData !== "object") {
    videoData = {};
  }

  const normalizedVideoData = { ...videoData };
  const isNsfw = videoData.isNsfw === true;
  normalizedVideoData.isNsfw = isNsfw;
  normalizedVideoData.isForKids =
    videoData.isForKids === true && !isNsfw;

  return { videoData: normalizedVideoData, nip71Metadata };
}

export async function prepareVideoPublishPayload(videoPayload, pubkey, { timestamp = Math.floor(Date.now() / 1000) } = {}) {
    const normalizedPubkey = typeof pubkey === "string" ? pubkey.trim() : "";
    if (!normalizedPubkey) {
      throw new Error("Not logged in to publish video.");
    }

    const { videoData, nip71Metadata } = extractVideoPublishPayload(videoPayload);

    devLogger.log("Publishing new video with data:", videoData);
    if (nip71Metadata) {
      devLogger.log("Including NIP-71 metadata:", nip71Metadata);
    }

    const rawMagnet = typeof videoData.magnet === "string" ? videoData.magnet : "";
    const finalMagnet = rawMagnet.trim();
    const finalUrl =
      typeof videoData.url === "string" ? videoData.url.trim() : "";
    const finalThumbnail =
      typeof videoData.thumbnail === "string" ? videoData.thumbnail.trim() : "";
    const finalDescription =
      typeof videoData.description === "string"
        ? videoData.description.trim()
        : "";
    const finalTitle =
      typeof videoData.title === "string" ? videoData.title.trim() : "";
    const providedMimeType =
      typeof videoData.mimeType === "string"
        ? videoData.mimeType.trim().toLowerCase()
        : "";

    const createdAt = timestamp;

    const seriesIdentifierCandidates = [
      videoData.videoRootId,
      videoData.seriesId,
      videoData.seriesIdentifier,
    ];
    let seriesIdentifier = "";
    for (const candidate of seriesIdentifierCandidates) {
      const normalized = typeof candidate === "string" ? candidate.trim() : "";
      if (normalized) {
        seriesIdentifier = normalized;
        break;
      }
    }

    if (!seriesIdentifier) {
      seriesIdentifier = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const videoRootId = seriesIdentifier;
    const dTagValue = seriesIdentifier;

    const finalEnableComments =
      videoData.enableComments === false ? false : true;
    const finalIsNsfw = videoData.isNsfw === true;
    const finalIsForKids =
      videoData.isForKids === true && !finalIsNsfw;
    const wantPrivate = videoData.isPrivate === true;
    const finalWs =
      typeof videoData.ws === "string" ? videoData.ws.trim() : "";
    const finalXs =
      typeof videoData.xs === "string" ? videoData.xs.trim() : "";
    const infoHashCandidates = [videoData.infoHash];
    let infoHash = "";
    for (const candidate of infoHashCandidates) {
      const normalized = infoHashFromMagnet(candidate);
      if (normalized) {
        infoHash = normalized;
        break;
      }
    }
    if (!infoHash && finalMagnet) {
      infoHash = infoHashFromMagnet(finalMagnet) || "";
    }
    const fileSha256 = normalizeHexHash(videoData.fileSha256);
    const originalFileSha256 = normalizeHexHash(videoData.originalFileSha256);
    const storagePointer = resolveStoragePointerValue({
      storagePointer: videoData.storagePointer,
      url: finalUrl,
      infoHash,
      fallbackId: videoRootId,
      provider: videoData.storageProvider,
    });

    const contentObject = {
      version: 3,
      title: finalTitle,
      url: finalUrl,
      magnet: finalMagnet,
      thumbnail: finalThumbnail,
      description: finalDescription,
      mode: videoData.mode || "live",
      videoRootId,
      deleted: false,
      isPrivate: videoData.isPrivate ?? false,
      isNsfw: finalIsNsfw,
      isForKids: finalIsForKids,
      enableComments: finalEnableComments,
    };

    if (infoHash) {
      contentObject.infoHash = infoHash;
    }

    if (fileSha256) {
      contentObject.fileSha256 = fileSha256;
    }

    if (originalFileSha256) {
      contentObject.originalFileSha256 = originalFileSha256;
    }

    if (finalWs) {
      contentObject.ws = finalWs;
    }

    if (finalXs) {
      contentObject.xs = finalXs;
    }

    const nip71Tags = buildNip71MetadataTags(
      nip71Metadata && typeof nip71Metadata === "object" ? nip71Metadata : null
    );

    const additionalTags = storagePointer
      ? [["s", storagePointer], ...nip71Tags]
      : nip71Tags;

    const event = buildVideoPostEvent({
      pubkey: normalizedPubkey,
      created_at: createdAt,
      dTagValue,
      content: contentObject,
      additionalTags,
    });

    return {
        event,
        videoData,
        nip71Metadata,
        finalUrl,
        finalMagnet,
        finalThumbnail,
        finalDescription,
        finalTitle,
        mimeType: providedMimeType,
        fileSha256,
        originalFileSha256,
        videoRootId,
        dTagValue,
        createdAt,
        contentObject,
        wantPrivate,
        normalizedPubkey,
        videoPayload
    };
}

export async function prepareVideoMirrorOptions(params) {
    const {
        videoData,
        videoPayload,
        finalUrl,
        finalMagnet,
        finalThumbnail,
        finalDescription,
        finalTitle,
        mimeType: providedMimeType,
        fileSha256: initialFileSha256,
        originalFileSha256: initialOriginalFileSha256,
        pubkey,
        createdAt,
        isPrivate
    } = params;

    const inferredMimeType = inferMimeTypeFromUrl(finalUrl);
    const mimeTypeSource =
      providedMimeType ||
      inferredMimeType ||
      "application/octet-stream";
    const mimeType = mimeTypeSource.toLowerCase();

    const fileHashCandidates = [
      initialFileSha256,
      videoData.fileSha256,
      videoData.uploadedFileSha256,
      videoPayload?.legacyFormData?.fileSha256,
      videoPayload?.fileSha256,
    ];
    let fileSha256 = "";
    for (const candidate of fileHashCandidates) {
      const normalized = normalizeHexHash(candidate);
      if (normalized) {
        fileSha256 = normalized;
        break;
      }
    }

    const originalHashCandidates = [
      initialOriginalFileSha256,
      videoData.originalFileSha256,
      videoPayload?.legacyFormData?.originalFileSha256,
      videoPayload?.originalFileSha256,
    ];
    let originalFileSha256 = "";
    for (const candidate of originalHashCandidates) {
      const normalized = normalizeHexHash(candidate);
      if (normalized) {
        originalFileSha256 = normalized;
        break;
      }
    }

    const uploadedFile =
      videoData?.uploadedFile ||
      videoData?.file ||
      videoPayload?.legacyFormData?.uploadedFile ||
      videoPayload?.legacyFormData?.file ||
      videoPayload?.uploadedFile ||
      videoPayload?.file ||
      null;

    const originalFile =
      videoData?.originalFile ||
      videoPayload?.legacyFormData?.originalFile ||
      videoPayload?.originalFile ||
      uploadedFile;

    if (!fileSha256 && uploadedFile) {
      fileSha256 = await computeSha256HexFromValue(uploadedFile);
    }

    if (!originalFileSha256 && originalFile) {
      originalFileSha256 = await computeSha256HexFromValue(originalFile);
    }

    if (!originalFileSha256 && fileSha256) {
      originalFileSha256 = fileSha256;
    }

    const mirrorOptions = {
      url: finalUrl,
      magnet: finalMagnet,
      thumbnail: finalThumbnail,
      description: finalDescription,
      title: finalTitle,
      mimeType,
      isPrivate: isPrivate,
      actorPubkey: pubkey,
      created_at: createdAt,
    };

    if (fileSha256) {
      mirrorOptions.fileSha256 = fileSha256;
    }

    if (originalFileSha256) {
      mirrorOptions.originalFileSha256 = originalFileSha256;
    }

    return mirrorOptions;
}

export function prepareVideoEditPayload(params) {
  const {
    baseEvent,
    originalEventStub,
    updatedData,
    userPubkey,
    resolveEventDTag // Injected dependency to resolve D tag
  } = params;

  const userPubkeyLower = userPubkey.toLowerCase();

  const nip71Metadata =
    updatedData && typeof updatedData === "object" ? updatedData.nip71 : null;

  const oldMagnet =
    typeof baseEvent.rawMagnet === "string" && baseEvent.rawMagnet.trim()
      ? baseEvent.rawMagnet.trim()
      : typeof baseEvent.magnet === "string"
      ? baseEvent.magnet.trim()
      : "";
  const oldUrl = baseEvent.url || "";

  // Determine if the updated note should be private
  const wantPrivate = updatedData.isPrivate ?? baseEvent.isPrivate ?? false;
  const wantNsfw = updatedData.isNsfw ?? baseEvent.isNsfw ?? false;
  const wantForKids = updatedData.isForKids ?? baseEvent.isForKids ?? false;
  const finalIsNsfw = wantNsfw === true;
  const finalIsForKids = finalIsNsfw ? false : wantForKids === true;

  // Use the new magnet if provided; otherwise, fall back to the decrypted old magnet
  const magnetEdited = updatedData.magnetEdited === true;
  const newMagnetValue =
    typeof updatedData.magnet === "string" ? updatedData.magnet.trim() : "";
  const finalMagnet = magnetEdited ? newMagnetValue : oldMagnet;

  const urlEdited = updatedData.urlEdited === true;
  const newUrlValue =
    typeof updatedData.url === "string" ? updatedData.url.trim() : "";
  const finalUrl = urlEdited ? newUrlValue : oldUrl;

  const wsEdited = updatedData.wsEdited === true;
  const xsEdited = updatedData.xsEdited === true;
  const newWsValue =
    typeof updatedData.ws === "string" ? updatedData.ws.trim() : "";
  const newXsValue =
    typeof updatedData.xs === "string" ? updatedData.xs.trim() : "";
  const baseWs =
    typeof baseEvent.ws === "string" ? baseEvent.ws.trim() : "";
  const baseXs =
    typeof baseEvent.xs === "string" ? baseEvent.xs.trim() : "";
  const finalWs = wsEdited ? newWsValue : baseWs;
  const finalXs = xsEdited ? newXsValue : baseXs;
  const finalEnableComments =
    typeof updatedData.enableComments === "boolean"
      ? updatedData.enableComments
      : baseEvent.enableComments === false
        ? false
        : true;

  const updatedInfoHash = infoHashFromMagnet(updatedData?.infoHash || "");
  let infoHash =
    updatedInfoHash ||
    infoHashFromMagnet(finalMagnet) ||
    infoHashFromMagnet(baseEvent.infoHash) ||
    "";
  const fileSha256 =
    normalizeHexHash(updatedData?.fileSha256) ||
    normalizeHexHash(baseEvent.fileSha256);
  const originalFileSha256 =
    normalizeHexHash(updatedData?.originalFileSha256) ||
    normalizeHexHash(baseEvent.originalFileSha256);

  // Use the existing videoRootId (or fall back to the base event's ID)
  const oldRootId = baseEvent.videoRootId || baseEvent.id;
  const storagePointer = resolveStoragePointerValue({
    storagePointer:
      updatedData?.storagePointer ||
      baseEvent.storagePointer ||
      getStoragePointerFromTags(baseEvent.tags),
    url: finalUrl,
    infoHash,
    fallbackId: oldRootId,
    provider: updatedData?.storageProvider || baseEvent.storageProvider,
  });

  const preservedDTag = resolveEventDTag(baseEvent, originalEventStub);
  const fallbackDTag =
    (typeof baseEvent.id === "string" && baseEvent.id.trim()) ||
    (typeof originalEventStub?.id === "string" && originalEventStub.id.trim()) ||
    "";
  const finalDTagValue =
    (typeof preservedDTag === "string" && preservedDTag.trim()) || fallbackDTag;

  if (!finalDTagValue) {
    throw new Error("Unable to determine a stable d tag for this edit.");
  }

  // Build the updated content object
  const contentObject = {
    videoRootId: oldRootId,
    version: updatedData.version ?? baseEvent.version ?? 2,
    deleted: false,
    isPrivate: wantPrivate,
    isNsfw: finalIsNsfw,
    isForKids: finalIsForKids,
    title: updatedData.title ?? baseEvent.title,
    url: finalUrl,
    magnet: finalMagnet,
    thumbnail: updatedData.thumbnail ?? baseEvent.thumbnail,
    description: updatedData.description ?? baseEvent.description,
    mode: updatedData.mode ?? baseEvent.mode ?? "live",
    enableComments: finalEnableComments,
  };

  if (infoHash) {
    contentObject.infoHash = infoHash;
  }

  if (fileSha256) {
    contentObject.fileSha256 = fileSha256;
  }

  if (originalFileSha256) {
    contentObject.originalFileSha256 = originalFileSha256;
  }

  if (finalWs) {
    contentObject.ws = finalWs;
  }

  if (finalXs) {
    contentObject.xs = finalXs;
  }

  let metadataForTags =
    nip71Metadata && typeof nip71Metadata === "object" ? nip71Metadata : null;
  if (!metadataForTags) {
    if (baseEvent?.nip71 && typeof baseEvent.nip71 === "object") {
      metadataForTags = baseEvent.nip71;
    } else {
      const extracted = extractNip71MetadataFromTags(baseEvent);
      if (extracted?.metadata) {
        metadataForTags = extracted.metadata;
      }
    }
  }

  const nip71Tags = buildNip71MetadataTags(metadataForTags);

  const additionalTags = storagePointer
    ? [["s", storagePointer], ...nip71Tags]
    : nip71Tags;

  const createdAt = Math.floor(Date.now() / 1000);

  const event = buildVideoPostEvent({
    pubkey: userPubkeyLower,
    created_at: createdAt,
    dTagValue: finalDTagValue,
    content: contentObject,
    additionalTags,
  });

  return {
    event,
    contentObject,
    nip71Metadata,
    wantPrivate,
    videoRootId: oldRootId,
    dTagValue: finalDTagValue,
    normalizedPubkey: userPubkeyLower,
    userPubkeyLower,
    createdAt,
    finalUrl,
    finalMagnet,
    finalThumbnail: contentObject.thumbnail,
    finalDescription: contentObject.description,
    finalTitle: contentObject.title,
    mimeType: updatedData.mimeType || "",
    fileSha256,
    originalFileSha256,
    videoData: updatedData,
    videoPayload: updatedData,
  };
}
