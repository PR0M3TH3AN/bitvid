// js/ui/profileModal/ProfilePlaylistsController.js
//
// The profile modal's "Playlists" pane (#37) — a central place to manage your
// playlists: rename, delete (NIP-09), and expand one to reorder (↑/↓) or remove
// its videos. Mirrors MyVideosController's shape (constructor(mainController) +
// cacheDomReferences/registerEventListeners + a populate/refresh that runs when
// the pane is selected). All writes go through the playlist facade (active
// signer); edits are optimistic and re-sync on failure. Gated by FEATURE_PLAYLISTS.

import { nostrClient } from "../../nostrClientFacade.js";
import {
  fetchCreatorPlaylists,
  publishPlaylist,
  deletePlaylist,
} from "../../playlists/playlistFacade.js";
import {
  reorderPlaylistItems,
  removeVideoFromPlaylist,
} from "../../playlists/playlistService.js";
import { buildVideoAddressPointer } from "../../utils/videoPointer.js";
import { showConfirm } from "../confirmDialog.js";
import { showTextPrompt } from "../promptDialog.js";
import { FEATURE_PLAYLISTS } from "../../constants.js";
import { devLogger } from "../../utils/logger.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function iconButton(label, action, dataset, svgPath) {
  const btn = el("button", "btn-ghost btn-icon");
  btn.type = "button";
  btn.dataset.size = "sm";
  btn.setAttribute("aria-label", label);
  btn.dataset.plAction = action;
  Object.entries(dataset || {}).forEach(([k, v]) => {
    btn.dataset[k] = String(v);
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "h-4 w-4");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", svgPath);
  svg.appendChild(path);
  btn.appendChild(svg);
  return btn;
}

const ICONS = {
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  remove: "M6 6l12 12M18 6L6 18",
  rename: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  chevron: "M9 18l6-6-6-6",
};

export class ProfilePlaylistsController {
  constructor(mainController) {
    this.mainController = mainController;
    this.listEl = null;
    this.loadingEl = null;
    this.emptyEl = null;
    this.refreshBtn = null;
    this.pubkey = "";
    this.playlists = [];
    this.expanded = new Set();
    this.loading = false;
    this._onChanged = () => {
      void this.refresh();
    };
  }

  cacheDomReferences() {
    this.listEl = document.getElementById("profilePlaylistsList") || null;
    this.loadingEl = document.getElementById("profilePlaylistsLoading") || null;
    this.emptyEl = document.getElementById("profilePlaylistsEmpty") || null;
    this.refreshBtn =
      document.getElementById("profilePlaylistsRefreshBtn") || null;
  }

  registerEventListeners() {
    if (this.refreshBtn instanceof HTMLElement) {
      this.refreshBtn.addEventListener("click", () => {
        void this.refresh();
      });
    }
    if (this.listEl instanceof HTMLElement) {
      this.listEl.addEventListener("click", (event) =>
        this.handleListClick(event),
      );
    }
    if (typeof document !== "undefined") {
      document.addEventListener("bitvid:playlists-changed", this._onChanged);
    }
  }

  setLoading(value) {
    this.loading = value;
    if (this.loadingEl) {
      this.loadingEl.classList.toggle("hidden", !value);
    }
  }

  async refresh() {
    if (!FEATURE_PLAYLISTS || !this.listEl) {
      return;
    }
    const active = this.mainController.getActivePubkey?.() || "";
    this.pubkey = typeof active === "string" ? active.trim().toLowerCase() : "";
    if (!this.pubkey) {
      this.playlists = [];
      this.render();
      return;
    }

    this.setLoading(true);
    let playlists = [];
    try {
      playlists = await fetchCreatorPlaylists(this.pubkey, {
        includeEmpty: true,
      });
    } catch (error) {
      devLogger.warn("[playlists] Failed to load playlists for pane:", error);
    }
    this.playlists = playlists;

    // Fetch the referenced creators' videos so the expanded sublists can show
    // real titles/thumbnails (cache may be cold in the modal).
    const authors = new Set();
    for (const playlist of playlists) {
      for (const item of playlist.items) {
        if (item.type === "a") {
          const author = item.value.split(":")[1];
          if (author) {
            authors.add(author);
          }
        }
      }
    }
    const nostrService = this.mainController.services?.nostrService;
    if (authors.size && typeof nostrService?.fetchVideosByAuthors === "function") {
      try {
        await nostrService.fetchVideosByAuthors([...authors]);
      } catch (error) {
        // best effort — fall back to coordinate labels
      }
    }

    this.setLoading(false);
    this.render();
  }

  // coord -> { title, thumbnail } from the app's active videos.
  buildVideoMap() {
    const map = new Map();
    let active = [];
    try {
      active = nostrClient.getActiveVideos() || [];
    } catch (error) {
      active = [];
    }
    for (const video of active) {
      const coordinate = buildVideoAddressPointer(video);
      if (coordinate && !map.has(coordinate)) {
        map.set(coordinate, {
          title: typeof video.title === "string" ? video.title : "",
          thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
        });
      }
    }
    return map;
  }

  render() {
    if (!this.listEl) {
      return;
    }
    this.listEl.replaceChildren();
    if (!this.playlists.length) {
      if (this.emptyEl) {
        this.emptyEl.classList.remove("hidden");
      }
      return;
    }
    if (this.emptyEl) {
      this.emptyEl.classList.add("hidden");
    }
    const videoMap = this.buildVideoMap();
    for (const playlist of this.playlists) {
      this.listEl.appendChild(this.renderRow(playlist, videoMap));
    }
  }

  renderRow(playlist, videoMap) {
    const li = el("li", "playlist-row");

    const head = el("div", "playlist-row__head");
    head.dataset.plAction = "toggle";
    head.dataset.plId = playlist.id;

    const chevron = el("span", "playlist-row__chevron");
    if (this.expanded.has(playlist.id)) {
      chevron.dataset.open = "true";
    }
    const chevSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    chevSvg.setAttribute("viewBox", "0 0 24 24");
    chevSvg.setAttribute("fill", "none");
    chevSvg.setAttribute("stroke", "currentColor");
    chevSvg.setAttribute("stroke-width", "2");
    chevSvg.setAttribute("class", "h-4 w-4");
    chevSvg.setAttribute("aria-hidden", "true");
    const chevPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    chevPath.setAttribute("d", ICONS.chevron);
    chevSvg.appendChild(chevPath);
    chevron.appendChild(chevSvg);
    head.appendChild(chevron);

    const meta = el("div", "playlist-row__meta");
    meta.appendChild(el("p", "playlist-row__title", playlist.title));
    const n = playlist.items.length;
    meta.appendChild(
      el("p", "playlist-row__count", `${n} ${n === 1 ? "video" : "videos"}`),
    );
    head.appendChild(meta);

    const actions = el("div", "playlist-row__actions");
    actions.appendChild(
      iconButton("Rename playlist", "rename", { plId: playlist.id }, ICONS.rename),
    );
    actions.appendChild(
      iconButton("Delete playlist", "delete", { plId: playlist.id }, ICONS.trash),
    );
    head.appendChild(actions);

    li.appendChild(head);

    if (this.expanded.has(playlist.id)) {
      li.appendChild(this.renderVideoList(playlist, videoMap));
    }
    return li;
  }

  renderVideoList(playlist, videoMap) {
    const wrap = el("ul", "playlist-row__videos");
    if (!playlist.items.length) {
      wrap.appendChild(el("li", "playlist-row__empty", "This playlist is empty."));
      return wrap;
    }
    playlist.items.forEach((item, index) => {
      const row = el("li", "playlist-video");
      const info = videoMap.get(item.value);
      const dtag = item.value.split(":")[2] || item.value;
      const label = info?.title || dtag;

      const title = el("span", "playlist-video__title", label);
      row.appendChild(title);

      const controls = el("div", "playlist-video__controls");
      const up = iconButton(
        "Move up",
        "move-up",
        { plId: playlist.id, plIndex: index },
        ICONS.up,
      );
      if (index === 0) {
        up.disabled = true;
      }
      const down = iconButton(
        "Move down",
        "move-down",
        { plId: playlist.id, plIndex: index },
        ICONS.down,
      );
      if (index === playlist.items.length - 1) {
        down.disabled = true;
      }
      const remove = iconButton(
        "Remove from playlist",
        "remove",
        { plId: playlist.id, plCoord: item.value },
        ICONS.remove,
      );
      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(remove);
      row.appendChild(controls);
      wrap.appendChild(row);
    });
    return wrap;
  }

  handleListClick(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-pl-action]")
        : null;
    if (!target) {
      return;
    }
    const action = target.dataset.plAction;
    const id = target.dataset.plId;
    const playlist = this.playlists.find((p) => p.id === id);
    if (!playlist) {
      return;
    }
    if (action === "toggle") {
      this.toggleExpand(id);
    } else if (action === "rename") {
      void this.rename(playlist);
    } else if (action === "delete") {
      void this.deletePlaylistRow(playlist);
    } else if (action === "move-up") {
      void this.moveVideo(playlist, Number(target.dataset.plIndex), -1);
    } else if (action === "move-down") {
      void this.moveVideo(playlist, Number(target.dataset.plIndex), 1);
    } else if (action === "remove") {
      void this.removeVideo(playlist, target.dataset.plCoord);
    }
  }

  toggleExpand(id) {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      this.expanded.add(id);
    }
    this.render();
  }

  async rename(playlist) {
    const name = await showTextPrompt("Give this playlist a new name.", {
      title: "Rename playlist",
      value: playlist.title,
      confirmLabel: "Save",
      placeholder: "Playlist name",
    });
    if (!name || name === playlist.title) {
      return;
    }
    await this.publishUpdate({ ...playlist, title: name }, "Playlist renamed.");
  }

  async deletePlaylistRow(playlist) {
    const ok = await showConfirm(
      `Delete “${playlist.title}”? This removes the playlist for everyone. It can’t be undone.`,
      { title: "Delete playlist", confirmLabel: "Delete", danger: true },
    );
    if (!ok) {
      return;
    }
    this.playlists = this.playlists.filter((p) => p.id !== playlist.id);
    this.expanded.delete(playlist.id);
    this.render();
    try {
      await deletePlaylist(playlist);
      this.mainController.showSuccess?.("Playlist deleted.");
      this.emitChanged();
    } catch (error) {
      devLogger.warn("[playlists] Delete failed:", error);
      this.mainController.showError?.("Couldn’t delete the playlist.");
      void this.refresh();
    }
  }

  async moveVideo(playlist, index, direction) {
    if (!Number.isInteger(index)) {
      return;
    }
    const items = reorderPlaylistItems(playlist.items, index, index + direction);
    await this.publishUpdate({ ...playlist, items }, null);
  }

  async removeVideo(playlist, coordinate) {
    const items = removeVideoFromPlaylist(playlist.items, coordinate);
    await this.publishUpdate({ ...playlist, items }, "Removed from playlist.");
  }

  async publishUpdate(updated, successMessage) {
    const index = this.playlists.findIndex((p) => p.id === updated.id);
    if (index >= 0) {
      this.playlists[index] = { ...this.playlists[index], ...updated };
    }
    this.render();
    try {
      await publishPlaylist({ pubkey: this.pubkey, ...updated });
      if (successMessage) {
        this.mainController.showSuccess?.(successMessage);
      }
      this.emitChanged();
    } catch (error) {
      devLogger.warn("[playlists] Update failed:", error);
      this.mainController.showError?.("Couldn’t save the change.");
      void this.refresh();
    }
  }

  emitChanged() {
    try {
      document.dispatchEvent(
        new CustomEvent("bitvid:playlists-changed", {
          detail: { pubkey: this.pubkey },
        }),
      );
    } catch (error) {
      // best effort
    }
  }
}

export default ProfilePlaylistsController;
