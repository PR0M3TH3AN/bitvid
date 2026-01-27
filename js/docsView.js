import logger from "./utils/logger.js";

const TOC_URL = "content/docs/toc.json";
const DOCS_VIEW_NAME = "docs";

const tocState = {
  items: [],
  slugLookup: new Map(),
  parentLookup: new Map(),
  linkLookup: new Map(),
  groupLookup: new Map(),
  activeSlug: "",
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

function setDocsHash(slug) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.hash = `view=${DOCS_VIEW_NAME}&doc=${encodeURIComponent(slug)}`;
  window.history.replaceState({}, "", url.toString());
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
  tocState.linkLookup.set(item.slug, link);
  return link;
}

function buildToggleButton(item, controlsId, expanded) {
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
    const group = tocState.groupLookup.get(item.slug);
    if (group?.list) {
      group.list.hidden = !nextExpanded;
    }
  });
  return button;
}

function renderTocItems(items, container, level = 0) {
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

    if (Array.isArray(item.children) && item.children.length > 0) {
      const groupId = `docs-toc-group-${item.slug}`;
      const expanded = level === 0;
      const toggle = buildToggleButton(item, groupId, expanded);
      row.appendChild(toggle);

      const childList = renderTocItems(item.children, listItem, level + 1);
      childList.id = groupId;
      childList.classList.add("ml-md", "border-l", "border-border", "pl-md");
      childList.hidden = !expanded;

      tocState.groupLookup.set(item.slug, { button: toggle, list: childList });
    }

    listItem.appendChild(row);
    list.appendChild(listItem);
  });

  container.appendChild(list);
  return list;
}

function renderToc(items) {
  const tocRoot = document.getElementById("docsToc");
  if (!tocRoot) {
    logger.user.warn("Docs table of contents container not found.");
    return;
  }

  tocRoot.innerHTML = "";

  const heading = document.createElement("p");
  heading.className = "text-xs font-semibold uppercase tracking-wide text-muted";
  heading.textContent = "On this page";
  tocRoot.appendChild(heading);

  renderTocItems(items, tocRoot);
}

function updateActiveToc(slug) {
  if (!slug) {
    return;
  }

  const previousLink = tocState.linkLookup.get(tocState.activeSlug);
  if (previousLink) {
    previousLink.removeAttribute("aria-current");
    previousLink.classList.remove("text-text-strong", "font-semibold");
    previousLink.classList.add("text-muted");
  }

  const link = tocState.linkLookup.get(slug);
  if (link) {
    link.setAttribute("aria-current", "page");
    link.classList.remove("text-muted");
    link.classList.add("text-text-strong", "font-semibold");
  }

  tocState.activeSlug = slug;

  let current = slug;
  while (tocState.parentLookup.has(current)) {
    const parentSlug = tocState.parentLookup.get(current);
    const group = tocState.groupLookup.get(parentSlug);
    if (group?.button && group?.list) {
      group.button.setAttribute("aria-expanded", "true");
      group.button.textContent = "Hide";
      group.list.hidden = false;
    }
    current = parentSlug;
  }
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
    setDocsHash(slug);
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
}

async function initDocsView() {
  try {
    tocState.items = await fetchToc();
    indexItems(tocState.items);
    renderToc(tocState.items);
    window.addEventListener("hashchange", handleHashChange);
    await handleHashChange();
  } catch (error) {
    logger.user.error("Failed to initialize docs view.", error);
    const tocRoot = document.getElementById("docsToc");
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

initDocsView();

export { initDocsView };
