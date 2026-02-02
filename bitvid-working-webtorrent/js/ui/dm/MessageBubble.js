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

export function MessageBubble({
  document: doc,
  message = {},
  variant = "incoming",
  avatarSrc = "",
} = {}) {
  if (!doc) {
    throw new Error("MessageBubble requires a document reference.");
  }

  const {
    body = "",
    timestamp = "",
    status = "sent",
  } = message;

  const row = createElement(doc, "div", "dm-message-row");
  row.classList.add(`dm-message-row--${variant}`);

  const avatar = createElement(doc, "img", "dm-message-avatar");
  avatar.src = avatarSrc || "assets/svg/default-profile.svg";
  avatar.alt = variant === "outgoing" ? "Me" : "Sender";

  const bubble = createElement(doc, "div", "dm-message-bubble");
  bubble.classList.add(`dm-message-bubble--${variant}`);
  bubble.dataset.status = status;

  const content = createElement(doc, "div", "dm-message-bubble__content", body);
  bubble.appendChild(content);

  const meta = createElement(doc, "div", "dm-message-bubble__meta");
  if (timestamp) {
    // Added 'text-muted' class for theme-respecting color (usually handles light/dark text)
    const timeSpan = createElement(doc, "span", "dm-message-bubble__time text-muted", timestamp);
    meta.appendChild(timeSpan);
  }

  if (variant === "outgoing") {
    const statusLabel = createElement(
      doc,
      "span",
      "dm-message-bubble__status",
      status === "failed"
        ? "Failed to send"
        : status === "pending"
          ? "Pending…"
          : status === "sending"
            ? "Sending…"
            : "Sent",
    );
    statusLabel.dataset.status = status;
    meta.appendChild(statusLabel);
  }

  bubble.appendChild(meta);

  if (variant === "outgoing") {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  return row;
}
