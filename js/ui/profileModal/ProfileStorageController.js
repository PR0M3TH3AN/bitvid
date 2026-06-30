import { devLogger, userLogger } from "../../utils/logger.js";
import { PROVIDERS } from "../../services/storageService.js";
import {
  prepareS3Connection,
  getCorsOrigins,
  deriveB2Endpoint,
  derivePublicBaseUrl,
} from "../../services/s3Service.js";
import { getActiveSigner } from "../../nostr/client.js";
import { DEFAULT_NIP07_ENCRYPTION_METHODS } from "../../nostr/nip07Permissions.js";
import { storageSyncService } from "../../services/storageSyncService.js";
import { StorageCorsHelp } from "./storageCorsHelp.js";
import {
  fillStorageForm,
  clearCredentialFields,
  findProviderConnection,
  saveProviderConnection,
} from "./storageConnections.js";

export class ProfileStorageController {
  constructor(mainController) {
    this.mainController = mainController;

    this.storageUnlockBtn = null;
    this.storageSaveBtn = null;
    this.storageTestBtn = null;
    this.storageClearBtn = null;
    this.storageUnlockSection = null;
    this.storageFormSection = null;
    this.storageStatusText = null;
    this.storageFormStatus = null;

    this.storageProviderInput = null;
    this.storageEndpointInput = null;
    this.storageRegionInput = null;
    this.storageAccessKeyInput = null;
    this.storageSecretKeyInput = null;
    this.storageBucketInput = null;
    this.storagePrefixInput = null;
    this.storagePrefixWarning = null;
    this.storageDefaultInput = null;
    this.storageR2Helper = null;
    this.storageB2Helper = null;
    this.storageS3Helper = null;
    // Provider-aware CORS setup helper modal — owns its own DOM + behavior.
    this.corsHelp = new StorageCorsHelp({
      getProvider: () => this.storageProviderInput?.value || "cloudflare_r2",
      getBucket: () => this.storageBucketInput?.value?.trim() || "",
      getRegion: () => this.storageRegionInput?.value?.trim() || "",
      getEndpoint: () => this.storageEndpointInput?.value?.trim() || "",
    });
    this.storageForcePathStyleInput = null;
    this.storageForcePathStyleLabel = null;

    this.storageSyncSection = null;
    this.storageSyncToggle = null;
    this.storageSyncRestoreBtn = null;
    this.storageSyncStatus = null;

    this.storageUnlockFailure = null;
  }

  cacheDomReferences() {
    this.storageUnlockBtn = document.getElementById("profileStorageUnlockBtn") || null;
    this.storageSaveBtn = document.getElementById("storageSaveBtn") || null;
    this.storageTestBtn = document.getElementById("storageTestBtn") || null;
    this.storageClearBtn = document.getElementById("storageClearBtn") || null;
    this.storageUnlockSection = document.getElementById("profileStorageUnlock") || null;
    this.storageFormSection = document.getElementById("profileStorageForm") || null;
    this.storageStatusText = document.getElementById("profileStorageStatus") || null;
    this.storageFormStatus = document.getElementById("storageFormStatus") || null;

    this.storageProviderInput = document.getElementById("storageProvider") || null;
    this.storageEndpointInput = document.getElementById("storageEndpoint") || null;
    this.storageRegionInput = document.getElementById("storageRegion") || null;
    this.storageAccessKeyInput = document.getElementById("storageAccessKey") || null;
    this.storageSecretKeyInput = document.getElementById("storageSecretKey") || null;
    this.storageBucketInput = document.getElementById("storageBucket") || null;
    this.storagePrefixInput = document.getElementById("storagePrefix") || null;
    this.storagePrefixWarning = document.getElementById("storagePrefixWarning") || null;
    this.storageDefaultInput = document.getElementById("storageDefault") || null;
    this.storageR2Helper = document.getElementById("storageR2Helper") || null;
    this.storageB2Helper = document.getElementById("storageB2Helper") || null;
    this.storageS3Helper = document.getElementById("storageS3Helper") || null;
    this.corsHelp.cacheDom(document);
    this.storageForcePathStyleInput = document.getElementById("storageForcePathStyle") || null;
    this.storageForcePathStyleLabel = document.getElementById("storageForcePathStyleLabel") || null;
    this.storageSyncSection = document.getElementById("profileStorageSync") || null;
    this.storageSyncToggle = document.getElementById("storageSyncToggle") || null;
    this.storageSyncRestoreBtn = document.getElementById("storageSyncRestoreBtn") || null;
    this.storageSyncStatus = document.getElementById("storageSyncStatus") || null;
  }

  registerEventListeners() {
    if (this.storageUnlockBtn instanceof HTMLElement) {
      this.storageUnlockBtn.addEventListener("click", () => {
        void this.handleUnlockStorage();
      });
    }

    if (this.storageSaveBtn instanceof HTMLElement) {
      this.storageSaveBtn.addEventListener("click", () => {
        void this.handleSaveStorage();
      });
    }

    if (this.storageTestBtn instanceof HTMLElement) {
      this.storageTestBtn.addEventListener("click", () => {
        void this.handleTestStorage();
      });
    }

    if (this.storageClearBtn instanceof HTMLElement) {
      this.storageClearBtn.addEventListener("click", () => {
        void this.handleClearStorage();
      });
    }

    if (this.storageProviderInput instanceof HTMLElement) {
      this.storageProviderInput.addEventListener("change", () => {
        void this.handleProviderChange();
      });
    }

    if (this.storagePrefixInput instanceof HTMLElement) {
      this.storagePrefixInput.addEventListener("input", () => {
        this.handlePublicUrlInput();
      });
    }

    if (this.storageSyncToggle instanceof HTMLElement) {
      this.storageSyncToggle.addEventListener("change", () => {
        void this.handleToggleSync();
      });
    }

    if (this.storageSyncRestoreBtn instanceof HTMLElement) {
      this.storageSyncRestoreBtn.addEventListener("click", () => {
        void this.handleRestoreSync();
      });
    }

    this.corsHelp.registerEventListeners();
  }

  async populateStoragePane() {
    const storageService = this.mainController.services.storageService;
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );

    this.handleClearStorage();

    if (!pubkey) {
      // Not logged in
      if (this.storageUnlockSection) this.storageUnlockSection.classList.add("hidden");
      if (this.storageFormSection) this.storageFormSection.classList.add("hidden");
      if (this.storageStatusText) {
        this.storageStatusText.textContent = "Please login to manage storage.";
        this.storageStatusText.className = "text-xs text-status-danger";
      }
      return;
    }

    let isUnlocked = storageService && storageService.masterKeys.has(pubkey);

    // Auto-unlock
    if (!isUnlocked && storageService && !this.storageUnlockFailure) {
      const signer = getActiveSigner();
      if (
        signer &&
        (typeof signer.nip44Decrypt === "function" ||
          typeof signer.nip04Decrypt === "function")
      ) {
        try {
          await storageService.unlock(pubkey, { signer });
          isUnlocked = storageService.masterKeys.has(pubkey);
        } catch (autoUnlockError) {
          devLogger.log(
            "[ProfileModal] Auto-unlock storage skipped:",
            autoUnlockError?.message || autoUnlockError
          );
        }
      }
    }

    if (this.storageStatusText) {
      if (isUnlocked) {
        this.storageStatusText.textContent = "Unlocked";
        this.storageStatusText.className = "text-xs text-status-success";
      } else if (this.storageUnlockFailure?.message) {
        this.storageStatusText.textContent = `Locked (${this.storageUnlockFailure.message})`;
        this.storageStatusText.className = "text-xs text-status-danger";
      } else if (this.getLockedStoredNsecSession(pubkey)) {
        // Saved nsec key not yet re-unlocked after reload — point the user at the fix.
        this.storageStatusText.textContent =
          "Locked — re-unlock your saved key (Login → passphrase) to manage storage.";
        this.storageStatusText.className = "text-xs text-status-warning";
      } else {
        this.storageStatusText.textContent = "Locked";
        this.storageStatusText.className = "text-xs text-status-warning";
      }
    }

    if (isUnlocked) {
      if (this.storageUnlockSection)
        this.storageUnlockSection.classList.add("hidden");
      if (this.storageFormSection)
        this.storageFormSection.classList.remove("hidden");

      try {
        const connections = await storageService.listConnections(pubkey);
        const defaultConn = connections.find((c) => c.meta?.defaultForUploads);
        const targetConn = defaultConn || connections[0];

        if (targetConn) {
          const conn = await storageService.getConnection(
            pubkey,
            targetConn.id
          );
          if (conn) {
            fillStorageForm(this, conn);
            if (this.storageStatusText) {
              const label = conn.meta?.label || conn.provider || "S3";
              this.storageStatusText.textContent = `Unlocked (${label})`;
            }
          }
        }
      } catch (error) {
        devLogger.error("Failed to load storage connections:", error);
      }
    } else {
      if (this.storageUnlockSection)
        this.storageUnlockSection.classList.remove("hidden");
      if (this.storageFormSection)
        this.storageFormSection.classList.add("hidden");
    }

    this.renderSyncSection(isUnlocked ? pubkey : "");
    this.updateStorageFormVisibility();
  }

  confirmSyncOverwrite() {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return true;
    }
    return window.confirm(
      "A newer copy of your storage settings is on your account (changed on " +
        "another device). Overwrite it with this one?"
    );
  }

  renderSyncSection(pubkey) {
    if (!(this.storageSyncSection instanceof HTMLElement)) {
      return;
    }
    // Only meaningful once unlocked: there is something to sync and the signer
    // that encrypts is present.
    if (!pubkey || !storageSyncService.isAvailable()) {
      this.storageSyncSection.classList.add("hidden");
      return;
    }
    this.storageSyncSection.classList.remove("hidden");
    if (this.storageSyncToggle instanceof HTMLInputElement) {
      this.storageSyncToggle.checked = storageSyncService.isEnabled(pubkey);
    }
    this.setSyncStatus("");
  }

  setSyncStatus(message, tone = "info") {
    if (!(this.storageSyncStatus instanceof HTMLElement)) {
      return;
    }
    this.storageSyncStatus.textContent = message || "";
    const toneClass =
      tone === "success"
        ? "text-status-success"
        : tone === "error"
          ? "text-status-danger"
          : "text-muted";
    this.storageSyncStatus.className = `text-xs ${toneClass}`;
  }

  async handleToggleSync() {
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!pubkey) {
      return;
    }
    const enabled =
      this.storageSyncToggle instanceof HTMLInputElement
        ? this.storageSyncToggle.checked
        : false;
    try {
      if (enabled) {
        this.setSyncStatus("Encrypting and publishing…");
        const result = await storageSyncService.enable(pubkey, {
          confirmOverwrite: () => this.confirmSyncOverwrite(),
        });
        if (result?.ok) {
          this.setSyncStatus(
            `Synced to ${result.accepted}/${result.total} relays.`,
            "success"
          );
          this.mainController.showSuccess("Storage settings synced (encrypted).");
        } else if (result?.conflict) {
          // User declined to overwrite a newer copy from another device.
          this.setSyncStatus(
            "Kept the newer copy on your account. Use Restore to pull it, or save again to overwrite.",
          );
        } else {
          // Roll the toggle back so it reflects reality.
          if (this.storageSyncToggle instanceof HTMLInputElement) {
            this.storageSyncToggle.checked = false;
          }
          await storageSyncService.disable(pubkey).catch(() => {});
          this.setSyncStatus(
            result?.error === "nothing-to-sync"
              ? "Nothing to sync yet — save a connection first."
              : "Could not publish the encrypted copy. Try again.",
            "error"
          );
        }
      } else {
        this.setSyncStatus("Removing the synced copy…");
        await storageSyncService.disable(pubkey);
        this.setSyncStatus("Sync turned off; the synced copy was cleared.");
        this.mainController.showSuccess("Storage sync turned off.");
      }
    } catch (error) {
      devLogger.error("[ProfileModal] Storage sync toggle failed:", error);
      this.setSyncStatus("Sync failed. Please try again.", "error");
    }
  }

  async handleRestoreSync() {
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!pubkey) {
      return;
    }
    try {
      this.setSyncStatus("Fetching and decrypting…");
      const result = await storageSyncService.pull(pubkey);
      if (result?.found && result.imported) {
        this.setSyncStatus("Restored from your Nostr account.", "success");
        this.mainController.showSuccess("Storage settings restored.");
        // Re-render the pane so the restored connection shows.
        await this.populateStoragePane();
      } else if (result?.found && !result.imported) {
        this.setSyncStatus("Found a copy but could not import it.", "error");
      } else if (result?.cleared) {
        this.setSyncStatus("No synced settings found (it was cleared).");
      } else {
        this.setSyncStatus("No synced settings found on your account.");
      }
    } catch (error) {
      devLogger.error("[ProfileModal] Storage sync restore failed:", error);
      this.setSyncStatus("Restore failed. Please try again.", "error");
    }
  }

  // Load the saved connection for the newly-selected provider so each provider keeps
  // its own credentials; clear the credential fields when that provider has none yet.
  async handleProviderChange() {
    this.updateStorageFormVisibility();
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey(),
    );
    const storageService = this.mainController.services?.storageService;
    if (!pubkey || !storageService || !storageService.isUnlocked?.(pubkey)) {
      return;
    }
    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    try {
      const connections = await storageService.listConnections(pubkey);
      const match = findProviderConnection(connections, provider);
      if (match) {
        const conn = await storageService.getConnection(pubkey, match.id);
        if (conn) {
          fillStorageForm(this, conn);
          return;
        }
      }
      clearCredentialFields(this);
    } catch (error) {
      devLogger.warn("[ProfileModal] Failed to load connection for provider:", error);
    }
  }

  handlePublicUrlInput() {
    if (!this.storagePrefixInput || !this.storagePrefixWarning) return;
    this.storagePrefixWarning.textContent = "";
    this.storagePrefixWarning.classList.add("hidden");
  }

  updateStorageFormVisibility() {
    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    const isR2 = provider === "cloudflare_r2";
    // B2 derives its endpoint from the region, so its raw Endpoint field is hidden.
    const isB2 = provider === PROVIDERS.B2;

    if (this.storageEndpointInput) {
      const label =
        this.storageEndpointInput.parentElement.querySelector("span");
      if (isR2) {
        if (label) label.textContent = "Cloudflare Account ID";
        this.storageEndpointInput.placeholder =
          "Account ID from Cloudflare dashboard";
        this.storageEndpointInput.parentElement.classList.remove("hidden");
        this.storageEndpointInput.type = "text";
        if (this.storagePrefixInput) {
          this.storagePrefixInput.placeholder = "https://pub-xxx.r2.dev";
        }
      } else if (isB2) {
        // Endpoint is derived from the region; hide the raw endpoint input.
        this.storageEndpointInput.parentElement.classList.add("hidden");
        if (this.storagePrefixInput) {
          this.storagePrefixInput.placeholder =
            "Optional — derived from region/bucket (or your CDN domain)";
        }
      } else {
        if (label) label.textContent = "Endpoint URL";
        this.storageEndpointInput.placeholder = "https://s3.example.com";
        this.storageEndpointInput.parentElement.classList.remove("hidden");
        this.storageEndpointInput.type = "url";
        if (this.storagePrefixInput) {
          this.storagePrefixInput.placeholder = "https://cdn.example.com";
        }
      }
    }

    if (this.storageRegionInput && isB2) {
      this.storageRegionInput.placeholder = "us-west-004";
    } else if (this.storageRegionInput) {
      this.storageRegionInput.placeholder = "auto";
    }

    // B2 calls the secret an "Application Key" — match its terminology.
    const secretLabel =
      this.storageSecretKeyInput?.parentElement?.querySelector("span");
    if (secretLabel) {
      secretLabel.textContent = isB2 ? "Application Key" : "Secret Access Key";
    }

    if (this.storageR2Helper) {
      this.storageR2Helper.classList.toggle("hidden", !isR2);
    }

    if (this.storageB2Helper) {
      this.storageB2Helper.classList.toggle("hidden", !isB2);
    }

    if (this.storageS3Helper) {
      // Generic/custom S3 helper only — not R2, not B2 (each has its own helper).
      this.storageS3Helper.classList.toggle("hidden", isR2 || isB2);
    }

    if (this.storageForcePathStyleLabel) {
      // Force-path-style is a generic-S3 knob; R2 and B2 fix it internally.
      const showForcePathStyle = !isR2 && !isB2;
      this.storageForcePathStyleLabel.classList.toggle(
        "hidden",
        !showForcePathStyle,
      );
      this.storageForcePathStyleLabel.classList.toggle(
        "flex",
        showForcePathStyle,
      );
    }

    this.corsHelp.setVisible(true); // provider-aware; useful for all bucket providers
  }

  getStorageUnlockFailureMessage(error) {
    const code = typeof error?.code === "string" ? error.code : "";

    switch (code) {
      case "storage-unlock-permission-denied":
        return "Storage unlock requires extension encryption permission. Approve the prompt, then retry unlock.";
      case "storage-unlock-no-decryptor":
        return "Your signer cannot decrypt storage keys. Use a signer with NIP-44 or NIP-04 decrypt support.";
      case "storage-unlock-locked-nsec-session":
        return "Your saved key is locked after reloading the page. Open the Login menu and re-enter your passphrase to unlock your saved key, then unlock storage.";
      case "storage-unlock-decrypt-failed":
        return "Unable to decrypt your saved storage key. Retry unlock and confirm the active account matches.";
      default:
        return typeof error?.message === "string" && error.message.trim()
          ? error.message
          : "Failed to unlock storage. Ensure your signer supports NIP-04/44.";
    }
  }

  setStorageUnlockFailureState(error) {
    const code =
      typeof error?.code === "string"
        ? error.code
        : "storage-unlock-decrypt-failed";
    const message = this.getStorageUnlockFailureMessage(error);

    this.storageUnlockFailure = { code, message };

    if (this.storageStatusText) {
      this.storageStatusText.textContent = `Locked (${message})`;
      this.storageStatusText.className = "text-xs text-status-danger";
    }

    this.setStorageFormStatus(message, "error");
  }

  clearStorageUnlockFailureState() {
    this.storageUnlockFailure = null;
  }

  // After a page reload, a persisted nsec session restores the logged-in pubkey + UI
  // but NOT the in-memory signer (the key is passphrase-encrypted). Storage unlock then
  // has no usable signer, and the generic "No active signer" error is misleading.
  // Detect this exact case (a saved nsec key for the account we're unlocking).
  getLockedStoredNsecSession(pubkey) {
    const client = this.mainController.services?.nostrClient;
    if (!client || typeof client.getStoredSessionActorMetadata !== "function") {
      return null;
    }
    let meta = null;
    try {
      meta = client.getStoredSessionActorMetadata();
    } catch (error) {
      return null;
    }
    if (!meta || meta.hasEncryptedKey !== true || meta.source !== "nsec") {
      return null;
    }
    const metaPubkey = this.mainController.normalizeHexPubkey(meta.pubkey);
    // Only treat it as "this account is locked" when the saved key is for the pubkey
    // we're actually trying to unlock (don't hijack a different-account situation).
    if (pubkey && metaPubkey && metaPubkey !== pubkey) {
      return null;
    }
    return meta;
  }

  reportLockedNsecSession({ autoOpenLogin = false } = {}) {
    userLogger.info(
      "[storage-unlock] saved nsec key is locked (no in-memory signer after reload); prompting re-unlock.",
    );
    const error = new Error(
      "Your saved key is locked after reloading the page. Re-enter your passphrase from the Login menu to unlock it, then unlock storage.",
    );
    error.code = "storage-unlock-locked-nsec-session";
    this.setStorageUnlockFailureState(error);
    this.mainController.showError(this.getStorageUnlockFailureMessage(error));

    // On an explicit "Unlock Storage" click, open the login modal's unlock-saved-key
    // (passphrase) flow so the user re-unlocks in one step (not from passive render).
    if (autoOpenLogin) {
      const openLoginModal = this.mainController.services?.openLoginModal;
      if (typeof openLoginModal === "function") {
        try {
          openLoginModal();
        } catch (openError) {
          devLogger.warn(
            "[ProfileModal] Failed to open login modal for saved-key unlock:",
            openError,
          );
        }
      }
    }
  }

  async requestStorageUnlockPermissions() {
    const client = this.mainController.services?.nostrClient;
    if (!client || typeof client.ensureExtensionPermissions !== "function") {
      return { ok: true };
    }

    return client.ensureExtensionPermissions(DEFAULT_NIP07_ENCRYPTION_METHODS, {
      context: "storage-unlock",
      statusMessage:
        "Approve the extension prompt to allow storage encryption/decryption.",
      showSpinner: true,
    });
  }

  async handleUnlockStorage() {
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!pubkey) return;

    let signer = getActiveSigner();
    if (
      !signer &&
      this.mainController.services.nostrClient &&
      typeof this.mainController.services.nostrClient
        .ensureActiveSignerForPubkey === "function"
    ) {
      try {
        signer = await this.mainController.services.nostrClient.ensureActiveSignerForPubkey(
          pubkey
        );
      } catch (error) {
        devLogger.warn(
          "[ProfileModal] Failed to resolve signer for storage unlock:",
          error
        );
      }
    }

    if (!signer) {
      if (this.getLockedStoredNsecSession(pubkey)) {
        this.reportLockedNsecSession({ autoOpenLogin: true });
        return;
      }
      this.mainController.showError("No active signer found. Please login.");
      return;
    }

    if (
      signer.pubkey &&
      this.mainController.normalizeHexPubkey(signer.pubkey) !== pubkey
    ) {
      this.mainController.showError(
        `Signer account (${signer.pubkey.slice(
          0,
          8
        )}...) does not match profile (${pubkey.slice(
          0,
          8
        )}...). Please switch accounts in your extension.`
      );
      return;
    }

    const storageService = this.mainController.services.storageService;
    if (!storageService) {
      this.mainController.showError("Storage service unavailable.");
      return;
    }

    const signerType =
      typeof signer?.type === "string"
        ? signer.type.trim().toLowerCase()
        : "";
    const isExtensionSigner =
      signerType === "extension" || signerType === "nip07";

    const shouldForcePermissionRetry =
      this.storageUnlockBtn?.dataset?.retryAction === "request-permissions";

    if (shouldForcePermissionRetry) {
      const extensionPermissionCache = this.mainController.services?.nostrClient
        ?.extensionPermissionCache;
      if (extensionPermissionCache instanceof Set) {
        for (const method of DEFAULT_NIP07_ENCRYPTION_METHODS) {
          extensionPermissionCache.delete(method);
        }
      }
    }

    if (isExtensionSigner) {
      const permissionResult = await this.requestStorageUnlockPermissions();
      if (!permissionResult?.ok) {
        const permissionError =
          permissionResult?.error ||
          new Error("Extension permissions denied.");
        permissionError.code = "storage-unlock-permission-denied";
        this.setStorageUnlockFailureState(permissionError);
        this.mainController.showError(
          this.getStorageUnlockFailureMessage(permissionError)
        );
        if (this.storageUnlockBtn) {
          this.storageUnlockBtn.dataset.retryAction = "request-permissions";
          this.storageUnlockBtn.textContent = "Retry Permissions + Unlock";
        }
        return;
      }
    }

    const hasNip44Decrypt = typeof signer?.nip44Decrypt === "function";
    const hasNip04Decrypt =
      typeof signer?.nip04Decrypt === "function" ||
      typeof signer?.decrypt === "function";

    if (!hasNip44Decrypt && !hasNip04Decrypt) {
      // A restored-but-locked persisted nsec session can leave a decrypt-less stub
      // signer; route it to the re-unlock guidance rather than the generic message.
      if (this.getLockedStoredNsecSession(pubkey)) {
        this.reportLockedNsecSession({ autoOpenLogin: true });
        return;
      }
      const missingDecryptError = new Error(
        "This signer cannot decrypt storage keys (NIP-44/NIP-04 missing)."
      );
      missingDecryptError.code = "storage-unlock-no-decryptor";
      this.setStorageUnlockFailureState(missingDecryptError);
      this.mainController.showError(
        this.getStorageUnlockFailureMessage(missingDecryptError)
      );
      return;
    }

    if (this.storageUnlockBtn) {
      this.storageUnlockBtn.disabled = true;
      this.storageUnlockBtn.textContent = "Unlocking...";
    }

    try {
      await storageService.unlock(pubkey, { signer });
      this.clearStorageUnlockFailureState();
      this.mainController.showSuccess("Storage unlocked.");
      this.populateStoragePane();
    } catch (error) {
      devLogger.error("Failed to unlock storage:", error);
      this.setStorageUnlockFailureState(error);
      this.mainController.showError(this.getStorageUnlockFailureMessage(error));
      if (this.storageUnlockBtn) {
        this.storageUnlockBtn.dataset.retryAction = "request-permissions";
      }
    } finally {
      if (this.storageUnlockBtn) {
        this.storageUnlockBtn.disabled = false;
        const shouldShowRetry =
          this.storageUnlockFailure?.code === "storage-unlock-permission-denied";
        if (shouldShowRetry) {
          this.storageUnlockBtn.textContent = "Retry Permissions + Unlock";
          this.storageUnlockBtn.dataset.retryAction = "request-permissions";
        } else {
          this.storageUnlockBtn.textContent = "Unlock Storage";
          delete this.storageUnlockBtn.dataset.retryAction;
        }
      }
    }
  }

  async handleSaveStorage() {
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!pubkey) return;

    const storageService = this.mainController.services.storageService;
    if (!storageService) return;

    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    let endpointOrAccount = this.storageEndpointInput?.value?.trim() || "";
    const region = this.storageRegionInput?.value?.trim() || "auto";
    const accessKeyId = this.storageAccessKeyInput?.value?.trim() || "";
    const secretAccessKey = this.storageSecretKeyInput?.value?.trim() || "";
    const bucket = this.storageBucketInput?.value?.trim() || "";
    const prefix = this.storagePrefixInput?.value?.trim() || "";
    const isDefault = this.storageDefaultInput?.checked || false;

    if (provider === PROVIDERS.B2) {
      endpointOrAccount = deriveB2Endpoint(region); // derived from region for B2
      if (!endpointOrAccount) {
        this.setStorageFormStatus(
          "Enter your Backblaze B2 region (e.g. us-west-004).",
          "error",
        );
        return;
      }
    }

    if (!accessKeyId || !secretAccessKey || !bucket || !endpointOrAccount) {
      this.setStorageFormStatus("Please fill in all required fields.", "error");
      return;
    }

    if (
      provider === "cloudflare_r2" &&
      (prefix.includes(".r2.cloudflarestorage.com") ||
        prefix.includes(".s3.") ||
        prefix.includes(".amazonaws.com"))
    ) {
      this.setStorageFormStatus(
        "Invalid Public URL. Please use your R2.dev or custom domain.",
        "error"
      );
      return;
    }

    let publicBaseUrl = "";
    let forcePathStyle = false;
    if (provider === PROVIDERS.GENERIC) {
      forcePathStyle = this.storageForcePathStyleInput?.checked ?? true;
    }

    const payload = {
      provider,
      accessKeyId,
      secretAccessKey,
    };

    if (provider === "cloudflare_r2") {
      payload.accountId = endpointOrAccount;
    } else {
      try {
        const normalized = await prepareS3Connection({
          endpoint: endpointOrAccount,
          region,
          accessKeyId,
          secretAccessKey,
          bucket,
          forcePathStyle,
          // Explicit Public Access URL (custom domain/CDN); blank → derived.
          publicBaseUrl: prefix || undefined,
          origins: getCorsOrigins(),
        });
        endpointOrAccount = normalized.endpoint;
        publicBaseUrl = normalized.publicBaseUrl;
        forcePathStyle = normalized.forcePathStyle;
      } catch (error) {
        devLogger.error("Failed to validate S3 connection:", error);
        this.setStorageFormStatus(
          error?.message || "Invalid S3 configuration.",
          "error"
        );
        return;
      }

      payload.endpoint = endpointOrAccount;
      payload.forcePathStyle = forcePathStyle;
    }

    const meta = {
      provider,
      region,
      bucket,
      prefix,
      defaultForUploads: isDefault,
      label: `${provider} - ${bucket}`,
      endpoint: provider === "cloudflare_r2" ? undefined : endpointOrAccount,
    };

    if (provider === "cloudflare_r2") {
      meta.accountId = endpointOrAccount;
      meta.publicBaseUrl = prefix;
      meta.baseDomain = prefix;
    } else {
      meta.publicBaseUrl = publicBaseUrl;
      meta.baseDomain = publicBaseUrl;
      meta.forcePathStyle = forcePathStyle;
    }

    this.setStorageFormStatus("Saving...", "info");

    try {
      // One slot per provider type so providers don't overwrite or clash.
      await saveProviderConnection(storageService, pubkey, {
        provider,
        payload,
        meta,
        isDefault,
      });
      this.setStorageFormStatus("Connection saved.", "success");
      this.mainController.showSuccess("Storage connection saved.");

      // Keep the encrypted synced copy current if the user opted in. Warn before
      // overwriting a newer copy changed on another device.
      if (storageSyncService.isEnabled(pubkey)) {
        try {
          const syncResult = await storageSyncService.push(pubkey, {
            confirmOverwrite: () => this.confirmSyncOverwrite(),
          });
          if (syncResult?.ok) {
            this.setSyncStatus("Synced copy updated.", "success");
          } else if (syncResult?.conflict) {
            this.setSyncStatus(
              "Synced copy on your account is newer — not overwritten.",
            );
          }
        } catch (syncError) {
          devLogger.warn("[ProfileModal] Storage re-sync after save failed:", syncError);
        }
      }
    } catch (error) {
      devLogger.error("Failed to save connection:", error);
      this.setStorageFormStatus("Failed to save connection.", "error");
    }
  }

  async handleTestStorage() {
    const pubkey = this.mainController.normalizeHexPubkey(
      this.mainController.getActivePubkey()
    );
    if (!pubkey) return;

    const storageService = this.mainController.services.storageService;
    if (!storageService) {
      this.setStorageFormStatus("Storage service unavailable.", "error");
      return;
    }

    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    let endpointOrAccount = this.storageEndpointInput?.value?.trim() || "";
    const region = this.storageRegionInput?.value?.trim() || "auto";
    const accessKeyId = this.storageAccessKeyInput?.value?.trim() || "";
    const secretAccessKey = this.storageSecretKeyInput?.value?.trim() || "";
    const bucket = this.storageBucketInput?.value?.trim() || "";

    const forcePathStyle =
      provider === PROVIDERS.GENERIC
        ? this.storageForcePathStyleInput?.checked ?? true
        : false;

    const publicBaseUrl = this.storagePrefixInput?.value?.trim() || "";

    if (provider === PROVIDERS.B2) {
      endpointOrAccount = deriveB2Endpoint(region); // derived from region for B2
      if (!endpointOrAccount) {
        this.setStorageFormStatus(
          "Enter your Backblaze B2 region (e.g. us-west-004) to test.",
          "error",
        );
        return;
      }
    }

    if (!accessKeyId || !secretAccessKey || !endpointOrAccount) {
      this.setStorageFormStatus("Missing credentials for test.", "error");
      return;
    }

    if (
      provider === "cloudflare_r2" &&
      (publicBaseUrl.includes(".r2.cloudflarestorage.com") ||
        publicBaseUrl.includes(".s3.") ||
        publicBaseUrl.includes(".amazonaws.com"))
    ) {
      this.setStorageFormStatus(
        "Invalid Public URL. Please use your R2.dev or custom domain.",
        "error"
      );
      return;
    }

    this.setStorageFormStatus("Testing connection...", "info");

    const config = {
      provider,
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
    };

    if (provider === "cloudflare_r2") {
      config.accountId = endpointOrAccount;
      config.publicBaseUrl = publicBaseUrl;
      config.baseDomain = publicBaseUrl;
    } else {
      config.endpoint = endpointOrAccount;
      config.forcePathStyle = forcePathStyle;
      // Explicit Public Access URL, else derive it (so the test doesn't falsely warn).
      config.publicBaseUrl =
        publicBaseUrl ||
        derivePublicBaseUrl({ endpoint: endpointOrAccount, bucket, forcePathStyle });
      config.baseDomain = config.publicBaseUrl;
    }

    try {
      const result = await storageService.testAccess(provider, config);
      if (result.success) {
        this.setStorageFormStatus(
          result.message || "Connection Verified!",
          "success"
        );
      } else {
        this.setStorageFormStatus(`Test Failed: ${result.error}`, "error");
      }
    } catch (error) {
      this.setStorageFormStatus(`Test Error: ${error.message}`, "error");
    }
  }

  handleClearStorage() {
    if (this.storageEndpointInput) this.storageEndpointInput.value = "";
    if (this.storageRegionInput) this.storageRegionInput.value = "auto";
    if (this.storageAccessKeyInput) this.storageAccessKeyInput.value = "";
    if (this.storageSecretKeyInput) this.storageSecretKeyInput.value = "";
    if (this.storageBucketInput) this.storageBucketInput.value = "";
    if (this.storagePrefixInput) this.storagePrefixInput.value = "";
    if (this.storageDefaultInput) this.storageDefaultInput.checked = false;
    if (this.storageProviderInput) this.storageProviderInput.value = "cloudflare_r2";
    if (this.storageForcePathStyleInput) {
      this.storageForcePathStyleInput.checked = true;
    }
    this.updateStorageFormVisibility();
    this.setStorageFormStatus("", "info");
  }

  setStorageFormStatus(message, variant = "info") {
    if (!this.storageFormStatus) return;
    this.storageFormStatus.textContent = message;
    this.storageFormStatus.className = `text-sm text-status-${variant}`;
  }
}
