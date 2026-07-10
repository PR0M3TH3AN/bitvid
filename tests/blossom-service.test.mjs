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
