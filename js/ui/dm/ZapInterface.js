import { ZapReceiptList } from "./ZapReceiptList.js";
import { createAndPublishZapRequest, resolveZapRecipient } from "../../payments/zapRequests.js";
import { userLogger } from "../../utils/logger.js";

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

export function createZapInterface(doc, { contact, zapReceipts, onSendZap, zapConfig }) {
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
        userLogger.error("[ZapInterface] Failed to send zap", err);
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
