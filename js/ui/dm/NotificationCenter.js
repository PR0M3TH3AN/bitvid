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

export function NotificationCenter({ document: doc, notices = [] } = {}) {
  if (!doc) {
    throw new Error("NotificationCenter requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-notification-center");

  if (!notices.length) {
    const placeholder = createElement(
      doc,
      "div",
      "dm-notification-center__empty",
      "You're all caught up.",
    );
    root.appendChild(placeholder);
    return root;
  }

  notices.forEach((notice) => {
    const item = createElement(doc, "div", "dm-notification-center__item");
    if (notice.variant) {
      item.classList.add(`dm-notification-center__item--${notice.variant}`);
    }
    item.textContent = notice.message || "";
    root.appendChild(item);
  });

  return root;
}
