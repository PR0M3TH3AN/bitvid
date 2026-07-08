import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The facade keeps a device-local resolved-id cache in localStorage; node has
// none, so provide a minimal in-memory shim and reset it before each test.
global.localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
})();
beforeEach(() => global.localStorage.clear());

import {
  fetchPendingSubmissions,
  markSubmissionResolved,
  resolveEventAuthorHex,
  RESOLVED_LIST_KIND,
  SUBMISSIONS_RESOLVED_DTAG,
} from "../js/submissions/submissionFacade.js";
import { buildSubmissionEvent, SUBMISSION_KIND } from "../js/nostrEventSchemas.js";

const ADMIN = "a".repeat(64);
const MOD = "b".repeat(64);
const ephem = (n) => String(n).repeat(64).slice(0, 64);

function submissionEvent({ id, applicant, created_at, author, content = "hi" }) {
  const event = buildSubmissionEvent({
    pubkey: author || ephem("e"),
    created_at,
    dTagValue: id,
    submissionType: "application",
    applicantNpub: applicant,
    recipientPubkey: ADMIN,
    content,
  });
  event.id = `evt-${id}`;
  return event;
}

function resolvedSet({ author, eventIds, created_at = 1000 }) {
  return {
    id: `resolved-${author.slice(0, 4)}`,
    kind: RESOLVED_LIST_KIND,
    pubkey: author,
    created_at,
    tags: [
      ["d", SUBMISSIONS_RESOLVED_DTAG],
      ...eventIds.map((eid) => ["e", eid, "approved", ""]),
    ],
  };
}

function mockClient({ events = [], onPublish } = {}) {
  return {
    relays: ["wss://mock.relay"],
    getSubscriptionManager: () => ({
      list: async ({ filters }) => {
        const f = filters[0] || {};
        return events.filter((ev) => {
          if (f.ids && !f.ids.includes(ev.id)) return false;
          if (f.kinds && !f.kinds.includes(ev.kind)) return false;
          if (f.authors && !f.authors.includes(ev.pubkey)) return false;
          if (f["#p"]) {
            const p = ev.tags.find((t) => t[0] === "p")?.[1];
            if (!f["#p"].includes(p)) return false;
          }
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

test("fetchPendingSubmissions returns pending, excludes resolved, dedupes by applicant", async () => {
  const events = [
    submissionEvent({ id: "s1", applicant: "npub-alice", created_at: 100 }),
    // alice re-applied later — newest should win
    submissionEvent({ id: "s2", applicant: "npub-alice", created_at: 200 }),
    submissionEvent({ id: "s3", applicant: "npub-bob", created_at: 150 }),
    // carol's was resolved by a moderator
    submissionEvent({ id: "s4", applicant: "npub-carol", created_at: 300 }),
    // resolved-set from a moderator marks carol's evt-s4 handled
    resolvedSet({ author: MOD, eventIds: ["evt-s4"] }),
  ];

  const pending = await fetchPendingSubmissions({
    adminHex: ADMIN,
    editorHexes: [MOD],
    client: mockClient({ events }),
  });

  const applicants = pending.map((s) => s.applicant).sort();
  assert.deepEqual(applicants, ["npub-alice", "npub-bob"], "carol resolved, alice deduped");
  const alice = pending.find((s) => s.applicant === "npub-alice");
  assert.equal(alice.id, "s2", "newest application for alice wins");
});

test("fetchPendingSubmissions still returns pending when a pool is present (mirror is best-effort)", async () => {
  const events = [
    submissionEvent({ id: "m1", applicant: "npub-x", created_at: 100 }),
  ];
  const client = mockClient({ events });
  // Presence of a pool triggers the re-broadcast mirror path; any publish
  // failure is swallowed and must not affect the returned queue.
  client.pool = {};
  const pending = await fetchPendingSubmissions({ adminHex: ADMIN, client });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].applicant, "npub-x");
});

test("fetchPendingSubmissions returns [] for a blank admin or no relays", async () => {
  assert.deepEqual(await fetchPendingSubmissions({ adminHex: "", client: mockClient({}) }), []);
  const noRelays = { ...mockClient({}), relays: [] };
  assert.deepEqual(await fetchPendingSubmissions({ adminHex: ADMIN, client: noRelays }), []);
});

test("markSubmissionResolved appends to the acting moderator's resolved-set", async () => {
  // MOD already resolved evt-old; now resolves evt-s3.
  const events = [resolvedSet({ author: MOD, eventIds: ["evt-old"] })];
  let published = null;
  const client = mockClient({ events, onPublish: (e) => (published = e) });

  await markSubmissionResolved({
    submission: { eventId: "evt-s3", applicant: "npub-bob" },
    status: "denied",
    actingHex: MOD,
    client,
  });

  assert.equal(published.kind, RESOLVED_LIST_KIND);
  assert.equal(published.pubkey, MOD);
  assert.equal(published.tags.find((t) => t[0] === "d")?.[1], SUBMISSIONS_RESOLVED_DTAG);
  const eTags = published.tags.filter((t) => t[0] === "e").map((t) => t[1]);
  assert.deepEqual(eTags.sort(), ["evt-old", "evt-s3"], "keeps prior + adds new");
  const newTag = published.tags.find((t) => t[0] === "e" && t[1] === "evt-s3");
  assert.equal(newTag[2], "denied", "records status");
  assert.equal(newTag[3], "npub-bob", "records applicant");
});

test("fetchPendingSubmissions hides an application whose applicant is already whitelisted", async () => {
  const events = [
    submissionEvent({ id: "wl1", applicant: "npub-whitelisted", created_at: 100 }),
    submissionEvent({ id: "wl2", applicant: "npub-other", created_at: 100 }),
  ];
  const pending = await fetchPendingSubmissions({
    adminHex: ADMIN,
    whitelistNpubs: ["npub-whitelisted"],
    client: mockClient({ events }),
  });
  assert.deepEqual(
    pending.map((s) => s.applicant),
    ["npub-other"],
    "whitelisted applicant's application is treated as handled",
  );
});

test("fetchPendingSubmissions hides a locally-resolved submission even with an empty relay resolved-set", async () => {
  const events = [submissionEvent({ id: "loc1", applicant: "npub-a", created_at: 100 })];
  const client = mockClient({ events });
  // No resolved-set on relays; resolving seeds only the device-local cache.
  await markSubmissionResolved({
    submission: { eventId: "evt-loc1" },
    actingHex: MOD,
    client,
  });
  const pending = await fetchPendingSubmissions({ adminHex: ADMIN, client });
  assert.equal(pending.length, 0, "local cache keeps it hidden after a cold read");
});

test("markSubmissionResolved never republishes a shrunk list (loss-proof via local cache)", async () => {
  let published = null;
  // Client has NO resolved-set events, so every read-modify-write read misses.
  const client = mockClient({ events: [], onPublish: (e) => (published = e) });
  await markSubmissionResolved({
    submission: { eventId: "evtA", applicant: "npub-a" },
    status: "approved",
    actingHex: MOD,
    client,
  });
  await markSubmissionResolved({
    submission: { eventId: "evtB", applicant: "npub-b" },
    status: "denied",
    actingHex: MOD,
    client,
  });
  const eIds = published.tags.filter((t) => t[0] === "e").map((t) => t[1]).sort();
  assert.deepEqual(
    eIds,
    ["evtA", "evtB"],
    "the earlier id is carried forward from the local cache despite the missed read",
  );
});

test("resolveEventAuthorHex returns the blocked event's author (lowercased)", async () => {
  const blockedEventId = "f".repeat(64);
  const authorHex = "C".repeat(64); // stored upper-case to prove normalization
  const events = [
    { id: blockedEventId, kind: 30078, pubkey: authorHex, tags: [], content: "" },
  ];
  const author = await resolveEventAuthorHex({
    eventId: blockedEventId,
    client: mockClient({ events }),
  });
  assert.equal(author, "c".repeat(64));
});

test("resolveEventAuthorHex returns '' for a blank id or an event not found", async () => {
  assert.equal(await resolveEventAuthorHex({ eventId: "", client: mockClient({}) }), "");
  assert.equal(
    await resolveEventAuthorHex({
      eventId: "a".repeat(64),
      client: mockClient({ events: [] }),
    }),
    "",
  );
});

test("markSubmissionResolved is a no-op without an acting pubkey or event id", async () => {
  assert.equal(
    await markSubmissionResolved({ submission: { eventId: "x" }, actingHex: "", client: mockClient({}) }),
    null,
  );
  assert.equal(
    await markSubmissionResolved({ submission: {}, actingHex: MOD, client: mockClient({}) }),
    null,
  );
});
