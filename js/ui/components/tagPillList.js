/**
 * Tag pill list helpers for rendering and updating the compact tag strip used on video cards.
 *
 * Usage:
 * ```js
 * const { root } = renderTagPillStrip({ tags: ["nostr", "bitvid"], onTagActivate });
 * container.append(root);
 * ```
 */

function resolveDocument(doc) {
  if (doc) {
    return doc;
  }

  return typeof globalThis !== "undefined" ? globalThis.document : undefined;
}

function assertDocument(doc) {
  if (!doc) {
    throw new Error("A document instance is required to render tag pill lists.");
  }
}

const TAG_PREFERENCE_STATES = new Set(["interest", "disinterest"]);

function normalizeTagPreferenceState(state) {
  if (typeof state !== "string") {
    return "neutral";
  }

  const trimmed = state.trim().toLowerCase();
  if (TAG_PREFERENCE_STATES.has(trimmed)) {
    return trimmed;
  }

  return "neutral";
}

function applyPreferenceState(button, state) {
  if (!button || typeof button !== "object" || button.nodeType !== 1) {
    return;
  }

  const normalized = normalizeTagPreferenceState(state);
  button.dataset.preferenceState = normalized;

  if (normalized === "interest") {
    button.dataset.variant = "success";
  } else if (normalized === "disinterest") {
    button.dataset.variant = "critical";
  } else {
    delete button.dataset.variant;
  }
}

export function applyTagPreferenceState(button, state) {
  applyPreferenceState(button, state);
}

function createTagButton({ doc, tag, onTagActivate, getTagState }) {
  const button = doc.createElement("button");
  button.type = "button";
  button.classList.add("pill", "video-tag-pill", "focus-ring");
  button.dataset.tag = tag;
  button.title = `#${tag}`;

  const label = doc.createElement("span");
  label.className = "video-tag-pill__label";
  label.textContent = `#${tag}`;

  const icon = doc.createElement("span");
  icon.className = "video-tag-pill__icon";
  icon.setAttribute("aria-hidden", "true");

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("focusable", "false");

  const path = doc.createElementNS(svgNS, "path");
  path.setAttribute(
    "d",
    "M8.75 3.5a.75.75 0 0 0-1.5 0v3.75H3.5a.75.75 0 1 0 0 1.5h3.75V12.5a.75.75 0 0 0 1.5 0V8.75H12.5a.75.75 0 0 0 0-1.5H8.75z",
  );

  svg.append(path);
  icon.append(svg);

  button.append(label, icon);

  if (getTagState) {
    try {
      const state = getTagState(tag);
      applyPreferenceState(button, state);
    } catch (error) {
      // Ignore state resolution errors; leave button in neutral state.
    }
  } else {
    applyPreferenceState(button, null);
  }

  if (onTagActivate) {
    const handler = (event) => {
      onTagActivate(tag, { event, button });
    };
    button.addEventListener("click", handler);
    // Store the handler for cleanup when the strip is updated.
    button.__tagPillClickHandler = handler;
  }

  return button;
}

function cleanupButtonHandler(button) {
  if (!button || typeof button !== "object" || button.nodeType !== 1) {
    return;
  }

  const handler = button.__tagPillClickHandler;
  if (handler) {
    button.removeEventListener("click", handler);
    delete button.__tagPillClickHandler;
  }
}

function removeTagButton(button) {
  if (!button || typeof button !== "object" || button.nodeType !== 1) {
    return;
  }

  cleanupButtonHandler(button);

  if (typeof button.remove === "function") {
    button.remove();
  } else if (button.parentNode) {
    button.parentNode.removeChild(button);
  }
}

function cleanupExistingButtons(root) {
  for (const button of root.querySelectorAll("button")) {
    cleanupButtonHandler(button);
  }
  root.textContent = "";
}

function getAvailableContainerWidth(container) {
  if (!container || container.nodeType !== 1) {
    return 0;
  }

  const clientWidth = Number(container.clientWidth || 0);
  if (Number.isFinite(clientWidth) && clientWidth > 0) {
    return clientWidth;
  }

  if (typeof container.getBoundingClientRect === "function") {
    try {
      const rect = container.getBoundingClientRect();
      if (rect && typeof rect.width === "number" && rect.width > 0) {
        return rect.width;
      }
    } catch (error) {
      // Ignore measurement errors and fall through to return 0.
    }
  }

  return 0;
}

export function trimTagPillStripToFit({ strip, container } = {}) {
  if (!strip || typeof strip !== "object" || strip.nodeType !== 1) {
    return { removedButtons: [] };
  }

  const host =
    container && typeof container === "object" && container.nodeType === 1
      ? container
      : strip.parentElement;

  const availableWidth = Math.max(0, getAvailableContainerWidth(host));
  const removedButtons = [];

  const buttons = Array.from(strip.querySelectorAll("button"));
  if (!buttons.length) {
    return { removedButtons };
  }

  if (availableWidth <= 0) {
    return { removedButtons };
  }

  let currentButtons = buttons.length;
  while (currentButtons > 0 && strip.scrollWidth > availableWidth) {
    const button = buttons[currentButtons - 1];
    if (!button) {
      break;
    }
    removeTagButton(button);
    removedButtons.push(button);
    currentButtons -= 1;
  }

  return { removedButtons };
}

export function renderTagPillStrip({
  document: doc,
  tags = [],
  onTagActivate,
  getTagState,
  scrollable = false,
} = {}) {
  const resolvedDocument = resolveDocument(doc);
  assertDocument(resolvedDocument);

  const root = resolvedDocument.createElement("div");
  root.classList.add("video-tag-strip");
  if (scrollable) {
    root.classList.add("video-tag-strip--scroll");
  }

  const buttons = tags.map((tag) =>
    createTagButton({
      doc: resolvedDocument,
      tag,
      onTagActivate,
      getTagState,
    }),
  );
  root.append(...buttons);

  return { root, buttons };
}

export function updateTagPillStrip({
  root,
  tags = [],
  onTagActivate,
  getTagState,
  document: doc,
} = {}) {
  if (!root) {
    throw new Error("A root element is required to update the tag pill strip.");
  }

  const resolvedDocument = resolveDocument(doc ?? root?.ownerDocument);
  assertDocument(resolvedDocument);

  cleanupExistingButtons(root);

  const buttons = tags.map((tag) =>
    createTagButton({
      doc: resolvedDocument,
      tag,
      onTagActivate,
      getTagState,
    }),
  );
  root.append(...buttons);

  return { root, buttons };
}
