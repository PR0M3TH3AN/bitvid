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

function createTagButton({ doc, tag, onTagActivate }) {
  const button = doc.createElement("button");
  button.type = "button";
  button.classList.add("pill", "video-tag-pill", "focus-ring");
  button.dataset.size = "compact";
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

function cleanupExistingButtons(root) {
  for (const button of root.querySelectorAll("button")) {
    const handler = button.__tagPillClickHandler;
    if (handler) {
      button.removeEventListener("click", handler);
      delete button.__tagPillClickHandler;
    }
  }
  root.textContent = "";
}

export function renderTagPillStrip({ document: doc, tags = [], onTagActivate } = {}) {
  const resolvedDocument = resolveDocument(doc);
  assertDocument(resolvedDocument);

  const root = resolvedDocument.createElement("div");
  root.classList.add("video-tag-strip");

  const buttons = tags.map((tag) =>
    createTagButton({ doc: resolvedDocument, tag, onTagActivate }),
  );
  root.append(...buttons);

  return { root, buttons };
}

export function updateTagPillStrip({
  root,
  tags = [],
  onTagActivate,
  document: doc,
} = {}) {
  if (!root) {
    throw new Error("A root element is required to update the tag pill strip.");
  }

  const resolvedDocument = resolveDocument(doc ?? root?.ownerDocument);
  assertDocument(resolvedDocument);

  cleanupExistingButtons(root);

  const buttons = tags.map((tag) =>
    createTagButton({ doc: resolvedDocument, tag, onTagActivate }),
  );
  root.append(...buttons);

  return { root, buttons };
}
