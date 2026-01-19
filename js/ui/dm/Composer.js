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
  onSend,
} = {}) {
  if (!doc) {
    throw new Error("Composer requires a document reference.");
  }

  const form = createElement(doc, "form", "dm-composer");
  form.noValidate = true;

  const label = createElement(doc, "label", "dm-composer__label", "Message");
  label.setAttribute("for", "dm-composer-input");

  const textarea = createElement(doc, "textarea", "dm-composer__input");
  textarea.id = "dm-composer-input";
  textarea.placeholder = placeholder;
  textarea.rows = 2;

  const actions = createElement(doc, "div", "dm-composer__actions");
  const hint = createElement(
    doc,
    "span",
    "dm-composer__hint",
    "Press Ctrl/⌘ + Enter to send",
  );
  const button = createElement(doc, "button", "dm-composer__send", "Send");
  button.type = "submit";
  actions.appendChild(hint);
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
      onSend(textarea.value);
    }
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  return form;
}
