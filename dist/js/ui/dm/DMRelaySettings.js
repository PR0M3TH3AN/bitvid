export function DMRelaySettings({ document: doc } = {}) {
  if (!doc) {
    throw new Error("DMRelaySettings requires a document reference.");
  }

  const root = doc.createElement("div");
  root.id = "profileMessagesRelayPanel";
  root.className = "dm-relay-settings card space-y-4 p-5";

  const heading = doc.createElement("div");
  heading.className = "space-y-2";

  const title = doc.createElement("h3");
  title.className = "text-base font-semibold text-text";
  title.textContent = "DM relay hints";
  heading.appendChild(title);

  const description = doc.createElement("p");
  description.className = "text-sm text-muted";
  description.innerHTML =
    'Publish relay hints for direct messages as <span class="font-medium">kind:10050</span> events. Use WSS-only relay URLs so encrypted DM delivery stays secure.';
  heading.appendChild(description);
  root.appendChild(heading);

  const addRow = doc.createElement("div");
  addRow.className = "flex flex-col gap-3 sm:flex-row sm:items-end";

  const label = doc.createElement("label");
  label.className = "flex-1 text-sm text-muted-strong";
  label.setAttribute("for", "profileMessagesRelayInput");

  const labelTitle = doc.createElement("span");
  labelTitle.className = "mb-2 block font-medium";
  labelTitle.textContent = "Add a DM relay";
  label.appendChild(labelTitle);

  const input = doc.createElement("input");
  input.id = "profileMessagesRelayInput";
  input.type = "text";
  input.inputMode = "url";
  input.autocomplete = "off";
  input.className = "input";
  input.placeholder = "wss://relay.example.com";
  label.appendChild(input);
  addRow.appendChild(label);

  const addButton = doc.createElement("button");
  addButton.id = "profileMessagesRelayAdd";
  addButton.type = "button";
  addButton.className = "btn focus-ring";
  addButton.textContent = "Add relay";
  addRow.appendChild(addButton);
  root.appendChild(addRow);

  const publishRow = doc.createElement("div");
  publishRow.className = "flex flex-wrap items-center gap-2";

  const publishButton = doc.createElement("button");
  publishButton.id = "profileMessagesRelayPublish";
  publishButton.type = "button";
  publishButton.className = "btn-ghost focus-ring text-xs";
  publishButton.textContent = "Publish relay hints";
  publishRow.appendChild(publishButton);

  const status = doc.createElement("span");
  status.id = "profileMessagesRelayStatus";
  status.className = "text-xs text-muted";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  publishRow.appendChild(status);
  root.appendChild(publishRow);

  const list = doc.createElement("ul");
  list.id = "profileMessagesRelayList";
  list.className = "grid-stack";
  list.dataset.orientation = "vertical";
  root.appendChild(list);

  return root;
}
