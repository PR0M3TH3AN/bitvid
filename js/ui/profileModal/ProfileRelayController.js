import { devLogger, userLogger } from "../../utils/logger.js";
import { showConfirm } from "../confirmDialog.js";
import { sanitizeRelayList } from "../../nostr/nip46Client.js";

const noop = () => {};

export class ProfileRelayController {
  constructor(mainController) {
    this.mainController = mainController;
    this.relayList = null;
    this.relayInput = null;
    this.addRelayButton = null;
    this.restoreRelaysButton = null;
    this.relayHealthStatus = null;
    this.relayHealthTelemetryToggle = null;
    this.profileRelayRefreshBtn = null;
    this.profileRestoreRelaysBtn = null;
    this.profileAddRelayBtn = null;
  }

  cacheDomReferences() {
    this.relayList = document.getElementById("relayList") || null;
    this.relayInput = document.getElementById("relayInput") || null;
    this.addRelayButton = document.getElementById("addRelayBtn") || null;
    this.restoreRelaysButton = document.getElementById("restoreRelaysBtn") || null;
    this.relayHealthStatus = document.getElementById("relayHealthStatus") || null;
    this.relayHealthSuggestion =
      document.getElementById("relayHealthSuggestion") || null;
    this.relayHealthTelemetryToggle = document.getElementById("relayHealthTelemetryOptIn") || null;
    this.profileRelayRefreshBtn = document.getElementById("relayListRefreshBtn") || null;
    this.profileRestoreRelaysBtn = this.restoreRelaysButton;
    this.profileAddRelayBtn = this.addRelayButton;
  }

  populateProfileRelays(relayEntries = null) {
    if (!this.relayList) {
      return;
    }

    const sourceEntries = Array.isArray(relayEntries)
      ? relayEntries
      : this.mainController.services.relayManager.getEntries();

    const relays = sourceEntries
      .map((entry) => {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed ? { url: trimmed, mode: "both" } : null;
        }
        if (entry && typeof entry === "object") {
          const url = typeof entry.url === "string" ? entry.url.trim() : "";
          if (!url) {
            return null;
          }
          const mode = typeof entry.mode === "string" ? entry.mode : "both";
          const normalizedMode =
            mode === "read" || mode === "write" ? mode : "both";
          return {
            url,
            mode: normalizedMode,
            read: entry.read !== false,
            write: entry.write !== false,
          };
        }
        return null;
      })
      .filter((entry) => entry && typeof entry.url === "string");

    this.relayList.textContent = "";

    if (!relays.length) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-surface-strong p-4 text-center text-sm text-muted";
      emptyState.textContent = "No relays configured.";
      this.relayList.appendChild(emptyState);
      return;
    }

    relays.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "card flex items-start justify-between gap-4 p-4";
      item.dataset.relayUrl = entry.url;

      const info = document.createElement("div");
      info.className = "flex-1 min-w-0";

      const urlRow = document.createElement("div");
      urlRow.className = "flex items-center gap-2 flex-wrap";

      const urlEl = document.createElement("p");
      urlEl.className = "text-sm font-medium text-primary break-all";
      urlEl.textContent = entry.url;

      // Live connectivity pill. Defaults to "Checking…" until a health snapshot
      // arrives (updateRelayHealthIndicators sets the real state). Insecure
      // cleartext ws:// relays (non-localhost) are blocked by the browser CSP,
      // so flag them as such immediately — they will never connect.
      const statusPill = document.createElement("span");
      statusPill.dataset.role = "relay-status-pill";
      if (this.isInsecureRelayUrl(entry.url)) {
        this.applyStatusPill(statusPill, "blocked");
      } else {
        this.applyStatusPill(statusPill, "checking");
      }

      urlRow.appendChild(urlEl);
      urlRow.appendChild(statusPill);

      const statusEl = document.createElement("p");
      statusEl.className = "mt-1 text-xs text-muted";
      let modeLabel = "Read & write";
      if (entry.mode === "read") {
        modeLabel = "Read only";
      } else if (entry.mode === "write") {
        modeLabel = "Write only";
      }
      statusEl.textContent = modeLabel;

      const health = document.createElement("div");
      health.className = "flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-2xs text-muted empty:hidden";
      health.dataset.role = "relay-health";

      // Actionable hint shown when a relay is unreachable/blocked.
      const hint = document.createElement("p");
      hint.className = "mt-1 text-2xs text-status-warning empty:hidden";
      hint.dataset.role = "relay-hint";
      if (this.isInsecureRelayUrl(entry.url)) {
        hint.textContent =
          "Insecure ws:// relay — blocked by the browser. Remove it or use a wss:// address.";
      }

      info.appendChild(urlRow);
      info.appendChild(statusEl);
      info.appendChild(health);
      info.appendChild(hint);

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-2";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-ghost focus-ring text-xs";
      editBtn.textContent = "Change mode";
      editBtn.title = "Cycle between read-only, write-only, or read/write modes.";
      editBtn.addEventListener("click", () => {
        void this.handleRelayModeToggle(entry.url);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-ghost focus-ring text-xs";
      removeBtn.dataset.variant = "danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        void this.handleRemoveRelay(entry.url);
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(info);
      item.appendChild(actions);

      this.relayList.appendChild(item);
    });
  }

  // A cleartext ws:// relay that is NOT localhost/127.0.0.1 is blocked by the
  // app's Content-Security-Policy (connect-src allows wss: and ws://localhost
  // only), so it can never connect from the browser.
  isInsecureRelayUrl(url) {
    if (typeof url !== "string") {
      return false;
    }
    const trimmed = url.trim().toLowerCase();
    if (!trimmed.startsWith("ws://")) {
      return false;
    }
    return !(
      trimmed.startsWith("ws://localhost") ||
      trimmed.startsWith("ws://127.0.0.1")
    );
  }

  // Paint a status pill in place. State is one of:
  // "online" | "offline" | "checking" | "blocked".
  applyStatusPill(pill, state, detail = "") {
    if (!(pill instanceof HTMLElement)) {
      return;
    }
    const base =
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold whitespace-nowrap";
    const config = {
      online: { cls: "bg-status-success/15 text-status-success", label: "● Online" },
      offline: { cls: "bg-status-danger/15 text-status-danger", label: "● Offline" },
      checking: { cls: "bg-surface-strong/40 text-muted", label: "● Checking…" },
      blocked: { cls: "bg-status-danger/15 text-status-danger", label: "● Blocked" },
    };
    const chosen = config[state] || config.checking;
    pill.className = `${base} ${chosen.cls}`;
    pill.textContent = detail ? `${chosen.label} · ${detail}` : chosen.label;
    pill.dataset.state = state;
  }

  updateRelayHealthStatus(message = "") {
    if (!this.relayHealthStatus) {
      return;
    }

    const text = typeof message === "string" ? message.trim() : "";
    this.relayHealthStatus.textContent = text;
  }

  updateRelayHealthIndicators(snapshot = []) {
    if (!this.relayList) {
      return;
    }

    if (!Array.isArray(snapshot)) {
      return;
    }

    let deadCount = 0;
    let totalCount = 0;

    snapshot.forEach((entry) => {
      const url = entry.url;
      const item = this.relayList.querySelector(
        `li[data-relay-url="${CSS.escape(url)}"]`,
      );
      if (!item) {
        return;
      }
      totalCount += 1;

      const healthContainer = item.querySelector('[data-role="relay-health"]');
      const pill = item.querySelector('[data-role="relay-status-pill"]');
      const hint = item.querySelector('[data-role="relay-hint"]');

      // Classify connectivity from the snapshot. A relay that has been checked
      // (lastCheckedAt) and is not connected is dead; one never checked is still
      // "checking". Insecure ws:// relays are blocked regardless.
      const insecure = this.isInsecureRelayUrl(url);
      const checked = Boolean(entry.lastCheckedAt);
      let state;
      if (insecure) {
        state = "blocked";
      } else if (entry.connected) {
        state = "online";
      } else if (checked) {
        state = "offline";
      } else {
        state = "checking";
      }

      const isDead = state === "offline" || state === "blocked";
      if (isDead) {
        deadCount += 1;
      }

      if (pill) {
        const detail =
          state === "online" && Number.isFinite(entry.lastLatencyMs)
            ? `${entry.lastLatencyMs}ms`
            : "";
        this.applyStatusPill(pill, state, detail);
      }

      // Draw attention to dead relays' Remove button so they're easy to spot.
      const removeBtn = item.querySelector('button[data-variant="danger"]');
      if (removeBtn instanceof HTMLElement) {
        removeBtn.dataset.emphasis = isDead ? "true" : "false";
      }

      if (hint instanceof HTMLElement && !insecure) {
        // (insecure hint is set at populate time and never changes)
        hint.textContent =
          state === "offline"
            ? "Unreachable right now — consider removing it to speed up loading."
            : "";
      }

      if (!healthContainer) {
        return;
      }
      healthContainer.textContent = "";

      const createBadge = (label, value, colorClass) => {
        const span = document.createElement("span");
        span.className = "inline-flex items-center gap-1 bg-surface-strong/30 px-1.5 py-0.5 rounded";
        const l = document.createElement("span");
        l.textContent = label;
        const v = document.createElement("span");
        v.className = colorClass || "text-text";
        v.textContent = value;
        span.appendChild(l);
        span.appendChild(v);
        return span;
      };

      if (Number.isFinite(entry.lastLatencyMs)) {
        let color = "text-status-success";
        if (entry.lastLatencyMs > 1000) color = "text-status-danger";
        else if (entry.lastLatencyMs > 300) color = "text-status-warning";
        healthContainer.appendChild(
          createBadge("Ping:", `${entry.lastLatencyMs}ms`, color),
        );
      }

      if (entry.errorCount > 0) {
        healthContainer.appendChild(
          createBadge("Errors:", `${entry.errorCount}`, "text-status-danger"),
        );
      }
    });

    this.updateRelaySuggestion(deadCount, totalCount);
  }

  // Summary banner above the list: when relays are dead/blocked, nudge the user
  // to clean up (and point at "Restore defaults" when the list is badly broken).
  updateRelaySuggestion(deadCount, totalCount) {
    const banner = this.relayHealthSuggestion;
    if (!(banner instanceof HTMLElement)) {
      return;
    }
    if (!deadCount || !totalCount) {
      banner.classList.add("hidden");
      banner.textContent = "";
      return;
    }

    banner.textContent = "";
    const headline = document.createElement("p");
    headline.className = "font-semibold text-status-warning";
    headline.textContent =
      deadCount >= totalCount
        ? `None of your ${totalCount} relays are reachable.`
        : `${deadCount} of ${totalCount} relays are unreachable.`;
    banner.appendChild(headline);

    const tip = document.createElement("p");
    tip.className = "mt-1 text-muted";
    tip.textContent =
      deadCount >= totalCount
        ? "Videos can't load without a working relay. Use “Restore defaults” below, or add a healthy relay like wss://relay.damus.io or wss://nos.lol."
        : "Removing unreachable relays speeds up loading. Look for the red “Offline” tags below.";
    banner.appendChild(tip);

    banner.classList.remove("hidden");
  }

  handleRelayHealthTelemetryToggle() {
    const service = this.mainController.services?.relayHealthService;
    if (!service || !(this.relayHealthTelemetryToggle instanceof HTMLInputElement)) {
      return;
    }

    const enabled = service.setTelemetryOptIn(
      this.relayHealthTelemetryToggle.checked,
    );
    this.relayHealthTelemetryToggle.checked = enabled;
    this.updateRelayHealthStatus(
      enabled ? "Relay health telemetry enabled." : "Relay health telemetry disabled.",
    );
  }

  async refreshRelayHealthPanel({ forceRefresh = false, reason = "" } = {}) {
    const service = this.mainController.services?.relayHealthService;
    if (!service) {
      return [];
    }

    if (this.relayHealthTelemetryToggle instanceof HTMLInputElement) {
      this.relayHealthTelemetryToggle.checked = service.getTelemetryOptIn();
    }

    const snapshot = service.getSnapshot();
    this.updateRelayHealthIndicators(snapshot);

    if (!forceRefresh) {
      return snapshot;
    }

    if (this.relayHealthRefreshPromise) {
      return this.relayHealthRefreshPromise;
    }

    const statusMessage =
      reason === "manual" ? "Refreshing relay health…" : "Checking relays…";
    this.updateRelayHealthStatus(statusMessage);

    const refreshPromise = service
      .refresh()
      .then((latest) => {
        this.updateRelayHealthIndicators(latest);
        this.updateRelayHealthStatus("Relay health updated.");
        return latest;
      })
      .catch((error) => {
        this.updateRelayHealthStatus("Failed to refresh relay health.");
        this.mainController.showError("Failed to refresh relay health.");
        devLogger.warn("[profileModal] Relay health refresh failed:", error);
        return [];
      })
      .finally(() => {
        if (this.relayHealthRefreshPromise === refreshPromise) {
          this.relayHealthRefreshPromise = null;
        }
      });

    this.relayHealthRefreshPromise = refreshPromise;
    return refreshPromise;
  }

  async handleRelayOperation(meta = {}, {
    successMessage = "Relay preferences updated.",
    skipPublishIfUnchanged = true,
    unchangedMessage = null,
  } = {}) {
    const operationContext = {
      ...meta,
      ok: false,
      changed: false,
      reason: null,
      error: null,
      publishResult: null,
      operationResult: null,
    };

    const activePubkey = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!activePubkey) {
      this.mainController.showError("Please login to manage your relays.");
      operationContext.reason = "no-active-pubkey";
      return operationContext;
    }

    let result;
    try {
      // runRelayOperation lives on the main ProfileModalController (it owns the
      // onRelayOperation callback); it was not moved when relay logic was
      // extracted into this controller, so it must be called via mainController.
      result = await this.mainController.runRelayOperation({
        ...meta,
        activePubkey,
        skipPublishIfUnchanged,
      });
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to update relay preferences.";
      operationContext.reason = error?.code || "callback-error";
      operationContext.error = error;
      this.mainController.showError(message);
      return operationContext;
    }

    if (result && typeof result === "object") {
      operationContext.ok = Boolean(result.ok);
      operationContext.changed = Boolean(result.changed);
      operationContext.reason =
        typeof result.reason === "string" ? result.reason : operationContext.reason;
      operationContext.error = result.error ?? operationContext.error;
      operationContext.publishResult =
        result.publishResult ?? operationContext.publishResult;
      operationContext.operationResult =
        result.operationResult ?? operationContext.operationResult;
    }

    if (!operationContext.changed && skipPublishIfUnchanged) {
      const reason = operationContext.reason || "unchanged";
      operationContext.reason = reason;
      if (reason === "duplicate") {
        this.mainController.showSuccess("Relay is already configured.");
      } else if (typeof unchangedMessage === "string" && unchangedMessage) {
        this.mainController.showSuccess(unchangedMessage);
      }
      this.populateProfileRelays();
      void this.refreshRelayHealthPanel({ forceRefresh: true, reason: "relay-update" });
      return operationContext;
    }

    this.populateProfileRelays();
    void this.refreshRelayHealthPanel({ forceRefresh: true, reason: "relay-update" });

    if (operationContext.ok) {
      if (successMessage) {
        this.mainController.showSuccess(successMessage);
      }
      return operationContext;
    }

    const message =
      operationContext.error &&
      typeof operationContext.error.message === "string" &&
      operationContext.error.message.trim()
        ? operationContext.error.message.trim()
        : "Failed to publish relay configuration. Please try again.";

    if (operationContext.reason !== "no-active-pubkey") {
      this.mainController.showError(message);
    }

    return operationContext;
  }

  async handleAddRelay() {
    const rawValue =
      typeof this.relayInput?.value === "string"
        ? this.relayInput.value
        : "";
    const trimmed = rawValue.trim();

    const context = {
      input: this.relayInput,
      rawValue,
      url: trimmed,
      result: null,
      success: false,
      reason: null,
    };

    if (!trimmed) {
      this.mainController.showError("Enter a relay URL to add.");
      context.reason = "empty";
      this.mainController.callbacks.onAddRelay(context, this);
      return context;
    }

    const operationResult = await this.handleRelayOperation(
      { action: "add", url: trimmed },
      {
        successMessage: "Relay saved.",
        unchangedMessage: "Relay is already configured.",
      },
    );

    if (this.relayInput) {
      this.relayInput.value = "";
    }

    context.result = operationResult;
    context.success = !!operationResult?.ok;
    context.reason = operationResult?.reason || null;

    this.mainController.callbacks.onAddRelay(context, this);
    return context;
  }

  async handleRestoreRelays() {
    const context = {
      confirmed: false,
      result: null,
      success: false,
      reason: null,
    };

    const confirmed = await showConfirm("Restore the recommended relay defaults?", { confirmLabel: "Restore" });
    context.confirmed = confirmed;
    if (!confirmed) {
      context.reason = "cancelled";
      this.mainController.callbacks.onRestoreRelays(context, this);
      return context;
    }

    const operationResult = await this.handleRelayOperation(
      { action: "restore" },
      {
        successMessage: "Relay defaults restored.",
        unchangedMessage: "Relay defaults are already in use.",
      },
    );

    context.result = operationResult;
    context.success = !!operationResult?.ok;
    context.reason = operationResult?.reason || null;

    this.mainController.callbacks.onRestoreRelays(context, this);
    this.mainController.callbacks.onRelayRestore({
      controller: this,
      context,
    });
    return context;
  }

  async handleRelayModeToggle(url) {
    if (!url) {
      return;
    }
    const context = await this.handleRelayOperation(
      { action: "mode-toggle", url },
      { successMessage: "Relay mode updated." },
    );
    this.mainController.callbacks.onRelayModeToggle({
      controller: this,
      url,
      context,
    });
  }

  async handleRemoveRelay(url) {
    if (!url) {
      return;
    }

    const confirmed = await showConfirm(`Remove ${url} from your relay list?`, {
      confirmLabel: "Remove",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    await this.handleRelayOperation(
      { action: "remove", url },
      { successMessage: "Relay removed." },
    );
  }

}
