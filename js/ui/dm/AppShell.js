import { Composer } from "./Composer.js";
import { ConversationList } from "./ConversationList.js";
import { MessageThread } from "./MessageThread.js";
import { NotificationCenter } from "./NotificationCenter.js";
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
    notifications = [],
    signingAdapter = null,
    zapConfig = null,
    onSelectConversation,
    onSendMessage,
    onSendZap,
    onMarkConversationRead,
    onMarkAllRead,
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
    const sidebarTitle = createElement(
      doc,
      "h1",
      "dm-app-shell__title",
      "Direct Messages",
    );
    sidebar.appendChild(sidebarTitle);
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
      NotificationCenter({
        document: doc,
        notices: notifications,
      }),
    );
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
        onSendZap,
      }),
    );

    this.root.appendChild(sidebar);
    this.root.appendChild(main);
  }

  getRoot() {
    return this.root;
  }
}
