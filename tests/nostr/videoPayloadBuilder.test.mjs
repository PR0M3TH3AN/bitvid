import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  extractVideoPublishPayload,
  prepareVideoPublishPayload,
} from "../../js/nostr/videoPayloadBuilder.js";

describe("videoPayloadBuilder", () => {
  describe("extractVideoPublishPayload", () => {
    test("extracts videoData and nip71Metadata", () => {
      const rawPayload = {
        title: "My Video",
        nip71: { genre: "Action" },
      };
      const { videoData, nip71Metadata } = extractVideoPublishPayload(rawPayload);
      assert.equal(videoData.title, "My Video");
      assert.deepEqual(nip71Metadata, { genre: "Action" });
    });

    test("handles legacyFormData structure", () => {
      const rawPayload = {
        legacyFormData: { title: "Legacy Video" },
      };
      const { videoData } = extractVideoPublishPayload(rawPayload);
      assert.equal(videoData.title, "Legacy Video");
    });

    test("normalizes boolean flags", () => {
      const rawPayload = {
        isNsfw: true,
        isForKids: true, // Should be false if nsfw is true
      };
      const { videoData } = extractVideoPublishPayload(rawPayload);
      assert.equal(videoData.isNsfw, true);
      assert.equal(videoData.isForKids, false);
    });

     test("normalizes boolean flags (kids only)", () => {
      const rawPayload = {
        isNsfw: false,
        isForKids: true,
      };
      const { videoData } = extractVideoPublishPayload(rawPayload);
      assert.equal(videoData.isNsfw, false);
      assert.equal(videoData.isForKids, true);
    });
  });

  describe("prepareVideoPublishPayload", () => {
    const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";

    test("throws if pubkey is missing", async () => {
      await assert.rejects(
        async () => {
          await prepareVideoPublishPayload({}, "");
        },
        { message: "Not logged in to publish video." }
      );
    });

    test("generates a valid event structure", async () => {
      const videoPayload = {
        title: "Test Video",
        magnet: "magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678",
        url: "https://example.com/video.mp4",
        thumbnail: "https://example.com/thumb.jpg",
        description: "Test description",
      };

      const result = await prepareVideoPublishPayload(videoPayload, pubkey);

      assert.ok(result.event);
      assert.equal(result.event.pubkey, pubkey);
      assert.equal(result.event.kind, 30078); // Assuming KIND_VIDEO_POST is 30078, check schema if fails

      const content = JSON.parse(result.event.content);
      assert.equal(content.title, "Test Video");
      assert.equal(content.url, "https://example.com/video.mp4");
      assert.equal(content.magnet, "magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678");
      assert.equal(content.thumbnail, "https://example.com/thumb.jpg");
      assert.equal(content.description, "Test description");
      assert.equal(content.videoRootId, result.videoRootId);
    });

    test("generates unique d tag and videoRootId if not provided", async () => {
        const result = await prepareVideoPublishPayload({}, pubkey);
        assert.ok(result.videoRootId);
        assert.ok(result.dTagValue);
        assert.equal(result.videoRootId, result.dTagValue);
    });

    test("uses provided seriesIdentifier as d tag", async () => {
        const result = await prepareVideoPublishPayload({ seriesIdentifier: "my-series" }, pubkey);
        assert.equal(result.videoRootId, "my-series");
        assert.equal(result.dTagValue, "my-series");
    });

    test("resolves infoHash from magnet", async () => {
        const magnet = "magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678";
        const result = await prepareVideoPublishPayload({ magnet }, pubkey);
        assert.equal(result.contentObject.infoHash, "1234567890abcdef1234567890abcdef12345678");
    });

    test("includes NIP-71 tags", async () => {
        const payload = {
            title: "Metadata Test",
            nip71: {
                hashtags: ["technology"]
            }
        };
        const result = await prepareVideoPublishPayload(payload, pubkey);
        // nip71 tags should be in additionalTags or event tags
        // buildVideoPostEvent merges additionalTags into event tags
        const tags = result.event.tags;
        const hashtagTag = tags.find(t => t[0] === "t" && t[1] === "technology");
        assert.ok(hashtagTag, "Should have hashtag tag");
    });
  });
});
