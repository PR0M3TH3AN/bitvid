// js/viewManager.js
import { initChannelProfileView } from "./channelProfile.js";

/**
 * Load a partial view by URL into the #viewContainer.
 */
export async function loadView(viewUrl) {
  try {
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
  subscriptions: () => {
    console.log("Subscriptions view loaded.");
  },
  "channel-profile": () => {
    // Call the initialization function from channelProfile.js
    initChannelProfileView();
  }
};
