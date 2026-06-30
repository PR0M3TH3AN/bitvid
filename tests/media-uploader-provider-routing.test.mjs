// Bug: with a Backblaze + Cloudflare connection both configured, uploads failed with
// "S3 endpoint is required." when the upload modal's tracked provider drifted out of
// sync with the active credentials — a Cloudflare R2 connection (accountId, no endpoint)
// got routed through the S3 service.
//
// Fix: MediaUploader routes by the CREDENTIALS' own provider, not a separately-passed
// (and possibly stale) provider. These tests exercise that via uploadThumbnail (no
// torrent generation, so no webtorrent in the test).

import test from "node:test";
import { strict as assert } from "node:assert";
import { MediaUploader } from "../js/ui/components/mediaUploader.js";

function makeUploader() {
  const used = [];
  const mkService = (name) => ({
    prepareUpload: async (_npub, { credentials }) => {
      used.push({ service: name, credentials });
      return {
        settings: { provider: credentials?.provider, accountId: "acct", endpoint: "" },
        bucketEntry: { publicBaseUrl: "https://cdn.example", bucket: "bkt" },
      };
    },
    uploadFile: async () => {},
  });
  const r2Service = mkService("r2");
  const s3Service = mkService("s3");
  const uploader = new MediaUploader({
    r2Service,
    s3Service,
    storageService: null,
    getCurrentPubkey: () => "f".repeat(64),
    safeEncodeNpub: () => "npub1abc",
  });
  return { uploader, used };
}

const R2_CREDS = { provider: "cloudflare_r2", accountId: "acct" }; // no endpoint!
const B2_CREDS = { provider: "backblaze_b2", endpoint: "https://s3.us-west-004.backblazeb2.com" };
const file = { name: "thumb.jpg" };

test("a Cloudflare connection routes to the R2 service even when the passed provider is stale (Backblaze)", async () => {
  const { uploader, used } = makeUploader();
  await uploader.uploadThumbnail(file, { provider: "backblaze_b2", credentials: R2_CREDS });
  assert.equal(used.length, 1);
  assert.equal(used[0].service, "r2", "routed by credentials.provider, not the stale arg");
});

test("a Backblaze connection routes to the S3 service even when the passed provider is stale (Cloudflare)", async () => {
  const { uploader, used } = makeUploader();
  await uploader.uploadThumbnail(file, { provider: "cloudflare_r2", credentials: B2_CREDS });
  assert.equal(used[0].service, "s3");
});

test("falls back to meta.provider when the top-level provider is absent", async () => {
  const { uploader, used } = makeUploader();
  await uploader.uploadThumbnail(file, {
    provider: "backblaze_b2",
    credentials: { meta: { provider: "cloudflare_r2" }, accountId: "acct" },
  });
  assert.equal(used[0].service, "r2");
});

test("falls back to the passed provider when credentials carry none", async () => {
  const { uploader, used } = makeUploader();
  await uploader.uploadThumbnail(file, {
    provider: "cloudflare_r2",
    credentials: { accountId: "acct" },
  });
  assert.equal(used[0].service, "r2");
});
