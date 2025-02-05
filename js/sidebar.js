import { loadView } from "./viewManager.js";

/**
 * Wire up the sidebar links.
 * Home => loads the "most-recent-videos" partial and re-renders videos
 * Explore => loads explore.html with a "Coming Soon" message
 * Subscriptions => loads subscriptions.html with a "Coming Soon" message
 */
export function setupSidebarNavigation() {
  // 1) Home
  const homeLink = document.querySelector('a[href="#view=most-recent-videos"]');
  if (homeLink) {
    homeLink.addEventListener("click", (e) => {
      e.preventDefault();
      loadView("views/most-recent-videos.html").then(() => {
        // Once the partial is loaded, reassign #videoList + call loadVideos
        if (window.app && window.app.loadVideos) {
          window.app.videoList = document.getElementById("videoList");
          window.app.loadVideos();
        }
      });
    });
  }

  // 2) Explore
  const exploreLink = document.querySelector('a[href="#view=explore"]');
  if (exploreLink) {
    exploreLink.addEventListener("click", (e) => {
      e.preventDefault();
      loadView("views/explore.html");
      // We just show the partial. No dynamic videos needed yet.
    });
  }

  // 3) Subscriptions
  const subscriptionsLink = document.querySelector(
    'a[href="#view=subscriptions"]'
  );
  if (subscriptionsLink) {
    subscriptionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      loadView("views/subscriptions.html");
      // Also "Coming Soon" in that partial for now.
    });
  }
}
