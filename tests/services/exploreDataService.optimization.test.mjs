import { test } from "node:test";
import assert from "node:assert/strict";
import { toLightweightVideo } from "../../js/services/exploreDataService.js";
import { collectVideoTags } from "../../js/utils/videoTags.js";
import { buildVideoAddressPointer } from "../../js/utils/videoPointer.js";

test("exploreDataService optimization", async (t) => {
  await t.test("toLightweightVideo extracts necessary fields", () => {
    const fullVideo = {
      id: "video-id",
      kind: 30078,
      pubkey: "pubkey-123",
      content: "some long content",
      sig: "signature",
      created_at: 1234567890,
      tags: [
        ["t", "tag1"],
        ["t", "tag2"],
        ["p", "mention"],
        ["d", "identifier"],
        ["e", "reply"],
      ],
      nip71: {
        hashtags: ["tag3"],
        t: ["tag4"],
      },
      relays: ["wss://relay"],
    };

    const lightweight = toLightweightVideo(fullVideo);

    assert.equal(lightweight.id, "video-id");
    assert.equal(lightweight.kind, 30078);
    assert.equal(lightweight.pubkey, "pubkey-123");
    assert.deepEqual(lightweight.nip71, { hashtags: ["tag3"], t: ["tag4"] });

    // Check tags filtering
    assert.equal(lightweight.tags.length, 3);
    assert.deepEqual(lightweight.tags, [
      ["t", "tag1"],
      ["t", "tag2"],
      ["d", "identifier"],
    ]);

    // Check excluded fields
    assert.equal(lightweight.content, undefined);
    assert.equal(lightweight.sig, undefined);
    assert.equal(lightweight.created_at, undefined);
    assert.equal(lightweight.relays, undefined);
  });

  await t.test("collectVideoTags works with lightweight object", () => {
    const lightweight = {
      id: "video-id",
      tags: [
        ["t", "tag1"],
        ["d", "identifier"],
      ],
      nip71: {
        hashtags: ["tag2"],
      },
    };

    const tags = collectVideoTags(lightweight);
    // Should collect tag1 and tag2. tag2 from nip71.
    // And d tag is NOT collected by collectVideoTags (it only collects hashtags).

    assert.ok(tags.includes("tag1"));
    assert.ok(tags.includes("tag2"));
    assert.equal(tags.length, 2);
  });

  await t.test("buildVideoAddressPointer works with lightweight object", () => {
    const lightweight = {
      id: "video-id",
      kind: 30078,
      pubkey: "pubkey-123",
      tags: [
        ["t", "tag1"],
        ["d", "identifier"],
      ],
    };

    const pointer = buildVideoAddressPointer(lightweight);
    assert.equal(pointer, "30078:pubkey-123:identifier");
  });

  await t.test("toLightweightVideo handles invalid input", () => {
    assert.equal(toLightweightVideo(null), null);
    assert.equal(toLightweightVideo(undefined), null);
    assert.equal(toLightweightVideo("string"), null);
  });
});
