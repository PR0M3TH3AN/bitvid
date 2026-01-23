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
  onMarkAllRead,
  onRefresh,
} = {}) {
  if (!doc) {
    throw new Error("ConversationList requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-conversation-list");
  const header = createElement(doc, "div", "dm-conversation-list__header");
  // We removed the redundant "Messages" title here.
  // If we need spacing/alignment for the button, justify-end in CSS handles it.

  if (typeof onRefresh === "function") {
    const refreshBtn = createElement(doc, "button", "btn-ghost btn-icon");
    refreshBtn.type = "button";
    refreshBtn.dataset.size = "sm";
    refreshBtn.ariaLabel = "Refresh conversations";
    refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>`;
    refreshBtn.addEventListener("click", onRefresh);
    header.appendChild(refreshBtn);
  }

  if (typeof onMarkAllRead === "function") {
    const markAllButton = createElement(
      doc,
      "button",
      "btn-ghost ml-auto",
      "Mark all as read",
    );
    markAllButton.type = "button";
    markAllButton.dataset.size = "sm";
    markAllButton.disabled = !conversations.length;
    markAllButton.addEventListener("click", () => {
      onMarkAllRead();
    });
    header.appendChild(markAllButton);
  }

  if (header.hasChildNodes()) {
    root.appendChild(header);
  }

  const list = createElement(doc, "div", "dm-conversation-list__items no-scrollbar");
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

    // Peek animation
    if (conversations.length > 0) {
      if (typeof IntersectionObserver !== "undefined") {
        const observer = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            observer.disconnect();
            setTimeout(() => {
              if (list.scrollHeight > list.clientHeight) {
                list.scrollTo({ top: 40, behavior: "smooth" });
                setTimeout(() => {
                  list.scrollTo({ top: 0, behavior: "smooth" });
                }, 800);
              }
            }, 600);
          }
        }, { threshold: 0.1 });
        observer.observe(list);
      } else {
        // Fallback for no IntersectionObserver (e.g. some tests or very old browsers)
        setTimeout(() => {
          if (list.scrollHeight > list.clientHeight) {
            list.scrollTo({ top: 40, behavior: "smooth" });
            setTimeout(() => {
              list.scrollTo({ top: 0, behavior: "smooth" });
            }, 800);
          }
        }, 600);
      }
    }
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
