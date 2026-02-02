import { createModalAccessibility } from "./modalAccessibility.js";

const accessibilityByModal = new WeakMap();

function resolveDocument(preferred) {
  if (preferred) {
    return preferred;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

function isElement(value) {
  if (typeof Element === "undefined") {
    return false;
  }
  return value instanceof Element;
}

function resolveRoot(target, doc = resolveDocument()) {
  if (!target) {
    return null;
  }
  if (isElement(target)) {
    return target;
  }
  if (typeof target === "string") {
    const context = resolveDocument(doc);
    if (!context) {
      return null;
    }
    return context.getElementById(target) || null;
  }
  return null;
}

function getOrCreateAccessibility(root) {
  if (!root) {
    return null;
  }
  let record = accessibilityByModal.get(root);
  if (record) {
    return record;
  }

  const doc = resolveDocument(root.ownerDocument);
  if (!doc) {
    return null;
  }

  const panel =
    root.querySelector(".bv-modal__panel") ||
    root.querySelector("[role='dialog']") ||
    root;
  const backdrop = root.querySelector(".bv-modal-backdrop") || root;

  const modalAccessibility = createModalAccessibility({
    root,
    panel,
    backdrop,
    document: doc,
    onRequestClose: () => {
      closeStaticModal(root);
    },
  });

  record = { document: doc, accessibility: modalAccessibility };
  accessibilityByModal.set(root, record);
  return record;
}

function synchronizeDocumentModalState(doc) {
  if (!doc) {
    return;
  }
  const openModals = doc.querySelectorAll(".bv-modal:not(.hidden)");
  if (openModals.length > 0) {
    doc.documentElement?.classList.add("modal-open");
    doc.body?.classList.add("modal-open");
  } else {
    doc.documentElement?.classList.remove("modal-open");
    doc.body?.classList.remove("modal-open");
  }
}

export function prepareStaticModal({ id, root, document: providedDocument } = {}) {
  const doc = resolveDocument(providedDocument);
  const target = root || (typeof id === "string" ? doc?.getElementById(id) : null);
  if (!target) {
    return null;
  }
  const record = getOrCreateAccessibility(target);
  if (!record) {
    return null;
  }
  if (!target.hasAttribute("data-open")) {
    target.setAttribute(
      "data-open",
      target.classList.contains("hidden") ? "false" : "true"
    );
  }
  return target;
}

export function openStaticModal(target, { triggerElement, document: providedDocument } = {}) {
  const doc = resolveDocument(providedDocument);
  const root = resolveRoot(target, doc);
  if (!root) {
    return false;
  }
  const record = getOrCreateAccessibility(root);
  if (!record) {
    return false;
  }

  root.classList.remove("hidden");
  root.setAttribute("data-open", "true");
  synchronizeDocumentModalState(record.document);
  record.accessibility.activate({ triggerElement });
  return true;
}

export function closeStaticModal(target, { document: providedDocument } = {}) {
  const doc = resolveDocument(providedDocument);
  const root = resolveRoot(target, doc);
  if (!root) {
    return false;
  }
  const record = getOrCreateAccessibility(root);
  if (!record) {
    return false;
  }

  root.classList.add("hidden");
  root.setAttribute("data-open", "false");
  record.accessibility.deactivate();
  synchronizeDocumentModalState(record.document);
  return true;
}

