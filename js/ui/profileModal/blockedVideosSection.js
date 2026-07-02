// Helpers for the admin pane's "Blocked videos" sub-tab (#25 follow-up): render
// the per-event admin block list with an unblock control, and add-by-id. Kept
// separate from ProfileAdminController so that controller stays under its size
// cap and the row-building logic is unit-testable without a DOM.

// Shorten a 64-char hex event id (or any long token) for compact display.
export function shortenEventId(id) {
  const value = typeof id === "string" ? id.trim() : "";
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

// Pure: turn the raw blocked-id list into display rows, enriching with a video's
// title/author when `resolveVideo(id)` can find it in the local cache (falls
// back to the shortened id). De-dupes and drops blanks so the UI can't render a
// ghost row for a malformed entry.
export function buildBlockedVideoRows(ids, resolveVideo) {
  const list = Array.isArray(ids) ? ids : [];
  const seen = new Set();
  const rows = [];
  for (const raw of list) {
    const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);

    let title = "";
    let author = "";
    if (typeof resolveVideo === "function") {
      try {
        const video = resolveVideo(id);
        if (video && typeof video === "object") {
          title = typeof video.title === "string" ? video.title.trim() : "";
          author = typeof video.pubkey === "string" ? video.pubkey.trim() : "";
        }
      } catch (error) {
        // Best-effort enrichment; fall back to the id.
      }
    }

    rows.push({
      id,
      title,
      author,
      // Primary line: the video title when known, else the shortened id.
      label: title || shortenEventId(id),
      // Secondary line: the shortened id, only when the title is the primary.
      sublabel: title ? shortenEventId(id) : "",
    });
  }
  return rows;
}

// Thin DOM render for the blocked-videos <ul>. Mirrors the admin list card
// styling. `onUnblock(id, button)` handles confirm + removal in the controller.
export function renderBlockedVideosList(
  listEl,
  emptyEl,
  rows,
  { onUnblock, formatAuthor } = {},
) {
  if (!(listEl instanceof HTMLElement) || !(emptyEl instanceof HTMLElement)) {
    return;
  }

  listEl.textContent = "";

  const setHidden = (element, hidden) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.classList.toggle("hidden", hidden);
    if (hidden) {
      element.setAttribute("hidden", "");
    } else {
      element.removeAttribute("hidden");
    }
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    setHidden(emptyEl, false);
    setHidden(listEl, true);
    return;
  }

  setHidden(emptyEl, true);
  setHidden(listEl, false);

  for (const row of rows) {
    const item = document.createElement("li");
    item.className =
      "card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between";
    item.dataset.eventId = row.id;

    const info = document.createElement("div");
    info.className = "min-w-0 space-y-1";

    const label = document.createElement("p");
    label.className = "truncate font-medium text-text";
    label.textContent = row.label;
    label.title = row.id;
    info.appendChild(label);

    const authorText =
      row.author && typeof formatAuthor === "function"
        ? formatAuthor(row.author)
        : "";
    const secondaryText = [row.sublabel, authorText].filter(Boolean).join(" · ");
    if (secondaryText) {
      const sub = document.createElement("p");
      sub.className = "truncate text-xs text-muted";
      sub.textContent = secondaryText;
      info.appendChild(sub);
    }

    item.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring";
    button.dataset.variant = "danger";
    button.textContent = "Unblock";
    button.setAttribute("aria-label", `Unblock video ${row.label}`);
    button.addEventListener("click", () => {
      if (typeof onUnblock === "function") {
        onUnblock(row.id, button);
      }
    });

    item.appendChild(button);
    listEl.appendChild(item);
  }
}
