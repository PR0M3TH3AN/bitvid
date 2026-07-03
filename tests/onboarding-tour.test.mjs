// First-run onboarding (docs/onboarding-plan.md): the per-pubkey once flag and
// the tour engine's lifecycle (spotlight + popover + next/skip + auto-skipping
// steps whose anchor is missing), driven against real JSDOM.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-onboarding-first-run
//       given: "a fresh pubkey / a completed pubkey; a DOM with some tour anchors"
//       when: "shouldOfferOnboarding + launchBitvidTour/createTour run"
//       then: "offered once; completing/skipping records the flag; steps with missing anchors are skipped; force reruns"
//   observable_outcomes:
//     - "fresh pubkey -> offer true; completed/skipped -> offer false; force -> starts anyway"
//     - "tour renders overlay + popover; Next advances; Done finishes -> completed flag"
//     - "Skip records skipped and removes the overlay"
//     - "steps with absent targets are excluded from the dot count"
//   determinism_controls:
//     - "JSDOM; in-memory localStorage polyfill; no timers beyond direct calls"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test, { beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  shouldOfferOnboarding,
  markOnboarding,
  resetOnboarding,
} from "../js/services/onboardingService.js";
import { createTour } from "../js/ui/onboarding/tourEngine.js";
import { launchBitvidTour } from "../js/ui/onboarding/bitvidTour.js";

const PUB = "a".repeat(64);

beforeEach(() => {
  localStorage.clear();
});

test("flag: offered when fresh; not after completed/skipped; reset restores", () => {
  assert.equal(shouldOfferOnboarding(PUB), true);
  markOnboarding(PUB, "completed");
  assert.equal(shouldOfferOnboarding(PUB), false);
  resetOnboarding(PUB);
  assert.equal(shouldOfferOnboarding(PUB), true);
  markOnboarding(PUB, "skipped");
  assert.equal(shouldOfferOnboarding(PUB), false);
  assert.equal(shouldOfferOnboarding(""), false, "no pubkey never offers");
});

function makeDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><body><nav id="sidebar"></nav><button data-testid="upload-button"></button></body>',
    { pretendToBeVisual: true },
  );
  return dom.window.document;
}

test("tour lifecycle: renders, advances, Done records completion", () => {
  const doc = makeDom();
  let finished = false;
  const tour = createTour({
    document: doc,
    steps: [
      { id: "welcome", title: "Hi", body: "b" },
      { id: "feeds", target: "#sidebar", title: "Feeds", body: "b" },
      { id: "gone", target: "#does-not-exist", title: "Missing", body: "b" },
      { id: "upload", target: '[data-testid="upload-button"]', title: "Up", body: "b" },
    ],
    onFinish: () => {
      finished = true;
    },
  });

  assert.equal(tour.start(), true);
  const popover = doc.querySelector(".bv-tour-popover");
  assert.ok(popover, "popover rendered");
  assert.ok(doc.querySelector(".bv-tour-scrim"), "spotlight scrim rendered");
  assert.equal(
    doc.querySelectorAll(".bv-tour-dots span").length,
    3,
    "missing-anchor step excluded from progress dots",
  );
  assert.match(popover.querySelector("h3").textContent, /Hi/);

  // Advance through all available steps via the primary button.
  const clickPrimary = () => {
    const buttons = Array.from(popover.querySelectorAll("button"));
    buttons[buttons.length - 1].click();
  };
  clickPrimary(); // -> feeds
  assert.match(popover.querySelector("h3").textContent, /Feeds/);
  clickPrimary(); // -> upload (skips missing)
  assert.match(popover.querySelector("h3").textContent, /Up/);
  clickPrimary(); // Done
  assert.equal(finished, true, "onFinish fired");
  assert.equal(doc.querySelector(".bv-tour-root"), null, "overlay removed");
});

test("Skip records skipped and tears down", () => {
  const doc = makeDom();
  let skipped = false;
  const tour = createTour({
    document: doc,
    steps: [{ id: "welcome", title: "Hi", body: "b" }],
    onSkip: () => {
      skipped = true;
    },
  });
  tour.start();
  doc.querySelector(".bv-tour-skip").click();
  assert.equal(skipped, true);
  assert.equal(doc.querySelector(".bv-tour-root"), null);
});

test("launchBitvidTour: offers once per pubkey, force reruns, records the flag", () => {
  const doc = makeDom();

  assert.equal(
    launchBitvidTour({ pubkey: PUB, document: doc }),
    true,
    "fresh pubkey starts the tour",
  );
  // Skip it → flag recorded.
  doc.querySelector(".bv-tour-skip").click();
  assert.equal(shouldOfferOnboarding(PUB), false, "skip recorded");

  assert.equal(
    launchBitvidTour({ pubkey: PUB, document: doc }),
    false,
    "not offered again automatically",
  );
  assert.equal(
    launchBitvidTour({ pubkey: PUB, document: doc, force: true }),
    true,
    "force ('Take the tour') reruns it",
  );
  doc.querySelector(".bv-tour-skip").click();
});

test("final-card action buttons deep-link and complete the tour", () => {
  const doc = makeDom();
  const panes = [];
  launchBitvidTour({
    pubkey: PUB,
    document: doc,
    openProfilePane: (pane) => panes.push(pane),
  });

  // Jump to the last step by clicking primary until the actions appear.
  const popover = doc.querySelector(".bv-tour-popover");
  for (let i = 0; i < 10 && doc.querySelector(".bv-tour-root"); i += 1) {
    const buttons = Array.from(popover.querySelectorAll("button"));
    const storage = buttons.find((b) => /Set up storage/.test(b.textContent));
    if (storage) {
      storage.click();
      break;
    }
    buttons[buttons.length - 1].click();
  }

  assert.deepEqual(panes, ["storage"], "deep-linked into the storage pane");
  assert.equal(doc.querySelector(".bv-tour-root"), null, "tour closed");
  assert.equal(shouldOfferOnboarding(PUB), false, "completion recorded");
});
