// js/index.js

import "./bufferPolyfill.js";
import { trackPageView } from "./analytics.js";
import { app } from "./app.js";
import {
  importNsec as importNsecKey,
  unlockWithPassphrase,
  forgetDevice,
  hasStoredKey,
  getDefaultKdfParams,
} from "./auth.js";

const INTERFACE_FADE_IN_ANIMATION = "interface-fade-in";
const VIDEO_THUMBNAIL_FADE_IN_ANIMATION = "video-thumbnail-fade-in";

const PASS_STRENGTH_LABELS = [
  "Very weak",
  "Weak",
  "Fair",
  "Strong",
  "Very strong",
];
const PASS_STRENGTH_CLASSES = [
  "text-red-300",
  "text-orange-300",
  "text-amber-300",
  "text-lime-300",
  "text-emerald-300",
];

let unlockModalAutoShown = false;

function setStrengthIndicator(element, score) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const classesToRemove = ["text-gray-300", ...PASS_STRENGTH_CLASSES];
  element.classList.remove(...classesToRemove);

  if (!Number.isFinite(score) || score <= 0) {
    element.textContent = "—";
    element.classList.add("text-gray-300");
    return;
  }

  const clamped = Math.max(0, Math.min(PASS_STRENGTH_CLASSES.length - 1, Math.floor(score)));
  element.textContent = PASS_STRENGTH_LABELS[clamped];
  element.classList.add(PASS_STRENGTH_CLASSES[clamped]);
}

function computePassphraseStrength(passphrase) {
  const normalized = typeof passphrase === "string" ? passphrase.normalize("NFKC") : "";
  if (!normalized) {
    return { score: 0 };
  }

  if (typeof window !== "undefined" && typeof window.zxcvbn === "function") {
    try {
      const result = window.zxcvbn(normalized);
      return { score: Math.max(0, Math.min(4, result.score || 0)) };
    } catch (error) {
      console.warn("zxcvbn evaluation failed:", error);
    }
  }

  const length = normalized.length;
  let score = 0;
  if (length >= 16) {
    score = 4;
  } else if (length >= 12) {
    score = 3;
  } else if (length >= 9) {
    score = 2;
  } else if (length >= 6) {
    score = 1;
  }
  return { score };
}

function hideElement(element) {
  if (element instanceof HTMLElement) {
    element.classList.add("hidden");
  }
}

function showElement(element) {
  if (element instanceof HTMLElement) {
    element.classList.remove("hidden");
  }
}

async function maybePromptUnlock(force = false) {
  const unlockModal = document.getElementById("unlockModal");
  if (!(unlockModal instanceof HTMLElement)) {
    return;
  }
  if (app?.pubkey) {
    return;
  }
  if (!force) {
    if (unlockModalAutoShown || !unlockModal.classList.contains("hidden")) {
      return;
    }
    const loginModal = document.getElementById("loginModal");
    if (loginModal instanceof HTMLElement && !loginModal.classList.contains("hidden")) {
      return;
    }
  }

  let stored = false;
  try {
    stored = await hasStoredKey();
  } catch (error) {
    console.error("Failed to query vault state:", error);
    return;
  }

  if (!stored) {
    return;
  }

  unlockModalAutoShown = true;
  showElement(unlockModal);
  const passInput = document.getElementById("unlockPassphrase");
  if (passInput instanceof HTMLInputElement) {
    setTimeout(() => passInput.focus(), 50);
  }
}

async function setupAuthenticationUI() {
  const loginModal = document.getElementById("loginModal");
  const nsecModal = document.getElementById("nsecLoginModal");
  const unlockModal = document.getElementById("unlockModal");

  const loginNsecButton = document.getElementById("loginNSEC");
  const cancelNsecButton = document.getElementById("cancelNsecLogin");
  const closeNsecButton = document.getElementById("closeNsecLoginModal");
  const nsecForm = document.getElementById("nsecLoginForm");
  const submitNsecButton = document.getElementById("submitNsecLogin");
  const nsecError = document.getElementById("nsecLoginError");
  const nsecInput = document.getElementById("nsecInput");
  const passphraseInput = document.getElementById("nsecPassphrase");
  const confirmInput = document.getElementById("nsecPassphraseConfirm");
  const saveCheckbox = document.getElementById("nsecSaveEncrypted");
  const strengthLabel = document.getElementById("nsecPassphraseStrength");
  const kdfLabel = document.getElementById("nsecKdfLabel");

  const unlockForm = document.getElementById("unlockForm");
  const unlockPassphraseInput = document.getElementById("unlockPassphrase");
  const unlockError = document.getElementById("unlockError");
  const submitUnlockButton = document.getElementById("submitUnlock");
  const unlockReimportButton = document.getElementById("unlockReimport");
  const unlockForgetButton = document.getElementById("unlockForget");
  const closeUnlockButton = document.getElementById("closeUnlockModal");

  try {
    const defaults = getDefaultKdfParams();
    if (kdfLabel) {
      kdfLabel.textContent = `log₂N=${defaults.logN}`;
    }
  } catch (error) {
    console.warn("Failed to compute default KDF params:", error);
  }

  const clearNsecError = () => {
    if (nsecError instanceof HTMLElement) {
      nsecError.textContent = "";
      nsecError.classList.add("hidden");
    }
  };

  const showNsecError = (message) => {
    if (nsecError instanceof HTMLElement) {
      nsecError.textContent = message;
      nsecError.classList.remove("hidden");
    }
  };

  const setNsecLoading = (isLoading) => {
    if (submitNsecButton instanceof HTMLButtonElement) {
      submitNsecButton.disabled = isLoading;
      submitNsecButton.textContent = isLoading ? "Encrypting..." : "Import & Unlock";
    }
    if (cancelNsecButton instanceof HTMLButtonElement) {
      cancelNsecButton.disabled = isLoading;
    }
    if (closeNsecButton instanceof HTMLButtonElement) {
      closeNsecButton.disabled = isLoading;
    }
  };

  const updateStrengthIndicator = () => {
    const value = passphraseInput instanceof HTMLInputElement ? passphraseInput.value : "";
    const { score } = computePassphraseStrength(value);
    setStrengthIndicator(strengthLabel, score);
    return score;
  };

  const openNsecModal = () => {
    clearNsecError();
    updateStrengthIndicator();
    if (loginModal) {
      hideElement(loginModal);
    }
    if (unlockModal) {
      hideElement(unlockModal);
    }
    showElement(nsecModal);
    if (nsecInput instanceof HTMLTextAreaElement) {
      setTimeout(() => nsecInput.focus(), 50);
    }
  };

  const closeNsecModal = () => {
    hideElement(nsecModal);
    if (loginModal) {
      showElement(loginModal);
    }
  };

  loginNsecButton?.addEventListener("click", openNsecModal);
  cancelNsecButton?.addEventListener("click", closeNsecModal);
  closeNsecButton?.addEventListener("click", closeNsecModal);

  if (passphraseInput instanceof HTMLInputElement) {
    passphraseInput.addEventListener("input", () => {
      clearNsecError();
      updateStrengthIndicator();
    });
  }

  if (confirmInput instanceof HTMLInputElement) {
    confirmInput.addEventListener("input", clearNsecError);
  }

  if (nsecInput instanceof HTMLTextAreaElement) {
    nsecInput.addEventListener("input", clearNsecError);
  }

  nsecForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearNsecError();
    if (!(nsecInput instanceof HTMLTextAreaElement)) {
      return;
    }
    const nsecValue = nsecInput.value.trim();
    const passphraseValue =
      passphraseInput instanceof HTMLInputElement ? passphraseInput.value : "";
    const confirmValue =
      confirmInput instanceof HTMLInputElement ? confirmInput.value : "";
    const saveEncrypted = saveCheckbox instanceof HTMLInputElement ? saveCheckbox.checked : true;

    if (!nsecValue) {
      showNsecError("Paste an nsec key to continue.");
      return;
    }

    if (!passphraseValue) {
      showNsecError("Choose a passphrase for your encrypted key.");
      return;
    }

    if (passphraseValue !== confirmValue) {
      showNsecError("Passphrases do not match.");
      return;
    }

    const { score } = computePassphraseStrength(passphraseValue);
    if (saveEncrypted && score < 3) {
      showNsecError("Pick a stronger passphrase before saving the encrypted key.");
      return;
    }

    setNsecLoading(true);
    try {
      const { pubkey } = await importNsecKey(nsecValue, passphraseValue, {
        saveEncrypted,
        kdfParams: getDefaultKdfParams(),
      });

      nsecInput.value = "";
      if (passphraseInput instanceof HTMLInputElement) {
        passphraseInput.value = "";
      }
      if (confirmInput instanceof HTMLInputElement) {
        confirmInput.value = "";
      }
      if (saveCheckbox instanceof HTMLInputElement) {
        saveCheckbox.checked = true;
      }
      setStrengthIndicator(strengthLabel, 0);
      hideElement(nsecModal);
      hideElement(loginModal);

      try {
        await app.login(pubkey, false);
        if (typeof app.showSuccess === "function") {
          app.showSuccess("Secret key imported successfully.");
        }
      } catch (appError) {
        console.error("Failed to finalize login:", appError);
        if (typeof app.showError === "function") {
          app.showError("Imported key, but failed to update the session. Reload and try again.");
        }
      }
    } catch (error) {
      console.error("Failed to import nsec:", error);
      showNsecError(error?.message || "Failed to import your key. Please try again.");
    } finally {
      setNsecLoading(false);
    }
  });

  const clearUnlockError = () => {
    if (unlockError instanceof HTMLElement) {
      unlockError.textContent = "";
      unlockError.classList.add("hidden");
    }
  };

  const showUnlockError = (message) => {
    if (unlockError instanceof HTMLElement) {
      unlockError.textContent = message;
      unlockError.classList.remove("hidden");
    }
  };

  const setUnlockLoading = (isLoading) => {
    if (submitUnlockButton instanceof HTMLButtonElement) {
      submitUnlockButton.disabled = isLoading;
      submitUnlockButton.textContent = isLoading ? "Unlocking..." : "Unlock Session";
    }
    if (unlockReimportButton instanceof HTMLButtonElement) {
      unlockReimportButton.disabled = isLoading;
    }
    if (unlockForgetButton instanceof HTMLButtonElement) {
      unlockForgetButton.disabled = isLoading;
    }
    if (closeUnlockButton instanceof HTMLButtonElement) {
      closeUnlockButton.disabled = isLoading;
    }
  };

  unlockForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearUnlockError();
    const passphraseValue =
      unlockPassphraseInput instanceof HTMLInputElement ? unlockPassphraseInput.value : "";
    if (!passphraseValue) {
      showUnlockError("Enter your passphrase to unlock the key.");
      return;
    }

    setUnlockLoading(true);
    try {
      const { pubkey } = await unlockWithPassphrase(passphraseValue);
      if (unlockPassphraseInput instanceof HTMLInputElement) {
        unlockPassphraseInput.value = "";
      }
      hideElement(unlockModal);
      unlockModalAutoShown = true;
      try {
        await app.login(pubkey, false);
        if (typeof app.showSuccess === "function") {
          app.showSuccess("Key unlocked successfully.");
        }
      } catch (appError) {
        console.error("Failed to finalize login after unlock:", appError);
        if (typeof app.showError === "function") {
          app.showError("Unlocked key, but failed to update the session. Reload and try again.");
        }
      }
    } catch (error) {
      console.error("Failed to unlock key:", error);
      showUnlockError(error?.message || "Incorrect passphrase or corrupted key.");
      if (unlockPassphraseInput instanceof HTMLInputElement) {
        unlockPassphraseInput.value = "";
        unlockPassphraseInput.focus();
      }
    } finally {
      setUnlockLoading(false);
    }
  });

  unlockReimportButton?.addEventListener("click", () => {
    hideElement(unlockModal);
    openNsecModal();
  });

  unlockForgetButton?.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Remove the encrypted key from this device? You will need the original nsec to log in again."
    );
    if (!confirmed) {
      return;
    }
    setUnlockLoading(true);
    clearUnlockError();
    try {
      await forgetDevice();
      unlockModalAutoShown = false;
      hideElement(unlockModal);
      if (unlockPassphraseInput instanceof HTMLInputElement) {
        unlockPassphraseInput.value = "";
      }
      await app.logout();
      if (typeof app.showSuccess === "function") {
        app.showSuccess("Encrypted key removed from this device.");
      }
    } catch (error) {
      console.error("Failed to forget device:", error);
      showUnlockError(error?.message || "Failed to clear the encrypted key.");
    } finally {
      setUnlockLoading(false);
    }
  });

  closeUnlockButton?.addEventListener("click", () => {
    hideElement(unlockModal);
  });

  await maybePromptUnlock();
}

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
  loadModal("components/nsec-login-modal.html"),
  loadModal("components/unlock-modal.html"),
  loadModal("components/application-form.html"),
  loadModal("components/content-appeals-form.html"),

  // New forms
  loadModal("components/general-feedback-form.html"),
  loadModal("components/feature-request-form.html"),
  loadModal("components/bug-fix-form.html"),
])
  .then(async () => {
    console.log("Modals loaded.");
    try {
      await setupAuthenticationUI();
    } catch (error) {
      console.error("Failed to set up authentication UI:", error);
    }
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
