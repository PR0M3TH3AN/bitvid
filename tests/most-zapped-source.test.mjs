import test from "node:test";
import assert from "node:assert/strict";

import { createWhitelistedAuthorsNostrSource } from "../js/feedEngine/sources.js";

test("Most Zapped discovery fetches only whitelisted creators and caches the catalog", async () => {
  const calls = [];
  const approved = "a".repeat(64);
  const unapproved = "b".repeat(64);
  let now = 1_000;
  const source = createWhitelistedAuthorsNostrSource({
    now: () => now,
    service: {
      async fetchVideosByAuthors(authors) {
        calls.push(authors);
        return [
          { id: "approved", pubkey: approved, created_at: 20 },
          { id: "unapproved", pubkey: unapproved, created_at: 30 },
        ];
      },
    },
  });

  const runtime = { whitelistedAuthors: [approved.toUpperCase()] };
  const first = await source({ runtime });
  const rerank = await source({ runtime });

  assert.deepEqual(calls, [[approved]], "relay lookup is author-scoped once");
  assert.deepEqual(first.map((entry) => entry.video.id), ["approved"]);
  assert.deepEqual(rerank.map((entry) => entry.video.id), ["approved"]);

  now += 2 * 60 * 1000;
  await source({ runtime });
  assert.equal(calls.length, 2, "catalog refreshes after its bounded TTL");
});

test("Most Zapped discovery is empty without approved creators and never queries globally", async () => {
  let calls = 0;
  const source = createWhitelistedAuthorsNostrSource({
    service: {
      async fetchVideosByAuthors() {
        calls += 1;
        return [{ id: "must-not-leak", pubkey: "c".repeat(64) }];
      },
    },
  });

  const result = await source({ runtime: { whitelistedAuthors: [] } });
  assert.deepEqual(result, []);
  assert.equal(calls, 0);
});

test("Most Zapped never leaks a removed creator while an earlier lookup is in flight", async () => {
  const removed = "d".repeat(64);
  const remaining = "e".repeat(64);
  let resolveFetch;
  const source = createWhitelistedAuthorsNostrSource({
    service: {
      fetchVideosByAuthors() {
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      },
    },
  });

  const first = source({ runtime: { whitelistedAuthors: [removed] } });
  const afterRemoval = source({ runtime: { whitelistedAuthors: [remaining] } });
  resolveFetch([{ id: "removed-video", pubkey: removed }]);

  assert.deepEqual((await first).map((entry) => entry.video.id), ["removed-video"]);
  assert.deepEqual(await afterRemoval, []);
});
