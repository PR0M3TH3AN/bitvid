import { devLogger, userLogger } from "../../utils/logger.js";
import { isDevMode } from "../../config.js";
import { ProfileAdminRenderer } from "./ProfileAdminRenderer.js";

const noop = () => {};

export class ProfileAdminController {
  constructor(mainController) {
    this.mainController = mainController;
    this.renderer = new ProfileAdminRenderer(mainController);

    this.moderatorSection = null;
    this.moderatorEmpty = null;
    this.adminModeratorList = null;
    this.addModeratorButton = null;
    this.moderatorInput = null;
    this.adminModeratorsRefreshBtn = null;
    this.whitelistSection = null;
    this.whitelistEmpty = null;
    this.whitelistList = null;
    this.addWhitelistButton = null;
    this.whitelistInput = null;
    this.adminWhitelistRefreshBtn = null;
    this.blacklistSection = null;
    this.blacklistEmpty = null;
    this.blacklistList = null;
    this.addBlacklistButton = null;
    this.blacklistInput = null;
    this.adminBlacklistRefreshBtn = null;
  }

  cacheDomReferences() {
    this.moderatorSection = document.getElementById("adminModeratorsSection") || null;
    this.moderatorEmpty = document.getElementById("adminModeratorsEmpty") || null;
    this.adminModeratorList = document.getElementById("adminModeratorList") || null;
    this.addModeratorButton = document.getElementById("adminAddModeratorBtn") || null;
    this.moderatorInput = document.getElementById("adminModeratorInput") || null;
    this.adminModeratorsRefreshBtn = document.getElementById("adminModeratorsRefreshBtn") || null;

    this.whitelistSection = document.getElementById("adminWhitelistSection") || null;
    this.whitelistEmpty = document.getElementById("adminWhitelistEmpty") || null;
    this.whitelistList = document.getElementById("adminWhitelistList") || null;
    this.addWhitelistButton = document.getElementById("adminAddWhitelistBtn") || null;
    this.whitelistInput = document.getElementById("adminWhitelistInput") || null;
    this.adminWhitelistRefreshBtn = document.getElementById("adminWhitelistRefreshBtn") || null;

    this.blacklistSection = document.getElementById("adminBlacklistSection") || null;
    this.blacklistEmpty = document.getElementById("adminBlacklistEmpty") || null;
    this.blacklistList = document.getElementById("adminBlacklistList") || null;
    this.addBlacklistButton = document.getElementById("adminAddBlacklistBtn") || null;
    this.blacklistInput = document.getElementById("adminBlacklistInput") || null;
    this.adminBlacklistRefreshBtn = document.getElementById("adminBlacklistRefreshBtn") || null;
  }

  registerEventListeners() {
    const ensureAriaLabel = (button, label) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", label);
      }
    };

    ensureAriaLabel(this.adminModeratorsRefreshBtn, "Refresh moderators");
    ensureAriaLabel(this.adminWhitelistRefreshBtn, "Refresh whitelist");
    ensureAriaLabel(this.adminBlacklistRefreshBtn, "Refresh blacklist");

    if (this.addModeratorButton instanceof HTMLElement) {
      this.addModeratorButton.addEventListener("click", () => {
        void this.handleAddModerator();
      });
    }

    if (this.adminModeratorsRefreshBtn instanceof HTMLElement) {
      this.adminModeratorsRefreshBtn.addEventListener("click", () => {
        const service = this.mainController.services.accessControl;
        if (!service || typeof service.refresh !== "function") {
          return;
        }
        void service
          .refresh()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh moderators:", error);
          });
      });
    }

    if (this.moderatorInput instanceof HTMLElement) {
      this.moderatorInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddModerator();
        }
      });
    }

    if (this.addWhitelistButton instanceof HTMLElement) {
      this.addWhitelistButton.addEventListener("click", () => {
        void this.handleAdminListMutation("whitelist", "add");
      });
    }

    if (this.adminWhitelistRefreshBtn instanceof HTMLElement) {
      this.adminWhitelistRefreshBtn.addEventListener("click", () => {
        const service = this.mainController.services.accessControl;
        if (!service || typeof service.refresh !== "function") {
          return;
        }
        void service
          .refresh()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh whitelist:", error);
          });
      });
    }

    if (this.whitelistInput instanceof HTMLElement) {
      this.whitelistInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAdminListMutation("whitelist", "add");
        }
      });
    }

    if (this.addBlacklistButton instanceof HTMLElement) {
      this.addBlacklistButton.addEventListener("click", () => {
        void this.handleAdminListMutation("blacklist", "add");
      });
    }

    if (this.adminBlacklistRefreshBtn instanceof HTMLElement) {
      this.adminBlacklistRefreshBtn.addEventListener("click", () => {
        const service = this.mainController.services.accessControl;
        if (!service || typeof service.refresh !== "function") {
          return;
        }
        void service
          .refresh()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh blacklist:", error);
          });
      });
    }

    if (this.blacklistInput instanceof HTMLElement) {
      this.blacklistInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAdminListMutation("blacklist", "add");
        }
      });
    }
  }

  populateAdminLists() {
    const actorNpub = this.mainController.services.getCurrentUserNpub();
    if (!actorNpub || !this.mainController.services.accessControl.canEditAdminLists(actorNpub)) {
      this.renderer.clearAdminLists(this);
      return;
    }

    const isSuperAdmin = this.mainController.services.accessControl.isSuperAdmin(actorNpub);
    const editors = this.renderer.normalizeAdminListEntries(
      this.mainController.services.accessControl.getEditors(),
    ).filter((npub) => npub && npub !== this.mainController.adminSuperNpub);
    const whitelist = this.renderer.normalizeAdminListEntries(
      this.mainController.services.accessControl.getWhitelist(),
    );
    const blacklist = this.renderer.normalizeAdminListEntries(
      this.mainController.services.accessControl.getBlacklist(),
    );
    const normalizeForCompare = (value) =>
      this.renderer.normalizeNpubValue(value) ||
      (typeof value === "string" ? value.trim() : "");
    const whitelistCompare = new Set(
      whitelist.map(normalizeForCompare).filter(Boolean),
    );
    const blacklistCompare = new Set(
      blacklist.map(normalizeForCompare).filter(Boolean),
    );

    this.renderer.renderAdminList(
      this.adminModeratorList,
      this.moderatorEmpty,
      editors,
      {
        onRemove: (npub, button) => this.handleRemoveModerator(npub, button),
        removeLabel: "Remove",
        confirmMessage:
          "Remove moderator {npub}? They will immediately lose access to the admin panel.",
        removable: isSuperAdmin,
      },
    );

    this.renderer.renderAdminList(
      this.whitelistList,
      this.whitelistEmpty,
      whitelist,
      {
        onRemove: (npub, button) =>
          this.handleAdminListMutation("whitelist", "remove", npub, button),
        removeLabel: "Remove",
        confirmMessage: "Remove {npub} from the whitelist?",
        removable: true,
        overlapSet: blacklistCompare,
        overlapLabel: "Also blacklisted",
      },
    );

    this.renderer.renderAdminList(
      this.blacklistList,
      this.blacklistEmpty,
      blacklist,
      {
        onRemove: (npub, button) =>
          this.handleAdminListMutation("blacklist", "remove", npub, button),
        removeLabel: "Unblock",
        confirmMessage: "Remove {npub} from the blacklist?",
        removable: true,
        overlapSet: whitelistCompare,
        overlapLabel: "Also whitelisted",
      },
    );
  }

  async refreshAdminPaneState() {
    const adminNav = this.mainController.navButtons.admin;
    const adminPane = this.mainController.panes.admin;

    let loadError = null;
    this.renderer.setAdminLoading(this, true);
    this.mainController.showStatus("Fetching moderation filters…");
    try {
      const ensureResult = await this.runAdminMutation({
        action: "ensure-ready",
      });
      if (ensureResult?.error && ensureResult.ok === false) {
        loadError = ensureResult.error;
      }
    } catch (error) {
      loadError = error;
    }

    const actorNpub = this.mainController.services.getCurrentUserNpub();
    const canEdit =
      !!actorNpub && this.mainController.services.accessControl.canEditAdminLists(actorNpub);
    const isSuperAdmin =
      !!actorNpub && this.mainController.services.accessControl.isSuperAdmin(actorNpub);

    if (adminNav instanceof HTMLElement) {
      adminNav.classList.toggle("hidden", !canEdit);
      if (!canEdit) {
        adminNav.setAttribute("aria-selected", "false");
      }
    }

    if (adminPane instanceof HTMLElement) {
      if (!canEdit) {
        adminPane.classList.add("hidden");
        adminPane.setAttribute("aria-hidden", "true");
      } else {
        const isActive = this.mainController.getActivePane() === "admin";
        adminPane.classList.toggle("hidden", !isActive);
        adminPane.setAttribute("aria-hidden", (!isActive).toString());
      }
    }

    if (loadError) {
      if (loadError?.code === "nostr-unavailable") {
        devLogger.info("Moderation lists are still syncing with relays.");
        return;
      }

      userLogger.error("Failed to load admin lists:", loadError);
      this.mainController.showStatus(null);
      this.mainController.showError("Unable to load moderation lists. Please try again.");
      this.renderer.clearAdminLists(this);
      this.renderer.setAdminLoading(this, false);
      return;
    }

    if (!canEdit) {
      this.renderer.clearAdminLists(this);
      this.mainController.showStatus(null);
      this.renderer.setAdminLoading(this, false);
      if (
        adminNav instanceof HTMLElement &&
        adminNav.dataset.state === "active"
      ) {
        this.mainController.selectPane("account");
      }
      return;
    }

    if (this.moderatorSection instanceof HTMLElement) {
      this.moderatorSection.classList.toggle("hidden", !isSuperAdmin);
      this.moderatorSection.setAttribute(
        "aria-hidden",
        (!isSuperAdmin).toString(),
      );
    }
    this.populateAdminLists();
    this.mainController.showStatus(null);
    this.renderer.setAdminLoading(this, false);
  }

  ensureAdminActor(requireSuperAdmin = false) {
    const actorNpub = this.mainController.services.getCurrentUserNpub();
    if (!actorNpub) {
      this.mainController.showError("Please login with a Nostr account to manage admin settings.");
      return null;
    }
    if (!this.mainController.services.accessControl.canEditAdminLists(actorNpub)) {
      this.mainController.showError("You do not have permission to manage bitvid moderation lists.");
      return null;
    }
    if (requireSuperAdmin && !this.mainController.services.accessControl.isSuperAdmin(actorNpub)) {
      this.mainController.showError("Only the Super Admin can manage moderators or whitelist mode.");
      return null;
    }
    return actorNpub;
  }

  async handleAddModerator() {
    const input = this.moderatorInput || null;
    const rawValue = typeof input?.value === "string" ? input.value : "";
    const trimmed = rawValue.trim();
    const normalizedValue = this.renderer.normalizeNpubValue(trimmed);
    const context = {
      input,
      rawValue,
      value: trimmed,
      normalizedValue,
      actorNpub: null,
      success: false,
      reason: null,
      error: null,
      result: null,
    };

    let preloadError = null;
    try {
      const ensureResult = await this.runAdminMutation({ action: "ensure-ready" });
      if (ensureResult?.error && ensureResult.ok === false) {
        preloadError = ensureResult.error;
      }
    } catch (error) {
      preloadError = error;
      userLogger.error("Failed to load admin lists before adding moderator:", error);
    }

    if (preloadError) {
      this.mainController.showError(this.describeAdminError(preloadError.code || "storage-error"));
      context.reason = preloadError.code || "storage-error";
      context.error = preloadError;
      this.mainController.callbacks.onAdminAddModerator(context, this.mainController);
      return context;
    }

    const actorNpub = this.ensureAdminActor(true);
    context.actorNpub = actorNpub;
    if (!actorNpub || !input) {
      context.reason = actorNpub ? "missing-input" : "unauthorized";
      this.mainController.callbacks.onAdminAddModerator(context, this.mainController);
      return context;
    }

    if (!trimmed) {
      this.mainController.showError("Enter an npub to add as a moderator.");
      context.reason = "empty";
      this.mainController.callbacks.onAdminAddModerator(context, this.mainController);
      return context;
    }

    if (!normalizedValue) {
      this.mainController.showError("Enter a valid npub before adding it as a moderator.");
      context.reason = "invalid";
      this.mainController.callbacks.onAdminAddModerator(context, this.mainController);
      return context;
    }

    if (this.addModeratorButton) {
      this.addModeratorButton.disabled = true;
      this.addModeratorButton.setAttribute("aria-busy", "true");
    }

    try {
      const mutationResult = await this.runAdminMutation({
        action: "add-moderator",
        actorNpub,
        targetNpub: normalizedValue,
      });
      context.result = mutationResult?.result || null;
      if (!mutationResult?.ok) {
        const errorCode = mutationResult?.result?.error || mutationResult?.error?.code;
        this.mainController.showError(this.describeAdminError(errorCode || "service-error"));
        context.reason = errorCode || "service-error";
        context.error = mutationResult?.error || mutationResult?.result || null;
        return context;
      }

      this.moderatorInput.value = "";
      this.mainController.showSuccess("Moderator added successfully.");
      await this.mainController.services.onAccessControlUpdated();
      context.success = true;
      context.reason = "added";
    } finally {
      if (this.addModeratorButton) {
        this.addModeratorButton.disabled = false;
        this.addModeratorButton.removeAttribute("aria-busy");
      }
      this.mainController.callbacks.onAdminAddModerator(context, this.mainController);
    }

    return context;
  }

  async handleRemoveModerator(npub, button) {
    const context = {
      npub,
      normalizedNpub: this.renderer.normalizeNpubValue(npub),
      button,
      actorNpub: null,
      success: false,
      reason: null,
      error: null,
      result: null,
    };

    const releaseButton = () => {
      if (button instanceof HTMLElement) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    };

    if (!context.normalizedNpub) {
      this.mainController.showError("Unable to remove moderator: invalid npub.");
      context.reason = "invalid";
      releaseButton();
      this.mainController.callbacks.onAdminRemoveModerator(context, this.mainController);
      return context;
    }

    let preloadError = null;
    try {
      const ensureResult = await this.runAdminMutation({ action: "ensure-ready" });
      if (ensureResult?.error && ensureResult.ok === false) {
        preloadError = ensureResult.error;
      }
    } catch (error) {
      preloadError = error;
      userLogger.error("Failed to load admin lists before removing moderator:", error);
    }

    if (preloadError) {
      this.mainController.showError(this.describeAdminError(preloadError.code || "storage-error"));
      context.reason = preloadError.code || "storage-error";
      context.error = preloadError;
      releaseButton();
      this.mainController.callbacks.onAdminRemoveModerator(context, this.mainController);
      return context;
    }

    const actorNpub = this.ensureAdminActor(true);
    context.actorNpub = actorNpub;
    if (!actorNpub) {
      context.reason = "unauthorized";
      releaseButton();
      this.mainController.callbacks.onAdminRemoveModerator(context, this.mainController);
      return context;
    }

    const mutationResult = await this.runAdminMutation({
      action: "remove-moderator",
      actorNpub,
      targetNpub: context.normalizedNpub,
    });
    context.result = mutationResult?.result || null;
    if (!mutationResult?.ok) {
      const errorCode = mutationResult?.result?.error || mutationResult?.error?.code;
      this.mainController.showError(this.describeAdminError(errorCode || "service-error"));
      context.reason = errorCode || "service-error";
      context.error = mutationResult?.error || mutationResult?.result || null;
      releaseButton();
      this.mainController.callbacks.onAdminRemoveModerator(context, this.mainController);
      return context;
    }

    this.mainController.showSuccess("Moderator removed.");
    await this.mainController.services.onAccessControlUpdated();
    context.success = true;
    context.reason = "removed";

    releaseButton();
    this.mainController.callbacks.onAdminRemoveModerator(context, this.mainController);
    return context;
  }

  async handleAdminListMutation(listType, action, explicitNpub = null, sourceButton = null) {
    const isWhitelist = listType === "whitelist";
    const input = isWhitelist ? this.whitelistInput : this.blacklistInput;
    const addButton = isWhitelist ? this.addWhitelistButton : this.addBlacklistButton;
    const isAdd = action === "add";
    let buttonToToggle = sourceButton || (isAdd ? addButton : null);

    const context = {
      listType,
      action,
      explicitNpub,
      sourceButton,
      actorNpub: null,
      targetNpub: null,
      success: false,
      reason: null,
      error: null,
      result: null,
      notificationResult: null,
      notificationError: null,
    };

    const callbackMap = {
      whitelist: {
        add: this.mainController.callbacks.onAdminAddWhitelist,
        remove: this.mainController.callbacks.onAdminRemoveWhitelist,
      },
      blacklist: {
        add: this.mainController.callbacks.onAdminAddBlacklist,
        remove: this.mainController.callbacks.onAdminRemoveBlacklist,
      },
    };

    const adminCallback = callbackMap[listType]?.[action] || noop;

    const setBusy = (element, busy) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      element.disabled = !!busy;
      if (busy) {
        element.setAttribute("aria-busy", "true");
      } else {
        element.removeAttribute("aria-busy");
      }
    };

    const finalize = () => {
      setBusy(buttonToToggle, false);
      adminCallback(context, this.mainController);
    };

    let preloadError = null;
    try {
      const ensureResult = await this.runAdminMutation({ action: "ensure-ready" });
      if (ensureResult?.error && ensureResult.ok === false) {
        preloadError = ensureResult.error;
      }
    } catch (error) {
      preloadError = error;
      userLogger.error("Failed to load admin lists before updating entries:", error);
    }

    if (preloadError) {
      this.mainController.showError(this.describeAdminError(preloadError.code || "storage-error"));
      context.reason = preloadError.code || "storage-error";
      context.error = preloadError;
      finalize();
      return context;
    }

    const actorNpub = this.ensureAdminActor(false);
    context.actorNpub = actorNpub;
    if (!actorNpub) {
      context.reason = "unauthorized";
      finalize();
      return context;
    }

    let target = typeof explicitNpub === "string" ? explicitNpub.trim() : "";
    if (!target && input instanceof HTMLInputElement) {
      target = input.value.trim();
    }
    context.targetNpub = target;

    if (isAdd && !target) {
      this.mainController.showError("Enter an npub before adding it to the list.");
      context.reason = "empty";
      finalize();
      return context;
    }

    buttonToToggle = buttonToToggle || (isAdd ? addButton : null);
    setBusy(buttonToToggle, true);

    const mutationResult = await this.runAdminMutation({
      action: "list-mutation",
      listType,
      mode: action,
      actorNpub,
      targetNpub: target,
    });

    context.result = mutationResult?.result || null;

    if (!mutationResult?.ok) {
      const errorCode = mutationResult?.result?.error || mutationResult?.error?.code;
      this.mainController.showError(this.describeAdminError(errorCode || "service-error"));
      context.reason = errorCode || "service-error";
      context.error = mutationResult?.error || mutationResult?.result || null;
      finalize();
      return context;
    }

    if (isAdd && input instanceof HTMLInputElement) {
      input.value = "";
    }

    const successMessage = isWhitelist
      ? isAdd
        ? "Added to the whitelist."
        : "Removed from the whitelist."
      : isAdd
      ? "Added to the blacklist."
      : "Removed from the blacklist.";
    this.mainController.showSuccess(successMessage);
    await this.mainController.services.onAccessControlUpdated();

    context.success = true;
    context.reason = isAdd ? "added" : "removed";

    if (isAdd) {
      try {
        const notifyResult = await this.sendAdminListNotification({
          listType,
          actorNpub,
          targetNpub: target,
        });
        context.notificationResult = notifyResult;
        if (!notifyResult?.ok) {
          const errorMessage = this.describeNotificationError(notifyResult?.error);
          if (errorMessage) {
            this.mainController.showError(errorMessage);
          }
          if (isDevMode && notifyResult?.error) {
            userLogger.warn(
              "[admin] Failed to send list notification DM:",
              notifyResult,
            );
          }
          this.notifyAdminError({
            listType,
            action,
            actorNpub,
            targetNpub: target,
            error: notifyResult?.error || null,
            result: notifyResult,
          });
        }
      } catch (error) {
        context.notificationError = error;
        userLogger.error("Failed to send list notification DM:", error);
        devLogger.warn(
          "List update succeeded, but DM notification threw an unexpected error.",
          error,
        );
        this.notifyAdminError({
          listType,
          action,
          actorNpub,
          targetNpub: target,
          error,
        });
      }
    }

    finalize();
    return context;
  }

  async runAdminMutation(payload = {}) {
    const callback = this.mainController.callbacks.onAdminMutation;
    if (callback && callback !== noop) {
      const result = await callback({ ...payload, controller: this.mainController });
      if (result !== undefined) {
        return result;
      }
    }

    const action = payload?.action;
    const resultContext = { ok: false, error: null, result: null };

    try {
      switch (action) {
        case "ensure-ready":
          await this.mainController.services.accessControl.ensureReady();
          resultContext.ok = true;
          break;
        case "add-moderator":
          resultContext.result = await this.mainController.services.accessControl.addModerator(
            payload.actorNpub,
            payload.targetNpub,
          );
          resultContext.ok = !!resultContext.result?.ok;
          break;
        case "remove-moderator":
          resultContext.result =
            await this.mainController.services.accessControl.removeModerator(
              payload.actorNpub,
              payload.targetNpub,
            );
          resultContext.ok = !!resultContext.result?.ok;
          break;
        case "list-mutation":
          if (payload.listType === "whitelist") {
            resultContext.result = payload.mode === "add"
              ? await this.mainController.services.accessControl.addToWhitelist(
                  payload.actorNpub,
                  payload.targetNpub,
                )
              : await this.mainController.services.accessControl.removeFromWhitelist(
                  payload.actorNpub,
                  payload.targetNpub,
                );
          } else {
            resultContext.result = payload.mode === "add"
              ? await this.mainController.services.accessControl.addToBlacklist(
                  payload.actorNpub,
                  payload.targetNpub,
                )
              : await this.mainController.services.accessControl.removeFromBlacklist(
                  payload.actorNpub,
                  payload.targetNpub,
                );
          }
          resultContext.ok = !!resultContext.result?.ok;
          break;
        default:
          resultContext.error = Object.assign(
            new Error("Unknown admin mutation."),
            { code: "invalid-action" },
          );
      }
    } catch (error) {
      resultContext.error = error;
      return resultContext;
    }

    return resultContext;
  }

  notifyAdminError(payload = {}) {
    const callback = this.mainController.callbacks.onAdminNotifyError;
    if (callback && callback !== noop) {
      callback({ ...payload, controller: this.mainController });
    }
  }

  describeAdminError(code) {
    if (typeof this.mainController.describeAdminErrorService === "function") {
      const result = this.mainController.describeAdminErrorService(code);
      if (typeof result === "string" && result) {
        return result;
      }
    }

    switch (code) {
      case "invalid npub":
        return "Please provide a valid npub address.";
      case "immutable":
        return "That account cannot be modified.";
      case "self":
        return "You cannot blacklist yourself.";
      case "forbidden":
        return "You do not have permission to perform that action.";
      case "nostr-unavailable":
        return "Unable to reach the configured Nostr relays. Please retry once your connection is restored.";
      case "nostr-extension-missing":
        return "Connect a Nostr extension before editing moderation lists.";
      case "signature-failed":
        return "We couldn’t sign the update with your Nostr key. Please reconnect your extension and try again.";
      case "publish-failed":
        return "Failed to publish the update to Nostr relays. Please try again.";
      case "storage-error":
        return "Unable to update moderation settings. Please try again.";
      default:
        return "Unable to update moderation settings. Please try again.";
    }
  }

  describeNotificationError(code) {
    if (typeof this.mainController.describeNotificationErrorService === "function") {
      const result = this.mainController.describeNotificationErrorService(code);
      if (typeof result === "string") {
        return result;
      }
    }

    switch (code) {
      case "nostr-extension-missing":
        return "List updated, but the DM notification failed because no Nostr extension is connected.";
      case "nostr-uninitialized":
        return "List updated, but the DM notification system is still connecting to Nostr relays. Please try again in a moment.";
      case "nip04-unavailable":
        return "List updated, but your Nostr extension does not support NIP-04 encryption, so the DM notification was not sent.";
      case "sign-event-unavailable":
        return "List updated, but your Nostr extension could not sign the DM notification.";
      case "missing-actor-pubkey":
        return "List updated, but we could not determine your public key to send the DM notification.";
      case "publish-failed":
        return "List updated, but the DM notification could not be delivered to any relay.";
      case "encryption-failed":
      case "signature-failed":
        return "List updated, but the DM notification failed while preparing the encrypted message.";
      case "invalid-target":
      case "empty-message":
        return "";
      default:
        return "List updated, but the DM notification could not be sent.";
    }
  }

  async sendAdminListNotification({ listType, actorNpub, targetNpub }) {
    if (typeof this.mainController.sendAdminListNotificationService === "function") {
      return this.mainController.sendAdminListNotificationService({ listType, actorNpub, targetNpub });
    }

    const normalizedTarget = this.renderer.normalizeNpubValue(targetNpub);
    if (!normalizedTarget) {
      return { ok: false, error: "invalid-target" };
    }

    const activeHex = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!activeHex) {
      return { ok: false, error: "missing-actor-pubkey" };
    }

    const fallbackActor = this.mainController.safeEncodeNpub(activeHex) || "a bitvid moderator";
    const actorDisplay = this.renderer.normalizeNpubValue(actorNpub) || fallbackActor;
    const isWhitelist = listType === "whitelist";

    const formatNpub =
      typeof this.mainController.formatShortNpub === "function"
        ? (value) => this.mainController.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");
    const displayTarget = formatNpub(normalizedTarget) || normalizedTarget;
    const displayActor = formatNpub(actorDisplay) || actorDisplay;

    const introLine = isWhitelist
      ? `Great news—your npub ${displayTarget} has been added to the bitvid whitelist by ${displayActor}.`
      : `We wanted to let you know that your npub ${displayTarget} has been placed on the bitvid blacklist by ${displayActor}.`;

    const statusLine = isWhitelist
      ? `You now have full creator access across bitvid (${this.mainController.bitvidWebsiteUrl}).`
      : `This hides your channel and prevents uploads across bitvid (${this.mainController.bitvidWebsiteUrl}) for now.`;

    const followUpLine = isWhitelist
      ? "Please take a moment to review our community guidelines (https://bitvid.network/#view=community-guidelines), and reply to this DM if you have any questions."
      : "Please review our community guidelines (https://bitvid.network/#view=community-guidelines). If you believe this was a mistake, you can submit an appeal at https://bitvid.network/?modal=appeals to request reinstatement, or reply to this DM with any questions.";

    const messageBody = [
      "Hi there,",
      "",
      introLine,
      "",
      statusLine,
      "",
      followUpLine,
      "",
      "— the bitvid team",
    ].join("\n");

    const message = `![bitvid status update](${this.mainController.adminDmImageUrl})\n\n${messageBody}`;

    return this.mainController.services.nostrClient.sendDirectMessage(
      normalizedTarget,
      message,
      activeHex,
    );
  }
}
