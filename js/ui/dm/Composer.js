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
  onSend,
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

  const privacyToggle = createElement(
    doc,
    "button",
    "dm-composer__privacy",
    "NIP-04",
  );
  privacyToggle.type = "button";
  privacyToggle.setAttribute("aria-pressed", "false");
  privacyToggle.setAttribute("aria-label", "Toggle privacy mode");

  tools.appendChild(attachButton);
  tools.appendChild(privacyToggle);
  tools.appendChild(hint);

  const button = createElement(doc, "button", "dm-composer__send", "Send");
  button.type = "submit";
  button.setAttribute("aria-label", "Send message");

  actions.appendChild(tools);
  actions.appendChild(button);

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
