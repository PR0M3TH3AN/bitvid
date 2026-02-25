import { expect, test } from "./helpers/instrumentedTest";

test.describe("runtime coverage expansion", () => {
  test("exercises for-you view empty-state and hashtag action", async ({ page }) => {
    await page.goto("/?__test__=1", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      document.body.innerHTML = `
        <button id="feedInfoTrigger" type="button"></button>
        <div id="videoList"></div>
      `;

      const profileShows: string[] = [];
      const { setApplication } = await import("/js/applicationContext.js");
      const { initForYouView } = await import("/js/forYouView.js");

      setApplication({
        profileController: {
          show(tab: string) {
            profileShows.push(tab);
          },
        },
      });

      const forYou = initForYouView();
      const forYouInitialEmpty = Boolean(
        document.querySelector("[data-for-you-empty-state]"),
      );

      const forYouButton = document.querySelector(
        '[data-action="open-hashtag-preferences"]',
      ) as HTMLButtonElement | null;
      forYouButton?.click();

      const container = document.getElementById("videoList");
      if (!container) {
        return {
          ok: false,
          reason: "missing-video-list",
        };
      }

      container.innerHTML = '<div class="sidebar-loading-wrapper"></div>';
      forYou.updateEmptyState();
      const forYouLoadingEmpty = Boolean(
        document.querySelector("[data-for-you-empty-state]"),
      );

      container.innerHTML = '<article data-component="video-card"></article>';
      forYou.updateEmptyState();
      const forYouVideoEmpty = Boolean(
        document.querySelector("[data-for-you-empty-state]"),
      );

      setApplication(null);
      container.innerHTML = "";
      forYou.updateEmptyState();
      const fallbackButton = document.querySelector(
        '[data-action="open-hashtag-preferences"]',
      ) as HTMLButtonElement | null;
      fallbackButton?.click();

      return {
        ok: true,
        profileShows,
        forYouInitialEmpty,
        forYouLoadingEmpty,
        forYouVideoEmpty,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.profileShows).toContain("hashtags");
    expect(result.forYouInitialEmpty).toBe(true);
    expect(result.forYouLoadingEmpty).toBe(false);
    expect(result.forYouVideoEmpty).toBe(false);
  });

  test("exercises explore view empty-state transitions", async ({ page }) => {
    await page.goto("/?__test__=1", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      document.body.innerHTML = `
        <button id="exploreInfoTrigger" type="button"></button>
        <div id="videoList"></div>
      `;

      const { initExploreView } = await import("/js/exploreView.js");
      const explore = initExploreView();
      const container = document.getElementById("videoList");
      if (!container) {
        return { ok: false };
      }

      const emptyInitial = Boolean(
        document.querySelector("[data-explore-empty-state]"),
      );

      container.innerHTML = '<div class="sidebar-loading-wrapper"></div>';
      explore.updateEmptyState();
      const emptyDuringLoading = Boolean(
        document.querySelector("[data-explore-empty-state]"),
      );

      container.innerHTML = '<article data-component="video-card"></article>';
      explore.updateEmptyState();
      const emptyWithVideo = Boolean(
        document.querySelector("[data-explore-empty-state]"),
      );

      return { ok: true, emptyInitial, emptyDuringLoading, emptyWithVideo };
    });

    expect(result.ok).toBe(true);
    expect(result.emptyInitial).toBe(true);
    expect(result.emptyDuringLoading).toBe(false);
    expect(result.emptyWithVideo).toBe(false);
  });

  test("exercises kids view empty-state transitions", async ({ page }) => {
    await page.goto("/?__test__=1", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      document.body.innerHTML = `
        <button id="kidsInfoTrigger" type="button"></button>
        <div id="videoList"></div>
      `;

      const { initKidsView } = await import("/js/kidsView.js");
      const kids = initKidsView();
      const container = document.getElementById("videoList");
      if (!container) {
        return { ok: false };
      }

      const emptyInitial = Boolean(
        document.querySelector("[data-kids-empty-state]"),
      );

      container.innerHTML = '<div class="sidebar-loading-wrapper"></div>';
      kids.updateEmptyState();
      const emptyDuringLoading = Boolean(
        document.querySelector("[data-kids-empty-state]"),
      );

      container.innerHTML = '<article data-component="video-card"></article>';
      kids.updateEmptyState();
      const emptyWithVideo = Boolean(
        document.querySelector("[data-kids-empty-state]"),
      );

      return { ok: true, emptyInitial, emptyDuringLoading, emptyWithVideo };
    });

    expect(result.ok).toBe(true);
    expect(result.emptyInitial).toBe(true);
    expect(result.emptyDuringLoading).toBe(false);
    expect(result.emptyWithVideo).toBe(false);
  });

  test("exercises hash view utilities", async ({ page }) => {
    await page.goto("/?__test__=1", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const { setHashView, getHashViewName } = await import("/js/hashView.js");

      window.history.replaceState({}, "", `${window.location.pathname}?modal=1&v=abc#view=home`);
      setHashView("explore");
      const first = {
        view: getHashViewName(),
        href: window.location.href,
      };

      window.history.replaceState({}, "", `${window.location.pathname}?modal=1&v=xyz#view=home`);
      setHashView("kids", { preserveVideoParam: true });
      const second = {
        view: getHashViewName(),
        href: window.location.href,
      };

      return { first, second };
    });

    expect(result.first.view).toBe("explore");
    expect(result.first.href).not.toContain("modal=");
    expect(result.first.href).not.toContain("v=");
    expect(result.second.view).toBe("kids");
    expect(result.second.href).not.toContain("modal=");
    expect(result.second.href).toContain("v=xyz");
  });

  test("exercises direct message snapshot store normalization", async ({ page }) => {
    await page.goto("/?__test__=1", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const {
        saveDirectMessageSnapshot,
        loadDirectMessageSnapshot,
        clearDirectMessageSnapshot,
      } = await import("/js/directMessagesStore.js");

      const pubkey = "a".repeat(64);
      const badPubkey = "invalid";

      const saved = await saveDirectMessageSnapshot(pubkey, [
        {
          remotePubkey: "B".repeat(64),
          latestTimestamp: 101,
          preview: "first message",
        },
        {
          remotePubkey: "b".repeat(64),
          latestTimestamp: 202,
          preview: "newer duplicate",
        },
        {
          remotePubkey: "c".repeat(64),
          latestTimestamp: "x",
          preview: "   line1\nline2   ",
        },
        {
          remotePubkey: "not-a-pubkey",
          latestTimestamp: 999,
          preview: "ignored",
        },
      ]);

      const loaded = await loadDirectMessageSnapshot(pubkey);
      const cleared = await clearDirectMessageSnapshot(pubkey);
      const afterClear = await loadDirectMessageSnapshot(pubkey);

      const badLoad = await loadDirectMessageSnapshot(badPubkey);
      const badSave = await saveDirectMessageSnapshot(badPubkey, []);
      const badClear = await clearDirectMessageSnapshot(badPubkey);

      return {
        savedLength: saved.length,
        loadedLength: loaded.length,
        firstRemote: loaded[0]?.remotePubkey,
        firstTimestamp: loaded[0]?.latestTimestamp,
        secondPreview: loaded[1]?.preview,
        cleared,
        afterClearLength: afterClear.length,
        badLoadLength: badLoad.length,
        badSaveLength: badSave.length,
        badClear,
      };
    });

    expect(result.savedLength).toBe(2);
    expect(result.loadedLength).toBe(2);
    expect(result.firstRemote).toBe("b".repeat(64));
    expect(result.firstTimestamp).toBe(202);
    expect(result.secondPreview).toBe("line1 line2");
    expect(result.cleared).toBe(true);
    expect(result.afterClearLength).toBe(0);
    expect(result.badLoadLength).toBe(0);
    expect(result.badSaveLength).toBe(0);
    expect(result.badClear).toBe(false);
  });

  test("exercises DM app shell and notification center interactions", async ({ page }) => {
    await page.goto("/?__test__=1", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      document.body.innerHTML = '<div id="mount"></div>';
      const mount = document.getElementById("mount");
      if (!mount) {
        return { ok: false, reason: "missing-mount" };
      }

      const { AppShell } = await import("/js/ui/dm/AppShell.js");
      const { NotificationCenter } = await import("/js/ui/dm/NotificationCenter.js");
      const { DMPrivacySettings } = await import("/js/ui/dm/DMPrivacySettings.js");
      const { DMRelaySettings } = await import("/js/ui/dm/DMRelaySettings.js");

      const selectedConversations: string[] = [];
      const sentMessages: Array<{ text: string; privacyMode?: string }> = [];
      const filterSelections: string[] = [];
      const selectedNotices: string[] = [];
      const readToggles: boolean[] = [];
      const typingToggles: boolean[] = [];
      let markAllReadCount = 0;
      let markReadCount = 0;
      let backCount = 0;
      let zapCount = 0;

      const shell = new AppShell({
        document,
        currentUserAvatarUrl: "",
        conversations: [
          {
            id: "conv-1",
            name: "Alice Example",
            preview: "hello",
            timestamp: "now",
            unreadCount: 2,
            status: "online",
            avatarSrc: "",
            pubkey: "a".repeat(64),
            lightningAddress: "alice@getalby.com",
            relayHints: ["wss://relay.example.com"],
          },
          {
            id: "conv-2",
            name: "Bob Example",
            preview: "yo",
            timestamp: "now",
            unreadCount: 0,
            status: "away",
            avatarSrc: "",
            pubkey: "b".repeat(64),
            lightningAddress: "bob@getalby.com",
            relayHints: ["wss://relay.example.com"],
          },
        ],
        activeConversationId: "conv-1",
        messages: [
          { type: "day", label: "Today" },
          { id: "m1", direction: "incoming", body: "hello", timestamp: "09:00" },
          { id: "m2", direction: "outgoing", body: "hi", timestamp: "09:01", status: "sent" },
        ],
        zapReceipts: [
          {
            id: "zr1",
            kind: 9735,
            conversationId: "conv-1",
            profileId: "a".repeat(64),
            senderName: "Alice",
            amountSats: 21,
            note: "thanks",
            timestamp: "09:05",
            status: "confirmed",
          },
        ],
        dmPrivacySettings: { readReceiptsEnabled: true, typingIndicatorsEnabled: false },
        onSelectConversation: (conversation: { id: string }) => {
          selectedConversations.push(conversation.id);
        },
        onSendMessage: (text: string, payload: { privacyMode?: string }) => {
          sentMessages.push({ text, privacyMode: payload?.privacyMode });
        },
        onMarkConversationRead: () => {
          markReadCount += 1;
        },
        onMarkAllRead: () => {
          markAllReadCount += 1;
        },
        onToggleReadReceipts: (enabled: boolean) => {
          readToggles.push(Boolean(enabled));
        },
        onToggleTypingIndicators: (enabled: boolean) => {
          typingToggles.push(Boolean(enabled));
        },
        onBack: () => {
          backCount += 1;
        },
        onSendZap: async () => {
          zapCount += 1;
        },
        zapConfig: {
          resolveRecipient: async () => ({
            lnurl: "lnurl1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
          }),
        },
      });

      const root = shell.getRoot();
      mount.appendChild(root);

      const directPrivacyPanel = DMPrivacySettings({
        document,
        readReceiptsEnabled: true,
        typingIndicatorsEnabled: false,
        onToggleReadReceipts: (enabled: boolean) => readToggles.push(Boolean(enabled)),
        onToggleTypingIndicators: (enabled: boolean) => typingToggles.push(Boolean(enabled)),
      });
      mount.appendChild(directPrivacyPanel);

      const directRelayPanel = DMRelaySettings({ document });
      mount.appendChild(directRelayPanel);

      root
        .querySelector('[data-conversation-id="conv-2"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      root
        .querySelector(".dm-message-thread__back")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const markReadButton = [...root.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Mark read"),
      );
      markReadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      root
        .querySelector(".dm-conversation-list .btn-ghost.ml-auto")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const composerInput = root.querySelector("#dm-composer-input") as HTMLTextAreaElement | null;
      if (composerInput) {
        composerInput.value = "coverage ping";
        composerInput.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      }

      const moreButton = root.querySelector(
        '.dm-composer__more-btn[aria-label="More options"]',
      ) as HTMLButtonElement | null;
      moreButton?.click();
      root
        .querySelector('.dm-composer__menu-item[aria-label="Toggle privacy mode"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const settingsButton = root.querySelector(
        '.dm-app-shell__sidebar .icon-button[aria-label="Direct message settings"]',
      ) as HTMLButtonElement | null;
      settingsButton?.click();

      const readToggle = mount.querySelector("#dm-read-receipts-toggle") as HTMLInputElement | null;
      if (readToggle) {
        readToggle.checked = false;
        readToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const typingToggle = mount.querySelector(
        "#dm-typing-indicators-toggle",
      ) as HTMLInputElement | null;
      if (typingToggle) {
        typingToggle.checked = true;
        typingToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const zapButton = root.querySelector(
        '.dm-composer__send[aria-label="Zap"]',
      ) as HTMLButtonElement | null;
      zapButton?.click();

      const zapForm = root.querySelector(".dm-zap-interface form") as HTMLFormElement | null;
      const zapAmount = zapForm?.querySelector('input[type="number"]') as HTMLInputElement | null;
      const zapSubmit = zapForm?.querySelector(".btn-primary") as HTMLButtonElement | null;
      if (zapAmount && zapSubmit) {
        zapAmount.value = "21";
        zapSubmit.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const noticeCenter = NotificationCenter({
        document,
        notices: [
          {
            id: "n1",
            type: "dms",
            group: "unread",
            title: "New DM",
            message: "ping",
            timestamp: "now",
            timestampISO: new Date().toISOString(),
            icon: "✉",
          },
          {
            id: "n2",
            type: "zaps",
            group: "new",
            title: "Zap received",
            message: "21 sats",
            timestamp: "now",
            timestampISO: new Date().toISOString(),
          },
        ],
        activeFilter: "all",
        onFilterSelect: (filterId: string) => {
          filterSelections.push(filterId);
        },
        onNoticeSelect: (notice: { id: string }) => {
          selectedNotices.push(notice.id);
        },
      });
      mount.appendChild(noticeCenter);

      noticeCenter
        .querySelector('[data-filter-id="dms"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      noticeCenter
        .querySelector('[data-notice-id="n1"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      return {
        ok: true,
        hasAppShell: Boolean(root.querySelector(".dm-app-shell__sidebar")),
        hasRelayPanel: Boolean(mount.querySelector("#profileMessagesRelayPanel")),
        hasComposer: Boolean(root.querySelector(".dm-composer")),
        hasMessageBubble: Boolean(root.querySelector(".dm-message-bubble")),
        hasDayDivider: Boolean(root.querySelector(".dm-day-divider")),
        selectedConversations,
        sentMessages,
        filterSelections,
        selectedNotices,
        readToggles,
        typingToggles,
        markAllReadCount,
        markReadCount,
        backCount,
        zapCount,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.hasAppShell).toBe(true);
    expect(result.hasRelayPanel).toBe(true);
    expect(result.hasComposer).toBe(true);
    expect(result.hasMessageBubble).toBe(true);
    expect(result.hasDayDivider).toBe(true);
    expect(result.selectedConversations).toContain("conv-2");
    expect(result.sentMessages.length).toBeGreaterThan(0);
    expect(result.sentMessages[0].text).toBe("coverage ping");
    expect(result.filterSelections).toContain("dms");
    expect(result.selectedNotices).toContain("n1");
    expect(result.readToggles).toContain(false);
    expect(result.typingToggles).toContain(true);
    expect(result.markAllReadCount).toBe(1);
    expect(result.markReadCount).toBe(1);
    expect(result.backCount).toBe(1);
    expect(result.zapCount).toBe(1);
  });
});
