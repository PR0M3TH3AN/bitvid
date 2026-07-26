export const SITE_UPDATE_LAST_SEEN_KEY = "bitvid:site-update:last-seen";
export const SITE_UPDATE_DISMISSED_KEY = "bitvid:site-update:dismissed";
export const GITHUB_COMMITS_ENDPOINT =
  "https://api.github.com/repos/PR0M3TH3AN/bitvid/commits?sha=unstable&per_page=5";

export const LATEST_UPDATE_ITEMS = Object.freeze([
  "Clearer Nostr sign-in choices alongside BitLogin.",
  "Creator approval is now separate from web-of-trust moderation.",
  "Trusted-report thresholds now require broader agreement before action.",
]);

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    // Privacy mode or quota errors should never block the application.
  }
}

function createElement(doc, tagName, className, text = "") {
  const element = doc.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function renderUpdateItems(doc, list, items) {
  list.replaceChildren();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item === "string" && item.trim()) {
      list.appendChild(createElement(doc, "li", "", item.trim()));
    }
  }
}

function normalizeCommitItems(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((entry) => {
      const sha = typeof entry?.sha === "string" ? entry.sha.slice(0, 8) : "";
      const message =
        typeof entry?.commit?.message === "string"
          ? entry.commit.message.split("\n")[0].trim()
          : "";
      return sha && message ? `${sha} — ${message}` : "";
    })
    .filter(Boolean);
}

async function loadGitHubCommitItems({ doc, list, fetchImpl, fallbackItems }) {
  if (typeof fetchImpl !== "function") {
    return;
  }

  try {
    const response = await fetchImpl(GITHUB_COMMITS_ENDPOINT, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response?.ok) {
      throw new Error("github-commits-unavailable");
    }
    const commits = normalizeCommitItems(await response.json());
    if (!commits.length) {
      throw new Error("github-commits-empty");
    }
    renderUpdateItems(doc, list, commits);
  } catch {
    renderUpdateItems(doc, list, fallbackItems);
  }
}

export function initializeSiteUpdateNotice({
  doc = typeof document === "undefined" ? null : document,
  storage = typeof window === "undefined" ? null : window.localStorage,
  updateItems = LATEST_UPDATE_ITEMS,
  fetchImpl = typeof fetch === "function" ? fetch : null,
} = {}) {
  if (!doc?.body) {
    return { shown: false, reason: "document-unavailable" };
  }

  const versionMarker = doc.querySelector("[data-site-version]");
  const version = versionMarker?.dataset?.siteVersion?.trim() || "";
  const date = versionMarker?.dataset?.siteVersionDate?.trim() || "";
  if (!version) {
    return { shown: false, reason: "version-unavailable" };
  }

  const lastSeen = readStorage(storage, SITE_UPDATE_LAST_SEEN_KEY);
  const dismissed = readStorage(storage, SITE_UPDATE_DISMISSED_KEY);
  if (!lastSeen) {
    writeStorage(storage, SITE_UPDATE_LAST_SEEN_KEY, version);
    return { shown: false, reason: "first-visit" };
  }

  if (lastSeen === version || dismissed === version) {
    return { shown: false, reason: "already-seen" };
  }

  const root = createElement(doc, "aside", "site-update-notice");
  root.setAttribute("aria-label", "Latest site update");

  const panel = createElement(doc, "section", "site-update-notice__panel hidden");
  panel.id = "siteUpdateNoticePanel";
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");

  const panelHeader = createElement(doc, "div", "flex items-start justify-between gap-3");
  const title = createElement(doc, "h2", "text-base font-semibold", "Latest update");
  const closeButton = createElement(doc, "button", "site-update-notice__close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Dismiss this update");
  panelHeader.append(title, closeButton);

  const intro = createElement(
    doc,
    "p",
    "mt-2 text-sm leading-relaxed text-text-muted",
    "BitVid has been updated. Here is what changed:",
  );
  const list = createElement(doc, "ul", "mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted");
  renderUpdateItems(doc, list, updateItems);
  const build = createElement(
    doc,
    "p",
    "mt-3 text-xs font-mono text-text-muted",
    `Build ${version}${date ? ` • ${date}` : ""}`,
  );
  panel.append(panelHeader, intro, list, build);

  const toggleButton = createElement(doc, "button", "site-update-notice__button", "Latest update");
  toggleButton.type = "button";
  toggleButton.setAttribute("aria-expanded", "false");
  toggleButton.setAttribute("aria-controls", panel.id);

  const setPanelOpen = (open) => {
    panel.classList.toggle("hidden", !open);
    toggleButton.setAttribute("aria-expanded", String(open));
  };

  let commitLoadStarted = false;
  toggleButton.addEventListener("click", () => {
    const nextOpen = panel.classList.contains("hidden");
    setPanelOpen(nextOpen);
    if (nextOpen && !commitLoadStarted) {
      commitLoadStarted = true;
      void loadGitHubCommitItems({
        doc,
        list,
        fetchImpl,
        fallbackItems: updateItems,
      });
    }
  });
  closeButton.addEventListener("click", () => {
    writeStorage(storage, SITE_UPDATE_LAST_SEEN_KEY, version);
    writeStorage(storage, SITE_UPDATE_DISMISSED_KEY, version);
    root.remove();
  });

  root.append(panel, toggleButton);
  doc.body.appendChild(root);
  return { shown: true, version, root };
}
