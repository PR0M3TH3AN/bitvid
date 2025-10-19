// js/index.js

import { validateInstanceConfig } from "../config/validate-config.js";
import { ASSET_VERSION } from "../config/asset-version.js";
import "./bufferPolyfill.js";
import Application from "./app.js";
import { setApplication, setApplicationReady } from "./applicationContext.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import { loadView, viewInitRegistry } from "./viewManager.js";
import { applyDesignSystemAttributes } from "./designSystem.js";
import {
  initThemeController,
  refreshThemeControls,
} from "./themeController.js";
import { devLogger, userLogger } from "./utils/logger.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./ui/components/staticModalAccessibility.js";
import {
  BLOG_URL,
  COMMUNITY_URL,
  NOSTR_URL,
  GITHUB_URL,
  BETA_URL,
  DNS_URL,
} from "./config.js";

validateInstanceConfig();

applyDesignSystemAttributes();
initThemeController();

let application = null;
let applicationReadyPromise = Promise.resolve();

const bindOptionalExternalLink = ({ selector, url, label }) => {
  const element = document.querySelector(selector);
  const sanitizedUrl = typeof url === "string" ? url.trim() : "";

  if (!(element instanceof HTMLAnchorElement)) {
    if (sanitizedUrl) {
      userLogger.warn(
        `${label} not found; skipping external link binding.`,
      );
    }
    return;
  }

  if (!sanitizedUrl) {
    element.remove();
    return;
  }

  element.href = sanitizedUrl;
  element.target = "_blank";
  element.rel = "noopener noreferrer";
};

function startApplication() {
  if (application) {
    return applicationReadyPromise;
  }

  application = new Application({
    services: {
      nostrService,
      r2Service,
    },
    loadView,
  });

  setApplication(application);

  const startupPromise = (async () => {
    await application.init();
    if (typeof application.start === "function") {
      await application.start();
    }
  })();

  applicationReadyPromise = startupPromise;
  setApplicationReady(startupPromise);

  startupPromise.catch((error) => {
    userLogger.error("Application failed to initialize:", error);
  });

  return startupPromise;
}

const INTERFACE_FADE_IN_ANIMATION = "interface-fade-in";
const VIDEO_THUMBNAIL_FADE_IN_ANIMATION = "video-thumbnail-fade-in";

//
// Centralized animation cleanup
// ------------------------------
// We attach a single capture-phase listener for animation events so that any
// chrome element or thumbnail using our fade-in helpers can automatically shed
// the temporary classes/data attributes that trigger the transition. This is
// critical because these DOM nodes frequently persist while the surrounding
// lists re-render; if the classes stick around, future layout shuffles would
// replay the fade and make the UI flicker. Clearing the hooks immediately after
// the first animation keeps the graceful entrance without introducing future
// flashes.
const handleFadeInAnimationComplete = (event) => {
  const { animationName, target } = event;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (animationName === INTERFACE_FADE_IN_ANIMATION) {
    if (!target.classList.contains("fade-in")) {
      return;
    }

    // Remove the transient fade-in class so future renders keep the element
    // visible. The delays piggyback on `fade-in`, so we strip those too.
    target.classList.remove("fade-in");
    Array.from(target.classList).forEach((className) => {
      if (className.startsWith("fade-in-delay-")) {
        target.classList.remove(className);
      }
    });
    return;
  }

  if (animationName !== VIDEO_THUMBNAIL_FADE_IN_ANIMATION) {
    return;
  }

  if (
    target.dataset &&
    target.dataset.videoThumbnail === "true" &&
    target.dataset.thumbnailLoaded === "true"
  ) {
    // Thumbnails use the same pattern: once the fade finishes we clear the flag
    // so a later `load` event (or template reuse) does not restart the
    // animation.
    delete target.dataset.thumbnailLoaded;
  }
};

document.addEventListener("animationend", handleFadeInAnimationComplete, true);
document.addEventListener("animationcancel", handleFadeInAnimationComplete, true);

// 1) Load modals (login, application, etc.)
const withAssetVersion = (url) => {
  if (typeof url !== "string" || url.length === 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(ASSET_VERSION)}`;
};

const fetchPartial = async (url) => {
  const response = await fetch(withAssetVersion(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load " + url);
  }
  return response.text();
};

async function loadModal(url) {
  try {
    const html = await fetchPartial(url);
    document
      .getElementById("modalContainer")
      .insertAdjacentHTML("beforeend", html);
    const modalContainer = document.getElementById("modalContainer");
    if (modalContainer) {
      applyDesignSystemAttributes(modalContainer);
      refreshThemeControls(modalContainer);
    }
    devLogger.log(url, "loaded");
  } catch (err) {
    userLogger.error(err);
  }
}

// 2) Load sidebar
async function loadSidebar(url, containerId) {
  try {
    const html = await fetchPartial(url);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = html;
      applyDesignSystemAttributes(container);
      refreshThemeControls(container);
    }
    devLogger.log(url, "loaded into", containerId);
  } catch (err) {
    userLogger.error(err);
  }
}

// 3) Load the disclaimer (now separate)
async function loadDisclaimer(url, containerId) {
  try {
    const html = await fetchPartial(url);
    const container = document.getElementById(containerId);
    if (container) {
      container.insertAdjacentHTML("beforeend", html);
      applyDesignSystemAttributes(container);
      refreshThemeControls(container);
    }
    devLogger.log(url, "disclaimer loaded into", containerId);
  } catch (err) {
    userLogger.error(err);
  }
}

async function bootstrapInterface() {
  await Promise.all([
    loadModal("components/login-modal.html"),
    loadModal("components/application-form.html"),
    loadModal("components/content-appeals-form.html"),
    loadModal("components/general-feedback-form.html"),
    loadModal("components/feature-request-form.html"),
    loadModal("components/bug-fix-form.html"),
  ]);

  devLogger.log("Modals loaded.");

  [
    "loginModal",
    "nostrFormModal",
    "contentAppealsModal",
    "generalFeedbackModal",
    "featureRequestModal",
    "bugFixModal",
  ].forEach((id) => {
    prepareStaticModal({ id });
  });

  await loadSidebar("components/sidebar.html", "sidebarContainer");
  devLogger.log("Sidebar loaded.");

  bindOptionalExternalLink({
    selector: "[data-blog-link]",
    url: BLOG_URL,
    label: "Sidebar blog link",
  });

  bindOptionalExternalLink({
    selector: "[data-nostr-link]",
    url: NOSTR_URL,
    label: "Sidebar Nostr link",
  });

  bindOptionalExternalLink({
    selector: "[data-community-link]",
    url: COMMUNITY_URL,
    label: "Sidebar community link",
  });

  bindOptionalExternalLink({
    selector: "[data-github-link]",
    url: GITHUB_URL,
    label: "Sidebar GitHub link",
  });

  bindOptionalExternalLink({
    selector: "[data-beta-link]",
    url: BETA_URL,
    label: "Sidebar Beta link",
  });

  bindOptionalExternalLink({
    selector: "[data-dns-link]",
    url: DNS_URL,
    label: "Sidebar DNS link",
  });

  const headerSearchForm = document.getElementById("headerSearchForm");
  if (headerSearchForm) {
    headerSearchForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        await applicationReadyPromise;
      } catch (error) {
        userLogger.info("Search function is coming soon.");
        return;
      }

      if (application && typeof application.showStatus === "function") {
        try {
          application.showStatus("Search function is coming soon.", {
            autoHideMs: 3500,
            showSpinner: false,
          });
          return;
        } catch (error) {
          // fall through to logger fallback
        }
      }

      userLogger.info("Search function is coming soon.");
    });
  }

  const sidebar = document.getElementById("sidebar");
  const collapseToggle = document.getElementById("sidebarCollapseToggle");
  if (sidebar && !sidebar.hasAttribute("data-footer-state")) {
    sidebar.setAttribute("data-footer-state", "collapsed");
  }
  if (!collapseToggle) {
    userLogger.warn("Sidebar collapse toggle not found; skipping density controls.");
  }

  const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebarCollapsed";
  const DEFAULT_SIDEBAR_COLLAPSED = true;
  let isSidebarCollapsed = DEFAULT_SIDEBAR_COLLAPSED;
  let isFooterDropupExpanded = false;
  let syncFooterDropupFn = null;

  const readStoredSidebarCollapsed = () => {
    try {
      const storedValue = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (storedValue === null) {
        return DEFAULT_SIDEBAR_COLLAPSED;
      }
      return storedValue === "true";
    } catch (error) {
      userLogger.warn("Unable to read sidebar collapse state from storage:", error);
      return DEFAULT_SIDEBAR_COLLAPSED;
    }
  };

  const persistSidebarCollapsed = (collapsed) => {
    try {
      localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        collapsed ? "true" : "false",
      );
    } catch (error) {
      userLogger.warn("Unable to persist sidebar collapse state:", error);
    }
  };

  const applySidebarDensity = (collapsed) => {
    const state = collapsed ? "collapsed" : "expanded";
    const toggleTargets = new Set(
      [document.documentElement, document.body, sidebar].filter(
        (element) => element instanceof HTMLElement
      ),
    );

    const appShell = document.getElementById("app");
    if (appShell instanceof HTMLElement) {
      toggleTargets.add(appShell);
      appShell.dataset.sidebarState = state;
      appShell.classList.toggle("sidebar-collapsed", collapsed);
      appShell.classList.toggle("sidebar-expanded", !collapsed);
    }

    toggleTargets.forEach((element) => {
      element.classList.toggle("sidebar-collapsed", collapsed);
      element.classList.toggle("sidebar-expanded", !collapsed);
      element.setAttribute("data-state", state);
    });

    if (collapseToggle) {
      const actionLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
      collapseToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      collapseToggle.setAttribute("data-state", state);
      collapseToggle.setAttribute("aria-label", actionLabel);
      collapseToggle.setAttribute("title", actionLabel);
    }

    if (
      collapsed &&
      isFooterDropupExpanded &&
      typeof syncFooterDropupFn === "function"
    ) {
      syncFooterDropupFn(false);
    }
  };

  isSidebarCollapsed = collapseToggle
    ? readStoredSidebarCollapsed()
    : DEFAULT_SIDEBAR_COLLAPSED;

  applySidebarDensity(isSidebarCollapsed);

  if (collapseToggle) {
    collapseToggle.addEventListener("click", (event) => {
      event.preventDefault();
      const nextCollapsed = !isSidebarCollapsed;
      isSidebarCollapsed = nextCollapsed;
      applySidebarDensity(nextCollapsed);
      persistSidebarCollapsed(nextCollapsed);
    });
  }

  const footerDropdownButton = document.getElementById("footerDropdownButton");
  const footerLinksContainer = document.getElementById("footerLinksContainer");
  const footerDropdownLabel = document.getElementById("footerDropdownText");
  const footerDropdownIcon = document.getElementById("footerDropdownIcon");

  const debounce = (fn, delay) => {
    let timeoutId = null;
    return (...args) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        fn(...args);
      }, delay);
    };
  };

  const resolveCssLengthToPixels = (value, container) => {
    if (!(container instanceof HTMLElement) || typeof value !== "string") {
      return 0;
    }

    const measurementNode = container.ownerDocument.createElement("div");
    measurementNode.style.position = "absolute";
    measurementNode.style.visibility = "hidden";
    measurementNode.style.pointerEvents = "none";
    measurementNode.style.height = "0";
    measurementNode.style.width = value;
    measurementNode.style.overflow = "hidden";

    container.appendChild(measurementNode);
    const pixels = measurementNode.getBoundingClientRect().width;
    container.removeChild(measurementNode);

    return Number.isFinite(pixels) ? pixels : 0;
  };

  const updateSidebarDropupContentWidth = () => {
    const panelInner = document.querySelector(".sidebar-dropup-panel__inner");
    const panel = panelInner?.closest(".sidebar-dropup-panel");

    if (!(panelInner instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      document.documentElement.style.setProperty(
        "--sidebar-dropup-content-width",
        "0px",
      );
      return;
    }

    const originalStyles = {
      position: panelInner.style.position,
      width: panelInner.style.width,
      maxWidth: panelInner.style.maxWidth,
      visibility: panelInner.style.visibility,
      pointerEvents: panelInner.style.pointerEvents,
      left: panelInner.style.left,
      right: panelInner.style.right,
      top: panelInner.style.top,
      bottom: panelInner.style.bottom,
    };

    panelInner.style.position = "absolute";
    panelInner.style.width = "max-content";
    panelInner.style.maxWidth = "none";
    panelInner.style.visibility = "hidden";
    panelInner.style.pointerEvents = "none";
    panelInner.style.left = "-9999px";
    panelInner.style.right = "auto";
    panelInner.style.top = "auto";
    panelInner.style.bottom = "auto";

    const measuredInnerWidth = Math.ceil(panelInner.scrollWidth);

    panelInner.style.position = originalStyles.position;
    panelInner.style.width = originalStyles.width;
    panelInner.style.maxWidth = originalStyles.maxWidth;
    panelInner.style.visibility = originalStyles.visibility;
    panelInner.style.pointerEvents = originalStyles.pointerEvents;
    panelInner.style.left = originalStyles.left;
    panelInner.style.right = originalStyles.right;
    panelInner.style.top = originalStyles.top;
    panelInner.style.bottom = originalStyles.bottom;

    const panelStyles = window.getComputedStyle(panel);
    const paddingInlineStart = Number.parseFloat(panelStyles.paddingInlineStart) || 0;
    const paddingInlineEnd = Number.parseFloat(panelStyles.paddingInlineEnd) || 0;

    const scrollReserveValue = window
      .getComputedStyle(panel)
      .getPropertyValue("--space-sidebar-dropup-scroll-reserve");
    const scrollReserve = resolveCssLengthToPixels(scrollReserveValue, panel);

    const totalWidth = Math.max(
      0,
      measuredInnerWidth + paddingInlineStart + paddingInlineEnd + scrollReserve,
    );

    document.documentElement.style.setProperty(
      "--sidebar-dropup-content-width",
      `${Math.ceil(totalWidth)}px`,
    );
  };

  const debouncedSidebarDropupResize = debounce(updateSidebarDropupContentWidth, 150);
  window.addEventListener("resize", debouncedSidebarDropupResize);

  if (footerDropdownButton && footerLinksContainer) {
    const sidebarFooter = footerDropdownButton.closest(".sidebar-footer");

    syncFooterDropupFn = (expanded) => {
      const nextState = expanded ? "expanded" : "collapsed";
      const actionLabel = expanded ? "Show fewer sidebar links" : "Show more sidebar links";

      footerDropdownButton.setAttribute("aria-expanded", expanded ? "true" : "false");
      footerDropdownButton.dataset.state = nextState;
      footerDropdownButton.setAttribute("aria-label", actionLabel);
      footerDropdownButton.setAttribute("title", actionLabel);

      if (footerDropdownLabel) {
        footerDropdownLabel.textContent = expanded ? "Less" : "More";
      }

      if (footerDropdownIcon) {
        footerDropdownIcon.classList.toggle("is-rotated", expanded);
      }

      footerLinksContainer.classList.remove("hidden");
      footerLinksContainer.setAttribute("aria-hidden", expanded ? "false" : "true");
      footerLinksContainer.dataset.state = nextState;

      if (sidebar) {
        sidebar.setAttribute("data-footer-state", nextState);
      }

      if (sidebarFooter instanceof HTMLElement) {
        sidebarFooter.dataset.footerState = nextState;
      }
      isFooterDropupExpanded = expanded;
      updateSidebarDropupContentWidth();
    };

    footerDropdownButton.addEventListener("click", (event) => {
      event.preventDefault();
      const expanded = footerDropdownButton.getAttribute("aria-expanded") === "true";

      if (isSidebarCollapsed && !expanded) {
        const nextCollapsed = false;
        isSidebarCollapsed = nextCollapsed;
        applySidebarDensity(nextCollapsed);
        persistSidebarCollapsed(nextCollapsed);
      }

      if (typeof syncFooterDropupFn === "function") {
        syncFooterDropupFn(!expanded);
      }
    });

    const initialExpanded = footerDropdownButton.getAttribute("aria-expanded") === "true";
    if (typeof syncFooterDropupFn === "function") {
      syncFooterDropupFn(initialExpanded);
    }
  } else {
    updateSidebarDropupContentWidth();
  }

  try {
    const sidebarModule = await import("./sidebar.js");
    if (typeof sidebarModule.setupSidebarNavigation === "function") {
      sidebarModule.setupSidebarNavigation();
    }
  } catch (error) {
    userLogger.error("Failed to set up sidebar navigation:", error);
  }

  await loadDisclaimer("components/disclaimer.html", "modalContainer");
  devLogger.log("Disclaimer loaded.");
  prepareStaticModal({ id: "disclaimerModal" });

  const loginNavBtn = document.getElementById("loginButton");
  if (loginNavBtn) {
    loginNavBtn.addEventListener("click", (event) => {
      const loginModal =
        prepareStaticModal({ id: "loginModal" }) ||
        document.getElementById("loginModal");
      if (loginModal) {
        openStaticModal(loginModal, { triggerElement: event.currentTarget });
      }
    });
  }

  const closeLoginBtn = document.getElementById("closeLoginModal");
  if (closeLoginBtn) {
    closeLoginBtn.addEventListener("click", () => {
      closeStaticModal("loginModal");
    });
  }

  const openAppFormBtn = document.getElementById("openApplicationModal");
  if (openAppFormBtn) {
    openAppFormBtn.addEventListener("click", (event) => {
      closeStaticModal("loginModal");
      const appModal =
        prepareStaticModal({ id: "nostrFormModal" }) ||
        document.getElementById("nostrFormModal");
      if (appModal) {
        openStaticModal(appModal, { triggerElement: event.currentTarget });
      }
    });
  }

  const closeNostrFormBtn = document.getElementById("closeNostrFormModal");
  if (closeNostrFormBtn) {
    closeNostrFormBtn.addEventListener("click", () => {
      closeStaticModal("nostrFormModal");
      if (!localStorage.getItem("hasSeenDisclaimer")) {
        const disclaimerModal = document.getElementById("disclaimerModal");
        if (disclaimerModal) {
          openStaticModal(disclaimerModal);
        }
      }
    });
  }

  handleQueryParams();

  window.addEventListener("hashchange", handleHashChange);

  await handleHashChange();

  const { default: disclaimerModal } = await import("./disclaimer.js");
  disclaimerModal.init();
  disclaimerModal.show();
}

async function initializeInterface() {
  startApplication();

  try {
    await bootstrapInterface();
  } catch (error) {
    userLogger.error("Failed to bootstrap bitvid interface:", error);
  }
}

function onDomReady() {
  initializeInterface().catch((error) => {
    userLogger.error("Unhandled error during bitvid initialization:", error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
} else {
  onDomReady();
}

/* -------------------------------------------
   HELPER FUNCTIONS FOR QUERY AND HASH
-------------------------------------------- */

/**
 * Sets the location.hash to "#view=<viewName>",
 * removing any ?modal=... or ?v=... from the query string.
 */
export function setHashView(viewName) {
  const url = new URL(window.location.href);
  url.searchParams.delete("modal");
  url.searchParams.delete("v");
  const newUrl = url.pathname + url.search + `#view=${viewName}`;
  window.history.replaceState({}, "", newUrl);

  if (typeof viewName === "string" && viewName.toLowerCase() === "history") {
  }

  handleHashChange();
}

/**
 * Sets a query param (e.g. ?modal=xxx or ?v=yyy),
 * removing any "#view=..." from the hash to avoid collisions.
 */
export function setQueryParam(key, value) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set(key, value);
  const newUrl = url.pathname + url.search;
  window.history.replaceState({}, "", newUrl);
  handleQueryParams();
}

/**
 * Check the current URL for ?modal=..., ?v=..., etc.
 * Open the correct modals or disclaimers as needed.
 */
function handleQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const modalParam = urlParams.get("modal");

  if (modalParam === "appeals") {
    const appealsModal =
      prepareStaticModal({ id: "contentAppealsModal" }) ||
      document.getElementById("contentAppealsModal");
    if (appealsModal) {
      openStaticModal(appealsModal);
    }
    const closeAppealsBtn = document.getElementById("closeContentAppealsModal");
    if (closeAppealsBtn) {
      closeAppealsBtn.addEventListener("click", () => {
        closeStaticModal("contentAppealsModal");
        if (!localStorage.getItem("hasSeenDisclaimer")) {
          const disclaimerModal = document.getElementById("disclaimerModal");
          if (disclaimerModal) {
            openStaticModal(disclaimerModal);
          }
        }
      });
    }
  } else if (modalParam === "application") {
    const appModal =
      prepareStaticModal({ id: "nostrFormModal" }) ||
      document.getElementById("nostrFormModal");
    if (appModal) {
      openStaticModal(appModal);
    }
  } else {
    const hasSeenDisclaimer = localStorage.getItem("hasSeenDisclaimer");
    if (!hasSeenDisclaimer) {
      const disclaimerModal = document.getElementById("disclaimerModal");
      if (disclaimerModal) {
        openStaticModal(disclaimerModal);
      }
    }
  }

  if (modalParam === "feedback") {
    const feedbackModal =
      prepareStaticModal({ id: "generalFeedbackModal" }) ||
      document.getElementById("generalFeedbackModal");
    if (feedbackModal) {
      openStaticModal(feedbackModal);
    }
  } else if (modalParam === "feature") {
    const featureModal =
      prepareStaticModal({ id: "featureRequestModal" }) ||
      document.getElementById("featureRequestModal");
    if (featureModal) {
      openStaticModal(featureModal);
    }
  } else if (modalParam === "bug") {
    const bugModal =
      prepareStaticModal({ id: "bugFixModal" }) ||
      document.getElementById("bugFixModal");
    if (bugModal) {
      openStaticModal(bugModal);
    }
  }

  const closeFeedbackBtn = document.getElementById("closeGeneralFeedbackModal");
  if (closeFeedbackBtn) {
    closeFeedbackBtn.addEventListener("click", () => {
      closeStaticModal("generalFeedbackModal");
    });
  }
  const closeFeatureBtn = document.getElementById("closeFeatureRequestModal");
  if (closeFeatureBtn) {
    closeFeatureBtn.addEventListener("click", () => {
      closeStaticModal("featureRequestModal");
    });
  }
  const closeBugBtn = document.getElementById("closeBugFixModal");
  if (closeBugBtn) {
    closeBugBtn.addEventListener("click", () => {
      closeStaticModal("bugFixModal");
    });
  }
}

async function handleHashChange() {
  devLogger.log("handleHashChange called, current hash =", window.location.hash);

  try {
    await applicationReadyPromise;
  } catch (error) {
    userLogger.warn(
      "Proceeding with hash handling despite application initialization failure:",
      error
    );
  }

  const hash = window.location.hash || "";
  // Use a regex that captures up to the first ampersand or end of string.
  // E.g. "#view=channel-profile&npub=..." => viewName = "channel-profile"
  const match = hash.match(/^#view=([^&]+)/);

  try {
    if (!match || !match[1]) {
      // No valid "#view=..." => default to "most-recent-videos"
      await loadView("views/most-recent-videos.html");
      const initFn = viewInitRegistry["most-recent-videos"];
      if (typeof initFn === "function") {
        await initFn();
      }
      return;
    }

    const viewName = match[1]; // only the chunk before any '&'
    if (typeof viewName === "string" && viewName.toLowerCase() === "history") {
    }
    const viewUrl = `views/${viewName}.html`;

    // Now dynamically load that partial, then call its init function
    await loadView(viewUrl);
    const initFn = viewInitRegistry[viewName];
    if (typeof initFn === "function") {
      await initFn();
    }
  } catch (error) {
    userLogger.error("Failed to handle hash change:", error);
  }
}
