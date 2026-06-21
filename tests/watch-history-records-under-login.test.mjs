// View events are ALWAYS signed by the anonymous session actor (privacy for the
// public view counter). publishView used to read the watched-actor from that
// view event's pubkey, so a logged-in user's new watches were enqueued — and
// republished — under the SESSION actor. The read path queries authors:[loggedIn]
// only, so those session-authored months were invisible: newly watched videos
// never appeared in the synced watch history.
//
// Correct behavior: when a user is logged in, a new watch belongs to THEIR
// identity (enqueued under the logged-in actor, NOT marked session), so it syncs
// and is discoverable on read. Logged-out watches still go to the session/local
// queue.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { watchHistoryService } from "../js/watchHistoryService.js";
import { nostrClient } from "../js/nostrClientFacade.js";

const LOGGED_IN = "a".repeat(64);
const SESSION = "b".repeat(64);

// View events are anonymized: recordVideoView resolves a session actor and the
// returned event is signed by it — NOT by the logged-in user.
function stubAnonymousViews() {
  const originals = {
    recordVideoView: nostrClient.recordVideoView,
    scheduleWatchHistoryRepublish: nostrClient.scheduleWatchHistoryRepublish,
    pubkey: nostrClient.pubkey,
    sessionActor: nostrClient.sessionActor,
  };
  nostrClient.sessionActor = { pubkey: SESSION };
  nostrClient.recordVideoView = async () => ({
    ok: true,
    event: { pubkey: SESSION }, // anonymous session-signed view event
  });
  // Don't actually hit relays during the republish step.
  nostrClient.scheduleWatchHistoryRepublish = () => {};
  return () => Object.assign(nostrClient, originals);
}

test("a logged-in user's new watch is filed under THEIR identity, not the session actor", async () => {
  const restore = stubAnonymousViews();
  nostrClient.pubkey = LOGGED_IN;
  try {
    await watchHistoryService.publishView(
      { type: "e", value: "freshly-watched-video", watchedAt: 1750000000 },
      1750000000,
    );

    const loggedInQueue = watchHistoryService.getQueuedPointers(LOGGED_IN);
    const sessionQueue = watchHistoryService.getQueuedPointers(SESSION);

    const inLoggedIn = loggedInQueue.find(
      (p) => p?.value === "freshly-watched-video",
    );
    assert.ok(
      inLoggedIn,
      "new watch must be queued under the LOGGED-IN actor so it syncs to their history",
    );
    assert.notEqual(
      inLoggedIn.session,
      true,
      "a logged-in user's watch must NOT be flagged session/local-only",
    );
    assert.equal(
      sessionQueue.some((p) => p?.value === "freshly-watched-video"),
      false,
      "the watch must NOT be stranded in the anonymous session queue",
    );
  } finally {
    restore();
  }
});

test("a logged-out watch still goes to the session/local queue", async () => {
  const restore = stubAnonymousViews();
  nostrClient.pubkey = ""; // logged out
  try {
    await watchHistoryService.publishView(
      { type: "e", value: "anon-watched-video", watchedAt: 1750000001 },
      1750000001,
    );

    const sessionQueue = watchHistoryService.getQueuedPointers(SESSION);
    const entry = sessionQueue.find((p) => p?.value === "anon-watched-video");
    assert.ok(entry, "logged-out watch must be queued under the session actor");
    assert.equal(
      entry.session,
      true,
      "logged-out watch must be flagged as a local/session entry",
    );
  } finally {
    restore();
  }
});
