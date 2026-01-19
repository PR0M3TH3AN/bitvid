import { DayDivider } from "./DayDivider.js";
import { MessageBubble } from "./MessageBubble.js";

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

export function MessageThread({
  document: doc,
  contact = {},
  messages = [],
  state = "idle",
  errorType = "",
} = {}) {
  if (!doc) {
    throw new Error("MessageThread requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-message-thread");

  const header = createElement(doc, "header", "dm-message-thread__header");
  header.appendChild(
    createElement(
      doc,
      "h3",
      "dm-message-thread__title",
      contact.name || "Direct Messages",
    ),
  );
  if (contact.status) {
    header.appendChild(
      createElement(doc, "span", "dm-message-thread__status", contact.status),
    );
  }
  root.appendChild(header);

  const timeline = createElement(doc, "div", "dm-message-thread__timeline");
  timeline.setAttribute("role", "log");
  timeline.setAttribute("aria-live", "polite");

  const newMessagesBanner = createElement(
    doc,
    "button",
    "dm-message-thread__new",
    "New messages",
  );
  newMessagesBanner.type = "button";
  newMessagesBanner.setAttribute("aria-label", "Jump to newest messages");
  timeline.appendChild(newMessagesBanner);

  const stateEl = createElement(doc, "div", "dm-message-thread__state");

  if (state === "loading") {
    stateEl.textContent = "Decrypting messages…";
    timeline.appendChild(stateEl);
  } else if (state === "empty") {
    stateEl.textContent = "Say hello to start the conversation.";
    timeline.appendChild(stateEl);
  } else if (state === "error") {
    const errorMessage =
      errorType === "decrypt"
        ? "We couldn't decrypt some messages."
        : "Something went wrong loading this thread.";
    stateEl.textContent = errorMessage;
    timeline.appendChild(stateEl);
  } else {
    messages.forEach((message) => {
      if (message.type === "day") {
        timeline.appendChild(DayDivider({ document: doc, label: message.label }));
        return;
      }
      const bubble = MessageBubble({
        document: doc,
        message,
        variant: message.direction === "outgoing" ? "outgoing" : "incoming",
      });
      timeline.appendChild(bubble);
    });
  }

  root.appendChild(timeline);
  return root;
}
