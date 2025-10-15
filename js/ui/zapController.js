import { isDevMode } from "../config.js";
import {
  calculateZapShares,
  fetchLightningMetadata,
  formatMinRequirement,
  getCachedLightningEntry,
  getCachedMetadataByUrl,
  getCachedPlatformLightningAddress,
  isMetadataEntryFresh,
  normalizeLightningAddressKey,
  rememberLightningMetadata,
  setCachedPlatformLightningAddress,
  validateInvoiceAmount,
} from "../payments/zapSharedState.js";
import {
  resolveLightningAddress,
  fetchPayServiceData,
  requestInvoice,
} from "../payments/lnurl.js";
import { getPlatformLightningAddress } from "../payments/platformAddress.js";
import { devLogger, userLogger } from "../utils/logger.js";
import {
  ensureWallet as ensureWalletDefault,
  sendPayment as sendPaymentDefault,
} from "../payments/nwcClient.js";

const DEFAULT_SPLIT_SUMMARY = "Enter an amount to view the split.";

export default class ZapController {
  constructor({
    videoModal,
    getCurrentVideo,
    nwcSettings,
    getActiveNwcSettings,
    isUserLoggedIn,
    hasActiveWalletConnection,
    splitAndZap,
    payments = {},
    callbacks = {},
    requestWalletPane,
  } = {}) {
    this.videoModal = videoModal || null;
    this.getCurrentVideo =
      typeof getCurrentVideo === "function" ? getCurrentVideo : () => null;
    this.nwcSettings =
      nwcSettings &&
      typeof nwcSettings === "object" &&
      typeof nwcSettings.getActiveNwcSettings === "function"
        ? nwcSettings
        : null;
    if (this.nwcSettings) {
      this.getActiveNwcSettings = () =>
        this.nwcSettings.getActiveNwcSettings();
    } else if (typeof getActiveNwcSettings === "function") {
      this.getActiveNwcSettings = getActiveNwcSettings;
    } else {
      this.getActiveNwcSettings = () => ({});
    }
    this.isUserLoggedIn =
      typeof isUserLoggedIn === "function" ? isUserLoggedIn : () => false;
    if (
      this.nwcSettings &&
      typeof this.nwcSettings.hasActiveWalletConnection === "function"
    ) {
      this.hasActiveWalletConnection = () =>
        this.nwcSettings.hasActiveWalletConnection();
    } else if (typeof hasActiveWalletConnection === "function") {
      this.hasActiveWalletConnection = hasActiveWalletConnection;
    } else {
      this.hasActiveWalletConnection = () => false;
    }
    this.splitAndZap =
      typeof splitAndZap === "function" ? splitAndZap : () => Promise.resolve();
    this.payments = payments || {};
    this.callbacks = {
      onSuccess: typeof callbacks.onSuccess === "function" ? callbacks.onSuccess : null,
      onError: typeof callbacks.onError === "function" ? callbacks.onError : null,
    };
    this.requestWalletPane =
      typeof requestWalletPane === "function" ? requestWalletPane : null;

    this.modalZapInFlight = false;
    this.modalZapRetryState = null;
    this.modalZapAmountValue = 0;
    this.modalZapCommentValue = "";
  }

  /** Public API **/

  setVisibility(visible) {
    const lightningVisible = !!visible;
    const shouldShow = lightningVisible && this.isUserLoggedIn();
    const hasWallet = this.hasActiveWalletConnection();
    if (this.videoModal) {
      this.videoModal.setZapVisibility(shouldShow);
      this.videoModal.setWalletPromptVisible(shouldShow && !hasWallet);
    }
  }

  resetState({ preserveAmount = false } = {}) {
    if (!preserveAmount) {
      this.modalZapAmountValue = 0;
    }
    this.modalZapCommentValue = "";
    this.modalZapInFlight = false;
    this.resetRetryState();
    if (this.videoModal) {
      this.videoModal.setZapCompleted(false);
      this.videoModal.resetZapForm({
        amount: preserveAmount ? this.modalZapAmountValue || "" : "",
        comment: "",
      });
      this.videoModal.setZapPending(false);
      this.videoModal.setZapSplitSummary(DEFAULT_SPLIT_SUMMARY);
    }
  }

  open() {
    this.resetFeedback();
    this.applyDefaultAmount();
    this.preloadLightningMetadata().catch((error) => {
      devLogger.warn("[zap] Preload metadata error:", error);
    });
  }

  close() {
    this.resetFeedback();
  }

  setAmount(amount) {
    const rawAmount = Number(amount);
    const fallback = this.videoModal?.getZapAmountValue?.() || 0;
    const value = Number.isFinite(rawAmount) ? rawAmount : fallback;
    this.modalZapAmountValue = Math.max(0, Math.round(value || 0));
    this.resetFeedback();
    this.updateSplitSummary();
  }

  setComment(comment) {
    if (typeof comment === "string") {
      this.modalZapCommentValue = comment.trim();
      return;
    }
    const fallback = this.videoModal?.getZapCommentValue?.();
    this.modalZapCommentValue = typeof fallback === "string" ? fallback : "";
  }

  async sendZap({ amount, comment } = {}) {
    if (this.modalZapInFlight) {
      return;
    }

    this.videoModal?.setZapCompleted(false);

    const numericAmount = Number.isFinite(Number(amount))
      ? Number(amount)
      : this.modalZapAmountValue;
    const roundedAmount = Math.max(0, Math.round(numericAmount || 0));
    this.modalZapAmountValue = roundedAmount;

    const trimmedComment =
      typeof comment === "string" ? comment.trim() : this.modalZapCommentValue;
    this.modalZapCommentValue = trimmedComment;

    if (!roundedAmount) {
      const message = "Enter a zap amount greater than zero.";
      this.videoModal?.setZapStatus(message, "error");
      this.notifyError(message);
      return;
    }

    const walletSettings = this.getWalletSettingsOrPrompt();
    if (!walletSettings) {
      return;
    }

    this.modalZapInFlight = true;
    this.videoModal?.setZapPending(true);
    this.videoModal?.setZapStatus(`Sending ${roundedAmount} sats…`, "warning");
    this.videoModal?.clearZapReceipts();

    try {
      if (
        Array.isArray(this.modalZapRetryState?.shares) &&
        this.modalZapRetryState.shares.length
      ) {
        const retrySuccess = await this.executeRetry({
          walletSettings,
          comment: trimmedComment,
        });
        if (retrySuccess) {
          this.modalZapCommentValue = "";
          this.videoModal?.resetZapForm({ amount: "", comment: "" });
          this.videoModal?.setZapCompleted(true);
        }
        this.applyDefaultAmount();
        return;
      }

      const attempt = await this.runZapAttempt({
        amount: roundedAmount,
        walletSettings,
        comment: trimmedComment,
      });
      if (!attempt) {
        this.videoModal?.setZapStatus("", "neutral");
        return;
      }

      const { context, result } = attempt;
      const receipts = Array.isArray(result?.receipts) ? result.receipts : [];
      this.videoModal?.renderZapReceipts(receipts, { partial: false });

      const creatorShare = context.shares.creatorShare;
      const platformShare = context.shares.platformShare;
      const summary = platformShare
        ? `Sent ${context.shares.total} sats (creator ${creatorShare}, platform ${platformShare}).`
        : `Sent ${context.shares.total} sats to the creator.`;
      this.videoModal?.setZapStatus(summary, "success");
      this.notifySuccess("Zap sent successfully!");

      this.resetRetryState();
      this.modalZapCommentValue = "";
      this.videoModal?.resetZapForm({ amount: "", comment: "" });
      this.videoModal?.setZapCompleted(true);
      this.applyDefaultAmount();
    } catch (error) {
      this.handleZapError({ error, amount: roundedAmount, comment: trimmedComment, walletSettings });
    } finally {
      this.modalZapInFlight = false;
      this.videoModal?.setZapPending(false);
    }
  }

  handleWalletLink() {
    if (this.requestWalletPane) {
      Promise.resolve()
        .then(() => this.requestWalletPane())
        .catch((error) => {
          userLogger.error("Failed to open wallet pane:", error);
        });
    }
  }

  /** Internal helpers **/

  resetFeedback() {
    if (!this.videoModal) {
      return;
    }
    this.videoModal.setZapCompleted(false);
    this.videoModal.setZapStatus("", "neutral");
    this.videoModal.clearZapReceipts();
    this.videoModal.setZapRetryPending(false);
    this.videoModal.setZapPending(false);
  }

  applyDefaultAmount() {
    const settings = this.getActiveNwcSettings();
    let defaultAmount = 0;
    if (Number.isFinite(settings?.defaultZap) && settings.defaultZap > 0) {
      defaultAmount = Math.max(0, Math.round(settings.defaultZap));
    }
    this.modalZapAmountValue = defaultAmount;
    if (this.videoModal) {
      this.videoModal.setZapAmount(defaultAmount || "");
    }
    this.updateSplitSummary();
  }

  updateSplitSummary() {
    if (!this.videoModal) {
      return;
    }

    const amount = Math.max(0, Math.round(Number(this.modalZapAmountValue || 0)));
    if (!amount) {
      this.videoModal.setZapSplitSummary(DEFAULT_SPLIT_SUMMARY);
      return;
    }

    const shares = calculateZapShares(amount);
    const parts = [];
    const lightningAddress = this.getCurrentVideo()?.lightningAddress || "";
    const creatorEntry = getCachedLightningEntry(lightningAddress);
    const creatorMin = formatMinRequirement(creatorEntry?.metadata);
    let creatorText = `Creator: ${shares.creatorShare} sats`;
    if (Number.isFinite(creatorMin) && creatorMin > 0) {
      creatorText += ` (min ${creatorMin})`;
    }
    parts.push(creatorText);

    if (shares.platformShare > 0) {
      const platformEntry = getCachedLightningEntry(
        getCachedPlatformLightningAddress()
      );
      const platformMin = formatMinRequirement(platformEntry?.metadata);
      let platformText = `Platform: ${shares.platformShare} sats`;
      if (Number.isFinite(platformMin) && platformMin > 0) {
        platformText += ` (min ${platformMin})`;
      }
      parts.push(platformText);
    }

    this.videoModal.setZapSplitSummary(parts.join(" • "));
  }

  async preloadLightningMetadata() {
    const lightningAddress = this.getCurrentVideo()?.lightningAddress || "";
    if (lightningAddress) {
      try {
        await fetchLightningMetadata(lightningAddress);
      } catch (error) {
        devLogger.warn("[zap] Failed to preload creator metadata:", error);
      }
    }

    const amount = Math.max(0, Math.round(Number(this.modalZapAmountValue || 0)));
    if (!amount) {
      return;
    }

    const shares = calculateZapShares(amount);
    if (shares.platformShare > 0) {
      let platformAddress = getCachedPlatformLightningAddress();
      if (!platformAddress) {
        try {
          platformAddress = await getPlatformLightningAddress({
            forceRefresh: false,
          });
          setCachedPlatformLightningAddress(platformAddress || "");
        } catch (error) {
          devLogger.warn("[zap] Failed to load platform Lightning address:", error);
        }
      }
      if (platformAddress) {
        try {
          await fetchLightningMetadata(platformAddress);
        } catch (error) {
          devLogger.warn("[zap] Failed to preload platform metadata:", error);
        }
      }
    }
  }

  getWalletSettingsOrPrompt() {
    const settings = this.getActiveNwcSettings();
    const normalizedUri =
      typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
    if (!normalizedUri) {
      this.notifyError("Connect a Lightning wallet to send zaps.");
      if (this.requestWalletPane) {
        this.handleWalletLink();
      }
      return null;
    }
    return {
      ...settings,
      nwcUri: normalizedUri,
    };
  }

  createDependencies({ creatorEntry, platformEntry, shares, shareTracker }) {
    const summarizeTracker = (tracker) =>
      Array.isArray(tracker)
        ? tracker.map((entry) => ({
            type: entry?.type || "unknown",
            status: entry?.status || "unknown",
            amount:
              Number.isFinite(entry?.amount) && entry.amount >= 0
                ? entry.amount
                : undefined,
            address: entry?.address || undefined,
            hasPayment: Boolean(entry?.payment),
            errorMessage:
              typeof entry?.error?.message === "string"
                ? entry.error.message
                : entry?.error
                ? String(entry.error)
                : undefined,
          }))
        : undefined;
    const logZapError = (stage, details, error) => {
      const summary = {
        stage,
        shareType: details?.shareType,
        address: details?.address,
        amount:
          Number.isFinite(details?.amount) && details.amount >= 0
            ? details.amount
            : undefined,
        overrideFee:
          typeof details?.overrideFee === "number"
            ? details.overrideFee
            : undefined,
        commentLength:
          typeof details?.comment === "string"
            ? details.comment.length
            : undefined,
        wallet:
          details?.walletSettings
            ? {
                hasUri: Boolean(details.walletSettings.nwcUri),
                type:
                  details.walletSettings.type ||
                  details.walletSettings.name ||
                  details.walletSettings.client ||
                  undefined,
              }
            : undefined,
        shares: details?.context?.shares
          ? {
              total: details.context.shares.total,
              creator: details.context.shares.creatorShare,
              platform: details.context.shares.platformShare,
            }
          : undefined,
        tracker: summarizeTracker(details?.tracker),
        retryAttempt:
          Number.isInteger(details?.retryAttempt) && details.retryAttempt >= 0
            ? details.retryAttempt
            : undefined,
      };
      userLogger.error("[zap] Modal zap failure", summary, error);
    };

    const lightningAddress = this.getCurrentVideo()?.lightningAddress || "";
    const creatorKey = normalizeLightningAddressKey(
      creatorEntry?.address || lightningAddress
    );
    const platformKey = normalizeLightningAddressKey(
      platformEntry?.address || getCachedPlatformLightningAddress()
    );

    const ensureWalletFn =
      typeof this.payments?.ensureWallet === "function"
        ? (options) => this.payments.ensureWallet(options)
        : (options) => ensureWalletDefault(options);
    const sendPaymentFn =
      typeof this.payments?.sendPayment === "function"
        ? (bolt11, params) => this.payments.sendPayment(bolt11, params)
        : (bolt11, params) => sendPaymentDefault(bolt11, params);

    let activeShare = null;

    return {
      lnurl: {
        resolveLightningAddress: (value) => {
          const normalized = normalizeLightningAddressKey(value);
          if (normalized && normalized === creatorKey) {
            activeShare = "creator";
            if (creatorEntry?.resolved) {
              return { ...creatorEntry.resolved };
            }
          } else if (normalized && normalized === platformKey) {
            activeShare = "platform";
            if (platformEntry?.resolved) {
              return { ...platformEntry.resolved };
            }
          } else {
            activeShare = null;
          }

          const resolved = resolveLightningAddress(value);
          if (normalized) {
            rememberLightningMetadata({
              key: normalized,
              address: resolved.address || value,
              resolved,
              fetchedAt: Date.now(),
            });
          }
          return resolved;
        },
        fetchPayServiceData: async (url) => {
          const cached = getCachedMetadataByUrl(url);
          if (cached?.metadata && isMetadataEntryFresh(cached)) {
            return cached.metadata;
          }

          const metadata = await fetchPayServiceData(url);
          if (cached) {
            rememberLightningMetadata({
              ...cached,
              metadata,
              fetchedAt: Date.now(),
            });
          }
          return metadata;
        },
        validateInvoiceAmount,
        requestInvoice,
      },
      wallet: {
        ensureWallet: async (options) => {
          try {
            return await ensureWalletFn(options);
          } catch (error) {
            logZapError(
              "wallet.ensureWallet",
              {
                tracker: shareTracker,
                context: { shares },
                walletSettings: options?.settings,
              },
              error
            );
            throw error;
          }
        },
        sendPayment: async (bolt11, params) => {
          try {
            const payment = await sendPaymentFn(bolt11, params);
            if (Array.isArray(shareTracker)) {
              const shareType = activeShare || "unknown";
              const amount =
                shareType === "platform"
                  ? shares.platformShare
                  : shares.creatorShare;
              const address =
                shareType === "platform"
                  ? platformEntry?.address || getCachedPlatformLightningAddress()
                  : creatorEntry?.address || lightningAddress;
              shareTracker.push({
                type: shareType,
                status: "success",
                amount,
                address,
                payment,
              });
            }
            return payment;
          } catch (error) {
            if (Array.isArray(shareTracker)) {
              const shareType = activeShare || "unknown";
              const amount =
                shareType === "platform"
                  ? shares.platformShare
                  : shares.creatorShare;
              const address =
                shareType === "platform"
                  ? platformEntry?.address || getCachedPlatformLightningAddress()
                  : creatorEntry?.address || lightningAddress;
              shareTracker.push({
                type: shareType,
                status: "error",
                amount,
                address,
                error,
              });
            }
            logZapError(
              "wallet.sendPayment",
              {
                shareType: activeShare || "unknown",
                amount,
                address,
                tracker: shareTracker,
                context: { shares },
              },
              error
            );
            throw error;
          } finally {
            activeShare = null;
          }
        },
      },
      platformAddress: {
        getPlatformLightningAddress: async () => {
          if (platformEntry?.address) {
            return platformEntry.address;
          }
          const cachedAddress = getCachedPlatformLightningAddress();
          if (cachedAddress) {
            return cachedAddress;
          }
          const fallback = await getPlatformLightningAddress({
            forceRefresh: false,
          });
          setCachedPlatformLightningAddress(fallback || "");
          return fallback;
        },
      },
    };
  }

  async prepareLightningContext({ amount, overrideFee = null }) {
    const lightningAddress = this.getCurrentVideo()?.lightningAddress || "";
    if (!lightningAddress) {
      throw new Error("This creator has not configured a Lightning address yet.");
    }

    const shares = calculateZapShares(amount, overrideFee);
    if (!shares.total) {
      throw new Error("Enter a zap amount greater than zero.");
    }

    const creatorEntry = await fetchLightningMetadata(lightningAddress);
    if (shares.creatorShare > 0) {
      try {
        validateInvoiceAmount(creatorEntry.metadata, shares.creatorShare);
      } catch (error) {
        const detail = error?.message || "Unable to validate creator share.";
        throw new Error(`Creator share error: ${detail}`);
      }
    }

    let platformEntry = null;
    let platformAddress = "";
    if (shares.platformShare > 0) {
      platformAddress = getCachedPlatformLightningAddress();
      if (!platformAddress) {
        platformAddress = await getPlatformLightningAddress({
          forceRefresh: false,
        });
        setCachedPlatformLightningAddress(platformAddress || "");
      }
      if (!platformAddress) {
        throw new Error("Platform Lightning address is unavailable.");
      }

      platformEntry = await fetchLightningMetadata(platformAddress);
      try {
        validateInvoiceAmount(platformEntry.metadata, shares.platformShare);
      } catch (error) {
        const detail = error?.message || "Unable to validate platform share.";
        throw new Error(`Platform share error: ${detail}`);
      }
    }

    this.updateSplitSummary();

    return {
      shares,
      creatorEntry,
      platformEntry,
      platformAddress,
    };
  }

  getActiveVideoEvent() {
    const video = this.getCurrentVideo() || {};
    const lightningAddress = video.lightningAddress || "";
    return {
      kind: typeof video.kind === "number" ? video.kind : 0,
      id: typeof video.id === "string" ? video.id : "",
      pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
      tags: Array.isArray(video.tags) ? [...video.tags] : [],
      content: typeof video.content === "string" ? video.content : "",
      created_at: Number.isFinite(video.created_at)
        ? video.created_at
        : Math.floor(Date.now() / 1000),
      lightningAddress,
    };
  }

  async runZapAttempt({ amount, overrideFee = null, walletSettings, comment }) {
    const settings = walletSettings || this.getWalletSettingsOrPrompt();
    if (!settings) {
      return null;
    }

    let context;
    try {
      context = await this.prepareLightningContext({
        amount,
        overrideFee,
      });
    } catch (error) {
      userLogger.error(
        "[zap] Modal lightning context failed",
        {
        amount,
        overrideFee,
        commentLength: typeof comment === "string" ? comment.length : undefined,
        wallet: {
        hasUri: Boolean(settings?.nwcUri),
        type:
        settings?.type || settings?.name || settings?.client || undefined,
        },
        },
        error
      );
      throw error;
    }
    const shareTracker = [];
    const dependencies = this.createDependencies({
      ...context,
      shareTracker,
    });
    const videoEvent = this.getActiveVideoEvent();

    let previousOverride;
    const hasGlobal = typeof globalThis !== "undefined";
    if (hasGlobal && typeof overrideFee === "number" && Number.isFinite(overrideFee)) {
      previousOverride = globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
      globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = overrideFee;
    }

    try {
      const result = await this.splitAndZap(
        {
          videoEvent,
          amountSats: context.shares.total,
          comment: typeof comment === "string" ? comment : "",
          walletSettings: settings,
        },
        dependencies
      );
      return { context, result, shareTracker };
    } catch (error) {
      if (Array.isArray(shareTracker) && shareTracker.length) {
        error.__zapShareTracker = shareTracker;
      }
      userLogger.error(
        "[zap] splitAndZap failed",
        {
          amount,
          overrideFee,
          commentLength: typeof comment === "string" ? comment.length : undefined,
          wallet: {
            hasUri: Boolean(settings?.nwcUri),
            type:
              settings?.type || settings?.name || settings?.client || undefined,
          },
          shares: {
            total: context?.shares?.total,
            creator: context?.shares?.creatorShare,
            platform: context?.shares?.platformShare,
          },
          tracker: Array.isArray(shareTracker)
            ? shareTracker.map((entry) => ({
                type: entry?.type || "unknown",
                status: entry?.status || "unknown",
                amount: entry?.amount,
                address: entry?.address,
                errorMessage:
                  typeof entry?.error?.message === "string"
                    ? entry.error.message
                    : entry?.error
                    ? String(entry.error)
                    : undefined,
              }))
            : undefined,
        },
        error
      );
      throw error;
    } finally {
      if (hasGlobal && typeof overrideFee === "number" && Number.isFinite(overrideFee)) {
        if (typeof previousOverride === "number") {
          globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__ = previousOverride;
        } else if (
          globalThis &&
          Object.prototype.hasOwnProperty.call(globalThis, "__BITVID_PLATFORM_FEE_OVERRIDE__")
        ) {
          delete globalThis.__BITVID_PLATFORM_FEE_OVERRIDE__;
        }
      }
    }
  }

  async executeRetry({ walletSettings, comment }) {
    const retryState = this.modalZapRetryState;
    const shares = Array.isArray(retryState?.shares) ? retryState.shares : [];
    if (!shares.length) {
      this.resetRetryState();
      return null;
    }

    const summary = shares
      .map((share) => {
        const label =
          share.type === "platform"
            ? "Platform"
            : share.type === "creator"
            ? "Creator"
            : "Lightning";
        return `${label} ${share.amount} sats`;
      })
      .join(", ");
    this.videoModal?.setZapStatus(
      `Retrying failed share(s): ${summary}`,
      "warning"
    );
    this.videoModal?.clearZapReceipts();

    const aggregatedReceipts = [];
    const aggregatedTracker = [];

    for (const share of shares) {
      const overrideFee = share.type === "platform" ? 100 : 0;
      try {
        const attempt = await this.runZapAttempt({
          amount: share.amount,
          overrideFee,
          walletSettings,
          comment: retryState?.comment || comment || "",
        });
        if (!attempt) {
          this.videoModal?.setZapStatus("", "neutral");
          return null;
        }
        if (Array.isArray(attempt?.result?.receipts)) {
          aggregatedReceipts.push(...attempt.result.receipts);
        } else if (Array.isArray(attempt?.shareTracker)) {
          aggregatedTracker.push(...attempt.shareTracker);
        }
      } catch (error) {
        const tracker = Array.isArray(error?.__zapShareTracker)
          ? error.__zapShareTracker
          : [];
        userLogger.error(
          "[zap] Modal zap retry failed",
          {
            shareType: share?.type || "unknown",
            amount: share?.amount,
            address: share?.address,
            commentLength:
              typeof (retryState?.comment || comment) === "string"
                ? (retryState?.comment || comment).length
                : undefined,
            tracker: tracker.map((entry) => ({
              type: entry?.type || "unknown",
              status: entry?.status || "unknown",
              amount: entry?.amount,
              address: entry?.address,
              errorMessage:
                typeof entry?.error?.message === "string"
                  ? entry.error.message
                  : entry?.error
                  ? String(entry.error)
                  : undefined,
            })),
          },
          error
        );
        if (tracker.length) {
          aggregatedTracker.push(...tracker);
        }
        throw error;
      }
    }

    if (aggregatedReceipts.length) {
      this.videoModal?.renderZapReceipts(aggregatedReceipts, { partial: false });
    } else if (aggregatedTracker.length) {
      this.videoModal?.renderZapReceipts(aggregatedTracker, { partial: true });
    }

    const total = shares.reduce((sum, share) => {
      const value = Math.max(0, Math.round(Number(share.amount) || 0));
      return sum + value;
    }, 0);
    const successMessage =
      total > 0
        ? `Retried ${total} sats successfully.`
        : "Retried zap shares successfully.";
    this.videoModal?.setZapStatus(successMessage, "success");
    this.notifySuccess("Zap shares retried successfully!");
    this.resetRetryState();
    return true;
  }

  markRetryPending(shares, comment = "") {
    const validShares = Array.isArray(shares)
      ? shares.filter((share) => share && share.amount > 0)
      : [];
    if (!validShares.length) {
      this.resetRetryState();
      return;
    }

    this.modalZapRetryState = {
      shares: validShares,
      comment: typeof comment === "string" ? comment : this.modalZapCommentValue,
      createdAt: Date.now(),
    };

    const summary = validShares
      .map((share) => {
        const label =
          share.type === "platform"
            ? "Platform"
            : share.type === "creator"
            ? "Creator"
            : "Lightning";
        return `${label} ${share.amount} sats`;
      })
      .join(", ");
    this.videoModal?.setZapRetryPending(true, { summary });
  }

  resetRetryState() {
    this.modalZapRetryState = null;
    this.videoModal?.setZapRetryPending(false);
  }

  handleZapError({ error, amount, comment, walletSettings }) {
    const tracker = Array.isArray(error?.__zapShareTracker)
      ? error.__zapShareTracker
      : [];
    userLogger.error(
      "[zap] Modal zap attempt failed",
      {
        amount,
        commentLength: typeof comment === "string" ? comment.length : undefined,
        wallet: {
          hasUri: Boolean(walletSettings?.nwcUri),
          type:
            walletSettings?.type ||
            walletSettings?.name ||
            walletSettings?.client ||
            undefined,
        },
        tracker: tracker.map((entry) => ({
          type: entry?.type || "unknown",
          status: entry?.status || "unknown",
          amount: entry?.amount,
          address: entry?.address,
          errorMessage:
            typeof entry?.error?.message === "string"
              ? entry.error.message
              : entry?.error
              ? String(entry.error)
              : undefined,
        })),
        retryPending: Array.isArray(this.modalZapRetryState?.shares)
          ? this.modalZapRetryState.shares.length
          : 0,
      },
      error
    );
    if (tracker.length) {
      this.videoModal?.renderZapReceipts(tracker, { partial: true });
    }

    const failureShares = tracker.filter(
      (entry) => entry && entry.status !== "success" && entry.amount > 0
    );
    if (failureShares.length) {
      this.markRetryPending(failureShares, comment);
      const summary = failureShares
        .map((share) => {
          const label =
            share.type === "platform"
              ? "Platform"
              : share.type === "creator"
              ? "Creator"
              : "Lightning";
          return `${label} ${share.amount} sats`;
        })
        .join(", ");
      const tone = tracker.length > failureShares.length ? "warning" : "error";
      const statusMessage =
        tracker.length > failureShares.length
          ? `Partial zap failure. Press Send again to retry: ${summary}.`
          : `Zap failed. Press Send again to retry: ${summary}.`;
      this.videoModal?.setZapStatus(statusMessage, tone);
      this.notifyError(error?.message || statusMessage);
    } else {
      this.resetRetryState();
      const message = error?.message || "Zap failed. Please try again.";
      this.videoModal?.setZapStatus(message, "error");
      this.notifyError(message);
    }
  }

  notifySuccess(message) {
    if (this.callbacks.onSuccess) {
      this.callbacks.onSuccess(message);
    }
  }

  notifyError(message) {
    if (this.callbacks.onError) {
      this.callbacks.onError(message);
    }
  }
}
