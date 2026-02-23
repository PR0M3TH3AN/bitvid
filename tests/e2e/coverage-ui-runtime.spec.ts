import { expect, test } from "./helpers/instrumentedTest";

test.describe("runtime UI utility coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/docs/kitchen-sink.html?__test__=1", {
      waitUntil: "networkidle",
    });
  });

  test("exercises dynamic style scope registration and lifecycle", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const {
        registerScope,
        setVariables,
        releaseScope,
        getScopeAttributeName,
      } = await import("/js/designSystem/dynamicStyles.js");

      const firstScope = registerScope("coverage-scope", [":scope", "& .title", "> .child"]);
      const secondScope = registerScope("coverage-scope", [":scope"]);

      const firstUpdate = setVariables(firstScope, {
        "--card-gap": "12px",
        "--muted": "",
        invalid: "skip",
      });
      const secondUpdate = setVariables(firstScope, {
        "--card-gap": 8,
      });

      const missingScopeUpdate = setVariables("missing-scope", { "--x": "1" });
      const releaseMissing = releaseScope("missing-scope");
      const releaseFirst = releaseScope(firstScope);
      const releaseSecond = releaseScope(secondScope);

      return {
        firstScope,
        secondScope,
        firstUpdate,
        secondUpdate,
        missingScopeUpdate,
        releaseMissing,
        releaseFirst,
        releaseSecond,
        scopeAttr: getScopeAttributeName(),
        styleTagCount: document.querySelectorAll("style[data-ds-dynamic='true']").length,
        adoptedSheetCount: Array.isArray((document as any).adoptedStyleSheets)
          ? (document as any).adoptedStyleSheets.length
          : 0,
      };
    });

    expect(result.firstScope).toBe("coverage-scope");
    expect(result.secondScope).toBe("coverage-scope-1");
    expect(result.firstUpdate).toBe(true);
    expect(result.secondUpdate).toBe(true);
    expect(result.missingScopeUpdate).toBe(false);
    expect(result.releaseMissing).toBe(false);
    expect(result.releaseFirst).toBe(true);
    expect(result.releaseSecond).toBe(true);
    expect(result.scopeAttr).toBe("data-ds-style-id");
    expect(result.styleTagCount + result.adoptedSheetCount).toBeGreaterThanOrEqual(1);
  });

  test("exercises tag preference menu rendering, actions, and state transitions", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const {
        createTagPreferenceMenu,
        applyTagPreferenceMenuState,
        TAG_PREFERENCE_ACTIONS,
      } = await import("/js/ui/components/tagPreferenceMenu.js");

      const actionEvents: Array<{ action: string; tag: string }> = [];

      const loggedOut = createTagPreferenceMenu({
        tag: "#BitVid",
        isLoggedIn: false,
      });
      document.body.appendChild(loggedOut!.panel);

      const loggedIn = createTagPreferenceMenu({
        tag: " nostr ",
        isLoggedIn: true,
        membership: { state: "interest" },
        onAction: (action: string, detail: any) => {
          actionEvents.push({ action, tag: detail.normalizedTag });
        },
      });
      document.body.appendChild(loggedIn!.panel);

      loggedIn!.buttons.removeInterest.click();
      loggedIn!.buttons.addDisinterest.click();

      applyTagPreferenceMenuState({
        buttons: loggedIn!.buttons,
        membership: { state: "disinterest", interest: true, disinterest: true },
        isLoggedIn: true,
      });

      return {
        actions: TAG_PREFERENCE_ACTIONS,
        loggedOutTag: loggedOut!.panel.dataset.tag,
        loggedOutMessage: loggedOut!.panel.textContent,
        loggedOutDisabled: {
          addInterest: loggedOut!.buttons.addInterest.disabled,
          removeInterest: loggedOut!.buttons.removeInterest.disabled,
          addDisinterest: loggedOut!.buttons.addDisinterest.disabled,
          removeDisinterest: loggedOut!.buttons.removeDisinterest.disabled,
        },
        loggedInTag: loggedIn!.panel.dataset.tag,
        loggedInDisabledAfterTransition: {
          addInterest: loggedIn!.buttons.addInterest.disabled,
          removeInterest: loggedIn!.buttons.removeInterest.disabled,
          addDisinterest: loggedIn!.buttons.addDisinterest.disabled,
          removeDisinterest: loggedIn!.buttons.removeDisinterest.disabled,
        },
        actionEvents,
      };
    });

    expect(result.actions.ADD_INTEREST).toBe("add-interest");
    expect(result.loggedOutTag).toBe("bitvid");
    expect(result.loggedInTag).toBe("nostr");
    expect(result.loggedOutMessage).toContain("Sign in to personalize");
    expect(result.loggedOutDisabled).toEqual({
      addInterest: true,
      removeInterest: true,
      addDisinterest: true,
      removeDisinterest: true,
    });

    expect(result.actionEvents.map((entry: any) => entry.action)).toEqual([
      "remove-interest",
      "add-disinterest",
    ]);
    expect(result.actionEvents.every((entry: any) => entry.tag === "nostr")).toBe(true);
    expect(result.loggedInDisabledAfterTransition).toEqual({
      addInterest: false,
      removeInterest: true,
      addDisinterest: true,
      removeDisinterest: false,
    });
  });

  test("exercises docs view initialization, hash routing, drawer toggle, and error handling", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      document.body.innerHTML = `
        <button data-docs-toc-toggle type="button" aria-expanded="false">Menu</button>
        <nav id="docsTocList"></nav>
        <div id="docsTocDrawer" class="hidden" data-open="false">
          <div class="bv-modal-backdrop"></div>
          <div data-docs-toc-panel tabindex="-1">
            <nav id="docsTocDrawerNav"></nav>
          </div>
        </div>
        <article id="markdown-container"></article>
      `;

      (window as any).marked = {
        parse(markdown: string) {
          if (markdown.includes("SECOND_DOC")) {
            return '<h2 id="advanced">Advanced</h2><p>Second doc</p><a data-docs-toc-item href="#advanced">Advanced</a>';
          }
          return '<h2 id="intro">Intro</h2><pre><code>const x = 1;</code></pre><a data-docs-toc-item href="#intro">Intro</a>';
        },
      };

      const highlighted: string[] = [];
      (window as any).hljs = {
        highlightElement(el: Element) {
          highlighted.push(el.textContent || "");
        },
      };

      const realFetch = window.fetch.bind(window);
      const fetchLog: string[] = [];
      window.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchLog.push(url);
        if (url.endsWith("content/docs/toc.json")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  slug: "intro",
                  title: "Intro",
                  path: "/content/docs/intro.md",
                  children: [
                    {
                      slug: "intro-nested",
                      title: "Nested",
                      path: "/content/docs/nested.md",
                    },
                  ],
                },
                {
                  slug: "advanced",
                  title: "Advanced",
                  path: "/content/docs/advanced.md",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.endsWith("/content/docs/intro.md")) {
          return new Response("INTRO_DOC", { status: 200 });
        }
        if (url.endsWith("/content/docs/advanced.md")) {
          return new Response("SECOND_DOC", { status: 200 });
        }
        return realFetch(input);
      }) as typeof fetch;

      const { initDocsView } = await import("/js/docsView.js");
      await initDocsView();

      const initialTitle = document.title;
      const initialHash = window.location.hash;
      const topLevelLinks = Array.from(document.querySelectorAll("#docsTocList [data-docs-toc-item]")).map(
        (el) => (el as HTMLElement).dataset.slug,
      );
      const drawerLinks = Array.from(document.querySelectorAll("#docsTocDrawerNav [data-docs-toc-item]")).map(
        (el) => (el as HTMLElement).dataset.slug,
      );

      const toggle = document.querySelector("[data-docs-toc-toggle]") as HTMLButtonElement;
      const drawer = document.getElementById("docsTocDrawer") as HTMLElement;
      const backdrop = drawer.querySelector(".bv-modal-backdrop") as HTMLElement;

      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const drawerOpen = drawer.getAttribute("data-open");
      const toggleExpandedOpen = toggle.getAttribute("aria-expanded");

      backdrop.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const drawerClosed = drawer.getAttribute("data-open");

      window.location.hash = "#view=docs&doc=advanced";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const advancedTitle = document.title;
      const markdownHtml =
        document.getElementById("markdown-container")?.innerHTML || "";

      window.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("content/docs/toc.json")) {
          return new Response("broken", { status: 500 });
        }
        return realFetch(input);
      }) as typeof fetch;

      document.getElementById("docsTocList")!.innerHTML = "";
      document.getElementById("markdown-container")!.innerHTML = "";

      await initDocsView();
      const tocErrorText = document.getElementById("docsTocList")?.textContent || "";
      const markdownErrorText =
        document.getElementById("markdown-container")?.textContent || "";

      window.fetch = realFetch;

      return {
        initialTitle,
        initialHash,
        advancedTitle,
        markdownHtml,
        topLevelLinks,
        drawerLinks,
        drawerOpen,
        drawerClosed,
        toggleExpandedOpen,
        fetchLog,
        highlighted,
        tocErrorText,
        markdownErrorText,
      };
    });

    expect(result.initialTitle).toBe("Intro | bitvid docs");
    expect(result.initialHash).toContain("view=docs&doc=intro");
    expect(result.advancedTitle).toBe("Advanced | bitvid docs");
    expect(result.markdownHtml).toContain("Second doc");
    expect(result.topLevelLinks).toContain("intro");
    expect(result.topLevelLinks).toContain("advanced");
    expect(result.drawerLinks).toContain("intro");
    expect(result.drawerOpen).toBe("true");
    expect(result.drawerClosed).toBe("false");
    expect(result.toggleExpandedOpen).toBe("true");
    expect(result.fetchLog.some((url: string) => url.endsWith("content/docs/toc.json"))).toBe(true);
    expect(result.fetchLog.some((url: string) => url.endsWith("/content/docs/intro.md"))).toBe(true);
    expect(result.fetchLog.some((url: string) => url.endsWith("/content/docs/advanced.md"))).toBe(true);
    expect(result.highlighted.length).toBeGreaterThan(0);
    expect(result.tocErrorText).toContain("Unable to load docs table of contents");
    expect(result.markdownErrorText).toContain("Error loading content");
  });
});
