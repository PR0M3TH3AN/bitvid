// sidebar.js
import { setHashView } from "./hashView.js";

export function setupSidebarNavigation() {
  const sidebarLinks = document.querySelectorAll('#sidebar a[href^="#view="]');
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      // e.g. "#view=about"
      const href = link.getAttribute("href") || "";
      const match = href.match(/^#view=(.+)/);
      if (!match) return;

      const viewName = match[1]; // "about", etc.
      setHashView(viewName); // This changes the hash and loads the view.
    });
  });
}
