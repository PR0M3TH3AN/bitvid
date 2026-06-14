// Regression test for the nip-07-login CPU-peg / relay REQ storm.
//
// Scenario (SCN-contacts-emit-on-change):
//   Given the UI re-fetches trusted contacts whenever the moderation service
//     emits "contacts" (profileModalController.populateFriendsList ->
//     ensureViewerContactsLoaded -> fetchTrustedContacts -> rebuildTrustedContacts),
//   When rebuildTrustedContacts is invoked with an UNCHANGED contact set,
//   Then "contacts" is NOT emitted — otherwise the emit -> fetch -> emit chain
//     spins the CPU and floods relays with kind-3 REQs (observed ~1600/s).
//   And when the set genuinely changes, exactly one "contacts" event fires.

import test from "node:test";
import assert from "node:assert/strict";
import {
  withMockedNostrTools,
  createModerationServiceHarness,
} from "../helpers/moderation-test-helpers.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);

test("rebuildTrustedContacts emits 'contacts' only when the set changes", (t) => {
  withMockedNostrTools(t);
  const { service, capture } = createModerationServiceHarness(t);
  const emits = capture("contacts");

  // Establish a baseline population (a real change from the initial state).
  service.rebuildTrustedContacts(new Set([A, B]));
  const afterFirst = emits.length;
  assert.ok(afterFirst >= 1, "first real population should emit at least once");

  // Re-applying the SAME set repeatedly must NOT emit. This is the exact loop
  // that pegged the CPU: identical empty/unchanged rebuilds re-emitting forever.
  service.rebuildTrustedContacts(new Set([A, B]));
  service.rebuildTrustedContacts(new Set([A, B]));
  service.rebuildTrustedContacts(new Set([A, B]));
  assert.equal(
    emits.length,
    afterFirst,
    "unchanged contact sets must not emit (loop guard)",
  );

  // A genuine change emits exactly once more.
  service.rebuildTrustedContacts(new Set([A]));
  assert.equal(emits.length, afterFirst + 1, "a changed set emits once");

  // ...and re-applying that changed set is again silent.
  service.rebuildTrustedContacts(new Set([A]));
  assert.equal(
    emits.length,
    afterFirst + 1,
    "repeating the changed set must not emit",
  );
});
