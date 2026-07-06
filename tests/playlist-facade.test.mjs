import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchCreatorPlaylists,
  fetchPlaylist,
  publishPlaylist,
} from "../js/playlists/playlistFacade.js";
import {
  buildPlaylistEvent,
  PLAYLIST_KIND,
} from "../js/nostrEventSchemas.js";

const AUTHOR = "a".repeat(64);
const OTHER = "c".repeat(64);
const coord = (d) => `30078:${"b".repeat(64)}:${d}`;

function playlistEvent({ pubkey = AUTHOR, id, title, coords = [], created_at }) {
  const event = buildPlaylistEvent({
    pubkey,
    created_at,
    dTagValue: id,
    title,
    videoCoordinates: coords,
  });
  event.id = `id-${id}-${created_at}`;
  return event;
}

// Mock client: a subscription manager whose list() filters an in-memory event
// set by kinds/authors/#d, plus a signAndPublishEvent that captures the event.
function mockClient({ events = [], onPublish } = {}) {
  return {
    relays: ["wss://mock.relay"],
    getSubscriptionManager: () => ({
      list: async ({ filters }) => {
        const f = filters[0] || {};
        return events.filter((ev) => {
          if (f.kinds && !f.kinds.includes(ev.kind)) return false;
          if (f.authors && !f.authors.includes(ev.pubkey)) return false;
          if (f["#d"]) {
            const d = ev.tags.find((t) => t[0] === "d")?.[1];
            if (!f["#d"].includes(d)) return false;
          }
          return true;
        });
      },
    }),
    signAndPublishEvent: async (event, options) => {
      if (onPublish) onPublish(event, options);
      return { signedEvent: { ...event, id: "signed-id", sig: "sig" } };
    },
  };
}

test("fetchCreatorPlaylists returns newest-per-id, drops empties, sorts newest-first", async () => {
  const events = [
    // Same id "a" published twice — the newer (created_at 200) must win.
    playlistEvent({ id: "a", title: "A old", coords: [coord("v1")], created_at: 100 }),
    playlistEvent({ id: "a", title: "A new", coords: [coord("v1"), coord("v2")], created_at: 200 }),
    playlistEvent({ id: "b", title: "B", coords: [coord("v9")], created_at: 300 }),
    // Empty playlist — dropped from the listing by default.
    playlistEvent({ id: "empty", title: "Empty", coords: [], created_at: 400 }),
    // Another author's playlist — must not appear.
    playlistEvent({ pubkey: OTHER, id: "x", title: "Other", coords: [coord("v0")], created_at: 500 }),
  ];

  const playlists = await fetchCreatorPlaylists(AUTHOR, { client: mockClient({ events }) });

  assert.deepEqual(playlists.map((p) => p.id), ["b", "a"], "sorted newest-first, empties + other author dropped");
  const a = playlists.find((p) => p.id === "a");
  assert.equal(a.title, "A new", "newest copy wins");
  assert.equal(a.items.length, 2);
});

test("fetchCreatorPlaylists can include empty playlists when asked", async () => {
  const events = [playlistEvent({ id: "empty", title: "Empty", coords: [], created_at: 1 })];
  const playlists = await fetchCreatorPlaylists(AUTHOR, {
    client: mockClient({ events }),
    includeEmpty: true,
  });
  assert.deepEqual(playlists.map((p) => p.id), ["empty"]);
});

test("fetchCreatorPlaylists returns [] for blank pubkey or no relays", async () => {
  assert.deepEqual(await fetchCreatorPlaylists("", { client: mockClient({}) }), []);
  const noRelays = { ...mockClient({}), relays: [] };
  assert.deepEqual(await fetchCreatorPlaylists(AUTHOR, { client: noRelays }), []);
});

test("fetchPlaylist returns the newest matching playlist parsed", async () => {
  const events = [
    playlistEvent({ id: "list", title: "old", coords: [coord("v1")], created_at: 10 }),
    playlistEvent({ id: "list", title: "new", coords: [coord("v1"), coord("v2")], created_at: 20 }),
    playlistEvent({ id: "other", title: "nope", coords: [coord("v3")], created_at: 99 }),
  ];
  const parsed = await fetchPlaylist(AUTHOR, "list", { client: mockClient({ events }) });
  assert.equal(parsed.title, "new");
  assert.equal(parsed.id, "list");
  assert.equal(parsed.items.length, 2);

  assert.equal(await fetchPlaylist(AUTHOR, "missing", { client: mockClient({ events }) }), null);
});

test("publishPlaylist builds a kind-30082 event and publishes with the playlist context", async () => {
  let published = null;
  let ctx = null;
  const client = mockClient({
    onPublish: (event, options) => {
      published = event;
      ctx = options?.context;
    },
  });

  const signed = await publishPlaylist(
    {
      pubkey: AUTHOR,
      id: "new-list",
      title: "Fresh",
      items: [
        { type: "a", value: coord("v1") },
        { type: "a", value: coord("v2") },
      ],
      created_at: 777,
    },
    { client },
  );

  assert.equal(published.kind, PLAYLIST_KIND);
  assert.equal(ctx, "playlist");
  assert.equal(published.tags.find((t) => t[0] === "d")?.[1], "new-list");
  assert.equal(published.tags.find((t) => t[0] === "title")?.[1], "Fresh");
  assert.deepEqual(
    published.tags.filter((t) => t[0] === "a").map((t) => t[1]),
    [coord("v1"), coord("v2")],
  );
  assert.equal(signed.id, "signed-id", "returns the signed event");
});
