import { Avatar } from "./Avatar.js";
import { formatZapAmount } from "./zapHelpers.js";

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

export function ContactRow({
  document: doc,
  contact = {},
  isActive = false,
  tabIndex = -1,
  onSelect,
} = {}) {
  if (!doc) {
    throw new Error("ContactRow requires a document reference.");
  }

  const {
    id = "",
    name = "Unknown",
    preview = "",
    timestamp = "",
    unreadCount = 0,
    avatarSrc = "",
    status = "",
    zapTotalSats = null,
  } = contact;

  const button = createElement(doc, "button", "dm-contact-row");
  button.type = "button";
  button.dataset.conversationId = id;
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(Boolean(isActive)));
  button.tabIndex = tabIndex;
  if (isActive) {
    button.classList.add("dm-contact-row--active");
  }

  const avatar = Avatar({
    document: doc,
    src: avatarSrc,
    alt: name,
    initials: name,
    status,
  });
  button.appendChild(avatar);

  const content = createElement(doc, "div", "dm-contact-row__content");
  const header = createElement(doc, "div", "dm-contact-row__header");
  const nameEl = createElement(doc, "span", "dm-contact-row__name", name);
  header.appendChild(nameEl);

  const meta = createElement(doc, "span", "dm-contact-row__meta");
  const timeEl = createElement(doc, "span", "dm-contact-row__time", timestamp);
  meta.appendChild(timeEl);

  if (Number.isFinite(zapTotalSats)) {
    const zapTotal = createElement(
      doc,
      "span",
      "dm-contact-row__zap",
      formatZapAmount(zapTotalSats, { compact: true }),
    );
    zapTotal.setAttribute(
      "aria-label",
      `Total zaps ${formatZapAmount(zapTotalSats)}`,
    );
    meta.appendChild(zapTotal);
  }

  header.appendChild(meta);
  content.appendChild(header);

  const previewEl = createElement(
    doc,
    "div",
    "dm-contact-row__preview",
    preview,
  );
  content.appendChild(previewEl);

  if (unreadCount > 0) {
    const badge = createElement(doc, "span", "dm-contact-row__badge");
    badge.textContent = `${unreadCount}`;
    badge.setAttribute("aria-label", `${unreadCount} unread messages`);
    content.appendChild(badge);
  }

  button.appendChild(content);

  if (typeof onSelect === "function") {
    button.addEventListener("click", () => onSelect(contact));
  }

  return button;
}
