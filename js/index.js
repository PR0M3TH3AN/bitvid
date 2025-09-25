// js/index.js

import { trackPageView } from "./analytics.js";

const INTERFACE_FADE_IN_ANIMATION = "interface-fade-in";

const handleInterfaceFadeInComplete = (event) => {
  const { animationName, target } = event;
  if (animationName !== INTERFACE_FADE_IN_ANIMATION) {
    return;
  }

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!target.classList.contains("fade-in")) {
    return;
  }

  target.classList.remove("fade-in");
  Array.from(target.classList).forEach((className) => {
    if (className.startsWith("fade-in-delay-")) {
      target.classList.remove(className);
    }
  });
};

document.addEventListener("animationend", handleInterfaceFadeInComplete, true);
document.addEventListener("animationcancel", handleInterfaceFadeInComplete, true);

// 1) Load modals (login, application, etc.)
async function loadModal(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to load " + url);
    }
    const html = await response.text();
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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to load " + url);
    }
    const html = await response.text();
    document.getElementById(containerId).innerHTML = html;
    console.log(url, "loaded into", containerId);
  } catch (err) {
    console.error(err);
  }
}

// 3) Load the disclaimer (now separate)
async function loadDisclaimer(url, containerId) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to load " + url);
    }
    const html = await response.text();
    document.getElementById(containerId).insertAdjacentHTML("beforeend", html);
    console.log(url, "disclaimer loaded into", containerId);
  } catch (err) {
    console.error(err);
  }
}

// 4) Load everything: modals, sidebar, disclaimers
Promise.all([
  // Existing modals
  loadModal("components/login-modal.html"),
  loadModal("components/application-form.html"),
  loadModal("components/content-appeals-form.html"),

  // New forms
  loadModal("components/general-feedback-form.html"),
  loadModal("components/feature-request-form.html"),
  loadModal("components/bug-fix-form.html"),
])
  .then(() => {
    console.log("Modals loaded.");
    return loadSidebar("components/sidebar.html", "sidebarContainer");
  })
  .then(() => {
    console.log("Sidebar loaded.");

    // Attach mobile menu button toggle logic (for sidebar)
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const app = document.getElementById("app");
    if (mobileMenuBtn && sidebar && app) {
      mobileMenuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("sidebar-open");
        app.classList.toggle("sidebar-open");
      });
    }

    // Attach "More" button toggle logic for footer links
    const footerDropdownButton = document.getElementById(
      "footerDropdownButton"
    );
    if (footerDropdownButton) {
      footerDropdownButton.addEventListener("click", () => {
        const footerLinksContainer = document.getElementById(
          "footerLinksContainer"
        );
        if (!footerLinksContainer) return;
        footerLinksContainer.classList.toggle("hidden");
        if (footerLinksContainer.classList.contains("hidden")) {
          footerDropdownButton.innerHTML = "More &#9660;";
        } else {
          footerDropdownButton.innerHTML = "Less &#9650;";
        }
      });
    }

    // Load and set up sidebar navigation
    return import("./sidebar.js").then((module) => {
      module.setupSidebarNavigation();
    });
  })
  .then(() => {
    // Now load the disclaimer
    return loadDisclaimer("components/disclaimer.html", "modalContainer");
  })
  .then(() => {
    console.log("Disclaimer loaded.");

    // 1) Login button => open login modal
    const loginNavBtn = document.getElementById("loginButton");
    if (loginNavBtn) {
      loginNavBtn.addEventListener("click", () => {
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.remove("hidden");
        }
      });
    }

    // 2) Close login modal
    const closeLoginBtn = document.getElementById("closeLoginModal");
    if (closeLoginBtn) {
      closeLoginBtn.addEventListener("click", () => {
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.add("hidden");
        }
      });
    }

    // 3) "Application Form" => open application form
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

    // 4) Close application form
    const closeNostrFormBtn = document.getElementById("closeNostrFormModal");
    if (closeNostrFormBtn) {
      closeNostrFormBtn.addEventListener("click", () => {
        const appModal = document.getElementById("nostrFormModal");
        if (appModal) {
          appModal.classList.add("hidden");
        }
        // If user hasn't seen disclaimer, show it
        if (!localStorage.getItem("hasSeenDisclaimer")) {
          const disclaimerModal = document.getElementById("disclaimerModal");
          if (disclaimerModal) {
            disclaimerModal.classList.remove("hidden");
          }
        }
      });
    }

    // Once everything is loaded, handle the query params (modal? v?) & disclaimers
    handleQueryParams();

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange);

    // Also run once on initial load
    handleHashChange();

    return import("./disclaimer.js");
  })
  .then(({ default: disclaimerModal }) => {
    disclaimerModal.init();
    disclaimerModal.show();
  });

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

function handleHashChange() {
  console.log("handleHashChange called, current hash =", window.location.hash);

  const hash = window.location.hash || "";
  // Use a regex that captures up to the first ampersand or end of string.
  // E.g. "#view=channel-profile&npub=..." => viewName = "channel-profile"
  const match = hash.match(/^#view=([^&]+)/);

  if (!match || !match[1]) {
    // No valid "#view=..." => default to "most-recent-videos"
    import("./viewManager.js").then(({ loadView, viewInitRegistry }) => {
      loadView("views/most-recent-videos.html").then(() => {
        const initFn = viewInitRegistry["most-recent-videos"];
        if (typeof initFn === "function") {
          initFn();
        }
        recordView("most-recent-videos");
      });
    });
    return;
  }

  const viewName = match[1]; // only the chunk before any '&'
  const viewUrl = `views/${viewName}.html`;

  // Now dynamically load that partial, then call its init function
  import("./viewManager.js").then(({ loadView, viewInitRegistry }) => {
      loadView(viewUrl).then(() => {
        const initFn = viewInitRegistry[viewName];
        if (typeof initFn === "function") {
          initFn();
        }
      });
  });
}
