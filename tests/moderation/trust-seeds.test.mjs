import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TRUST_SEED_NPUBS } from "../../js/constants.js";
import { DEFAULT_TRUST_SEED_NPUBS as CONFIG_DEFAULT_TRUST_SEED_NPUBS } from "../../js/config.js";
import {
  withMockedNostrTools,
  createModerationServiceHarness,
  createReportEvent,
} from "../helpers/moderation-test-helpers.mjs";
import { ADMIN_SUPER_NPUB } from "../../js/config.js";
import { register } from "node:module";

const [PRIMARY_SEED_NPUB] = DEFAULT_TRUST_SEED_NPUBS;

test("default trust seeds derive from config", () => {
  const sanitizedConfigSeeds = Array.isArray(CONFIG_DEFAULT_TRUST_SEED_NPUBS)
    ? Array.from(
        new Set(
          CONFIG_DEFAULT_TRUST_SEED_NPUBS
            .filter((value) => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      )
    : [];

  assert.ok(Object.isFrozen(DEFAULT_TRUST_SEED_NPUBS));
  assert.deepEqual(DEFAULT_TRUST_SEED_NPUBS, sanitizedConfigSeeds);
  assert.notStrictEqual(DEFAULT_TRUST_SEED_NPUBS, CONFIG_DEFAULT_TRUST_SEED_NPUBS);
});

<<<<<<< HEAD
function createTrustedMuteEvent({ owner, muted, id = "m".repeat(64), createdAt = Math.floor(Date.now() / 1000) } = {}) {
=======
function createTrustedMuteEvent({ owner, muted, id = "m".repeat(64), createdAt = 1_700_000_000 } = {}) {
>>>>>>> origin/main
  return {
    kind: 10000,
    id,
    pubkey: owner,
    created_at: createdAt,
    tags: [["p", muted]],
    content: "",
  };
}

test("trusted seeds contribute to trusted mute counts", (t) => {
  withMockedNostrTools(t);

  const mutedAuthor = "c".repeat(64);

  const { service } = createModerationServiceHarness(t);
  service.setTrustedSeeds([PRIMARY_SEED_NPUB]);

  const [seedHex] = Array.from(service.trustedContacts);
  assert.ok(seedHex, "trusted seeds should populate trustedContacts");

  const muteEvent = createTrustedMuteEvent({ owner: seedHex, muted: mutedAuthor });
  service.applyTrustedMuteEvent(seedHex, muteEvent);

  assert.equal(service.isTrustedMuteOwner(seedHex), true);
  assert.equal(service.isAuthorMutedByTrusted(mutedAuthor), true);
  assert.deepEqual(service.getTrustedMutersForAuthor(mutedAuthor), [seedHex]);
});

test("trusted seeds contribute to trusted report counts", (t) => {
  withMockedNostrTools(t);

  const eventId = "f".repeat(64);

  const { service } = createModerationServiceHarness(t);
  service.setTrustedSeeds([PRIMARY_SEED_NPUB]);

  const [seedHex] = Array.from(service.trustedContacts);
  assert.ok(seedHex, "trusted seeds should populate trustedContacts");

  const report = createReportEvent({
    id: "r".repeat(64),
    reporter: seedHex,
    eventId,
    createdAt: 1_700_000_111,
    type: "nudity",
  });

  service.ingestReportEvent(report);

  assert.equal(service.trustedReportCount(eventId, "nudity"), 1);
  const summary = service.getTrustedReportSummary(eventId);
  assert.equal(summary?.totalTrusted ?? 0, 1);
  const reporters = service.getTrustedReporters(eventId, "nudity");
  assert.deepEqual(reporters.map((entry) => entry.pubkey), [seedHex]);
});

test("trusted seed updates recompute guest report summaries", (t) => {
  withMockedNostrTools(t);

  const eventId = "a".repeat(64);
  const reporterHex = "b".repeat(64);
  const reporterNpub = `npub${reporterHex}`;

  const { service } = createModerationServiceHarness(t);

  const report = createReportEvent({
    id: "c".repeat(64),
    reporter: reporterHex,
    eventId,
    createdAt: 1_700_000_999,
    type: "spam",
  });

  service.ingestReportEvent(report);

  const preSeedSummary = service.getTrustedReportSummary(eventId);
  assert.equal(preSeedSummary.totalTrusted, 0);
  assert.equal(preSeedSummary.types.spam?.trusted ?? 0, 0);

  service.setTrustedSeeds([reporterNpub]);

  const postSeedSummary = service.getTrustedReportSummary(eventId);
  assert.equal(postSeedSummary.totalTrusted, 1);
  assert.equal(postSeedSummary.types.spam.trusted, 1);
  assert.equal(service.trustedReportCount(eventId, "spam"), 1);
});

test("moderator seeds populate trusted contacts", (t) => {
  withMockedNostrTools(t);

  const moderatorHex = "d".repeat(64);
  const moderatorNpub = `npub${moderatorHex}`;

  const { service } = createModerationServiceHarness(t);
  service.setTrustedSeeds([moderatorNpub]);

  assert.ok(
    service.trustedSeedContacts.has(moderatorHex),
    "moderator seeds should populate trusted seed contacts"
  );

  assert.ok(
    service.trustedContacts.has(moderatorHex),
    "moderator seeds should populate trusted contacts"
  );
});

test("bootstrap seeds track editor roster and ignore whitelist-only changes", async (t) => {
  register(new URL("./mocks/bootstrap-trust-seeds-loader.mjs", import.meta.url));

  t.after(() => {
    delete globalThis.__bootstrapAccessControlMock;
    delete globalThis.__bootstrapModerationServiceMock;
  });

  let currentEditors = [
    "npub1moderatorexamplemoderatorexamplemoderatorexample1",
  ];
  const whitelistListeners = new Set();
  const editorListeners = new Set();
  let ensureReadyCalls = 0;
  let getEditorsCalls = 0;

  const accessControlMock = {
    ensureReady: async () => {
      ensureReadyCalls += 1;
    },
    getEditors: () => {
      getEditorsCalls += 1;
      return currentEditors;
    },
    onWhitelistChange: (listener) => {
      if (typeof listener === "function") {
        whitelistListeners.add(listener);
      }
      return () => {
        whitelistListeners.delete(listener);
      };
    },
    onEditorsChange: (listener) => {
      if (typeof listener === "function") {
        editorListeners.add(listener);
      }
      return () => {
        editorListeners.delete(listener);
      };
    },
  };

  const setTrustedSeedsCalls = [];
  const recomputeCalls = [];
  const moderationServiceMock = {
    setTrustedSeeds: (seeds) => {
      const snapshot = [];
      if (seeds && typeof seeds[Symbol.iterator] === "function") {
        for (const value of seeds) {
          snapshot.push(value);
        }
      }
      setTrustedSeedsCalls.push(snapshot);
    },
    recomputeAllSummaries: () => {
      recomputeCalls.push(true);
    },
  };

  globalThis.__bootstrapAccessControlMock = accessControlMock;
  globalThis.__bootstrapModerationServiceMock = moderationServiceMock;

<<<<<<< HEAD
  const bootstrapModule = await import("../../js/services/trustBootstrap.js");
  await bootstrapModule.bootstrapTrustedSeeds();
=======
  const bootstrapModule = await import("../../js/bootstrap.js");
  await bootstrapModule.trustedSeedsReadyPromise;
>>>>>>> origin/main

  assert.equal(ensureReadyCalls, 1);
  assert.ok(
    getEditorsCalls >= 1,
    "bootstrap should query editors during initialization"
  );

  assert.equal(setTrustedSeedsCalls.length, 1);
  assert.equal(recomputeCalls.length, 1, "summaries should recompute after trusted seeds apply");
  const [initialSeeds] = setTrustedSeedsCalls;
  assert.ok(
    initialSeeds.includes(ADMIN_SUPER_NPUB),
    "super admin should be included in trusted seed roster"
  );
  assert.ok(
    initialSeeds.some((value) => currentEditors.includes(value)),
    "initial editor roster should seed trust"
  );

  const whitelistListener = Array.from(whitelistListeners)[0];
  if (typeof whitelistListener === "function") {
    whitelistListener(["npub1whitelistentrywhitelistentrywhitelistentry"]);
  }

  assert.equal(
    setTrustedSeedsCalls.length,
    2,
    "whitelist change should retrigger trusted seed derivation"
  );
  const [, whitelistSeeds] = setTrustedSeedsCalls;
  assert.deepEqual(
    new Set(whitelistSeeds),
    new Set(initialSeeds),
    "whitelist updates should not introduce new trusted seeds"
  );

  currentEditors = [
    "npub1newmoderatorexamplemoderatorexamplemoderator",
    "npub1secondmoderatorexamplemoderatorexamplemod",
  ];
  for (const listener of editorListeners) {
    listener(currentEditors);
  }

  assert.equal(
    setTrustedSeedsCalls.length,
    3,
    "editor change should recompute trusted seed roster"
  );
  const latestSeeds = setTrustedSeedsCalls[2];
  assert.deepEqual(
    new Set(latestSeeds),
    new Set([ADMIN_SUPER_NPUB, ...currentEditors]),
    "trusted seeds should match super admin plus latest editors"
  );
});
