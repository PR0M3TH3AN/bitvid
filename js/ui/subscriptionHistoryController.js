import { subscriptions } from "../subscriptions.js";
import { profileCache } from "../state/profileCache.js";
import { formatTimeAgo } from "../utils/formatters.js";
import { userLogger } from "../utils/logger.js";
import { getApplication } from "../applicationContext.js";

export class SubscriptionHistoryController {
  constructor(options = {}) {
    this.modal = null;
    this.activePubkey = null;
    this.selectedEvent = null;
    this.historyEvents = [];
    this.initialized = false;
    this.callbacks = {
      onClose: options.onClose || (() => {}),
    };
  }

  async load() {
    if (this.initialized) return;

    try {
      const response = await fetch("components/subscription-history-modal.html");
      if (!response.ok) throw new Error("HTML not found");
      const html = await response.text();
      const template = document.createElement("template");
      template.innerHTML = html;

      // Append to body if not already present (avoid duplicates)
      if (!document.getElementById("subscriptionHistoryModal")) {
        document.body.appendChild(template.content);
      }

      this.modal = document.getElementById("subscriptionHistoryModal");
      this.bindElements();
      this.initialized = true;
    } catch (error) {
      userLogger.error("Failed to load subscription history modal:", error);
    }
  }

  bindElements() {
    if (!this.modal) return;

    this.listContainer = this.modal.querySelector("#subscriptionHistoryList");
    this.detailsContainer = this.modal.querySelector(
      "#subscriptionHistoryDetailsContent"
    );
    this.detailsEmpty = this.modal.querySelector(
      "#subscriptionHistoryDetailsEmpty"
    );
    this.loadingIndicator = this.modal.querySelector(
      "#subscriptionHistoryLoading"
    );
    this.emptyIndicator = this.modal.querySelector("#subscriptionHistoryEmpty");
    this.decryptingIndicator = this.modal.querySelector(
      "#subscriptionHistoryDecrypting"
    );
    this.selectedChannelsList = this.modal.querySelector(
      "#subscriptionHistorySelectedChannels"
    );
    this.selectedDate = this.modal.querySelector(
      "#subscriptionHistorySelectedDate"
    );
    this.selectedMeta = this.modal.querySelector(
      "#subscriptionHistorySelectedMeta"
    );
    this.selectedBadge = this.modal.querySelector(
      "#subscriptionHistorySelectedBadge"
    );

    this.closeBtn = this.modal.querySelector("#closeSubscriptionHistoryModal");
    this.restoreBtn = this.modal.querySelector("#subscriptionHistoryRestoreBtn");
    this.rebroadcastBtn = this.modal.querySelector(
      "#subscriptionHistoryRebroadcastBtn"
    );

    this.closeBtn?.addEventListener("click", () => this.hide());
    this.restoreBtn?.addEventListener("click", () => this.handleRestore());
    this.rebroadcastBtn?.addEventListener("click", () =>
      this.handleRebroadcast()
    );

    this.modal
      .querySelector(".bv-modal-backdrop")
      ?.addEventListener("click", () => this.hide());
  }

  async show(pubkey) {
    if (!this.initialized) await this.load();
    if (!this.modal) return;

    this.activePubkey = pubkey;
    this.modal.classList.remove("hidden");
    this.modal.setAttribute("aria-hidden", "false");
    // Ensure modal-open class is added to body for scroll locking if design system requires it
    document.body.classList.add("modal-open");

    this.fetchHistory();
  }

  hide() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.setAttribute("aria-hidden", "true");
    // Only remove if no other modals are open, ideally.
    // But for simplicity:
    document.body.classList.remove("modal-open");

    this.selectedEvent = null;
    // Reset view
    this.detailsEmpty.classList.remove("hidden");
    this.detailsContainer.classList.add("hidden");
    this.callbacks.onClose();
  }

  async fetchHistory() {
    if (!this.loadingIndicator) return;
    this.loadingIndicator.classList.remove("hidden");
    this.listContainer.innerHTML = "";
    this.emptyIndicator.classList.add("hidden");

    try {
      this.historyEvents = await subscriptions.fetchHistory(this.activePubkey);
      this.renderList();
    } catch (error) {
      userLogger.error("Failed to fetch subscription history:", error);
      this.emptyIndicator.textContent = "Failed to load history.";
      this.emptyIndicator.classList.remove("hidden");
    } finally {
      this.loadingIndicator.classList.add("hidden");
    }
  }

  renderList() {
    this.listContainer.innerHTML = "";
    if (!this.historyEvents.length) {
      this.emptyIndicator.classList.remove("hidden");
      return;
    }

    this.historyEvents.forEach((event) => {
      const item = document.createElement("li");
      item.className =
        "card p-3 cursor-pointer hover:bg-surface-2 transition-colors border-l-4 border-transparent rounded-r-md";

      const dTag = event.tags.find((t) => t[0] === "d")?.[1];
      const isBackup = dTag && dTag.startsWith("subscriptions-backup-");

      const date = new Date(event.created_at * 1000);
      const dateStr = date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const timeAgo = formatTimeAgo(event.created_at);

      item.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-sm font-medium text-text">${
                      isBackup ? "Backup" : "Standard List"
                    }</p>
                    <p class="text-xs text-muted">${dateStr}</p>
                </div>
                <span class="text-xs text-muted whitespace-nowrap ml-2">${timeAgo}</span>
            </div>
          `;

      item.addEventListener("click", () => {
        this.listContainer.querySelectorAll("li").forEach((li) => {
          li.classList.remove("bg-surface-2", "border-accent");
          li.classList.add("border-transparent");
        });
        item.classList.add("bg-surface-2", "border-accent");
        item.classList.remove("border-transparent");
        this.selectEvent(event);
      });

      this.listContainer.appendChild(item);
    });
  }

  async selectEvent(event) {
    this.selectedEvent = event;
    this.detailsEmpty.classList.add("hidden");
    this.detailsContainer.classList.remove("hidden");
    this.selectedChannelsList.innerHTML = "";
    this.decryptingIndicator.classList.remove("hidden");

    const date = new Date(event.created_at * 1000);
    this.selectedDate.textContent = date.toLocaleString(undefined, {
      dateStyle: "full",
      timeStyle: "short",
    });

    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    const isBackup = dTag?.startsWith("subscriptions-backup-");

    this.selectedBadge.textContent = isBackup ? "Backup" : "Active / Standard";
    this.selectedBadge.dataset.variant = isBackup ? "accent" : "surface";

    try {
      const decryptResult = await subscriptions.decryptSubscriptionEvent(
        event,
        this.activePubkey
      );
      if (!decryptResult.ok) {
        throw new Error("Decryption failed");
      }

      let pubkeys = [];
      try {
        const parsed = JSON.parse(decryptResult.plaintext);
        if (Array.isArray(parsed)) {
          // [['p', hex], ...]
          pubkeys = parsed
            .filter((t) => Array.isArray(t) && t[0] === "p")
            .map((t) => t[1]);
        }
      } catch (e) {
        userLogger.warn("Failed to parse plaintext JSON", e);
      }

      this.selectedMeta.textContent = `${pubkeys.length} channels`;
      this.renderChannels(pubkeys);
    } catch (error) {
      userLogger.error("Failed to decrypt event:", error);
      this.selectedChannelsList.innerHTML = `<p class="text-critical text-sm text-center w-full mt-4">Decryption failed or content is invalid.</p>`;
      this.selectedMeta.textContent = "Unknown content";
    } finally {
      this.decryptingIndicator.classList.add("hidden");
    }
  }

  async renderChannels(pubkeys) {
    this.selectedChannelsList.innerHTML = "";

    const app = getApplication();
    if (app && typeof app.batchFetchProfiles === "function") {
      try {
        await app.batchFetchProfiles(pubkeys);
      } catch (e) {
        userLogger.warn("Failed to batch fetch profiles", e);
      }
    }

    pubkeys.forEach((pubkey) => {
      const profile = profileCache.getProfile(pubkey);
      const name = profile?.name || profile?.display_name || pubkey.slice(0, 8);
      const avatar = profile?.picture || "assets/svg/default-profile.svg";

      const item = document.createElement("li");
      item.className =
        "flex items-center gap-3 p-2 rounded-md hover:bg-surface-2 border border-transparent hover:border-border/50 transition-colors";

      const img = document.createElement("img");
      img.src = avatar;
      img.loading = "lazy";
      img.decoding = "async";
      img.className = "w-8 h-8 rounded-full object-cover bg-surface-2";
      img.onerror = function () {
        this.src = "assets/svg/default-profile.svg";
      };

      const div = document.createElement("div");
      div.className = "overflow-hidden";

      const pName = document.createElement("p");
      pName.className = "text-sm font-medium truncate text-text";
      pName.textContent = name;

      const pKey = document.createElement("p");
      pKey.className = "text-xs text-muted truncate font-mono";
      pKey.textContent = `${pubkey.slice(0, 10)}...`;

      div.appendChild(pName);
      div.appendChild(pKey);

      item.appendChild(img);
      item.appendChild(div);

      this.selectedChannelsList.appendChild(item);
    });
  }

  async handleRestore() {
    if (!this.selectedEvent) return;
    if (
      !confirm(
        "Are you sure you want to restore this list? It will overwrite your current subscriptions."
      )
    )
      return;

    this.restoreBtn.disabled = true;
    this.restoreBtn.textContent = "Restoring...";

    try {
      await subscriptions.restoreBackup(this.selectedEvent, this.activePubkey);
      // alert("Subscriptions restored successfully!"); // alert blocks, toast is better if available, but alert is fine for now
      this.hide();
    } catch (error) {
      userLogger.error("Restore failed:", error);
      alert("Failed to restore: " + error.message);
    } finally {
      this.restoreBtn.disabled = false;
      this.restoreBtn.textContent = "Restore as Active";
    }
  }

  async handleRebroadcast() {
    if (!this.selectedEvent) return;
    this.rebroadcastBtn.disabled = true;
    this.rebroadcastBtn.textContent = "Broadcasting...";

    try {
      await subscriptions.rebroadcastBackup(
        this.selectedEvent,
        this.activePubkey
      );
      // Refresh to show potentially new event
      this.fetchHistory();
    } catch (error) {
      userLogger.error("Rebroadcast failed:", error);
      alert("Failed to rebroadcast: " + error.message);
    } finally {
      this.rebroadcastBtn.disabled = false;
      this.rebroadcastBtn.textContent = "Rebroadcast";
    }
  }

  async handleCreateBackup(pubkey) {
    if (!pubkey) return;

    try {
      await subscriptions.createBackup(pubkey);
      // If modal is open, refresh
      if (
        this.modal &&
        !this.modal.classList.contains("hidden") &&
        this.activePubkey === pubkey
      ) {
        this.fetchHistory();
      } else {
          // Show success feedback
          // Using a simple alert or console log if UI controller doesn't pass a toast function
          // userLogger.info("Backup created");
      }
    } catch (error) {
      userLogger.error("Backup failed:", error);
      alert("Backup failed: " + error.message);
    }
  }
}
