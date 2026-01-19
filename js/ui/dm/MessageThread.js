import { DayDivider } from "./DayDivider.js";
import { MessageBubble } from "./MessageBubble.js";
import { ZapReceiptList } from "./ZapReceiptList.js";
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

export function MessageThread({
  document: doc,
  contact = {},
  messages = [],
  state = "idle",
  errorType = "",
  privacyMode = "nip04",
  zapReceipts = [],
  conversationZapTotalSats = 0,
  profileZapTotalSats = 0,
  onMarkRead,
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
  const normalizedPrivacy =
    typeof privacyMode === "string" ? privacyMode.trim().toLowerCase() : "";
  const isNip17 = normalizedPrivacy === "nip17" || normalizedPrivacy === "private";
  const privacyLabel = `Privacy: ${isNip17 ? "NIP-17" : "NIP-04"}`;
  const privacyHint = isNip17
    ? "NIP-17 gift-wraps your DM so relays only see the wrapper and relay hints."
    : "NIP-04 sends a direct encrypted DM; relays can still see sender and recipient metadata.";
  const privacyBadge = createElement(
    doc,
    "span",
    "dm-message-thread__status",
    privacyLabel,
  );
  privacyBadge.title = privacyHint;
  header.appendChild(privacyBadge);

  const zapSummary = createElement(doc, "div", "dm-message-thread__zap-summary");
  zapSummary.appendChild(
    createElement(doc, "span", "dm-message-thread__zap-label", "Zaps"),
  );
  zapSummary.appendChild(
    createElement(
      doc,
      "span",
      "dm-message-thread__zap-total",
      formatZapAmount(conversationZapTotalSats),
    ),
  );
  zapSummary.appendChild(
    createElement(
      doc,
      "span",
      "dm-message-thread__zap-profile",
      `Profile: ${formatZapAmount(profileZapTotalSats)}`,
    ),
  );
  header.appendChild(zapSummary);

  if (typeof onMarkRead === "function") {
    const actions = createElement(doc, "div", "ml-auto flex items-center gap-2");
    const markReadButton = createElement(doc, "button", "btn-ghost", "Mark read");
    markReadButton.type = "button";
    markReadButton.dataset.size = "sm";
    const conversationId =
      typeof contact.id === "string" ? contact.id.trim() : "";
    if (!conversationId) {
      markReadButton.disabled = true;
    }
    markReadButton.addEventListener("click", () => {
      onMarkRead(contact);
    });
    actions.appendChild(markReadButton);
    header.appendChild(actions);
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

  root.appendChild(
    ZapReceiptList({
      document: doc,
      receipts: zapReceipts,
      emptyLabel: "No zap receipts published yet.",
    }),
  );
  return root;
}
