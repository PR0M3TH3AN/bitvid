import { createAndPublishZapRequest, resolveZapRecipient } from "../../payments/zapRequests.js";
import { devLogger, userLogger } from "../../utils/logger.js";

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
  onSendZap,
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

  const zapToggle = createElement(doc, "button", "dm-composer__menu-item", "Zap");
  zapToggle.type = "button";
  zapToggle.setAttribute("role", "menuitem");
  zapToggle.setAttribute("aria-expanded", "false");
  zapToggle.setAttribute("aria-label", "Open zap composer");
  zapToggle.setAttribute("aria-pressed", "false");

  moreMenu.appendChild(privacyToggle);
  moreMenu.appendChild(zapToggle);

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
  actions.appendChild(button);

  const status = createElement(doc, "div", "dm-composer__status");
  if (state === "error") {
    status.textContent = "Send failed. Try again.";
  } else if (state === "sending") {
    status.textContent = "Sending…";
  }

  const zapPanel = createElement(doc, "div", "dm-composer__zap-panel");
  zapPanel.id = "dm-composer-zap-panel";
  zapPanel.hidden = true;
  zapToggle.setAttribute("aria-controls", zapPanel.id);
  const zapRecipientLabel = createElement(
    doc,
    "span",
    "dm-composer__zap-recipient",
    zapRecipient?.name
      ? `Zap ${zapRecipient.name}`
      : "Zap this contact",
  );
  zapPanel.appendChild(zapRecipientLabel);

  const zapAddress = createElement(
    doc,
    "span",
    "dm-composer__zap-address",
    zapRecipient?.lightningAddress || "Lightning address required.",
  );
  zapPanel.appendChild(zapAddress);

  const zapAmountLabel = createElement(doc, "label", "dm-composer__zap-label", "Amount (sats)");
  zapAmountLabel.setAttribute("for", "dm-zap-amount-input");
  const zapAmountInput = createElement(doc, "input", "dm-composer__zap-input");
  zapAmountInput.type = "number";
  zapAmountInput.min = "1";
  zapAmountInput.step = "1";
  zapAmountInput.inputMode = "numeric";
  zapAmountInput.id = "dm-zap-amount-input";
  zapAmountInput.placeholder = "100";
  zapAmountInput.setAttribute("aria-label", "Zap amount in sats");
  zapPanel.appendChild(zapAmountLabel);
  zapPanel.appendChild(zapAmountInput);

  const zapNoteLabel = createElement(doc, "label", "dm-composer__zap-label", "Zap note");
  zapNoteLabel.setAttribute("for", "dm-zap-note-input");
  const zapNoteInput = createElement(doc, "input", "dm-composer__zap-input");
  zapNoteInput.type = "text";
  zapNoteInput.id = "dm-zap-note-input";
  zapNoteInput.placeholder = "Optional note for this zap";
  zapNoteInput.setAttribute("aria-label", "Zap note");
  zapPanel.appendChild(zapNoteLabel);
  zapPanel.appendChild(zapNoteInput);

  const zapActions = createElement(doc, "div", "dm-composer__zap-actions");
  const zapSendButton = createElement(doc, "button", "dm-composer__zap-send", "Send zap");
  zapSendButton.type = "button";
  zapSendButton.setAttribute("aria-label", "Send zap request");
  zapActions.appendChild(zapSendButton);
  zapPanel.appendChild(zapActions);

  const zapStatus = createElement(doc, "div", "dm-composer__zap-status");
  zapPanel.appendChild(zapStatus);

  form.appendChild(label);
  form.appendChild(textarea);
  form.appendChild(zapPanel);
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

  let zapOpen = false;
  let resolvedRecipient = null;

  const setZapStatus = (message, variant = "info") => {
    zapStatus.textContent = message || "";
    zapStatus.dataset.state = variant;
  };

  const resolveRecipient = async () => {
    if (!zapRecipient?.lightningAddress) {
      setZapStatus("Add a Lightning address to enable zaps.", "error");
      return null;
    }
    setZapStatus("Resolving LNURL…", "loading");
    try {
      const resolver =
        typeof zapConfig?.resolveRecipient === "function"
          ? zapConfig.resolveRecipient
          : resolveZapRecipient;
      resolvedRecipient = await resolver(zapRecipient.lightningAddress, {
        fetcher: zapConfig?.fetcher,
      });
      if (
        !resolvedRecipient?.metadata?.allowsNostr &&
        !resolvedRecipient?.metadata?.nostrPubkey
      ) {
        setZapStatus("Recipient LNURL does not support Nostr zaps.", "error");
        resolvedRecipient = null;
        return null;
      }
      setZapStatus("LNURL ready for zaps.", "success");
      return resolvedRecipient;
    } catch (error) {
      devLogger.warn("[dm] Failed to resolve LNURL for zap recipient.", error);
      setZapStatus(
        error instanceof Error ? error.message : "Failed to resolve LNURL.",
        "error",
      );
      return null;
    }
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

  zapToggle.addEventListener("click", () => {
    zapOpen = !zapOpen;
    zapPanel.hidden = !zapOpen;
    zapToggle.setAttribute("aria-expanded", zapOpen ? "true" : "false");
    zapToggle.setAttribute("aria-pressed", zapOpen ? "true" : "false");
    if (zapOpen) {
      void resolveRecipient();
    } else {
      setZapStatus("");
    }
  });

  zapSendButton.addEventListener("click", async () => {
    const amount = Number(zapAmountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setZapStatus("Enter a zap amount greater than zero.", "error");
      return;
    }

    const resolved = resolvedRecipient || (await resolveRecipient());
    if (!resolved) {
      return;
    }

    const comment = zapNoteInput.value.trim();
    const payload = {
      amountSats: Math.round(amount),
      comment,
      recipient: zapRecipient,
      resolved,
    };

    if (typeof onSendZap === "function") {
      try {
        await onSendZap(payload);
        setZapStatus("Zap request sent. Awaiting receipt…", "success");
      } catch (error) {
        userLogger.error("[dm] Zap request failed.", error);
        setZapStatus(
          error instanceof Error ? error.message : "Zap request failed.",
          "error",
        );
      }
      return;
    }

    if (zapConfig?.signer) {
      try {
        await createAndPublishZapRequest({
          address: zapRecipient?.lightningAddress,
          recipientPubkey: zapRecipient?.pubkey,
          relays: zapRecipient?.relayHints || zapConfig?.relays,
          amountSats: Math.round(amount),
          comment,
          signer: zapConfig.signer,
          pool: zapConfig.pool,
          fetcher: zapConfig.fetcher,
        });
        setZapStatus("Zap request published. Awaiting receipt…", "success");
      } catch (error) {
        userLogger.error("[dm] Zap publish failed.", error);
        setZapStatus(
          error instanceof Error ? error.message : "Zap request failed.",
          "error",
        );
      }
    } else {
      setZapStatus("Connect a Nostr signer to send zap requests.", "error");
    }
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  return form;
}
