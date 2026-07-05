// #49: relay-ack false-negatives on the FLAGSHIP content flows. When no relay
// ACKs within the publish window but nothing rejected (all-timeout), the event
// was sent and almost always persisted — it must surface as an UNCONFIRMED soft
// success, not "Failed to share video". Equally important: the outcome messaging
// must stay honest — unconfirmed is never reported as "published to N relays",
// and a delete is only "deleted" when at least one relay ACKed something.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-content-publish-all-timeout
//       given: "a relay pool where every relay times out (reason 'publish timeout') vs one that rejects"
//       when: "signAndPublishEvent (video publish/edit path) runs"
//       then: "all-timeout resolves with summary.unconfirmed=true; an explicit rejection still throws RelayPublishError"
//     - id: SCN-honest-outcome-messaging
//       given: "relay tallies including the new unconfirmed flag"
//       when: "describePublishOutcome / attachRelayPublishSummary / anyRelayAcceptedInSummaries run"
//       then: "unconfirmed -> warning ('sent, not confirmed'), never a relay-count success and never a hard error; deletes only 'confirmed' with >=1 ACK"
//   observable_outcomes:
//     - "signAndPublishEvent resolves (no throw) on all-timeout with unconfirmed summary"
//     - "signAndPublishEvent still throws on explicit rejection"
//     - "unconfirmed tally round-trips through attach/readRelayPublishSummary"
//     - "describePublishOutcome(unconfirmed) is a warning with honest wording"
//   determinism_controls:
//     - "fake pool fires ok/failed handlers synchronously; no real sockets or timers race the 10s window"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic", "snapshot rubber-stamping"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  RelayPublishError,
  describePublishOutcome,
  attachRelayPublishSummary,
  readRelayPublishSummary,
  anyRelayAcceptedInSummaries,
} from "../js/nostrPublish.js";
import { signAndPublishEvent } from "../js/nostr/publishHelpers.js";

const PUB = "a".repeat(64);

// Fake nostr-tools pool: publish([url]) returns a handle whose "failed" (or
// "ok") handler fires immediately with the scripted outcome for that relay.
function makePool(outcomes) {
  let call = 0;
  return {
    publish(urls, _event) {
      const outcome = outcomes[call % outcomes.length];
      call += 1;
      return {
        on(eventName, handler) {
          if (outcome === "ok" && eventName === "ok") {
            handler();
          } else if (outcome !== "ok" && eventName === "failed") {
            handler(new Error(outcome));
          }
          return this;
        },
      };
    },
  };
}

const signer = {
  pubkey: PUB,
  signEvent: async (event) => ({ ...event, id: "signed-1", sig: "sig" }),
};

function publishWith(pool) {
  return signAndPublishEvent({
    client: {
      pubkey: PUB,
      pool,
      relays: ["wss://a.example", "wss://b.example"],
      writeRelays: ["wss://a.example", "wss://b.example"],
    },
    event: { kind: 30078, pubkey: PUB, created_at: 100, tags: [], content: "{}" },
    resolveActiveSigner: () => signer,
    shouldRequestExtensionPermissions: () => false,
    options: { context: "video note", logName: "Video note" },
  });
}

test("all-timeout video publish resolves as an unconfirmed soft success", async () => {
  const result = await publishWith(makePool(["publish timeout", "publish timeout"]));
  assert.equal(result.signedEvent.id, "signed-1");
  assert.equal(result.summary.unconfirmed, true, "flagged unconfirmed");
  assert.equal(result.summary.accepted.length, 0, "no fake acceptances");
  assert.equal(result.summary.failed.length, 2, "both timeouts recorded");
});

test("an explicit relay rejection still hard-fails the publish", async () => {
  await assert.rejects(
    publishWith(makePool(["publish timeout", "blocked: spam"])),
    RelayPublishError,
  );
});

test("a confirmed ack stays a confirmed (not unconfirmed) success", async () => {
  const result = await publishWith(makePool(["ok", "publish timeout"]));
  assert.equal(result.summary.unconfirmed, false);
  assert.equal(result.summary.accepted.length, 1);
});

test("the attached tally carries the unconfirmed flag to the UI", () => {
  const event = { id: "e1", kind: 30078 };
  attachRelayPublishSummary(event, {
    accepted: [],
    failed: [{ url: "wss://a" }, { url: "wss://b" }],
    unconfirmed: true,
  });
  assert.deepEqual(readRelayPublishSummary(event), {
    accepted: 0,
    total: 2,
    unconfirmed: true,
  });

  // Confirmed publishes keep the exact legacy tally shape (no stray flag).
  const confirmed = { id: "e2" };
  attachRelayPublishSummary(confirmed, {
    accepted: [{ url: "wss://a" }],
    failed: [],
  });
  assert.deepEqual(readRelayPublishSummary(confirmed), { accepted: 1, total: 1 });
});

test("describePublishOutcome: unconfirmed is an honest warning, not success or error", () => {
  const out = describePublishOutcome({ accepted: 0, total: 3, unconfirmed: true });
  assert.equal(out.tone, "warning");
  assert.match(out.message, /no relay has confirmed/i);
  assert.doesNotMatch(out.message, /\d+ relays?/, "must not fake a relay count");
  assert.doesNotMatch(out.message, /could not be published/i);

  // Without the flag, zero acceptance is still the hard error.
  assert.equal(describePublishOutcome({ accepted: 0, total: 3 }).tone, "error");
  // A real acceptance is unaffected by a stray flag.
  assert.equal(
    describePublishOutcome({ accepted: 2, total: 3, unconfirmed: false }).tone,
    "warning",
  );
  assert.equal(describePublishOutcome({ accepted: 3, total: 3 }).tone, "success");
});

test("delete confirmation: only >=1 relay ACK counts as a confirmed delete", () => {
  const unconfirmedSummary = { accepted: [], failed: [{ url: "wss://a" }], unconfirmed: true };
  const confirmedSummary = { accepted: [{ url: "wss://b" }], failed: [] };

  assert.equal(
    anyRelayAcceptedInSummaries([unconfirmedSummary, unconfirmedSummary]),
    false,
    "all-timeout delete must NOT be reported as deleted",
  );
  assert.equal(
    anyRelayAcceptedInSummaries([unconfirmedSummary, confirmedSummary]),
    true,
  );
  assert.equal(
    anyRelayAcceptedInSummaries([]),
    true,
    "nothing needed publishing counts as confirmed",
  );
  assert.equal(anyRelayAcceptedInSummaries([null, undefined]), true);
  // Numeric tally shape (from readRelayPublishSummary) also works.
  assert.equal(anyRelayAcceptedInSummaries([{ accepted: 0, total: 2 }]), false);
  assert.equal(anyRelayAcceptedInSummaries([{ accepted: 1, total: 2 }]), true);
});
