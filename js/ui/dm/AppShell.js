import { Composer } from "./Composer.js";
import { ConversationList } from "./ConversationList.js";
import { MessageThread } from "./MessageThread.js";
import { NotificationCenter } from "./NotificationCenter.js";
import { DMPrivacySettings } from "./DMPrivacySettings.js";
import { aggregateZapTotals } from "./zapHelpers.js";

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

const DEFAULT_CONVERSATIONS = [
  {
    id: "conv-1",
    name: "Nia Nova",
    preview: "The relay looks stable now.",
    timestamp: "2m",
    unreadCount: 2,
    status: "Online",
    avatarSrc: "",
    pubkey: "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
    lightningAddress: "nia@zap.lol",
    relayHints: ["wss://relay.damus.io", "wss://nostr.wine"],
  },
  {
    id: "conv-2",
    name: "Orbit Ops",
    preview: "Can you share the stream link?",
    timestamp: "1h",
    unreadCount: 0,
    status: "Away",
    avatarSrc: "",
    pubkey: "fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52",
    lightningAddress: "ops@getalby.com",
    relayHints: ["wss://relay.primal.net"],
  },
];

const DEFAULT_MESSAGES = [
  { type: "day", label: "Today" },
  {
    id: "msg-1",
    direction: "incoming",
    body: "Hey! The new DM view looks promising.",
    timestamp: "09:12",
  },
  {
    id: "msg-2",
    direction: "outgoing",
    body: "Thanks! I'm wiring up the layout and keyboard flow now.",
    timestamp: "09:14",
    status: "pending",
  },
  {
    id: "msg-3",
    direction: "outgoing",
    body: "Next up: privacy mode toggles and attachment rails.",
    timestamp: "09:16",
    status: "sent",
  },
  {
    id: "msg-4",
    direction: "outgoing",
    body: "I can resend if this didn't go through.",
    timestamp: "09:18",
    status: "failed",
  },
];

const DEFAULT_ZAP_RECEIPTS = [
  {
    id: "zap-1",
    kind: 9735,
    conversationId: "conv-1",
    profileId: "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
    senderName: "You",
    amountSats: 120,
    note: "For the quick relay fix!",
    timestamp: "09:20",
    status: "confirmed",
  },
  {
    id: "zap-2",
    kind: 9735,
    conversationId: "conv-1",
    profileId: "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
    senderName: "Nia Nova",
    amountSats: 42,
    note: "Thanks for testing the DM flow.",
    timestamp: "09:22",
    status: "confirmed",
  },
  {
    id: "zap-3",
    kind: 9735,
    conversationId: "conv-2",
    profileId: "fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52",
    senderName: "You",
    amountSats: 250,
    note: "Ops support fund.",
    timestamp: "Yesterday",
    status: "pending",
  },
];

export class AppShell {
  constructor({
    document: doc,
    conversations = DEFAULT_CONVERSATIONS,
    activeConversationId = DEFAULT_CONVERSATIONS[0]?.id || "",
    conversationState = "idle",
    messages = DEFAULT_MESSAGES,
    zapReceipts = DEFAULT_ZAP_RECEIPTS,
    threadState = "idle",
    threadErrorType = "",
    composerState = "idle",
    privacyMode = "nip04",
    dmPrivacySettings = { readReceiptsEnabled: false, typingIndicatorsEnabled: false },
    notifications = [],
    signingAdapter = null,
    zapConfig = null,
    onSelectConversation,
    onSendMessage,
    onSendZap,
    onMarkConversationRead,
    onMarkAllRead,
    onToggleReadReceipts,
    onToggleTypingIndicators,
  } = {}) {
    if (!doc) {
      throw new Error("AppShell requires a document reference.");
    }

    this.document = doc;
    this.root = createElement(doc, "div", "dm-app-shell");

    const { totalsByConversation, totalsByProfile } = aggregateZapTotals(zapReceipts);
    const enrichedConversations = conversations.map((conversation) => ({
      ...conversation,
      zapTotalSats: totalsByConversation.get(conversation.id) || 0,
      profileZapTotalSats: totalsByProfile.get(conversation.pubkey) || 0,
    }));

    const activeConversation =
      enrichedConversations.find((conversation) => conversation.id === activeConversationId) ||
      enrichedConversations[0] ||
      {};
    const activeZapReceipts = zapReceipts.filter(
      (receipt) => receipt.conversationId === activeConversation.id,
    );

    const sidebar = createElement(doc, "aside", "dm-app-shell__sidebar");
    const sidebarHeader = createElement(doc, "div", "dm-app-shell__sidebar-header flex items-center justify-between p-4");
    const sidebarTitle = createElement(
      doc,
      "h1",
      "dm-app-shell__title text-lg font-bold",
      "Direct Messages",
    );
    sidebarHeader.appendChild(sidebarTitle);

    const settingsBtn = createElement(doc, "button", "btn-ghost btn-icon");
    settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    settingsBtn.ariaLabel = "Direct message settings";
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      let popover = sidebar.querySelector(".dm-settings-popover");
      if (popover) {
        popover.remove();
        return;
      }
      popover = DMPrivacySettings({
        document: doc,
        readReceiptsEnabled: dmPrivacySettings.readReceiptsEnabled,
        typingIndicatorsEnabled: dmPrivacySettings.typingIndicatorsEnabled,
        onToggleReadReceipts,
        onToggleTypingIndicators,
      });
      popover.classList.add("dm-settings-popover", "absolute", "z-50", "right-4", "top-12", "bg-surface", "border", "border-border", "rounded-xl");
      sidebarHeader.style.position = "relative";
      sidebarHeader.appendChild(popover);

      const closeHandler = (event) => {
        if (!popover.contains(event.target) && event.target !== settingsBtn && !settingsBtn.contains(event.target)) {
          popover.remove();
          doc.removeEventListener("click", closeHandler);
        }
      };
      doc.addEventListener("click", closeHandler);
    });
    sidebarHeader.appendChild(settingsBtn);
    sidebar.appendChild(sidebarHeader);

    sidebar.appendChild(
      ConversationList({
        document: doc,
        conversations: enrichedConversations,
        activeId: activeConversationId,
        state: conversationState,
        onSelect: onSelectConversation,
        onMarkAllRead,
      }),
    );

    const main = createElement(doc, "main", "dm-app-shell__main");

    main.appendChild(
      MessageThread({
        document: doc,
        contact: activeConversation,
        messages,
        state: threadState,
        errorType: threadErrorType,
        privacyMode,
        zapReceipts: activeZapReceipts,
        conversationZapTotalSats:
          totalsByConversation.get(activeConversation.id) || 0,
        profileZapTotalSats: totalsByProfile.get(activeConversation.pubkey) || 0,
        onMarkRead: onMarkConversationRead,
        onSendZap,
        zapConfig,
      }),
    );
    main.appendChild(
      Composer({
        document: doc,
        state: composerState,
        privacyMode,
        signingAdapter,
        zapRecipient: activeConversation,
        zapConfig,
        onSend: onSendMessage,
        // Zap button moved to MessageThread, so onSendZap here might be redundant if triggered from thread
        // But Composer still handles text message sending.
      }),
    );
    main.appendChild(
      NotificationCenter({
        document: doc,
        notices: notifications,
      }),
    );

    this.root.appendChild(sidebar);
    this.root.appendChild(main);
  }

  getRoot() {
    return this.root;
  }
}
