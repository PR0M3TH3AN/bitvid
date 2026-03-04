// js/app/routerCoordinator.js

/**
 * Routing logic for the application.
 *
 * All module-level dependencies are injected from the Application
 * composition root rather than imported at module scope.
 *
 * Methods use `this` which is bound to the Application instance.
 */
export function createRouterCoordinator(deps) {
  const {
    devLogger,
  } = deps;

  return {
    goToProfile(pubkey) {
      if (typeof pubkey !== "string") {
        this.showError("No creator info available.");
        return;
      }

      let candidate = pubkey.trim();
      if (!candidate) {
        this.showError("No creator info available.");
        return;
      }

      if (candidate.startsWith("nostr:")) {
        candidate = candidate.slice("nostr:".length);
      }

      const normalizedHex = this.normalizeHexPubkey(candidate);
      const npub = normalizedHex ? this.safeEncodeNpub(normalizedHex) : null;

      if (!npub) {
        devLogger.warn(
          "[Application] Invalid pubkey for profile navigation:",
          candidate,
        );
        this.showError("Invalid creator profile.");
        return;
      }

      window.location.hash = `#view=channel-profile&npub=${npub}`;
    },

    openCreatorChannel() {
      if (!this.currentVideo || !this.currentVideo.pubkey) {
        this.showError("No creator info available.");
        return;
      }

      try {
        // Encode the hex pubkey to npub
        const npub = window.NostrTools.nip19.npubEncode(this.currentVideo.pubkey);

        // Close the video modal
        this.hideModal();

        // Switch to channel profile view
        window.location.hash = `#view=channel-profile&npub=${npub}`;
      } catch (err) {
        devLogger.error("Failed to open creator channel:", err);
        this.showError("Could not open channel.");
      }
    },

    handleProfileChannelLink(element) {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const targetNpub =
        typeof element.dataset.targetNpub === "string"
          ? element.dataset.targetNpub
          : "";
      if (this.profileController) {
        this.profileController.hide();
      }
      if (targetNpub) {
        window.location.hash = `#view=channel-profile&npub=${encodeURIComponent(
          targetNpub,
        )}`;
      }
    }
  };
}
