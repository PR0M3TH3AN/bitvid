import { formatAttachmentSize } from "../../attachments/attachmentUtils.js";
import { uploadAttachment } from "../../services/attachmentService.js";
import { buildPublicUrl, buildR2Key } from "../../r2.js";
import { devLogger } from "../../utils/logger.js";

const TYPING_INDICATOR_TTL_SECONDS = 15;
const TYPING_INDICATOR_COOLDOWN_MS = 4000;

export function renderAttachmentQueue(controller) {
  const list = controller.dmController.profileMessageAttachmentList;
  if (!(list instanceof HTMLElement)) {
    return;
  }

  list.textContent = "";

  if (!controller.dmController.dmAttachmentQueue.length) {
    return;
  }

  controller.dmController.dmAttachmentQueue.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "card flex flex-col gap-2 p-3";
    item.dataset.attachmentId = entry.id;

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-2";
    const title = document.createElement("div");
    title.className = "text-sm font-semibold text-text";
    title.textContent = entry.name || "Attachment";
    header.appendChild(title);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn-ghost focus-ring inline-flex items-center";
    removeButton.dataset.size = "sm";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      controller.dmController.dmAttachmentQueue =
        controller.dmController.dmAttachmentQueue.filter(
          (queued) => queued.id !== entry.id,
        );
      if (entry.previewUrl && typeof URL !== "undefined") {
        URL.revokeObjectURL(entry.previewUrl);
      }
      renderAttachmentQueue(controller);
    });
    header.appendChild(removeButton);
    item.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "text-xs text-muted";
    const sizeLabel = formatAttachmentSize(entry.size);
    meta.textContent = sizeLabel
      ? `${entry.type || "file"} · ${sizeLabel}`
      : entry.type || "file";
    item.appendChild(meta);

    if (entry.previewUrl && entry.type?.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = entry.previewUrl;
      img.alt = entry.name || "Attachment preview";
      img.className = "h-24 w-24 rounded-lg object-cover";
      img.loading = "lazy";
      img.decoding = "async";
      item.appendChild(img);
    }

    const progress = document.createElement("progress");
    progress.className = "progress";
    progress.value = entry.progress || 0;
    progress.max = 1;
    progress.dataset.variant = "surface";
    item.appendChild(progress);

    const status = document.createElement("div");
    status.className = "text-xs text-muted";
    status.textContent =
      entry.status === "uploading"
        ? "Uploading…"
        : entry.status === "error"
        ? entry.error || "Upload failed."
        : "Ready to upload.";
    item.appendChild(status);

    list.appendChild(item);
  });
}

export async function uploadAttachmentQueue(controller, actorPubkey) {
  const r2Service = controller.services.r2Service;
  if (!r2Service) {
    throw new Error("Storage service unavailable.");
  }

  const encrypt =
    controller.dmController.profileMessageAttachmentEncrypt instanceof
    HTMLInputElement
      ? controller.dmController.profileMessageAttachmentEncrypt.checked
      : false;

  const payloads = [];

  for (const entry of controller.dmController.dmAttachmentQueue) {
    entry.status = "uploading";
    entry.progress = 0;
    renderAttachmentQueue(controller);

    try {
      const payload = await uploadAttachment({
        r2Service,
        pubkey: actorPubkey,
        file: entry.file,
        encrypt,
        buildKey: buildR2Key,
        buildUrl: buildPublicUrl,
        onProgress: (fraction) => {
          entry.progress = Number.isFinite(fraction)
            ? fraction
            : entry.progress;
          renderAttachmentQueue(controller);
        },
      });
      payloads.push(payload);
      entry.status = "uploaded";
      entry.progress = 1;
    } catch (error) {
      entry.status = "error";
      entry.error =
        error && typeof error.message === "string"
          ? error.message
          : "Attachment upload failed.";
      renderAttachmentQueue(controller);
      throw error;
    }
  }

  return payloads;
}

export function resolveLatestDirectMessageForRecipient(
  controller,
  recipientPubkey,
  actorPubkey = null,
) {
  const normalizedRecipient =
    typeof recipientPubkey === "string"
      ? controller.normalizeHexPubkey(recipientPubkey)
      : "";
  if (
    !normalizedRecipient ||
    !Array.isArray(controller.dmController.directMessagesCache)
  ) {
    return null;
  }

  const resolvedActor = actorPubkey
    ? controller.normalizeHexPubkey(actorPubkey)
    : controller.dmController.resolveActiveDmActor();

  let latest = null;
  let latestTimestamp = 0;

  for (const entry of controller.dmController.directMessagesCache) {
    if (
      controller.dmController.resolveDirectMessageRemote(
        entry,
        resolvedActor,
      ) !== normalizedRecipient
    ) {
      continue;
    }
    const timestamp = Number(entry?.timestamp) || 0;
    if (!latest || timestamp > latestTimestamp) {
      latest = entry;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

export async function maybePublishTypingIndicator(controller) {
  const settings = controller.dmController.getDmPrivacySettingsSnapshot();
  if (!settings.typingIndicatorsEnabled) {
    return;
  }

  if (
    !controller.services.nostrClient ||
    typeof controller.services.nostrClient.publishDmTypingIndicator !==
      "function"
  ) {
    return;
  }

  const input = controller.dmController.profileMessageInput;
  const messageText =
    input instanceof HTMLTextAreaElement ? input.value.trim() : "";
  if (!messageText) {
    return;
  }

  const recipient = controller.dmController.resolveActiveDmRecipient();
  if (!recipient) {
    return;
  }

  const now = Date.now();
  if (
    now - controller.dmController.dmTypingLastSentAt <
    TYPING_INDICATOR_COOLDOWN_MS
  ) {
    return;
  }

  controller.dmController.dmTypingLastSentAt = now;

  const relayHints =
    controller.dmController.buildDmRecipientContext(recipient)?.relayHints ||
    [];
  const latestMessage = resolveLatestDirectMessageForRecipient(
    controller,
    recipient,
    controller.dmController.resolveActiveDmActor(),
  );
  const latestEventId =
    controller.dmController.resolveDirectMessageEventId(latestMessage);

  try {
    await controller.services.nostrClient.publishDmTypingIndicator({
      recipientPubkey: recipient,
      conversationEventId: latestEventId || null,
      relays: relayHints,
      expiresInSeconds: TYPING_INDICATOR_TTL_SECONDS,
    });
  } catch (error) {
    devLogger.warn(
      "[profileModal] Failed to publish typing indicator:",
      error,
    );
  }
}
