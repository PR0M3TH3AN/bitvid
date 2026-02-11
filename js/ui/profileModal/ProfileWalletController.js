import { devLogger } from "../../utils/logger.js";
import { NWC_URI_SCHEME } from "../profileModalContract.js";

const noop = () => {};
const SECRET_PLACEHOLDER = "*****";

export class ProfileWalletController {
  constructor(mainController) {
    this.mainController = mainController;

    this.walletUriInput = null;
    this.walletDefaultZapInput = null;
    this.walletSaveButton = null;
    this.walletTestButton = null;
    this.walletDisconnectButton = null;
    this.walletStatusText = null;
    this.walletPane = null;
  }

  cacheDomReferences() {
    this.walletUriInput = document.getElementById("profileWalletUri") || null;
    this.walletDefaultZapInput = document.getElementById("profileWalletDefaultZap") || null;
    this.walletSaveButton = document.getElementById("profileWalletSave") || null;
    this.walletTestButton = document.getElementById("profileWalletTest") || null;
    this.walletDisconnectButton = document.getElementById("profileWalletDisconnect") || null;
    this.walletStatusText = document.getElementById("profileWalletStatus") || null;
    this.walletPane = document.getElementById("profilePaneWallet") || null;

    // Backwards compatibility alias if needed by tests/external code
    this.mainController.profileWalletStatusText = this.walletStatusText;
  }

  registerEventListeners() {
    if (this.walletUriInput instanceof HTMLElement) {
      this.walletUriInput.addEventListener("focus", () => {
        this.revealSecretInputValue(this.walletUriInput);
      });
      this.walletUriInput.addEventListener("blur", () => {
        this.handleSecretInputBlur(this.walletUriInput);
        this.applyWalletControlState();
      });
      this.walletUriInput.addEventListener("input", () => {
        this.handleSecretInputChange(this.walletUriInput);
        this.applyWalletControlState();
      });
    }

    if (this.walletDefaultZapInput instanceof HTMLElement) {
      this.walletDefaultZapInput.addEventListener("input", () => {
        this.applyWalletControlState();
      });
    }

    if (this.walletSaveButton instanceof HTMLElement) {
      this.walletSaveButton.addEventListener("click", () => {
        void this.handleWalletSave();
      });
    }

    if (this.walletTestButton instanceof HTMLElement) {
      this.walletTestButton.addEventListener("click", () => {
        void this.handleWalletTest();
      });
    }

    if (this.walletDisconnectButton instanceof HTMLElement) {
      this.walletDisconnectButton.addEventListener("click", () => {
        void this.handleWalletDisconnect();
      });
    }
  }

  applyWalletControlState() {
    const hasActive = Boolean(
      this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey())
    );
    const busy = this.isWalletBusy();
    const uriValue = this.getSecretInputValue(this.walletUriInput);
    const hasUri = uriValue.length > 0;

    const applyDisabledState = (element, disabled) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if ("disabled" in element) {
        element.disabled = disabled;
      }
      if (disabled) {
        element.setAttribute("aria-disabled", "true");
      } else {
        element.removeAttribute("aria-disabled");
      }
    };

    applyDisabledState(this.walletUriInput, busy || !hasActive);
    applyDisabledState(this.walletDefaultZapInput, busy || !hasActive);
    applyDisabledState(this.walletSaveButton, busy || !hasActive);

    const testDisabled = busy || !hasActive || !hasUri;
    applyDisabledState(this.walletTestButton, testDisabled);

    const disconnectDisabled = busy || !hasActive || !hasUri;
    applyDisabledState(this.walletDisconnectButton, disconnectDisabled);
    if (this.walletDisconnectButton instanceof HTMLElement) {
      this.walletDisconnectButton.classList.toggle("hidden", !hasUri);
      if (!hasUri) {
        this.walletDisconnectButton.setAttribute("aria-hidden", "true");
      } else {
        this.walletDisconnectButton.removeAttribute("aria-hidden");
      }
    }
  }

  updateWalletStatus(message, variant = "info") {
    if (!(this.walletStatusText instanceof HTMLElement)) {
      return;
    }

    const element = this.walletStatusText;
    const variants = {
      success: "text-status-success",
      error: "text-status-danger",
      info: "text-status-info",
      neutral: "text-status-neutral",
    };

    element.classList.remove(
      "text-status-info",
      "text-status-success",
      "text-status-danger",
      "text-status-neutral",
    );
    const variantClass = variants[variant] || variants.neutral;
    element.classList.add(variantClass);
    element.textContent = message || "";
  }

  refreshWalletPaneState() {
    const hasActive = Boolean(
      this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey())
    );
    if (!hasActive) {
      this.setSecretInputValue(this.walletUriInput, "");
      if (this.walletDefaultZapInput && "value" in this.walletDefaultZapInput) {
        try {
          this.walletDefaultZapInput.value = "";
        } catch (error) {
          if (this.walletDefaultZapInput instanceof HTMLElement) {
            this.walletDefaultZapInput.setAttribute("data-value", "");
          }
        }
      }
      this.updateWalletStatus("Sign in to connect a wallet.", "info");
      this.applyWalletControlState();
      return;
    }

    let settings = this.mainController.services.nwcSettings.getActiveNwcSettings();
    if (!settings || typeof settings !== "object") {
      settings = this.mainController.services.nwcSettings.createDefaultNwcSettings();
    }
    this.setSecretInputValue(this.walletUriInput, settings.nwcUri || "");
    if (this.walletDefaultZapInput && "value" in this.walletDefaultZapInput) {
      const defaultZapValue =
        settings.defaultZap === null || settings.defaultZap === undefined
          ? ""
          : String(settings.defaultZap);
      try {
        this.walletDefaultZapInput.value = defaultZapValue;
      } catch (error) {
        if (this.walletDefaultZapInput instanceof HTMLElement) {
          this.walletDefaultZapInput.setAttribute("data-value", defaultZapValue);
        }
      }
    }

    if (settings.nwcUri) {
      this.updateWalletStatus(
        "Wallet connected via Nostr Wallet Connect.",
        "success",
      );
    } else {
      this.updateWalletStatus("No wallet connected yet.", "info");
    }

    this.applyWalletControlState();
  }

  isSecretInputElement(element) {
    if (!element || typeof element !== "object") {
      return false;
    }
    if (
      typeof HTMLInputElement !== "undefined" &&
      element instanceof HTMLInputElement
    ) {
      return true;
    }
    return typeof element.value === "string";
  }

  sanitizeSecretValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  getSecretInputValue(element) {
    if (!this.isSecretInputElement(element)) {
      return "";
    }

    const placeholder =
      typeof element.dataset?.secretPlaceholder === "string"
        ? element.dataset.secretPlaceholder
        : SECRET_PLACEHOLDER;
    const stored = this.sanitizeSecretValue(
      typeof element.dataset?.secretValue === "string"
        ? element.dataset.secretValue
        : ""
    );
    const raw = this.sanitizeSecretValue(element.value);
    const isMasked = element.dataset?.secretMasked === "true";

    if (isMasked && placeholder && raw === placeholder) {
      return stored;
    }

    if (!raw && isMasked) {
      return stored;
    }

    return raw;
  }

  setSecretInputValue(element, value) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const sanitized = this.sanitizeSecretValue(value);
    if (!sanitized) {
      if (element.dataset) {
        delete element.dataset.secretValue;
        delete element.dataset.secretMasked;
        delete element.dataset.secretPlaceholder;
      }
      element.value = "";
      return;
    }

    const placeholder = SECRET_PLACEHOLDER;
    if (element.dataset) {
      element.dataset.secretValue = sanitized;
      element.dataset.secretPlaceholder = placeholder;
      element.dataset.secretMasked = "true";
    }
    element.value = placeholder;
  }

  revealSecretInputValue(element) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const stored = this.sanitizeSecretValue(
      typeof element.dataset?.secretValue === "string"
        ? element.dataset.secretValue
        : ""
    );

    if (!stored) {
      if (element.dataset) {
        delete element.dataset.secretMasked;
      }
      return;
    }

    if (element.dataset) {
      element.dataset.secretMasked = "false";
    }
    element.value = stored;
    try {
      if (typeof element.setSelectionRange === "function") {
        const length = stored.length;
        element.setSelectionRange(length, length);
      }
    } catch (error) {
      // Ignore selection errors on unsupported input types.
    }
  }

  handleSecretInputChange(element) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const value = this.sanitizeSecretValue(element.value);
    if (!value) {
      if (element.dataset) {
        element.dataset.secretMasked = "false";
        delete element.dataset.secretValue;
      }
      return;
    }

    if (element.dataset) {
      element.dataset.secretValue = value;
      element.dataset.secretMasked = "false";
      if (!element.dataset.secretPlaceholder) {
        element.dataset.secretPlaceholder = SECRET_PLACEHOLDER;
      }
    }
  }

  handleSecretInputBlur(element) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const value = this.sanitizeSecretValue(this.getSecretInputValue(element));
    if (!value) {
      if (element.dataset) {
        delete element.dataset.secretValue;
        delete element.dataset.secretMasked;
        delete element.dataset.secretPlaceholder;
      }
      element.value = "";
      return;
    }

    if (element.dataset) {
      element.dataset.secretValue = value;
      element.dataset.secretPlaceholder =
        element.dataset.secretPlaceholder || SECRET_PLACEHOLDER;
      element.dataset.secretMasked = "true";
    }
    element.value = element.dataset?.secretPlaceholder || SECRET_PLACEHOLDER;
  }

  getWalletFormValues() {
    const uri = this.getSecretInputValue(this.walletUriInput);
    const defaultZapRaw =
      typeof this.walletDefaultZapInput?.value === "string"
        ? this.walletDefaultZapInput.value.trim()
        : "";

    if (defaultZapRaw) {
      const numeric = Number(defaultZapRaw);
      if (!Number.isFinite(numeric)) {
        return { uri, error: "Default zap amount must be a number." };
      }
      const rounded = Math.round(numeric);
      if (!Number.isFinite(rounded) || rounded < 0) {
        return {
          uri,
          error: "Default zap amount must be a positive whole number.",
        };
      }
      const clamped = Math.min(this.mainController.maxWalletDefaultZap, rounded);
      return { uri, defaultZap: clamped };
    }

    return { uri, defaultZap: null };
  }

  validateWalletUri(uri, { requireValue = false } = {}) {
    const value = typeof uri === "string" ? uri.trim() : "";
    if (!value) {
      if (requireValue) {
        return {
          valid: false,
          sanitized: "",
          message: "Enter a wallet connect URI before continuing.",
        };
      }
      return { valid: true, sanitized: "" };
    }

    if (!value.toLowerCase().startsWith(NWC_URI_SCHEME)) {
      return {
        valid: false,
        sanitized: value,
        message: `Wallet URI must start with ${NWC_URI_SCHEME}.`,
      };
    }

    return { valid: true, sanitized: value };
  }

  async handleWalletSave() {
    const { uri, defaultZap, error } = this.getWalletFormValues();
    const context = {
      uri,
      defaultZap: defaultZap ?? null,
      sanitizedUri: null,
      success: false,
      reason: null,
      error: error || null,
      status: null,
      variant: null,
    };

    if (this.isWalletBusy()) {
      context.reason = "busy";
      this.mainController.callbacks.onWalletSave(context, this.mainController);
      return context;
    }

    if (error) {
      this.updateWalletStatus(error, "error");
      this.mainController.showError(error);
      context.reason = "invalid-default-zap";
      if (this.walletDefaultZapInput instanceof HTMLElement) {
        this.walletDefaultZapInput.focus();
      }
      this.mainController.callbacks.onWalletSave(context, this.mainController);
      return context;
    }

    const { valid, sanitized, message } = this.validateWalletUri(uri);
    context.sanitizedUri = sanitized;
    if (!valid) {
      this.updateWalletStatus(message, "error");
      this.mainController.showError(message);
      context.reason = "invalid-uri";
      context.error = message;
      if (this.walletUriInput instanceof HTMLElement) {
        this.walletUriInput.focus();
      }
      this.mainController.callbacks.onWalletSave(context, this.mainController);
      return context;
    }

    const normalizedActive = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!normalizedActive) {
      const loginMessage = "Sign in to save wallet settings.";
      this.updateWalletStatus(loginMessage, "error");
      this.mainController.showError(loginMessage);
      context.reason = "no-active-pubkey";
      context.error = loginMessage;
      this.mainController.callbacks.onWalletSave(context, this.mainController);
      return context;
    }

    this.setWalletPaneBusy(true);
    let finalStatus = null;
    let finalVariant = "info";
    try {
      const persistResult = await this.persistWalletSettings({
        nwcUri: sanitized,
        defaultZap,
        activePubkey: normalizedActive,
      });
      context.persistResult = persistResult || null;

      if (sanitized) {
        finalStatus = "Wallet settings saved.";
        finalVariant = "success";
        this.mainController.showSuccess("Wallet settings saved.");
        context.reason = "saved";
      } else {
        finalStatus = "Wallet connection removed.";
        finalVariant = "info";
        this.mainController.showStatus("Wallet connection removed.");
        context.reason = "cleared";
      }
      context.success = true;
    } catch (error) {
      const fallbackMessage = "Failed to save wallet settings.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      finalStatus = detail;
      finalVariant = "error";
      context.error = detail;
      context.reason = error?.code || "service-error";
      this.mainController.showError(detail);
    } finally {
      this.setWalletPaneBusy(false);
      this.refreshWalletPaneState();
      if (finalStatus) {
        this.updateWalletStatus(finalStatus, finalVariant);
      }
      context.status = finalStatus;
      context.variant = finalVariant;
      this.mainController.callbacks.onWalletSave(context, this.mainController);
    }

    return context;
  }

  async handleWalletTest() {
    const { uri, defaultZap, error } = this.getWalletFormValues();
    const context = {
      uri,
      defaultZap: defaultZap ?? null,
      sanitizedUri: null,
      success: false,
      reason: null,
      error: error || null,
      status: null,
      variant: null,
      result: null,
    };

    if (this.isWalletBusy()) {
      context.reason = "busy";
      this.mainController.callbacks.onWalletTest(context, this.mainController);
      return context.result;
    }

    if (error) {
      this.updateWalletStatus(error, "error");
      this.mainController.showError(error);
      context.reason = "invalid-default-zap";
      if (this.walletDefaultZapInput instanceof HTMLElement) {
        this.walletDefaultZapInput.focus();
      }
      this.mainController.callbacks.onWalletTest(context, this.mainController);
      return context.result;
    }

    const { valid, sanitized, message } = this.validateWalletUri(uri, {
      requireValue: true,
    });
    context.sanitizedUri = sanitized;
    if (!valid) {
      this.updateWalletStatus(message, "error");
      this.mainController.showError(message);
      context.reason = "invalid-uri";
      context.error = message;
      if (this.walletUriInput instanceof HTMLElement) {
        this.walletUriInput.focus();
      }
      this.mainController.callbacks.onWalletTest(context, this.mainController);
      return context.result;
    }

    const normalizedActive = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!normalizedActive) {
      const loginMessage = "Sign in to test your wallet connection.";
      this.updateWalletStatus(loginMessage, "error");
      this.mainController.showError(loginMessage);
      context.reason = "no-active-pubkey";
      context.error = loginMessage;
      this.mainController.callbacks.onWalletTest(context, this.mainController);
      return context.result;
    }

    this.setWalletPaneBusy(true);
    let finalStatus = null;
    let finalVariant = "info";
    try {
      const result = await this.testWalletConnection({
        nwcUri: sanitized,
        defaultZap,
        activePubkey: normalizedActive,
      });
      finalStatus = "Wallet connection confirmed.";
      finalVariant = "success";
      this.mainController.showSuccess("Wallet connection confirmed.");
      context.result = result;
      context.success = true;
      context.reason = "tested";

      let currentSettings = this.mainController.services.nwcSettings.getActiveNwcSettings();
      if (!currentSettings || typeof currentSettings !== "object") {
        currentSettings = this.mainController.services.nwcSettings.createDefaultNwcSettings();
      }
      if (currentSettings.nwcUri === sanitized) {
        await this.persistWalletSettings({
          lastChecked: Date.now(),
          activePubkey: normalizedActive,
        });
      }
    } catch (error) {
      const fallbackMessage = "Failed to reach wallet.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      finalStatus = detail;
      finalVariant = "error";
      context.error = detail;
      context.reason = error?.code || "service-error";
      this.mainController.showError(detail);
    } finally {
      this.setWalletPaneBusy(false);
      this.refreshWalletPaneState();
      if (finalStatus) {
        this.updateWalletStatus(finalStatus, finalVariant);
      }
      context.status = finalStatus;
      context.variant = finalVariant;
      this.mainController.callbacks.onWalletTest(context, this.mainController);
    }

    return context.result;
  }

  async handleWalletDisconnect() {
    const context = {
      success: false,
      reason: null,
      error: null,
      status: null,
      variant: null,
    };

    if (this.isWalletBusy()) {
      context.reason = "busy";
      this.mainController.callbacks.onWalletDisconnect(
        context,
        this.mainController
      );
      return context;
    }

    const normalizedActive = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!normalizedActive) {
      const loginMessage = "Sign in to disconnect your wallet.";
      this.updateWalletStatus(loginMessage, "error");
      this.mainController.showError(loginMessage);
      context.reason = "no-active-pubkey";
      context.error = loginMessage;
      this.mainController.callbacks.onWalletDisconnect(
        context,
        this.mainController
      );
      return context;
    }

    this.setWalletPaneBusy(true);
    let finalStatus = null;
    let finalVariant = "info";
    try {
      const disconnectResult = await this.disconnectWallet({
        activePubkey: normalizedActive,
      });
      context.result = disconnectResult || null;
      finalStatus = "Wallet disconnected.";
      this.mainController.showStatus("Wallet disconnected.");
      context.success = true;
      context.reason = "disconnected";
    } catch (error) {
      const fallbackMessage = "Failed to disconnect wallet.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      finalStatus = detail;
      finalVariant = "error";
      context.error = detail;
      context.reason = error?.code || "service-error";
      this.mainController.showError(detail);
    } finally {
      this.setWalletPaneBusy(false);
      this.refreshWalletPaneState();
      if (finalStatus) {
        this.updateWalletStatus(finalStatus, finalVariant);
      }
      context.status = finalStatus;
      context.variant = finalVariant;
      this.mainController.callbacks.onWalletDisconnect(
        context,
        this.mainController
      );
    }

    return context;
  }

  isWalletBusy() {
    return Boolean(this.mainController.state.getWalletBusy());
  }

  setWalletPaneBusy(isBusy) {
    const result = this.mainController.state.setWalletBusy(Boolean(isBusy));
    if (this.walletPane instanceof HTMLElement) {
      this.walletPane.setAttribute(
        "aria-busy",
        this.isWalletBusy() ? "true" : "false"
      );
    }
    this.applyWalletControlState();
    return result;
  }

  async persistWalletSettings({
    nwcUri,
    defaultZap,
    lastChecked,
    activePubkey,
  } = {}) {
    const callback = this.mainController.callbacks.onWalletPersist;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this.mainController,
        nwcUri,
        defaultZap,
        lastChecked,
        activePubkey,
      });
      if (result !== undefined) {
        return result;
      }
    }

    return this.mainController.services.nwcSettings.handleProfileWalletPersist({
      nwcUri,
      defaultZap,
      lastChecked,
    });
  }

  async testWalletConnection({ nwcUri, defaultZap, activePubkey } = {}) {
    const callback = this.mainController.callbacks.onWalletTestRequest;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this.mainController,
        nwcUri,
        defaultZap,
        activePubkey,
      });
      if (result !== undefined) {
        return result;
      }
    }

    return this.mainController.services.nwcSettings.ensureWallet({
      nwcUri,
      defaultZap,
    });
  }

  async disconnectWallet({ activePubkey } = {}) {
    const callback = this.mainController.callbacks.onWalletDisconnectRequest;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this.mainController,
        activePubkey,
      });
      if (result !== undefined) {
        return result;
      }
    }

    return this.mainController.services.nwcSettings.updateActiveNwcSettings(
      this.mainController.services.nwcSettings.createDefaultNwcSettings()
    );
  }
}
