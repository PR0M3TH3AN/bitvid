const OVERLAY_ROOT_ID = "uiOverlay";
const OVERLAY_COMPONENT = "overlay-root";

function resolveDocument(documentRef) {
  if (documentRef && documentRef.nodeType === 9) {
    return documentRef;
  }
  if (typeof document !== "undefined" && document?.nodeType === 9) {
    return document;
  }
  return null;
}

function isElement(node) {
  return Boolean(node && typeof node === "object" && node.nodeType === 1);
}

function applyRootAttributes(element) {
  if (!element) {
    return;
  }

  if (element.getAttribute("aria-hidden") !== "true") {
    element.setAttribute("aria-hidden", "true");
  }
  if (!element.hasAttribute("data-overlay-root")) {
    element.setAttribute("data-overlay-root", "");
  }
  if (element.dataset.component !== OVERLAY_COMPONENT) {
    element.dataset.component = OVERLAY_COMPONENT;
  }
}

function ensureAttached(element, documentRef) {
  if (!element?.isConnected) {
    const doc = resolveDocument(documentRef);
    if (doc?.body) {
      doc.body.appendChild(element);
    } else if (doc?.documentElement) {
      doc.documentElement.appendChild(element);
    }
  }
}

export function ensureOverlayRoot(documentRef = null) {
  const doc = resolveDocument(documentRef);
  if (!doc) {
    return null;
  }

  let root = doc.getElementById(OVERLAY_ROOT_ID);
  if (!isElement(root)) {
    root = doc.createElement("div");
    root.id = OVERLAY_ROOT_ID;
  }

  applyRootAttributes(root);
  ensureAttached(root, doc);

  return root;
}

export default ensureOverlayRoot;
