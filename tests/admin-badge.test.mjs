import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { ADMIN_SUPER_NPUB } from "../js/config.js";
import {
  applyAdminStar,
  decorateAdminAvatar,
  isAdminActor,
} from "../js/ui/adminBadge.js";

const dom = new JSDOM("<!doctype html><body></body>");
const doc = dom.window.document;

// A validly-prefixed but non-admin npub. isAdminActor compares against the
// admin lists, so it doesn't need to be a real bech32 payload.
const STRANGER_NPUB = "npub1" + "q".repeat(58);

test("isAdminActor recognizes the super admin and rejects a stranger", () => {
  assert.equal(isAdminActor(ADMIN_SUPER_NPUB), true);
  assert.equal(isAdminActor(STRANGER_NPUB), false);
  assert.equal(isAdminActor(""), false);
  assert.equal(isAdminActor(null), false);
});

test("applyAdminStar adds exactly one star for an admin and is idempotent", () => {
  const el = doc.createElement("div");
  assert.equal(applyAdminStar(el, ADMIN_SUPER_NPUB, { doc }), true);
  // second call must not duplicate the badge
  applyAdminStar(el, ADMIN_SUPER_NPUB, { doc });
  const stars = el.querySelectorAll(".admin-star");
  assert.equal(stars.length, 1);
  assert.equal(stars[0].getAttribute("aria-hidden"), "true");
  assert.equal(stars[0].textContent, "★");
});

test("applyAdminStar renders nothing for a non-admin and clears a stale star", () => {
  const el = doc.createElement("div");
  applyAdminStar(el, ADMIN_SUPER_NPUB, { doc });
  assert.equal(el.querySelectorAll(".admin-star").length, 1);
  // the same node later shows a non-admin → the star must be removed
  assert.equal(applyAdminStar(el, STRANGER_NPUB, { doc }), false);
  assert.equal(el.querySelectorAll(".admin-star").length, 0);
});

test("applyAdminStar is a no-op with no container", () => {
  assert.equal(applyAdminStar(null, ADMIN_SUPER_NPUB, { doc }), false);
});

test("decorateAdminAvatar wraps, rings, and stars an admin avatar (attached)", () => {
  const parent = doc.createElement("div");
  const avatar = doc.createElement("span");
  parent.appendChild(avatar);

  const wrap = decorateAdminAvatar(avatar, ADMIN_SUPER_NPUB, { doc });

  // wrapped in place, ring on the avatar, star on the wrap
  assert.ok(wrap.classList.contains("admin-avatar-wrap"));
  assert.equal(avatar.parentElement, wrap);
  assert.equal(wrap.parentElement, parent, "wrapper takes the avatar's place");
  assert.ok(avatar.classList.contains("admin-ring"));
  assert.equal(wrap.querySelectorAll(".admin-star").length, 1);
});

test("decorateAdminAvatar is idempotent and reuses the wrapper", () => {
  const parent = doc.createElement("div");
  const avatar = doc.createElement("span");
  parent.appendChild(avatar);

  const first = decorateAdminAvatar(avatar, ADMIN_SUPER_NPUB, { doc });
  const second = decorateAdminAvatar(avatar, ADMIN_SUPER_NPUB, { doc });
  assert.equal(first, second, "same wrapper reused");
  assert.equal(parent.querySelectorAll(".admin-avatar-wrap").length, 1);
  assert.equal(first.querySelectorAll(".admin-star").length, 1);
});

test("decorateAdminAvatar adds no ring/star for a non-admin", () => {
  const parent = doc.createElement("div");
  const avatar = doc.createElement("span");
  parent.appendChild(avatar);

  decorateAdminAvatar(avatar, STRANGER_NPUB, { doc });
  assert.equal(avatar.classList.contains("admin-ring"), false);
  // wrapper may exist but must carry no star
  assert.equal(parent.querySelectorAll(".admin-star").length, 0);
});

test("decorateAdminAvatar handles a detached avatar (returns the wrapper to append)", () => {
  const avatar = doc.createElement("span");
  const wrap = decorateAdminAvatar(avatar, ADMIN_SUPER_NPUB, { doc });
  assert.ok(wrap.classList.contains("admin-avatar-wrap"));
  assert.equal(avatar.parentElement, wrap);
  assert.ok(avatar.classList.contains("admin-ring"));
  assert.equal(wrap.querySelectorAll(".admin-star").length, 1);
});
