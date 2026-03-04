import { userLogger } from "../../utils/logger.js";
import { sanitizeRelayList } from "../../nostr/nip46Client.js";

export class DMSettingsModalController {
  constructor() {
    this.modal = null;
    this.initialized = false;
    this.callbacks = {};
    this.state = {
      privacySettings: {},
      relayHints: [],
    };
  }

  async load() {
    if (this.initialized) return;

    try {
      // Check if already in DOM (e.g. from server-side render or previous load)
      if (document.getElementById("dmSettingsModal")) {
        this.modal = document.getElementById("dmSettingsModal");
        this.bindElements();
        this.initialized = true;
        return;
      }

      const response = await fetch("components/dm-settings-modal.html");
      if (!response.ok) throw new Error("HTML not found");
      const html = await response.text();
      const template = document.createElement("template");
      template.innerHTML = html;

      document.body.appendChild(template.content);

      this.modal = document.getElementById("dmSettingsModal");
      this.bindElements();
      this.initialized = true;
    } catch (error) {
      userLogger.error("Failed to load DM settings modal:", error);
    }
  }

  bindElements() {
    if (!this.modal) return;

    this.closeButton = this.modal.querySelector("#closeDmSettingsModal");
    this.backdrop = this.modal.querySelector(".bv-modal-backdrop");

    // Privacy
    this.readReceiptsToggle = this.modal.querySelector("#dmSettingsReadReceipts");
    this.typingIndicatorsToggle = this.modal.querySelector("#dmSettingsTypingIndicators");

    // Relays
    this.relayInput = this.modal.querySelector("#dmSettingsRelayInput");
    this.relayAddBtn = this.modal.querySelector("#dmSettingsRelayAddBtn");
    this.relayList = this.modal.querySelector("#dmSettingsRelayList");
    this.relayEmpty = this.modal.querySelector("#dmSettingsRelayEmpty");
    this.relayPublishBtn = this.modal.querySelector("#dmSettingsRelayPublishBtn");
    this.relayStatus = this.modal.querySelector("#dmSettingsRelayStatus");

    // Events
    this.closeButton?.addEventListener("click", () => this.hide());
    this.backdrop?.addEventListener("click", () => this.hide());

    this.readReceiptsToggle?.addEventListener("change", (e) => {
      this.handlePrivacyChange("readReceiptsEnabled", e.target.checked);
    });

    this.typingIndicatorsToggle?.addEventListener("change", (e) => {
      this.handlePrivacyChange("typingIndicatorsEnabled", e.target.checked);
    });

    this.relayAddBtn?.addEventListener("click", () => this.handleAddRelay());
    this.relayInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleAddRelay();
      }
    });

    this.relayPublishBtn?.addEventListener("click", () => this.handlePublish());
  }

  /**
   * @param {Object} options
   * @param {Object} options.privacySettings { readReceiptsEnabled, typingIndicatorsEnabled }
   * @param {Array} options.relayHints Array of relay URLs
   * @param {Function} options.onPrivacyChange (key, value) => void
   * @param {Function} options.onAddRelay (url) => void
   * @param {Function} options.onRemoveRelay (url) => void
   * @param {Function} options.onPublishRelays (urls) => Promise<result>
   */
  async show(options = {}) {
    if (!this.initialized) await this.load();
    if (!this.modal) return;

    this.callbacks = {
      onPrivacyChange: options.onPrivacyChange || (() => {}),
      onAddRelay: options.onAddRelay || (() => {}),
      onRemoveRelay: options.onRemoveRelay || (() => {}),
      onPublishRelays: options.onPublishRelays || (async () => {}),
    };

    this.state.privacySettings = options.privacySettings || {};
    this.state.relayHints = Array.isArray(options.relayHints) ? [...options.relayHints] : [];

    this.refreshUI();

    this.modal.classList.remove("hidden");
    this.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  hide() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this.modal.setAttribute("aria-hidden", "true");
    // Check if other modals are open before removing body class
    // For now simple removal is likely fine or we can rely on ProfileModal logic handling global state
    // But since this opens *on top* of profile modal usually, we might want to be careful.
    // If Profile Modal is open, body should stay modal-open.
    // We can just check if profileModal is not hidden?
    // Or just leave it if we assume profile modal is behind.
    // However, for correctness:
    const profileModal = document.getElementById("profileModal");
    if (!profileModal || profileModal.classList.contains("hidden")) {
        document.body.classList.remove("modal-open");
    }
  }

  refreshUI() {
    if (!this.initialized) return;

    // Privacy
    if (this.readReceiptsToggle) {
      this.readReceiptsToggle.checked = !!this.state.privacySettings.readReceiptsEnabled;
    }
    if (this.typingIndicatorsToggle) {
      this.typingIndicatorsToggle.checked = !!this.state.privacySettings.typingIndicatorsEnabled;
    }

    // Relays
    this.renderRelayList();
    if (this.relayStatus) this.relayStatus.textContent = "";
  }

  renderRelayList() {
    if (!this.relayList || !this.relayEmpty) return;

    this.relayList.innerHTML = "";
    const relays = this.state.relayHints;

    if (relays.length === 0) {
      this.relayList.classList.add("hidden");
      this.relayEmpty.classList.remove("hidden");
    } else {
      this.relayList.classList.remove("hidden");
      this.relayEmpty.classList.add("hidden");

      relays.forEach(url => {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between gap-3 p-3 bg-surface-2 rounded-md border border-border/50";

        const span = document.createElement("span");
        span.className = "text-sm text-text break-all font-mono";
        span.textContent = url;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn-ghost btn-icon p-1 text-muted hover:text-critical focus-ring";
        removeBtn.ariaLabel = `Remove ${url}`;
        removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

        removeBtn.addEventListener("click", () => this.handleRemoveRelay(url));

        li.appendChild(span);
        li.appendChild(removeBtn);
        this.relayList.appendChild(li);
      });
    }
  }

  handlePrivacyChange(key, value) {
    this.state.privacySettings[key] = value;
    this.callbacks.onPrivacyChange(key, value);
  }

  handleAddRelay() {
    const rawValue = this.relayInput?.value?.trim() || "";
    if (!rawValue) return;

    const sanitized = sanitizeRelayList([rawValue]);
    const url = sanitized[0];

    if (!url) {
        this.setRelayStatus("Invalid WSS URL.", "error");
        return;
    }

    if (this.state.relayHints.includes(url)) {
        this.setRelayStatus("Relay already added.", "error");
        this.relayInput.value = "";
        return;
    }

    this.state.relayHints.push(url);
    this.renderRelayList();
    this.relayInput.value = "";
    this.setRelayStatus("Relay added (unsaved). Publish to save.", "info");

    this.callbacks.onAddRelay(url);
  }

  handleRemoveRelay(url) {
    this.state.relayHints = this.state.relayHints.filter(r => r !== url);
    this.renderRelayList();
    this.setRelayStatus("Relay removed (unsaved).", "info");

    this.callbacks.onRemoveRelay(url);
  }

  async handlePublish() {
    if (this.state.relayHints.length === 0) {
        this.setRelayStatus("Add at least one relay before publishing.", "error");
        return;
    }

    this.setRelayStatus("Publishing...", "info");
    this.relayPublishBtn.disabled = true;

    try {
        const result = await this.callbacks.onPublishRelays(this.state.relayHints);
        if (result && result.ok) {
             const acceptedCount = Array.isArray(result.accepted) ? result.accepted.length : 0;
             this.setRelayStatus(`Published to ${acceptedCount} relay(s).`, "success");
        } else {
             this.setRelayStatus("Failed to publish.", "error");
        }
    } catch (error) {
        this.setRelayStatus("Error publishing relays.", "error");
        userLogger.error("Failed to publish DM relays:", error);
    } finally {
        this.relayPublishBtn.disabled = false;
    }
  }

  setRelayStatus(message, type = "info") {
      if (!this.relayStatus) return;
      this.relayStatus.textContent = message;

      this.relayStatus.classList.remove("text-status-success", "text-status-danger", "text-muted");

      if (type === "error") {
          this.relayStatus.classList.add("text-status-danger");
      } else if (type === "success") {
          this.relayStatus.classList.add("text-status-success");
      } else {
          this.relayStatus.classList.add("text-muted");
      }
  }
}
