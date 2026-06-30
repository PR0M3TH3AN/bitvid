// #34 part (b): the "My Videos" mirror toggle must reflect RELAY TRUTH (the actual
// published NIP-71 mirror events), not just this device's local opt-in flag. On a
// fresh device or after a cache clear the local flag is missing/stale, so the row
// would otherwise lie about whether the video is already shared.
//
// Behavior under test (MyVideosController):
//   - buildMirrorButton tags the button with its videoRootId and labels it from the
//     local flag (synchronous, instant render).
//   - refreshMirrorStates() looks up relay truth (batched), corrects the button
//     label, AND reconciles the local flag so it becomes a correct cache.

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { MyVideosController } from "../js/ui/profileModal/MyVideosController.js";
import { nip71MirrorService } from "../js/services/nip71MirrorService.js";
import {
  isMirrorEnabled,
  setMirrorEnabled,
} from "../js/services/nip71MirrorFlags.js";

const PUBKEY = "f".repeat(64);
const ROOT_A = "11111111-1111-4111-8111-111111111111";
const ROOT_B = "22222222-2222-4222-8222-222222222222";

let dom;
let savedFindMirrors;
let savedCanMirror;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.CSS = dom.window.CSS;
  // canMirror must say "eligible" so buildMirrorButton renders the active (tagged)
  // button rather than the disabled "Share off" placeholder.
  savedCanMirror = nip71MirrorService.canMirror;
  nip71MirrorService.canMirror = () => ({ ok: true });
  savedFindMirrors = nip71MirrorService.findMirrors;
});

afterEach(() => {
  nip71MirrorService.findMirrors = savedFindMirrors;
  nip71MirrorService.canMirror = savedCanMirror;
  setMirrorEnabled(PUBKEY, ROOT_A, false);
  setMirrorEnabled(PUBKEY, ROOT_B, false);
  delete globalThis.document;
  delete globalThis.HTMLElement;
  delete globalThis.CSS;
});

function makeController() {
  const controller = new MyVideosController({ showStatus() {} });
  controller.pubkey = PUBKEY;
  controller.listEl = dom.window.document.createElement("div");
  return controller;
}

test("buildMirrorButton tags the button with its root and labels from the local flag", () => {
  const controller = makeController();
  setMirrorEnabled(PUBKEY, ROOT_A, true);
  const btn = controller.buildMirrorButton({ videoRootId: ROOT_A, url: "https://x/v.mp4" });
  assert.equal(btn.dataset.mirrorRoot, ROOT_A);
  assert.equal(btn.textContent, "Shared ✓");
});

test("refreshMirrorStates promotes an unmirrored-looking row when relays prove it IS shared", async () => {
  const controller = makeController();
  // Local flag is FALSE (fresh device), so the row renders "Share to apps"...
  setMirrorEnabled(PUBKEY, ROOT_A, false);
  const btn = controller.buildMirrorButton({ videoRootId: ROOT_A, url: "https://x/v.mp4" });
  controller.listEl.appendChild(btn);
  assert.equal(btn.textContent, "Share to apps", "precondition: starts from local flag");

  // ...but the relays actually hold a published mirror for this root.
  nip71MirrorService.findMirrors = async () =>
    new Map([[ROOT_A, { mirrored: true, kinds: [34235], duplicate: false }]]);

  await controller.refreshMirrorStates([{ videoRootId: ROOT_A }]);

  assert.equal(btn.textContent, "Shared ✓", "label corrected to relay truth");
  assert.equal(
    isMirrorEnabled(PUBKEY, ROOT_A),
    true,
    "local flag reconciled to relay truth (now a correct cache)",
  );
});

test("refreshMirrorStates clears a stale 'Shared ✓' when relays prove it is NOT shared", async () => {
  const controller = makeController();
  // Local flag wrongly says shared (e.g. mirror was deleted elsewhere).
  setMirrorEnabled(PUBKEY, ROOT_A, true);
  const btn = controller.buildMirrorButton({ videoRootId: ROOT_A, url: "https://x/v.mp4" });
  controller.listEl.appendChild(btn);
  assert.equal(btn.textContent, "Shared ✓", "precondition: stale local flag");

  // Relays hold nothing for this root.
  nip71MirrorService.findMirrors = async () => new Map();

  await controller.refreshMirrorStates([{ videoRootId: ROOT_A }]);

  assert.equal(btn.textContent, "Share to apps", "label corrected to relay truth");
  assert.equal(isMirrorEnabled(PUBKEY, ROOT_A), false, "stale local flag cleared");
});

test("refreshMirrorStates reconciles each row independently across the batch", async () => {
  const controller = makeController();
  setMirrorEnabled(PUBKEY, ROOT_A, false);
  setMirrorEnabled(PUBKEY, ROOT_B, true);
  const btnA = controller.buildMirrorButton({ videoRootId: ROOT_A, url: "https://x/a.mp4" });
  const btnB = controller.buildMirrorButton({ videoRootId: ROOT_B, url: "https://x/b.mp4" });
  controller.listEl.append(btnA, btnB);

  // A is actually shared on relays; B is not — the opposite of the local flags.
  nip71MirrorService.findMirrors = async () =>
    new Map([[ROOT_A, { mirrored: true, kinds: [34236], duplicate: false }]]);

  await controller.refreshMirrorStates([
    { videoRootId: ROOT_A },
    { videoRootId: ROOT_B },
  ]);

  assert.equal(btnA.textContent, "Shared ✓");
  assert.equal(btnB.textContent, "Share to apps");
  assert.equal(isMirrorEnabled(PUBKEY, ROOT_A), true);
  assert.equal(isMirrorEnabled(PUBKEY, ROOT_B), false);
});
