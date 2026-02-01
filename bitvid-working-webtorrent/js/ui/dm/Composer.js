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

import { formatZapAmount } from "./zapHelpers.js";

export function Composer({
  document: doc,
  placeholder = "Write a message…",
  state = "idle",
  privacyMode: initialPrivacyMode = "nip04",
  signingAdapter = null,
  zapRecipient = null,
  zapConfig = null,
  onSend,
  onZap,
  zapStats = null,
} = {}) {
  if (!doc) {
    throw new Error("Composer requires a document reference.");
  }

  const form = createElement(doc, "form", "dm-composer");
  form.noValidate = true;
  let privacyMode = initialPrivacyMode;

  const label = createElement(doc, "label", "dm-composer__label", "Message");
  label.setAttribute("for", "dm-composer-input");

  const textarea = createElement(doc, "textarea", "dm-composer__input");
  textarea.id = "dm-composer-input";
  textarea.placeholder = placeholder;
  textarea.rows = 2;
  textarea.setAttribute("aria-label", "Message");

  const hintId = "dm-composer-hint";

  const actions = createElement(doc, "div", "dm-composer__actions");
  const tools = createElement(doc, "div", "dm-composer__tools");
  const hint = createElement(
    doc,
    "span",
    "dm-composer__hint",
    "Enter to send, Shift + Enter for newline",
  );
  hint.id = hintId;
  textarea.setAttribute("aria-describedby", hintId);

  const attachButton = createElement(
    doc,
    "button",
    "dm-composer__attach",
    "Attach",
  );
  attachButton.type = "button";
  attachButton.setAttribute("aria-label", "Attach a file");

  const moreButton = createElement(
    doc,
    "button",
    "btn-ghost dm-composer__more-btn",
    "…",
  );
  moreButton.type = "button";
  moreButton.setAttribute("aria-label", "More options");
  moreButton.setAttribute("aria-expanded", "false");
  moreButton.setAttribute("aria-haspopup", "true");

  const moreMenu = createElement(doc, "div", "dm-composer__more-menu hidden");
  moreMenu.setAttribute("role", "menu");

  const privacyToggle = createElement(
    doc,
    "button",
    "dm-composer__menu-item",
    "NIP-04",
  );
  privacyToggle.type = "button";
  privacyToggle.setAttribute("role", "menuitem");
  privacyToggle.setAttribute("aria-pressed", "false");
  privacyToggle.setAttribute("aria-label", "Toggle privacy mode");

  moreMenu.appendChild(privacyToggle);

  tools.appendChild(attachButton);
  tools.appendChild(moreButton);
  tools.appendChild(moreMenu);
  tools.appendChild(hint);

  moreButton.addEventListener("click", () => {
    const isExpanded = moreButton.getAttribute("aria-expanded") === "true";
    moreButton.setAttribute("aria-expanded", String(!isExpanded));
    if (!isExpanded) {
      moreMenu.classList.remove("hidden");
    } else {
      moreMenu.classList.add("hidden");
    }
  });

  const button = createElement(doc, "button", "dm-composer__send", "Send");
  button.type = "submit";
  button.setAttribute("aria-label", "Send message");

  actions.appendChild(tools);

  // Zap Button
  // We use dm-composer__send as a base for layout/size compatibility, but tweak styles.
  // Using accent-action-button to apply accent color on hover, and px-2 for icon squareness.
  const zapBtn = createElement(doc, "button", "dm-composer__send accent-action-button px-2");
  zapBtn.type = "button";
  zapBtn.setAttribute("aria-label", "Zap");
  zapBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;

  if (typeof onZap === "function") {
    zapBtn.addEventListener("click", (e) => {
        e.preventDefault();
        onZap();
    });

    const buttonGroup = createElement(doc, "div", "flex items-center gap-2");

    // Zap Stats Pill
    if (zapStats && typeof zapStats === "object") {
        // Reuse class from MessageThread for consistent styling
        const zapSummary = createElement(doc, "div", "dm-message-thread__zap-summary");

        // Zaps Label
        const labelSpan = createElement(doc, "span", "dm-message-thread__zap-label", "Zaps");
        zapSummary.appendChild(labelSpan);

        // Conversation Total
        // We need formatZapAmount. Since we can't import dynamically easily here (without changing module type or build),
        // we assume formatZapAmount is available or we pass formatted strings.
        // BUT, looking at file structure, Composer is a module. I should import it at the top.
        // I will add the import in a separate block.
        // Assuming formatZapAmount is imported.

        const conversationTotal = createElement(
          doc,
          "span",
          "dm-message-thread__zap-total",
          formatZapAmount(zapStats.conversationTotal || 0)
        );
        zapSummary.appendChild(conversationTotal);

        // Profile Total
        const profileTotal = createElement(
          doc,
          "span",
          "dm-message-thread__zap-profile",
          `Profile: ${formatZapAmount(zapStats.profileTotal || 0)}`
        );
        zapSummary.appendChild(profileTotal);

        buttonGroup.appendChild(zapSummary);
    }

    buttonGroup.appendChild(zapBtn);
    buttonGroup.appendChild(button);
    actions.appendChild(buttonGroup);
  } else {
    actions.appendChild(button);
  }

  const status = createElement(doc, "div", "dm-composer__status");
  if (state === "error") {
    status.textContent = "Send failed. Try again.";
  } else if (state === "sending") {
    status.textContent = "Sending…";
  }

  form.appendChild(label);
  form.appendChild(textarea);
  form.appendChild(actions);
  form.appendChild(status);

  const handleSubmit = async () => {
    if (typeof onSend !== "function") {
      return;
    }

    const payload = { privacyMode, attachments: [] };
    if (signingAdapter) {
      try {
        if (typeof signingAdapter.getPubkey === "function") {
          payload.pubkey = await signingAdapter.getPubkey();
        }
        if (typeof signingAdapter.getDisplayName === "function") {
          payload.displayName = await signingAdapter.getDisplayName();
        }
        if (typeof signingAdapter.signMessage === "function") {
          payload.signature = await signingAdapter.signMessage(textarea.value);
        }
      } catch (error) {
        payload.signingError =
          error instanceof Error ? error.message : "Signing failed.";
      }
    }

    onSend(textarea.value, payload);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  const updatePrivacyLabel = () => {
    const normalized =
      typeof privacyMode === "string" ? privacyMode.trim().toLowerCase() : "";
    const isNip17 = normalized === "nip17" || normalized === "private";
    privacyToggle.textContent = isNip17 ? "NIP-17" : "NIP-04";
    privacyToggle.setAttribute("aria-pressed", isNip17 ? "true" : "false");
    privacyToggle.title = isNip17
      ? "NIP-17 gift-wraps your DM so relays only see the wrapper and relay hints."
      : "NIP-04 sends a direct encrypted DM; relays can still see sender and recipient metadata.";
  };

  updatePrivacyLabel();

  privacyToggle.addEventListener("click", () => {
    const normalized =
      typeof privacyMode === "string" ? privacyMode.trim().toLowerCase() : "";
    const isNip17 = normalized === "nip17" || normalized === "private";
    privacyMode = isNip17 ? "nip04" : "nip17";
    updatePrivacyLabel();
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  return form;
}
