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
} = {}) {
  if (!doc) {
    throw new Error("MessageBubble requires a document reference.");
  }

  const {
    body = "",
    timestamp = "",
    status = "sent",
  } = message;

  const wrapper = createElement(doc, "div", "dm-message-bubble");
  wrapper.classList.add(`dm-message-bubble--${variant}`);
  wrapper.dataset.status = status;

  const content = createElement(doc, "div", "dm-message-bubble__content", body);
  wrapper.appendChild(content);

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

  wrapper.appendChild(meta);
  return wrapper;
}
