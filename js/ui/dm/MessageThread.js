import { DayDivider } from "./DayDivider.js";
import { MessageBubble } from "./MessageBubble.js";
import { ZapReceiptList } from "./ZapReceiptList.js";
import { formatZapAmount } from "./zapHelpers.js";
import { createAndPublishZapRequest, resolveZapRecipient } from "../../payments/zapRequests.js";
import { userLogger, devLogger } from "../../utils/logger.js";

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
  onSendZap,
  zapConfig = null,
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

  // Zap Button
  const zapBtn = createElement(doc, "button", "btn-ghost btn-icon");
  zapBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
  zapBtn.ariaLabel = "Zap";
  zapBtn.addEventListener("click", () => {
    const existingInterface = root.querySelector(".dm-zap-interface");
    if (existingInterface) {
      existingInterface.remove();
      return;
    }
    const zapInterface = createZapInterface(doc, { contact, zapReceipts, onSendZap, zapConfig });
    root.appendChild(zapInterface);
  });
  header.appendChild(zapBtn);

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

  // Scroll to bottom
  if (messages.length > 0) {
      setTimeout(() => {
        timeline.scrollTop = timeline.scrollHeight;
      }, 0);
  }

  root.appendChild(timeline);
  return root;
}

function createZapInterface(doc, { contact, zapReceipts, onSendZap, zapConfig }) {
  const container = createElement(doc, "div", "dm-zap-interface card p-4 absolute bottom-16 right-4 z-20 w-80 shadow-xl border border-border bg-surface");

  const closeBtn = createElement(doc, "button", "absolute top-2 right-2 btn-ghost btn-xs", "✕");
  closeBtn.addEventListener("click", () => container.remove());
  container.appendChild(closeBtn);

  const title = createElement(doc, "h4", "text-sm font-bold mb-2", "Send Zap");
  container.appendChild(title);

  // Zap Form
  const form = createElement(doc, "form", "space-y-2 mb-4");
  const amountInput = createElement(doc, "input", "input input-sm w-full");
  amountInput.type = "number";
  amountInput.placeholder = "Amount (sats)";
  amountInput.min = "1";

  const noteInput = createElement(doc, "input", "input input-sm w-full");
  noteInput.type = "text";
  noteInput.placeholder = "Comment (optional)";

  const sendBtn = createElement(doc, "button", "btn btn-sm btn-primary w-full", "Zap ⚡");
  const statusDiv = createElement(doc, "div", "text-xs text-center mt-1");

  sendBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const amount = parseInt(amountInput.value);
    const comment = noteInput.value;
    if (!amount || amount <= 0) {
        statusDiv.textContent = "Invalid amount";
        statusDiv.className = "text-error text-xs text-center mt-1";
        return;
    }

    statusDiv.textContent = "Sending...";
    statusDiv.className = "text-muted text-xs text-center mt-1";
    sendBtn.disabled = true;

    try {
        if (typeof onSendZap === "function") {
             // Use provided callback if available (e.g. from controller)
             if (!contact.lightningAddress) {
                 throw new Error("No lightning address for this contact");
             }

             const resolver = zapConfig?.resolveRecipient || resolveZapRecipient;
             const resolved = await resolver(contact.lightningAddress, { fetcher: zapConfig?.fetcher });
             if (!resolved) throw new Error("Could not resolve lightning address");

             const payload = {
                 amountSats: amount,
                 comment,
                 recipient: contact,
                 resolved
             };
             await onSendZap(payload);
             statusDiv.textContent = "Zap sent!";
             statusDiv.className = "text-success text-xs text-center mt-1";
             amountInput.value = "";
             noteInput.value = "";
        } else if (zapConfig?.signer) {
            await createAndPublishZapRequest({
                address: contact.lightningAddress,
                recipientPubkey: contact.pubkey,
                relays: contact.relayHints || zapConfig?.relays,
                amountSats: amount,
                comment,
                signer: zapConfig.signer,
                pool: zapConfig.pool,
                fetcher: zapConfig.fetcher,
            });
            statusDiv.textContent = "Zap sent!";
            statusDiv.className = "text-success text-xs text-center mt-1";
            amountInput.value = "";
            noteInput.value = "";
        } else {
             throw new Error("No signer available");
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = "Failed to send zap";
        statusDiv.className = "text-error text-xs text-center mt-1";
    } finally {
        sendBtn.disabled = false;
    }
  });

  form.appendChild(amountInput);
  form.appendChild(noteInput);
  form.appendChild(sendBtn);
  form.appendChild(statusDiv);
  container.appendChild(form);

  // Receipts List
  container.appendChild(
    ZapReceiptList({
      document: doc,
      receipts: zapReceipts,
      emptyLabel: "No recent zaps.",
    }),
  );

  return container;
}
