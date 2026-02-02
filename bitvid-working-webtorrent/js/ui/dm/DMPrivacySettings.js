export function DMPrivacySettings({
  document: doc,
  readReceiptsEnabled = false,
  typingIndicatorsEnabled = false,
  onToggleReadReceipts,
  onToggleTypingIndicators,
} = {}) {
  if (!doc) {
    throw new Error("DMPrivacySettings requires a document reference.");
  }

  const root = doc.createElement("div");
  root.className = "dm-privacy-settings card p-4 space-y-4 shadow-lg";

  const title = doc.createElement("h4");
  title.className = "text-sm font-semibold text-text";
  title.textContent = "Direct message privacy";
  root.appendChild(title);

  const desc = doc.createElement("p");
  desc.className = "text-xs text-muted mb-4";
  desc.textContent = "Control read receipts and typing indicators for direct messages.";
  root.appendChild(desc);

  // Read Receipts Toggle
  const readReceiptsRow = doc.createElement("div");
  readReceiptsRow.className = "flex items-center justify-between";

  const readReceiptsLabel = doc.createElement("label");
  readReceiptsLabel.className = "text-sm text-text cursor-pointer";
  readReceiptsLabel.textContent = "Read receipts";
  readReceiptsLabel.setAttribute("for", "dm-read-receipts-toggle");
  readReceiptsRow.appendChild(readReceiptsLabel);

  const readReceiptsToggle = doc.createElement("input");
  readReceiptsToggle.type = "checkbox";
  readReceiptsToggle.id = "dm-read-receipts-toggle";
  readReceiptsToggle.className = "toggle toggle-sm toggle-accent";
  readReceiptsToggle.checked = readReceiptsEnabled;
  readReceiptsToggle.addEventListener("change", (e) => {
    if (typeof onToggleReadReceipts === "function") {
      onToggleReadReceipts(e.target.checked);
    }
  });
  readReceiptsRow.appendChild(readReceiptsToggle);
  root.appendChild(readReceiptsRow);

  // Typing Indicators Toggle
  const typingIndicatorsRow = doc.createElement("div");
  typingIndicatorsRow.className = "flex items-center justify-between";

  const typingIndicatorsLabel = doc.createElement("label");
  typingIndicatorsLabel.className = "text-sm text-text cursor-pointer";
  typingIndicatorsLabel.textContent = "Typing indicators";
  typingIndicatorsLabel.setAttribute("for", "dm-typing-indicators-toggle");
  typingIndicatorsRow.appendChild(typingIndicatorsLabel);

  const typingIndicatorsToggle = doc.createElement("input");
  typingIndicatorsToggle.type = "checkbox";
  typingIndicatorsToggle.id = "dm-typing-indicators-toggle";
  typingIndicatorsToggle.className = "toggle toggle-sm toggle-accent";
  typingIndicatorsToggle.checked = typingIndicatorsEnabled;
  typingIndicatorsToggle.addEventListener("change", (e) => {
    if (typeof onToggleTypingIndicators === "function") {
      onToggleTypingIndicators(e.target.checked);
    }
  });
  typingIndicatorsRow.appendChild(typingIndicatorsToggle);
  root.appendChild(typingIndicatorsRow);

  return root;
}
