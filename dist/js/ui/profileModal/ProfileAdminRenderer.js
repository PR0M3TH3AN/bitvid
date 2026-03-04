import { devLogger } from "../../utils/logger.js";

const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";

export class ProfileAdminRenderer {
  constructor(mainController) {
    this.mainController = mainController;
  }

  storeAdminEmptyMessages(controller) {
    const capture = (element) => {
      if (element instanceof HTMLElement && !element.dataset.defaultMessage) {
        element.dataset.defaultMessage = element.textContent || "";
      }
    };

    capture(controller.moderatorEmpty);
    capture(controller.whitelistEmpty);
    capture(controller.blacklistEmpty);
  }

  setAdminLoading(controller, isLoading) {
    this.storeAdminEmptyMessages(controller);
    if (this.mainController.panes.admin instanceof HTMLElement) {
      this.mainController.panes.admin.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    const toggleMessage = (element, message) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (isLoading) {
        element.textContent = message;
        element.classList.remove("hidden");
      } else {
        element.textContent = element.dataset.defaultMessage || element.textContent;
      }
    };

    toggleMessage(controller.moderatorEmpty, "Loading moderators…");
    toggleMessage(controller.whitelistEmpty, "Loading whitelist…");
    toggleMessage(controller.blacklistEmpty, "Loading blacklist…");
  }

  clearAdminLists(controller) {
    this.storeAdminEmptyMessages(controller);
    if (controller.adminModeratorList) {
      controller.adminModeratorList.textContent = "";
    }
    if (controller.whitelistList) {
      controller.whitelistList.textContent = "";
    }
    if (controller.blacklistList) {
      controller.blacklistList.textContent = "";
    }
    if (controller.moderatorEmpty instanceof HTMLElement) {
      controller.moderatorEmpty.textContent =
        controller.moderatorEmpty.dataset.defaultMessage ||
        controller.moderatorEmpty.textContent;
      controller.moderatorEmpty.classList.remove("hidden");
    }
    if (controller.whitelistEmpty instanceof HTMLElement) {
      controller.whitelistEmpty.textContent =
        controller.whitelistEmpty.dataset.defaultMessage ||
        controller.whitelistEmpty.textContent;
      controller.whitelistEmpty.classList.remove("hidden");
    }
    if (controller.blacklistEmpty instanceof HTMLElement) {
      controller.blacklistEmpty.textContent =
        controller.blacklistEmpty.dataset.defaultMessage ||
        controller.blacklistEmpty.textContent;
      controller.blacklistEmpty.classList.remove("hidden");
    }
  }

  normalizeAdminListEntries(entries) {
    const collected = [];
    const seen = new Set();

    const append = (value) => {
      if (typeof value !== "string") {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      collected.push(trimmed);
    };

    if (Array.isArray(entries)) {
      entries.forEach(append);
    } else if (entries && typeof entries?.[Symbol.iterator] === "function") {
      for (const entry of entries) {
        append(entry);
      }
    } else if (entries && typeof entries === "object") {
      Object.values(entries).forEach(append);
    }

    try {
      collected.sort((a, b) => a.localeCompare(b));
    } catch (error) {
      devLogger.warn(
        "[profileModal] Failed to sort admin list entries, using fallback order.",
        error,
      );
    }

    return collected;
  }

  renderAdminList(listEl, emptyEl, entries, options = {}) {
    if (!(listEl instanceof HTMLElement) || !(emptyEl instanceof HTMLElement)) {
      return;
    }

    const {
      onRemove,
      removeLabel = "Remove",
      confirmMessage,
      removable = true,
      overlapSet,
      overlapLabel,
    } = options;

    const formatNpub =
      typeof this.mainController.formatShortNpub === "function"
        ? (value) => this.mainController.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");

    const entriesNeedingFetch = new Set();

    listEl.textContent = "";

    const values = this.normalizeAdminListEntries(entries);

    const toggleHiddenState = (element, shouldHide) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      if (shouldHide) {
        element.classList.add("hidden");
        element.setAttribute("hidden", "");
      } else {
        element.classList.remove("hidden");
        element.removeAttribute("hidden");
      }
    };

    if (!values.length) {
      toggleHiddenState(emptyEl, false);
      toggleHiddenState(listEl, true);
      return;
    }

    toggleHiddenState(emptyEl, true);
    toggleHiddenState(listEl, false);

    values.forEach((npub) => {
      const item = document.createElement("li");
      item.className =
        "card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between";

      const normalizedNpub = typeof npub === "string" ? npub.trim() : "";
      const comparableNpub =
        this.normalizeNpubValue(normalizedNpub) || normalizedNpub;
      const decodedHex =
        normalizedNpub && normalizedNpub.startsWith("npub1")
          ? this.mainController.safeDecodeNpub(normalizedNpub)
          : null;
      const normalizedHex =
        decodedHex && /^[0-9a-f]{64}$/i.test(decodedHex)
          ? decodedHex.toLowerCase()
          : null;

      let cachedProfile = null;
      if (normalizedHex) {
        const cacheEntry = this.mainController.services.getProfileCacheEntry(normalizedHex);
        cachedProfile = cacheEntry?.profile || null;
        if (!cacheEntry) {
          entriesNeedingFetch.add(normalizedHex);
        }
      }

      const encodedNpub =
        normalizedHex && typeof this.mainController.safeEncodeNpub === "function"
          ? this.mainController.safeEncodeNpub(normalizedHex)
          : normalizedNpub;
      const displayNpub = formatNpub(encodedNpub) || encodedNpub || normalizedNpub;
      const displayName =
        cachedProfile?.name?.trim() || displayNpub || "Unknown profile";
      const avatarSrc =
        cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

      const summary = this.mainController.dmController.createCompactProfileSummary({
        displayName,
        displayNpub,
        avatarSrc,
      });

      if (
        summary &&
        overlapLabel &&
        overlapSet instanceof Set &&
        comparableNpub &&
        overlapSet.has(comparableNpub)
      ) {
        const overlapBadge = document.createElement("span");
        overlapBadge.className = "badge whitespace-nowrap";
        overlapBadge.dataset.variant = "warning";
        overlapBadge.textContent = overlapLabel;
        summary.appendChild(overlapBadge);
      }

      const actions = document.createElement("div");
      actions.className =
        "flex flex-wrap items-center justify-end gap-2 sm:flex-none";

      const viewButton = this.mainController.createViewChannelButton({
        targetNpub: encodedNpub,
        displayNpub,
      });
      if (viewButton) {
        actions.appendChild(viewButton);
      }

      const copyButton = this.mainController.createCopyNpubButton({
        targetNpub: encodedNpub,
        displayNpub,
      });
      if (copyButton) {
        actions.appendChild(copyButton);
      }

      if (removable && typeof onRemove === "function") {
        const removeBtn = this.mainController.createRemoveButton({
          label: removeLabel,
          confirmMessage,
          confirmValue: displayNpub,
          onRemove: (button) => onRemove(npub, button),
        });
        if (removeBtn) {
          actions.appendChild(removeBtn);
        }
      }

      item.appendChild(summary);
      if (actions.childElementCount > 0) {
        item.appendChild(actions);
      }

      listEl.appendChild(item);
    });

    if (
      entriesNeedingFetch.size &&
      typeof this.mainController.services.batchFetchProfiles === "function"
    ) {
      this.mainController.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  normalizeNpubValue(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("npub1")) {
      return trimmed;
    }
    const normalizedHex = this.mainController.normalizeHexPubkey(trimmed);
    if (!normalizedHex) {
      return null;
    }
    return this.mainController.safeEncodeNpub(normalizedHex);
  }
}
