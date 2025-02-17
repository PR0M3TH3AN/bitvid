// sidebar.js
import { setHashView } from "./index.js";

export function setupSidebarNavigation() {
  const sidebarLinks = document.querySelectorAll('#sidebar a[href^="#view="]');
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      // e.g. "#view=about"
      const href = link.getAttribute("href") || "";
      const match = href.match(/^#view=(.+)/);
      if (!match) return;

      const viewName = match[1]; // "about", "ipns", etc.
      setHashView(viewName); // This changes the hash and loads the view.

      // --- NEW: if on mobile, close the sidebar automatically. ---
      if (window.innerWidth < 768) {
        const sidebar = document.getElementById("sidebar");
        const app = document.getElementById("app");
        if (sidebar && app) {
          sidebar.classList.remove("sidebar-open");
          app.classList.remove("sidebar-open");
        }
      }
    });
  });
}
