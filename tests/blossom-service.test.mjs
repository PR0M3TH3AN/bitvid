// blossomService tests (Node-safe — no WebTorrent). Covers the availability gate,
// server-list resolution, input guards, and the uploadVideo orchestration (blob +
// injected torrent → magnet + storagePointer). The vendored SDK is mocked via
// loadSdk; real-server round-trips are exercised in-browser. See docs/blossom-plan.md.
import test from "node:test";
import assert from "node:assert/strict";

import blossomService, {
  BlossomService,
  BLOSSOM_PROVIDER,
  isBlossomProvider,
  resolveBlossomServers,
  blobSha256FromUrl,
  serversFromServerListEvent,
} from "../js/services/blossomService.js";
import { FEATURE_BLOSSOM_STORAGE } from "../js/constants.js";

const SHA = "a".repeat(64);
const signer = async (draft) => ({ ...draft, id: "id", sig: "sig", pubkey: "pk" });

// A BlossomService whose SDK is mocked: uploadBlob uploads directly to each
// server (BUD-02 /upload) and returns a descriptor, echoing the blob so we can
// assert which servers were hit. `failServers` simulates per-server failures.
function mockService({ failServers = [] } = {}) {
  const uploads = [];
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async (s, sha256, opts) => ({ kind: 24242, sha256, opts }),
    uploadBlob: async (server, file, opts) => {
      // Give each blob a distinct sha256 so video vs .torrent URLs differ.
      const sha = file?.name?.includes(".torrent") ? "b".repeat(64) : SHA;
      if (typeof opts?.onAuth === "function") {
        await opts.onAuth(server, sha, "upload", file);
      }
      uploads.push({ server, file });
      if (failServers.includes(server)) {
        throw new Error("CORS blocked");
      }
      return { url: `${server}/${sha}`, sha256: sha, size: 1, type: "x" };
    },
  });
  return { svc, uploads };
}

test("isBlossomProvider / BLOSSOM_PROVIDER only match 'blossom'", () => {
  assert.equal(BLOSSOM_PROVIDER, "blossom");
  assert.equal(isBlossomProvider("blossom"), true);
  assert.equal(isBlossomProvider("cloudflare_r2"), false);
});

test("isAvailable reflects the FEATURE_BLOSSOM_STORAGE flag", () => {
  assert.equal(blossomService.isAvailable(), FEATURE_BLOSSOM_STORAGE === true);
});

test("resolveBlossomServers de-dupes, trims, and reads meta.servers", () => {
  assert.deepEqual(
    resolveBlossomServers({ servers: [" https://a ", "https://a", "https://b", "", " "] }),
    ["https://a", "https://b"],
  );
  assert.deepEqual(resolveBlossomServers({ meta: { servers: ["https://c"] } }), ["https://c"]);
  assert.deepEqual(resolveBlossomServers({}), []);
});

test("uploadFile guards: file, servers, signer required", async () => {
  const { svc } = mockService();
  await assert.rejects(() => svc.uploadFile({ servers: ["https://s"], signer }), /requires a file/);
  await assert.rejects(
    () => svc.uploadFile({ file: new Blob(["x"]), servers: [], signer }),
    /at least one server/,
  );
  await assert.rejects(
    () => svc.uploadFile({ file: new Blob(["x"]), servers: ["https://s"], signer: null }),
    /requires a signer/,
  );
});

test("uploadFile uploads directly to every server and returns the primary url", async () => {
  const { svc, uploads } = mockService();
  const out = await svc.uploadFile({
    file: new File([new Uint8Array([1])], "v.mp4"),
    servers: ["https://a", "https://b"],
    signer,
  });
  assert.equal(out.url, `https://a/${SHA}`);
  assert.equal(out.key, SHA);
  assert.deepEqual(
    uploads.map((u) => u.server).sort(),
    ["https://a", "https://b"],
    "uploaded to both servers directly (no /mirror)",
  );
});

test("uploadFile survives partial failure — one server down, another succeeds", async () => {
  const { svc } = mockService({ failServers: ["https://a"] });
  const out = await svc.uploadFile({
    file: new File([new Uint8Array([1])], "v.mp4"),
    servers: ["https://a", "https://b"],
    signer,
  });
  assert.equal(out.url, `https://b/${SHA}`, "falls back to the working server");
});

test("uploadFile throws a descriptive error when ALL servers fail", async () => {
  const { svc } = mockService({ failServers: ["https://a", "https://b"] });
  await assert.rejects(
    () =>
      svc.uploadFile({
        file: new File([new Uint8Array([1])], "v.mp4"),
        servers: ["https://a", "https://b"],
        signer,
      }),
    /failed on all server\(s\).*CORS blocked/s,
  );
});

test("uploadFile declares a Content-Type when the File has none (avoids 415)", async () => {
  // Browsers leave File.type empty for containers like .m4v; the SDK then PUTs a
  // typeless body and strict servers answer 415. uploadFile must re-type the blob.
  const { svc, uploads } = mockService();
  const typeless = new File([new Uint8Array([1])], "clip.m4v");
  assert.equal(typeless.type, "", "precondition: the File has no MIME type");
  await svc.uploadFile({ file: typeless, servers: ["https://a"], signer });
  assert.equal(
    uploads[0].file.type,
    "video/mp4",
    "the uploaded blob was re-typed from the .m4v extension",
  );
});

test("uploadFile overrides a generic application/octet-stream type from the extension", async () => {
  // Files produced by other apps or fetched via WebTorrent often carry a generic
  // "application/octet-stream" type; strict servers reject that with 415/400 even
  // though they accept the real type. A recognized extension must win.
  const { svc, uploads } = mockService();
  const generic = new File([new Uint8Array([1])], "Fire Pit Render.mp4", {
    type: "application/octet-stream",
  });
  await svc.uploadFile({ file: generic, servers: ["https://a"], signer });
  assert.equal(
    uploads[0].file.type,
    "video/mp4",
    "generic octet-stream is replaced by video/mp4 from the .mp4 extension",
  );
});

test("uploadFile keeps a specific, correct browser type untouched", async () => {
  const { svc, uploads } = mockService();
  const good = new File([new Uint8Array([1])], "clip.mkv", { type: "video/webm" });
  await svc.uploadFile({ file: good, servers: ["https://a"], signer });
  // A specific (non-generic) browser type is trusted even if it differs from the
  // extension's inferred type — we don't second-guess a real declared type.
  assert.equal(uploads[0].file.type, "video/webm");
});

test("uploadFile surfaces the server HTTP status in the all-fail error", async () => {
  // Simulate a Blossom server rejecting the media type (415). The SDK's HTTPError
  // exposes `.status`; the thrown message must include it, not just a vague reason.
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async () => ({ kind: 24242 }),
    uploadBlob: async () => {
      const err = new Error("Something went wrong");
      err.status = 415;
      throw err;
    },
  });
  await assert.rejects(
    () =>
      svc.uploadFile({
        file: new File([new Uint8Array([1])], "v.mp4"),
        servers: ["https://a"],
        signer,
      }),
    /HTTP 415: Something went wrong/,
  );
});

test("uploadVideo without a torrent returns a blossom storagePointer and no magnet", async () => {
  const { svc } = mockService();
  const result = await svc.uploadVideo({
    file: new File([new Uint8Array([1, 2])], "clip.mp4"),
    servers: ["https://a"],
    signer,
    generateTorrent: async () => ({ hasValidInfoHash: false, torrentFile: null }),
  });
  assert.equal(result.url, `https://a/${SHA}`);
  assert.equal(result.key, SHA);
  assert.match(result.storagePointer, /blossom/);
  assert.equal(result.magnet, "");
  assert.equal(result.hasValidInfoHash, false);
});

test("uploadVideo with a torrent uploads the .torrent as a blob and builds a magnet (ws + xs)", async () => {
  const { svc, uploads } = mockService();
  const infoHash = "0".repeat(40);
  const result = await svc.uploadVideo({
    file: new File([new Uint8Array([1, 2])], "clip.mp4"),
    servers: ["https://a"],
    signer,
    generateTorrent: async ({ videoPublicUrl }) => {
      assert.equal(videoPublicUrl, `https://a/${SHA}`, "ws is the blossom video url");
      return {
        hasValidInfoHash: true,
        infoHash,
        torrentFile: new File([new Uint8Array([9])], "clip.torrent"),
      };
    },
  });
  assert.equal(uploads.length, 2, "video blob + .torrent blob");
  assert.equal(result.hasValidInfoHash, true);
  assert.equal(result.infoHash, infoHash);
  assert.match(result.magnet, new RegExp(`btih:${infoHash}`));
  assert.match(result.magnet, /ws=https%3A%2F%2Fa%2F/, "ws = blossom video url");
  assert.match(result.magnet, /xs=https%3A%2F%2Fa%2F/, "xs = blossom .torrent url");
  assert.equal(result.torrentUrl, `https://a/${"b".repeat(64)}`);
});

test("uploadVideo publishes URL-only when the .torrent sidecar is rejected (415)", async () => {
  // Spec correction: a webseed-only magnet (ws= but no xs=) can't bootstrap
  // WebTorrent — there's no metadata source — so shipping one produces a dead
  // share link. When a Blossom server rejects the .torrent (415), uploadVideo must
  // succeed with the video URL but publish NO magnet (URL-only), while retaining
  // the generated .torrent locally for other storage targets.
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async () => ({ kind: 24242 }),
    uploadBlob: async (server, file) => {
      if (file?.name?.includes(".torrent")) {
        const err = new Error("File type not allowed, unsupported");
        err.status = 415;
        throw err;
      }
      return { url: `${server}/${SHA}`, sha256: SHA, size: 1, type: "video/mp4" };
    },
  });
  const infoHash = "0".repeat(40);
  const torrentFile = new File([new Uint8Array([9])], "clip.torrent");
  const result = await svc.uploadVideo({
    file: new File([new Uint8Array([1, 2])], "clip.mp4"),
    servers: ["https://a"],
    signer,
    generateTorrent: async () => ({ hasValidInfoHash: true, infoHash, torrentFile }),
  });
  assert.equal(result.url, `https://a/${SHA}`, "video url is returned");
  assert.equal(result.magnet, "", "no magnet is published when the .torrent isn't hosted");
  assert.equal(result.torrentUrl, "", "no hosted .torrent url after rejection");
  assert.equal(result.hasValidInfoHash, false, "no usable magnet is advertised");
  assert.equal(result.torrentFile, torrentFile, "the generated .torrent is retained locally");
});

test("uploadVideo Tier 2: publishes a companion metadata event → ws=-only magnet", async () => {
  // .torrent rejected by the server (415), but a publisher is wired (flag on at the
  // mediaUploader seam): bitvid publishes the piece-map companion event and ships a
  // ws=-only magnet it can bootstrap from Nostr. No xs= (nothing hosted).
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async () => ({ kind: 24242 }),
    uploadBlob: async (server, file) => {
      if (file?.name?.includes(".torrent")) {
        const err = new Error("File type not allowed");
        err.status = 415;
        throw err;
      }
      return { url: `${server}/${SHA}`, sha256: SHA, size: 1, type: "video/mp4" };
    },
  });
  const infoHash = "0".repeat(40);
  const published = [];
  const result = await svc.uploadVideo({
    file: new File([new Uint8Array([1, 2])], "clip.mp4"),
    servers: ["https://a"],
    signer,
    generateTorrent: async () => ({
      hasValidInfoHash: true,
      infoHash,
      torrentFile: new File([new Uint8Array([9, 9, 9])], "clip.torrent"),
    }),
    publishTorrentMetadata: async (args) => published.push(args),
  });
  assert.equal(published.length, 1, "the companion was published exactly once");
  assert.equal(published[0].infoHash, infoHash);
  assert.equal(
    Buffer.from(published[0].torrentBase64, "base64").length,
    3,
    "the exact .torrent bytes were base64-encoded",
  );
  assert.equal(result.hasValidInfoHash, true);
  assert.match(result.magnet, new RegExp(`btih:${infoHash}`));
  assert.match(result.magnet, /ws=https%3A%2F%2Fa%2F/, "webseed points at the video");
  assert.ok(!/xs=/.test(result.magnet), "no xs= — the .torrent isn't hosted");
});

test("uploadVideo Tier 2: over-cap piece-map falls back to URL-only", async () => {
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async () => ({ kind: 24242 }),
    uploadBlob: async (server, file) => {
      if (file?.name?.includes(".torrent")) {
        const err = new Error("File type not allowed");
        err.status = 415;
        throw err;
      }
      return { url: `${server}/${SHA}`, sha256: SHA, size: 1, type: "video/mp4" };
    },
  });
  const published = [];
  // A .torrent whose base64 exceeds the 64 KiB cap.
  const big = new File([new Uint8Array(60 * 1024)], "big.torrent");
  const result = await svc.uploadVideo({
    file: new File([new Uint8Array([1])], "clip.mp4"),
    servers: ["https://a"],
    signer,
    generateTorrent: async () => ({
      hasValidInfoHash: true,
      infoHash: "0".repeat(40),
      torrentFile: big,
    }),
    publishTorrentMetadata: async (args) => published.push(args),
  });
  assert.equal(published.length, 0, "over-cap ⇒ nothing published");
  assert.equal(result.magnet, "", "URL-only");
  assert.equal(result.hasValidInfoHash, false);
});

test("uploadVideo Tier 2: a failed companion publish falls back to URL-only", async () => {
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async () => ({ kind: 24242 }),
    uploadBlob: async (server, file) => {
      if (file?.name?.includes(".torrent")) {
        const err = new Error("File type not allowed");
        err.status = 415;
        throw err;
      }
      return { url: `${server}/${SHA}`, sha256: SHA, size: 1, type: "video/mp4" };
    },
  });
  const result = await svc.uploadVideo({
    file: new File([new Uint8Array([1])], "clip.mp4"),
    servers: ["https://a"],
    signer,
    generateTorrent: async () => ({
      hasValidInfoHash: true,
      infoHash: "0".repeat(40),
      torrentFile: new File([new Uint8Array([9])], "clip.torrent"),
    }),
    publishTorrentMetadata: async () => {
      throw new Error("relay unreachable");
    },
  });
  assert.equal(result.magnet, "", "publish failed ⇒ URL-only, video still succeeds");
  assert.equal(result.hasValidInfoHash, false);
  assert.equal(result.url, `https://a/${SHA}`);
});

// --- BUD-12 management primitives (Phase 2) ---

test("deleteFile guards + calls deleteBlob with a delete auth", async () => {
  const svc = new BlossomService();
  const calls = [];
  svc.loadSdk = async () => ({
    createDeleteAuth: async (s, hash) => ({ kind: 24242, t: "delete", hash }),
    deleteBlob: async (server, hash, opts) => {
      if (typeof opts?.onAuth === "function") await opts.onAuth();
      calls.push({ server, hash });
      return true;
    },
  });
  await assert.rejects(() => svc.deleteFile({ sha256: SHA, signer }), /server and a sha256/);
  await assert.rejects(() => svc.deleteFile({ server: "https://a", signer }), /server and a sha256/);
  await assert.rejects(
    () => svc.deleteFile({ server: "https://a", sha256: SHA, signer: null }),
    /requires a signer/,
  );
  const ok = await svc.deleteFile({ server: "https://a", sha256: SHA, signer });
  assert.equal(ok, true);
  assert.deepEqual(calls[0], { server: "https://a", hash: SHA });
});

test("blobSha256FromUrl extracts the 64-hex blob id (or '' for non-blobs)", () => {
  const sha = "a".repeat(64);
  assert.equal(blobSha256FromUrl(`https://npub1x.blossom.band/${sha}.mp4`), sha);
  assert.equal(blobSha256FromUrl(`https://blossom.band/${sha}`), sha);
  assert.equal(blobSha256FromUrl(`https://cdn.example/u/2026/clip.mp4`), "", "not a blob path");
  assert.equal(blobSha256FromUrl("not a url"), "");
  assert.equal(blobSha256FromUrl(""), "");
});

test("deleteByUrl maps a Blossom URL to its blob and deletes it on every server", async () => {
  const svc = new BlossomService();
  const calls = [];
  svc.loadSdk = async () => ({
    createDeleteAuth: async () => ({ kind: 24242, t: "delete" }),
    deleteBlob: async (server, hash) => {
      calls.push({ server, hash });
      return true;
    },
  });
  const sha = "b".repeat(64);
  const out = await svc.deleteByUrl({
    url: `https://blossom.band/${sha}.mp4`,
    servers: ["https://a", "https://b"],
    signer,
  });
  assert.equal(out.sha256, sha);
  assert.deepEqual(out.deleted.sort(), ["https://a", "https://b"]);
  assert.deepEqual(calls.map((c) => c.hash), [sha, sha]);
});

test("deleteByUrl falls back to the URL's own origin when no servers are given", async () => {
  const svc = new BlossomService();
  const calls = [];
  svc.loadSdk = async () => ({
    createDeleteAuth: async () => ({}),
    deleteBlob: async (server, hash) => {
      calls.push({ server, hash });
      return true;
    },
  });
  const sha = "d".repeat(64);
  const out = await svc.deleteByUrl({
    url: `https://npub1x.blossom.band/${sha}.mp4`,
    signer,
  });
  assert.equal(out.sha256, sha);
  assert.deepEqual(out.deleted, ["https://npub1x.blossom.band"], "deleted from the URL origin");
  assert.equal(calls[0].server, "https://npub1x.blossom.band");
});

test("deleteByUrl is a no-op for a non-Blossom URL", async () => {
  const svc = new BlossomService();
  let called = false;
  svc.loadSdk = async () => ({
    createDeleteAuth: async () => ({}),
    deleteBlob: async () => {
      called = true;
    },
  });
  const out = await svc.deleteByUrl({
    url: "https://cdn.example/video.mp4",
    servers: ["https://a"],
    signer,
  });
  assert.equal(out.sha256, "");
  assert.equal(called, false, "no delete attempted for a non-blob URL");
});

test("deleteByUrl reports per-server failures without throwing", async () => {
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createDeleteAuth: async () => ({}),
    deleteBlob: async (server) => {
      if (server === "https://a") throw new Error("403 forbidden");
      return true;
    },
  });
  const sha = "c".repeat(64);
  const out = await svc.deleteByUrl({
    url: `https://x/${sha}`,
    servers: ["https://a", "https://b"],
    signer,
  });
  assert.deepEqual(out.deleted, ["https://b"]);
  assert.equal(out.failed.length, 1);
  assert.match(out.failed[0].error, /403/);
});

test("serversFromServerListEvent reads + de-dupes the BUD-03 server tags", () => {
  const event = {
    kind: 10063,
    tags: [
      ["server", " https://a "],
      ["server", "https://a"],
      ["server", "https://b"],
      ["client", "x"],
      ["server", ""],
    ],
  };
  assert.deepEqual(serversFromServerListEvent(event), ["https://a", "https://b"]);
  assert.deepEqual(serversFromServerListEvent(null), []);
});

test("listFiles returns the server's blob descriptors for a pubkey", async () => {
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createListAuth: async () => ({ kind: 24242, t: "list" }),
    listBlobs: async (server, pubkey) => [
      { url: `${server}/${SHA}`, sha256: SHA, size: 1, type: "video/mp4" },
    ],
  });
  await assert.rejects(() => svc.listFiles({ pubkey: "pk" }), /server and a pubkey/);
  const blobs = await svc.listFiles({ server: "https://a", pubkey: "f".repeat(64), signer });
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].sha256, SHA);
});
