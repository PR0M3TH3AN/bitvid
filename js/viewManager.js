// js/viewManager.js

// Load a partial view by URL into the #viewContainer
export async function loadView(viewUrl) {
  try {
    const res = await fetch(viewUrl);
    if (!res.ok) {
      throw new Error(`Failed to load view: ${res.status}`);
    }
    const html = await res.text();
    document.getElementById("viewContainer").innerHTML = html;
  } catch (err) {
    console.error("View loading error:", err);
    document.getElementById("viewContainer").innerHTML =
      "<p class='text-center text-red-500'>Failed to load content.</p>";
  }
}
