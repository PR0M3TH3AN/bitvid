// js/ui/playlistPicker.js
//
// "Add to playlist" dialog (#37). Modeled on confirmDialog.js — builds its own
// `bv-modal modal-always-on-top` overlay so it stacks over the video modal. Lists
// the signed-in user's playlists as checkboxes (checked when the video is already
// in them) plus a "Create new playlist" input. On Save it diffs the checkboxes,
// adds/removes the video in each changed playlist, creates a new one if named,
// and publishes each change via the facade (active signer). Self-contained: it
// reads the current pubkey from nostrClient, so callers only pass the video's
// addressable coordinate.

import { nostrClient } from "../nostrClientFacade.js";
import {
  fetchCreatorPlaylists,
  publishPlaylist,
} from "../playlists/playlistFacade.js";
import {
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  generatePlaylistId,
  playlistItemKey,
} from "../playlists/playlistService.js";
import { userLogger } from "../utils/logger.js";

function hasVideo(playlist, coordinate) {
  const key = `a:${coordinate}`;
  return playlist.items.some((item) => playlistItemKey(item) === key);
}

function makeButton(label, { ghost = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = ghost ? "btn-ghost focus-ring" : "btn focus-ring";
  btn.textContent = label;
  return btn;
}

/**
 * Open the "Add to playlist" dialog for a video.
 * @param {Object} params
 * @param {string} params.videoCoordinate  "30078:pubkey:d" for the video
 * @param {(kind: "success"|"error", message: string) => void} [params.notify]
 * @returns {Promise<void>}
 */
export async function openPlaylistPicker({ videoCoordinate, notify } = {}) {
  const say = typeof notify === "function" ? notify : () => {};
  const coordinate =
    typeof videoCoordinate === "string" ? videoCoordinate.trim() : "";
  if (!coordinate) {
    say("error", "Couldn't identify this video.");
    return;
  }

  const pubkey =
    typeof nostrClient?.pubkey === "string"
      ? nostrClient.pubkey.trim().toLowerCase()
      : "";
  if (!pubkey) {
    say("error", "Log in to add videos to a playlist.");
    return;
  }

  if (typeof document === "undefined" || !document.body) {
    return;
  }

  let playlists = [];
  try {
    playlists = await fetchCreatorPlaylists(pubkey, { includeEmpty: true });
  } catch (error) {
    userLogger.warn("[playlistPicker] Failed to load playlists:", error);
    playlists = [];
  }

  await new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className =
      "bv-modal modal-always-on-top items-start justify-center md:items-center";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Add to playlist");

    const backdrop = document.createElement("div");
    backdrop.className = "bv-modal-backdrop";
    overlay.appendChild(backdrop);

    const sheet = document.createElement("div");
    sheet.className = "modal-sheet w-full max-w-md flex flex-col";
    sheet.tabIndex = -1;
    overlay.appendChild(sheet);

    const header = document.createElement("div");
    header.className = "modal-header";
    const heading = document.createElement("h2");
    heading.className = "text-lg font-bold text-text";
    heading.textContent = "Add to playlist";
    header.appendChild(heading);
    sheet.appendChild(header);

    const body = document.createElement("div");
    body.className = "p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto";
    sheet.appendChild(body);

    // Existing playlists as checkboxes.
    const checkboxes = []; // { playlist, input, wasIn }
    for (const playlist of playlists) {
      const row = document.createElement("label");
      row.className = "flex items-center gap-3 cursor-pointer";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "shrink-0";
      const wasIn = hasVideo(playlist, coordinate);
      input.checked = wasIn;
      const text = document.createElement("span");
      text.className = "text-sm text-text";
      const n = playlist.items.length;
      text.textContent = `${playlist.title} (${n})`;
      row.appendChild(input);
      row.appendChild(text);
      body.appendChild(row);
      checkboxes.push({ playlist, input, wasIn });
    }

    if (!playlists.length) {
      const empty = document.createElement("p");
      empty.className = "text-sm text-muted";
      empty.textContent = "You don't have any playlists yet — create one below.";
      body.appendChild(empty);
    }

    // Create-new field.
    const newWrap = document.createElement("div");
    newWrap.className = "flex flex-col gap-1 border-t border-border/60 pt-3";
    const newLabel = document.createElement("label");
    newLabel.className = "text-xs font-medium text-muted";
    newLabel.textContent = "Create new playlist";
    const newInput = document.createElement("input");
    newInput.type = "text";
    newInput.placeholder = "Playlist name";
    newInput.className = "form-input";
    newInput.maxLength = 120;
    newWrap.appendChild(newLabel);
    newWrap.appendChild(newInput);
    body.appendChild(newWrap);

    const footer = document.createElement("div");
    footer.className =
      "flex items-center justify-end gap-3 border-t border-border/60 p-4";
    const cancelBtn = makeButton("Cancel", { ghost: true });
    const saveBtn = makeButton("Save");
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    sheet.appendChild(footer);

    let settled = false;
    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
      resolve();
    };
    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup();
      }
    }

    async function onSave() {
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      saveBtn.textContent = "Saving…";

      const jobs = [];
      // Diff existing playlists: only publish those whose membership changed.
      for (const { playlist, input, wasIn } of checkboxes) {
        if (input.checked === wasIn) {
          continue;
        }
        const items = input.checked
          ? addVideoToPlaylist(playlist.items, coordinate)
          : removeVideoFromPlaylist(playlist.items, coordinate);
        jobs.push({ ...playlist, items });
      }
      // New playlist, if named.
      const newName = newInput.value.trim();
      if (newName) {
        jobs.push({
          pubkey,
          id: generatePlaylistId(),
          title: newName,
          items: [{ type: "a", value: coordinate }],
        });
      }

      if (!jobs.length) {
        cleanup();
        return;
      }

      let ok = 0;
      let failed = 0;
      for (const job of jobs) {
        try {
          await publishPlaylist({ pubkey, ...job });
          ok += 1;
        } catch (error) {
          userLogger.warn("[playlistPicker] Failed to publish playlist:", error);
          failed += 1;
        }
      }

      cleanup();
      if (ok && !failed) {
        say(
          "success",
          ok === 1 ? "Playlist updated." : `Updated ${ok} playlists.`,
        );
      } else if (ok && failed) {
        say("error", `Updated ${ok}; ${failed} could not be saved.`);
      } else {
        say("error", "Couldn't save your playlist changes.");
      }
    }

    cancelBtn.addEventListener("click", cleanup);
    backdrop.addEventListener("click", cleanup);
    saveBtn.addEventListener("click", () => {
      onSave().catch(() => cleanup());
    });
    document.addEventListener("keydown", onKeydown, true);

    document.body.appendChild(overlay);
    (playlists.length ? saveBtn : newInput).focus();
  });
}

export default openPlaylistPicker;
