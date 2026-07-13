// js/ui/adminBadge.js
//
// Shared "this profile belongs to a bitvid admin" badges. An admin is the super
// admin OR a current list editor (moderator). Two visual treatments, driven off
// one synchronous check (`isAdminActor`):
//   • a small gold STAR in the corner opposite the red notification dot
//     (`.admin-star`), and
//   • a gold RING around the avatar (`.admin-ring`).
// Styling lives in the matching CSS rules.
//
// `isAdminActor` is synchronous, so editors added to the admin lists only show
// once those lists have loaded from relays; the super admin (known from config)
// always resolves immediately. Surfaces that persist across a session (e.g. the
// profile button) should re-decorate on accessControl.onEditorsChange so a
// late-loading editor list still lights up.

import { accessControl } from "../accessControl.js";
import { safeEncodeNpub } from "../utils/nostrHelpers.js";

export const ADMIN_STAR_CLASS = "admin-star";
export const ADMIN_RING_CLASS = "admin-ring";
export const ADMIN_WRAP_CLASS = "admin-avatar-wrap";

/**
 * Is the given actor (hex pubkey or npub) a bitvid admin?
 * @param {string} pubkeyOrNpub
 * @returns {boolean}
 */
export function isAdminActor(pubkeyOrNpub) {
  const npub = safeEncodeNpub(pubkeyOrNpub);
  if (!npub) {
    return false;
  }
  try {
    return Boolean(accessControl?.isAdminEditor?.(npub));
  } catch (error) {
    return false;
  }
}

function findDirectStar(container) {
  for (const child of Array.from(container.children || [])) {
    if (child.classList?.contains(ADMIN_STAR_CLASS)) {
      return child;
    }
  }
  return null;
}

// Pure DOM: add/remove the star in `container` given an already-computed
// decision. `container` MUST be positioned + non-clipped.
function setAdminStar(container, show, { doc, label }) {
  if (!container || typeof container.querySelector !== "function" || !doc) {
    return false;
  }
  const existing = findDirectStar(container);
  if (show) {
    if (!existing) {
      const star = doc.createElement("span");
      star.className = ADMIN_STAR_CLASS;
      star.setAttribute("aria-hidden", "true");
      star.title = label;
      star.textContent = "★";
      container.appendChild(star);
    }
  } else if (existing) {
    existing.remove();
  }
  return show;
}

/**
 * Show or hide the admin star inside `container`. The container MUST be a
 * position:relative, non-clipped element (the star is absolutely positioned in
 * its corner) — for avatars that clip to a circle, pass a wrapper around the
 * clipped element, not the clipped element itself.
 *
 * Idempotent. Returns whether a star is present after the call.
 *
 * @param {Element|null} container
 * @param {string} pubkeyOrNpub
 * @param {{ doc?: Document, label?: string }} [options]
 * @returns {boolean}
 */
export function applyAdminStar(
  container,
  pubkeyOrNpub,
  { doc = typeof document !== "undefined" ? document : null, label = "bitvid admin" } = {},
) {
  return setAdminStar(container, isAdminActor(pubkeyOrNpub), { doc, label });
}

/**
 * Toggle just the gold ring on a circular element (for surfaces that already
 * place the star on a specific element and only need the ring added). The
 * element should be circular (border-radius) for the ring to read right.
 * @param {Element|null} el
 * @param {string} pubkeyOrNpub
 * @returns {boolean} whether the ring is applied
 */
export function applyAdminRing(el, pubkeyOrNpub) {
  if (!el || !el.classList) {
    return false;
  }
  const isAdmin = isAdminActor(pubkeyOrNpub);
  el.classList.toggle(ADMIN_RING_CLASS, isAdmin);
  return isAdmin;
}

/**
 * Decorate a circular avatar element with BOTH the admin ring and the corner
 * star. `avatarEl` is the circular element (an <img> or a clip container). The
 * ring is a box-shadow on `avatarEl` itself (not clipped by its own overflow);
 * the star needs a non-clipped, positioned wrapper, so this ensures `avatarEl`
 * is wrapped in a `.admin-avatar-wrap` span and hangs the star off that.
 *
 * Idempotent — reuses an existing wrapper. Works whether `avatarEl` is already
 * attached to the DOM (wraps it in place) or freshly built and detached (wraps
 * it and returns the wrapper for the caller to append).
 *
 * @param {Element|null} avatarEl
 * @param {string} pubkeyOrNpub
 * @param {{ doc?: Document, label?: string }} [options]
 * @returns {Element|null} the wrapper node (append THIS, not the bare avatar)
 */
export function decorateAdminAvatar(
  avatarEl,
  pubkeyOrNpub,
  { doc = typeof document !== "undefined" ? document : null, label = "bitvid admin" } = {},
) {
  if (!avatarEl || !avatarEl.classList || !doc) {
    return avatarEl || null;
  }
  const isAdmin = isAdminActor(pubkeyOrNpub);
  avatarEl.classList.toggle(ADMIN_RING_CLASS, isAdmin);

  let wrap = avatarEl.parentElement;
  const alreadyWrapped =
    wrap && wrap.classList && wrap.classList.contains(ADMIN_WRAP_CLASS);
  if (!alreadyWrapped) {
    wrap = doc.createElement("span");
    wrap.className = ADMIN_WRAP_CLASS;
    if (avatarEl.parentElement) {
      avatarEl.parentElement.insertBefore(wrap, avatarEl);
    }
    wrap.appendChild(avatarEl);
  }
  setAdminStar(wrap, isAdmin, { doc, label });
  return wrap;
}

export default {
  ADMIN_STAR_CLASS,
  ADMIN_RING_CLASS,
  ADMIN_WRAP_CLASS,
  isAdminActor,
  applyAdminStar,
  applyAdminRing,
  decorateAdminAvatar,
};
