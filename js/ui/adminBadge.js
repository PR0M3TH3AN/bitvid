// js/ui/adminBadge.js
//
// Shared "this profile belongs to a bitvid admin" star badge. An admin is the
// super admin OR a current list editor (moderator). The star is rendered as a
// small gold marker in the corner opposite the red notification dot, so a
// profile can show both at once. Styling lives in the `.admin-star` CSS rules.
//
// `isAdminActor` is a synchronous check, so editors added to the admin lists
// only show the star once those lists have loaded from relays; the super admin
// (known from config) always resolves immediately. Surfaces that persist across
// a session (e.g. the profile button) should re-run applyAdminStar on
// accessControl.onEditorsChange so a late-loading editor list still lights up.

import { accessControl } from "../accessControl.js";
import { safeEncodeNpub } from "../utils/nostrHelpers.js";

export const ADMIN_STAR_CLASS = "admin-star";

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

/**
 * Show or hide the admin star inside `container`. The container MUST be a
 * position:relative, non-clipped element (the star is absolutely positioned in
 * its corner) — for avatars that clip to a circle, pass a wrapper around the
 * clipped element, not the clipped element itself.
 *
 * Idempotent: safe to call repeatedly; it reuses/removes its own star only.
 *
 * @param {Element|null} container
 * @param {string} pubkeyOrNpub
 * @param {{ doc?: Document, label?: string }} [options]
 * @returns {boolean} whether a star is present after the call
 */
export function applyAdminStar(
  container,
  pubkeyOrNpub,
  { doc = typeof document !== "undefined" ? document : null, label = "bitvid admin" } = {},
) {
  if (!container || typeof container.querySelector !== "function" || !doc) {
    return false;
  }
  const show = isAdminActor(pubkeyOrNpub);
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
    return true;
  }
  if (existing) {
    existing.remove();
  }
  return false;
}

export default { ADMIN_STAR_CLASS, isAdminActor, applyAdminStar };
