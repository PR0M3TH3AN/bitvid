// js/sidebar.js
import { setHashView } from "./index.js"; // <--- or wherever you put it

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
      setHashView(viewName);
      // That removes ?modal=, ?v=, sets #view=viewName,
      // and triggers handleHashChange() automatically
    });
  });
}
