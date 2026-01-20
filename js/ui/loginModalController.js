import { devLogger, userLogger } from "../utils/logger.js";
import { renderQrCode } from "../utils/qrcode.js";

const noop = () => {};
const SLOW_PROVIDER_DELAY_MS = 8_000;
const MODAL_CLOSE_POLL_INTERVAL_MS = 200;

function createError(code, message) {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  return error;
}

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

  const eyebrow =
    typeof provider.eyebrow === "string" && provider.eyebrow.trim()
      ? provider.eyebrow.trim()
      : "";

  const description =
    typeof provider.description === "string" && provider.description.trim()
      ? provider.description.trim()
      : "";

  const rawTone =
    typeof provider.tone === "string" && provider.tone.trim()
      ? provider.tone.trim().toLowerCase()
      : "";

  const tone = rawTone ? rawTone : "";

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
    eyebrow,
    description,
    button,
    messages,
    capabilities,
    order,
    tone,
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
  const classes = new Set(["login-option"]);

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
      classes.add("login-option--ghost");
      break;
    case "outline":
      classes.add("login-option--outline");
      break;
    case "link":
      classes.add("login-option--link");
      break;
    case "primary":
    case "default":
    default:
      classes.add("login-option--primary");
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
      nostrClient:
        services.nostrClient && typeof services.nostrClient === "object"
          ? services.nostrClient
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
      openModal:
        typeof helpers.openModal === "function" ? helpers.openModal : null,
      prepareModal:
        typeof helpers.prepareModal === "function" ? helpers.prepareModal : null,
      setModalState:
        typeof helpers.setModalState === "function" ? helpers.setModalState : null,
    };

    this.providerContainer = null;
    this.modalBody =
      this.modalElement?.querySelector(".modal-body") || null;
    this.nsecTemplate =
      this.modalElement?.querySelector("template[data-login-nsec-dialog]") || null;
    this.nip46Template =
      this.modalElement?.querySelector("template[data-login-nip46-dialog]") || null;
<<<<<<< HEAD
    this.generateTemplate =
      this.modalElement?.querySelector("template[data-login-generate-dialog]") || null;
=======
>>>>>>> origin/main
    this.template = null;
    this.providerEntries = new Map();
    this.slowTimers = new Map();
    this.boundClickHandler = (event) => this.handleContainerClick(event);
    this.activeNsecForm = null;
    this.activeNip46Form = null;
<<<<<<< HEAD
    this.activeGenerateView = null;
=======
>>>>>>> origin/main
    this.pendingNip46Cleanup = null;
    this.remoteSignerUnsubscribe = null;
    this.lastRemoteSignerStatus = null;
    this.nextRequestLoginOptions = null;
    this.nextRequestLoginOptionsResolver = null;
    this.pendingTask = null;
    this.modalPrepared = false;
<<<<<<< HEAD
    // Track generated keys so we only create one keypair per modal session.
    this.generatedKeypair = null;
    // Track modal close state to reset generated keys when the modal closes.
    this.modalCloseObserver = null;
    this.modalCloseIntervalId = null;
    this.isSelectionInProgress = false;
=======
>>>>>>> origin/main

    this.initializeRemoteSignerStatus();
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
<<<<<<< HEAD
    // Start tracking modal close events to reset per-session key generation state.
    this.initializeModalCloseTracking();
=======
>>>>>>> origin/main

    if (typeof this.lastRemoteSignerStatus !== "undefined") {
      this.applyRemoteSignerStatus(this.lastRemoteSignerStatus);
    }

    this.providerContainer.addEventListener("click", this.boundClickHandler);
    this.initialized = true;
  }

<<<<<<< HEAD
  initializeModalCloseTracking() {
    const modal = this.modalElement;
    if (!(modal instanceof HTMLElement)) {
      return;
    }

    const handleClose = () => {
      if (!this.isModalOpen()) {
        // Reset generated keys once the modal is closed to allow a new keypair later.
        this.resetGeneratedKeypair();
      }
    };

    // Prefer a MutationObserver, fall back to polling if needed.
    if (typeof MutationObserver === "function") {
      if (this.modalCloseObserver) {
        return;
      }
      try {
        const observer = new MutationObserver(handleClose);
        observer.observe(modal, {
          attributes: true,
          attributeFilter: ["data-open", "class"],
        });
        this.modalCloseObserver = observer;
        return;
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to observe login modal close state:",
          error,
        );
      }
    }

    if (
      this.modalCloseIntervalId ||
      !this.window ||
      typeof this.window.setInterval !== "function"
    ) {
      return;
    }

    // Poll for modal close state as a fallback when observers are unavailable.
    this.modalCloseIntervalId = this.window.setInterval(handleClose, 500);
  }

  resetGeneratedKeypair() {
    // Clear cached keypair so the next modal session generates fresh keys.
    this.generatedKeypair = null;
  }

=======
>>>>>>> origin/main
  ensureModalPrepared() {
    if (!(this.modalElement instanceof HTMLElement)) {
      return null;
    }

    if (!this.modalPrepared && typeof this.helpers.prepareModal === "function") {
      try {
        const prepared = this.helpers.prepareModal(this.modalElement);
        if (prepared instanceof HTMLElement) {
          this.modalElement = prepared;
        }
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to prepare login modal for accessibility:",
          error,
        );
      }
    }

    this.modalPrepared = true;
<<<<<<< HEAD
    // Ensure close tracking starts after modal preparation updates the element.
    this.initializeModalCloseTracking();
=======
>>>>>>> origin/main
    return this.modalElement instanceof HTMLElement ? this.modalElement : null;
  }

  isModalOpen() {
    const modal = this.modalElement;
    if (!(modal instanceof HTMLElement)) {
      return false;
    }

    if (typeof modal.dataset?.open === "string") {
      return modal.dataset.open === "true";
    }

    const attr = modal.getAttribute("data-open");
    if (typeof attr === "string") {
      return attr === "true";
    }

    return !modal.classList.contains("hidden");
  }

  openModal({ triggerElement } = {}) {
    const modal = this.ensureModalPrepared();
    if (!(modal instanceof HTMLElement)) {
      throw this.createModalUnavailableError();
    }

    if (typeof this.helpers.openModal === "function") {
      try {
        const result = this.helpers.openModal({
          modal,
          triggerElement,
        });
        return result !== false;
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to open login modal via helper:",
          error,
        );
        return false;
      }
    }

    try {
      modal.classList.remove("hidden");
      modal.setAttribute("data-open", "true");
      return true;
    } catch (error) {
      devLogger.warn(
        "[LoginModalController] Failed to toggle login modal visibility:",
        error,
      );
    }

    return false;
  }

  createModalUnavailableError() {
    return createError("modal-unavailable", "Login modal unavailable.");
  }

  createLoginInProgressError() {
    return createError(
      "login-in-progress",
      "Another login operation is already in progress.",
    );
  }

  createModalOpenFailedError() {
    return createError("modal-open-failed", "Unable to open login modal.");
  }

  createCancellationError() {
    return createError("login-cancelled", "Login cancelled.");
  }

  startModalCloseWatch(task) {
    const modal = this.modalElement;
    if (!(modal instanceof HTMLElement)) {
      return;
    }

    const handleClose = () => {
      if (task.settled) {
        return;
      }
      task.reject(this.createCancellationError());
    };

    if (typeof MutationObserver === "function") {
      try {
        const observer = new MutationObserver(() => {
          if (!this.isModalOpen()) {
            handleClose();
          }
        });
        observer.observe(modal, {
          attributes: true,
          attributeFilter: ["data-open", "class"],
        });
        task.observer = observer;
        return;
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to observe login modal close state:",
          error,
        );
      }
    }

    if (
      this.window &&
      typeof this.window.setInterval === "function" &&
      typeof this.window.clearInterval === "function"
    ) {
      const timerId = this.window.setInterval(() => {
        if (!this.isModalOpen()) {
          handleClose();
        }
      }, MODAL_CLOSE_POLL_INTERVAL_MS);
      task.pollTimer = timerId;
    }
  }

  stopModalCloseWatch(task) {
    if (!task) {
      return;
    }

    if (task.observer && typeof task.observer.disconnect === "function") {
      try {
        task.observer.disconnect();
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to disconnect login modal observer:",
          error,
        );
      }
    }

    task.observer = null;

    if (
      typeof task.pollTimer === "number" &&
      this.window &&
      typeof this.window.clearInterval === "function"
    ) {
      try {
        this.window.clearInterval(task.pollTimer);
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to clear login modal polling timer:",
          error,
        );
      }
    }

    task.pollTimer = null;
  }

  createPendingModalTask(type, { triggerElement } = {}) {
    const modal = this.ensureModalPrepared();
    if (!(modal instanceof HTMLElement)) {
      throw this.createModalUnavailableError();
    }

    if (this.pendingTask) {
      throw this.createLoginInProgressError();
    }

    return new Promise((resolve, reject) => {
      const task = {
        type,
        resolve: null,
        reject: null,
        settled: false,
        observer: null,
        pollTimer: null,
      };

      const finalize = (handler) => (value) => {
        if (task.settled) {
          return;
        }
        task.settled = true;
        this.stopModalCloseWatch(task);
        if (this.pendingTask === task) {
          this.pendingTask = null;
        }
        if (
          typeof this.helpers.setModalState === "function" &&
          !this.isModalOpen()
        ) {
          try {
            this.helpers.setModalState("login", false);
          } catch (error) {
            devLogger.warn(
              "[LoginModalController] Failed to synchronize login modal state:",
              error,
            );
          }
        }
        handler(value);
      };

      task.resolve = finalize((value) => resolve(value));
      task.reject = finalize((errorValue) => reject(errorValue));

      this.pendingTask = task;

      this.startModalCloseWatch(task);

      let opened = false;
      try {
        opened = this.openModal({ triggerElement });
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Opening login modal threw:",
          error,
        );
      }

      if (!opened && !this.isModalOpen()) {
        task.reject(this.createModalOpenFailedError());
        return;
      }

      if (typeof this.helpers.setModalState === "function") {
        try {
          this.helpers.setModalState("login", true);
        } catch (error) {
          devLogger.warn(
            "[LoginModalController] Failed to mark login modal as open in app state:",
            error,
          );
        }
      }
    });
  }

  resolvePendingTask(result, { type } = {}) {
    const task = this.pendingTask;
    if (!task || (type && task.type !== type) || typeof task.resolve !== "function") {
      return false;
    }
    task.resolve(result);
    return true;
  }

  rejectPendingTask(error, { type } = {}) {
    const task = this.pendingTask;
    if (!task || (type && task.type !== type) || typeof task.reject !== "function") {
      return false;
    }
    task.reject(error);
    return true;
  }

  requestAddProfileLogin({ triggerElement, requestOptions } = {}) {
    const options = {
      allowAccountSelection: true,
      autoApply: false,
      ...(requestOptions && typeof requestOptions === "object"
        ? requestOptions
        : {}),
    };

    let promise;

    try {
      promise = this.createPendingModalTask("add-profile", { triggerElement });
    } catch (error) {
      this.setNextRequestLoginOptions(null);
      throw error;
    }

    this.setNextRequestLoginOptions(() => ({ ...options }));

    return promise.finally(() => {
      this.setNextRequestLoginOptions(null);
    });
  }

  getNostrClient() {
    const direct = this.services?.nostrClient;
    if (direct && typeof direct === "object") {
      return direct;
    }

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

  getStoredNip46Metadata() {
    const nostrClient = this.getNostrClient();
    if (!nostrClient || typeof nostrClient.getStoredNip46Metadata !== "function") {
      return null;
    }

    try {
      return nostrClient.getStoredNip46Metadata();
    } catch (error) {
      devLogger.warn(
        "[LoginModalController] Failed to inspect stored NIP-46 session:",
        error,
      );
    }

    return null;
  }

  initializeRemoteSignerStatus() {
    const nostrClient = this.getNostrClient();
    if (!nostrClient) {
      this.applyRemoteSignerStatus(null);
      return;
    }

    if (typeof nostrClient.getRemoteSignerStatus === "function") {
      try {
        const status = nostrClient.getRemoteSignerStatus();
        this.applyRemoteSignerStatus(status);
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to read initial remote signer status:",
          error,
        );
        this.applyRemoteSignerStatus(null);
      }
    } else {
      this.applyRemoteSignerStatus(null);
    }

    if (typeof nostrClient.onRemoteSignerChange === "function") {
      try {
        this.remoteSignerUnsubscribe = nostrClient.onRemoteSignerChange((status) => {
          this.applyRemoteSignerStatus(status);
        });
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to subscribe to remote signer updates:",
          error,
        );
      }
    }
  }

  formatRemoteSignerLabel(status) {
    if (!status || typeof status !== "object") {
      return "remote signer";
    }

    const { label, remoteNpub, remotePubkey } = status;
    if (typeof label === "string" && label.trim()) {
      return label.trim();
    }

    if (typeof remoteNpub === "string" && remoteNpub.trim()) {
      return remoteNpub.trim();
    }

    if (typeof remotePubkey === "string" && remotePubkey.trim()) {
      const trimmed = remotePubkey.trim();
      if (trimmed.length <= 16) {
        return trimmed;
      }
      return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
    }

    return "remote signer";
  }

  applyRemoteSignerStatus(status) {
    this.lastRemoteSignerStatus = status || null;
    const storedMetadata = this.getStoredNip46Metadata();
    const hasStoredSession = storedMetadata?.hasSession === true;

    const normalizedState =
      typeof status?.state === "string" && status.state.trim()
        ? status.state.trim()
        : hasStoredSession
        ? "stored"
        : "idle";

    let message = "";
    let showDisconnect = false;

    switch (normalizedState) {
      case "connected": {
        if (typeof status?.userNpub === "string" && status.userNpub.trim()) {
          message = `Connected as ${status.userNpub.trim()}`;
        } else {
          const label = this.formatRemoteSignerLabel(status);
          message = `Connected to ${label}`;
        }
        showDisconnect = true;
        break;
      }
      case "connecting": {
        message = "Connecting to remote signer…";
        break;
      }
      case "error": {
        message =
          typeof status?.message === "string" && status.message.trim()
            ? status.message.trim()
            : "Remote signer unavailable.";
        break;
      }
      case "stored": {
        if (hasStoredSession) {
          const label = this.formatRemoteSignerLabel(status || storedMetadata);
          message = `Saved remote signer (${label}) ready to connect.`;
        }
        break;
      }
      default: {
        message = "";
        break;
      }
    }

    this.setProviderStatus("nip46", {
      message,
      reset: !message,
      showDisconnect,
      statusState: normalizedState,
    });
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

  async promptForNip46Options() {
    if (!this.modalBody || !this.nip46Template) {
      userLogger.warn(
        "[LoginModalController] Remote signer login is unavailable in this build.",
      );
      return null;
    }

    if (this.activeNip46Form) {
      return null;
    }

    const fragment = this.nip46Template.content
      ? this.nip46Template.content.cloneNode(true)
      : null;
    if (!fragment) {
      return null;
    }

    const form = fragment.querySelector("[data-nip46-form]");
    if (!(form instanceof HTMLFormElement)) {
      return null;
    }

    const handshakePanel = form.querySelector("[data-nip46-handshake-panel]");
    const qrContainer = form.querySelector("[data-nip46-qr]");
    const handshakeInput = form.querySelector("[data-nip46-handshake-uri]");
<<<<<<< HEAD
    const debugUriContainer = form.querySelector("[data-nip46-debug-uri]");
    const copyButton = form.querySelector("[data-nip46-copy-uri]");
=======
    const copyButton = form.querySelector("[data-nip46-copy-uri]");
    const secretNode = form.querySelector("[data-nip46-secret]");
>>>>>>> origin/main
    const statusNode = form.querySelector("[data-nip46-status]");
    const authContainer = form.querySelector("[data-nip46-auth]");
    const authMessageNode = form.querySelector("[data-nip46-auth-message]");
    const authOpenButton = form.querySelector("[data-nip46-auth-open]");
<<<<<<< HEAD
    const reuseButton = form.querySelector("[data-nip46-reuse]");
    const cancelButton = form.querySelector("[data-nip46-cancel]");
=======
    const manualToggle = form.querySelector("[data-nip46-toggle-manual]");
    const manualFields = form.querySelector("[data-nip46-manual-fields]");
    const manualInput = form.querySelector("[data-nip46-legacy-uri]");
    const rememberCheckbox = form.querySelector("[data-nip46-remember]");
    const reuseButton = form.querySelector("[data-nip46-reuse]");
    const cancelButton = form.querySelector("[data-nip46-cancel]");
    const submitButton = form.querySelector("[data-nip46-submit]");
>>>>>>> origin/main
    const errorNode = form.querySelector("[data-nip46-error]");

    const storedMetadata = this.getStoredNip46Metadata();
    const hasStoredSession = storedMetadata?.hasSession === true;
    if (reuseButton instanceof HTMLButtonElement) {
      reuseButton.classList.toggle("hidden", !hasStoredSession);
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
    this.activeNip46Form = form;

<<<<<<< HEAD
    if (handshakeInput instanceof HTMLInputElement) {
      handshakeInput.readOnly = true;
      handshakeInput.value = "";
    }
    if (debugUriContainer instanceof HTMLElement) {
      debugUriContainer.textContent = "Waiting for connect link...";
=======
    if (handshakeInput instanceof HTMLTextAreaElement) {
      handshakeInput.readOnly = true;
      handshakeInput.value = "";
      handshakeInput.placeholder = "Waiting for connect link…";
>>>>>>> origin/main
    }
    if (copyButton instanceof HTMLButtonElement) {
      copyButton.disabled = true;
    }

    const statusClassMap = {
      info: ["border-info/40", "bg-info/10", "text-info"],
      success: ["border-success/40", "bg-success/10", "text-success"],
      warning: ["border-warning/50", "bg-warning/10", "text-warning"],
      danger: ["border-danger/60", "bg-danger/10", "text-danger"],
    };
    const statusClassValues = new Set(
      Object.values(statusClassMap).flat(),
    );

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

    const setStatus = (message, variant = "info") => {
      if (!(statusNode instanceof HTMLElement)) {
        return;
      }
      const normalized = typeof message === "string" ? message.trim() : "";
      if (!normalized) {
        statusNode.textContent = "";
        statusNode.classList.add("hidden");
        for (const cls of statusClassValues) {
          statusNode.classList.remove(cls);
        }
        return;
      }
      statusNode.textContent = normalized;
      statusNode.classList.remove("hidden");
      for (const cls of statusClassValues) {
        statusNode.classList.remove(cls);
      }
      const classes = statusClassMap[variant] || statusClassMap.info;
      statusNode.classList.add(...classes);
    };

    const resetStatus = () => setStatus("", "info");

    let qrInstance = null;
<<<<<<< HEAD
=======
    let manualMode = false;
>>>>>>> origin/main
    let pendingAuthUrl = "";

    const setAuthChallenge = (url) => {
      pendingAuthUrl = typeof url === "string" ? url.trim() : "";
      if (!(authContainer instanceof HTMLElement)) {
        return;
      }
      if (!pendingAuthUrl) {
        authContainer.classList.add("hidden");
        if (authMessageNode instanceof HTMLElement) {
          authMessageNode.textContent = "";
        }
        return;
      }
      authContainer.classList.remove("hidden");
      if (authMessageNode instanceof HTMLElement) {
        authMessageNode.textContent =
          "The signer requested additional authentication.";
      }
    };

    const clearAuthChallenge = () => {
      setAuthChallenge("");
    };

    const setPendingState = (pending) => {
      const disabled = pending === true;
<<<<<<< HEAD
=======
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = disabled;
      }
      if (rememberCheckbox instanceof HTMLInputElement) {
        rememberCheckbox.disabled = disabled;
      }
      if (manualToggle instanceof HTMLButtonElement) {
        manualToggle.disabled = disabled;
      }
      if (manualInput instanceof HTMLTextAreaElement) {
        manualInput.disabled = disabled;
      }
>>>>>>> origin/main
      if (reuseButton instanceof HTMLButtonElement) {
        reuseButton.disabled = disabled;
      }
      if (cancelButton instanceof HTMLButtonElement) {
        cancelButton.disabled = disabled;
      }
      if (copyButton instanceof HTMLButtonElement) {
        const hasUri =
<<<<<<< HEAD
          handshakeInput instanceof HTMLInputElement &&
=======
          handshakeInput instanceof HTMLTextAreaElement &&
>>>>>>> origin/main
          !!handshakeInput.value;
        copyButton.disabled = disabled || !hasUri;
      }
    };

    const updateHandshakeDisplay = (detail) => {
      const uri =
        detail && typeof detail === "object"
          ? detail.uri || detail.connectionString || ""
          : "";
<<<<<<< HEAD
      if (!uri) {
        setError("Failed to generate connection link. Please try again.");
        return;
      }

      if (handshakeInput instanceof HTMLInputElement) {
        handshakeInput.value = uri;
      }
      if (debugUriContainer instanceof HTMLElement) {
        debugUriContainer.textContent = uri;
      }
      if (copyButton instanceof HTMLButtonElement) {
        copyButton.disabled = !uri;
      }

=======
      if (handshakeInput instanceof HTMLTextAreaElement) {
        handshakeInput.value = uri;
      }
      if (copyButton instanceof HTMLButtonElement) {
        copyButton.disabled = !uri;
      }
      if (secretNode instanceof HTMLElement) {
        const secretValue =
          detail && typeof detail.secret === "string" ? detail.secret.trim() : "";
        if (secretValue) {
          secretNode.textContent = `Secret: ${secretValue}`;
          secretNode.classList.remove("hidden");
        } else {
          secretNode.textContent = "";
          secretNode.classList.add("hidden");
        }
      }
>>>>>>> origin/main
      if (qrContainer instanceof HTMLElement) {
        qrContainer.innerHTML = "";
        const resolveTokenColor = (tokenName, fallback) => {
          if (!tokenName) {
            return fallback;
          }
          const doc = this.document;
          const win = this.window;
          if (!doc || !win || typeof win.getComputedStyle !== "function") {
            return fallback;
          }
          const root = doc.documentElement;
          if (!root) {
            return fallback;
          }
          const computed = win.getComputedStyle(root);
          if (!computed) {
            return fallback;
          }
          const value = computed.getPropertyValue(tokenName);
          return value && value.trim() ? value.trim() : fallback;
        };
        const qrLightColor = resolveTokenColor("--color-white", "#ffffff");
        const qrDarkColor = resolveTokenColor("--color-black", "#000000");
        if (uri) {
          try {
            qrInstance = renderQrCode(qrContainer, uri, {
              width: 256,
              height: 256,
              colorLight: qrLightColor,
              colorDark: qrDarkColor,
            });
          } catch (error) {
            qrInstance = null;
            devLogger.warn(
              "[LoginModalController] Failed to render NIP-46 QR code:",
              error,
            );
            const fallback = this.document?.createElement("div");
            if (fallback) {
              fallback.className = "text-center text-xs text-text-muted";
              fallback.textContent =
<<<<<<< HEAD
                "Unable to render QR code. Use the copy button below.";
=======
                "Unable to render QR code. Use the connect link below.";
>>>>>>> origin/main
              qrContainer.appendChild(fallback);
            }
          }
        } else {
          qrInstance = null;
        }
      }
      setPendingState(false);
<<<<<<< HEAD
=======
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
      }
>>>>>>> origin/main
      resetStatus();
      clearAuthChallenge();
      setError("");
    };

    const handleStatus = (status) => {
      if (!status || typeof status !== "object") {
        resetStatus();
        return;
      }
      const message =
        typeof status.message === "string" ? status.message.trim() : "";
      if (!message) {
        resetStatus();
        return;
      }
      let variant =
        typeof status.variant === "string" && status.variant.trim()
          ? status.variant.trim().toLowerCase()
          : "";
      if (!variant) {
        if (status.phase === "auth") {
          variant = "warning";
        } else if (
          status.phase === "connected" ||
          status.state === "ready" ||
          status.state === "acknowledged"
        ) {
          variant = "success";
        } else {
          variant = "info";
        }
      }
      setStatus(message, variant);
    };

    const handleAuthUrl = (url) => {
      const normalized = typeof url === "string" ? url.trim() : "";
      if (!normalized) {
        clearAuthChallenge();
        return;
      }
      setAuthChallenge(normalized);
    };

<<<<<<< HEAD
    let cancelHandler = null;
    let reuseHandler = null;
    let copyHandler = null;
    let authOpenHandler = null;

    const cleanup = () => {
=======
    const applyManualMode = (enabled) => {
      manualMode = enabled === true;
      if (manualFields instanceof HTMLElement) {
        manualFields.classList.toggle("hidden", !manualMode);
      }
      if (handshakePanel instanceof HTMLElement) {
        handshakePanel.classList.toggle("hidden", manualMode);
      }
      if (manualToggle instanceof HTMLButtonElement) {
        manualToggle.textContent = manualMode
          ? "Back to QR pairing"
          : "Paste a signer-provided bunker link instead";
      }
      if (manualMode && manualInput instanceof HTMLTextAreaElement) {
        manualInput.focus();
      }
      if (!manualMode && manualInput instanceof HTMLTextAreaElement) {
        manualInput.value = "";
      }
      resetStatus();
      clearAuthChallenge();
      setError("");
    };

    let submitHandler = null;
    let cancelHandler = null;
    let reuseHandler = null;
    let copyHandler = null;
    let manualToggleHandler = null;
    let authOpenHandler = null;

    const cleanup = () => {
      if (submitHandler) {
        form.removeEventListener("submit", submitHandler);
      }
>>>>>>> origin/main
      if (cancelHandler && cancelButton instanceof HTMLButtonElement) {
        cancelButton.removeEventListener("click", cancelHandler);
      }
      if (reuseHandler && reuseButton instanceof HTMLButtonElement) {
        reuseButton.removeEventListener("click", reuseHandler);
      }
      if (copyHandler && copyButton instanceof HTMLButtonElement) {
        copyButton.removeEventListener("click", copyHandler);
      }
<<<<<<< HEAD
=======
      if (manualToggleHandler && manualToggle instanceof HTMLButtonElement) {
        manualToggle.removeEventListener("click", manualToggleHandler);
      }
>>>>>>> origin/main
      if (authOpenHandler && authOpenButton instanceof HTMLButtonElement) {
        authOpenButton.removeEventListener("click", authOpenHandler);
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
      this.activeNip46Form = null;
      this.pendingNip46Cleanup = null;
      qrInstance = null;
      clearAuthChallenge();
      resetStatus();
      setError("");
    };

    resetStatus();
    clearAuthChallenge();
<<<<<<< HEAD
=======
    applyManualMode(false);
>>>>>>> origin/main
    setError("");

    return new Promise((resolve) => {
      let settled = false;

      const finish = (detail, { keepMounted = false } = {}) => {
        if (settled) {
          return;
        }
        settled = true;

        if (keepMounted) {
          this.pendingNip46Cleanup = () => {
            cleanup();
          };
        } else {
          cleanup();
        }

        resolve(detail);
      };

<<<<<<< HEAD
      // Auto-submit immediately to generate the QR code
      const autoStart = () => {
=======
      submitHandler = (event) => {
        event.preventDefault();
>>>>>>> origin/main
        setError("");
        resetStatus();
        clearAuthChallenge();

<<<<<<< HEAD
=======
        const remember =
          rememberCheckbox instanceof HTMLInputElement
            ? rememberCheckbox.checked
            : true;

        if (manualMode) {
          if (!(manualInput instanceof HTMLTextAreaElement)) {
            setError("Manual input is unavailable.");
            return;
          }
          const raw = manualInput.value.trim();
          if (!raw) {
            setError("Paste the bunker:// link from your signer.");
            manualInput.focus();
            return;
          }
          setPendingState(true);
          finish(
            {
              mode: "manual",
              connectionString: raw,
              remember: remember !== false,
              onStatus: handleStatus,
              onAuthUrl: handleAuthUrl,
            },
            { keepMounted: false },
          );
          return;
        }

>>>>>>> origin/main
        const metadata = {};
        if (this.document && typeof this.document.title === "string") {
          const title = this.document.title.trim();
          if (title) {
            metadata.name = title;
          }
        }
        if (this.window?.location?.origin) {
          metadata.url = this.window.location.origin;
        }

        setPendingState(true);
        finish(
          {
            mode: "handshake",
<<<<<<< HEAD
            remember: true, // Always remember for now in simplified flow
=======
            remember: remember !== false,
>>>>>>> origin/main
            metadata,
            onHandshakePrepared: updateHandshakeDisplay,
            onStatus: handleStatus,
            onAuthUrl: handleAuthUrl,
          },
          { keepMounted: true },
        );
      };

<<<<<<< HEAD
=======
      form.addEventListener("submit", submitHandler);

>>>>>>> origin/main
      if (cancelButton instanceof HTMLButtonElement) {
        cancelHandler = (event) => {
          event.preventDefault();
          finish(null, { keepMounted: false });
        };
        cancelButton.addEventListener("click", cancelHandler);
      }

      if (reuseButton instanceof HTMLButtonElement) {
        reuseHandler = (event) => {
          event.preventDefault();
          finish({ reuseStored: true }, { keepMounted: false });
        };
        reuseButton.addEventListener("click", reuseHandler);
      }

      if (copyButton instanceof HTMLButtonElement) {
        copyHandler = async (event) => {
          event.preventDefault();
<<<<<<< HEAD
          if (!(handshakeInput instanceof HTMLInputElement)) {
=======
          if (!(handshakeInput instanceof HTMLTextAreaElement)) {
>>>>>>> origin/main
            return;
          }
          const value = handshakeInput.value.trim();
          if (!value) {
            return;
          }
          let copied = false;
          if (
            typeof navigator !== "undefined" &&
            navigator?.clipboard?.writeText
          ) {
            try {
              await navigator.clipboard.writeText(value);
              copied = true;
            } catch (error) {
              copied = false;
            }
          }
          if (!copied && handshakeInput.select) {
            try {
              handshakeInput.select();
              if (this.document?.execCommand) {
                copied = this.document.execCommand("copy");
              }
            } catch (error) {
              copied = false;
<<<<<<< HEAD
            }
          }
          if (copied) {
            // Temporary button feedback
            const originalText = copyButton.textContent;
            copyButton.textContent = "Copied!";
            copyButton.classList.add("btn-success"); // Assuming this utility exists or similar
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.classList.remove("btn-success");
            }, 2000);
          } else {
            setStatus(
              "Copy failed. Use the manual fallback below.",
=======
            } finally {
              handshakeInput.setSelectionRange(
                handshakeInput.value.length,
                handshakeInput.value.length,
              );
            }
          }
          if (copied) {
            setStatus("Connect URI copied to clipboard.", "success");
          } else {
            setStatus(
              "Copy failed. Copy the link manually if needed.",
>>>>>>> origin/main
              "warning",
            );
          }
        };
        copyButton.addEventListener("click", copyHandler);
      }

<<<<<<< HEAD
=======
      if (manualToggle instanceof HTMLButtonElement) {
        manualToggleHandler = (event) => {
          event.preventDefault();
          applyManualMode(!manualMode);
        };
        manualToggle.addEventListener("click", manualToggleHandler);
      }

>>>>>>> origin/main
      if (authOpenButton instanceof HTMLButtonElement) {
        authOpenHandler = (event) => {
          event.preventDefault();
          if (!pendingAuthUrl) {
            return;
          }
          if (this.window && typeof this.window.open === "function") {
            this.window.open(pendingAuthUrl, "_blank", "noopener,noreferrer");
          } else if (this.document && this.document.location) {
            this.document.location.href = pendingAuthUrl;
          }
        };
        authOpenButton.addEventListener("click", authOpenHandler);
      }
<<<<<<< HEAD

      // Kick off the handshake generation
      setTimeout(autoStart, 0);
    });
  }

  async promptForGenerateOptions() {
    if (!this.modalBody || !this.generateTemplate) {
      userLogger.warn("[LoginModalController] Account generation is unavailable.");
      return null;
    }

    if (this.activeGenerateView) {
      return null;
    }

    const fragment = this.generateTemplate.content
      ? this.generateTemplate.content.cloneNode(true)
      : null;
    if (!fragment) {
      return null;
    }

    const view = fragment.querySelector("[data-generate-view]");
    if (!(view instanceof HTMLElement)) {
      return null;
    }

    const npubEl = view.querySelector("[data-generate-npub]");
    const nsecEl = view.querySelector("[data-generate-nsec]");
    const copyNpubBtn = view.querySelector("[data-generate-copy-npub]");
    const copyNsecBtn = view.querySelector("[data-generate-copy-nsec]");
    const revealNsecBtn = view.querySelector("[data-generate-reveal-nsec]");
    const downloadBtn = view.querySelector("[data-generate-download]");
    const confirmCheckbox = view.querySelector("[data-generate-confirm]");
    const loginBtn = view.querySelector("[data-generate-login]");
    const cancelBtn = view.querySelector("[data-generate-cancel]");

    const tools = this.window?.NostrTools;
    if (!tools || typeof tools.generateSecretKey !== "function" || typeof tools.getPublicKey !== "function") {
      userLogger.error("Key generation unavailable: NostrTools missing.");
      return null;
    }

    // Do not generate keys immediately. Wait for user action.
    this.generatedKeypair = null;
    let npub = "";
    let nsec = "";
    let hexSk = "";

    // Reset fields
    if (npubEl) {
      npubEl.textContent = "";
    }
    if (nsecEl instanceof HTMLInputElement) {
      nsecEl.value = "";
    }

    // Insert "Generate" button
    const generateBtn = this.document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "btn w-full mb-4";
    generateBtn.textContent = "Generate New Keys";
    // Insert before the first key field container, or at top of view?
    // view structure: h3, p, div(space-y-3)
    const contentContainer = view.querySelector(".space-y-3");
    if (contentContainer) {
      contentContainer.insertBefore(generateBtn, contentContainer.firstChild);
    }

    const keyContainer = contentContainer
      ? contentContainer.querySelector(".space-y-2")
      : null;
    if (keyContainer) {
      keyContainer.classList.add("hidden");
    }
    // Also hide the nsec container
    const nsecContainer = contentContainer
      ? contentContainer.querySelectorAll(".space-y-2")[1]
      : null;
    if (nsecContainer) {
      nsecContainer.classList.add("hidden");
    }

    generateBtn.addEventListener("click", () => {
      const sk = tools.generateSecretKey();
      const pk = tools.getPublicKey(sk);
      const npubGen = tools.nip19?.npubEncode ? tools.nip19.npubEncode(pk) : pk;
      const nsecGen = tools.nip19?.nsecEncode ? tools.nip19.nsecEncode(sk) : "";
      const hexSkGen = nsecGen
        ? nsecGen
        : tools.nip19?.bytesToHex
        ? tools.nip19.bytesToHex(sk)
        : "";

      this.generatedKeypair = {
        npub: npubGen,
        nsec: nsecGen,
        hexSk: hexSkGen,
        pubkey: pk,
      };

      npub = npubGen;
      nsec = nsecGen;
      hexSk = hexSkGen;

      if (npubEl) npubEl.textContent = npub;
      if (nsecEl instanceof HTMLInputElement) nsecEl.value = nsec;

      generateBtn.classList.add("hidden");
      if (keyContainer) keyContainer.classList.remove("hidden");
      if (nsecContainer) nsecContainer.classList.remove("hidden");
      if (loginBtn) loginBtn.disabled = true; // Still requires checkbox confirmation
    });

    const elementsToHide = [];
    for (const child of Array.from(this.modalBody.children)) {
      if (child instanceof HTMLElement && child !== view) {
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

    this.modalBody.appendChild(view);
    this.activeGenerateView = view;

    const cleanup = () => {
      if (view.parentElement) {
        view.parentElement.removeChild(view);
      }
      for (const entry of elementsToHide) {
        if (!(entry?.element instanceof HTMLElement)) {
          continue;
        }
        if (!entry.wasHidden) {
          entry.element.classList.remove("hidden");
        }
      }
      this.activeGenerateView = null;
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (detail) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(detail);
      };

      // Interactions
      if (cancelBtn) {
        cancelBtn.addEventListener(
          "click",
          (e) => {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            finish(null);
          },
          { once: true },
        );
      }

      if (loginBtn) {
        loginBtn.addEventListener("click", () => {
          if (!this.generatedKeypair) {
            return;
          }
          const { npub, nsec, hexSk } = this.generatedKeypair;

          // Block generated accounts if whitelist-only access is enforced.
          const accessControl = this.services?.authService?.accessControl;
          if (accessControl && typeof accessControl.canAccess === "function") {
            let canAccess = true;
            try {
              canAccess = accessControl.canAccess(npub);
            } catch (error) {
              devLogger.warn(
                "[LoginModalController] accessControl.canAccess threw:",
                error,
              );
              canAccess = Boolean(canAccess);
            }

            if (!canAccess && typeof accessControl.whitelistMode === "function") {
              const isWhitelistMode = accessControl.whitelistMode();
              if (isWhitelistMode) {
                // Surface the access error via the login error callback/notification.
                const accessError = new Error(
                  "Access restricted to admins and moderators users only.",
                );
                safeInvoke(this.callbacks.onLoginError, {
                  message: accessError.message,
                  error: accessError,
                });
                return;
              }
            }
          }

          // Return credentials compatible with nsec provider
          finish({ secret: nsec || hexSk, persist: false });
        });
      }

      if (confirmCheckbox) {
        confirmCheckbox.addEventListener("change", (e) => {
          if (loginBtn) loginBtn.disabled = !e.target.checked;
        });
      }

      const copyToClipboard = async (text, btn) => {
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          // Optional: visual feedback could be added here
        } catch (err) {
          devLogger.warn("Failed to copy:", err);
        }
      };

      if (copyNpubBtn) {
        copyNpubBtn.addEventListener("click", () => copyToClipboard(npub, copyNpubBtn));
      }

      if (copyNsecBtn) {
        copyNsecBtn.addEventListener("click", () => copyToClipboard(nsec, copyNsecBtn));
      }

      if (revealNsecBtn && nsecEl instanceof HTMLInputElement) {
        revealNsecBtn.addEventListener("click", () => {
          const isPassword = nsecEl.type === "password";
          nsecEl.type = isPassword ? "text" : "password";
          // Icon toggle logic could go here if icons were separate elements
        });
      }

      if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
          const content = `Nostr Keys Backup\n\nPublic Key (npub): ${npub}\nSecret Key (nsec): ${nsec}\n\nKEEP YOUR NSEC PRIVATE AND SAFE!`;
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "nostr-keys.txt";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }
=======
>>>>>>> origin/main
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
    if (provider.tone) {
      button.dataset.tone = provider.tone;
    } else {
      delete button.dataset.tone;
      button.removeAttribute("data-tone");
    }
    button.disabled = provider.disabled;
    if (provider.disabled) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }

    const eyebrowNode = button.querySelector("[data-provider-eyebrow]");
    if (eyebrowNode instanceof HTMLElement) {
      eyebrowNode.textContent = provider.eyebrow || "";
      eyebrowNode.classList.toggle("hidden", !provider.eyebrow);
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

    const statusRow = button.querySelector("[data-provider-status-row]");
    if (statusRow instanceof HTMLElement) {
      statusRow.classList.add("hidden");
    }

    const disconnectButton = button.querySelector("[data-provider-disconnect]");
    if (disconnectButton instanceof HTMLButtonElement) {
      disconnectButton.dataset.providerId = provider.id;
      disconnectButton.classList.add("hidden");
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
        statusRow: statusRow instanceof HTMLElement ? statusRow : null,
        disconnectButton:
          disconnectButton instanceof HTMLButtonElement ? disconnectButton : null,
        defaultDescription: provider.description,
      },
    };
  }

  handleContainerClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const disconnectButton = target.closest("[data-provider-disconnect]");
    if (disconnectButton instanceof HTMLButtonElement) {
      const providerId = disconnectButton.dataset.providerId;
      if (providerId) {
        this.handleProviderDisconnect(providerId);
      }
      event.preventDefault();
      event.stopPropagation();
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

  async handleProviderDisconnect(providerId) {
    if (providerId !== "nip46") {
      return;
    }

    const nostrClient = this.getNostrClient();
    if (!nostrClient || typeof nostrClient.disconnectRemoteSigner !== "function") {
      return;
    }

    try {
      await nostrClient.disconnectRemoteSigner({ keepStored: false });
    } catch (error) {
      devLogger.warn("[LoginModalController] Failed to disconnect remote signer:", error);
    }
  }

  getProviderEntry(providerId) {
    return this.providerEntries.get(providerId) || null;
  }

  setProviderStatus(providerId, options = {}) {
    const entry = this.getProviderEntry(providerId);
    if (!entry) {
      return;
    }

    const {
      message = "",
      reset = false,
      showDisconnect = false,
      disableDisconnect = false,
      statusState = null,
    } = options || {};

    if (statusState) {
      entry.statusState = statusState;
    } else {
      delete entry.statusState;
    }

    this.updateStatusMessage(entry, message, reset);

    const shouldShowRow = !reset && typeof message === "string" && message.trim();
    if (entry.statusRow instanceof HTMLElement) {
      entry.statusRow.classList.toggle("hidden", !shouldShowRow);
    }

    if (entry.disconnectButton instanceof HTMLButtonElement) {
      entry.disconnectButton.classList.toggle("hidden", !showDisconnect);
      entry.disconnectButton.disabled = !!disableDisconnect;
    }
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

      const loadingMessage = entry.provider.messages.loading || "Connecting…";
      this.setProviderStatus(providerId, {
        message: loadingMessage,
        reset: false,
        showDisconnect: false,
        disableDisconnect: true,
        statusState: "loading",
      });
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
      this.setProviderStatus(providerId, { message: "", reset: true });
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
      this.setProviderStatus(providerId, {
        message: slowMessage,
        reset: false,
        showDisconnect: false,
        statusState: "waiting",
        disableDisconnect: true,
      });
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
<<<<<<< HEAD
    if (this.isSelectionInProgress) {
      return;
    }

=======
>>>>>>> origin/main
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

<<<<<<< HEAD
    this.isSelectionInProgress = true;
    try {
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
      } else if (entry.provider.id === "nip46") {
        try {
          const nip46Options = await this.promptForNip46Options();
          if (!nip46Options) {
            devLogger.log(
              "[LoginModalController] Remote signer login cancelled by the user.",
            );
            if (entry.button instanceof HTMLButtonElement) {
              entry.button.focus();
            }
            return;
          }
          providerOptions = nip46Options;
        } catch (promptError) {
          devLogger.error(
            "[LoginModalController] Failed to collect remote signer connection:",
            promptError,
          );
          return;
        }
      } else if (entry.provider.id === "generate") {
        try {
          const generateOptions = await this.promptForGenerateOptions();
          if (!generateOptions) {
            devLogger.log(
              "[LoginModalController] Account generation cancelled by the user.",
            );
            if (entry.button instanceof HTMLButtonElement) {
              entry.button.focus();
            }
            return;
          }
          providerOptions = generateOptions;
          // Switch provider context to 'nsec' since we are logging in with a key
          providerId = "nsec";
          const nsecEntry = this.getProviderEntry("nsec");
          if (nsecEntry) {
            entry = nsecEntry;
          }
        } catch (promptError) {
          devLogger.error(
            "[LoginModalController] Failed to process account generation:",
            promptError,
          );
          return;
        }
      }

      this.setLoadingState(providerId, true);
      devLogger.log(
        `[LoginModalController] Starting login for provider ${providerId}.`,
      );

      const requestOptions = { providerId, ...providerOptions };

      const extraOptions = await this.resolveNextRequestLoginOptions({
        provider: entry.provider.source || entry.provider,
        providerId,
      });
      if (extraOptions && typeof extraOptions === "object") {
        Object.assign(requestOptions, extraOptions);
      }

      try {
        const result =
          await this.services.authService.requestLogin(requestOptions);

        devLogger.log(
          `[LoginModalController] Login resolved for ${providerId} with pubkey:`,
          result?.pubkey,
        );

        const consumed = this.resolvePendingTask(result, { type: "add-profile" });
        const shouldClose =
          result &&
          typeof result === "object" &&
          typeof result.pubkey === "string" &&
          result.pubkey.trim();

        if (shouldClose) {
          this.helpers.closeModal();
        }

        if (consumed) {
          return;
        }

        await safeInvokeAsync(this.callbacks.onLoginSuccess, {
          provider: entry.provider.source || entry.provider,
          result,
        });
      } catch (error) {
        devLogger.error(
          `[LoginModalController] Login failed for ${providerId}:`,
          error,
        );

        const message = this.helpers.describeLoginError(
          error,
          entry.provider.errorMessage,
        );

        if (!message || (typeof message === "string" && !message.trim())) {
          devLogger.warn(
            `[LoginModalController] describeLoginError returned empty message for ${providerId}.`,
          );
        }

        const rejectionError =
          error instanceof Error
            ? error
            : new Error(message || "Failed to login. Please try again.");

        if (message && message !== rejectionError.message) {
          rejectionError.message = message;
        }

        if (
          error &&
          typeof error === "object" &&
          typeof error.code === "string" &&
          !rejectionError.code
        ) {
          rejectionError.code = error.code;
        }

        const consumed = this.rejectPendingTask(rejectionError, {
          type: "add-profile",
        });

        if (consumed) {
          return;
        }

        await safeInvokeAsync(this.callbacks.onLoginError, {
          provider: entry.provider.source || entry.provider,
          error: rejectionError,
          message,
        });
      }
    } finally {
      this.isSelectionInProgress = false;
=======
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
    } else if (entry.provider.id === "nip46") {
      try {
        const nip46Options = await this.promptForNip46Options();
        if (!nip46Options) {
          devLogger.log(
            "[LoginModalController] Remote signer login cancelled by the user.",
          );
          if (entry.button instanceof HTMLButtonElement) {
            entry.button.focus();
          }
          return;
        }
        providerOptions = nip46Options;
      } catch (promptError) {
        devLogger.error(
          "[LoginModalController] Failed to collect remote signer connection:",
          promptError,
        );
        return;
      }
    }

    this.setLoadingState(providerId, true);
    devLogger.log(
      `[LoginModalController] Starting login for provider ${providerId}.`,
    );

    const requestOptions = { providerId, ...providerOptions };

    const extraOptions = await this.resolveNextRequestLoginOptions({
      provider: entry.provider.source || entry.provider,
      providerId,
    });
    if (extraOptions && typeof extraOptions === "object") {
      Object.assign(requestOptions, extraOptions);
    }

    try {
      const result = await this.services.authService.requestLogin(requestOptions);

      devLogger.log(
        `[LoginModalController] Login resolved for ${providerId} with pubkey:`,
        result?.pubkey,
      );

      const consumed = this.resolvePendingTask(result, { type: "add-profile" });
      const shouldClose =
        result &&
        typeof result === "object" &&
        typeof result.pubkey === "string" &&
        result.pubkey.trim();

      if (shouldClose) {
        this.helpers.closeModal();
      }

      if (consumed) {
        return;
      }

      await safeInvokeAsync(this.callbacks.onLoginSuccess, {
        provider: entry.provider.source || entry.provider,
        result,
      });
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

      const rejectionError =
        error instanceof Error
          ? error
          : new Error(message || "Failed to login. Please try again.");

      if (message && message !== rejectionError.message) {
        rejectionError.message = message;
      }

      if (
        error &&
        typeof error === "object" &&
        typeof error.code === "string" &&
        !rejectionError.code
      ) {
        rejectionError.code = error.code;
      }

      const consumed = this.rejectPendingTask(rejectionError, {
        type: "add-profile",
      });

      if (consumed) {
        return;
      }

      await safeInvokeAsync(this.callbacks.onLoginError, {
        provider: entry.provider.source || entry.provider,
        error: rejectionError,
        message,
      });
    } finally {
>>>>>>> origin/main
      this.setLoadingState(providerId, false);
      if (this.pendingNip46Cleanup) {
        try {
          this.pendingNip46Cleanup();
        } catch (cleanupError) {
          devLogger.warn(
            "[LoginModalController] Failed to dispose remote signer form:",
            cleanupError,
          );
        }
      }
    }
  }

  setNextRequestLoginOptions(options) {
    if (typeof options === "function") {
      this.nextRequestLoginOptionsResolver = options;
      this.nextRequestLoginOptions = null;
      return;
    }

    if (options && typeof options === "object") {
      this.nextRequestLoginOptions = { ...options };
      this.nextRequestLoginOptionsResolver = null;
      return;
    }

    this.nextRequestLoginOptions = null;
    this.nextRequestLoginOptionsResolver = null;
  }

  async resolveNextRequestLoginOptions(context = {}) {
    if (typeof this.nextRequestLoginOptionsResolver === "function") {
      const resolver = this.nextRequestLoginOptionsResolver;
      this.nextRequestLoginOptionsResolver = null;
      this.nextRequestLoginOptions = null;
      try {
        const resolved = await resolver({ controller: this, ...context });
        if (resolved && typeof resolved === "object") {
          return { ...resolved };
        }
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Next request options resolver threw:",
          error,
        );
      }
      return {};
    }

    if (this.nextRequestLoginOptions && typeof this.nextRequestLoginOptions === "object") {
      const options = this.nextRequestLoginOptions;
      this.nextRequestLoginOptions = null;
      return { ...options };
    }

    return {};
  }

  destroy() {
<<<<<<< HEAD
    if (this.modalCloseObserver) {
      try {
        this.modalCloseObserver.disconnect();
      } catch (error) {
        // no-op
      }
    }
    this.modalCloseObserver = null;

    if (this.modalCloseIntervalId) {
      if (this.window && typeof this.window.clearInterval === "function") {
        this.window.clearInterval(this.modalCloseIntervalId);
      }
    }
    this.modalCloseIntervalId = null;

=======
>>>>>>> origin/main
    if (this.pendingTask && typeof this.pendingTask.reject === "function") {
      try {
        this.pendingTask.reject(this.createCancellationError());
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Failed to cancel pending login task during destroy:",
          error,
        );
      }
    }

    this.pendingTask = null;

    if (this.providerContainer && this.boundClickHandler) {
      this.providerContainer.removeEventListener("click", this.boundClickHandler);
    }

    for (const providerId of this.slowTimers.keys()) {
      this.stopSlowTimer(providerId);
    }

    if (typeof this.remoteSignerUnsubscribe === "function") {
      try {
        this.remoteSignerUnsubscribe();
      } catch (error) {
        devLogger.warn(
          "[LoginModalController] Remote signer unsubscribe handler threw:",
          error,
        );
      }
    }
    this.remoteSignerUnsubscribe = null;

    this.providerEntries.clear();
    this.nextRequestLoginOptions = null;
    this.nextRequestLoginOptionsResolver = null;
    this.initialized = false;
  }
}
