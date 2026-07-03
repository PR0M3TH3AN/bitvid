// Derive a WebTorrent webseed magnet from an externally-hosted video URL (TODO
// #45-adjacent / external-URL P2P). Posting a plain URL skips the torrent/webseed
// benefit; here we (best-effort) fetch the remote file, compute its infoHash, and
// build a magnet with the URL as the webseed (ws=). Fully optional: any failure
// (CORS, over the size cap, network) leaves the caller to fall back to URL-only.
//
// Constraints baked in:
//   - CORS: fetch()-ing the remote requires the host to allow it (same requirement
//     as webseed playback), so callers must treat failure as "URL-only".
//   - Whole-file download: an infoHash requires reading every byte, so we stream
//     with a hard size cap and abort past it (never buffer an unbounded download).

import { createTorrentMetadata as defaultCreateTorrentMetadata } from "./torrentHash.js";

export const DEFAULT_EXTERNAL_URL_HASH_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export function deriveNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    // A path ending in "/" has no filename.
    if (parsed.pathname.endsWith("/")) {
      return "";
    }
    const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const decoded = decodeURIComponent(last);
    return decoded && /\S/.test(decoded) ? decoded : "";
  } catch (error) {
    return "";
  }
}

// magnet:?xt=urn:btih:<infoHash>&dn=<name>&ws=<url>[&xs=<torrentUrl>]
export function buildWebseedMagnet({ infoHash, url, name, torrentUrl } = {}) {
  const hash = typeof infoHash === "string" ? infoHash.trim() : "";
  const webseed = typeof url === "string" ? url.trim() : "";
  if (!hash || !webseed) {
    return "";
  }
  const dn = encodeURIComponent(name || deriveNameFromUrl(webseed) || "video");
  let magnet = `magnet:?xt=urn:btih:${hash}&dn=${dn}&ws=${encodeURIComponent(webseed)}`;
  if (typeof torrentUrl === "string" && torrentUrl.trim()) {
    magnet += `&xs=${encodeURIComponent(torrentUrl.trim())}`;
  }
  return magnet;
}

// Fetch a URL into a Blob, streaming with a hard byte cap. Throws a coded error
// on any failure so the caller can distinguish + degrade:
//   fetch-failed | too-large | (network error from fetchImpl)
export async function fetchBlobWithCap(
  url,
  {
    maxBytes = DEFAULT_EXTERNAL_URL_HASH_MAX_BYTES,
    onProgress,
    fetchImpl = typeof fetch === "function" ? fetch : null,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    const error = new Error("fetch is unavailable in this environment.");
    error.code = "fetch-unavailable";
    throw error;
  }

  const response = await fetchImpl(url);
  if (!response || !response.ok) {
    const error = new Error(
      `Could not fetch the URL (${response?.status ?? "no response"}).`,
    );
    error.code = "fetch-failed";
    error.status = response?.status;
    throw error;
  }

  const declaredTotal = Number(response.headers?.get?.("content-length")) || 0;
  if (declaredTotal && declaredTotal > maxBytes) {
    const error = new Error("The file is larger than the size cap.");
    error.code = "too-large";
    error.total = declaredTotal;
    throw error;
  }

  const contentType = response.headers?.get?.("content-type") || "";

  // Prefer streaming so we can abort a too-large download mid-flight.
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        try {
          await reader.cancel();
        } catch (cancelError) {
          // ignore cancel failures
        }
        const error = new Error("The file is larger than the size cap.");
        error.code = "too-large";
        error.total = declaredTotal || received;
        throw error;
      }
      chunks.push(value);
      if (typeof onProgress === "function") {
        onProgress({ received, total: declaredTotal });
      }
    }
    return new Blob(chunks, contentType ? { type: contentType } : undefined);
  }

  // No streaming body: fall back to blob() and enforce the cap after the fact.
  const blob = await response.blob();
  if (blob.size > maxBytes) {
    const error = new Error("The file is larger than the size cap.");
    error.code = "too-large";
    error.total = blob.size;
    throw error;
  }
  return blob;
}

// Best-effort: fetch + hash a remote URL and return { infoHash, magnet, torrentFile,
// name }. Throws (coded) on CORS/size/network failure — the caller degrades to
// URL-only. `createMetadata` + `fileFactory` are injectable for tests.
export async function deriveExternalUrlTorrent(
  url,
  {
    maxBytes = DEFAULT_EXTERNAL_URL_HASH_MAX_BYTES,
    onProgress,
    fetchImpl,
    createMetadata = defaultCreateTorrentMetadata,
    fileFactory,
  } = {},
) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) {
    const error = new Error("A URL is required.");
    error.code = "no-url";
    throw error;
  }

  const blob = await fetchBlobWithCap(trimmed, { maxBytes, onProgress, fetchImpl });
  const name = deriveNameFromUrl(trimmed) || "video";
  const file =
    typeof fileFactory === "function"
      ? fileFactory(blob, name)
      : new File([blob], name, blob.type ? { type: blob.type } : undefined);

  const metadata = await createMetadata(file, [trimmed]);
  const infoHash = typeof metadata?.infoHash === "string" ? metadata.infoHash : "";
  if (!infoHash) {
    const error = new Error("Failed to compute the torrent info hash.");
    error.code = "hash-failed";
    throw error;
  }

  return {
    infoHash,
    name,
    torrentFile: metadata?.torrentFile || null,
    magnet: buildWebseedMagnet({ infoHash, url: trimmed, name }),
  };
}
