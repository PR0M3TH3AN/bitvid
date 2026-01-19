import { ContactRow } from "./ContactRow.js";

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

function getFocusableItems(listEl) {
  return [...listEl.querySelectorAll("[data-conversation-id]")];
}

export function ConversationList({
  document: doc,
  conversations = [],
  activeId = "",
  state = "idle",
  onSelect,
} = {}) {
  if (!doc) {
    throw new Error("ConversationList requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-conversation-list");
  const header = createElement(doc, "div", "dm-conversation-list__header");
  header.appendChild(createElement(doc, "h2", "dm-conversation-list__title", "Messages"));
  root.appendChild(header);

  const list = createElement(doc, "div", "dm-conversation-list__items");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Conversation list");

  const renderState = createElement(doc, "div", "dm-conversation-list__state");

  if (state === "loading") {
    renderState.textContent = "Loading conversations…";
    list.appendChild(renderState);
  } else if (state === "empty") {
    renderState.textContent = "No conversations yet.";
    list.appendChild(renderState);
  } else if (state === "error") {
    renderState.textContent = "We couldn't load conversations.";
    list.appendChild(renderState);
  } else {
    const resolvedActiveId = activeId || (conversations[0] ? conversations[0].id : "");
    conversations.forEach((conversation, index) => {
      const isActive = conversation.id === resolvedActiveId;
      const row = ContactRow({
        document: doc,
        contact: conversation,
        isActive,
        tabIndex: isActive || (!resolvedActiveId && index === 0) ? 0 : -1,
        onSelect,
      });
      list.appendChild(row);
    });
  }

  list.addEventListener("keydown", (event) => {
    const items = getFocusableItems(list);
    if (!items.length) {
      return;
    }

    const currentIndex = items.indexOf(doc.activeElement);
    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowDown":
        nextIndex = Math.min(items.length - 1, currentIndex + 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    items[nextIndex].focus();
  });

  root.appendChild(list);
  return root;
}
