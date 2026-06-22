// Logged-out / local-only watch history lives in a localStorage queue, not on
// relays. A removal there is a REPLACE snapshot — it must rewrite the local queue
// so the deletion sticks. Previously snapshot no-op'd for local-only actors, so
// removing an item locally did nothing and it reappeared on reload.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { watchHistoryService } from "../js/watchHistoryService.js";
import { nostrClient } from "../js/nostrClientFacade.js";

// Make `actor` local-only by making it the session actor (feature disabled for
// the session actor → local queue path).
function makeLocalActor(actor) {
  nostrClient.pubkey = "";
  nostrClient.sessionActor = { pubkey: actor };
}

test("local-only replace snapshot seeds and then prunes the local queue", async () => {
  const actor = "f".repeat(64);
  makeLocalActor(actor);

  // Seed three items via a replace snapshot (the local queue path).
  const seed = await watchHistoryService.snapshot(
    [
      { type: "e", value: "local-a" },
      { type: "e", value: "local-b" },
      { type: "e", value: "local-c" },
    ],
    { actor, replace: true },
  );
  assert.equal(seed.skipped, undefined, "local replace must NOT be skipped");

  let items = await watchHistoryService.loadLatest(actor, { allowStale: false });
  assert.deepEqual(
    items.map((i) => i.value).sort(),
    ["local-a", "local-b", "local-c"],
    "seeded local queue should have all three",
  );

  // Remove "local-b": replace with the remaining two.
  await watchHistoryService.snapshot(
    [
      { type: "e", value: "local-a" },
      { type: "e", value: "local-c" },
    ],
    { actor, replace: true },
  );

  items = await watchHistoryService.loadLatest(actor, { allowStale: false });
  assert.deepEqual(
    items.map((i) => i.value).sort(),
    ["local-a", "local-c"],
    "removed item must be gone from the local queue (delete sticks)",
  );
});

test("local-only clear (empty replace) empties the local queue", async () => {
  const actor = "e".repeat(64);
  makeLocalActor(actor);

  await watchHistoryService.snapshot([{ type: "e", value: "only" }], {
    actor,
    replace: true,
  });
  let items = await watchHistoryService.loadLatest(actor, { allowStale: false });
  assert.equal(items.length, 1);

  await watchHistoryService.snapshot([], { actor, replace: true });
  items = await watchHistoryService.loadLatest(actor, { allowStale: false });
  assert.equal(items.length, 0, "clearing the last local item must empty the queue");
});
