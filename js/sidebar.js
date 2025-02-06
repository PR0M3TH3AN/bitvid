//js/sidebar.js

import { loadView } from "./viewManager.js";
import { viewInitRegistry } from "./viewManager.js";

export function setupSidebarNavigation() {
  // Grab all primary nav links that use the "#view=..." pattern
  const sidebarLinks = document.querySelectorAll('#sidebar a[href^="#view="]');
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      // For a link like "#view=most-recent-videos", parse out "most-recent-videos"
      const href = link.getAttribute("href") || "";
      const viewMatch = href.match(/#view=(.+)/);
      if (!viewMatch || !viewMatch[1]) {
        return;
      }
      const viewName = viewMatch[1]; // e.g. "most-recent-videos"
      const viewUrl = `views/${viewName}.html`;

      // Load the partial view
      loadView(viewUrl).then(() => {
        // If there's a post-load function for this view, call it
        const initFn = viewInitRegistry[viewName];
        if (typeof initFn === "function") {
          initFn();
        }
      });
    });
  });
}
