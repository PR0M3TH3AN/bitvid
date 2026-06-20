import { devLogger } from "../../utils/logger.js";
import { nostrClient } from "../../nostrClientFacade.js";
import { getApplication } from "../../applicationContext.js";
import { collapseUserVideos } from "./myVideosData.js";
import { classifyVideoHealth, isUrlUnderBase } from "./myVideosHealth.js";

// Maps a health severity to a status-pill style, mirroring
// ProfileRelayController.applyStatusPill so the look stays consistent.
const PILL_BASE =
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold whitespace-nowrap";
const PILL_BY_SEVERITY = {
  error: "bg-status-danger/15 text-status-danger",
  warning: "bg-status-warning/15 text-status-warning",
  info: "bg-surface-strong/40 text-muted",
  ok: "bg-status-success/15 text-status-success",
};

/**
 * "My Videos" management pane: lists the logged-in user's published videos (all
 * versions collapsed to their current state, including tombstoned ones) with a
 * health pill so issues like missing sources or orphaned storage are obvious.
 *
 * Phase 1 (this controller): note-side health + display. Later steps add the
 * hosted-URL HEAD probe, per-row actions, and bucket reconciliation.
 */
export class MyVideosController {
  constructor(mainController) {
    this.mainController = mainController;
    this.listEl = null;
    this.summaryEl = null;
    this.loadingEl = null;
    this.emptyEl = null;
    this.refreshBtn = null;
    this.loading = false;
    this.publicBaseUrl = "";
  }

  cacheDomReferences() {
    this.listEl = document.getElementById("profileMyVideosList") || null;
    this.summaryEl = document.getElementById("profileMyVideosSummary") || null;
    this.loadingEl = document.getElementById("profileMyVideosLoading") || null;
    this.emptyEl = document.getElementById("profileMyVideosEmpty") || null;
    this.refreshBtn = document.getElementById("profileMyVideosRefreshBtn") || null;
  }

  registerEventListeners() {
    if (this.refreshBtn instanceof HTMLElement) {
      this.refreshBtn.addEventListener("click", () => {
        void this.populate({ forceFetch: true });
      });
    }
  }

  getPubkey() {
    return this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey(),
    );
  }

  async resolvePublicBaseUrl(pubkey) {
    const r2Service = this.mainController.services?.r2Service;
    if (!r2Service || typeof r2Service.resolveConnection !== "function") {
      return "";
    }
    try {
      const npub = this.mainController.safeEncodeNpub?.(pubkey) || "";
      if (!npub) {
        return "";
      }
      const settings = await r2Service.resolveConnection(npub);
      return (settings?.publicBaseUrl || settings?.baseDomain || "").trim();
    } catch (err) {
      devLogger.warn("[myVideos] Failed to resolve storage base URL:", err);
      return "";
    }
  }

  setLoading(on) {
    if (this.loadingEl instanceof HTMLElement) {
      this.loadingEl.classList.toggle("hidden", !on);
    }
    if (this.refreshBtn instanceof HTMLElement) {
      this.refreshBtn.disabled = !!on;
    }
  }

  async populate({ forceFetch = false } = {}) {
    if (this.loading) {
      return;
    }
    if (!(this.listEl instanceof HTMLElement)) {
      return;
    }
    const pubkey = this.getPubkey();
    if (!pubkey) {
      this.renderRows([]);
      this.setSummary("");
      return;
    }

    this.loading = true;
    this.setLoading(true);
    try {
      this.publicBaseUrl = await this.resolvePublicBaseUrl(pubkey);

      const nostrService = this.mainController.services?.nostrService;
      if (forceFetch && nostrService?.fetchVideosByAuthors) {
        try {
          await nostrService.fetchVideosByAuthors([pubkey]);
        } catch (err) {
          devLogger.warn("[myVideos] fetchVideosByAuthors failed:", err);
        }
      }

      const all =
        nostrClient && nostrClient.allEvents
          ? Array.from(nostrClient.allEvents.values())
          : [];
      const rows = collapseUserVideos(all, pubkey);
      this.renderRows(rows);
      this.setSummary(this.buildSummary(rows));
    } finally {
      this.loading = false;
      this.setLoading(false);
    }
  }

  buildSummary(rows) {
    if (!rows.length) {
      return "";
    }
    const counts = { issues: 0, deleted: 0 };
    for (const video of rows) {
      const health = classifyVideoHealth(video, {
        publicBaseUrl: this.publicBaseUrl,
      });
      if (health.severity === "error" || health.severity === "warning") {
        counts.issues += 1;
      }
      if (health.status === "deleted") {
        counts.deleted += 1;
      }
    }
    const parts = [`${rows.length} video${rows.length === 1 ? "" : "s"}`];
    if (counts.issues) {
      parts.push(`${counts.issues} need${counts.issues === 1 ? "s" : ""} attention`);
    }
    if (counts.deleted) {
      parts.push(`${counts.deleted} deleted`);
    }
    return parts.join(" · ");
  }

  setSummary(text) {
    if (this.summaryEl instanceof HTMLElement) {
      this.summaryEl.textContent = text || "";
    }
  }

  renderRows(rows) {
    if (!(this.listEl instanceof HTMLElement)) {
      return;
    }
    this.listEl.replaceChildren();
    const hasRows = Array.isArray(rows) && rows.length > 0;
    if (this.emptyEl instanceof HTMLElement) {
      this.emptyEl.classList.toggle("hidden", hasRows);
    }
    if (!hasRows) {
      return;
    }
    for (const video of rows) {
      this.listEl.appendChild(this.buildRow(video));
    }
  }

  buildRow(video) {
    const health = classifyVideoHealth(video, {
      publicBaseUrl: this.publicBaseUrl,
    });

    const li = document.createElement("li");
    li.className = "card flex items-center gap-3 p-3 border border-border/60";
    li.dataset.health = health.status;

    li.appendChild(this.buildThumb(video));

    const info = document.createElement("div");
    info.className = "min-w-0 flex-1";

    const titleRow = document.createElement("div");
    titleRow.className = "flex items-center gap-2 min-w-0";

    const title = document.createElement("span");
    title.className = "truncate font-medium text-text";
    title.textContent =
      (typeof video.title === "string" && video.title.trim()) || "Untitled video";

    const pill = document.createElement("span");
    pill.className = `${PILL_BASE} ${PILL_BY_SEVERITY[health.severity] || PILL_BY_SEVERITY.info}`;
    pill.textContent = health.label;

    titleRow.appendChild(title);
    titleRow.appendChild(pill);

    const meta = document.createElement("p");
    meta.className = "mt-1 text-2xs text-muted";
    meta.textContent = this.describeSource(video);

    info.appendChild(titleRow);
    info.appendChild(meta);
    li.appendChild(info);

    li.appendChild(this.buildActions(video));
    return li;
  }

  buildThumb(video) {
    const wrap = document.createElement("div");
    wrap.className =
      "h-12 w-20 shrink-0 overflow-hidden rounded bg-surface-strong/40";
    const url = typeof video.thumbnail === "string" ? video.thumbnail.trim() : "";
    if (url) {
      const img = document.createElement("img");
      img.className = "h-full w-full object-cover";
      img.loading = "lazy";
      img.alt = "";
      img.src = url;
      // A broken/missing thumbnail leaves the placeholder box rather than the
      // browser's broken-image glyph.
      img.addEventListener("error", () => img.remove());
      wrap.appendChild(img);
    }
    return wrap;
  }

  buildActions(video) {
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2 shrink-0";
    // Active videos can be edited or deleted. Cleaning up a DELETED video's
    // orphaned file needs the bucket listing (the tombstone scrubbed its URL),
    // so that action arrives in Phase 2 (storage reconciliation).
    if (!video.deleted) {
      actions.appendChild(
        this.buildActionButton("Edit", () => this.handleEdit(video)),
      );
      actions.appendChild(
        this.buildActionButton("Delete", () => this.handleDelete(video), true),
      );
    }
    return actions;
  }

  buildActionButton(label, onClick, danger = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = danger
      ? "btn-ghost focus-ring text-xs text-status-danger"
      : "btn-ghost focus-ring text-xs";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  handleEdit(video) {
    const app = getApplication();
    // The edit modal is a separate top-level surface; close the (full-screen)
    // profile modal first so it isn't hidden behind it.
    this.mainController.hide();
    if (app && typeof app.handleEditVideo === "function") {
      void app.handleEditVideo({ video });
    }
  }

  handleDelete(video) {
    const app = getApplication();
    this.mainController.hide();
    if (app && typeof app.handleFullDeleteVideo === "function") {
      void app.handleFullDeleteVideo({ video });
    }
  }

  describeSource(video) {
    const parts = [];
    if (typeof video.url === "string" && video.url.trim()) {
      parts.push(
        isUrlUnderBase(video.url, this.publicBaseUrl) ? "Hosted URL" : "External URL",
      );
    }
    if (typeof video.magnet === "string" && video.magnet.trim()) {
      parts.push("Torrent");
    }
    if (!parts.length) {
      parts.push("No source");
    }
    const created = Number(video.created_at);
    if (Number.isFinite(created) && created > 0) {
      parts.push(new Date(created * 1000).toLocaleDateString());
    }
    return parts.join(" · ");
  }
}
