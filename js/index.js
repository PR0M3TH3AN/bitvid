// js/index.js

import { validateInstanceConfig } from "../config/validate-config.js";
import { ASSET_VERSION } from "../config/asset-version.js";
import "./bufferPolyfill.js";
import Application from "./app.js";
import { setApplication, setApplicationReady } from "./applicationContext.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import { loadView, viewInitRegistry } from "./viewManager.js";

validateInstanceConfig();

let application = null;
let applicationReadyPromise = Promise.resolve();

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
    console.error("Application failed to initialize:", error);
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
    // Remove analytics loader tags from modal partials to avoid duplicate pageview events.
    const sanitizedHtml = html.replace(
      /<script\b[^>]*src=["'][^"']*tracking\.js[^"']*["'][^>]*>\s*<\/script>/gi,
      ""
    );
    document
      .getElementById("modalContainer")
      .insertAdjacentHTML("beforeend", sanitizedHtml);
    console.log(url, "loaded");
  } catch (err) {
    console.error(err);
  }
}

// 2) Load sidebar
async function loadSidebar(url, containerId) {
  try {
    const html = await fetchPartial(url);
    document.getElementById(containerId).innerHTML = html;
    console.log(url, "loaded into", containerId);
  } catch (err) {
    console.error(err);
  }
}

// 3) Load the disclaimer (now separate)
async function loadDisclaimer(url, containerId) {
  try {
    const html = await fetchPartial(url);
    document.getElementById(containerId).insertAdjacentHTML("beforeend", html);
    console.log(url, "disclaimer loaded into", containerId);
  } catch (err) {
    console.error(err);
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

  console.log("Modals loaded.");

  await loadSidebar("components/sidebar.html", "sidebarContainer");
  console.log("Sidebar loaded.");

  const sidebar = document.getElementById("sidebar");
  const collapseToggle = document.getElementById("sidebarCollapseToggle");
  if (sidebar && !sidebar.hasAttribute("data-footer-state")) {
    sidebar.setAttribute("data-footer-state", "collapsed");
  }
  if (!collapseToggle) {
    console.warn("Sidebar collapse toggle not found; skipping density controls.");
  }

  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebarCollapsed";
  const SIDEBAR_WIDTH_EXPANDED = "16rem";
  const SIDEBAR_WIDTH_COLLAPSED = "4rem";
  let isSidebarCollapsed = false;

  const readStoredSidebarCollapsed = () => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch (error) {
      console.warn("Unable to read sidebar collapse state from storage:", error);
      return false;
    }
  };

  const persistSidebarCollapsed = (collapsed) => {
    try {
      localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        collapsed ? "true" : "false",
      );
    } catch (error) {
      console.warn("Unable to persist sidebar collapse state:", error);
    }
  };

  const applySidebarDensity = (collapsed) => {
    const widthTargets = [document.documentElement, document.body].filter(
      (element) => element instanceof HTMLElement,
    );
    if (sidebar instanceof HTMLElement) {
      widthTargets.push(sidebar);
    }
    const appShell = document.getElementById("app");
    if (appShell instanceof HTMLElement) {
      widthTargets.push(appShell);
    }
    const state = collapsed ? "collapsed" : "expanded";
    const nextWidth = collapsed
      ? SIDEBAR_WIDTH_COLLAPSED
      : SIDEBAR_WIDTH_EXPANDED;

    widthTargets.forEach((element) => {
      element.style.setProperty("--sidebar-width", nextWidth);
    });

    [sidebar, document.body]
      .filter((element) => element instanceof HTMLElement)
      .forEach((element) => {
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
  };

  const syncSidebarDensityToViewport = (isDesktopViewport) => {
    if (!collapseToggle) {
      applySidebarDensity(false);
      return;
    }

    if (isDesktopViewport) {
      isSidebarCollapsed = readStoredSidebarCollapsed();
      applySidebarDensity(isSidebarCollapsed);
      return;
    }

    applySidebarDensity(false);
  };

  if (collapseToggle) {
    isSidebarCollapsed = readStoredSidebarCollapsed();
  }

  const setSidebarState = (isOpen) => {
    if (sidebar) {
      sidebar.classList.toggle("sidebar-open", isOpen);
    }
    document.body.classList.toggle("sidebar-open", isOpen);
    if (mobileMenuBtn) {
      mobileMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  };

  const closeSidebar = () => setSidebarState(false);
  const isMobileViewport = () => {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 767px)").matches;
    }
    return window.innerWidth < 768;
  };

  const toggleSidebar = () => {
    if (!sidebar) return;
    const isMobile = isMobileViewport();
    if (!isMobile) return;
    const shouldOpen = !sidebar.classList.contains("sidebar-open");
    setSidebarState(shouldOpen);
  };

  let desktopQuery = null;
  const isDesktopViewport = () => {
    if (desktopQuery) {
      return desktopQuery.matches;
    }
    return window.innerWidth >= 768;
  };

  if (collapseToggle) {
    collapseToggle.addEventListener("click", (event) => {
      const desktop = isDesktopViewport();
      if (!desktop) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      const nextCollapsed = !isSidebarCollapsed;
      isSidebarCollapsed = nextCollapsed;
      applySidebarDensity(nextCollapsed);
      persistSidebarCollapsed(nextCollapsed);
    });
  }

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener("click", toggleSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar && sidebar.classList.contains("sidebar-open")) {
      closeSidebar();
    }
  });

  if (typeof window.matchMedia === "function") {
    desktopQuery = window.matchMedia("(min-width: 768px)");
    syncSidebarDensityToViewport(desktopQuery.matches);

    const onDesktopChange = (event) => {
      if (event.matches) {
        closeSidebar();
        syncSidebarDensityToViewport(true);
        return;
      }

      syncSidebarDensityToViewport(false);
    };

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", onDesktopChange);
    } else if (typeof desktopQuery.addListener === "function") {
      desktopQuery.addListener(onDesktopChange);
    }
  } else {
    syncSidebarDensityToViewport(window.innerWidth >= 768);
  }

  const footerDropdownButton = document.getElementById("footerDropdownButton");
  const footerLinksContainer = document.getElementById("footerLinksContainer");
  const footerDropdownLabel = document.getElementById("footerDropdownText");
  const footerDropdownIcon = document.getElementById("footerDropdownIcon");

  if (footerDropdownButton && footerLinksContainer) {
    const sidebarFooter = footerDropdownButton.closest(".sidebar-footer");

    const syncFooterDropup = (expanded) => {
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

      syncFooterDropup(!expanded);
    });

    const initialExpanded = footerDropdownButton.getAttribute("aria-expanded") === "true";
    syncFooterDropup(initialExpanded);
  }

  try {
    const sidebarModule = await import("./sidebar.js");
    if (typeof sidebarModule.setupSidebarNavigation === "function") {
      sidebarModule.setupSidebarNavigation({ closeSidebar });
    }
  } catch (error) {
    console.error("Failed to set up sidebar navigation:", error);
  }

  await loadDisclaimer("components/disclaimer.html", "modalContainer");
  console.log("Disclaimer loaded.");

  const loginNavBtn = document.getElementById("loginButton");
  if (loginNavBtn) {
    loginNavBtn.addEventListener("click", () => {
      const loginModal = document.getElementById("loginModal");
      if (loginModal) {
        loginModal.classList.remove("hidden");
      }
    });
  }

  const closeLoginBtn = document.getElementById("closeLoginModal");
  if (closeLoginBtn) {
    closeLoginBtn.addEventListener("click", () => {
      const loginModal = document.getElementById("loginModal");
      if (loginModal) {
        loginModal.classList.add("hidden");
      }
    });
  }

  const openAppFormBtn = document.getElementById("openApplicationModal");
  if (openAppFormBtn) {
    openAppFormBtn.addEventListener("click", () => {
      const loginModal = document.getElementById("loginModal");
      if (loginModal) {
        loginModal.classList.add("hidden");
      }
      const appModal = document.getElementById("nostrFormModal");
      if (appModal) {
        appModal.classList.remove("hidden");
      }
    });
  }

  const closeNostrFormBtn = document.getElementById("closeNostrFormModal");
  if (closeNostrFormBtn) {
    closeNostrFormBtn.addEventListener("click", () => {
      const appModal = document.getElementById("nostrFormModal");
      if (appModal) {
        appModal.classList.add("hidden");
      }
      if (!localStorage.getItem("hasSeenDisclaimer")) {
        const disclaimerModal = document.getElementById("disclaimerModal");
        if (disclaimerModal) {
          disclaimerModal.classList.remove("hidden");
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
    console.error("Failed to bootstrap Bitvid interface:", error);
  }
}

function onDomReady() {
  initializeInterface().catch((error) => {
    console.error("Unhandled error during Bitvid initialization:", error);
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
    const appealsModal = document.getElementById("contentAppealsModal");
    if (appealsModal) {
      appealsModal.classList.remove("hidden");
    }
    const closeAppealsBtn = document.getElementById("closeContentAppealsModal");
    if (closeAppealsBtn) {
      closeAppealsBtn.addEventListener("click", () => {
        const appealsModal = document.getElementById("contentAppealsModal");
        if (appealsModal) {
          appealsModal.classList.add("hidden");
        }
        if (!localStorage.getItem("hasSeenDisclaimer")) {
          const disclaimerModal = document.getElementById("disclaimerModal");
          if (disclaimerModal) {
            disclaimerModal.classList.remove("hidden");
          }
        }
      });
    }
  } else if (modalParam === "application") {
    const appModal = document.getElementById("nostrFormModal");
    if (appModal) {
      appModal.classList.remove("hidden");
    }
  } else {
    const hasSeenDisclaimer = localStorage.getItem("hasSeenDisclaimer");
    if (!hasSeenDisclaimer) {
      const disclaimerModal = document.getElementById("disclaimerModal");
      if (disclaimerModal) {
        disclaimerModal.classList.remove("hidden");
      }
    }
  }

  if (modalParam === "feedback") {
    const feedbackModal = document.getElementById("generalFeedbackModal");
    if (feedbackModal) {
      feedbackModal.classList.remove("hidden");
    }
  } else if (modalParam === "feature") {
    const featureModal = document.getElementById("featureRequestModal");
    if (featureModal) {
      featureModal.classList.remove("hidden");
    }
  } else if (modalParam === "bug") {
    const bugModal = document.getElementById("bugFixModal");
    if (bugModal) {
      bugModal.classList.remove("hidden");
    }
  }

  const closeFeedbackBtn = document.getElementById("closeGeneralFeedbackModal");
  if (closeFeedbackBtn) {
    closeFeedbackBtn.addEventListener("click", () => {
      const feedbackModal = document.getElementById("generalFeedbackModal");
      if (feedbackModal) {
        feedbackModal.classList.add("hidden");
      }
    });
  }
  const closeFeatureBtn = document.getElementById("closeFeatureRequestModal");
  if (closeFeatureBtn) {
    closeFeatureBtn.addEventListener("click", () => {
      const featureModal = document.getElementById("featureRequestModal");
      if (featureModal) {
        featureModal.classList.add("hidden");
      }
    });
  }
  const closeBugBtn = document.getElementById("closeBugFixModal");
  if (closeBugBtn) {
    closeBugBtn.addEventListener("click", () => {
      const bugModal = document.getElementById("bugFixModal");
      if (bugModal) {
        bugModal.classList.add("hidden");
      }
    });
  }
}

async function handleHashChange() {
  console.log("handleHashChange called, current hash =", window.location.hash);

  try {
    await applicationReadyPromise;
  } catch (error) {
    console.warn(
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
    console.error("Failed to handle hash change:", error);
  }
}
