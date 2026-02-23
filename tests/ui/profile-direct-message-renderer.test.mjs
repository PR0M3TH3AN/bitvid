import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { ProfileDirectMessageRenderer } from "../../js/ui/profileModal/ProfileDirectMessageRenderer.js";

let dom;
let windowRef;
let documentRef;

beforeEach(() => {
  dom = new JSDOM(
    "<!DOCTYPE html><html><body><div id=\"dmAppShellMount\"></div></body></html>",
    {
      pretendToBeVisual: true,
      url: "https://example.com",
    },
  );

  windowRef = dom.window;
  documentRef = windowRef.document;
  global.window = windowRef;
  global.document = documentRef;
  global.HTMLElement = windowRef.HTMLElement;
});

afterEach(() => {
  if (dom) {
    dom.window.close();
  }
  dom = null;
  windowRef = null;
  documentRef = null;
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
});

test("renderDmAppShell mounts the DM shell into the messages pane", async () => {
  let privacySnapshotCalls = 0;

  const mainController = {
    normalizeHexPubkey: (value) => (typeof value === "string" ? value.trim() : ""),
    services: {
      nostrClient: {},
    },
    nostrService: {
      acknowledgeRenderedDirectMessages: () => {},
    },
  };

  const controller = {
    directMessagesCache: [],
    messagesLoadingState: "ready",
    dmComposerState: "idle",
    dmMobileView: "list",
    helper: {
      async buildDmConversationData() {
        return {
          actor: "a".repeat(64),
          conversations: [
            {
              id: "dm:demo",
              name: "Demo",
              preview: "Hello",
              timestamp: "now",
              unreadCount: 0,
              avatarSrc: "",
              status: "",
              pubkey: "b".repeat(64),
              lightningAddress: "",
              relayHints: [],
            },
          ],
          activeConversationId: "dm:demo",
          activeThread: {
            remoteHex: "b".repeat(64),
            latestMessage: { scheme: "nip04" },
          },
          timeline: [{ id: "1", direction: "incoming", body: "Hello", timestamp: "09:00" }],
        };
      },
      resolveActiveDmRecipient: () => "b".repeat(64),
      resolveConversationPrivacyMode: () => "nip04",
      resolveProfileSummaryForPubkey: () => ({ avatarSrc: "" }),
      resolveActiveDmActor: () => "a".repeat(64),
      getLatestDirectMessageTimestampForConversation: () => 1,
    },
    setFocusedDmConversation: () => {},
    setDirectMessageRecipient: () => {},
    populateProfileMessages: () => {},
    handleDmConversationSelect: () => {},
    handleDmAppShellSendMessage: () => {},
    handleDmConversationMarkRead: () => {},
    handleDmMarkAllConversationsRead: () => {},
    handleReadReceiptsToggle: () => {},
    handleTypingIndicatorsToggle: () => {},
    openDmSettingsModal: () => {},
    getDmPrivacySettingsSnapshot: () => {
      privacySnapshotCalls += 1;
      return { readReceiptsEnabled: false, typingIndicatorsEnabled: false };
    },
  };

  const renderer = new ProfileDirectMessageRenderer(mainController, controller);
  controller.renderer = renderer;
  renderer.cacheDomReferences();

  await renderer.renderDmAppShell([], { actorPubkey: "a".repeat(64) });

  const mount = documentRef.getElementById("dmAppShellMount");
  assert.ok(mount);
  assert.ok(mount.querySelector(".dm-app-shell"));
  assert.equal(privacySnapshotCalls, 1);
});
