import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TRUST_SEED_NPUBS } from "../../js/constants.js";
import { DEFAULT_TRUST_SEED_NPUBS as CONFIG_DEFAULT_TRUST_SEED_NPUBS } from "../../js/config.js";
import {
  withMockedNostrTools,
  createModerationServiceHarness,
  createReportEvent,
} from "../helpers/moderation-test-helpers.mjs";

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

function createTrustedMuteEvent({ owner, muted, id = "m".repeat(64), createdAt = 1_700_000_000 } = {}) {
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

test("whitelist entries augment trusted seeds", (t) => {
  withMockedNostrTools(t);

  const whitelistHex = "a".repeat(64);
  const whitelistNpub = `npub${whitelistHex}`;

  const { service } = createModerationServiceHarness(t);
  service.setTrustedSeeds([...DEFAULT_TRUST_SEED_NPUBS, whitelistNpub]);

  assert.ok(
    service.trustedSeedContacts.has(whitelistHex),
    "whitelist npubs should populate trusted seed contacts"
  );

  assert.ok(
    service.trustedContacts.has(whitelistHex),
    "whitelist npubs should populate trusted contacts"
  );
});
