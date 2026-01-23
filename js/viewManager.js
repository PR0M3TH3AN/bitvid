// js/viewManager.js
import { initChannelProfileView } from "./channelProfile.js";
import { initForYouView } from "./forYouView.js";
import { initExploreView } from "./exploreView.js";
import { subscriptions } from "./subscriptions.js";
import { getApplication } from "./applicationContext.js";
import { ASSET_VERSION } from "../config/asset-version.js";
import { applyDesignSystemAttributes } from "./designSystem.js";
import { devLogger, userLogger } from "./utils/logger.js";
import { attachFeedInfoPopover } from "./ui/components/FeedInfoPopover.js";

const TRACKING_SCRIPT_PATTERN = /(?:^|\/)tracking\.js(?:$|\?)/;

const withAssetVersion = (url) => {
  if (typeof url !== "string" || url.length === 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(ASSET_VERSION)}`;
};

/**
 * Load a partial view by URL into the #viewContainer.
 */
export async function loadView(viewUrl) {
  try {
    const app = getApplication();
    if (app && typeof app.prepareForViewLoad === "function") {
      app.prepareForViewLoad();
    }

    const res = await fetch(withAssetVersion(viewUrl), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load view: ${res.status}`);
    }
    const text = await res.text();

    // Use a DOMParser to extract the body contents
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const container = document.getElementById("viewContainer");

    container.innerHTML = doc.body.innerHTML;
    applyDesignSystemAttributes(container);

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
    userLogger.error("View loading error:", err);
    const fallbackMarkup = `
      <div class="bv-stack">
        <article class="card p-md" data-state="critical">
          <p class="text-sm text-critical-strong text-center">
            Failed to load content.
          </p>
        </article>
      </div>
    `;
    const fallbackContainer = document.getElementById("viewContainer");
    if (fallbackContainer) {
      fallbackContainer.innerHTML = fallbackMarkup;
      applyDesignSystemAttributes(fallbackContainer);
    }
  }
}

/**
 * Registry of view-specific initialization functions.
 */
export const viewInitRegistry = {
  "most-recent-videos": () => {
    const app = getApplication();
    if (app && typeof app.loadVideos === "function") {
      if (typeof app.mountVideoListView === "function") {
        app.mountVideoListView();
      }
      app.loadVideos();
    }
    // Force profile updates after the new view is in place.
    const refreshApp = getApplication();
    if (refreshApp && typeof refreshApp.forceRefreshAllProfiles === "function") {
      refreshApp.forceRefreshAllProfiles();
    }

    const infoTrigger = document.getElementById("recentInfoTrigger");
    if (infoTrigger) {
      attachFeedInfoPopover(
        infoTrigger,
        "Global chronological feed from all relays."
      );
    }
  },
  "for-you": () => {
    initForYouView();
    const app = getApplication();
    if (app && typeof app.loadForYouVideos === "function") {
      if (typeof app.mountVideoListView === "function") {
        app.mountVideoListView();
      }
      app.loadForYouVideos();
    }
    // Force profile updates after the new view is in place.
    const refreshApp = getApplication();
    if (refreshApp && typeof refreshApp.forceRefreshAllProfiles === "function") {
      refreshApp.forceRefreshAllProfiles();
    }
  },
  explore: () => {
    initExploreView();
    const app = getApplication();
    if (app && typeof app.loadExploreVideos === "function") {
      if (typeof app.mountVideoListView === "function") {
        app.mountVideoListView({ includeTags: false });
      }
      app.loadExploreVideos();
    }
    const refreshApp = getApplication();
    if (refreshApp && typeof refreshApp.forceRefreshAllProfiles === "function") {
      refreshApp.forceRefreshAllProfiles();
    }
  },
  history: async () => {
    try {
      const module = await import("./historyView.js");
      if (typeof module.initHistoryView === "function") {
        await module.initHistoryView();
      }
    } catch (error) {
      userLogger.error("Failed to initialize history view:", error);
    }
  },

  /**
   * Subscriptions view:
   * - If user is logged in, calls subscriptions.showSubscriptionVideos
   *   which loads subs if needed and renders the video grid in #subscriptionsVideoList
   */
  subscriptions: async () => {
    devLogger.log("Subscriptions view loaded.");

    const infoTrigger = document.getElementById("subscriptionsInfoTrigger");
    if (infoTrigger) {
      attachFeedInfoPopover(
        infoTrigger,
        "Latest videos from channels you follow."
      );
    }

    const app = getApplication();
    if (!app?.pubkey) {
      const container = document.getElementById("subscriptionsVideoList");
      if (container) {
        container.innerHTML =
          "<p class='text-muted'>Please log in to see your subscriptions.</p>";
      }
      return;
    }

    // If user is logged in, let the SubscriptionsManager do everything:
    await subscriptions.showSubscriptionVideos(
      app.pubkey,
      "subscriptionsVideoList"
    );
  },

  "channel-profile": () => {
    // Call the initialization function from channelProfile.js
    initChannelProfileView();
  },
  search: async () => {
    try {
      const module = await import("./searchView.js");
      if (typeof module.initSearchView === "function") {
        await module.initSearchView();
      }
    } catch (error) {
      userLogger.error("Failed to initialize search view:", error);
    }
  },
};
