import { devLogger, userLogger } from "../../utils/logger.js";
import { RUNTIME_FLAGS } from "../../constants.js";
import {
  DEFAULT_INTERNAL_MODERATION_SETTINGS,
  createInternalDefaultModerationSettings,
} from "../profileModalContract.js";

const noop = () => {};
const TRUSTED_MUTE_HIDE_HELPER_TEXT =
  "Reaching this count hides cards (with “Show anyway”); lower signals only blur thumbnails or block autoplay.";
const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";

export class ProfileModerationController {
  constructor(mainController) {
    this.mainController = mainController;

    this.moderationSettingsCard = null;
    this.moderationBlurInput = null;
    this.moderationAutoplayInput = null;
    this.moderationMuteHideInput = null;
    this.moderationSpamHideInput = null;
    this.moderationSaveButton = null;
    this.moderationResetButton = null;
    this.moderationStatusText = null;
    this.moderationOverridesList = null;
    this.moderationOverridesEmpty = null;
    this.moderationTrustedContactsCount = null;
    this.moderationTrustedMuteCount = null;
    this.moderationTrustedReportCount = null;
    this.moderationSeedOnlyIndicator = null;
    this.moderationHideControlsGroup = null;
    this.moderationHideControlElements = [];
    this.boundModerationOverridesUpdate = null;

    this.moderationSettingsDefaults = createInternalDefaultModerationSettings();
    this.currentModerationSettings = createInternalDefaultModerationSettings();
  }

  cacheDomReferences() {
    this.moderationSettingsCard = document.getElementById("profileModerationSettings") || null;
    this.moderationBlurInput = document.getElementById("profileModerationBlurThreshold") || null;
    this.moderationAutoplayInput = document.getElementById("profileModerationAutoplayThreshold") || null;
    this.moderationMuteHideInput = document.getElementById("profileModerationMuteHideThreshold") || null;
    this.moderationSpamHideInput = document.getElementById("profileModerationSpamHideThreshold") || null;
    this.moderationSaveButton = document.getElementById("profileModerationSave") || null;
    this.moderationResetButton = document.getElementById("profileModerationReset") || null;
    this.moderationStatusText = document.getElementById("profileModerationStatus") || null;
    this.moderationOverridesList = document.getElementById("profileModerationOverridesList") || null;
    this.moderationOverridesEmpty = document.getElementById("profileModerationOverridesEmpty") || null;
    this.moderationTrustedContactsCount = document.getElementById("profileModerationTrustedContactsCount") || null;
    this.moderationTrustedMuteCount = document.getElementById("profileModerationTrustedMuteCount") || null;
    this.moderationTrustedReportCount = document.getElementById("profileModerationTrustedReportCount") || null;
    this.moderationSeedOnlyIndicator = document.getElementById("profileModerationSeedOnlyIndicator") || null;

    this.moderationHideControlsGroup =
      this.moderationSettingsCard?.querySelector(
        "[data-role=\"trusted-hide-controls\"]",
      ) || null;
    this.moderationHideControlElements = Array.from(
      this.moderationSettingsCard?.querySelectorAll(
        "[data-role=\"trusted-hide-control\"]",
      ) || [],
    );

    this.updateTrustedMuteHideHelperCopy();
  }

  registerEventListeners() {
    if (this.moderationBlurInput instanceof HTMLElement) {
      this.moderationBlurInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationAutoplayInput instanceof HTMLElement) {
      this.moderationAutoplayInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationMuteHideInput instanceof HTMLElement) {
      this.moderationMuteHideInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationSpamHideInput instanceof HTMLElement) {
      this.moderationSpamHideInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationSaveButton instanceof HTMLElement) {
      this.moderationSaveButton.addEventListener("click", () => {
        void this.handleModerationSettingsSave();
      });
    }

    if (this.moderationResetButton instanceof HTMLElement) {
      this.moderationResetButton.addEventListener("click", () => {
        void this.handleModerationSettingsReset();
      });
    }

    if (!this.boundModerationOverridesUpdate && typeof document !== "undefined") {
      this.boundModerationOverridesUpdate = () => {
        this.refreshModerationOverridesUi();
      };
      document.addEventListener(
        "video:moderation-override",
        this.boundModerationOverridesUpdate,
      );
      document.addEventListener(
        "video:moderation-hide",
        this.boundModerationOverridesUpdate,
      );
      document.addEventListener(
        "video:moderation-block",
        this.boundModerationOverridesUpdate,
      );
    }
  }

  getModerationSettingsService() {
    const service = this.mainController.services.moderationSettings;
    if (!service || typeof service !== "object") {
      return null;
    }
    return service;
  }

  getModerationSettingsDefaults() {
    const service = this.getModerationSettingsService();
    let defaults = null;

    if (service && typeof service.getDefaultModerationSettings === "function") {
      try {
        defaults = service.getDefaultModerationSettings();
      } catch (error) {
        devLogger.info("[profileModal] moderation defaults fallback used", error);
      }
    }

    if (!defaults || typeof defaults !== "object") {
      defaults = createInternalDefaultModerationSettings();
    }

    const sanitized = {
      blurThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.blurThreshold ?? DEFAULT_INTERNAL_MODERATION_SETTINGS.blurThreshold,
          ),
        ),
      ),
      autoplayBlockThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.autoplayBlockThreshold ??
              DEFAULT_INTERNAL_MODERATION_SETTINGS.autoplayBlockThreshold,
          ),
        ),
      ),
      trustedMuteHideThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.trustedMuteHideThreshold ??
              DEFAULT_INTERNAL_MODERATION_SETTINGS.trustedMuteHideThreshold,
          ),
        ),
      ),
      trustedSpamHideThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.trustedSpamHideThreshold ??
              DEFAULT_INTERNAL_MODERATION_SETTINGS.trustedSpamHideThreshold,
          ),
        ),
      ),
    };

    return sanitized;
  }

  normalizeModerationSettings(settings = null) {
    const defaults = this.getModerationSettingsDefaults();
    const blur = Number.isFinite(settings?.blurThreshold)
      ? Math.max(0, Math.floor(settings.blurThreshold))
      : defaults.blurThreshold;
    const autoplay = Number.isFinite(settings?.autoplayBlockThreshold)
      ? Math.max(0, Math.floor(settings.autoplayBlockThreshold))
      : defaults.autoplayBlockThreshold;
    const muteHide = Number.isFinite(settings?.trustedMuteHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedMuteHideThreshold))
      : defaults.trustedMuteHideThreshold;
    const spamHide = Number.isFinite(settings?.trustedSpamHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedSpamHideThreshold))
      : defaults.trustedSpamHideThreshold;

    return {
      blurThreshold: blur,
      autoplayBlockThreshold: autoplay,
      trustedMuteHideThreshold: muteHide,
      trustedSpamHideThreshold: spamHide,
    };
  }

  readModerationInputs() {
    const defaults = this.getModerationSettingsDefaults();

    const parse = (input, fallback) => {
      if (!(input instanceof HTMLInputElement)) {
        return { value: fallback, override: null, valid: true };
      }

      const raw = typeof input.value === "string" ? input.value.trim() : "";
      if (!raw) {
        return { value: fallback, override: null, valid: true };
      }

      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        return { value: fallback, override: null, valid: false };
      }

      const sanitized = Math.max(0, Math.floor(numeric));
      return { value: sanitized, override: sanitized, valid: true };
    };

    const blur = parse(this.moderationBlurInput, defaults.blurThreshold);
    const autoplay = parse(
      this.moderationAutoplayInput,
      defaults.autoplayBlockThreshold,
    );
    const muteHide = parse(
      this.moderationMuteHideInput,
      defaults.trustedMuteHideThreshold,
    );
    const spamHide = parse(
      this.moderationSpamHideInput,
      defaults.trustedSpamHideThreshold,
    );

    const valid = blur.valid && autoplay.valid && muteHide.valid && spamHide.valid;
    const values = {
      blurThreshold: blur.value,
      autoplayBlockThreshold: autoplay.value,
      trustedMuteHideThreshold: muteHide.value,
      trustedSpamHideThreshold: spamHide.value,
    };
    const overrides = {
      blurThreshold: blur.override,
      autoplayBlockThreshold: autoplay.override,
      trustedMuteHideThreshold: muteHide.override,
      trustedSpamHideThreshold: spamHide.override,
    };

    return { defaults, values, overrides, valid };
  }

  applyModerationSettingsControlState({ resetStatus = false } = {}) {
    const result = this.readModerationInputs();

    const button = this.moderationSaveButton;
    if (button instanceof HTMLElement) {
      const baseline = this.currentModerationSettings || this.normalizeModerationSettings();
      const isDirty =
        result.valid &&
        (baseline.blurThreshold !== result.values.blurThreshold ||
          baseline.autoplayBlockThreshold !== result.values.autoplayBlockThreshold ||
          baseline.trustedMuteHideThreshold !==
            result.values.trustedMuteHideThreshold ||
          baseline.trustedSpamHideThreshold !==
            result.values.trustedSpamHideThreshold);
      button.disabled = !(result.valid && isDirty);
      if (button.disabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }
    }

    if (resetStatus) {
      this.updateModerationSettingsStatus("", "info");
    }

    return result;
  }

  areTrustedHideControlsEnabled() {
    if (
      RUNTIME_FLAGS &&
      typeof RUNTIME_FLAGS === "object" &&
      RUNTIME_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS === false
    ) {
      return false;
    }

    return true;
  }

  updateTrustedHideControlsVisibility() {
    const shouldShow = this.areTrustedHideControlsEnabled();
    const targets = new Set();

    if (this.moderationHideControlsGroup instanceof HTMLElement) {
      targets.add(this.moderationHideControlsGroup);
    }

    if (Array.isArray(this.moderationHideControlElements)) {
      for (const element of this.moderationHideControlElements) {
        if (element instanceof HTMLElement) {
          targets.add(element);
        }
      }
    }

    targets.forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      if (shouldShow) {
        element.classList.remove("hidden");
        element.removeAttribute("hidden");
        element.removeAttribute("aria-hidden");
      } else {
        element.classList.add("hidden");
        element.setAttribute("hidden", "");
        element.setAttribute("aria-hidden", "true");
      }
    });
  }

  updateModerationSettingsStatus(message = "", variant = "info") {
    if (!(this.moderationStatusText instanceof HTMLElement)) {
      return;
    }

    const text = typeof message === "string" ? message : "";
    this.moderationStatusText.textContent = text;

    if (text) {
      this.moderationStatusText.dataset.variant = variant || "info";
    } else if (this.moderationStatusText.dataset.variant) {
      delete this.moderationStatusText.dataset.variant;
    }
  }

  updateTrustedMuteHideHelperCopy() {
    if (!(this.moderationMuteHideInput instanceof HTMLInputElement)) {
      return;
    }

    const label = this.moderationMuteHideInput.closest("label");
    if (!(label instanceof HTMLElement)) {
      return;
    }

    const helper = label.querySelector("span.text-xs");
    if (!(helper instanceof HTMLElement)) {
      return;
    }

    helper.textContent = TRUSTED_MUTE_HIDE_HELPER_TEXT;
  }

  getModerationOverrideEntries() {
    if (typeof this.mainController.services.getModerationOverrides !== "function") {
      return [];
    }

    try {
      const entries = this.mainController.services.getModerationOverrides();
      return Array.isArray(entries) ? entries : [];
    } catch (error) {
      devLogger.info(
        "[profileModal] moderation overrides fallback used",
        error,
      );
      return [];
    }
  }

  normalizeModerationOverrideEntries(entries = []) {
    const normalized = [];
    const seen = new Set();

    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const eventId =
        typeof entry.eventId === "string"
          ? entry.eventId.trim().toLowerCase()
          : "";
      if (!eventId) {
        return;
      }
      const author =
        typeof entry.authorPubkey === "string"
          ? entry.authorPubkey.trim()
          : "";
      const normalizedAuthor = author ? this.mainController.normalizeHexPubkey(author) || author : "";
      const key = `${normalizedAuthor || ""}:${eventId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push({
        eventId,
        authorPubkey: normalizedAuthor || "",
        updatedAt: Number.isFinite(entry.updatedAt)
          ? Math.floor(entry.updatedAt)
          : 0,
      });
    });

    normalized.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return normalized;
  }

  formatModerationOverrideTimestamp(updatedAt) {
    const numeric = Number(updatedAt);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { display: "", iso: "" };
    }

    try {
      const date = new Date(numeric);
      return {
        display: date.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        iso: date.toISOString(),
      };
    } catch (error) {
      return { display: "", iso: "" };
    }
  }

  async handleModerationOverrideReset(entry) {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    if (typeof this.mainController.services.clearModerationOverride !== "function") {
      return false;
    }

    try {
      await this.mainController.services.clearModerationOverride({
        eventId: entry.eventId,
        authorPubkey: entry.authorPubkey,
      });
      this.refreshModerationOverridesUi();
      this.mainController.showSuccess("Moderation override reset.");
      return true;
    } catch (error) {
      this.mainController.showError("Unable to reset this moderation override.");
      return false;
    }
  }

  refreshModerationOverridesUi() {
    if (
      !(this.moderationOverridesList instanceof HTMLElement) ||
      !(this.moderationOverridesEmpty instanceof HTMLElement)
    ) {
      return;
    }

    const entries = this.normalizeModerationOverrideEntries(
      this.getModerationOverrideEntries(),
    );

    this.moderationOverridesList.textContent = "";

    if (!entries.length) {
      this.moderationOverridesEmpty.classList.remove("hidden");
      this.moderationOverridesList.classList.add("hidden");
      return;
    }

    this.moderationOverridesEmpty.classList.add("hidden");
    this.moderationOverridesList.classList.remove("hidden");

    const entriesNeedingFetch = new Set();

    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "card space-y-2 p-4";

      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-4";

      const authorKey = entry.authorPubkey;
      let profileSummary = null;
      if (authorKey) {
        const cacheEntry = this.mainController.services.getProfileCacheEntry(authorKey);
        if (!cacheEntry) {
          entriesNeedingFetch.add(authorKey);
        }
      }

      const summaryData = this.mainController.dmController.resolveProfileSummaryForPubkey(authorKey);
      profileSummary = this.mainController.dmController.createCompactProfileSummary(summaryData);

      const actions = document.createElement("div");
      actions.className = "flex flex-wrap items-center justify-end gap-2";

      const resetButton = this.mainController.createRemoveButton({
        label: "Reset",
        onRemove: () => this.handleModerationOverrideReset(entry),
      });
      if (resetButton) {
        actions.appendChild(resetButton);
      }

      if (profileSummary) {
        row.appendChild(profileSummary);
      }
      if (actions.childElementCount > 0) {
        row.appendChild(actions);
      }

      const meta = document.createElement("div");
      meta.className = "flex flex-wrap items-center gap-3 text-2xs text-muted";

      const contentId = document.createElement("span");
      contentId.className = "font-mono text-2xs text-muted";
      const shortId =
        typeof this.mainController.truncateMiddle === "function"
          ? this.mainController.truncateMiddle(entry.eventId, 16)
          : entry.eventId;
      contentId.textContent = `Content ${shortId}`;
      contentId.title = entry.eventId;
      meta.appendChild(contentId);

      const timestamp = this.formatModerationOverrideTimestamp(entry.updatedAt);
      if (timestamp.display) {
        const time = document.createElement("time");
        time.className = "text-2xs text-muted";
        time.dateTime = timestamp.iso;
        time.textContent = `Updated ${timestamp.display}`;
        meta.appendChild(time);
      }

      item.appendChild(row);
      item.appendChild(meta);

      this.moderationOverridesList.appendChild(item);
    });

    if (
      entriesNeedingFetch.size &&
      typeof this.mainController.services.batchFetchProfiles === "function"
    ) {
      this.mainController.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  refreshModerationSettingsUi() {
    const service = this.getModerationSettingsService();
    if (!service) {
      this.moderationSettingsDefaults = createInternalDefaultModerationSettings();
      this.currentModerationSettings = createInternalDefaultModerationSettings();
      this.updateTrustedHideControlsVisibility();
      this.updateModerationTrustStats();
      this.refreshModerationOverridesUi();
      this.applyModerationSettingsControlState({ resetStatus: true });
      return;
    }

    let active = null;
    if (typeof service.getActiveModerationSettings === "function") {
      try {
        active = service.getActiveModerationSettings();
      } catch (error) {
        devLogger.info("[profileModal] moderation settings fallback used", error);
      }
    }

    const defaults = this.getModerationSettingsDefaults();
    this.moderationSettingsDefaults = defaults;
    const normalized = this.normalizeModerationSettings(active);
    this.currentModerationSettings = normalized;

    if (this.moderationBlurInput instanceof HTMLInputElement) {
      this.moderationBlurInput.value = String(normalized.blurThreshold);
    }

    if (this.moderationAutoplayInput instanceof HTMLInputElement) {
      this.moderationAutoplayInput.value = String(
        normalized.autoplayBlockThreshold,
      );
    }

    if (this.moderationMuteHideInput instanceof HTMLInputElement) {
      this.moderationMuteHideInput.value = String(
        normalized.trustedMuteHideThreshold,
      );
    }

    if (this.moderationSpamHideInput instanceof HTMLInputElement) {
      this.moderationSpamHideInput.value = String(
        normalized.trustedSpamHideThreshold,
      );
    }

    this.updateTrustedHideControlsVisibility();
    this.updateModerationTrustStats();
    this.refreshModerationOverridesUi();

    this.applyModerationSettingsControlState({ resetStatus: true });
  }

  getModerationTrustStats() {
    const summary = {
      trustedContactsCount: 0,
      trustedMuteContributors: 0,
      trustedReportContributors: 0,
      trustedSeedOnly: false,
    };

    const service = this.mainController.moderationService;
    if (!service) {
      return summary;
    }

    if (typeof service.isTrustedSeedOnly === "function") {
      summary.trustedSeedOnly = service.isTrustedSeedOnly();
    } else if (typeof service.trustedSeedOnly === "boolean") {
      summary.trustedSeedOnly = service.trustedSeedOnly;
    }

    const trustedContacts =
      service.trustedContacts instanceof Set
        ? service.trustedContacts
        : Array.isArray(service.trustedContacts)
        ? new Set(service.trustedContacts)
        : new Set();

    summary.trustedContactsCount = trustedContacts.size;

    const adminSnapshot =
      typeof service.getAdminListSnapshot === "function"
        ? service.getAdminListSnapshot()
        : null;

    const resolveStatus = (candidate) => {
      if (typeof service.getAccessControlStatus === "function") {
        return service.getAccessControlStatus(candidate, adminSnapshot);
      }
      return {
        hex: this.mainController.normalizeHexPubkey(candidate),
        whitelisted: false,
        blacklisted: false,
      };
    };

    const isBlocked = (pubkey) =>
      typeof service.isPubkeyBlockedByViewer === "function"
        ? service.isPubkeyBlockedByViewer(pubkey)
        : false;

    const isTrustedCandidate = (status) => {
      if (!status || !status.hex) {
        return false;
      }
      if (status.blacklisted) {
        return false;
      }
      if (isBlocked(status.hex)) {
        return false;
      }
      return Boolean(status.whitelisted || trustedContacts.has(status.hex));
    };

    if (service.trustedMuteLists instanceof Map) {
      const trustedMuteOwners = new Set();
      for (const owner of service.trustedMuteLists.keys()) {
        const status = resolveStatus(owner);
        if (isTrustedCandidate(status)) {
          trustedMuteOwners.add(status.hex);
        }
      }
      summary.trustedMuteContributors = trustedMuteOwners.size;
    }

    if (service.reportEvents instanceof Map) {
      const trustedReporters = new Set();
      for (const eventReports of service.reportEvents.values()) {
        if (!(eventReports instanceof Map)) {
          continue;
        }
        for (const reporter of eventReports.keys()) {
          const status = resolveStatus(reporter);
          if (!isTrustedCandidate(status)) {
            continue;
          }
          trustedReporters.add(status.hex);
        }
      }
      summary.trustedReportContributors = trustedReporters.size;
    }

    return summary;
  }

  updateModerationTrustStats() {
    if (
      !(this.moderationTrustedContactsCount instanceof HTMLElement) &&
      !(this.moderationTrustedMuteCount instanceof HTMLElement) &&
      !(this.moderationTrustedReportCount instanceof HTMLElement) &&
      !(this.moderationSeedOnlyIndicator instanceof HTMLElement)
    ) {
      return;
    }

    const summary = this.getModerationTrustStats();

    if (this.moderationTrustedContactsCount instanceof HTMLElement) {
      this.moderationTrustedContactsCount.textContent = String(
        summary.trustedContactsCount,
      );
    }

    if (this.moderationTrustedMuteCount instanceof HTMLElement) {
      this.moderationTrustedMuteCount.textContent = String(
        summary.trustedMuteContributors,
      );
    }

    if (this.moderationTrustedReportCount instanceof HTMLElement) {
      this.moderationTrustedReportCount.textContent = String(
        summary.trustedReportContributors,
      );
    }

    if (this.moderationSeedOnlyIndicator instanceof HTMLElement) {
      this.moderationSeedOnlyIndicator.hidden = !summary.trustedSeedOnly;
    }
  }

  async handleModerationSettingsSave() {
    const service = this.getModerationSettingsService();
    const context = {
      success: false,
      reason: null,
      error: null,
      settings: null,
    };

    if (!service) {
      return context;
    }

    const inputState = this.applyModerationSettingsControlState();
    if (!inputState.valid) {
      const message =
        "Enter non-negative whole numbers for moderation thresholds.";
      this.updateModerationSettingsStatus(message, "error");
      this.mainController.showError(message);
      context.reason = "invalid-input";
      context.error = message;
      return context;
    }

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(inputState.overrides, "blurThreshold")) {
      payload.blurThreshold = inputState.overrides.blurThreshold;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        inputState.overrides,
        "autoplayBlockThreshold",
      )
    ) {
      payload.autoplayBlockThreshold = inputState.overrides.autoplayBlockThreshold;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        inputState.overrides,
        "trustedMuteHideThreshold",
      )
    ) {
      payload.trustedMuteHideThreshold =
        inputState.overrides.trustedMuteHideThreshold;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        inputState.overrides,
        "trustedSpamHideThreshold",
      )
    ) {
      payload.trustedSpamHideThreshold =
        inputState.overrides.trustedSpamHideThreshold;
    }

    try {
      const updated =
        typeof service.updateModerationSettings === "function"
          ? await service.updateModerationSettings(payload)
          : inputState.values;

      const normalized = this.normalizeModerationSettings(updated);
      this.currentModerationSettings = normalized;
      if (this.moderationBlurInput instanceof HTMLInputElement) {
        this.moderationBlurInput.value = String(normalized.blurThreshold);
      }
      if (this.moderationAutoplayInput instanceof HTMLInputElement) {
        this.moderationAutoplayInput.value = String(
          normalized.autoplayBlockThreshold,
        );
      }
      if (this.moderationMuteHideInput instanceof HTMLInputElement) {
        this.moderationMuteHideInput.value = String(
          normalized.trustedMuteHideThreshold,
        );
      }
      if (this.moderationSpamHideInput instanceof HTMLInputElement) {
        this.moderationSpamHideInput.value = String(
          normalized.trustedSpamHideThreshold,
        );
      }
      this.applyModerationSettingsControlState();
      this.updateModerationSettingsStatus("Moderation settings saved.", "success");
      this.mainController.showSuccess("Moderation settings saved.");
      context.success = true;
      context.reason = "saved";
      context.settings = normalized;
      this.mainController.callbacks.onModerationSettingsChange({
        settings: normalized,
        controller: this.mainController,
        reason: "saved",
      });
    } catch (error) {
      const fallbackMessage = "Failed to update moderation settings.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      this.updateModerationSettingsStatus(detail, "error");
      this.mainController.showError(detail);
      context.error = detail;
      context.reason = error?.code || "service-error";
    }

    return context;
  }

  async handleModerationSettingsReset() {
    const service = this.getModerationSettingsService();
    const context = {
      success: false,
      reason: null,
      error: null,
      settings: null,
    };

    if (!service) {
      return context;
    }

    try {
      const updated =
        typeof service.resetModerationSettings === "function"
          ? await service.resetModerationSettings()
          : createInternalDefaultModerationSettings();

      const normalized = this.normalizeModerationSettings(updated);
      this.currentModerationSettings = normalized;
      if (this.moderationBlurInput instanceof HTMLInputElement) {
        this.moderationBlurInput.value = String(normalized.blurThreshold);
      }
      if (this.moderationAutoplayInput instanceof HTMLInputElement) {
        this.moderationAutoplayInput.value = String(
          normalized.autoplayBlockThreshold,
        );
      }
      if (this.moderationMuteHideInput instanceof HTMLInputElement) {
        this.moderationMuteHideInput.value = String(
          normalized.trustedMuteHideThreshold,
        );
      }
      if (this.moderationSpamHideInput instanceof HTMLInputElement) {
        this.moderationSpamHideInput.value = String(
          normalized.trustedSpamHideThreshold,
        );
      }
      this.updateTrustedHideControlsVisibility();
      this.applyModerationSettingsControlState({ resetStatus: true });
      this.updateModerationSettingsStatus(
        "Moderation defaults restored.",
        "success",
      );
      this.mainController.showSuccess("Moderation defaults restored.");
      context.success = true;
      context.reason = "reset";
      context.settings = normalized;
      this.mainController.callbacks.onModerationSettingsChange({
        settings: normalized,
        controller: this.mainController,
        reason: "reset",
      });
    } catch (error) {
      const fallbackMessage = "Failed to restore moderation defaults.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      this.updateModerationSettingsStatus(detail, "error");
      this.mainController.showError(detail);
      context.error = detail;
      context.reason = error?.code || "service-error";
    }

    return context;
  }
}
