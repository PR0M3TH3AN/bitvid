import { devLogger, userLogger } from "../../utils/logger.js";

const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";

export class ProfileBlockListController {
  constructor(mainController) {
    this.mainController = mainController;

    this.blockList = null;
    this.blockListEmpty = null;
    this.blockListStatus = null;
    this.blockListLoadingState = "idle";
    this.blockInput = null;
    this.addBlockedButton = null;
    this.profileBlockedRefreshBtn = null;
  }

  cacheDomReferences() {
    this.blockList = document.getElementById("blockedList") || null;
    this.blockListEmpty = document.getElementById("blockedEmpty") || null;
    this.blockInput = document.getElementById("blockedInput") || null;
    this.addBlockedButton = document.getElementById("addBlockedBtn") || null;
    this.profileBlockedRefreshBtn = document.getElementById("blockedRefreshBtn") || null;

    // Attempt to locate status element or create it if missing
    this.blockListStatus =
      (this.mainController.panes.blocked?.querySelector &&
       this.mainController.panes.blocked.querySelector("[data-role=\"blocked-list-status\"]")) ||
      null;

    // Backwards compatibility alias
    this.mainController.blockList = this.blockList;
    this.mainController.blockListEmpty = this.blockListEmpty;
    this.mainController.blockInput = this.blockInput;
    this.mainController.addBlockedButton = this.addBlockedButton;

    this.mainController.profileBlockedList = this.blockList;
    this.mainController.profileBlockedEmpty = this.blockListEmpty;
    this.mainController.profileBlockedInput = this.blockInput;
    this.mainController.profileAddBlockedBtn = this.addBlockedButton;
    this.mainController.profileBlockedRefreshBtn = this.profileBlockedRefreshBtn;
    this.mainController.blockListStatus = this.blockListStatus;
  }

  registerEventListeners() {
    if (this.addBlockedButton instanceof HTMLElement) {
      this.addBlockedButton.addEventListener("click", () => {
        void this.handleAddBlockedCreator();
      });
    }

    if (this.profileBlockedRefreshBtn instanceof HTMLElement) {
      this.profileBlockedRefreshBtn.addEventListener("click", () => {
        const activeHex = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const blocksService = this.mainController.services.userBlocks;
        if (!blocksService || typeof blocksService.loadBlocks !== "function") {
          return;
        }
        void blocksService
          .loadBlocks(activeHex)
          .then(() => {
            this.populateBlockedList();
          })
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh blocked list:", error);
          });
      });
    }

    if (this.blockInput instanceof HTMLElement) {
      this.blockInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddBlockedCreator();
        }
      });
    }
  }

  ensureBlockListStatusElement() {
    if (this.blockListStatus instanceof HTMLElement) {
      return this.blockListStatus;
    }

    const anchor =
      this.blockList instanceof HTMLElement
        ? this.blockList
        : this.blockListEmpty instanceof HTMLElement
        ? this.blockListEmpty
        : null;

    if (!anchor || !(anchor.parentElement instanceof HTMLElement)) {
      return null;
    }

    const existing = anchor.parentElement.querySelector(
      '[data-role="blocked-list-status"]',
    );
    if (existing instanceof HTMLElement) {
      if (!existing.dataset.testid) {
        existing.dataset.testid = "blocked-sync-status";
      }
      this.blockListStatus = existing;
      return existing;
    }

    const status = document.createElement("div");
    status.dataset.role = "blocked-list-status";
    status.dataset.testid = "blocked-sync-status";
    status.className = "mt-4 flex items-center gap-3 text-sm text-muted hidden";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    if (this.blockList instanceof HTMLElement) {
      anchor.parentElement.insertBefore(status, this.blockList);
    } else {
      anchor.parentElement.appendChild(status);
    }

    this.blockListStatus = status;
    return status;
  }

  setBlockListLoadingState(state = "idle", options = {}) {
    const statusEl = this.ensureBlockListStatusElement();
    if (!statusEl) {
      this.blockListLoadingState = state;
      return;
    }

    const message =
      typeof options.message === "string" && options.message.trim()
        ? options.message.trim()
        : "";

    statusEl.textContent = "";
    statusEl.classList.remove("text-status-warning");
    statusEl.classList.add("text-muted");
    statusEl.classList.add("hidden");

    this.blockListLoadingState = state;

    if (state === "loading") {
      if (this.blockListEmpty instanceof HTMLElement) {
        this.blockListEmpty.classList.add("hidden");
      }

      const spinner = document.createElement("span");
      spinner.className = "status-spinner status-spinner--inline";
      spinner.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = message || "Loading blocked creators…";

      statusEl.appendChild(spinner);
      statusEl.appendChild(text);
      statusEl.classList.remove("hidden");
      return;
    }

    if (state === "error") {
      statusEl.classList.remove("text-muted");
      statusEl.classList.add("text-status-warning");

      if (this.blockListEmpty instanceof HTMLElement) {
        this.blockListEmpty.classList.add("hidden");
      }

      const text = document.createElement("span");
      text.textContent =
        message || "Blocked creators may be out of date. Try again later.";

      statusEl.appendChild(text);
      statusEl.classList.remove("hidden");
    }
  }

  populateBlockedList(blocked = null) {
    if (!this.blockList || !this.blockListEmpty) {
      if (this.blockListLoadingState === "loading") {
        this.setBlockListLoadingState("idle");
      }
      return;
    }

    const sourceEntries =
      Array.isArray(blocked) && blocked.length
        ? blocked
        : this.mainController.services.userBlocks.getBlockedPubkeys();

    const normalizedEntries = [];
    const pushEntry = (hex, label) => {
      if (!hex || !label) {
        return;
      }
      normalizedEntries.push({ hex, label });
    };

    sourceEntries.forEach((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (!trimmed) {
          return;
        }

        if (trimmed.startsWith("npub1")) {
          const decoded = this.mainController.safeDecodeNpub(trimmed);
          if (!decoded) {
            return;
          }
          const label = this.mainController.safeEncodeNpub(decoded) || trimmed;
          pushEntry(decoded, label);
          return;
        }

        if (/^[0-9a-f]{64}$/i.test(trimmed)) {
          const hex = trimmed.toLowerCase();
          const label = this.mainController.safeEncodeNpub(hex) || hex;
          pushEntry(hex, label);
        }
        return;
      }

      if (entry && typeof entry === "object") {
        const candidateNpub =
          typeof entry.npub === "string" ? entry.npub.trim() : "";
        const candidateHex =
          typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";

        if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
          const normalizedHex = candidateHex.toLowerCase();
          const label =
            candidateNpub && candidateNpub.startsWith("npub1")
              ? candidateNpub
              : this.mainController.safeEncodeNpub(normalizedHex) || normalizedHex;
          pushEntry(normalizedHex, label);
          return;
        }

        if (candidateNpub && candidateNpub.startsWith("npub1")) {
          const decoded = this.mainController.safeDecodeNpub(candidateNpub);
          if (!decoded) {
            return;
          }
          const label = this.mainController.safeEncodeNpub(decoded) || candidateNpub;
          pushEntry(decoded, label);
        }
      }
    });

    const deduped = [];
    const seenHex = new Set();
    normalizedEntries.forEach((entry) => {
      if (!seenHex.has(entry.hex)) {
        seenHex.add(entry.hex);
        deduped.push(entry);
      }
    });

    this.blockList.textContent = "";

    if (!deduped.length) {
      this.blockListEmpty.classList.remove("hidden");
      this.blockList.classList.add("hidden");
      if (this.blockListLoadingState === "loading") {
        this.setBlockListLoadingState("idle");
      }
      return;
    }

    this.blockListEmpty.classList.add("hidden");
    this.blockList.classList.remove("hidden");

    const formatNpub =
      typeof this.mainController.formatShortNpub === "function"
        ? (value) => this.mainController.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");
    const entriesNeedingFetch = new Set();

    deduped.forEach(({ hex, label }) => {
      const item = document.createElement("li");
      item.className =
        "card flex items-center justify-between gap-4 p-4";

      let cachedProfile = null;
      if (hex) {
        const cacheEntry = this.mainController.services.getProfileCacheEntry(hex);
        cachedProfile = cacheEntry?.profile || null;
        if (!cacheEntry) {
          entriesNeedingFetch.add(hex);
        }
      }

      const encodedNpub =
        hex && typeof this.mainController.safeEncodeNpub === "function"
          ? this.mainController.safeEncodeNpub(hex)
          : label;
      const displayNpub = formatNpub(encodedNpub) || encodedNpub || label;
      const displayName =
        cachedProfile?.name?.trim() || displayNpub || "Blocked profile";
      const avatarSrc =
        cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

      const summary = this.mainController.dmController.createCompactProfileSummary({
        displayName,
        displayNpub,
        avatarSrc,
      });

      const actions = document.createElement("div");
      actions.className = "flex flex-wrap items-center justify-end gap-2";

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

      const removeButton = this.mainController.createRemoveButton({
        label: "Remove",
        onRemove: () => this.handleRemoveBlockedCreator(hex),
      });
      if (removeButton) {
        removeButton.dataset.blockedHex = hex;
        actions.appendChild(removeButton);
      }

      item.appendChild(summary);
      if (actions.childElementCount > 0) {
        item.appendChild(actions);
      }

      this.blockList.appendChild(item);
    });

    if (this.blockListLoadingState === "loading") {
      this.setBlockListLoadingState("idle");
    }

    if (
      entriesNeedingFetch.size &&
      typeof this.mainController.services.batchFetchProfiles === "function"
    ) {
      this.mainController.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  async handleAddBlockedCreator() {
    const input = this.blockInput || null;
    const rawValue = typeof input?.value === "string" ? input.value : "";
    const trimmed = rawValue.trim();

    const context = {
      input,
      rawValue,
      value: trimmed,
      success: false,
      reason: null,
      error: null,
    };

    if (!input) {
      context.reason = "missing-input";
      this.mainController.callbacks.onAddBlocked(context, this.mainController);
      return context;
    }

    if (!trimmed) {
      this.mainController.showError("Enter an npub to block.");
      context.reason = "empty";
      this.mainController.callbacks.onAddBlocked(context, this.mainController);
      return context;
    }

    const activePubkey = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!activePubkey) {
      this.mainController.showError("Please login to manage your block list.");
      context.reason = "no-active-pubkey";
      this.mainController.callbacks.onAddBlocked(context, this.mainController);
      return context;
    }

    const actorHex = activePubkey;
    let targetHex = "";

    if (trimmed.startsWith("npub1")) {
      targetHex = this.mainController.safeDecodeNpub(trimmed) || "";
      if (!targetHex) {
        this.mainController.showError("Invalid npub. Please double-check and try again.");
        context.reason = "invalid-npub";
        this.mainController.callbacks.onAddBlocked(context, this.mainController);
        return context;
      }
    } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      targetHex = trimmed.toLowerCase();
    } else {
      this.mainController.showError("Enter a valid npub or hex pubkey.");
      context.reason = "invalid-value";
      this.mainController.callbacks.onAddBlocked(context, this.mainController);
      return context;
    }

    if (targetHex === actorHex) {
      this.mainController.showError("You cannot block yourself.");
      context.reason = "self";
      this.mainController.callbacks.onAddBlocked(context, this.mainController);
      return context;
    }

    context.targetHex = targetHex;

    try {
      const mutationResult = await this.mutateBlocklist({
        action: "add",
        actorHex,
        targetHex,
        controller: this.mainController,
      });

      context.result = mutationResult;

      if (mutationResult?.ok) {
        this.mainController.showSuccess(
          "Creator blocked. You won't see their videos anymore.",
        );
        context.success = true;
        context.reason = mutationResult.reason || "blocked";
      } else if (mutationResult?.reason === "already-blocked") {
        this.mainController.showSuccess("You already blocked this creator.");
        context.reason = "already-blocked";
      } else {
        const message =
          mutationResult?.error?.code === "nip04-missing"
            ? "Your Nostr extension must support NIP-04 to manage private lists."
            : mutationResult?.error?.code ===
              "extension-encryption-permission-denied"
            ? "Your Nostr extension must allow encryption to update your mute/block list."
            : mutationResult?.error?.message ||
              "Failed to update your mute/block list. Please try again.";
        context.error = mutationResult?.error || null;
        context.reason = mutationResult?.reason || "service-error";
        if (message) {
          this.mainController.showError(message);
        }
      }

      if (this.blockInput) {
        this.blockInput.value = "";
      }
      this.populateBlockedList();
    } catch (error) {
      userLogger.error("Failed to add creator to personal block list:", error);
      context.error = error;
      context.reason = error?.code || "service-error";
      const message =
        error?.code === "nip04-missing"
          ? "Your Nostr extension must support NIP-04 to manage private lists."
          : error?.code === "extension-encryption-permission-denied"
          ? "Your Nostr extension must allow encryption to update your mute/block list."
          : "Failed to update your mute/block list. Please try again.";
      this.mainController.showError(message);
    }

    this.mainController.callbacks.onAddBlocked(context, this.mainController);
    return context;
  }

  async handleRemoveBlockedCreator(candidate) {
    const activePubkey = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (!activePubkey) {
      this.mainController.showError("Please login to manage your block list.");
      return;
    }

    let targetHex = "";
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return;
      }

      if (trimmed.startsWith("npub1")) {
        targetHex = this.mainController.safeDecodeNpub(trimmed) || "";
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        targetHex = trimmed.toLowerCase();
      }
    }

    if (!targetHex) {
      userLogger.warn("No valid pubkey to remove from block list:", candidate);
      return;
    }

    try {
      const mutationResult = await this.mutateBlocklist({
        action: "remove",
        actorHex: activePubkey,
        targetHex,
        controller: this.mainController,
      });

      if (mutationResult?.ok) {
        this.mainController.showSuccess("Creator removed from your mute/block list.");
      } else if (mutationResult?.reason === "not-blocked") {
        this.mainController.showSuccess("Creator already removed from your mute/block list.");
      } else if (mutationResult?.error) {
        const message =
          mutationResult.error.code === "nip04-missing"
            ? "Your Nostr extension must support NIP-04 to manage private lists."
            : mutationResult.error.code ===
              "extension-encryption-permission-denied"
            ? "Your Nostr extension must allow encryption to update your mute/block list."
            : mutationResult.error.message ||
              "Failed to update your mute/block list. Please try again.";
        if (message) {
          this.mainController.showError(message);
        }
      }

      this.populateBlockedList();
    } catch (error) {
      userLogger.error(
        "Failed to remove creator from personal block list:",
        error,
      );
      const message =
        error?.code === "nip04-missing"
          ? "Your Nostr extension must support NIP-04 to manage private lists."
          : error?.code === "extension-encryption-permission-denied"
          ? "Your Nostr extension must allow encryption to update your mute/block list."
          : "Failed to update your mute/block list. Please try again.";
      this.mainController.showError(message);
    }
  }

  async mutateBlocklist({ action, actorHex, targetHex } = {}) {
    const callback = this.mainController.callbacks.onBlocklistMutation;
    const noop = () => {};
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this.mainController,
        action,
        actorHex,
        targetHex,
      });
      if (result !== undefined) {
        return result;
      }
    }

    const context = { ok: false, reason: null, error: null };
    if (!actorHex || !targetHex) {
      context.reason = "invalid-target";
      return context;
    }

    try {
      await this.mainController.services.userBlocks.ensureLoaded(actorHex);
      const isBlocked = this.mainController.services.userBlocks.isBlocked(targetHex);

      if (action === "add") {
        if (isBlocked) {
          context.reason = "already-blocked";
          return context;
        }
        await this.mainController.services.userBlocks.addBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "blocked";
      } else if (action === "remove") {
        if (!isBlocked) {
          context.reason = "not-blocked";
          return context;
        }
        await this.mainController.services.userBlocks.removeBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "unblocked";
      } else {
        context.reason = "invalid-action";
        return context;
      }

      if (context.ok) {
        try {
          await this.mainController.services.onVideosShouldRefresh({
            reason: `blocklist-${action}`,
            actorHex,
            targetHex,
          });
        } catch (refreshError) {
          userLogger.warn(
            "[ProfileModalController] Failed to refresh videos after blocklist mutation:",
            refreshError,
          );
        }
      }

      return context;
    } catch (error) {
      context.error = error;
      context.reason = error?.code || "service-error";
      return context;
    }
  }
}
