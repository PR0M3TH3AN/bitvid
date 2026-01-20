// sidebar.js
<<<<<<< HEAD
import { setHashView } from "./hashView.js";
=======
import { setHashView } from "./index.js";
>>>>>>> origin/main

export function setupSidebarNavigation() {
  const sidebarLinks = document.querySelectorAll('#sidebar a[href^="#view="]');
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      // e.g. "#view=about"
      const href = link.getAttribute("href") || "";
      const match = href.match(/^#view=(.+)/);
      if (!match) return;

<<<<<<< HEAD
      const viewName = match[1]; // "about", etc.
=======
      const viewName = match[1]; // "about", "ipns", etc.
>>>>>>> origin/main
      setHashView(viewName); // This changes the hash and loads the view.
    });
  });
}
