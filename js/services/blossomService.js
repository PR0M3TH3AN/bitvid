// Blossom (nostr-native blob storage) upload service — Phase 0 skeleton.
//
// Implements the same `uploadFile({…}) → { url, key, … }` contract as
// s3UploadService / r2Service (see js/ui/components/mediaUploader.js), so a later
// `isBlossomProvider` branch can route to it with no change downstream. Auth is a
// signed kind-24242 nostr event (BUD-11) built from bitvid's existing signer — no
// access keys. Uploads mirror to multiple servers for resilience (BUD-04).
//
// Phase 0: the vendored SDK loader, availability gate, and the core upload path
// exist but nothing is wired into mediaUploader yet, and the flag is off by
// default. Phase 1 completes torrent parity (magnet/infoHash), the result-shape
// mapping, and the mediaUploader routing + Storage-pane config. See
// docs/blossom-plan.md.
import { FEATURE_BLOSSOM_STORAGE } from "../constants.js";
import { userLogger } from "../utils/logger.js";

// Vendored, pinned blossom-client-sdk bundle (scripts/build-blossom-sdk.mjs).
// Lazy-imported so its (small) weight never touches the main bundle.
const BLOSSOM_SDK_BUNDLE_URL = "../../vendor/blossom-client-sdk.bundle.min.js";

function normalizeServerList(servers) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(servers) ? servers : []) {
    const url = typeof entry === "string" ? entry.trim() : "";
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(url);
  }
  return out;
}

export class BlossomService {
  constructor(deps = {}) {
    this.deps = deps;
    this._sdkPromise = null;
  }

  // On/off gate — off ⇒ the SDK is never imported and callers should not route
  // uploads here.
  isAvailable() {
    return FEATURE_BLOSSOM_STORAGE === true;
  }

  // Lazy-load the vendored SDK once.
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
   * Upload a file to one or more Blossom servers, mirroring for resilience.
   *
   * @param {object} params
   * @param {File|Blob} params.file - the blob to upload.
   * @param {string[]} params.servers - Blossom server base URLs (first = primary).
   * @param {(draft: object) => Promise<object>} params.signer - bitvid's active
   *   signer (BUD-11 kind-24242 auth). Same shape the app already uses.
   * @param {string} [params.type] - the auth `t` verb (default "upload").
   * @param {(pct:number)=>void} [params.onProgress]
   * @returns {Promise<{ url: string, key: string, servers: string[], descriptors: object[] }>}
   *
   * NOTE (Phase 1): torrent parity (magnet/infoHash), storagePointer, and the full
   * mediaUploader result shape are added when this is wired into the upload flow.
   */
  async uploadFile({ file, servers, signer, type = "upload", onProgress } = {}) {
    if (!file) {
      throw new Error("Blossom upload requires a file.");
    }
    const serverList = normalizeServerList(servers);
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
      onAuth: (server, sha256) =>
        createUploadAuth(signer, sha256, { type }),
      onProgress:
        typeof onProgress === "function" ? onProgress : undefined,
    });

    // results: Map<serverUrl, BlobDescriptor{ url, sha256, size, type, … }>
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
}

const blossomService = new BlossomService();

export default blossomService;
