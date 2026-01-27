import { createModalAccessibility } from "./ui/components/modalAccessibility.js";
import logger from "./utils/logger.js";

const TOC_URL = "content/docs/toc.json";
const DOCS_VIEW_NAME = "docs";
const TOC_DRAWER_ID = "docsTocDrawer";
const TOC_DRAWER_NAV_ID = "docsTocDrawerNav";
const TOC_LIST_ID = "docsTocList";

const tocState = {
  items: [],
  slugLookup: new Map(),
  parentLookup: new Map(),
  linkLookup: new Map(),
  groupLookup: new Map(),
  activeSlug: "",
  drawer: {
    root: null,
    panel: null,
    toggle: null,
    accessibility: null,
    isOpen: false,
  },
};

const scrollSpyState = {
  headings: [],
  linkLookup: new Map(),
  activeId: "",
  rafId: null,
  onScroll: null,
};

function getHashParams() {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
}

function getDocSlugFromHash() {
  const params = getHashParams();
  if (params.get("view") !== DOCS_VIEW_NAME) {
    return "";
  }
  return params.get("doc") || "";
}

function setDocsHash(slug, { replace = false } = {}) {
  if (typeof window === "undefined") {
    return;
  }
  const nextHash = `view=${DOCS_VIEW_NAME}&doc=${encodeURIComponent(slug)}`;
  if (replace) {
    const url = new URL(window.location.href);
    url.hash = nextHash;
    window.history.replaceState({}, "", url.toString());
    return;
  }
  if (window.location.hash === `#${nextHash}`) {
    return;
  }
  window.location.hash = nextHash;
}

function indexItems(items, parent = null) {
  items.forEach((item) => {
    if (!item?.slug) {
      logger.dev.warn("Docs TOC item missing slug.", item);
      return;
    }
    tocState.slugLookup.set(item.slug, item);
    if (parent?.slug) {
      tocState.parentLookup.set(item.slug, parent.slug);
    }
    if (Array.isArray(item.children) && item.children.length > 0) {
      indexItems(item.children, item);
    }
  });
}

function buildLink(item) {
  const link = document.createElement("a");
  link.href = `#view=${DOCS_VIEW_NAME}&doc=${encodeURIComponent(item.slug)}`;
  link.textContent = item.title || item.slug;
  link.className = "text-sm text-muted transition-colors hover:text-text-strong";
  link.dataset.slug = item.slug;
  link.dataset.docsTocItem = "true";
  link.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setDocsHash(item.slug);
  });
  if (!tocState.linkLookup.has(item.slug)) {
    tocState.linkLookup.set(item.slug, new Set());
  }
  tocState.linkLookup.get(item.slug)?.add(link);
  return link;
}

function buildToggleButton(item, controlsId, expanded, groupList) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-ghost btn-xs";
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  button.setAttribute("aria-controls", controlsId);
  button.setAttribute("aria-label", `Toggle ${item.title || item.slug} section`);
  button.textContent = expanded ? "Hide" : "Show";
  button.addEventListener("click", () => {
    const isExpanded = button.getAttribute("aria-expanded") === "true";
    const nextExpanded = !isExpanded;
    button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
    button.textContent = nextExpanded ? "Hide" : "Show";
    if (groupList) {
      groupList.hidden = !nextExpanded;
    }
  });
  return button;
}

function renderTocItems(items, container, level = 0, groupPrefix = "docs-toc") {
  const list = document.createElement("ul");
  list.className = "bv-stack bv-stack--tight";
  list.setAttribute("role", "list");

  items.forEach((item) => {
    if (!item?.slug) {
      return;
    }
    const listItem = document.createElement("li");
    listItem.className = "bv-stack bv-stack--tight";

    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2";

    const link = buildLink(item);
    row.appendChild(link);

    listItem.appendChild(row);

    if (Array.isArray(item.children) && item.children.length > 0) {
      const groupId = `${groupPrefix}-group-${item.slug}`;
      const expanded = level === 0;
      const childList = renderTocItems(item.children, listItem, level + 1, groupPrefix);
      childList.id = groupId;
      childList.classList.add("ml-md", "border-l", "border-border", "pl-md");
      childList.hidden = !expanded;

      const toggle = buildToggleButton(item, groupId, expanded, childList);
      row.appendChild(toggle);

      if (!tocState.groupLookup.has(item.slug)) {
        tocState.groupLookup.set(item.slug, new Set());
      }
      tocState.groupLookup.get(item.slug)?.add({ button: toggle, list: childList });
    }

    list.appendChild(listItem);
  });

  container.appendChild(list);
  return list;
}

function renderToc(items) {
  const tocRoot = document.getElementById(TOC_LIST_ID);
  const tocDrawerRoot = document.getElementById(TOC_DRAWER_NAV_ID);
  const roots = [tocRoot, tocDrawerRoot].filter(Boolean);
  if (roots.length === 0) {
    logger.user.warn("Docs table of contents container not found.");
    return;
  }

  tocState.linkLookup.clear();
  tocState.groupLookup.clear();

  roots.forEach((root) => {
    root.innerHTML = "";
    const groupPrefix = root.id ? `docs-${root.id}` : "docs-toc";
    renderTocItems(items, root, 0, groupPrefix);
  });
}

function updateActiveToc(slug) {
  const previousLinks = tocState.linkLookup.get(tocState.activeSlug);
  if (previousLinks) {
    previousLinks.forEach((link) => {
      link.removeAttribute("aria-current");
      link.classList.remove("text-text-strong", "font-semibold");
      link.classList.add("text-muted");
    });
  }

  tocState.activeSlug = slug || "";
  if (!slug) {
    return;
  }

  const links = tocState.linkLookup.get(slug);
  if (links) {
    links.forEach((link) => {
      link.setAttribute("aria-current", "true");
      link.classList.remove("text-muted");
      link.classList.add("text-text-strong", "font-semibold");
    });
  }

  let current = slug;
  while (tocState.parentLookup.has(current)) {
    const parentSlug = tocState.parentLookup.get(current);
    const groups = tocState.groupLookup.get(parentSlug);
    if (groups) {
      groups.forEach((group) => {
        if (group?.button && group?.list) {
          group.button.setAttribute("aria-expanded", "true");
          group.button.textContent = "Hide";
          group.list.hidden = false;
        }
      });
    }
    current = parentSlug;
  }
}

function resetSectionHighlight() {
  const previousLinks = scrollSpyState.linkLookup.get(scrollSpyState.activeId);
  if (previousLinks) {
    previousLinks.forEach((link) => {
      link.removeAttribute("data-docs-section-current");
      link.classList.remove("text-text-strong", "font-semibold");
      link.classList.add("text-muted");
    });
  }
  scrollSpyState.activeId = "";
}

function clearScrollSpy() {
  if (scrollSpyState.onScroll && typeof window !== "undefined") {
    window.removeEventListener("scroll", scrollSpyState.onScroll);
    window.removeEventListener("resize", scrollSpyState.onScroll);
  }
  if (scrollSpyState.rafId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(scrollSpyState.rafId);
  }
  scrollSpyState.rafId = null;
  scrollSpyState.onScroll = null;
  scrollSpyState.headings = [];
  scrollSpyState.linkLookup = new Map();
  resetSectionHighlight();
}

function setActiveSection(id) {
  if (!id || id === scrollSpyState.activeId) {
    return;
  }
  resetSectionHighlight();
  scrollSpyState.activeId = id;
  const links = scrollSpyState.linkLookup.get(id);
  if (!links) {
    return;
  }
  links.forEach((link) => {
    link.setAttribute("data-docs-section-current", "true");
    link.classList.remove("text-muted");
    link.classList.add("text-text-strong", "font-semibold");
  });
}

function resolveSectionLinks() {
  const linkLookup = new Map();
  if (typeof document === "undefined") {
    return linkLookup;
  }
  const links = document.querySelectorAll(`[data-docs-toc-item][href*="#"]`);
  links.forEach((link) => {
    const rawHref = link.getAttribute("href") || "";
    const hashIndex = rawHref.indexOf("#");
    if (hashIndex === -1) {
      return;
    }
    const fragment = rawHref.slice(hashIndex + 1);
    if (!fragment || fragment.includes("view=")) {
      return;
    }
    const decoded = decodeURIComponent(fragment.split("?")[0]);
    if (!decoded) {
      return;
    }
    if (!linkLookup.has(decoded)) {
      linkLookup.set(decoded, new Set());
    }
    linkLookup.get(decoded)?.add(link);
  });
  return linkLookup;
}

function setupScrollSpy(container) {
  clearScrollSpy();
  if (typeof window === "undefined" || !container) {
    return;
  }

  const headings = Array.from(
    container.querySelectorAll("h2[id], h3[id], h4[id], h5[id]")
  );
  if (headings.length === 0) {
    return;
  }

  const linkLookup = resolveSectionLinks();
  if (linkLookup.size === 0) {
    return;
  }

  const trackedHeadings = headings.filter((heading) => linkLookup.has(heading.id));
  if (trackedHeadings.length === 0) {
    return;
  }

  scrollSpyState.headings = trackedHeadings;
  scrollSpyState.linkLookup = linkLookup;

  const updateActiveFromScroll = () => {
    scrollSpyState.rafId = null;
    const offset = 96;
    let nextId = scrollSpyState.headings[0]?.id || "";
    for (const heading of scrollSpyState.headings) {
      const top = heading.getBoundingClientRect().top - offset;
      if (top <= 0) {
        nextId = heading.id;
      } else {
        break;
      }
    }
    if (nextId) {
      setActiveSection(nextId);
    }
  };

  const onScroll = () => {
    if (scrollSpyState.rafId) {
      return;
    }
    scrollSpyState.rafId = requestAnimationFrame(updateActiveFromScroll);
  };

  scrollSpyState.onScroll = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
}

function resolveDocItem(slug) {
  if (!slug) {
    return null;
  }
  return tocState.slugLookup.get(slug) || null;
}

async function fetchToc() {
  const response = await fetch(TOC_URL);
  if (!response.ok) {
    throw new Error(`Failed to load TOC (${response.status})`);
  }
  const data = await response.json();
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Invalid TOC manifest.");
  }
  return data.items;
}

function highlightCodeBlocks(container) {
  const highlighter = window.hljs;
  const highlight =
    highlighter && typeof highlighter.highlightElement === "function"
      ? (block) => highlighter.highlightElement(block)
      : highlighter && typeof highlighter.highlightBlock === "function"
        ? (block) => highlighter.highlightBlock(block)
        : null;

  if (!highlight) {
    return;
  }

  container.querySelectorAll("pre code").forEach((block) => {
    try {
      highlight(block);
    } catch (highlightError) {
      logger.dev.warn("Failed to highlight code block.", highlightError);
    }
  });
}

async function renderMarkdown(path) {
  const container = document.getElementById("markdown-container");
  if (!container) {
    logger.user.warn("Docs markdown container not found.");
    return;
  }

  try {
    clearScrollSpy();
    if (!window.marked || typeof window.marked.parse !== "function") {
      throw new Error("Markdown renderer is unavailable.");
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load markdown (${response.status})`);
    }
    const markdownText = await response.text();
    const html = window.marked.parse(markdownText);
    container.innerHTML = html;
    highlightCodeBlocks(container);
    const schedule =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (callback) => requestAnimationFrame(callback);
    schedule(() => {
      setupScrollSpy(container);
    });
  } catch (error) {
    logger.user.error("Error loading docs content.", error);
    container.innerHTML =
      '<p class="text-critical-strong">Error loading content. Please try again later.</p>';
  }
}

function updateDocumentTitle(title) {
  if (typeof document === "undefined") {
    return;
  }
  if (!title) {
    document.title = "Docs | bitvid";
    return;
  }
  document.title = `${title} | bitvid docs`;
}

async function handleHashChange() {
  const params = getHashParams();
  const view = params.get("view");
  if (view && view !== DOCS_VIEW_NAME) {
    return;
  }

  const currentSlug = getDocSlugFromHash();
  const defaultSlug = tocState.items[0]?.slug || "";
  const slug = currentSlug || defaultSlug;

  if (!slug) {
    logger.user.warn("Docs view has no available documents.");
    return;
  }

  if (!currentSlug) {
    setDocsHash(slug, { replace: true });
  }

  if (slug === tocState.activeSlug) {
    return;
  }

  const item = resolveDocItem(slug);
  if (!item) {
    logger.user.warn("Requested docs page not found.", slug);
    return;
  }

  await renderMarkdown(item.path);
  updateActiveToc(slug);
  updateDocumentTitle(item.title || "Docs");
  if (tocState.drawer.isOpen) {
    closeTocDrawer();
  }
}

function updateDrawerState(nextState) {
  tocState.drawer.isOpen = nextState;
  if (tocState.drawer.toggle) {
    tocState.drawer.toggle.setAttribute("aria-expanded", nextState ? "true" : "false");
  }
  if (!tocState.drawer.root) {
    return;
  }
  const doc =
    typeof document !== "undefined" && document ? document : tocState.drawer.root.ownerDocument;
  if (nextState) {
    tocState.drawer.root.classList.remove("hidden");
    tocState.drawer.root.setAttribute("data-open", "true");
    doc?.documentElement?.classList.add("modal-open");
    doc?.body?.classList.add("modal-open");
    tocState.drawer.accessibility?.activate({
      triggerElement: tocState.drawer.toggle,
    });
  } else {
    tocState.drawer.root.classList.add("hidden");
    tocState.drawer.root.setAttribute("data-open", "false");
    tocState.drawer.accessibility?.deactivate();
    if (doc) {
      const openModals = doc.querySelectorAll(".bv-modal:not(.hidden)");
      if (openModals.length === 0) {
        doc.documentElement?.classList.remove("modal-open");
        doc.body?.classList.remove("modal-open");
      }
    }
  }
}

function focusFirstDrawerItem() {
  const panel = tocState.drawer.panel;
  if (!panel) {
    return;
  }
  const firstLink = panel.querySelector("[data-docs-toc-item]");
  if (firstLink && typeof firstLink.focus === "function") {
    firstLink.focus({ preventScroll: true });
    return;
  }
  if (typeof panel.focus === "function") {
    panel.focus({ preventScroll: true });
  }
}

function openTocDrawer() {
  if (tocState.drawer.isOpen) {
    return;
  }
  updateDrawerState(true);
  const schedule =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
  schedule(() => {
    focusFirstDrawerItem();
  });
}

function closeTocDrawer() {
  if (!tocState.drawer.isOpen) {
    return;
  }
  updateDrawerState(false);
}

function setupTocDrawer() {
  if (typeof document === "undefined") {
    return;
  }
  const drawerRoot = document.getElementById(TOC_DRAWER_ID);
  const drawerPanel = drawerRoot?.querySelector("[data-docs-toc-panel]") || null;
  const drawerToggle = document.querySelector("[data-docs-toc-toggle]");
  if (!drawerRoot || !drawerPanel || !drawerToggle) {
    return;
  }

  tocState.drawer.root = drawerRoot;
  tocState.drawer.panel = drawerPanel;
  tocState.drawer.toggle = drawerToggle;
  tocState.drawer.accessibility = createModalAccessibility({
    root: drawerRoot,
    panel: drawerPanel,
    backdrop: drawerRoot.querySelector(".bv-modal-backdrop"),
    document,
    onRequestClose: () => {
      closeTocDrawer();
    },
  });

  drawerToggle.addEventListener("click", () => {
    if (tocState.drawer.isOpen) {
      closeTocDrawer();
    } else {
      openTocDrawer();
    }
  });
}

async function initDocsView() {
  try {
    tocState.items = await fetchToc();
    indexItems(tocState.items);
    renderToc(tocState.items);
    setupTocDrawer();
    window.addEventListener("hashchange", handleHashChange);
    await handleHashChange();
  } catch (error) {
    logger.user.error("Failed to initialize docs view.", error);
    const tocRoot = document.getElementById(TOC_LIST_ID);
    if (tocRoot) {
      tocRoot.innerHTML =
        '<p class="text-critical-strong">Unable to load docs table of contents.</p>';
    }
    const container = document.getElementById("markdown-container");
    if (container) {
      container.innerHTML =
        '<p class="text-critical-strong">Error loading content. Please try again later.</p>';
    }
  }
}

export { initDocsView };
