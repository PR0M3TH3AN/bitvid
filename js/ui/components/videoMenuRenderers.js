import { normalizeDesignSystemContext } from "../../designSystem.js";

function resolveDocument(documentRef) {
  if (documentRef && documentRef.nodeType === 9) {
    return documentRef;
  }
  if (typeof document !== "undefined" && document?.nodeType === 9) {
    return document;
  }
  return null;
}

function createElement(doc, tagName, { classNames = [], attrs = {}, textContent } = {}) {
  const el = doc.createElement(tagName);
  classNames
    .filter((name) => typeof name === "string" && name.trim())
    .forEach((name) => el.classList.add(name));
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    el.setAttribute(key, value);
  });
  if (typeof textContent === "string") {
    el.textContent = textContent;
  }
  return el;
}

function normalizePointer(pointerInfo) {
  if (!pointerInfo || typeof pointerInfo !== "object") {
    return null;
  }

  const pointer = Array.isArray(pointerInfo.pointer)
    ? pointerInfo.pointer
    : null;
  if (!pointer || pointer.length < 2) {
    return null;
  }

  const [type, value, relay] = pointer;
  const normalized = {
    key: typeof pointerInfo.key === "string" ? pointerInfo.key : "",
    type: typeof type === "string" ? type : "",
    value: typeof value === "string" ? value : "",
    relay: typeof relay === "string" ? relay : "",
  };

  if (!normalized.type || !normalized.value) {
    return null;
  }

  return normalized;
}

function resolveVideoMetadata(video) {
  if (!video || typeof video !== "object") {
    return {
      id: "",
      pubkey: "",
      title: "",
      description: "",
      thumbnail: "",
      isPrivate: false,
      kind: null,
    };
  }

  const normalized = {
    id: typeof video.id === "string" ? video.id : "",
    pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
    title: typeof video.title === "string" ? video.title : "",
    description:
      typeof video.description === "string" ? video.description : "",
    thumbnail:
      typeof video.thumbnail === "string" ? video.thumbnail : "",
    isPrivate: video.isPrivate === true,
  };

  if (Number.isFinite(video.kind) && video.kind > 0) {
    normalized.kind = Math.floor(video.kind);
  } else {
    normalized.kind = null;
  }

  return normalized;
}

function ensureMenuContainer(doc, panelClassNames = []) {
  const panel = createElement(doc, "div", {
    classNames: ["popover__panel", ...panelClassNames],
    attrs: { role: "menu" },
  });

  const list = createElement(doc, "div", {
    classNames: ["menu"],
    attrs: { role: "none" },
  });

  panel.appendChild(list);
  return { panel, list };
}

function appendMenuSeparator(doc, list) {
  const separator = createElement(doc, "div", {
    classNames: ["menu__separator"],
    attrs: { role: "separator" },
  });
  list.appendChild(separator);
  return separator;
}

function appendMenuHeading(doc, list, text) {
  const heading = createElement(doc, "div", {
    classNames: ["menu__heading"],
    textContent: text,
  });
  list.appendChild(heading);
  return heading;
}

function appendMenuAction(doc, list, {
  text,
  action,
  dataset = {},
  variant = null,
  context = "",
}) {
  const button = createElement(doc, "button", {
    classNames: ["menu__item", "justify-start"],
    textContent: text,
    attrs: { type: "button", role: "menuitem" },
  });

  button.dataset.action = action;
  if (variant) {
    button.dataset.variant = variant;
  }
  if (context) {
    button.dataset.context = context;
  }

  Object.entries(dataset).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    button.dataset[key] = String(value);
  });

  list.appendChild(button);
  return button;
}

export function createVideoMoreMenuPanel({
  document: documentRef = null,
  video = null,
  pointerInfo = null,
  playbackUrl = "",
  playbackMagnet = "",
  canManageBlacklist = false,
  context = "card",
  designSystem = null,
} = {}) {
  const doc = resolveDocument(documentRef);
  if (!doc) {
    return null;
  }
  normalizeDesignSystemContext(designSystem);

  const metadata = resolveVideoMetadata(video);
  const pointer = normalizePointer(pointerInfo);

  const { panel, list } = ensureMenuContainer(doc, ["w-48", "p-0"]);
  panel.dataset.menu = "video-more";
  panel.dataset.menuContext = context;

  appendMenuAction(doc, list, {
    text: "Open channel",
    action: "open-channel",
    dataset: { author: metadata.pubkey, context },
  });

  appendMenuAction(doc, list, {
    text: "Copy link",
    action: "copy-link",
    dataset: { eventId: metadata.id, context },
  });

  const baseBoostDataset = {
    eventId: metadata.id,
    author: metadata.pubkey,
    context,
  };

  if (pointer) {
    baseBoostDataset.pointerType = pointer.type;
    baseBoostDataset.pointerValue = pointer.value;
    if (pointer.relay) {
      baseBoostDataset.pointerRelay = pointer.relay;
    }
    if (pointer.key) {
      baseBoostDataset.pointerKey = pointer.key;
    }
  }

  if (Number.isFinite(metadata.kind) && metadata.kind > 0) {
    baseBoostDataset.kind = String(metadata.kind);
  }

  appendMenuHeading(doc, list, "Boost on Nostr…");

  appendMenuAction(doc, list, {
    text: "Repost (kind 6)",
    action: "repost-event",
    dataset: baseBoostDataset,
  });

  if (playbackUrl && metadata.isPrivate !== true) {
    appendMenuAction(doc, list, {
      text: "Mirror (kind 1063)",
      action: "mirror-video",
      dataset: {
        ...baseBoostDataset,
        url: playbackUrl,
        magnet: playbackMagnet || "",
        thumbnail: metadata.thumbnail,
        description: metadata.description,
        title: metadata.title,
        isPrivate: metadata.isPrivate ? "true" : "false",
      },
    });
  }

  appendMenuAction(doc, list, {
    text: "Rebroadcast",
    action: "ensure-presence",
    dataset: {
      ...baseBoostDataset,
      pubkey: metadata.pubkey,
    },
  });

  appendMenuSeparator(doc, list);

  if (pointer) {
    appendMenuAction(doc, list, {
      text: "Remove from history",
      action: "remove-history",
      dataset: {
        pointerKey: pointer.key,
        pointerType: pointer.type,
        pointerValue: pointer.value,
        pointerRelay: pointer.relay,
        reason: "remove-item",
      },
    });
  }

  appendMenuAction(doc, list, {
    text: "Mute creator",
    action: "mute-author",
    dataset: { author: metadata.pubkey, context },
  });

  appendMenuAction(doc, list, {
    text: "Unmute creator",
    action: "unmute-author",
    dataset: { author: metadata.pubkey, context },
  });

  if (canManageBlacklist) {
    appendMenuAction(doc, list, {
      text: "Blacklist creator",
      action: "blacklist-author",
      variant: "critical",
      dataset: { author: metadata.pubkey },
    });
  }

  appendMenuAction(doc, list, {
    text: "Block creator",
    action: "block-author",
    variant: "critical",
    dataset: { author: metadata.pubkey },
  });

  appendMenuAction(doc, list, {
    text: "Report",
    action: "report",
    dataset: {
      eventId: metadata.id,
      author: metadata.pubkey,
      pointerRelay: pointer && pointer.relay ? pointer.relay : "",
    },
  });

  appendMenuSeparator(doc, list);

  appendMenuAction(doc, list, {
    text: "Event Details",
    action: "event-details",
    dataset: {
      eventId: metadata.id,
      context,
    },
  });

  return panel;
}

export function createChannelProfileMenuPanel({
  document: documentRef = null,
  context = "channel-profile",
  designSystem = null,
} = {}) {
  const doc = resolveDocument(documentRef);
  if (!doc) {
    return null;
  }

  normalizeDesignSystemContext(designSystem);

  const normalizedContext =
    typeof context === "string" && context ? context : "channel-profile";

  const { panel, list } = ensureMenuContainer(doc, ["w-48", "p-0"]);
  panel.dataset.menu = "channel-profile";
  panel.dataset.menuContext = normalizedContext;

  appendMenuAction(doc, list, {
    text: "Copy npub",
    action: "copy-npub",
    dataset: { context: normalizedContext },
  });

  appendMenuAction(doc, list, {
    text: "Mute channel",
    action: "mute-author",
    dataset: { context: normalizedContext },
  });

  appendMenuAction(doc, list, {
    text: "Unmute channel",
    action: "unmute-author",
    dataset: { context: normalizedContext },
  });

  appendMenuAction(doc, list, {
    text: "Blacklist channel",
    action: "blacklist-author",
    variant: "critical",
    dataset: { context: normalizedContext },
  });

  appendMenuAction(doc, list, {
    text: "Block channel",
    action: "block-author",
    variant: "critical",
    dataset: { context: normalizedContext },
  });

  appendMenuAction(doc, list, {
    text: "Report",
    action: "report",
    dataset: { context: normalizedContext },
  });

  return panel;
}

export function createVideoSettingsMenuPanel({
  document: documentRef = null,
  video = null,
  index = 0,
  capabilities = {},
  designSystem = null,
} = {}) {
  const doc = resolveDocument(documentRef);
  if (!doc) {
    return null;
  }
  normalizeDesignSystemContext(designSystem);

  const metadata = resolveVideoMetadata(video);
  const normalizedIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const perms = {
    canEdit: capabilities?.canEdit === true,
    canRevert: capabilities?.canRevert === true,
    canDelete: capabilities?.canDelete === true,
  };

  const { panel, list } = ensureMenuContainer(doc, ["w-44", "p-0"]);
  panel.dataset.menu = "video-settings";

  appendMenuAction(doc, list, {
    text: "Edit",
    action: "edit",
    dataset: {
      index: String(normalizedIndex),
      eventId: metadata.id,
    },
  });

  if (perms.canRevert) {
    appendMenuAction(doc, list, {
      text: "Revert",
      action: "revert",
      variant: "critical",
      dataset: {
        index: String(normalizedIndex),
        eventId: metadata.id,
      },
    });
  }

  if (perms.canDelete) {
    appendMenuAction(doc, list, {
      text: "Delete All",
      action: "delete",
      variant: "critical",
      dataset: {
        index: String(normalizedIndex),
        eventId: metadata.id,
      },
    });
  }

  return panel;
}

