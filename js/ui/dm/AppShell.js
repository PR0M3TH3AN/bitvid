import { Composer } from "./Composer.js";
import { ConversationList } from "./ConversationList.js";
import { MessageThread } from "./MessageThread.js";
import { NotificationCenter } from "./NotificationCenter.js";

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
  },
  {
    id: "conv-2",
    name: "Orbit Ops",
    preview: "Can you share the stream link?",
    timestamp: "1h",
    unreadCount: 0,
    status: "Away",
    avatarSrc: "",
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
    status: "sending",
  },
];

export class AppShell {
  constructor({
    document: doc,
    conversations = DEFAULT_CONVERSATIONS,
    activeConversationId = DEFAULT_CONVERSATIONS[0]?.id || "",
    conversationState = "idle",
    messages = DEFAULT_MESSAGES,
    threadState = "idle",
    threadErrorType = "",
    composerState = "idle",
    notifications = [],
    onSelectConversation,
    onSendMessage,
  } = {}) {
    if (!doc) {
      throw new Error("AppShell requires a document reference.");
    }

    this.document = doc;
    this.root = createElement(doc, "div", "dm-app-shell");

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
        conversations,
        activeId: activeConversationId,
        state: conversationState,
        onSelect: onSelectConversation,
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
        contact: conversations.find((conversation) => conversation.id === activeConversationId) || {},
        messages,
        state: threadState,
        errorType: threadErrorType,
      }),
    );
    main.appendChild(
      Composer({
        document: doc,
        state: composerState,
        onSend: onSendMessage,
      }),
    );

    this.root.appendChild(sidebar);
    this.root.appendChild(main);
  }

  getRoot() {
    return this.root;
  }
}
