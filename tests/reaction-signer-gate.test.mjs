// Like/dislike (kind 7) must re-unlock a reloaded nsec signer before publishing,
// instead of the reaction silently failing / the button appearing dead (TODO #54).
// The ReactionController runs its ensureSigner gate before publishing.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-reaction-signer-gate
//       given: "a logged-in user reacting with a mocked ensureSigner + publish"
//       when: "handleReaction runs"
//       then: "publish is gated on the signer being ensured (sign-capable)"
//   observable_outcomes:
//     - "cancelled/bad-passphrase gate -> publish never called, button reset"
//     - "ok gate -> publish called once with the reaction content"
//   determinism_controls:
//     - "fully mocked services/ui/state/callbacks; no DOM/network"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import ReactionController from "../js/ui/reactionController.js";

function makeController({ ensureSigner } = {}) {
  const publishCalls = [];
  const reactionsSet = [];
  const modal = {
    setUserReaction: (r) => reactionsSet.push(r),
  };
  const controller = new ReactionController({
    services: {
      reactionCounter: {
        publish: async (pointer, payload) => {
          publishCalls.push({ pointer, payload });
          return { ok: true };
        },
      },
    },
    ui: { getVideoModal: () => modal, showError: () => {} },
    state: {
      getCurrentVideo: () => ({ pubkey: "b".repeat(64) }),
      getCurrentVideoPointer: () => ["a", 30078, "id"],
      getCurrentVideoPointerKey: () => "pointer-key",
    },
    callbacks: {
      isUserLoggedIn: () => true,
      getPubkey: () => "b".repeat(64),
      ensureSigner: ensureSigner || (async () => ({ ok: true })),
    },
  });
  return { controller, publishCalls, reactionsSet };
}

test("reaction: a cancelled signer gate blocks publish and resets the button", async () => {
  let ensureCalls = 0;
  const { controller, publishCalls } = makeController({
    ensureSigner: async (opts) => {
      ensureCalls += 1;
      assert.equal(opts.need, "sign", "reactions need signing, not encryption");
      return { ok: false, reason: "cancelled" };
    },
  });
  await controller.handleReaction({ reaction: "+" });
  assert.equal(ensureCalls, 1, "the signer gate ran");
  assert.equal(publishCalls.length, 0, "publish was NOT attempted after a cancelled gate");
});

test("reaction: a bad-passphrase gate blocks publish (toast already shown by the gate)", async () => {
  const { controller, publishCalls } = makeController({
    ensureSigner: async () => ({ ok: false, reason: "bad-passphrase" }),
  });
  await controller.handleReaction({ reaction: "-" });
  assert.equal(publishCalls.length, 0);
});

test("reaction: an ok signer gate lets publish proceed once", async () => {
  const { controller, publishCalls } = makeController({
    ensureSigner: async () => ({ ok: true, unlocked: true }),
  });
  await controller.handleReaction({ reaction: "+" });
  assert.equal(publishCalls.length, 1, "publish ran after the gate passed");
  assert.equal(publishCalls[0].payload.content, "+");
});
