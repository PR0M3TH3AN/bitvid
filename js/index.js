// js/index.js

// 1) Load modals (login, application, etc.)
async function loadModal(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to load " + url);
    }
    const html = await response.text();
    document
      .getElementById("modalContainer")
      .insertAdjacentHTML("beforeend", html);
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

    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const app = document.getElementById("app"); // <-- new

    if (mobileMenuBtn && sidebar && app) {
      mobileMenuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("hidden");
        sidebar.classList.toggle("-translate-x-full");
        // Toggle the class on #app so it shifts right
        app.classList.toggle("sidebar-open");
      });
    }

    // Load and set up sidebar navigation
    // (We assume it calls setHashView(...) now)
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

    // 3) “Application Form” => open application form
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

  // Remove possibly conflicting query params
  url.searchParams.delete("modal");
  url.searchParams.delete("v");

  // Keep the existing path + updated search, set the new hash
  const newUrl = url.pathname + url.search + `#view=${viewName}`;

  // Replace the URL so no full reload
  window.history.replaceState({}, "", newUrl);

  // Manually trigger handleHashChange so the view loads immediately
  handleHashChange();
}

/**
 * Sets a query param (e.g. ?modal=xxx or ?v=yyy),
 * removing any "#view=..." from the hash to avoid collisions.
 */
export function setQueryParam(key, value) {
  const url = new URL(window.location.href);

  // Remove any #view=... from the hash
  url.hash = "";

  // Set the query param
  url.searchParams.set(key, value);

  // Replace the URL
  const newUrl = url.pathname + url.search;
  window.history.replaceState({}, "", newUrl);

  // Immediately handle it
  handleQueryParams();
}

/**
 * Check the current URL for ?modal=..., ?v=..., etc.
 * Open the correct modals or disclaimers as needed.
 */
function handleQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const modalParam = urlParams.get("modal");

  // 5) Check ?modal=... param (moved from original code)
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
        // Show disclaimer if not seen
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
    // If there's no special param, disclaimers can show if user hasn't seen them
    const hasSeenDisclaimer = localStorage.getItem("hasSeenDisclaimer");
    if (!hasSeenDisclaimer) {
      const disclaimerModal = document.getElementById("disclaimerModal");
      if (disclaimerModal) {
        disclaimerModal.classList.remove("hidden");
      }
    }
  }

  // 8) Additional forms
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

  // 9) Close buttons
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

  // You could also check ?v=someEvent to open a video, etc.
  // if you want to keep ?v= param logic here.
  // ...
}

/**
 * Handle #view=... in the hash and load the correct partial view.
 */
function handleHashChange() {
  console.log("handleHashChange called, current hash =", window.location.hash);
  const hash = window.location.hash || "";
  // Expecting something like #view=most-recent-videos
  const match = hash.match(/^#view=(.+)/);

  // If no #view=..., load "most-recent-videos" as default
  if (!match || !match[1]) {
    import("./viewManager.js").then(({ loadView, viewInitRegistry }) => {
      loadView("views/most-recent-videos.html").then(() => {
        const initFn = viewInitRegistry["most-recent-videos"];
        if (typeof initFn === "function") {
          initFn();
        }
      });
    });
    return;
  }

  const viewName = match[1];
  const viewUrl = `views/${viewName}.html`;

  // Load the partial
  import("./viewManager.js").then(({ loadView, viewInitRegistry }) => {
    loadView(viewUrl).then(() => {
      const initFn = viewInitRegistry[viewName];
      if (typeof initFn === "function") {
        initFn();
      }
    });
  });
}
