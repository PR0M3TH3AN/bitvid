// Derive a webseed magnet from an external URL (external-URL P2P). We fetch the
// remote file (best-effort, CORS-permitting), stream it under a hard size cap,
// compute the infoHash, and build a ws= magnet. Any failure must degrade to
// URL-only (the caller catches).
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-external-url-torrent
//       given: "a remote URL + an injected fetch/hash"
//       when: "deriveExternalUrlTorrent / fetchBlobWithCap / buildWebseedMagnet run"
//       then: "magnet carries the infoHash + ws=url; oversize/fetch failures throw coded errors"
//   observable_outcomes:
//     - "buildWebseedMagnet: xt/dn/ws present; xs only when torrentUrl given; empty on missing infoHash/url"
//     - "deriveNameFromUrl extracts + decodes the filename"
//     - "fetchBlobWithCap streams under the cap and aborts past it (code too-large)"
//     - "content-length over cap short-circuits before downloading"
//     - "non-ok response -> fetch-failed"
//     - "deriveExternalUrlTorrent returns { infoHash, magnet(ws=url) } via injected hash"
//   determinism_controls:
//     - "injected fetchImpl (fake Response) + createMetadata stub + fileFactory; no network/WebTorrent"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  buildWebseedMagnet,
  deriveNameFromUrl,
  fetchBlobWithCap,
  deriveExternalUrlTorrent,
} from "../js/utils/externalUrlTorrent.js";

function streamResponse(bytes, { contentLength, contentType = "video/mp4", ok = true, status = 200, chunkSize = 4 } = {}) {
  const headers = new Map();
  if (contentLength !== null) {
    headers.set("content-length", String(contentLength ?? bytes.length));
  }
  if (contentType) headers.set("content-type", contentType);
  let offset = 0;
  return {
    ok,
    status,
    headers: { get: (k) => headers.get(k.toLowerCase()) ?? null },
    body: {
      getReader() {
        return {
          async read() {
            if (offset >= bytes.length) return { done: true, value: undefined };
            const end = Math.min(offset + chunkSize, bytes.length);
            const value = bytes.slice(offset, end);
            offset = end;
            return { done: false, value };
          },
          async cancel() {},
        };
      },
    },
  };
}

test("buildWebseedMagnet: xt/dn/ws, xs only when torrentUrl is given", () => {
  const m = buildWebseedMagnet({ infoHash: "abc123", url: "https://h/v.mp4", name: "v.mp4" });
  assert.match(m, /^magnet:\?xt=urn:btih:abc123&dn=v\.mp4&ws=https%3A%2F%2Fh%2Fv\.mp4$/);
  const withXs = buildWebseedMagnet({ infoHash: "abc", url: "https://h/v.mp4", torrentUrl: "https://h/v.torrent" });
  assert.match(withXs, /&xs=https%3A%2F%2Fh%2Fv\.torrent$/);
});

test("buildWebseedMagnet: empty when infoHash or url is missing", () => {
  assert.equal(buildWebseedMagnet({ url: "https://h/v.mp4" }), "");
  assert.equal(buildWebseedMagnet({ infoHash: "abc" }), "");
  assert.equal(buildWebseedMagnet({}), "");
});

test("deriveNameFromUrl extracts + decodes the filename", () => {
  assert.equal(deriveNameFromUrl("https://h/path/My%20Clip.mp4"), "My Clip.mp4");
  assert.equal(deriveNameFromUrl("https://h/path/"), "");
  assert.equal(deriveNameFromUrl("not a url"), "");
});

test("fetchBlobWithCap streams the whole body under the cap", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const progress = [];
  const blob = await fetchBlobWithCap("https://h/v.mp4", {
    maxBytes: 1000,
    onProgress: (p) => progress.push(p.received),
    fetchImpl: async () => streamResponse(bytes, { chunkSize: 4 }),
  });
  assert.equal(blob.size, 10);
  assert.deepEqual(progress, [4, 8, 10]);
});

test("fetchBlobWithCap aborts a stream that exceeds the cap (too-large)", async () => {
  const bytes = new Uint8Array(20);
  await assert.rejects(
    () =>
      fetchBlobWithCap("https://h/v.mp4", {
        maxBytes: 8,
        // no content-length header → only the streaming guard can catch it
        fetchImpl: async () => streamResponse(bytes, { contentLength: null, chunkSize: 4 }),
      }),
    (err) => err.code === "too-large",
  );
});

test("fetchBlobWithCap short-circuits on content-length over the cap (no download)", async () => {
  let readerMade = false;
  await assert.rejects(
    () =>
      fetchBlobWithCap("https://h/big.mp4", {
        maxBytes: 100,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: (k) => (k.toLowerCase() === "content-length" ? "999999" : null) },
          body: { getReader() { readerMade = true; return { read: async () => ({ done: true }) }; } },
        }),
      }),
    (err) => err.code === "too-large" && err.total === 999999,
  );
  assert.equal(readerMade, false, "must not start reading the body when the size is known-too-big");
});

test("fetchBlobWithCap: non-ok response -> fetch-failed", async () => {
  await assert.rejects(
    () => fetchBlobWithCap("https://h/404", { fetchImpl: async () => ({ ok: false, status: 403, headers: { get: () => null } }) }),
    (err) => err.code === "fetch-failed" && err.status === 403,
  );
});

test("deriveExternalUrlTorrent returns infoHash + ws= magnet via the injected hasher", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const seen = { fileName: null, urlList: null };
  const result = await deriveExternalUrlTorrent("https://host/clips/My%20Clip.mp4", {
    maxBytes: 1000,
    fetchImpl: async () => streamResponse(bytes),
    fileFactory: (blob, name) => ({ blob, name }),
    createMetadata: async (file, urlList) => {
      seen.fileName = file.name;
      seen.urlList = urlList;
      return { infoHash: "deadbeef", torrentFile: new Uint8Array([9]) };
    },
  });
  assert.equal(result.infoHash, "deadbeef");
  assert.equal(seen.fileName, "My Clip.mp4", "file name derived from the URL");
  assert.deepEqual(seen.urlList, ["https://host/clips/My%20Clip.mp4"], "url passed as the webseed");
  assert.match(result.magnet, /xt=urn:btih:deadbeef/);
  assert.match(result.magnet, /ws=https%3A%2F%2Fhost%2Fclips%2FMy%2520Clip\.mp4/);
  assert.ok(result.torrentFile, "torrentFile returned for optional .torrent hosting");
});

test("deriveExternalUrlTorrent propagates a fetch failure (caller degrades to URL-only)", async () => {
  await assert.rejects(
    () =>
      deriveExternalUrlTorrent("https://host/blocked.mp4", {
        fetchImpl: async () => ({ ok: false, status: 0, headers: { get: () => null } }),
        createMetadata: async () => ({ infoHash: "x" }),
      }),
    (err) => err.code === "fetch-failed",
  );
});
