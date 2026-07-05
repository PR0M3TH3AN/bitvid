// #9: the cold-login REQ storm's remaining emitters are unpinned, so a
// dev-gated tracer at the pool.sub choke point aggregates every subscription
// by kinds + emitting call site. These tests cover the aggregation, the
// call-site extraction (must skip pool plumbing frames), and that the hot
// path is a no-op while tracing is off.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-req-trace-aggregation
//       given: "a telemetry instance with an injected clock and log sink"
//       when: "subs with various kinds/relay counts are recorded and report() runs"
//       then: "rows are grouped by kinds+caller, sorted by count, with correct totals and REQ/s"
//   observable_outcomes:
//     - "disabled instance records nothing"
//     - "report() totals equal the recorded subs and relay fan-out"
//     - "plumbing frames (toolkit/relaySubscriptionService) never become the caller"
//   determinism_controls:
//     - "injected now(); no interval timers exercised; synthetic stacks"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import {
  createReqTelemetry,
  extractCallSite,
} from "../js/nostr/reqTelemetry.js";

const STACK = (site) =>
  [
    "Error",
    "    at recordReq (http://x/js/nostr/reqTelemetry.js:180:5)",
    "    at legacySub (http://x/js/nostr/toolkit.js:529:7)",
    `    at ${site}`,
  ].join("\n");

test("records aggregate by kinds + caller and report totals are honest", () => {
  let t = 0;
  const logs = [];
  const telem = createReqTelemetry({
    now: () => t,
    log: (payload) => logs.push(payload),
  });
  telem.start();
  t = 0;
  telem.reset();

  for (let i = 0; i < 3; i += 1) {
    telem.record(8, [{ kinds: [30000], authors: ["a"] }], STACK("loadLists (http://x/js/subscriptions.js:757:10)"));
  }
  telem.record(4, [{ kinds: [0] }, { kinds: [10050] }], STACK("dmBoot (http://x/js/services/dmNostrService.js:127:3)"));

  t = 5000; // 5s window
  const payload = telem.report({ emit: true });

  assert.equal(payload.totalSubs, 4);
  assert.equal(payload.totalRelayReqs, 28, "3×8 + 4 relay-level REQs");
  assert.equal(payload.perSecond, 5.6, "28 REQs over 5s");
  assert.equal(payload.byKindsAndCaller[0].kinds, "30000");
  assert.equal(payload.byKindsAndCaller[0].subs, 3);
  assert.match(payload.byKindsAndCaller[0].caller, /subscriptions\.js:757/);
  assert.equal(payload.byKindsAndCaller[1].kinds, "0,10050");
  assert.match(payload.byKindsAndCaller[1].caller, /dmNostrService\.js:127/);
  assert.equal(logs.length, 1, "report emitted through the injected sink");
});

test("disabled tracer records nothing; stop() disarms a started one", () => {
  const telem = createReqTelemetry({ now: () => 0, log: () => {} });
  telem.record(8, [{ kinds: [30000] }], STACK("x (http://x/js/a.js:1:1)"));
  assert.equal(telem.report({ emit: false }).totalSubs, 0, "off by default");

  telem.start();
  telem.record(2, [{ kinds: [7] }], STACK("x (http://x/js/a.js:1:1)"));
  telem.stop();
  telem.record(2, [{ kinds: [7] }], STACK("x (http://x/js/a.js:1:1)"));
  assert.equal(telem.report({ emit: false }).totalSubs, 1, "no records after stop");
});

test("call-site extraction skips pool plumbing and keeps module:line", () => {
  assert.match(
    extractCallSite(STACK("refresh (http://x/js/services/moderationService.js:843:20)")),
    /moderationService\.js:843/,
  );
  // Plumbing-only stack falls back to unknown rather than blaming the shim.
  assert.equal(
    extractCallSite(
      "Error\n    at legacySub (http://x/js/nostr/toolkit.js:529:7)\n    at ensureSubscription (http://x/js/services/relaySubscriptionService.js:158:1)",
    ),
    "unknown",
  );
  assert.equal(extractCallSite(""), "unknown");
  assert.equal(extractCallSite(undefined), "unknown");
});
