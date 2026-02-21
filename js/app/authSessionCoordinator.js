// js/app/authSessionCoordinator.js

/**
 * Signer, profile, and session transition orchestration.
 *
 * All module-level dependencies are injected from the Application
 * composition root rather than imported at module scope.
 *
 * Methods use `this` which is bound to the Application instance.
 */

import { clearDecryptionSchemeCache } from "../nostr/decryptionSchemeCache.js";
import { FEED_TYPES } from "../constants.js";

/**
 * @param {object} deps - Injected dependencies.
 * @returns {object} Methods to be bound to the Application instance.
 */
export function createAuthSessionCoordinator(deps) {
  const {
    devLogger,
    userLogger,
    nostrClient,
    accessControl,
    userBlocks,
    subscriptions,
    hashtagPreferences,
    storageService,
    relayManager,
    torrentClient,
    getHashViewName,
    setHashView,
    DEFAULT_NIP07_PERMISSION_METHODS,
    RELAY_UI_BATCH_DELAY_MS,
    sanitizeRelayList,
    buildDmRelayListEvent,
    publishEventToRelays,
    assertAnyRelayAccepted,
    queueSignEvent,
    bootstrapTrustedSeeds,
    getModerationSettings,
    getActiveProfilePubkey,
  } = deps;

  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? () => performance.now()
      : () => Date.now();

  const SIGNER_GATE_STATUS = Object.freeze({
    READY: "signer-ready",
    EXTENSION_UNAVAILABLE: "extension-unavailable",
    PERMISSION_DENIED: "permission-denied",
  });

  const classifySignerGateError = (error) => {
    const code =
      typeof error?.code === "string" && error.code.trim()
        ? error.code.trim().toLowerCase()
        : "";
    const message =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim().toLowerCase()
        : "";

    if (
      code.includes("permission") ||
      message.includes("permission") ||
      message.includes("denied")
    ) {
      return SIGNER_GATE_STATUS.PERMISSION_DENIED;
    }

    return SIGNER_GATE_STATUS.EXTENSION_UNAVAILABLE;
  };

  const evaluateSignerReadinessGate = async (pubkey) => {
    if (!pubkey) {
      return {
        ready: false,
        status: SIGNER_GATE_STATUS.EXTENSION_UNAVAILABLE,
        error: null,
      };
    }

    try {
      const signer = await nostrClient.ensureActiveSignerForPubkey(pubkey);
      if (!signer) {
        return {
          ready: false,
          status: SIGNER_GATE_STATUS.EXTENSION_UNAVAILABLE,
          error: null,
        };
      }

      if (
        signer?.type === "extension" ||
        signer?.type === "nip07"
      ) {
        const permissionResult = await nostrClient.ensureExtensionPermissions(
          DEFAULT_NIP07_PERMISSION_METHODS,
        );
        if (!permissionResult?.ok) {
          const error =
            permissionResult?.error instanceof Error
              ? permissionResult.error
              : new Error("permission-denied");
          return {
            ready: false,
            status: classifySignerGateError(error),
            error,
          };
        }
      }

      return {
        ready: true,
        status: SIGNER_GATE_STATUS.READY,
        error: null,
      };
    } catch (error) {
      return {
        ready: false,
        status: classifySignerGateError(error),
        error,
      };
    }
  };

  return {
    async handleAuthLogin(detail = {}) {
      const authLoginStart = now();
      userLogger.info("[auth-login-start]", {
        pubkey: detail?.pubkey || this.pubkey || null,
      });
      const postLoginPromise =
        detail && typeof detail.postLoginPromise?.then === "function"
          ? detail.postLoginPromise
          : Promise.resolve(detail?.postLogin ?? null);
      const postLoginResult = detail?.postLogin ?? null;

      // relaysReadyPromise resolves as soon as the user's relay list is loaded,
      // before profile fetching completes. Lists can start loading immediately
      // after relays are available — they don't depend on profile data.
      const relaysReadyPromise =
        detail && typeof detail.relaysReadyPromise?.then === "function"
          ? detail.relaysReadyPromise
          : postLoginPromise;

      if (detail && typeof detail === "object") {
        try {
          detail.__handled = true;
        } catch (error) {
          // Ignore attempts to mutate read-only descriptors.
        }
      }

      if (detail?.identityChanged) {
        this.resetViewLoggingState();
      }

      this.resetPermissionPromptState();

      // Stop existing feed subscription to prioritize user data sync
      if (
        this.videoSubscription &&
        typeof this.videoSubscription.unsub === "function"
      ) {
        this.videoSubscription.unsub();
        this.videoSubscription = null;
      }

      this.applyAuthenticatedUiState();
      this.commentController?.refreshAuthState?.();
      this.updateShareNostrAuthState({ reason: "auth-login" });
      if (typeof this.refreshUnreadDmIndicator === "function") {
        void this.refreshUnreadDmIndicator({ reason: "auth-login" });
      }

      const currentView = getHashViewName();
      const normalizedView =
        typeof currentView === "string" ? currentView.toLowerCase() : "";
      const urlParams = new URLSearchParams(window.location.search);
      const hasVideoParam = urlParams.has("v");

      const rawProviderId =
        typeof detail?.providerId === "string" ? detail.providerId.trim() : "";
      const rawAuthType =
        typeof detail?.authType === "string" ? detail.authType.trim() : "";
      const normalizedProvider =
        (rawProviderId || rawAuthType).toLowerCase() || "";

      this.maybeShowExperimentalLoginWarning(normalizedProvider);

      const loginContext = {
        pubkey: detail?.pubkey || this.pubkey,
        previousPubkey: detail?.previousPubkey,
        identityChanged: Boolean(detail?.identityChanged),
      };
      const activePubkey = detail?.pubkey || this.pubkey;

      const initialLoadingState = {
        profile: activePubkey ? "loading" : "idle",
        lists: activePubkey ? "loading" : "idle",
        dms: activePubkey ? "loading" : "idle",
      };
      this.updateAuthLoadingState(initialLoadingState);

      this.dispatchAuthChange({
        status: "login",
        loggedIn: true,
        pubkey: loginContext.pubkey || null,
        previousPubkey: loginContext.previousPubkey || null,
        authLoadingState: this.authLoadingState,
      });

      const cachedProfile =
        detail?.postLogin && typeof detail.postLogin === "object"
          ? detail.postLogin.profile || null
          : null;
      if (activePubkey && cachedProfile) {
        try {
          this.updateActiveProfileUI(activePubkey, cachedProfile);
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to apply cached profile during login:",
            error,
          );
        }
      }

      if (this.profileController) {
        try {
          const maybePromise = this.profileController.handleAuthLogin(detail);
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.catch((error) => {
              devLogger.error(
                "Failed to process login within the profile controller:",
                error,
              );
            });
          }
        } catch (error) {
          devLogger.error(
            "Failed to process login within the profile controller:",
            error,
          );
        }
      } else {
        this.renderSavedProfiles();
      }

      const accessControlReadyPromise =
        accessControl && typeof accessControl.ensureReady === "function"
          ? Promise.resolve()
              .then(() => accessControl.ensureReady())
              .catch((error) => {
                userLogger.error(
                  "[Application] Failed to refresh admin lists after login:",
                  error,
                );
                throw error;
              })
          : null;

      const profileStatePromise = Promise.resolve(postLoginPromise)
        .then(async (postLogin) => {
          // 1. Relays and Profile are now loaded (sequentially or efficiently by authService)
          const nextProfile = postLogin?.profile || cachedProfile;
          if (activePubkey && nextProfile) {
            this.updateActiveProfileUI(activePubkey, nextProfile);
          }
          this.forceRefreshAllProfiles();
          this.updateAuthLoadingState({
            profile: nextProfile ? "ready" : "error",
          });
          return postLogin;
        })
        .catch((error) => {
          devLogger.error("Post-login hydration failed:", error);
          this.updateAuthLoadingState({ profile: "error" });
          return null;
        });

      // Shared signer readiness gate used by both auto-login and manual NIP-07
      // login sync orchestration before decrypt-dependent list fetches begin.
      const signerReadinessPromise = activePubkey
        ? Promise.resolve()
            .then(async () => {
              const signerGateStart = now();
              // PERF: Evaluate signer readiness once. The previous double-gate
              // evaluation added 5-10s to the login path by repeating the same
              // extension wait + permission request. A single evaluation is
              // sufficient because ensureActiveSignerForPubkey already waits
              // for extension injection internally.
              const outcome = await evaluateSignerReadinessGate(activePubkey);

              const durationMs = Math.max(
                0,
                Math.round(now() - signerGateStart),
              );
              const finalOutcome = {
                ...outcome,
                recoveryAttempted: false,
                durationMs,
              };
              userLogger.info("[signer-ready]", {
                ready: finalOutcome.ready,
                status: finalOutcome.status,
                recoveryAttempted: finalOutcome.recoveryAttempted,
                durationMs: finalOutcome.durationMs,
              });

              if (!finalOutcome.ready && finalOutcome.error) {
                devLogger.warn(
                  "[Application] Signer readiness gate not ready:",
                  finalOutcome.error,
                );
              }

              return finalOutcome;
            })
            .catch((error) => {
              devLogger.warn("[Application] Signer readiness gate failed:", error);
              return {
                ready: false,
                status: classifySignerGateError(error),
                error,
                recoveryAttempted: false,
                durationMs: 0,
              };
            })
        : Promise.resolve({
            ready: false,
            status: SIGNER_GATE_STATUS.EXTENSION_UNAVAILABLE,
            error: null,
            recoveryAttempted: false,
            durationMs: 0,
          });

      // Start list loading as soon as relays are ready — lists don't depend on
      // profile data, only on relay URLs. This runs in parallel with profile
      // fetching instead of sequentially after it.
      //
      // PERF: Load blocks, subscriptions, and hashtag preferences ALL in
      // parallel. They have no data dependencies on each other — only the feed
      // render needs all three to be settled. Loading them concurrently shaves
      // 20-30 seconds off the critical login path.
      //
      // Lists wait for the permission pre-grant to settle before attempting
      // decryption. During auto-login (page refresh), the NIP-07 extension
      // may not be ready yet — without waiting, all three services would fail
      // with "permission-required" and schedule 3-second retry delays, adding
      // 6-10 seconds to the critical login path. By waiting for the pre-grant
      // (which itself waits for the extension and requests permissions), the
      // signer is guaranteed to be available when decryption starts. This does
      // NOT slow down fresh logins because the pre-grant resolves immediately
      // when permissions were already granted during loginWithExtension().
      //
      // If pre-auth fails (e.g. extension was slow to inject), allow list
      // services to request permissions themselves so they don't stall waiting
      // for a retry timer.
      const listStatePromise = Promise.all([
        relaysReadyPromise,
        signerReadinessPromise,
      ]).then(async ([, signerGateOutcome]) => {
        const listSyncStart = now();
        const allowPermissionPrompt = !signerGateOutcome?.ready;
        userLogger.info("[lists-sync-start]", {
          pubkey: activePubkey || null,
          allowPermissionPrompt,
          signerStatus: signerGateOutcome?.status || null,
        });
        const hasValidBlocksCache = () => {
          if (!activePubkey || !userBlocks) {
            return false;
          }
          const activeCachePubkey = this.normalizeHexPubkey(userBlocks.activePubkey);
          return userBlocks.loaded === true && activeCachePubkey === activePubkey;
        };
        const hasValidSubscriptionsCache = () => {
          if (!activePubkey || !subscriptions) {
            return false;
          }
          const activeCachePubkey = this.normalizeHexPubkey(
            subscriptions.currentUserPubkey,
          );
          return subscriptions.loaded === true && activeCachePubkey === activePubkey;
        };
        const hasValidHashtagCache = () => {
          if (!activePubkey || !this.hashtagPreferences) {
            return false;
          }
          const activeCachePubkey = this.normalizeHexPubkey(
            this.hashtagPreferences.activePubkey,
          );
          return this.hashtagPreferences.loaded === true && activeCachePubkey === activePubkey;
        };

        const runListTask = async (name, task, { hasValidCache }) => {
          try {
            const result = await task();
            return {
              name,
              ok: Boolean(result?.ok),
              error: result?.error || null,
              hasCache: hasValidCache(),
            };
          } catch (error) {
            return {
              name,
              ok: false,
              error,
              hasCache: hasValidCache(),
            };
          }
        };

        const parallelListTasks = [];

        if (
          activePubkey &&
          typeof this.authService.loadBlocksForPubkey === "function"
        ) {
          parallelListTasks.push(
            runListTask(
              "blocks",
              async () => {
                const loaded = await this.authService.loadBlocksForPubkey(activePubkey, {
                  allowPermissionPrompt,
                  signerReadinessGate: signerGateOutcome,
                });
                const ok = loaded !== false;
                if (!ok) {
                  const error = new Error("Block list sync returned a failed status.");
                  error.code = "blocks-sync-failed";
                  return { ok: false, error };
                }
                return { ok: true, error: null };
              },
              { hasValidCache: hasValidBlocksCache },
            ),
          );
        }

        if (
          activePubkey &&
          subscriptions &&
          typeof subscriptions.ensureLoaded === "function"
        ) {
          parallelListTasks.push(
            runListTask(
              "subscriptions",
              async () => {
                await subscriptions.ensureLoaded(activePubkey, {
                  allowPermissionPrompt,
                  signerReadinessGate: signerGateOutcome,
                });
                const error = subscriptions?.lastLoadError || null;
                this.capturePermissionPromptFromError(error);
                return { ok: !error, error };
              },
              { hasValidCache: hasValidSubscriptionsCache },
            ),
          );
        }

        if (
          activePubkey &&
          this.hashtagPreferences &&
          typeof this.hashtagPreferences.load === "function"
        ) {
          parallelListTasks.push(
            runListTask(
              "hashtags",
              async () => {
                await this.hashtagPreferences.load(activePubkey, {
                  allowPermissionPrompt,
                  signerReadinessGate: signerGateOutcome,
                });
                const error = this.hashtagPreferences?.lastLoadError || null;
                this.capturePermissionPromptFromError(error);
                this.updateCachedHashtagPreferences();
                return { ok: !error, error };
              },
              { hasValidCache: hasValidHashtagCache },
            ),
          );
        }

        const taskOutcomes = await Promise.all(parallelListTasks);
        const requiredTaskOutcomes = taskOutcomes.filter((outcome) =>
          ["blocks", "subscriptions", "hashtags"].includes(outcome.name),
        );
        const failedRequiredOutcomes = requiredTaskOutcomes.filter(
          (outcome) => !outcome.ok,
        );
        const ready = requiredTaskOutcomes.every(
          (outcome) => outcome.ok || outcome.hasCache,
        );
        const degraded = failedRequiredOutcomes.length > 0;
        const fatal = failedRequiredOutcomes.some((outcome) => !outcome.hasCache);

        const listSyncDetail = {
          ready,
          degraded,
          error: fatal,
          retryScheduled: false,
          tasks: requiredTaskOutcomes.map((outcome) => ({
            name: outcome.name,
            ok: outcome.ok,
            fromCache: outcome.hasCache && !outcome.ok,
            error: outcome.error || null,
          })),
        };

        if (degraded && activePubkey) {
          listSyncDetail.retryScheduled = true;
          Promise.resolve()
            .then(() =>
              Promise.all([
                this.authService?.loadBlocksForPubkey?.(activePubkey, {
                  allowPermissionPrompt: true,
                  signerReadinessGate: signerGateOutcome,
                }),
                subscriptions?.ensureLoaded?.(activePubkey, {
                  allowPermissionPrompt: true,
                  signerReadinessGate: signerGateOutcome,
                }),
                this.hashtagPreferences?.load?.(activePubkey, {
                  allowPermissionPrompt: true,
                  signerReadinessGate: signerGateOutcome,
                }),
              ]),
            )
            .then(() => {
              this.updateCachedHashtagPreferences();
              const retryTasks = [
                {
                  name: "blocks",
                  ok: hasValidBlocksCache(),
                  fromCache: false,
                  error: null,
                },
                {
                  name: "subscriptions",
                  ok:
                    hasValidSubscriptionsCache() &&
                    !subscriptions?.lastLoadError,
                  fromCache: false,
                  error: subscriptions?.lastLoadError || null,
                },
                {
                  name: "hashtags",
                  ok:
                    hasValidHashtagCache() &&
                    !this.hashtagPreferences?.lastLoadError,
                  fromCache: false,
                  error: this.hashtagPreferences?.lastLoadError || null,
                },
              ];
              const retryReady = retryTasks.every((task) => task.ok);
              const retryDegraded = retryTasks.some((task) => !task.ok);
              this.updateAuthLoadingState({
                lists: retryReady ? "ready" : "degraded",
                listsDetail: {
                  ready: retryReady,
                  degraded: retryDegraded,
                  error: retryDegraded,
                  retryScheduled: false,
                  retryCompleted: true,
                  tasks: retryTasks,
                },
              });
              this.dispatchAuthChange({
                status: "login-lists-sync",
                loggedIn: true,
                pubkey: activePubkey,
                authLoadingState: this.authLoadingState,
              });
            })
            .catch((error) => {
              devLogger.warn(
                "[Application] Consolidated list sync retry failed after login:",
                error,
              );
            });
        }

        const listsState = ready ? (degraded ? "degraded" : "ready") : "error";
        userLogger.info("[lists-sync-complete]", {
          pubkey: activePubkey || null,
          ready,
          degraded,
          fatal,
          durationMs: Math.max(0, Math.round(now() - listSyncStart)),
        });
        this.updateAuthLoadingState({
          lists: listsState,
          listsDetail: listSyncDetail,
        });
        this.dispatchAuthChange({
          status: "login-lists-sync",
          loggedIn: true,
          pubkey: activePubkey,
          authLoadingState: this.authLoadingState,
        });
        return listSyncDetail;
      });

      // DMs can wait for profile since they need encryption context.
      const dmStatePromise = profileStatePromise.then(() => {
        if (
          activePubkey &&
          this.nostrService &&
          typeof this.nostrService.loadDirectMessages === "function"
        ) {
          return this.nostrService
            .loadDirectMessages({
              actorPubkey: activePubkey,
              limit: 50,
              initialLoad: true,
            })
            .then(() => {
              this.updateAuthLoadingState({ dms: "ready" });
            })
            .catch((error) => {
              devLogger.warn(
                "[Application] Failed to load direct messages during login:",
                error,
              );
              this.updateAuthLoadingState({ dms: "error" });
            });
        }
        this.updateAuthLoadingState({ dms: "idle" });
        return Promise.resolve();
      });

      const nwcPromise = profileStatePromise.then(() => {
        if (
          activePubkey &&
          this.nwcSettingsService &&
          typeof this.nwcSettingsService.hydrateNwcSettingsForPubkey === "function"
        ) {
          return this.nwcSettingsService
            .hydrateNwcSettingsForPubkey(activePubkey)
            .catch((error) => {
              devLogger.warn(
                "[Application] Failed to hydrate NWC settings during login:",
                error,
              );
            });
        }
        return Promise.resolve();
      });

      // Ensure DMs are tracked for cleanup.
      void dmStatePromise;
      void nwcPromise;

      if (activePubkey) {
        const seedBlacklist = () => {
          const aggregatedBlacklist = accessControl.getBlacklist();
          return userBlocks.seedWithNpubs(
            activePubkey,
            Array.isArray(aggregatedBlacklist) ? aggregatedBlacklist : [],
          );
        };

        // Background the seeding process because it involves publishing events,
        // which can block the login flow significantly.
        Promise.resolve(accessControlReadyPromise)
          .catch(() => null)
          .then(() => seedBlacklist())
          .catch((error) => {
            if (
              error?.code === "extension-permission-denied" ||
              error?.code === "nip04-missing" ||
              error?.name === "RelayPublishError"
            ) {
              userLogger.error(
                "[Application] Failed to seed shared block list after login:",
                error,
              );
            } else {
              devLogger.error(
                "[Application] Unexpected error while seeding shared block list:",
                error,
              );
            }
          });
      }

      // Show loading state immediately while lists are syncing.
      try {
        this.reinitializeVideoListView({ reason: "login", postLoginResult });
      } catch (error) {
        devLogger.warn("Failed to reinitialize video list view after login:", error);
      }

      // Wait for the critical feed-filtering lists (blocks, subscriptions,
      // hashtag preferences) to settle before rendering the video grid. This
      // prevents the feed from briefly showing unfiltered content. We use a
      // time-boxed wait so the UI isn't blocked indefinitely if decryption stalls.
      // PERF: Reduced from 12s to 8s — list decryption timeouts have been
      // lowered so settled results arrive faster. 8s prevents the feed from
      // being blocked while still giving most lists time to decrypt.
      const FEED_SYNC_TIMEOUT_MS = 8000;
      const feedSyncPromise = Promise.race([
        Promise.allSettled([
          listStatePromise,
          profileStatePromise,
        ]),
        new Promise((resolve) => setTimeout(resolve, FEED_SYNC_TIMEOUT_MS)),
      ]).catch(() => null);

      // Chain the grid refresh after the feed data is available.
      this.lastIdentityRefreshPromise = feedSyncPromise
        .then(() =>
          this.refreshAllVideoGrids({
            reason: "auth-login",
            forceMainReload: true,
          }),
        );
      this.lastIdentityRefreshPromise
        .catch((error) => {
          devLogger.error("Failed to refresh video grids after login:", error);
        })
        .finally(() => {
          this.lastIdentityRefreshPromise = null;
        });

      this.forceRefreshAllProfiles();

      if (this.uploadModal?.refreshCloudflareBucketPreview) {
        Promise.resolve()
          .then(() => this.uploadModal.refreshCloudflareBucketPreview())
          .catch((error) => {
            devLogger.warn(
              "[Application] Failed to refresh cloudflare bucket preview after login:",
              error,
            );
          });
      }

      userLogger.info("[auth-login-complete]", {
        pubkey: activePubkey || null,
        durationMs: Math.max(0, Math.round(now() - authLoginStart)),
      });
    },

    handleBlocksLoaded(detail = {}) {
      if (detail?.blocksLoaded !== true) {
        return;
      }

      if (this.profileController) {
        try {
          this.profileController.populateBlockedList();
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to refresh blocked list after blocks loaded:",
            error,
          );
        }
      }

      try {
        void this.onVideosShouldRefresh({ reason: "blocks-loaded" });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh videos after blocks loaded:",
          error,
        );
      }
    },

    handleRelaysLoaded(detail = {}) {
      if (detail?.relaysLoaded !== true) {
        return;
      }

      this.scheduleRelayUiRefresh();
    },

    scheduleRelayUiRefresh() {
      if (this.relayUiRefreshTimeout) {
        return;
      }

      const scheduleTimeout =
        typeof window !== "undefined" && typeof window.setTimeout === "function"
          ? window.setTimeout.bind(window)
          : setTimeout;

      this.relayUiRefreshTimeout = scheduleTimeout(() => {
        this.relayUiRefreshTimeout = null;
        this.flushRelayUiRefresh();
      }, RELAY_UI_BATCH_DELAY_MS);
    },

    flushRelayUiRefresh() {
      if (!this.profileController) {
        return;
      }

      try {
        this.profileController.populateProfileRelays();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh profile relays after relays loaded:",
          error,
        );
      }

      try {
        void this.profileController.refreshDmRelayPreferences({ force: true });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh DM relay preferences after relays loaded:",
          error,
        );
      }
    },

    async requestLogout() {
      const detail = await this.authService.logout();

      if (detail && typeof detail === "object") {
        try {
          detail.__handled = true;
        } catch (error) {
          devLogger.warn("Failed to mark logout detail as handled:", error);
        }
      }

      try {
        await this.handleAuthLogout(detail);
      } catch (error) {
        // Logout must remain idempotent and successful once auth state is cleared.
        // Post-logout UI cleanup failures should be logged but must not bubble
        // up and cause "Failed to logout" UX or require repeated attempts.
        userLogger.warn(
          "[Application] Post-logout cleanup failed after auth state was cleared:",
          error,
        );
      }
      return detail ?? null;
    },

    async handleAuthLogout(detail = {}) {
      // Deduplicate concurrent calls — the auth:logout event listener may
      // fire-and-forget this method while requestLogout() also awaits it.
      // Return the in-flight promise so both callers resolve together.
      if (this._pendingLogoutPromise) {
        return this._pendingLogoutPromise;
      }

      this._pendingLogoutPromise = this._executeAuthLogout(detail);
      try {
        return await this._pendingLogoutPromise;
      } finally {
        this._pendingLogoutPromise = null;
      }
    },

    async _executeAuthLogout(detail = {}) {
      if (detail && typeof detail === "object") {
        try {
          detail.__handled = true;
        } catch (error) {
          devLogger.warn("Failed to mark logout detail as handled:", error);
        }
      }

      this.resetViewLoggingState();
      this.pendingModalZapOpen = false;

      this.resetHashtagPreferencesState();
      this.resetPermissionPromptState();
      clearDecryptionSchemeCache();
      this.updateAuthLoadingState({ profile: "idle", lists: "idle", dms: "idle" });

      try {
        await this.nwcSettingsService.onLogout({
          pubkey: detail?.pubkey || this.pubkey,
          previousPubkey: detail?.previousPubkey,
        });
      } catch (error) {
        devLogger.warn("Failed to reset NWC settings during logout:", error);
      }

      if (this.profileController) {
        try {
          await this.profileController.handleAuthLogout(detail);
        } catch (error) {
          devLogger.error(
            "Failed to process logout within the profile controller:",
            error,
          );
        }
      } else {
        this.renderSavedProfiles();
      }

      this.applyLoggedOutUiState();
      this.updateShareNostrAuthState({ reason: "auth-logout" });
      if (typeof this.refreshUnreadDmIndicator === "function") {
        void this.refreshUnreadDmIndicator({ reason: "auth-logout" });
      } else if (this.appChromeController?.setUnreadDmIndicator) {
        this.appChromeController.setUnreadDmIndicator(false);
      }

      const logoutView = getHashViewName();
      if (
        typeof logoutView === "string" &&
        logoutView.trim().toLowerCase() === FEED_TYPES.FOR_YOU
      ) {
        setHashView(FEED_TYPES.RECENT);
      }

      const activeModalVideo =
        typeof this.videoModal?.getCurrentVideo === "function"
          ? this.videoModal.getCurrentVideo()
          : this.commentController?.currentVideo || null;

      if (this.commentController && activeModalVideo) {
        // Regression guard: ensure logout refreshes the modal thread so comments stay visible without reopening.
        this.commentController.load(activeModalVideo);
      } else {
        this.commentController?.refreshAuthState?.();
      }

      try {
        await this.handleModerationSettingsChange({
          settings: getModerationSettings(),
          skipRefresh: true,
        });
      } catch (error) {
        devLogger.warn(
          "Failed to reset moderation settings after logout:",
          error,
        );
      }

      if (this.videoModal?.closeZapDialog) {
        try {
          this.videoModal.closeZapDialog({ silent: true, restoreFocus: false });
        } catch (error) {
          devLogger.warn("Failed to close zap dialog during logout:", error);
        }
      }

      if (this.zapController) {
        try {
          this.zapController.resetState();
          this.zapController.setVisibility(Boolean(this.currentVideo?.lightningAddress));
        } catch (error) {
          devLogger.warn("Failed to reset zap controller during logout:", error);
        }
      }

      if (typeof this.nostrService?.stopDirectMessageSubscription === "function") {
        try {
          this.nostrService.stopDirectMessageSubscription();
        } catch (error) {
          devLogger.warn("Failed to stop DM subscription during logout:", error);
        }
      }

      if (typeof this.nostrService?.clearDirectMessages === "function") {
        try {
          this.nostrService.clearDirectMessages({ emit: true });
        } catch (error) {
          devLogger.warn("Failed to clear cached DMs during logout:", error);
        }
      }

      if (typeof this.nostrService?.clearVideoSubscription === "function") {
        try {
          this.nostrService.clearVideoSubscription();
        } catch (error) {
          devLogger.warn("Failed to clear video subscription during logout:", error);
        }
      }

      if (typeof this.nostrService?.resetVideosCache === "function") {
        try {
          this.nostrService.resetVideosCache();
        } catch (error) {
          devLogger.warn("Failed to reset cached videos during logout:", error);
        }
      }

      try {
        await this.renderVideoList({
          videos: [],
          metadata: { reason: "auth:logout" },
        });
      } catch (error) {
        devLogger.warn("Failed to render empty list during logout:", error);
      }

      this.dispatchAuthChange({
        status: "logout",
        loggedIn: false,
        pubkey: detail?.pubkey || null,
        previousPubkey: detail?.previousPubkey || null,
      });

      try {
        await this.loadVideos(true);
      } catch (error) {
        devLogger.error("Failed to refresh videos after logout:", error);
      }
      this.forceRefreshAllProfiles();
      if (this.uploadModal?.refreshCloudflareBucketPreview) {
        try {
          await this.uploadModal.refreshCloudflareBucketPreview();
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to refresh Cloudflare preview during logout:",
            error,
          );
        }
      }
    },

    handleProfileUpdated(detail = {}) {
      if (this.profileController) {
        this.profileController.handleProfileUpdated(detail);
      } else if (Array.isArray(detail?.savedProfiles)) {
        this.renderSavedProfiles();
      }

      const normalizedPubkey = detail?.pubkey
        ? this.normalizeHexPubkey(detail.pubkey)
        : null;
      const profile = detail?.profile;

      if (normalizedPubkey && profile) {
        this.updateProfileInDOM(normalizedPubkey, profile);
        if (
          !this.profileController &&
          this.normalizeHexPubkey(this.pubkey) === normalizedPubkey
        ) {
          this.updateActiveProfileUI(normalizedPubkey, profile);
        }
      }
    },

    /**
     * Cleanup resources on unload or modal close.
     *
     * When `preserveModals` is true the modal infrastructure is kept alive so the
     * next playback session can reuse the existing controllers without
     * reinitializing DOM bindings.
     */
    async cleanup({
      preserveSubscriptions = false,
      preserveObservers = false,
      preserveModals = false,
    } = {}) {
      this.log(
        `[cleanup] Requested (preserveSubscriptions=${preserveSubscriptions}, preserveObservers=${preserveObservers}, preserveModals=${preserveModals})`
      );
      // Serialise teardown so overlapping calls (e.g. close button spam) don't
      // race each other and clobber a fresh playback setup.
      if (this.cleanupPromise) {
        this.log("[cleanup] Waiting for in-flight cleanup to finish before starting a new run.");
        try {
          await this.cleanupPromise;
        } catch (err) {
          devLogger.warn("Previous cleanup rejected:", err);
        }
      }

      const runCleanup = async () => {
        this.log(
          `[cleanup] Begin (preserveSubscriptions=${preserveSubscriptions}, preserveObservers=${preserveObservers}, preserveModals=${preserveModals})`
        );
        try {
          this.cancelPendingViewLogging();
          await this.flushWatchHistory("session-end", "cleanup").catch(
            (error) => {
              const message =
                error && typeof error.message === "string"
                  ? error.message
                  : String(error ?? "unknown error");
              this.log(`[cleanup] Watch history flush failed: ${message}`);
            }
          );
          this.clearActiveIntervals();
          if (this.playbackService) {
            this.playbackService.cleanupWatchdog();
          }
          this.teardownModalViewCountSubscription();
          if (this.reactionController) {
            this.reactionController.unsubscribe();
          }

          if (!preserveObservers && this.mediaLoader) {
            this.mediaLoader.disconnect();
          }

          if (!preserveObservers) {
            this.teardownAllViewCountSubscriptions();
          } else {
            this.pruneDetachedViewCountElements();
          }

          if (!preserveSubscriptions) {
            this.nostrService.clearVideoSubscription();
            this.videoSubscription = this.nostrService.getVideoSubscription() || null;
          }

          // If there's a small inline player
          if (this.videoElement) {
            this.videoElement = this.teardownVideoElement(this.videoElement);
          }
          if (
            this.videoModal &&
            typeof this.videoModal.clearPosterCleanup === "function"
          ) {
            try {
              this.videoModal.clearPosterCleanup();
            } catch (err) {
              devLogger.warn("[cleanup] video modal poster cleanup threw:", err);
            }
          }

          const modalVideoEl = this.modalVideo;
          if (modalVideoEl) {
            const refreshedModal = this.teardownVideoElement(modalVideoEl, {
              replaceNode: true,
            });
            if (refreshedModal) {
              this.modalVideo = refreshedModal;
              if (
                this.videoModal &&
                typeof this.videoModal.setVideoElement === "function"
              ) {
                try {
                  this.videoModal.setVideoElement(refreshedModal);
                } catch (err) {
                  devLogger.warn(
                    "[cleanup] Failed to sync video modal element after replacement:",
                    err
                  );
                }
              }
            }
          }

          this.commentController?.dispose({ resetUi: false });

          if (!preserveModals) {
            if (this.modalManager) {
              try {
                this.modalManager.teardown();
              } catch (error) {
                devLogger.warn("[cleanup] Modal teardown failed:", error);
              }
              this.modalManager = null;
            }

            if (this.bootstrapper) {
              try {
                this.bootstrapper.teardown();
              } catch (error) {
                devLogger.warn("[cleanup] Bootstrap teardown failed:", error);
              }
            }
          }


          // Tell webtorrent to cleanup
          await torrentClient.cleanup();
          this.log("[cleanup] WebTorrent cleanup resolved.");

          try {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
              await fetch("/webtorrent/cancel/", { mode: "no-cors" });
            }
          } catch (err) {
            // Ignore errors when cancelling the service worker stream; it may not be active.
          }
        } catch (err) {
          devLogger.error("Cleanup error:", err);
        } finally {
          this.log("[cleanup] Finished.");
        }
      };

      const cleanupPromise = runCleanup();
      this.cleanupPromise = cleanupPromise;

      try {
        await cleanupPromise;
      } finally {
        if (this.cleanupPromise === cleanupPromise) {
          this.cleanupPromise = null;
        }
      }
    },

    async waitForCleanup() {
      if (!this.cleanupPromise) {
        return;
      }

      try {
        this.log("[waitForCleanup] Awaiting previous cleanup before continuing.");
        await this.cleanupPromise;
        this.log("[waitForCleanup] Previous cleanup completed.");
      } catch (err) {
        devLogger.warn("waitForCleanup observed a rejected cleanup:", err);
      }
    },

    clearActiveIntervals() {
      if (Array.isArray(this.activeIntervals)) {
        this.activeIntervals.forEach((id) => clearInterval(id));
      }
      this.activeIntervals = [];
      this.torrentStatusIntervalId = null;
    },

    cacheTorrentStatusNodes() {
      const doc =
        (this.videoModal && this.videoModal.document) ||
        (typeof document !== "undefined" ? document : null);
      if (!doc || typeof doc.getElementById !== "function") {
        this.torrentStatusNodes = null;
        return;
      }
      this.torrentStatusNodes = {
        status: doc.getElementById("status"),
        progress: doc.getElementById("progress"),
        peers: doc.getElementById("peers"),
        speed: doc.getElementById("speed"),
        downloaded: doc.getElementById("downloaded"),
      };
    },

    clearTorrentStatusNodes() {
      this.torrentStatusNodes = null;
    },

    removeActiveInterval(intervalId) {
      if (!intervalId || !Array.isArray(this.activeIntervals)) {
        return;
      }
      this.activeIntervals = this.activeIntervals.filter((id) => id !== intervalId);
    },

    addTorrentStatusVisibilityHandlers({ onPause, onResume, onClose } = {}) {
      this.removeTorrentStatusVisibilityHandlers();
      const handleVisibilityChange = () => {
        if (!document.body.contains(this.modalVideo)) {
          if (typeof onClose === "function") {
            onClose();
          }
          this.removeTorrentStatusVisibilityHandlers();
          return;
        }
        if (document.visibilityState === "hidden") {
          if (typeof onPause === "function") {
            onPause();
          }
          return;
        }
        if (typeof onResume === "function") {
          onResume();
        }
      };
      const handlePageHide = () => {
        if (typeof onPause === "function") {
          onPause();
        }
      };
      this.torrentStatusVisibilityHandler = handleVisibilityChange;
      this.torrentStatusPageHideHandler = handlePageHide;
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pagehide", handlePageHide);
    },

    removeTorrentStatusVisibilityHandlers() {
      if (this.torrentStatusVisibilityHandler) {
        document.removeEventListener("visibilitychange", this.torrentStatusVisibilityHandler);
        this.torrentStatusVisibilityHandler = null;
      }
      if (this.torrentStatusPageHideHandler) {
        window.removeEventListener("pagehide", this.torrentStatusPageHideHandler);
        this.torrentStatusPageHideHandler = null;
      }
    },

    async handleProfileSwitchRequest({ pubkey, providerId } = {}) {
      if (!pubkey) {
        throw new Error("Missing pubkey for profile switch request.");
      }

      const result = await this.authService.switchProfile(pubkey, { providerId });

      if (result?.switched) {
        const detail = result.detail || null;

        if (
          detail?.postLoginPromise &&
          typeof detail.postLoginPromise.then === "function"
        ) {
          try {
            await detail.postLoginPromise;
          } catch (error) {
            devLogger.warn(
              "Failed to complete post-login hydration before continuing after profile switch:",
              error,
            );
          }
        }

        try {
          await this.handleModerationSettingsChange({
            settings: getModerationSettings(),
            skipRefresh: true,
          });
        } catch (error) {
          devLogger.warn(
            "Failed to sync moderation settings after profile switch:",
            error,
          );
        }

        const refreshCompleted = await this.waitForIdentityRefresh({
          reason: "profile-switch",
        });

        if (!refreshCompleted) {
          devLogger.warn(
            "[Application] Fallback identity refresh was required after switching profiles.",
          );
        }

        if (this.watchHistoryTelemetry?.resetPlaybackLoggingState) {
          try {
            this.watchHistoryTelemetry.resetPlaybackLoggingState();
          } catch (error) {
            devLogger.warn(
              "Failed to reset watch history telemetry after profile switch:",
              error,
            );
          }
        }

        if (this.watchHistoryTelemetry?.refreshPreferenceSettings) {
          try {
            this.watchHistoryTelemetry.refreshPreferenceSettings();
          } catch (error) {
            devLogger.warn(
              "Failed to refresh watch history preferences after profile switch:",
              error,
            );
          }
        }
      }

      return result;
    },

    async waitForIdentityRefresh({
      reason = "identity-refresh",
      attempts = 6,
    } = {}) {
      const maxAttempts = Number.isFinite(attempts)
        ? Math.max(1, Math.floor(attempts))
        : 6;
      const waitForTick = () =>
        new Promise((resolve) => {
          if (typeof queueMicrotask === "function") {
            queueMicrotask(resolve);
          } else if (typeof setTimeout === "function") {
            setTimeout(resolve, 0);
          } else {
            resolve();
          }
        });

      let promise = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = this.lastIdentityRefreshPromise;
        if (candidate && typeof candidate.then === "function") {
          promise = candidate;
          break;
        }
        // Yield to allow the auth login flow to schedule the refresh promise.
        // eslint-disable-next-line no-await-in-loop
        await waitForTick();
      }

      if (promise && typeof promise.then === "function") {
        try {
          await promise;
          return true;
        } catch (error) {
          devLogger.error(
            "[Application] Identity refresh promise rejected:",
            error,
          );
        }

        const activePubkey = this.pubkey;
        if (activePubkey) {
          try {
            await this.nostrService.loadDirectMessages({
              actorPubkey: activePubkey,
              limit: 50,
              initialLoad: true,
            });
          } catch (error) {
            devLogger.warn(
              "[Application] Failed to sync direct messages during login:",
              error,
            );
          }
        }
      }

      try {
        await this.refreshAllVideoGrids({
          reason,
          forceMainReload: true,
        });
      } catch (error) {
        devLogger.error(
          "[Application] Failed to refresh video grids after waiting for identity refresh:",
          error,
        );
      }

      return false;
    },

    async handleProfileLogoutRequest({ pubkey, entry } = {}) {
      const candidatePubkey =
        typeof pubkey === "string" && pubkey.trim()
          ? pubkey.trim()
          : typeof entry?.pubkey === "string" && entry.pubkey.trim()
            ? entry.pubkey.trim()
            : "";

      if (!candidatePubkey) {
        return { loggedOut: false, reason: "invalid-pubkey" };
      }

      const normalizedTarget =
        this.normalizeHexPubkey(candidatePubkey) || candidatePubkey;
      if (!normalizedTarget) {
        return { loggedOut: false, reason: "invalid-pubkey" };
      }

      const activeNormalized = this.normalizeHexPubkey(getActiveProfilePubkey());
      if (activeNormalized && activeNormalized === normalizedTarget) {
        const detail = await this.requestLogout();
        return {
          loggedOut: true,
          reason: "active-profile",
          active: true,
          detail,
        };
      }

      let removalResult;
      try {
        removalResult = this.authService.removeSavedProfile(candidatePubkey);
      } catch (error) {
        devLogger.error(
          "[Application] Failed to remove saved profile during logout request:",
          error,
        );
        return { loggedOut: false, reason: "remove-failed", error };
      }

      if (!removalResult?.removed) {
        if (removalResult?.error) {
          devLogger.warn(
            "[Application] removeSavedProfile returned an error during logout request:",
            removalResult.error,
          );
        }
        return { loggedOut: false, reason: "not-found" };
      }

      if (
        this.nwcSettingsService &&
        typeof this.nwcSettingsService.clearStoredNwcSettings === "function"
      ) {
        try {
          await this.nwcSettingsService.clearStoredNwcSettings(normalizedTarget, {
            silent: true,
          });
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to clear wallet settings for logged-out profile:",
            error,
          );
        }
      }

      this.renderSavedProfiles();

      return { loggedOut: true, removed: true };
    },

    async handleProfileRelayOperation({
      action,
      url,
      activePubkey,
      skipPublishIfUnchanged = true,
    } = {}) {
      const context = {
        action,
        url,
        ok: false,
        changed: false,
        reason: null,
        error: null,
        publishResult: null,
        operationResult: null,
      };

      if (!activePubkey) {
        context.reason = "no-active-pubkey";
        return context;
      }

      const previous = relayManager.snapshot();

      let operationResult;
      try {
        switch (action) {
          case "add":
            operationResult = relayManager.addRelay(url);
            break;
          case "remove":
            operationResult = relayManager.removeRelay(url);
            break;
          case "restore":
            operationResult = relayManager.restoreDefaults();
            break;
          case "mode-toggle":
            operationResult = relayManager.cycleRelayMode(url);
            break;
          default: {
            const error = Object.assign(new Error("Unknown relay operation."), {
              code: "invalid-operation",
            });
            throw error;
          }
        }
      } catch (error) {
        context.reason = error?.code || "operation-error";
        context.error = error;
        return context;
      }

      context.operationResult = operationResult;
      context.changed = Boolean(operationResult?.changed);

      if (!context.changed && skipPublishIfUnchanged) {
        context.reason = operationResult?.reason || "unchanged";
        return context;
      }

      try {
        const publishResult = await relayManager.publishRelayList(activePubkey);
        if (!publishResult?.ok) {
          throw Object.assign(new Error("No relays accepted the update."), {
            code: "publish-failed",
          });
        }
        context.ok = true;
        context.publishResult = publishResult;

        const refreshReason = `relay-${action || "update"}`;
        try {
          await this.onVideosShouldRefresh({ reason: refreshReason });
        } catch (refreshError) {
          devLogger.warn(
            "[Profile] Failed to refresh videos after relay update:",
            refreshError,
          );
        }

        return context;
      } catch (error) {
        context.reason = error?.code || "publish-failed";
        context.error = error;
        try {
          if (Array.isArray(previous)) {
            relayManager.setEntries(previous, { allowEmpty: false });
          }
        } catch (restoreError) {
          devLogger.warn(
            "[Profile] Failed to restore relay preferences after publish error:",
            restoreError,
          );
        }
        return context;
      }
    },

    handleProfileRelayModeToggle(payload = {}) {
      return payload?.context || null;
    },

    handleProfileRelayRestore(payload = {}) {
      return payload?.context || null;
    },

    async handleProfileBlocklistMutation({
      action,
      actorHex,
      targetHex,
    } = {}) {
      const context = { ok: false, reason: null, error: null };

      if (!actorHex || !targetHex) {
        context.reason = "invalid-target";
        return context;
      }

      try {
        await userBlocks.ensureLoaded(actorHex);
        const isBlocked = userBlocks.isBlocked(targetHex);

        if (action === "add") {
          if (isBlocked) {
            context.reason = "already-blocked";
            return context;
          }
          await userBlocks.addBlock(targetHex, actorHex);
          context.ok = true;
          context.reason = "blocked";
        } else if (action === "remove") {
          if (!isBlocked) {
            context.reason = "not-blocked";
            return context;
          }
          await userBlocks.removeBlock(targetHex, actorHex);
          context.ok = true;
          context.reason = "unblocked";
        } else {
          context.reason = "invalid-action";
          return context;
        }

        if (context.ok) {
          try {
            await this.onVideosShouldRefresh({ reason: `blocklist-${action}` });
          } catch (refreshError) {
            devLogger.error(
              "Failed to refresh videos after blocklist mutation:",
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
    },

    async handleProfileAdminMutation(payload = {}) {
      const action = payload?.action;
      const context = { ok: false, error: null, result: null };

      try {
        switch (action) {
          case "ensure-ready":
            await accessControl.waitForReady();
            context.ok = true;
            break;
          case "add-moderator":
            context.result = await accessControl.addModerator(
              payload.actorNpub,
              payload.targetNpub,
            );
            context.ok = !!context.result?.ok;
            break;
          case "remove-moderator":
            context.result = await accessControl.removeModerator(
              payload.actorNpub,
              payload.targetNpub,
            );
            context.ok = !!context.result?.ok;
            break;
          case "list-mutation":
            if (payload.listType === "whitelist") {
              context.result =
                payload.mode === "add"
                  ? await accessControl.addToWhitelist(
                      payload.actorNpub,
                      payload.targetNpub,
                    )
                  : await accessControl.removeFromWhitelist(
                      payload.actorNpub,
                      payload.targetNpub,
                    );
            } else {
              context.result =
                payload.mode === "add"
                  ? await accessControl.addToBlacklist(
                      payload.actorNpub,
                      payload.targetNpub,
                    )
                  : await accessControl.removeFromBlacklist(
                      payload.actorNpub,
                      payload.targetNpub,
                    );
            }
            context.ok = !!context.result?.ok;
            break;
          default:
            context.error = Object.assign(
              new Error("Unknown admin mutation."),
              { code: "invalid-action" },
            );
        }
      } catch (error) {
        context.error = error;
        return context;
      }

      return context;
    },

    async handleProfileWalletPersist(options = {}) {
      return this.nwcSettingsService.handleProfileWalletPersist(options);
    },

    async handleProfileWalletTest({ nwcUri, defaultZap } = {}) {
      return this.nwcSettingsService.ensureWallet({ nwcUri, defaultZap });
    },

    async handleProfileWalletDisconnect() {
      return this.nwcSettingsService.updateActiveNwcSettings(
        this.nwcSettingsService.createDefaultNwcSettings(),
      );
    },

    handleProfileAdminNotifyError({ error } = {}) {
      if (!error) {
        return;
      }
      devLogger.warn("[admin] Notification dispatch issue:", error);
    },

    handleProfileHistoryEvent() {
      return null;
    },
  };
}
