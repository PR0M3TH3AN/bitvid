// BUD-03 kind-10063 server-list import/publish helpers (extracted from the storage
// pane). Every path returns a { kind, message, ... } result — never throws — so the
// UI can render it directly. See docs/blossom-plan.md (Decision 3).
import test from "node:test";
import assert from "node:assert/strict";

import {
  importBlossomServerList,
  publishBlossomServerList,
} from "../js/ui/profileModal/blossomServerList.js";

const PK = "a".repeat(64);
const listEvent = (servers, created_at = 1000) => ({
  kind: 10063,
  created_at,
  tags: servers.map((s) => ["server", s]),
});

test("importBlossomServerList returns the NEWEST list's servers, author-scoped", async () => {
  const client = {
    readRelays: ["wss://r"],
    getSubscriptionManager: () => ({
      list: async ({ filters, relays }) => {
        assert.deepEqual(filters[0].kinds, [10063]);
        assert.deepEqual(filters[0].authors, [PK]);
        assert.deepEqual(relays, ["wss://r"]);
        return [listEvent(["https://old"], 100), listEvent(["https://a", "https://b"], 999)];
      },
    }),
  };
  const res = await importBlossomServerList({ client, pubkey: PK });
  assert.equal(res.kind, "success");
  assert.deepEqual(res.servers, ["https://a", "https://b"]);
});

test("importBlossomServerList: nothing published → error result (no throw)", async () => {
  const client = { getSubscriptionManager: () => ({ list: async () => [] }) };
  const res = await importBlossomServerList({ client, pubkey: PK });
  assert.equal(res.kind, "error");
  assert.match(res.message, /No published server list/);
});

test("importBlossomServerList: not logged in → error", async () => {
  const res = await importBlossomServerList({ client: null, pubkey: "" });
  assert.equal(res.kind, "error");
  assert.match(res.message, /Log in/);
});

test("importBlossomServerList: relay error is caught, returned as an error result", async () => {
  const client = {
    getSubscriptionManager: () => ({
      list: async () => {
        throw new Error("relay down");
      },
    }),
  };
  const res = await importBlossomServerList({ client, pubkey: PK });
  assert.equal(res.kind, "error");
  assert.match(res.message, /Import failed/);
  assert.equal(res.error.message, "relay down");
});

test("publishBlossomServerList signs + publishes a kind-10063 event with server tags", async () => {
  let published = null;
  const client = {
    signAndPublishEvent: async (ev) => {
      published = ev;
      return { id: "x" };
    },
  };
  const res = await publishBlossomServerList({
    client,
    pubkey: PK,
    servers: ["https://a", "https://b"],
  });
  assert.equal(res.kind, "success");
  assert.equal(published.kind, 10063);
  assert.equal(published.pubkey, PK);
  assert.deepEqual(
    published.tags.filter((t) => t[0] === "server"),
    [["server", "https://a"], ["server", "https://b"]],
  );
});

test("publishBlossomServerList: no servers → error (nothing published)", async () => {
  let called = false;
  const client = {
    signAndPublishEvent: async () => {
      called = true;
    },
  };
  const res = await publishBlossomServerList({ client, pubkey: PK, servers: [] });
  assert.equal(res.kind, "error");
  assert.match(res.message, /at least one server/);
  assert.equal(called, false);
});

test("publishBlossomServerList: publish failure → error result (no throw)", async () => {
  const client = {
    signAndPublishEvent: async () => {
      throw new Error("nope");
    },
  };
  const res = await publishBlossomServerList({
    client,
    pubkey: PK,
    servers: ["https://a"],
  });
  assert.equal(res.kind, "error");
  assert.match(res.message, /Publish failed/);
});
