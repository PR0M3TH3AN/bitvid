const DEFAULT_SLOW_EXTENSION_DELAY_MS = 8000;

const noop = () => {};

function isElement(value) {
  return value instanceof HTMLElement;
}

function toArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function getTimerHost() {
  if (typeof window !== "undefined" && window && window.setTimeout) {
    return window;
  }
  if (typeof globalThis !== "undefined" && globalThis.setTimeout) {
    return globalThis;
  }
  return {
    setTimeout: () => null,
    clearTimeout: () => {},
  };
}

export default class LoginModalController {
  constructor({
    modalElement,
    optionsContainer,
    closeButton,
    providers = [],
    authService = null,
    callbacks = {},
    slowExtensionDelayMs = DEFAULT_SLOW_EXTENSION_DELAY_MS,
  } = {}) {
    this.modalElement = isElement(modalElement) ? modalElement : null;
    this.optionsContainer = isElement(optionsContainer)
      ? optionsContainer
      : this.modalElement?.querySelector("[data-login-options]") || null;
    this.closeButton = isElement(closeButton) ? closeButton : null;
    this.authService = authService && typeof authService === "object"
      ? authService
      : null;
    this.callbacks = {
      onOpen: noop,
      onClose: noop,
      onSuccess: noop,
      onError: noop,
      ...(callbacks && typeof callbacks === "object" ? callbacks : {}),
    };
    this.providers = toArray(providers);
    this.slowExtensionDelayMs =
      Number.isFinite(slowExtensionDelayMs) && slowExtensionDelayMs >= 0
        ? slowExtensionDelayMs
        : DEFAULT_SLOW_EXTENSION_DELAY_MS;
    this.providerStates = new Map();
    this.timerHost = getTimerHost();

    this.boundCloseHandler = () => this.hide();

    if (this.closeButton) {
      this.closeButton.addEventListener("click", this.boundCloseHandler);
    }

    this.syncAriaHidden();
    this.render();
  }

  destroy() {
    if (this.closeButton && this.boundCloseHandler) {
      this.closeButton.removeEventListener("click", this.boundCloseHandler);
    }

    for (const state of this.providerStates.values()) {
      this.teardownProviderState(state);
    }
    this.providerStates.clear();
  }

  syncAriaHidden() {
    if (!this.modalElement) {
      return;
    }
    const isHidden = this.modalElement.classList.contains("hidden");
    this.modalElement.setAttribute("aria-hidden", isHidden ? "true" : "false");
  }

  setProviders(providers) {
    this.providers = toArray(providers);
    this.render();
  }

  render() {
    if (!this.optionsContainer) {
      return;
    }

    for (const state of this.providerStates.values()) {
      this.teardownProviderState(state);
    }
    this.providerStates.clear();

    this.optionsContainer.innerHTML = "";

    if (!this.providers.length) {
      const fallbackMessage = document.createElement("p");
      fallbackMessage.className = "text-sm text-gray-400";
      fallbackMessage.textContent = "No login options are available right now.";
      this.optionsContainer.appendChild(fallbackMessage);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const provider of this.providers) {
      const button = this.createProviderButton(provider);
      if (button) {
        fragment.appendChild(button);
      }
    }
    this.optionsContainer.appendChild(fragment);
  }

  createProviderButton(provider) {
    if (!provider || typeof provider.id !== "string") {
      return null;
    }

    const providerId = provider.id.trim();
    if (!providerId) {
      return null;
    }

    const ui = provider.ui && typeof provider.ui === "object" ? provider.ui : {};

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.providerId = providerId;
    button.className =
      typeof ui.buttonClass === "string" && ui.buttonClass.trim()
        ? ui.buttonClass
        : "w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors";

    const defaultLabel =
      typeof ui.buttonLabel === "string" && ui.buttonLabel.trim()
        ? ui.buttonLabel.trim()
        : provider.label || providerId;
    button.textContent = defaultLabel;
    button.dataset.loading = "false";
    button.setAttribute("aria-busy", "false");

    const disabledLabel =
      typeof ui.disabledLabel === "string" && ui.disabledLabel.trim()
        ? ui.disabledLabel.trim()
        : "";
    const isDisabled = ui.disabled === true;

    if (isDisabled) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      if (disabledLabel) {
        button.textContent = disabledLabel;
      }
    }

    const state = {
      provider,
      button,
      defaultLabel: defaultLabel,
      disabledLabel,
      isDisabled,
      loadingLabel:
        typeof ui.loadingLabel === "string" && ui.loadingLabel.trim()
          ? ui.loadingLabel.trim()
          : `Connecting to ${provider.label || providerId}...`,
      slowHint:
        typeof ui.slowHint === "string" && ui.slowHint.trim()
          ? ui.slowHint.trim()
          : "",
      slowTimer: null,
      clickHandler: null,
    };

    if (!isDisabled) {
      state.clickHandler = (event) => {
        event.preventDefault();
        this.handleProviderClick(providerId);
      };
      button.addEventListener("click", state.clickHandler);
    }

    this.providerStates.set(providerId, state);
    return button;
  }

  teardownProviderState(state) {
    if (!state) {
      return;
    }
    if (state.clickHandler && state.button) {
      state.button.removeEventListener("click", state.clickHandler);
    }
    this.clearSlowTimer(state);
  }

  invokeCallback(name, ...args) {
    const callback = this.callbacks?.[name];
    if (typeof callback !== "function") {
      return;
    }
    try {
      callback(...args);
    } catch (error) {
      console.error(`[LoginModalController] ${name} callback threw:`, error);
    }
  }

  clearSlowTimer(state) {
    if (!state || !state.slowTimer) {
      return;
    }
    this.timerHost.clearTimeout(state.slowTimer);
    state.slowTimer = null;
  }

  setLoadingState(providerId, isLoading) {
    const state = this.providerStates.get(providerId);
    if (!state || !state.button) {
      return;
    }

    const { button } = state;

    if (isLoading) {
      button.disabled = true;
      button.dataset.loading = "true";
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-disabled", "true");
      button.textContent = state.loadingLabel;
      this.clearSlowTimer(state);
      if (state.slowHint && this.slowExtensionDelayMs > 0) {
        state.slowTimer = this.timerHost.setTimeout(() => {
          if (button.dataset.loading === "true") {
            button.textContent = state.slowHint;
          }
        }, this.slowExtensionDelayMs);
      }
      return;
    }

    button.dataset.loading = "false";
    button.setAttribute("aria-busy", "false");
    this.clearSlowTimer(state);

    if (state.isDisabled) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.textContent = state.disabledLabel || state.defaultLabel;
    } else {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.textContent = state.defaultLabel;
    }
  }

  resetLoadingStates() {
    for (const providerId of this.providerStates.keys()) {
      this.setLoadingState(providerId, false);
    }
  }

  describeError(error, provider) {
    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }

    const ui = provider && typeof provider.ui === "object" ? provider.ui : {};

    if (ui && typeof ui.errorMessage === "string" && ui.errorMessage.trim()) {
      return ui.errorMessage.trim();
    }

    if (provider && typeof provider.label === "string" && provider.label) {
      return `Failed to login with ${provider.label}. Please try again.`;
    }

    return "Failed to login. Please try again.";
  }

  async handleProviderClick(providerId) {
    const provider = this.providers.find(
      (entry) => entry && entry.id === providerId,
    );

    if (!provider) {
      return;
    }

    const state = this.providerStates.get(providerId);
    if (!state || state.button.dataset.loading === "true") {
      return;
    }

    if (!this.authService || typeof this.authService.requestLogin !== "function") {
      const message = this.describeError(
        new Error("Login is not available."),
        provider,
      );
      this.invokeCallback("onError", message, { provider, error: null });
      return;
    }

    this.setLoadingState(providerId, true);

    try {
      const result = await this.authService.requestLogin({ providerId });
      this.hide();
      this.invokeCallback("onSuccess", result, { provider });
    } catch (error) {
      console.error(
        `[LoginModalController] Failed to login with provider "${providerId}":`,
        error,
      );
      const message = this.describeError(error, provider);
      this.invokeCallback("onError", message, { provider, error });
    } finally {
      this.setLoadingState(providerId, false);
    }
  }

  show() {
    if (!this.modalElement) {
      return;
    }

    this.modalElement.classList.remove("hidden");
    this.syncAriaHidden();
    this.invokeCallback("onOpen");
  }

  hide() {
    if (!this.modalElement) {
      return;
    }

    this.modalElement.classList.add("hidden");
    this.resetLoadingStates();
    this.syncAriaHidden();
    this.invokeCallback("onClose");
  }
}
