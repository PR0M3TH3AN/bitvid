// js/ui/components/mediaUploader.js
//
// Shared storage-upload core extracted from UploadModal so the Upload and Edit
// modals can upload thumbnails and videos without duplicating the R2/S3 +
// torrent-metadata logic. This module owns ONLY the storage/torrent work
// (resolve active connection, upload file, build keys/URLs, compute infohash,
// build the .torrent + magnet). UI concerns (progress rendering, zombie-request
// guards, form state) stay in the calling modal and are driven via onProgress.

import { devLogger, userLogger } from "../../utils/logger.js";
import {
  calculateTorrentInfoHash,
  createTorrentMetadata,
} from "../../utils/torrentHash.js";
import {
  deriveExternalUrlTorrent,
  buildWebseedMagnet,
  DEFAULT_EXTERNAL_URL_HASH_MAX_BYTES,
} from "../../utils/externalUrlTorrent.js";
import { buildR2Key, buildPublicUrl } from "../../r2.js";
import { buildS3ObjectUrl } from "../../services/s3Service.js";
import { PROVIDERS } from "../../services/storageService.js";
import {
  buildStoragePointerValue,
  buildStoragePrefixFromKey,
} from "../../utils/storagePointer.js";
import blossomServiceDefault, {
  isBlossomProvider,
  resolveBlossomServers,
} from "../../services/blossomService.js";

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;

function normalizeInfoHash(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidInfoHash(value) {
  return INFO_HASH_PATTERN.test(value);
}

function isR2Provider(provider) {
  return provider === PROVIDERS.R2 || provider === "cloudflare_r2";
}

export class MediaUploader {
  constructor({
    r2Service,
    s3Service,
    storageService,
    getCurrentPubkey,
    safeEncodeNpub,
    blossomService,
    getSigner,
  } = {}) {
    this.r2Service = r2Service || null;
    this.s3Service = s3Service || null;
    this.storageService = storageService || null;
    this.getCurrentPubkey =
      typeof getCurrentPubkey === "function" ? getCurrentPubkey : null;
    this.safeEncodeNpub =
      typeof safeEncodeNpub === "function" ? safeEncodeNpub : () => "";
    // Blossom (nostr-native) upload path. Only exercised when a connection's
    // provider is "blossom", so S3/R2 uploads are completely unaffected.
    this.blossomService = blossomService || blossomServiceDefault;
    this.getSigner = typeof getSigner === "function" ? getSigner : null;
  }

  serviceFor(provider) {
    return isR2Provider(provider) ? this.r2Service : this.s3Service;
  }

  publicUrlFor(provider, baseDomain, key) {
    return isR2Provider(provider)
      ? buildPublicUrl(baseDomain, key)
      : buildS3ObjectUrl({ publicBaseUrl: baseDomain, key });
  }

  /**
   * Resolve the active storage connection for the current pubkey. Mirrors the
   * data portion of UploadModal.loadFromStorage (no UI). Returns:
   *   { pubkey, npub, configured, unlocked, provider, credentials }
   * credentials is only populated when the connection is unlocked.
   */
  async resolveActiveConnection() {
    const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
    const base = {
      pubkey: pubkey || null,
      npub: pubkey ? this.safeEncodeNpub(pubkey) : "",
      configured: false,
      unlocked: false,
      provider: null,
      credentials: null,
    };

    if (!pubkey || !this.storageService) {
      return base;
    }

    base.unlocked = this.storageService.isUnlocked(pubkey);

    const connections = await this.storageService.listConnections(pubkey);
    const defaultConn = connections.find((c) => c.meta?.defaultForUploads);
    const targetConn = defaultConn || connections[0];
    if (!targetConn) {
      return base;
    }

    base.configured = true;
    base.provider = targetConn.provider;

    if (base.unlocked) {
      const details = await this.storageService.getConnection(
        pubkey,
        targetConn.id,
      );
      base.credentials = details || null;
    }

    return base;
  }

  /**
   * Upload a standalone thumbnail file. Returns { url, key }.
   */
  async uploadThumbnail(file, { provider, credentials, onProgress } = {}) {
    const pubkey = this.getCurrentPubkey();
    const npub = this.safeEncodeNpub(pubkey);
    // Route by the credentials' own provider (see uploadVideo) to avoid wrong-service
    // routing when the modal's provider state is stale.
    const effectiveProvider =
      credentials?.provider || credentials?.meta?.provider || provider;
    if (isBlossomProvider(effectiveProvider)) {
      return this.uploadThumbnailToBlossom(file, { credentials, onProgress });
    }
    const service = this.serviceFor(effectiveProvider);

    const { settings, bucketEntry } = await service.prepareUpload(npub, {
      credentials,
    });

    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${npub}/thumbnails/${timestamp}-${cleanName}`;
    const baseDomain = bucketEntry.publicBaseUrl;
    const url = this.publicUrlFor(effectiveProvider, baseDomain, key);

    await service.uploadFile({
      file,
      bucket: bucketEntry.bucket,
      key,
      accountId: settings.accountId,
      endpoint: settings.endpoint,
      provider: settings.provider || effectiveProvider || "cloudflare_r2",
      region: settings.region,
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      forcePathStyle: settings.forcePathStyle,
      createBucketIfMissing: true,
      onProgress: (fraction) => {
        if (typeof onProgress === "function") onProgress(fraction);
      },
    });

    return { url, key };
  }

  async resolveUploadIdentifier(file) {
    try {
      const infoHash = await calculateTorrentInfoHash(file);
      const normalized = normalizeInfoHash(infoHash);
      if (isValidInfoHash(normalized)) {
        return normalized;
      }
    } catch (hashErr) {
      userLogger.warn("Failed to precompute info hash for storage key:", hashErr);
    }
    return "";
  }

  async generateTorrentMetadata({ file, videoPublicUrl } = {}) {
    let infoHash = "";
    let torrentFile = null;

    try {
      const urlList = videoPublicUrl ? [videoPublicUrl] : [];
      const torrentMetadata = await createTorrentMetadata(file, urlList);

      infoHash = torrentMetadata?.infoHash || "";
      if (torrentMetadata?.torrentFile) {
        const baseName = file.name.replace(/\.[^/.]+$/, "") || file.name;
        torrentFile = new File(
          [torrentMetadata.torrentFile],
          `${baseName}.torrent`,
          { type: "application/x-bittorrent" },
        );
      }
    } catch (hashErr) {
      userLogger.warn("Failed to calculate info hash:", hashErr);
    }

    const normalizedInfoHash = normalizeInfoHash(infoHash);
    return {
      infoHash: normalizedInfoHash,
      torrentFile,
      hasValidInfoHash: isValidInfoHash(normalizedInfoHash),
    };
  }

  /**
   * Upload a video file (and its generated .torrent). Returns:
   *   { url, key, storagePointer, infoHash, magnet, torrentUrl, torrentFile,
   *     hasValidInfoHash }
   * onProgress is called as ({ fraction, label }) so the caller can render its
   * own progress UI matching the original UploadModal labels.
   */
  async uploadVideo(file, { provider, credentials, onProgress } = {}) {
    const emit = (fraction, label) => {
      if (typeof onProgress === "function") onProgress({ fraction, label });
    };

    const identifier = await this.resolveUploadIdentifier(file);

    const pubkey = this.getCurrentPubkey();
    const npub = this.safeEncodeNpub(pubkey);
    // Route by the credentials' OWN provider so a stale activeProvider can't send an
    // R2 connection (accountId, no endpoint) through the S3 path — or vice-versa.
    const effectiveProvider =
      credentials?.provider || credentials?.meta?.provider || provider;
    if (isBlossomProvider(effectiveProvider)) {
      return this.uploadVideoToBlossom(file, { credentials, onProgress });
    }
    const service = this.serviceFor(effectiveProvider);

    const { settings, bucketEntry } = await service.prepareUpload(npub, {
      credentials,
    });

    const videoKey = buildR2Key(npub, file, identifier);
    const baseDomain = bucketEntry.publicBaseUrl;
    const videoPublicUrl = this.publicUrlFor(effectiveProvider, baseDomain, videoKey);

    emit(0, "Uploading video...");
    const uploadPromise = service.uploadFile({
      file,
      bucket: bucketEntry.bucket,
      key: videoKey,
      accountId: settings.accountId,
      endpoint: settings.endpoint,
      provider: settings.provider || effectiveProvider || "cloudflare_r2",
      region: settings.region,
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      forcePathStyle: settings.forcePathStyle,
      createBucketIfMissing: true,
      onProgress: (fraction) => emit(fraction, null),
    });

    emit(null, "Uploading & Calculating Hash...");
    const torrentPromise = this.generateTorrentMetadata({
      file,
      videoPublicUrl,
    });

    const [, torrentResult] = await Promise.all([uploadPromise, torrentPromise]);

    const storagePrefix = buildStoragePrefixFromKey({
      publicBaseUrl: baseDomain,
      key: videoKey,
    });
    const providerLabel = isR2Provider(effectiveProvider) ? "r2" : "s3";
    const storagePointer = buildStoragePointerValue({
      provider: providerLabel,
      prefix: storagePrefix,
    });

    emit(1, "Video uploaded.");

    const result = {
      url: videoPublicUrl,
      key: videoKey,
      storagePointer,
      infoHash: "",
      magnet: "",
      torrentUrl: "",
      torrentFile: null,
      hasValidInfoHash: false,
    };

    if (torrentResult.hasValidInfoHash && torrentResult.torrentFile) {
      const baseKey = videoKey.replace(/\.[^/.]+$/, "");
      const torrentKey =
        baseKey && baseKey !== videoKey
          ? `${baseKey}.torrent`
          : `${videoKey}.torrent`;
      const torrentPublicUrl = this.publicUrlFor(provider, baseDomain, torrentKey);

      emit(1, "Uploading torrent metadata...");
      await service.uploadFile({
        file: torrentResult.torrentFile,
        bucket: bucketEntry.bucket,
        key: torrentKey,
        accountId: settings.accountId,
        endpoint: settings.endpoint,
        provider: settings.provider || provider || "cloudflare_r2",
        region: settings.region,
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
        forcePathStyle: settings.forcePathStyle,
        createBucketIfMissing: true,
      });

      const magnet = `magnet:?xt=urn:btih:${torrentResult.infoHash}&dn=${encodeURIComponent(
        file.name,
      )}&ws=${encodeURIComponent(videoPublicUrl)}&xs=${encodeURIComponent(
        torrentPublicUrl,
      )}`;

      result.infoHash = torrentResult.infoHash;
      result.magnet = magnet;
      result.torrentUrl = torrentPublicUrl;
      result.torrentFile = torrentResult.torrentFile;
      result.hasValidInfoHash = true;
      emit(1, "Ready to publish!");
    } else {
      emit(1, "Upload complete (No torrent fallback).");
    }

    return result;
  }

  // --- Blossom (nostr-native blob storage) path --------------------------------
  // Thin wiring only: resolve servers + signer, then delegate the orchestration
  // to blossomService (which owns upload + torrent + magnet + storagePointer and
  // stays WebTorrent-free / unit-testable). The torrent generator is injected so
  // blossomService never imports WebTorrent. See docs/blossom-plan.md.

  // Adapt bitvid's active signer (object with signEvent) to the SDK's signer
  // shape: an async (eventTemplate) → signed event.
  async resolveBlossomSigner() {
    const signer = this.getSigner ? await this.getSigner() : null;
    if (!signer || typeof signer.signEvent !== "function") {
      throw new Error("A Nostr signer is required to upload to Blossom.");
    }
    return (draft) => signer.signEvent(draft);
  }

  async uploadThumbnailToBlossom(file, { credentials, onProgress } = {}) {
    const servers = resolveBlossomServers(credentials);
    if (servers.length === 0) {
      throw new Error("No Blossom servers configured for this connection.");
    }
    const signer = await this.resolveBlossomSigner();
    const uploaded = await this.blossomService.uploadFile({
      file,
      servers,
      signer,
      type: "upload",
      onProgress: (fraction) => {
        if (typeof onProgress === "function") onProgress(fraction);
      },
    });
    return { url: uploaded.url, key: uploaded.key };
  }

  async uploadVideoToBlossom(file, { credentials, onProgress } = {}) {
    const emit = (fraction, label) => {
      if (typeof onProgress === "function") onProgress({ fraction, label });
    };
    const servers = resolveBlossomServers(credentials);
    if (servers.length === 0) {
      throw new Error("No Blossom servers configured for this connection.");
    }
    const signer = await this.resolveBlossomSigner();

    emit(0, "Uploading video to Blossom...");
    const result = await this.blossomService.uploadVideo({
      file,
      servers,
      signer,
      generateTorrent: (args) => this.generateTorrentMetadata(args),
      onProgress: (fraction) => emit(fraction, null),
    });
    emit(
      1,
      result.hasValidInfoHash
        ? "Ready to publish!"
        : "Upload complete (No torrent fallback).",
    );
    return result;
  }

  /**
   * Derive a WebTorrent webseed for an EXTERNALLY-hosted video URL so an external
   * link keeps the P2P benefit. Best-effort: fetches the remote file (CORS-
   * permitting), streams it under a size cap, computes the infoHash, and builds a
   * magnet with the URL as the webseed (ws=). If storage credentials are available
   * it also hosts the tiny .torrent so the webseed can bootstrap P2P (xs=);
   * otherwise it returns a ws=-only magnet. Any failure throws (coded) so the
   * caller degrades to URL-only.
   *
   * @returns {Promise<{ infoHash, magnet, torrentUrl, torrentFile, name, hasValidInfoHash }>}
   */
  async deriveTorrentForExternalUrl(
    url,
    { provider, credentials, onProgress, maxBytes = DEFAULT_EXTERNAL_URL_HASH_MAX_BYTES } = {},
  ) {
    const emit = (fraction, label) => {
      if (typeof onProgress === "function") onProgress({ fraction, label });
    };

    emit(0, "Fetching the file to compute its hash…");
    const derived = await deriveExternalUrlTorrent(url, {
      maxBytes,
      onProgress: ({ received, total }) => {
        emit(total ? Math.min(1, received / total) : null, "Computing torrent hash…");
      },
    });

    const result = {
      infoHash: derived.infoHash,
      magnet: derived.magnet,
      torrentUrl: "",
      torrentFile: derived.torrentFile,
      name: derived.name,
      hasValidInfoHash: Boolean(derived.infoHash),
    };

    // Host the tiny .torrent (metadata) so the webseed can actually bootstrap P2P.
    // Requires storage; best-effort — a failure keeps the ws=-only magnet.
    const effectiveProvider =
      credentials?.provider || credentials?.meta?.provider || provider;
    const npub = this.safeEncodeNpub(this.getCurrentPubkey());
    if (credentials && effectiveProvider && derived.torrentFile && npub) {
      try {
        const service = this.serviceFor(effectiveProvider);
        const { settings, bucketEntry } = await service.prepareUpload(npub, {
          credentials,
        });
        const torrentKey = `${npub}/external/${derived.infoHash}.torrent`;
        const torrentPublicUrl = this.publicUrlFor(
          effectiveProvider,
          bucketEntry.publicBaseUrl,
          torrentKey,
        );
        emit(null, "Hosting torrent metadata…");
        await service.uploadFile({
          file: derived.torrentFile,
          bucket: bucketEntry.bucket,
          key: torrentKey,
          accountId: settings.accountId,
          endpoint: settings.endpoint,
          provider: settings.provider || effectiveProvider || "cloudflare_r2",
          region: settings.region,
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
          forcePathStyle: settings.forcePathStyle,
          createBucketIfMissing: true,
        });
        result.torrentUrl = torrentPublicUrl;
        result.magnet = buildWebseedMagnet({
          infoHash: derived.infoHash,
          url,
          name: derived.name,
          torrentUrl: torrentPublicUrl,
        });
      } catch (torrentHostError) {
        userLogger.warn(
          "[mediaUploader] Could not host .torrent for external URL; publishing ws=-only:",
          torrentHostError,
        );
      }
    }

    emit(1, "Ready to publish!");
    return result;
  }
}

export { isR2Provider, isBlossomProvider, normalizeInfoHash, isValidInfoHash };
