// Blossom (nostr-native blob storage) upload service.
//
// Owns the Blossom upload orchestration so mediaUploader stays thin and this
// logic is unit-testable without pulling WebTorrent. Implements the same result
// shape as the S3/R2 path (see js/ui/components/mediaUploader.js) so a
// `provider === "blossom"` connection flows through publish unchanged. Auth is a
// signed kind-24242 nostr event (BUD-11) from bitvid's existing signer — no
// access keys. Uploads mirror to multiple servers for resilience (BUD-04).
// See docs/blossom-plan.md / TODO #30.
import { FEATURE_BLOSSOM_STORAGE } from "../constants.js";
import { buildStoragePointerValue } from "../utils/storagePointer.js";

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
    const { multiServerUpload, createUploadAuth } = sdk;
    if (
      typeof multiServerUpload !== "function" ||
      typeof createUploadAuth !== "function"
    ) {
      throw new Error("Blossom SDK is missing expected exports.");
    }

    // One auth per action, scoped to the blob's sha256; the SDK reuses it across
    // the mirror set so a multi-server upload isn't N signer prompts.
    const results = await multiServerUpload(serverList, file, {
      onAuth: (server, sha256) => createUploadAuth(signer, sha256, { type }),
      onProgress: typeof onProgress === "function" ? onProgress : undefined,
    });

    const descriptors = Array.from(results?.values?.() || []);
    const primary =
      descriptors.find((d) => typeof d?.url === "string" && d.url) || null;
    if (!primary) {
      throw new Error("Blossom upload did not return a usable blob URL.");
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
   */
  async uploadVideo({ file, servers, signer, generateTorrent, onProgress } = {}) {
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
      const torrentUploaded = await this.uploadFile({
        file: torrent.torrentFile,
        servers: serverList,
        signer,
        type: "upload",
      });
      const name = typeof file?.name === "string" ? file.name : "video";
      result.infoHash = torrent.infoHash;
      result.magnet = `magnet:?xt=urn:btih:${torrent.infoHash}&dn=${encodeURIComponent(
        name,
      )}&ws=${encodeURIComponent(videoPublicUrl)}&xs=${encodeURIComponent(
        torrentUploaded.url,
      )}`;
      result.torrentUrl = torrentUploaded.url;
      result.torrentFile = torrent.torrentFile;
      result.hasValidInfoHash = true;
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
