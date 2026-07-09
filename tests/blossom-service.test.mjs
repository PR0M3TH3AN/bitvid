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

// A BlossomService whose SDK is mocked: multiServerUpload returns a descriptor
// map keyed by server, echoing the file so we can assert which blob was sent.
function mockService() {
  const uploads = [];
  const svc = new BlossomService();
  svc.loadSdk = async () => ({
    createUploadAuth: async (s, sha256, opts) => ({ kind: 24242, sha256, opts }),
    multiServerUpload: async (servers, file, opts) => {
      uploads.push({ servers: [...servers], file });
      // Give each blob a distinct sha256 so video vs .torrent URLs differ.
      const sha = file?.name?.includes(".torrent") ? "b".repeat(64) : SHA;
      if (typeof opts?.onAuth === "function") await opts.onAuth(servers[0], sha);
      const map = new Map();
      for (const server of servers) {
        map.set(server, { url: `${server}/${sha}`, sha256: sha, size: 1, type: "x" });
      }
      return map;
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

test("uploadFile returns the primary descriptor url + sha256 key, mirrored to all servers", async () => {
  const { svc, uploads } = mockService();
  const out = await svc.uploadFile({
    file: new File([new Uint8Array([1])], "v.mp4"),
    servers: ["https://a", "https://b"],
    signer,
  });
  assert.equal(out.url, `https://a/${SHA}`);
  assert.equal(out.key, SHA);
  assert.deepEqual(uploads[0].servers, ["https://a", "https://b"], "mirrored to both");
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
