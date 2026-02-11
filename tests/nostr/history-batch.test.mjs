
import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";
import { NostrClient } from "../../js/nostr/client.js";

describe("NostrClient History Batching", () => {
  let client;

  beforeEach(() => {
    client = new NostrClient();
    client.pool = {
      list: async (relays, filters) => {
        const results = [];
        for (const filter of filters) {
          if (filter["#d"]) {
             for (const d of filter["#d"]) {
                results.push({
                  id: `fetched-${d}`,
                  kind: 30078,
                  pubkey: filter.authors?.[0] || "anon",
                  created_at: 500,
                  tags: [["t", "video"], ["d", d]],
                  content: JSON.stringify({ version: 3, title: `Fetched ${d}`, url: "https://example.com/video.mp4" })
                });
             }
          }
          if (filter.ids) {
            for (const id of filter.ids) {
                results.push({
                  id: id,
                  kind: 30078,
                  pubkey: "root-author",
                  created_at: 100,
                  tags: [["t", "video"], ["d", `d-${id}`]],
                  content: JSON.stringify({ version: 3, title: `Root ${id}`, videoRootId: id, url: "https://example.com/video.mp4" })
                });
            }
          }
        }
        return results;
      },
      get: async () => null
    };
    client.relays = ["wss://relay1"];
  });

  test("hydrateVideoHistoryBatch should correctly group events", async () => {
    // v1 is its own root, so it should trigger sparse history fetch
    const video1 = { id: "v1", pubkey: "p1", videoRootId: "v1", tags: [["d", "d1"]] };
    // v2 has a different root, will fetch root but maybe not sparse history if root is found
    const video2 = { id: "v2", pubkey: "p2", videoRootId: "root2", tags: [["d", "d2"]] };

    client.allEvents.set("v1", { ...video1, created_at: 1000 });
    client.allEvents.set("v2", { ...video2, created_at: 1000 });

    const results = await client.hydrateVideoHistoryBatch([video1, video2]);

    assert.equal(results.size, 2);
    assert.ok(results.has("v1"));
    assert.ok(results.has("v2"));

    const h1 = results.get("v1");
    // Should have v1 (local) and fetched-d1 (fetched history)
    assert.ok(h1.some(e => e.id === "v1"), "h1 should have v1");
    assert.ok(h1.some(e => e.id === "fetched-d1"), "h1 should have fetched-d1");

    const h2 = results.get("v2");
    assert.ok(h2.some(e => e.id === "v2"), "h2 should have v2");
    assert.ok(h2.some(e => e.id === "root2"), "h2 should have root2");
  });

  test("hydrateVideoHistory should work via batch", async () => {
    const video = { id: "v1", pubkey: "p1", videoRootId: "v1", tags: [["d", "d1"]] };
    client.allEvents.set("v1", { ...video, created_at: 1000 });

    const history = await client.hydrateVideoHistory(video);
    assert.ok(Array.isArray(history));
    assert.ok(history.length >= 2, "history should have at least 2 events (local + fetched)");
    assert.ok(history.some(e => e.id === "v1"), "history should have v1");
    assert.ok(history.some(e => e.id === "fetched-d1"), "history should have fetched-d1");
  });
});
