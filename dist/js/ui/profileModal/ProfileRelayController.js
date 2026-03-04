import { devLogger, userLogger } from "../../utils/logger.js";
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

      const urlEl = document.createElement("p");
      urlEl.className = "text-sm font-medium text-primary break-all";
      urlEl.textContent = entry.url;

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

      info.appendChild(urlEl);
      info.appendChild(statusEl);
      info.appendChild(health);

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

    snapshot.forEach((entry) => {
      const url = entry.url;
      const item = this.relayList.querySelector(
        `li[data-relay-url="${CSS.escape(url)}"]`,
      );
      if (!item) {
        return;
      }

      const healthContainer = item.querySelector('[data-role="relay-health"]');
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
      result = await this.runRelayOperation({
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

    const confirmed = window.confirm("Restore the recommended relay defaults?");
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

    const confirmed = window.confirm(
      `Remove ${url} from your relay list?`,
    );
    if (!confirmed) {
      return;
    }

    await this.handleRelayOperation(
      { action: "remove", url },
      { successMessage: "Relay removed." },
    );
  }

}
