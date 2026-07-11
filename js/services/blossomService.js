// Blossom (nostr-native blob storage) upload service.
//
// Owns the Blossom upload orchestration so mediaUploader stays thin and this
// logic is unit-testable without pulling WebTorrent. Implements the same result
// shape as the S3/R2 path (see js/ui/components/mediaUploader.js) so a
// `provider === "blossom"` connection flows through publish unchanged. Auth is a
// signed kind-24242 nostr event (BUD-11) from bitvid's existing signer — no
// access keys. Uploads mirror to multiple servers for resilience (BUD-04).
// See docs/blossom-plan.md / TODO #30.
import {
  FEATURE_BLOSSOM_STORAGE,
  BLOSSOM_TORRENT_METADATA_MAX_BASE64,
} from "../constants.js";
import { buildStoragePointerValue } from "../utils/storagePointer.js";
import { devLogger } from "../utils/logger.js";

// base64 of a File/Blob's bytes (browser + Node 20+). Used to embed the
// .torrent piece-map in the companion event. See docs/blossom-torrent-metadata-plan.md.
async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Vendored, pinned blossom-client-sdk bundle (scripts/build-blossom-sdk.mjs).
// Lazy-imported so its (small) weight never touches the main bundle.
const BLOSSOM_SDK_BUNDLE_URL = "../../vendor/blossom-client-sdk.bundle.min.js";

export const BLOSSOM_PROVIDER = "blossom";

export function isBlossomProvider(provider) {
  return provider === BLOSSOM_PROVIDER;
}

// Extract a clean, de-duped server-URL list from a connection's credentials
// (servers live in the plaintext connection meta — they are public, not secret).
export function resolveBlossomServers(credentials) {
  const source = credentials || {};
  const raw = Array.isArray(source.servers)
    ? source.servers
    : Array.isArray(source.meta?.servers)
      ? source.meta.servers
      : [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const url = typeof entry === "string" ? entry.trim() : "";
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

// Common media extensions → MIME type. Browsers leave File.type empty for some
// containers (.m4v/.mkv) and for files dragged in without an OS MIME mapping.
// The Blossom SDK uploads `body: file` with no explicit Content-Type, so an empty
// File.type means the PUT declares no type — and a type-allowlisting server (e.g.
// blossom.band) then answers 415. We re-declare the type from the filename.
const MIME_BY_EXTENSION = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  opus: "audio/opus",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  weba: "audio/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  torrent: "application/x-bittorrent",
};

function inferMimeFromName(name) {
  const ext =
    typeof name === "string" ? name.split(".").pop()?.toLowerCase() : "";
  return (ext && MIME_BY_EXTENSION[ext]) || "";
}

// Types we should never trust for a media upload — a recognized extension wins
// over these. Browsers report "" for some containers, and apps/WebTorrent often
// stamp "application/octet-stream" on media files; strict Blossom servers reject
// both with 415/400 even though they accept the real type (e.g. video/mp4).
const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

// Guarantee the blob carries a correct Content-Type. When the filename has a
// recognized media extension, trust it over an empty or generic browser type and
// re-wrap the blob with the inferred type (bytes are unchanged, so the sha256 is
// too). A specific, non-generic browser type is left as-is.
export function ensureTypedFile(file) {
  if (!file || typeof File === "undefined") {
    return file;
  }
  const name = typeof file.name === "string" ? file.name : "upload";
  const inferred = inferMimeFromName(name);
  const current = typeof file.type === "string" ? file.type : "";
  // Nothing to infer, or the browser already declares the exact inferred type.
  if (!inferred || current === inferred) {
    return file;
  }
  // Keep a specific, non-generic browser type; only override empty/generic ones.
  if (current && !GENERIC_TYPES.has(current)) {
    return file;
  }
  try {
    return new File([file], name, { type: inferred });
  } catch {
    return file;
  }
}

export class BlossomService {
  constructor(deps = {}) {
    this.deps = deps;
    this._sdkPromise = null;
  }

  // On/off gate — off ⇒ the SDK is never imported.
  isAvailable() {
    return FEATURE_BLOSSOM_STORAGE === true;
  }

  async loadSdk() {
    if (this._sdkPromise) {
      return this._sdkPromise;
    }
    this._sdkPromise = import(BLOSSOM_SDK_BUNDLE_URL).catch((error) => {
      this._sdkPromise = null;
      throw error;
    });
    return this._sdkPromise;
  }

  /**
   * Upload a single blob to one or more Blossom servers (mirrored). Returns the
   * primary blob descriptor's `url` (`<server>/<sha256>`) and `key` (sha256).
   */
  async uploadFile({ file, servers, signer, type = "upload", onProgress } = {}) {
    if (!file) {
      throw new Error("Blossom upload requires a file.");
    }
    const serverList = resolveBlossomServers({ servers });
    if (serverList.length === 0) {
      throw new Error("Blossom upload requires at least one server URL.");
    }
    if (typeof signer !== "function") {
      throw new Error("Blossom upload requires a signer (a signed-event function).");
    }

    const sdk = await this.loadSdk();
    const { uploadBlob, createUploadAuth } = sdk;
    if (
      typeof uploadBlob !== "function" ||
      typeof createUploadAuth !== "function"
    ) {
      throw new Error("Blossom SDK is missing expected exports.");
    }

    // Ensure the blob declares a Content-Type — an empty File.type otherwise
    // uploads as a typeless PUT and strict servers reject it with 415.
    const typedFile = ensureTypedFile(file);

    // Surface exactly what we're about to send so a 415 is never a guess:
    // the effective Content-Type (from typedFile.type), original type, name, size.
    devLogger.log(
      `[Blossom] uploading "${typeof typedFile?.name === "string" ? typedFile.name : "(no name)"}" — ` +
        `sending Content-Type="${typedFile?.type || "(empty)"}" ` +
        `(original File.type="${file?.type || "(empty)"}", ${typedFile?.size ?? "?"} bytes) ` +
        `to ${serverList.length} server(s): ${serverList.join(", ")}`,
    );

    // Upload DIRECTLY to each server (BUD-02 `PUT /upload`), in parallel, rather
    // than the SDK's upload-one-then-`/mirror` flow — the server-to-server mirror
    // step fails from a browser (CORS) on many servers. A fresh signed upload auth
    // (BUD-11, scoped to the blob's sha256) is created per request.
    const onAuth = (server, sha256) =>
      createUploadAuth(signer, sha256, { type });
    const settled = await Promise.allSettled(
      serverList.map((server) =>
        uploadBlob(server, typedFile, {
          onAuth,
          onProgress: typeof onProgress === "function" ? onProgress : undefined,
        }),
      ),
    );

    const descriptors = [];
    const failures = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value && typeof r.value.url === "string") {
        descriptors.push(r.value);
      } else {
        const reason = r.reason;
        // The SDK's HTTPError carries `.status`; surface it so 415 (media type)
        // vs 413 (too large) vs 402 (payment) is unambiguous in the message.
        const status =
          reason && typeof reason.status === "number"
            ? `HTTP ${reason.status}: `
            : "";
        const message = reason?.message || reason || "no blob URL returned";
        failures.push(`${serverList[i]}: ${status}${message}`);
      }
    });

    const primary = descriptors.find((d) => typeof d?.url === "string" && d.url);
    if (!primary) {
      throw new Error(
        `Blossom upload failed on all server(s) — ${failures.join("; ")}. ` +
          `Common causes: the file exceeds the server's size limit (blossom.band ` +
          `caps free uploads at 20 MiB), the server rejects the media type, blocks ` +
          `browser uploads (CORS), or requires payment/allowlisting.`,
      );
    }

    return {
      url: primary.url,
      key: primary.sha256 || "",
      servers: serverList,
      descriptors,
    };
  }

  /**
   * Full video upload: the blob, then (if `generateTorrent` yields one) the
   * `.torrent` as a second blob, wired into a magnet (ws = the Blossom video URL,
   * xs = the Blossom .torrent URL). Returns the same shape mediaUploader's S3 path
   * returns so publish is untouched. `generateTorrent` is injected by the caller
   * so this module never imports WebTorrent (keeps it unit-testable).
   *
   * @param {object} params
   * @param {File|Blob} params.file
   * @param {string[]} params.servers
   * @param {(draft:object)=>Promise<object>} params.signer
   * @param {(args:{file:File,videoPublicUrl:string})=>Promise<{hasValidInfoHash:boolean,infoHash?:string,torrentFile?:File}>} [params.generateTorrent]
   * @param {(fraction:number)=>void} [params.onProgress]
   * @param {(args:{infoHash:string,torrentBase64:string})=>Promise<void>} [params.publishTorrentMetadata]
   *   Publishes the torrent piece-map as a companion Nostr event (Tier 2). When
   *   provided and `FEATURE_BLOSSOM_TORRENT_METADATA` is on and the `.torrent`
   *   couldn't be hosted (no `xs=`), a successful publish yields a `ws=`-only magnet
   *   bitvid can bootstrap. Any failure / over-cap ⇒ URL-only.
   */
  async uploadVideo({
    file,
    servers,
    signer,
    generateTorrent,
    onProgress,
    publishTorrentMetadata,
  } = {}) {
    const serverList = resolveBlossomServers({ servers });
    if (serverList.length === 0) {
      throw new Error("No Blossom servers configured for this connection.");
    }

    const uploaded = await this.uploadFile({
      file,
      servers: serverList,
      signer,
      type: "upload",
      onProgress,
    });
    const videoPublicUrl = uploaded.url; // <server>/<sha256>

    const result = {
      url: videoPublicUrl,
      key: uploaded.key,
      storagePointer: buildStoragePointerValue({
        provider: BLOSSOM_PROVIDER,
        prefix: serverList[0], // where the blob lives, for later delete/list (BUD-12)
      }),
      infoHash: "",
      magnet: "",
      torrentUrl: "",
      torrentFile: null,
      hasValidInfoHash: false,
    };

    let torrent = null;
    if (typeof generateTorrent === "function") {
      torrent = await generateTorrent({ file, videoPublicUrl });
    }

    if (torrent?.hasValidInfoHash && torrent.torrentFile) {
      const name = typeof file?.name === "string" ? file.name : "video";
      // Retain the generated .torrent locally so a future/other storage target
      // could host it — but don't advertise a magnet yet (see below).
      result.torrentFile = torrent.torrentFile;

      // Try to host the .torrent alongside the video so the magnet carries xs=
      // (the metadata source WebTorrent needs to start). Best-effort: most Blossom
      // servers accept media types only and reject a .torrent (415). Only when the
      // .torrent is actually hosted do we publish a magnet — a webseed-only magnet
      // (no xs=) can't bootstrap WebTorrent and would be a dead share link, so we
      // publish URL-only instead. Servers that DO accept .torrent (self-hosted or
      // paid) automatically yield a full, P2P-playable magnet with no other change.
      let torrentUrl = "";
      try {
        const torrentUploaded = await this.uploadFile({
          file: torrent.torrentFile,
          servers: serverList,
          signer,
          type: "upload",
        });
        torrentUrl = torrentUploaded.url;
      } catch (error) {
        devLogger.warn(
          `[Blossom] Video uploaded. The .torrent sidecar wasn't hosted ` +
            `(Blossom servers accept media only); publishing URL-only — a ` +
            `webseed-only magnet can't bootstrap WebTorrent.`,
        );
      }

      const wsMagnet = () =>
        `magnet:?xt=urn:btih:${torrent.infoHash}&dn=${encodeURIComponent(name)}` +
        `&ws=${encodeURIComponent(videoPublicUrl)}`;

      if (torrentUrl) {
        // Tier 1 — the .torrent is hosted (xs=): a full magnet, playable in any
        // torrent client.
        result.infoHash = torrent.infoHash;
        result.torrentUrl = torrentUrl;
        result.magnet = `${wsMagnet()}&xs=${encodeURIComponent(torrentUrl)}`;
        result.hasValidInfoHash = true;
      } else if (typeof publishTorrentMetadata === "function") {
        // Tier 2 — publish the piece-map as a companion Nostr event (D3/D4) so
        // bitvid can bootstrap WebTorrent from the infohash without a hosted
        // .torrent. The publisher is only wired when FEATURE_BLOSSOM_TORRENT_METADATA
        // is on (that flag gate lives at the mediaUploader seam), so its presence
        // IS the gate here. Gate on the exact encoded size (off the feed, but a
        // guard); over cap or a failed publish falls through to URL-only.
        try {
          const torrentBase64 = await fileToBase64(torrent.torrentFile);
          if (torrentBase64.length > BLOSSOM_TORRENT_METADATA_MAX_BASE64) {
            devLogger.warn(
              `[Blossom] Video uploaded. Torrent piece-map is ${torrentBase64.length} ` +
                `base64 bytes (> ${BLOSSOM_TORRENT_METADATA_MAX_BASE64}); publishing ` +
                `URL-only.`,
            );
          } else {
            await publishTorrentMetadata({
              infoHash: torrent.infoHash,
              torrentBase64,
            });
            result.infoHash = torrent.infoHash;
            result.magnet = wsMagnet(); // ws= only; metadata is on Nostr
            result.hasValidInfoHash = true;
          }
        } catch (error) {
          devLogger.warn(
            `[Blossom] Video uploaded, but publishing the torrent metadata ` +
              `companion failed; publishing URL-only. Reason: ${
                error?.message || error
              }`,
          );
        }
      }
      // else: URL-only (flag off / no publisher wired) — video already succeeded.
    }

    return result;
  }

  /**
   * Delete a blob from one Blossom server (BUD-12 `DELETE /<sha256>`), authorized
   * by a signed kind-24242 delete auth (BUD-11). Returns true on success.
   */
  async deleteFile({ server, sha256, signer } = {}) {
    const url = typeof server === "string" ? server.trim() : "";
    const hash = typeof sha256 === "string" ? sha256.trim() : "";
    if (!url || !hash) {
      throw new Error("Blossom delete requires a server and a sha256.");
    }
    if (typeof signer !== "function") {
      throw new Error("Blossom delete requires a signer.");
    }
    const sdk = await this.loadSdk();
    const { deleteBlob, createDeleteAuth } = sdk;
    if (
      typeof deleteBlob !== "function" ||
      typeof createDeleteAuth !== "function"
    ) {
      throw new Error("Blossom SDK is missing delete exports.");
    }
    return deleteBlob(url, hash, {
      onAuth: () => createDeleteAuth(signer, hash),
    });
  }

  /**
   * List a user's blobs on a Blossom server (BUD-12 `GET /list/<pubkey>`). Some
   * servers require a signed list auth; provide the signer to cover those.
   * Returns the array of blob descriptors.
   */
  async listFiles({ server, pubkey, signer } = {}) {
    const url = typeof server === "string" ? server.trim() : "";
    const pk = typeof pubkey === "string" ? pubkey.trim() : "";
    if (!url || !pk) {
      throw new Error("Blossom list requires a server and a pubkey.");
    }
    const sdk = await this.loadSdk();
    const { listBlobs, createListAuth } = sdk;
    if (typeof listBlobs !== "function") {
      throw new Error("Blossom SDK is missing list exports.");
    }
    const opts =
      typeof signer === "function" && typeof createListAuth === "function"
        ? { onAuth: () => createListAuth(signer) }
        : {};
    return listBlobs(url, pk, opts);
  }
}

const blossomService = new BlossomService();

export default blossomService;
