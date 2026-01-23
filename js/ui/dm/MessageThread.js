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
  currentUserAvatarUrl = "",
  state = "idle",
  errorType = "",
  privacyMode = "nip04",
  zapReceipts = [],
  conversationZapTotalSats = 0,
  profileZapTotalSats = 0,
  onMarkRead,
  onSendZap,
  onBack,
  zapConfig = null,
} = {}) {
  if (!doc) {
    throw new Error("MessageThread requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-message-thread");

  const header = createElement(doc, "header", "dm-message-thread__header");

  if (typeof onBack === "function") {
    const backBtn = createElement(doc, "button", "dm-message-thread__back btn-ghost btn-icon");
    backBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
    backBtn.ariaLabel = "Back to conversations";
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      onBack();
    });
    header.appendChild(backBtn);
  }

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

  const timeline = createElement(doc, "div", "dm-message-thread__timeline no-scrollbar");
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
      const isOutgoing = message.direction === "outgoing";
      const bubble = MessageBubble({
        document: doc,
        message,
        variant: isOutgoing ? "outgoing" : "incoming",
        avatarSrc: isOutgoing ? currentUserAvatarUrl : (contact.avatarSrc || ""),
      });
      timeline.appendChild(bubble);
    });
  }

  // Scroll to bottom and peek
  if (messages.length > 0) {
    const animate = () => {
      timeline.scrollTop = timeline.scrollHeight;

      if (timeline.scrollHeight > timeline.clientHeight) {
        setTimeout(() => {
          const targetScroll = Math.max(0, timeline.scrollTop - 40);
          timeline.scrollTo({ top: targetScroll, behavior: "smooth" });

          setTimeout(() => {
            timeline.scrollTo({
              top: timeline.scrollHeight,
              behavior: "smooth",
            });
          }, 800);
        }, 600);
      }
    };

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          observer.disconnect();
          // First ensure we are at bottom
          timeline.scrollTop = timeline.scrollHeight;
          setTimeout(animate, 300);
        }
      }, { threshold: 0.1 });
      observer.observe(timeline);
    } else {
      setTimeout(() => {
        timeline.scrollTop = timeline.scrollHeight;
        animate();
      }, 0);
    }
  }

  root.appendChild(timeline);
  return root;
}
