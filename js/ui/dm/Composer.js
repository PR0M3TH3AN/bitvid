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
  zapBtn.style.marginRight = "var(--space-xs)"; // Add some spacing between zap and send if needed, though flex gap usually handles it.
  // Actually, actions usually has a gap? Let's check parent styles.
  // dm-composer__actions usually separates tools and submit.
  // If we want it NEXT to Send, we should group them or just append.
  // We'll append both to a container or just actions.

  if (typeof onZap === "function") {
    zapBtn.addEventListener("click", (e) => {
        e.preventDefault();
        onZap();
    });
    // Create a wrapper for buttons if we want tight grouping, or just append to actions.
    // actions has "flex items-center justify-between" usually?
    // Let's check CSS for dm-composer__actions.
    // If not, we might need a wrapper.
    // tools is one child. button is another.
    // We'll wrap Zap and Send in a div to keep them together on the right.
    const buttonGroup = createElement(doc, "div", "flex items-center gap-2");
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
