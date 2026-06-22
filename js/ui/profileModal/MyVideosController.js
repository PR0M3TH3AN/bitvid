import { devLogger } from "../../utils/logger.js";
import { nostrClient } from "../../nostrClientFacade.js";
import { getApplication } from "../../applicationContext.js";
import { collapseUserVideos } from "./myVideosData.js";
import { classifyVideoHealth, isUrlUnderBase } from "./myVideosHealth.js";
import { reconcileStorage } from "./myVideosReconcile.js";
import { FEATURE_NIP71_MIRROR } from "../../constants.js";
import { nip71MirrorService } from "../../services/nip71MirrorService.js";
import {
  isMirrorEnabled,
  setMirrorEnabled,
  resolveMirrorToggle,
} from "../../services/nip71MirrorFlags.js";

const MIRROR_REASON_TEXT = {
  private: "Private videos can't be shared to other apps.",
  "nsfw-blocked": "NSFW videos aren't shared from this instance.",
  "no-url": "Needs a hosted (HTTPS) URL to appear on other apps.",
  invalid: "This video can't be mirrored.",
};

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
    this.orphansSection = null;
    this.orphanListEl = null;
    this.loading = false;
    this.publicBaseUrl = "";
    this.pubkey = "";
  }

  cacheDomReferences() {
    this.listEl = document.getElementById("profileMyVideosList") || null;
    this.summaryEl = document.getElementById("profileMyVideosSummary") || null;
    this.loadingEl = document.getElementById("profileMyVideosLoading") || null;
    this.emptyEl = document.getElementById("profileMyVideosEmpty") || null;
    this.refreshBtn = document.getElementById("profileMyVideosRefreshBtn") || null;
    this.orphansSection =
      document.getElementById("profileMyVideosOrphans") || null;
    this.orphanListEl =
      document.getElementById("profileMyVideosOrphanList") || null;
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
    this.pubkey = pubkey;
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
      // Bucket reconciliation runs after the note-side list is shown so the UI is
      // responsive; it then layers missing-file pills + the orphan section on top.
      void this.runReconciliation(rows, pubkey);
    } finally {
      this.loading = false;
      this.setLoading(false);
    }
  }

  async runReconciliation(rows, pubkey) {
    const r2Service = this.mainController.services?.r2Service;
    if (!r2Service || typeof r2Service.listVideoStorageObjects !== "function") {
      this.renderOrphans([]);
      return;
    }
    let listing;
    try {
      listing = await r2Service.listVideoStorageObjects({ pubkey });
    } catch (err) {
      devLogger.warn("[myVideos] listVideoStorageObjects failed:", err);
      this.renderOrphans([]);
      return;
    }
    if (!listing || !listing.ok) {
      // Locked storage etc. — nothing to reconcile against; leave note-side
      // health as-is and hide the orphan section.
      this.renderOrphans([]);
      return;
    }
    const { missing, orphanKeys } = reconcileStorage({
      videos: rows,
      bucketKeys: listing.keys,
      publicBaseUrl: this.publicBaseUrl,
    });
    for (const entry of missing) {
      this.markRowMissing(entry.video);
    }
    this.renderOrphans(orphanKeys);
  }

  markRowMissing(video) {
    if (!(this.listEl instanceof HTMLElement) || !video?.id) {
      return;
    }
    const li = this.listEl.querySelector(
      `li[data-video-id="${CSS.escape(video.id)}"]`,
    );
    const pill = li?.querySelector('[data-role="health-pill"]');
    if (li instanceof HTMLElement) {
      li.dataset.health = "missing-file";
    }
    if (pill instanceof HTMLElement) {
      pill.className = `${PILL_BASE} ${PILL_BY_SEVERITY.warning}`;
      pill.textContent = "Missing file";
    }
  }

  renderOrphans(keys) {
    const list = Array.isArray(keys) ? keys : [];
    if (this.orphansSection instanceof HTMLElement) {
      this.orphansSection.classList.toggle("hidden", list.length === 0);
    }
    if (!(this.orphanListEl instanceof HTMLElement)) {
      return;
    }
    this.orphanListEl.replaceChildren();
    for (const key of list) {
      this.orphanListEl.appendChild(this.buildOrphanRow(key));
    }
  }

  buildOrphanRow(key) {
    const li = document.createElement("li");
    li.className =
      "card flex items-center justify-between gap-3 p-3 border border-border/60";

    const label = document.createElement("span");
    label.className = "truncate text-2xs text-muted font-mono";
    label.textContent = key;
    label.title = key;

    const del = this.buildActionButton("Delete file", () => {
      void this.handleDeleteOrphan(key);
    }, true);

    li.appendChild(label);
    li.appendChild(del);
    return li;
  }

  async handleDeleteOrphan(key) {
    const r2Service = this.mainController.services?.r2Service;
    if (!r2Service || typeof r2Service.deleteStorageKeys !== "function") {
      return;
    }
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (!window.confirm(`Permanently delete this file from your bucket?\n\n${key}`)) {
        return;
      }
    }
    let result;
    try {
      result = await r2Service.deleteStorageKeys({ keys: [key], pubkey: this.pubkey });
    } catch (err) {
      devLogger.warn("[myVideos] deleteStorageKeys failed:", err);
      this.mainController.showError?.("Failed to delete the file. Please try again.");
      return;
    }
    if (result?.ok && result.deleted?.length) {
      this.mainController.showSuccess?.("Removed the orphaned file from your bucket.");
      void this.populate({ forceFetch: false });
    } else if (result?.reason === "storage-locked") {
      this.mainController.showError?.("Unlock storage first, then delete the file.");
    } else {
      this.mainController.showError?.("Failed to delete the file. Please try again.");
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
    if (typeof video.id === "string" && video.id) {
      li.dataset.videoId = video.id;
    }

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
    pill.dataset.role = "health-pill";

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
      const mirrorBtn = this.buildMirrorButton(video);
      if (mirrorBtn) {
        actions.appendChild(mirrorBtn);
      }
      actions.appendChild(
        this.buildActionButton("Delete", () => this.handleDelete(video), true),
      );
    }
    return actions;
  }

  // Opt-in "publish to other Nostr video apps (NIP-71)" toggle. Reflects the
  // per-video opt-in flag; disabled (with a reason) for ineligible videos.
  buildMirrorButton(video) {
    if (!FEATURE_NIP71_MIRROR) {
      return null;
    }
    const enabled = isMirrorEnabled(this.pubkey, video?.videoRootId);
    const eligibility = nip71MirrorService.canMirror(video);
    if (!enabled && eligibility.ok !== true) {
      const reason = MIRROR_REASON_TEXT[eligibility.reason] || "Can't be shared.";
      const btn = this.buildActionButton("Share off", () => {
        this.mainController.showStatus?.(reason);
      });
      btn.disabled = true;
      btn.title = reason;
      btn.classList.add("opacity-50");
      return btn;
    }
    return this.buildActionButton(
      enabled ? "Shared ✓" : "Share to apps",
      (event) => this.handleToggleMirror(video, event?.currentTarget || null),
    );
  }

  async handleToggleMirror(video, btn) {
    const enabled = isMirrorEnabled(this.pubkey, video?.videoRootId);
    const eligibility = nip71MirrorService.canMirror(video);
    const decision = resolveMirrorToggle({ enabled, eligibility });

    if (decision.action === "blocked") {
      this.mainController.showError?.(
        MIRROR_REASON_TEXT[decision.reason] || "This video can't be shared.",
      );
      return;
    }
    if (btn) {
      btn.disabled = true;
    }
    try {
      if (decision.action === "publish") {
        const result = await nip71MirrorService.publish(video);
        if (result?.ok) {
          setMirrorEnabled(this.pubkey, video.videoRootId, true);
          this.mainController.showSuccess?.(
            `Shared to other Nostr apps (${result.accepted}/${result.total} relays).`,
          );
        } else {
          this.mainController.showError?.(
            "Couldn't share this video. Please try again.",
          );
        }
      } else {
        const result = await nip71MirrorService.remove(video);
        setMirrorEnabled(this.pubkey, video.videoRootId, false);
        this.mainController.showSuccess?.(
          result?.ok ? "Removed from other Nostr apps." : "Stopped sharing locally.",
        );
      }
    } catch (error) {
      devLogger.warn("[myVideos] mirror toggle failed:", error);
      this.mainController.showError?.("Sharing action failed. Please try again.");
    } finally {
      void this.populate({ forceFetch: true });
    }
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
