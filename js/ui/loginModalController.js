import { devLogger, userLogger } from "../utils/logger.js";

const noop = () => {};
const SLOW_PROVIDER_DELAY_MS = 8_000;

function toArray(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (typeof input === "object") {
    return Object.values(input);
  }

  return [];
}

function normalizeProvider(provider, fallbackId, index) {
  if (!provider || typeof provider !== "object") {
    return null;
  }

  if (typeof provider.login !== "function") {
    return null;
  }

  const rawId =
    typeof provider.id === "string" && provider.id.trim()
      ? provider.id.trim()
      : typeof fallbackId === "string" && fallbackId
      ? `${fallbackId}-${index}`
      : `provider-${index}`;

  const label =
    typeof provider.label === "string" && provider.label.trim()
      ? provider.label.trim()
      : rawId;

  const description =
    typeof provider.description === "string" && provider.description.trim()
      ? provider.description.trim()
      : "";

  const button = provider.button && typeof provider.button === "object"
    ? provider.button
    : {};

  const messages = provider.messages && typeof provider.messages === "object"
    ? provider.messages
    : {};

  const capabilities = Array.isArray(provider.capabilities)
    ? provider.capabilities.filter((capability) =>
        capability && typeof capability === "object" && capability.label,
      )
    : [];

  const orderValue = Number.parseInt(provider.order, 10);
  const order = Number.isFinite(orderValue) ? orderValue : Number.MAX_SAFE_INTEGER;

  return {
    id: rawId,
    source: provider,
    label,
    description,
    button,
    messages,
    capabilities,
    order,
    disabled: provider.disabled === true || provider.available === false,
    errorMessage:
      typeof provider.errorMessage === "string" && provider.errorMessage.trim()
        ? provider.errorMessage.trim()
        : typeof messages.error === "string" && messages.error.trim()
        ? messages.error.trim()
        : "Failed to login. Please try again.",
  };
}

function sortProviders(providers) {
  return providers.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.label.localeCompare(b.label);
  });
}

function safeInvoke(callback, payload) {
  if (typeof callback !== "function") {
    return undefined;
  }

  try {
    return callback(payload);
  } catch (error) {
    devLogger.warn("[LoginModalController] Callback threw:", error);
    return undefined;
  }
}

async function safeInvokeAsync(callback, payload) {
  if (typeof callback !== "function") {
    return;
  }

  try {
    await callback(payload);
  } catch (error) {
    devLogger.warn("[LoginModalController] Async callback threw:", error);
  }
}

function resolveDocument(candidate) {
  if (candidate && typeof candidate === "object" && candidate.nodeType === 9) {
    return candidate;
  }

  if (typeof document !== "undefined" && document?.nodeType === 9) {
    return document;
  }

  return null;
}

function resolveWindow(doc) {
  if (doc && typeof doc.defaultView !== "undefined") {
    return doc.defaultView;
  }

  if (typeof window !== "undefined") {
    return window;
  }

  return null;
}

function resolveButtonVariantClasses(variant, className) {
  const classes = new Set(["w-full", "text-left"]);

  if (typeof className === "string" && className.trim()) {
    className
      .trim()
      .split(/\s+/)
      .forEach((token) => {
        if (token) {
          classes.add(token);
        }
      });
  }

  switch (variant) {
    case "ghost":
      classes.add("btn-ghost");
      break;
    case "outline":
      classes.add("btn-outline");
      break;
    case "link":
      classes.add("btn-link");
      break;
    default:
      classes.add("btn");
      break;
  }

  return Array.from(classes).join(" ");
}

export default class LoginModalController {
  constructor({
    modalElement,
    providers,
    services = {},
    callbacks = {},
    helpers = {},
    document: providedDocument,
  } = {}) {
    this.modalElement =
      modalElement instanceof HTMLElement ? modalElement : null;
    this.document =
      resolveDocument(providedDocument || this.modalElement?.ownerDocument) || null;
    this.window = resolveWindow(this.document);

    const normalizedProviders = sortProviders(
      toArray(providers).reduce((accumulator, provider, index) => {
        const normalized = normalizeProvider(provider, "provider", index);
        if (normalized) {
          accumulator.push(normalized);
        }
        return accumulator;
      }, []),
    );

    this.providers = normalizedProviders;
    this.services = {
      authService:
        services.authService && typeof services.authService === "object"
          ? services.authService
          : null,
    };

    this.callbacks = {
      onProviderSelected:
        typeof callbacks.onProviderSelected === "function"
          ? callbacks.onProviderSelected
          : noop,
      onLoginSuccess:
        typeof callbacks.onLoginSuccess === "function"
          ? callbacks.onLoginSuccess
          : null,
      onLoginError:
        typeof callbacks.onLoginError === "function"
          ? callbacks.onLoginError
          : null,
    };

    this.helpers = {
      closeModal:
        typeof helpers.closeModal === "function" ? helpers.closeModal : noop,
      describeLoginError:
        typeof helpers.describeLoginError === "function"
          ? helpers.describeLoginError
          : (_, fallbackMessage) => fallbackMessage,
    };

    this.providerContainer = null;
    this.modalBody =
      this.modalElement?.querySelector(".modal-body") || null;
    this.nsecTemplate =
      this.modalElement?.querySelector("template[data-login-nsec-dialog]") || null;
    this.template = null;
    this.providerEntries = new Map();
    this.slowTimers = new Map();
    this.boundClickHandler = (event) => this.handleContainerClick(event);
    this.activeNsecForm = null;
    this.initialized = false;

    this.initialize();
  }

  initialize() {
    if (!this.modalElement) {
      devLogger.warn("[LoginModalController] Modal element was not provided.");
      return;
    }

    const container = this.modalElement.querySelector("[data-login-providers]");
    if (!(container instanceof HTMLElement)) {
      devLogger.warn("[LoginModalController] Provider container not found.");
      return;
    }

    this.providerContainer = container;
    this.template = this.resolveTemplate();

    this.renderProviders();

    this.providerContainer.addEventListener("click", this.boundClickHandler);
    this.initialized = true;
  }

  getNostrClient() {
    const service = this.services?.authService;
    if (!service || typeof service !== "object") {
      return null;
    }

    return service.nostrClient || null;
  }

  getStoredNsecMetadata() {
    const nostrClient = this.getNostrClient();
    if (!nostrClient || typeof nostrClient.getStoredSessionActorMetadata !== "function") {
      return null;
    }

    try {
      return nostrClient.getStoredSessionActorMetadata();
    } catch (error) {
      devLogger.warn("[LoginModalController] Failed to inspect stored session actor:", error);
    }

    return null;
  }

  async promptForNsecOptions() {
    if (!this.modalBody || !this.nsecTemplate) {
      userLogger.warn("[LoginModalController] Direct key login is unavailable in this build.");
      return null;
    }

    if (this.activeNsecForm) {
      return null;
    }

    const fragment = this.nsecTemplate.content
      ? this.nsecTemplate.content.cloneNode(true)
      : null;
    if (!fragment) {
      return null;
    }

    const form = fragment.querySelector("[data-nsec-form]");
    if (!(form instanceof HTMLFormElement)) {
      return null;
    }

    const unlockSection = form.querySelector("[data-nsec-unlock-section]");
    const unlockRadio = form.querySelector('[data-nsec-mode="unlock"]');
    const importRadio = form.querySelector('[data-nsec-mode="import"]');
    const unlockPassphrase = form.querySelector("[data-nsec-unlock-passphrase]");
    const importFields = form.querySelector("[data-nsec-import-fields]");
    const secretField = form.querySelector("[data-nsec-secret]");
    const rememberCheckbox = form.querySelector("[data-nsec-remember]");
    const passphraseFields = form.querySelector("[data-nsec-passphrase-fields]");
    const passphraseInput = form.querySelector("[data-nsec-passphrase]");
    const passphraseConfirm = form.querySelector("[data-nsec-passphrase-confirm]");
    const cancelButton = form.querySelector("[data-nsec-cancel]");
    const errorNode = form.querySelector("[data-nsec-error]");

    const storedMetadata = this.getStoredNsecMetadata();
    const hasEncryptedStored = storedMetadata?.hasEncryptedKey === true;

    if (unlockSection instanceof HTMLElement) {
      unlockSection.classList.toggle("hidden", !hasEncryptedStored);
    }

    if (unlockRadio instanceof HTMLInputElement) {
      unlockRadio.checked = hasEncryptedStored;
    }
    if (importRadio instanceof HTMLInputElement) {
      importRadio.checked = !hasEncryptedStored;
    }

    const elementsToHide = [];
    for (const child of Array.from(this.modalBody.children)) {
      if (child instanceof HTMLElement && child !== form) {
        if (child.tagName === "TEMPLATE") {
          continue;
        }
        const wasHidden = child.classList.contains("hidden");
        if (!wasHidden) {
          child.classList.add("hidden");
        }
        elementsToHide.push({ element: child, wasHidden });
      }
    }

    this.modalBody.appendChild(form);
    this.activeNsecForm = form;

    const setError = (message) => {
      if (!(errorNode instanceof HTMLElement)) {
        return;
      }
      const normalized = typeof message === "string" ? message.trim() : "";
      if (normalized) {
        errorNode.textContent = normalized;
        errorNode.classList.remove("hidden");
      } else {
        errorNode.textContent = "";
        errorNode.classList.add("hidden");
      }
    };

    const updatePassphraseVisibility = () => {
      if (!(passphraseFields instanceof HTMLElement)) {
        return;
      }
      const shouldShow = !!(rememberCheckbox instanceof HTMLInputElement && rememberCheckbox.checked);
      passphraseFields.hidden = !shouldShow;
      if (passphraseInput instanceof HTMLInputElement) {
        passphraseInput.disabled = !shouldShow;
        passphraseInput.required = shouldShow;
        if (!shouldShow) {
          passphraseInput.value = "";
        }
      }
      if (passphraseConfirm instanceof HTMLInputElement) {
        passphraseConfirm.disabled = !shouldShow;
        passphraseConfirm.required = shouldShow;
        if (!shouldShow) {
          passphraseConfirm.value = "";
        }
      }
    };

    const updateMode = () => {
      const usingUnlock = unlockRadio instanceof HTMLInputElement && unlockRadio.checked;

      if (importFields instanceof HTMLElement) {
        importFields.classList.toggle("hidden", usingUnlock);
      }
      if (unlockPassphrase instanceof HTMLInputElement) {
        unlockPassphrase.disabled = !usingUnlock;
        unlockPassphrase.required = usingUnlock;
        if (!usingUnlock) {
          unlockPassphrase.value = "";
        }
      }
      if (secretField instanceof HTMLTextAreaElement) {
        secretField.disabled = usingUnlock;
        secretField.required = !usingUnlock;
        if (usingUnlock) {
          secretField.value = "";
        }
      }
      if (rememberCheckbox instanceof HTMLInputElement) {
        rememberCheckbox.disabled = usingUnlock;
        if (usingUnlock) {
          rememberCheckbox.checked = false;
        }
      }
      updatePassphraseVisibility();

      if (usingUnlock) {
        if (unlockPassphrase instanceof HTMLInputElement) {
          unlockPassphrase.focus();
        }
      } else if (secretField instanceof HTMLTextAreaElement) {
        secretField.focus();
      }
    };

    updatePassphraseVisibility();
    updateMode();
    setError("");

    const handleModeChange = () => {
      setError("");
      updateMode();
    };

    if (unlockRadio instanceof HTMLInputElement) {
      unlockRadio.addEventListener("change", handleModeChange);
    }
    if (importRadio instanceof HTMLInputElement) {
      importRadio.addEventListener("change", handleModeChange);
    }
    const handleRememberChange = () => {
      setError("");
      updatePassphraseVisibility();
    };
    if (rememberCheckbox instanceof HTMLInputElement) {
      rememberCheckbox.addEventListener("change", handleRememberChange);
    }

    const cleanup = () => {
      if (unlockRadio instanceof HTMLInputElement) {
        unlockRadio.removeEventListener("change", handleModeChange);
      }
      if (importRadio instanceof HTMLInputElement) {
        importRadio.removeEventListener("change", handleModeChange);
      }
      if (rememberCheckbox instanceof HTMLInputElement) {
        rememberCheckbox.removeEventListener("change", handleRememberChange);
      }

      if (form.parentElement) {
        form.parentElement.removeChild(form);
      }
      for (const entry of elementsToHide) {
        if (!(entry?.element instanceof HTMLElement)) {
          continue;
        }
        if (!entry.wasHidden) {
          entry.element.classList.remove("hidden");
        }
      }
      this.activeNsecForm = null;
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (detail) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(detail);
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        setError("");

        const usingUnlock = unlockRadio instanceof HTMLInputElement && unlockRadio.checked && hasEncryptedStored;
        if (usingUnlock) {
          if (!(unlockPassphrase instanceof HTMLInputElement) || !unlockPassphrase.value.trim()) {
            setError("Enter the passphrase to unlock your stored key.");
            if (unlockPassphrase instanceof HTMLInputElement) {
              unlockPassphrase.focus();
            }
            return;
          }

          finish({ unlockStored: true, passphrase: unlockPassphrase.value });
          return;
        }

        if (!(secretField instanceof HTMLTextAreaElement)) {
          setError("A private key is required to continue.");
          return;
        }

        const secret = secretField.value.trim();
        if (!secret) {
          setError("Paste an nsec, hex key, or mnemonic to continue.");
          secretField.focus();
          return;
        }

        const remember = rememberCheckbox instanceof HTMLInputElement && rememberCheckbox.checked;
        let passphrase = "";
        if (remember) {
          if (!(passphraseInput instanceof HTMLInputElement) || !(passphraseConfirm instanceof HTMLInputElement)) {
            setError("A passphrase is required to remember this key.");
            return;
          }

          const pass = passphraseInput.value;
          const confirm = passphraseConfirm.value;
          if (!pass || !confirm) {
            setError("Enter and confirm a passphrase to encrypt your key.");
            passphraseInput.focus();
            return;
          }
          if (pass !== confirm) {
            setError("Passphrases do not match.");
            passphraseConfirm.focus();
            return;
          }
          passphrase = pass;
        }

        finish(
          remember
            ? { secret, persist: true, passphrase }
            : { secret, persist: false }
        );
      });

      if (cancelButton instanceof HTMLButtonElement) {
        cancelButton.addEventListener("click", () => finish(null), { once: true });
      }
    });
  }

  resolveTemplate() {
    if (!this.modalElement) {
      return null;
    }

    const template = this.modalElement.querySelector(
      "template[data-login-provider-template]",
    );

    if (template instanceof HTMLTemplateElement) {
      return template;
    }

    return null;
  }

  createFragment() {
    if (this.template) {
      return this.template.content
        ? this.template.content.cloneNode(true)
        : this.document?.createDocumentFragment() || null;
    }

    if (!this.document) {
      return null;
    }

    const fragment = this.document.createDocumentFragment();
    const button = this.document.createElement("button");
    button.type = "button";
    button.className = "btn w-full text-left";
    button.dataset.providerButton = "";
    fragment.appendChild(button);
    return fragment;
  }

  renderProviders() {
    if (!this.providerContainer) {
      return;
    }

    this.providerContainer.innerHTML = "";
    this.providerEntries.clear();

    if (!this.providers.length) {
      userLogger.warn(
        "[LoginModalController] No authentication providers available to render.",
      );
      return;
    }

    for (const provider of this.providers) {
      const fragment = this.createFragment();
      if (!fragment) {
        continue;
      }

      const appended = this.appendProviderFragment(fragment, provider);
      if (!appended) {
        continue;
      }

      this.providerContainer.appendChild(appended.fragment);
      this.providerEntries.set(provider.id, appended.entry);
    }
  }

  appendProviderFragment(fragment, provider) {
    const button = fragment.querySelector("[data-provider-button]");
    if (!(button instanceof HTMLButtonElement)) {
      devLogger.warn(
        `[LoginModalController] Provider template missing button for ${provider.id}.`,
      );
      return null;
    }

    button.type = "button";
    button.dataset.providerId = provider.id;
    button.className = resolveButtonVariantClasses(
      provider.button?.variant,
      provider.button?.className,
    );
    button.disabled = provider.disabled;
    if (provider.disabled) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }

    const labelNode = button.querySelector("[data-provider-label]");
    if (labelNode instanceof HTMLElement) {
      labelNode.textContent = provider.label;
    } else {
      button.textContent = provider.label;
    }

    const descriptionNode = button.querySelector("[data-provider-description]");
    if (descriptionNode instanceof HTMLElement) {
      descriptionNode.textContent = provider.description;
      descriptionNode.classList.toggle("hidden", !provider.description);
    }

    const statusNode = button.querySelector("[data-provider-status]");
    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = "";
      statusNode.classList.add("hidden");
    }

    const capabilitiesNode = button.querySelector(
      "[data-provider-capabilities]",
    );
    if (capabilitiesNode instanceof HTMLElement) {
      capabilitiesNode.innerHTML = "";
      if (provider.capabilities.length) {
        capabilitiesNode.classList.remove("hidden");
        for (const capability of provider.capabilities) {
          const badgeLabel =
            typeof capability.label === "string" && capability.label.trim()
              ? capability.label.trim()
              : "";
          if (!badgeLabel) {
            continue;
          }
          const badge = this.document?.createElement("span");
          if (!badge) {
            continue;
          }
          badge.className = "badge";
          if (
            capability.variant &&
            typeof capability.variant === "string" &&
            capability.variant.trim()
          ) {
            badge.dataset.variant = capability.variant.trim();
          }
          badge.textContent = badgeLabel;
          capabilitiesNode.appendChild(badge);
        }
      } else {
        capabilitiesNode.classList.add("hidden");
      }
    }

    return {
      fragment,
      entry: {
        provider,
        button,
        descriptionNode: descriptionNode instanceof HTMLElement ? descriptionNode : null,
        statusNode: statusNode instanceof HTMLElement ? statusNode : null,
        defaultDescription: provider.description,
      },
    };
  }

  handleContainerClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("[data-provider-button]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const providerId = button.dataset.providerId;
    if (!providerId) {
      return;
    }

    this.handleProviderSelection(providerId);
  }

  getProviderEntry(providerId) {
    return this.providerEntries.get(providerId) || null;
  }

  setLoadingState(providerId, isLoading) {
    const entry = this.getProviderEntry(providerId);
    if (!entry) {
      return;
    }

    if (isLoading) {
      entry.button.disabled = true;
      entry.button.dataset.state = "loading";
      entry.button.setAttribute("aria-busy", "true");

      this.updateStatusMessage(
        entry,
        entry.provider.messages.loading || "Connecting…",
      );
      this.startSlowTimer(providerId, entry);
    } else {
      const shouldRemainDisabled = entry.provider.disabled === true;
      entry.button.disabled = shouldRemainDisabled;
      if (shouldRemainDisabled) {
        entry.button.setAttribute("aria-disabled", "true");
      } else {
        entry.button.removeAttribute("aria-disabled");
      }

      delete entry.button.dataset.state;
      entry.button.removeAttribute("aria-busy");
      this.stopSlowTimer(providerId);
      this.updateStatusMessage(entry, "", true);
    }
  }

  updateStatusMessage(entry, message, reset = false) {
    if (!entry) {
      return;
    }

    const normalized = typeof message === "string" ? message.trim() : "";

    if (entry.statusNode) {
      if (normalized && !reset) {
        entry.statusNode.textContent = normalized;
        entry.statusNode.classList.remove("hidden");
      } else {
        entry.statusNode.textContent = "";
        entry.statusNode.classList.add("hidden");
      }
    } else if (normalized && !reset) {
      entry.button.textContent = normalized;
    }

    if (entry.descriptionNode) {
      if (normalized && !reset) {
        entry.descriptionNode.classList.add("hidden");
      } else {
        entry.descriptionNode.textContent = entry.defaultDescription;
        entry.descriptionNode.classList.toggle(
          "hidden",
          !entry.defaultDescription,
        );
      }
    }
  }

  startSlowTimer(providerId, entry) {
    this.stopSlowTimer(providerId);

    const delay = entry.provider.messages.slowDelay;
    const timeout =
      Number.isFinite(delay) && delay > 0 ? delay : SLOW_PROVIDER_DELAY_MS;

    if (!this.window || typeof this.window.setTimeout !== "function") {
      return;
    }

    const timerId = this.window.setTimeout(() => {
      if (!entry.button.dataset.state || entry.button.dataset.state !== "loading") {
        return;
      }

      const slowMessage =
        entry.provider.messages.slow || "Waiting for the provider…";
      this.updateStatusMessage(entry, slowMessage);
    }, timeout);

    this.slowTimers.set(providerId, timerId);
  }

  stopSlowTimer(providerId) {
    const timerId = this.slowTimers.get(providerId);
    if (!timerId) {
      return;
    }

    if (this.window && typeof this.window.clearTimeout === "function") {
      this.window.clearTimeout(timerId);
    }

    this.slowTimers.delete(providerId);
  }

  async handleProviderSelection(providerId) {
    const entry = this.getProviderEntry(providerId);
    if (!entry) {
      devLogger.warn(
        `[LoginModalController] Ignoring selection for unknown provider: ${providerId}.`,
      );
      return;
    }

    if (entry.button.dataset.state === "loading") {
      devLogger.log(
        `[LoginModalController] Ignoring duplicate selection while ${providerId} is loading.`,
      );
      return;
    }

    if (!this.services.authService) {
      userLogger.error(
        "[LoginModalController] AuthService not available; cannot process login.",
      );
      return;
    }

    safeInvoke(this.callbacks.onProviderSelected, providerId);

    let providerOptions = {};
    if (entry.provider.id === "nsec") {
      try {
        const nsecOptions = await this.promptForNsecOptions();
        if (!nsecOptions) {
          devLogger.log(
            "[LoginModalController] Direct key login cancelled by the user.",
          );
          if (entry.button instanceof HTMLButtonElement) {
            entry.button.focus();
          }
          return;
        }
        providerOptions = nsecOptions;
      } catch (promptError) {
        devLogger.error(
          "[LoginModalController] Failed to collect direct key credentials:",
          promptError,
        );
        return;
      }
    }

    this.setLoadingState(providerId, true);
    devLogger.log(
      `[LoginModalController] Starting login for provider ${providerId}.`,
    );

    try {
      const result = await this.services.authService.requestLogin({
        providerId,
        ...providerOptions,
      });

      devLogger.log(
        `[LoginModalController] Login resolved for ${providerId} with pubkey:`,
        result?.pubkey,
      );

      await safeInvokeAsync(this.callbacks.onLoginSuccess, {
        provider: entry.provider.source || entry.provider,
        result,
      });

      if (result && typeof result.pubkey === "string" && result.pubkey.trim()) {
        this.helpers.closeModal();
      }
    } catch (error) {
      devLogger.error(
        `[LoginModalController] Login failed for ${providerId}:`,
        error,
      );

      const message = this.helpers.describeLoginError(
        error,
        entry.provider.errorMessage,
      );

      if (
        !message ||
        (typeof message === "string" && !message.trim())
      ) {
        devLogger.warn(
          `[LoginModalController] describeLoginError returned empty message for ${providerId}.`,
        );
      }

      await safeInvokeAsync(this.callbacks.onLoginError, {
        provider: entry.provider.source || entry.provider,
        error,
        message,
      });
    } finally {
      this.setLoadingState(providerId, false);
    }
  }

  destroy() {
    if (this.providerContainer && this.boundClickHandler) {
      this.providerContainer.removeEventListener("click", this.boundClickHandler);
    }

    for (const providerId of this.slowTimers.keys()) {
      this.stopSlowTimer(providerId);
    }

    this.providerEntries.clear();
    this.initialized = false;
  }
}
