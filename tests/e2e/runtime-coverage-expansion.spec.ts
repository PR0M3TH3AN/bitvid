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
});
