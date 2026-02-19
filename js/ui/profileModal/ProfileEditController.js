import { buildProfileMetadataEvent } from "../../nostrEventSchemas.js";
import { buildPublicUrl, buildR2Key } from "../../r2.js";
import { devLogger } from "../../utils/logger.js";

export class ProfileEditController {
  constructor(mainController) {
    this.mainController = mainController;

    this.profileEditBtn = null;
    this.profileEditBackBtn = null;
    this.editNameInput = null;
    this.editDisplayNameInput = null;
    this.editAboutInput = null;
    this.editWebsiteInput = null;
    this.editNip05Input = null;
    this.editLud16Input = null;
    this.editPictureInput = null;
    this.editBannerInput = null;

    this.editPictureFile = null;
    this.editPictureUploadBtn = null;
    this.editPictureStorageHint = null;
    this.editPictureConfigureLink = null;

    this.editBannerFile = null;
    this.editBannerUploadBtn = null;
    this.editBannerStorageHint = null;
    this.editBannerConfigureLink = null;

    this.editSaveBtn = null;
    this.editCancelBtn = null;
    this.editStatusText = null;
  }

  cacheDomReferences() {
    this.profileEditBtn = document.getElementById("profileEditBtn") || null;
    this.profileEditBackBtn = document.getElementById("profileEditBackBtn") || null;

    this.editNameInput = document.getElementById("editNameInput") || null;
    this.editDisplayNameInput = document.getElementById("editDisplayNameInput") || null;
    this.editAboutInput = document.getElementById("editAboutInput") || null;
    this.editWebsiteInput = document.getElementById("editWebsiteInput") || null;
    this.editNip05Input = document.getElementById("editNip05Input") || null;
    this.editLud16Input = document.getElementById("editLud16Input") || null;
    this.editPictureInput = document.getElementById("editPictureInput") || null;
    this.editBannerInput = document.getElementById("editBannerInput") || null;

    this.editPictureFile = document.getElementById("editPictureFile") || null;
    this.editPictureUploadBtn = document.getElementById("editPictureUploadBtn") || null;
    this.editPictureStorageHint = document.getElementById("editPictureStorageHint") || null;
    this.editPictureConfigureLink = document.getElementById("editPictureConfigureLink") || null;

    this.editBannerFile = document.getElementById("editBannerFile") || null;
    this.editBannerUploadBtn = document.getElementById("editBannerUploadBtn") || null;
    this.editBannerStorageHint = document.getElementById("editBannerStorageHint") || null;
    this.editBannerConfigureLink = document.getElementById("editBannerConfigureLink") || null;

    this.editSaveBtn = document.getElementById("editSaveBtn") || null;
    this.editCancelBtn = document.getElementById("editCancelBtn") || null;
    this.editStatusText = document.getElementById("editStatusText") || null;

    // Backwards compatibility aliases
    this.mainController.profileEditBtn = this.profileEditBtn;
    this.mainController.profileEditBackBtn = this.profileEditBackBtn;
    this.mainController.editNameInput = this.editNameInput;
    this.mainController.editDisplayNameInput = this.editDisplayNameInput;
    this.mainController.editAboutInput = this.editAboutInput;
    this.mainController.editWebsiteInput = this.editWebsiteInput;
    this.mainController.editNip05Input = this.editNip05Input;
    this.mainController.editLud16Input = this.editLud16Input;
    this.mainController.editPictureInput = this.editPictureInput;
    this.mainController.editBannerInput = this.editBannerInput;
    this.mainController.editPictureFile = this.editPictureFile;
    this.mainController.editPictureUploadBtn = this.editPictureUploadBtn;
    this.mainController.editPictureStorageHint = this.editPictureStorageHint;
    this.mainController.editPictureConfigureLink = this.editPictureConfigureLink;
    this.mainController.editBannerFile = this.editBannerFile;
    this.mainController.editBannerUploadBtn = this.editBannerUploadBtn;
    this.mainController.editBannerStorageHint = this.editBannerStorageHint;
    this.mainController.editBannerConfigureLink = this.editBannerConfigureLink;
    this.mainController.editSaveBtn = this.editSaveBtn;
    this.mainController.editCancelBtn = this.editCancelBtn;
    this.mainController.editStatusText = this.editStatusText;
  }

  registerEventListeners() {
    if (this.profileEditBtn instanceof HTMLElement) {
      this.profileEditBtn.addEventListener("click", () => {
        this.handleEditProfile();
      });
    }

    if (this.profileEditBackBtn instanceof HTMLElement) {
      this.profileEditBackBtn.addEventListener("click", () => {
        this.mainController.selectPane("account");
      });
    }

    if (this.editCancelBtn instanceof HTMLElement) {
      this.editCancelBtn.addEventListener("click", () => {
        this.mainController.selectPane("account");
      });
    }

    if (this.editSaveBtn instanceof HTMLElement) {
      this.editSaveBtn.addEventListener("click", () => {
        void this.handleSaveProfile();
      });
    }

    if (this.editPictureUploadBtn instanceof HTMLElement) {
      this.editPictureUploadBtn.addEventListener("click", () => {
        if (this.editPictureFile) this.editPictureFile.click();
      });
    }

    if (this.editPictureFile instanceof HTMLElement) {
      this.editPictureFile.addEventListener("change", () => {
        void this.handleUpload("picture");
      });
    }

    if (this.editBannerUploadBtn instanceof HTMLElement) {
      this.editBannerUploadBtn.addEventListener("click", () => {
        if (this.editBannerFile) this.editBannerFile.click();
      });
    }

    if (this.editBannerFile instanceof HTMLElement) {
      this.editBannerFile.addEventListener("change", () => {
        void this.handleUpload("banner");
      });
    }

    if (this.editPictureConfigureLink instanceof HTMLElement) {
      this.editPictureConfigureLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.mainController.selectPane("storage");
      });
    }

    if (this.editBannerConfigureLink instanceof HTMLElement) {
      this.editBannerConfigureLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.mainController.selectPane("storage");
      });
    }
  }

  handleEditProfile() {
    this.mainController.selectPane("edit");
    void this.populateEditPane();
  }

  async populateEditPane() {
    const pubkey = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!pubkey) {
      return;
    }

    const cacheEntry = this.mainController.services.getProfileCacheEntry(pubkey);
    const profile = cacheEntry?.profile || {};

    if (this.editNameInput) this.editNameInput.value = profile.name || "";
    if (this.editDisplayNameInput)
      this.editDisplayNameInput.value = profile.display_name || "";
    if (this.editAboutInput) this.editAboutInput.value = profile.about || "";
    if (this.editWebsiteInput)
      this.editWebsiteInput.value = profile.website || "";
    if (this.editNip05Input) this.editNip05Input.value = profile.nip05 || "";
    if (this.editLud16Input) this.editLud16Input.value = profile.lud16 || "";
    if (this.editPictureInput)
      this.editPictureInput.value = profile.picture || "";
    if (this.editBannerInput) this.editBannerInput.value = profile.banner || "";

    void this.checkStorageForUploads(pubkey);
  }

  async checkStorageForUploads(pubkey) {
    const r2Service = this.mainController.services.r2Service;
    if (!r2Service) return;

    let hasStorage = false;
    try {
      const credentials = await r2Service.resolveConnection(pubkey);
      hasStorage = !!credentials;
    } catch (e) {
      hasStorage = false;
    }

    const updateUI = (uploadBtn, hint, has) => {
      if (uploadBtn) {
        uploadBtn.disabled = !has;
        if (!has) uploadBtn.setAttribute("aria-disabled", "true");
        else uploadBtn.removeAttribute("aria-disabled");
      }
      if (hint) {
        if (has) hint.classList.add("hidden");
        else hint.classList.remove("hidden");
      }
    };

    updateUI(
      this.editPictureUploadBtn,
      this.editPictureStorageHint,
      hasStorage,
    );
    updateUI(this.editBannerUploadBtn, this.editBannerStorageHint, hasStorage);
  }

  async handleUpload(type) {
    const pubkey = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!pubkey) return;

    const r2Service = this.mainController.services.r2Service;
    if (!r2Service) return;

    const fileInput =
      type === "picture" ? this.editPictureFile : this.editBannerFile;
    const urlInput =
      type === "picture" ? this.editPictureInput : this.editBannerInput;
    const uploadBtn =
      type === "picture" ? this.editPictureUploadBtn : this.editBannerUploadBtn;

    if (!fileInput || !fileInput.files.length) return;
    const file = fileInput.files[0];

    try {
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";
      }

      const credentials = await r2Service.resolveConnection(pubkey);
      if (!credentials) {
        this.mainController.showError("Storage configuration missing.");
        return;
      }

      const key = buildR2Key(pubkey, file);
      await r2Service.uploadFile({
        file,
        ...credentials,
        bucket: credentials.bucket,
        key,
      });

      const url = buildPublicUrl(credentials.baseDomain, key);
      if (urlInput) urlInput.value = url;

      fileInput.value = "";
    } catch (error) {
      this.mainController.showError("Upload failed: " + (error.message || "Unknown error"));
      devLogger.error("Upload error:", error);
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Upload";
      }
    }
  }

  async handleSaveProfile() {
    const pubkey = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!pubkey) return;

    const profile = {
      name: this.editNameInput?.value?.trim() || "",
      display_name: this.editDisplayNameInput?.value?.trim() || "",
      about: this.editAboutInput?.value?.trim() || "",
      website: this.editWebsiteInput?.value?.trim() || "",
      nip05: this.editNip05Input?.value?.trim() || "",
      lud16: this.editLud16Input?.value?.trim() || "",
      picture: this.editPictureInput?.value?.trim() || "",
      banner: this.editBannerInput?.value?.trim() || "",
    };

    if (this.editSaveBtn) {
      this.editSaveBtn.disabled = true;
      this.editSaveBtn.textContent = "Saving...";
    }

    try {
      const event = buildProfileMetadataEvent({
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        metadata: profile,
      });

      const result =
        await this.mainController.services.nostrClient.signAndPublishEvent(event);

      if (result && result.signedEvent) {
        if (this.mainController.services.nostrClient.handleEvent) {
          this.mainController.services.nostrClient.handleEvent(result.signedEvent);
        }
      }

      this.mainController.showSuccess("Profile updated!");
      this.mainController.selectPane("account");
      this.mainController.renderSavedProfiles();
    } catch (error) {
      this.mainController.showError("Failed to save profile: " + error.message);
    } finally {
      if (this.editSaveBtn) {
        this.editSaveBtn.disabled = false;
        this.editSaveBtn.textContent = "Save Profile";
      }
    }
  }
}
