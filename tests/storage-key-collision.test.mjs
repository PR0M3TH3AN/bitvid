// Scenario (SCN-upload-key-no-collision):
//   Given a URL-first upload with NO torrent info-hash available,
//   When the storage key is derived (computeStorageContentHash -> buildR2Key),
//   Then two DISTINCT files that happen to share a filename must produce
//     DIFFERENT keys (so neither overwrites the other — the old `buildR2Key`
//     "uploads" fallback was a silent data-loss path, KNOWN_BUGS upload audit
//     #1), the SAME file must produce a STABLE key (idempotent re-upload), and
//     no key may fall back to the colliding "uploads" namespace.
//
// Anti-cheat: asserts externally observable key strings for real Blob/File
// content (small path) AND a fake >512MB file (sampled-fingerprint path, which
// must NOT buffer the whole file). No internal call-sequence assertions.

import test from "node:test";
import assert from "node:assert/strict";

import { buildR2Key, computeStorageContentHash } from "../js/r2.js";

const NPUB =
  "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsx5h2j";

async function keyFor(file) {
  const identifier = await computeStorageContentHash(file);
  return buildR2Key(NPUB, file, identifier);
}

test("distinct same-named URL-first uploads get distinct, non-colliding keys", async () => {
  const a = new File([new Uint8Array([1, 2, 3, 4, 5])], "video.mp4", {
    type: "video/mp4",
  });
  const b = new File([new Uint8Array([5, 4, 3, 2, 1])], "video.mp4", {
    type: "video/mp4",
  });

  const ka = await keyFor(a);
  const kb = await keyFor(b);

  assert.notEqual(ka, kb, "distinct content must not share a storage key");
  assert.ok(
    !ka.includes("/uploads/") && !kb.includes("/uploads/"),
    "must not fall back to the colliding 'uploads' namespace",
  );
});

test("same content yields a stable key (idempotent re-upload, no churn)", async () => {
  const bytes = new Uint8Array([7, 7, 7, 9, 9, 9, 1, 2]);
  const a1 = new File([bytes], "clip.mp4", { type: "video/mp4" });
  const a2 = new File([bytes], "clip.mp4", { type: "video/mp4" });

  assert.equal(
    await keyFor(a1),
    await keyFor(a2),
    "identical content (even as separate File objects) must map to one key",
  );
});

test("large files use a deterministic sampled fingerprint without buffering the whole file", async () => {
  // Fake a >512MB file: slice() returns only small edge blobs, so nothing close
  // to the reported size is ever allocated. Proves the fingerprint branch is
  // both bounded-memory and deterministic.
  const makeBig = (headByte, tailByte) => {
    let bytesRead = 0;
    return {
      name: "big.mp4",
      size: 600 * 1024 * 1024,
      lastModified: 111,
      slice(start) {
        const byte = start === 0 ? headByte : tailByte;
        const chunk = new Uint8Array([byte, byte, byte]);
        bytesRead += chunk.length;
        // Guard against accidental whole-file reads in the implementation.
        assert.ok(bytesRead < 1024 * 1024, "must only sample edges, not buffer the file");
        return new Blob([chunk]);
      },
    };
  };

  const k1 = await keyFor(makeBig(1, 2));
  const k1dup = await keyFor(makeBig(1, 2));
  const k2 = await keyFor(makeBig(1, 9)); // differing tail sample

  assert.equal(k1, k1dup, "same metadata + edge samples => stable fingerprint");
  assert.notEqual(k1, k2, "differing content edges => distinct key");
  assert.ok(!k1.includes("/uploads/"), "fingerprint path must not collide on 'uploads'");
});
