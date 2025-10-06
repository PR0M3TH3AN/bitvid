// sidebar.js
import { setHashView } from "./index.js";

export function setupSidebarNavigation({ closeSidebar } = {}) {
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
      const isMobile =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(max-width: 767px)").matches
          : window.innerWidth < 768;
      if (isMobile) {
        if (typeof closeSidebar === "function") {
          closeSidebar();
          return;
        }

        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
          sidebar.classList.remove("sidebar-open");
        }
        document.body.classList.remove("sidebar-open");
      }
    });
  });
}
