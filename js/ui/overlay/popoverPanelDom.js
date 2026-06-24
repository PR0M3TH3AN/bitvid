// Pure DOM helpers for the popover engine, extracted to keep popoverEngine.js
// under its size budget.

function isElement(node) {
  return Boolean(node) && typeof node === "object" && node.nodeType === 1;
}

// True when the event target is a form control / editable element. The engine
// treats panels as ARIA menus (arrow-key nav + single-char typeahead, both
// preventDefault'd); that must NOT hijack keystrokes when the user is typing in a
// panel that contains inputs (e.g. the zap comment/amount fields) — otherwise
// letters and caret keys never reach the field and "you can't type" in the popup.
export function isEditableTarget(target) {
  if (!isElement(target)) {
    return false;
  }
  const tag = typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  if (target.isContentEditable === true) {
    return true;
  }
  const role =
    typeof target.getAttribute === "function" ? target.getAttribute("role") : "";
  return role === "textbox" || role === "searchbox" || role === "combobox";
}

// Move a panel into the portal (body-level overlay root) for the duration of the
// open state, so `position: fixed` is viewport-relative rather than resolving
// against a transformed/contained in-modal ancestor. Fresh render-created panels
// are already in the portal (no-op); this only relocates pre-existing, app-owned
// panels. Returns the origin { parent, nextSibling } to restore later, or null.
export function movePanelIntoPortal(panel, portal) {
  if (!panel || !portal || panel.parentNode === portal) {
    return null;
  }
  const origin = panel.parentNode
    ? { parent: panel.parentNode, nextSibling: panel.nextSibling }
    : null;
  portal.appendChild(panel);
  return origin;
}

// Put a relocated app-owned panel back exactly where it came from so the host
// (e.g. the video modal) keeps an intact DOM and the popover can be re-opened.
export function restorePanelToOrigin(panel, origin) {
  if (!panel || !origin) {
    return;
  }
  const { parent, nextSibling } = origin;
  if (!parent || typeof parent.insertBefore !== "function") {
    return;
  }
  try {
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(panel, nextSibling);
    } else {
      parent.appendChild(panel);
    }
  } catch (error) {
    // Best-effort: a failed restore must not break close().
  }
}
