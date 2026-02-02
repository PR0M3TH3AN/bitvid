import { devLogger as defaultLogger } from "../utils/logger.js";

export default class ProfileIdentityController {
  constructor({ callbacks = {}, environment = {}, logger } = {}) {
    this.safeEncodeNpub =
      typeof callbacks.safeEncodeNpub === "function"
        ? callbacks.safeEncodeNpub
        : () => "";
    this.formatShortNpub =
      typeof callbacks.formatShortNpub === "function"
        ? callbacks.formatShortNpub
        : (value) => value || "";
    this.document = environment.document || (typeof document !== "undefined" ? document : null);
    this.logger = logger || defaultLogger;
  }

  updateProfileIdentity({ pubkey, profile } = {}) {
    if (!this.document) {
      return;
    }

    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    if (!normalizedPubkey) {
      return;
    }

    const normalizedProfile = profile && typeof profile === "object" ? profile : {};

    const pictureUrl =
      typeof normalizedProfile.picture === "string" ? normalizedProfile.picture : "";

    const resolveProfileName = () => {
      const candidates = [
        normalizedProfile.name,
        normalizedProfile.display_name,
        normalizedProfile.displayName,
      ];
      for (const candidate of candidates) {
        if (typeof candidate !== "string") {
          continue;
        }
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return "";
    };

    const resolvedName = resolveProfileName();

    const explicitNpub =
      typeof normalizedProfile.npub === "string"
        ? normalizedProfile.npub.trim()
        : "";

    const encodedPubkeyNpub = this.safeEncodeNpub(normalizedPubkey);
    const resolvedNpub = explicitNpub || encodedPubkeyNpub || "";
    const shortNpubLabel = resolvedNpub
      ? this.formatShortNpub(resolvedNpub) || resolvedNpub
      : "";

    const picEls = this.document.querySelectorAll(
      `.author-pic[data-pubkey="${normalizedPubkey}"]`
    );
    picEls.forEach((el) => {
      if (el) {
        el.src = pictureUrl;
      }
    });

    const nameLabel = resolvedName || shortNpubLabel || resolvedNpub || "";
    const nameEls = this.document.querySelectorAll(
      `.author-name[data-pubkey="${normalizedPubkey}"]`
    );
    nameEls.forEach((el) => {
      if (el) {
        el.textContent = nameLabel;
      }
    });

    const npubSelectors = new Set();
    if (resolvedNpub) {
      npubSelectors.add(`.author-npub[data-npub="${resolvedNpub}"]`);
    }
    npubSelectors.add(`.author-npub[data-pubkey="${normalizedPubkey}"]`);

    const npubElements = new Set();
    npubSelectors.forEach((selector) => {
      this.document.querySelectorAll(selector).forEach((el) => {
        if (el) {
          npubElements.add(el);
        }
      });
    });

    const npubEls = Array.from(npubElements);

    npubEls.forEach((el) => {
      if (!el) {
        return;
      }

      const displayNpub = resolvedNpub ? shortNpubLabel || resolvedNpub : "";
      const hasDisplayNpub = Boolean(displayNpub);

      if (hasDisplayNpub) {
        el.textContent = displayNpub;
        el.setAttribute("aria-hidden", "false");
      } else {
        el.textContent = "";
        el.setAttribute("aria-hidden", "true");
      }

      if (resolvedNpub) {
        el.setAttribute("title", resolvedNpub);
        if (el.dataset) {
          el.dataset.npub = resolvedNpub;
        }
      } else {
        el.removeAttribute("title");
        if (el.dataset && "npub" in el.dataset) {
          delete el.dataset.npub;
        }
      }

      if (el.dataset) {
        el.dataset.pubkey = normalizedPubkey;
      }
    });

    if (!nameEls.length && !npubEls.length) {
      return;
    }

    const cardInstances = new Set();
    const collectCardInstance = (el) => {
      if (!el || typeof el.closest !== "function") {
        return;
      }
      const cardRoot = el.closest('[data-component="similar-content-card"]');
      if (!cardRoot) {
        return;
      }
      const instance = cardRoot.__bitvidSimilarContentCard;
      if (instance && typeof instance.updateIdentity === "function") {
        cardInstances.add(instance);
      }
    };

    nameEls.forEach(collectCardInstance);
    npubEls.forEach(collectCardInstance);

    if (!cardInstances.size) {
      return;
    }

    const identityPayload = {
      name: resolvedName,
      npub: resolvedNpub,
      shortNpub: shortNpubLabel,
      pubkey: normalizedPubkey,
    };

    cardInstances.forEach((card) => {
      try {
        card.updateIdentity(identityPayload);
      } catch (error) {
        if (this.logger?.warn) {
          this.logger.warn(
            "[ProfileIdentityController] Failed to update similar content card identity",
            error,
          );
        }
      }
    });
  }
}
