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
  privacyMode: initialPrivacyMode = "standard",
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
    "Standard",
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (typeof onSend === "function") {
      onSend(textarea.value, { privacyMode, attachments: [] });
    }
  });

  const updatePrivacyLabel = () => {
    privacyToggle.textContent = privacyMode === "private" ? "Private" : "Standard";
    privacyToggle.setAttribute(
      "aria-pressed",
      privacyMode === "private" ? "true" : "false",
    );
  };

  updatePrivacyLabel();

  privacyToggle.addEventListener("click", () => {
    privacyMode = privacyMode === "private" ? "standard" : "private";
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
