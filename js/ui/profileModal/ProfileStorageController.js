import { devLogger } from "../../utils/logger.js";
import { PROVIDERS } from "../../services/storageService.js";
import {
  prepareS3Connection,
  getCorsOrigins,
} from "../../services/s3Service.js";
import { getActiveSigner } from "../../nostr/client.js";
import { DEFAULT_NIP07_ENCRYPTION_METHODS } from "../../nostr/nip07Permissions.js";

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
    this.storageS3Helper = null;
    this.storageForcePathStyleInput = null;
    this.storageForcePathStyleLabel = null;

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
    this.storageS3Helper = document.getElementById("storageS3Helper") || null;
    this.storageForcePathStyleInput = document.getElementById("storageForcePathStyle") || null;
    this.storageForcePathStyleLabel = document.getElementById("storageForcePathStyleLabel") || null;
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
        this.updateStorageFormVisibility();
      });
    }

    if (this.storagePrefixInput instanceof HTMLElement) {
      this.storagePrefixInput.addEventListener("input", () => {
        this.handlePublicUrlInput();
      });
    }
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
            this.fillStorageForm(conn);
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

    this.updateStorageFormVisibility();
  }

  fillStorageForm(conn) {
    if (!conn) return;
    const {
      provider,
      accessKeyId,
      secretAccessKey,
      accountId: payloadAccountId,
      endpoint: payloadEndpoint,
      forcePathStyle: payloadForcePathStyle,
    } = conn;
    const {
      endpoint,
      region,
      bucket,
      prefix,
      defaultForUploads,
      accountId,
      forcePathStyle: metaForcePathStyle,
    } = conn.meta || {};

    if (this.storageProviderInput)
      this.storageProviderInput.value = provider || "cloudflare_r2";

    const resolvedEndpoint =
      endpoint || accountId || payloadAccountId || payloadEndpoint || "";

    if (this.storageEndpointInput)
      this.storageEndpointInput.value = resolvedEndpoint;
    if (this.storageRegionInput)
      this.storageRegionInput.value = region || "auto";
    if (this.storageAccessKeyInput)
      this.storageAccessKeyInput.value = accessKeyId || "";
    if (this.storageSecretKeyInput)
      this.storageSecretKeyInput.value = secretAccessKey || "";
    if (this.storageBucketInput) this.storageBucketInput.value = bucket || "";
    if (this.storagePrefixInput) this.storagePrefixInput.value = prefix || "";
    if (this.storageDefaultInput)
      this.storageDefaultInput.checked = !!defaultForUploads;

    if (this.storageForcePathStyleInput) {
      if (typeof payloadForcePathStyle === "boolean") {
        this.storageForcePathStyleInput.checked = payloadForcePathStyle;
      } else if (typeof metaForcePathStyle === "boolean") {
        this.storageForcePathStyleInput.checked = metaForcePathStyle;
      } else {
        this.storageForcePathStyleInput.checked = true;
      }
    }

    this.updateStorageFormVisibility();
    this.handlePublicUrlInput();
  }

  handlePublicUrlInput() {
    if (!this.storagePrefixInput || !this.storagePrefixWarning) return;
    this.storagePrefixWarning.textContent = "";
    this.storagePrefixWarning.classList.add("hidden");
  }

  updateStorageFormVisibility() {
    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    const isR2 = provider === "cloudflare_r2";

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

    if (this.storageR2Helper) {
      if (isR2) this.storageR2Helper.classList.remove("hidden");
      else this.storageR2Helper.classList.add("hidden");
    }

    if (this.storageS3Helper) {
      if (!isR2) this.storageS3Helper.classList.remove("hidden");
      else this.storageS3Helper.classList.add("hidden");
    }

    if (this.storageForcePathStyleLabel) {
      if (!isR2)
        this.storageForcePathStyleLabel.classList.remove("hidden", "flex");
      else this.storageForcePathStyleLabel.classList.add("hidden");

      if (!isR2) {
        this.storageForcePathStyleLabel.classList.add("flex");
      }
    }
  }

  getStorageUnlockFailureMessage(error) {
    const code = typeof error?.code === "string" ? error.code : "";

    switch (code) {
      case "storage-unlock-permission-denied":
        return "Storage unlock requires extension encryption permission. Approve the prompt, then retry unlock.";
      case "storage-unlock-no-decryptor":
        return "Your signer cannot decrypt storage keys. Use a signer with NIP-44 or NIP-04 decrypt support.";
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
      await storageService.saveConnection(pubkey, "default", payload, meta);
      this.setStorageFormStatus("Connection saved.", "success");
      this.mainController.showSuccess("Storage connection saved.");
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
    const endpointOrAccount = this.storageEndpointInput?.value?.trim() || "";
    const region = this.storageRegionInput?.value?.trim() || "auto";
    const accessKeyId = this.storageAccessKeyInput?.value?.trim() || "";
    const secretAccessKey = this.storageSecretKeyInput?.value?.trim() || "";
    const bucket = this.storageBucketInput?.value?.trim() || "";

    const forcePathStyle =
      provider === PROVIDERS.GENERIC
        ? this.storageForcePathStyleInput?.checked ?? true
        : false;

    const publicBaseUrl = this.storagePrefixInput?.value?.trim() || "";

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
    this.storageEndpointInput.value = "";
    this.storageRegionInput.value = "auto";
    this.storageAccessKeyInput.value = "";
    this.storageSecretKeyInput.value = "";
    this.storageBucketInput.value = "";
    this.storagePrefixInput.value = "";
    this.storageDefaultInput.checked = false;
    this.storageProviderInput.value = "cloudflare_r2";
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
