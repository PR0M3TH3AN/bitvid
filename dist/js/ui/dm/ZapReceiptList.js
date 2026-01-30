import { formatZapAmount, normalizeZapReceipt } from "./zapHelpers.js";

function createElement(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (typeof text === "string") {
    element.textContent = text;
  }
  return element;
}

function formatStatus(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!normalized) {
    return "Unverified";
  }
  if (normalized === "confirmed" || normalized === "paid") {
    return "Confirmed";
  }
  if (normalized === "pending") {
    return "Pending";
  }
  if (normalized === "failed") {
    return "Failed";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function ZapReceiptList({
  document: doc,
  receipts = [],
  emptyLabel = "No zap receipts yet.",
} = {}) {
  if (!doc) {
    throw new Error("ZapReceiptList requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-zap-receipts");
  const header = createElement(doc, "div", "dm-zap-receipts__header");
  header.appendChild(createElement(doc, "h4", "dm-zap-receipts__title", "Zap receipts"));
  root.appendChild(header);

  const list = createElement(doc, "ul", "dm-zap-receipts__list");
  const normalizedReceipts = Array.isArray(receipts) ? receipts.map(normalizeZapReceipt) : [];

  if (!normalizedReceipts.length) {
    const empty = createElement(doc, "p", "dm-zap-receipts__empty", emptyLabel);
    root.appendChild(empty);
    return root;
  }

  normalizedReceipts.forEach((receipt) => {
    const item = createElement(doc, "li", "dm-zap-receipts__item");
    item.dataset.kind = String(receipt?.kind || 9735);

    const amount = createElement(
      doc,
      "span",
      "dm-zap-receipts__amount",
      formatZapAmount(receipt.amountSats),
    );
    item.appendChild(amount);

    const details = createElement(doc, "div", "dm-zap-receipts__details");
    const senderName = receipt?.senderName || receipt?.sender || "Unknown sender";
    details.appendChild(
      createElement(doc, "span", "dm-zap-receipts__sender", senderName),
    );

    if (receipt?.note) {
      details.appendChild(createElement(doc, "span", "dm-zap-receipts__note", receipt.note));
    }

    item.appendChild(details);

    const meta = createElement(doc, "div", "dm-zap-receipts__meta");
    if (receipt?.timestamp) {
      meta.appendChild(
        createElement(doc, "span", "dm-zap-receipts__time", receipt.timestamp),
      );
    }

    const status = createElement(
      doc,
      "span",
      "dm-zap-receipts__status",
      formatStatus(receipt?.status),
    );
    status.dataset.status = receipt?.status || "unverified";
    meta.appendChild(status);

    item.appendChild(meta);
    list.appendChild(item);
  });

  root.appendChild(list);
  return root;
}
