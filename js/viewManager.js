// js/viewManager.js
import { initChannelProfileView } from "./channelProfile.js";
import { subscriptions } from "./subscriptions.js";

const TRACKING_SCRIPT_PATTERN = /(?:^|\/)tracking\.js(?:$|\?)/;

/**
 * Load a partial view by URL into the #viewContainer.
 */
export async function loadView(viewUrl) {
  try {
    if (window.app && typeof window.app.prepareForViewLoad === "function") {
      window.app.prepareForViewLoad();
    }

    const res = await fetch(viewUrl);
    if (!res.ok) {
      throw new Error(`Failed to load view: ${res.status}`);
    }
    const text = await res.text();

    // Use a DOMParser to extract the body contents
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const container = document.getElementById("viewContainer");

    container.innerHTML = doc.body.innerHTML;

    // Copy and execute any inline scripts
    const scriptTags = doc.querySelectorAll("script");
    scriptTags.forEach((oldScript) => {
      const src = oldScript.getAttribute("src") || "";
      if (src && TRACKING_SCRIPT_PATTERN.test(src)) {
        return;
      }
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      container.appendChild(newScript);
    });
  } catch (err) {
    console.error("View loading error:", err);
    document.getElementById("viewContainer").innerHTML =
      "<p class='text-center text-red-500'>Failed to load content.</p>";
  }
}

/**
 * Registry of view-specific initialization functions.
 */
export const viewInitRegistry = {
  "most-recent-videos": () => {
    if (window.app && window.app.loadVideos) {
      window.app.videoList = document.getElementById("videoList");
      if (window.app.attachVideoListHandler) {
        window.app.attachVideoListHandler();
      }
      window.app.loadVideos();
    }
    // Force profile updates after the new view is in place.
    if (window.app && window.app.forceRefreshAllProfiles) {
      window.app.forceRefreshAllProfiles();
    }
  },
  explore: () => {
    console.log("Explore view loaded.");
  },
  history: async () => {
    try {
      const module = await import("./historyView.js");
      if (typeof module.initHistoryView === "function") {
        await module.initHistoryView();
      }
    } catch (error) {
      console.error("Failed to initialize history view:", error);
    }
  },

  /**
   * Subscriptions view:
   * - If user is logged in, calls subscriptions.showSubscriptionVideos
   *   which loads subs if needed and renders the video grid in #subscriptionsVideoList
   */
  subscriptions: async () => {
    console.log("Subscriptions view loaded.");

    if (!window.app.pubkey) {
      const container = document.getElementById("subscriptionsVideoList");
      if (container) {
        container.innerHTML =
          "<p class='text-gray-500'>Please log in to see your subscriptions.</p>";
      }
      return;
    }

    // If user is logged in, let the SubscriptionsManager do everything:
    await subscriptions.showSubscriptionVideos(
      window.app.pubkey,
      "subscriptionsVideoList"
    );
  },

  "channel-profile": () => {
    // Call the initialization function from channelProfile.js
    initChannelProfileView();
  },
};
