// js/app/feedCoordinator.js

/**
 * Feed sourcing, filtering, sorting, and telemetry orchestration.
 *
 * All module-level dependencies are injected from the Application
 * composition root rather than imported at module scope.
 *
 * Methods use `this` which is bound to the Application instance.
 */

import { FEED_TYPES } from "../constants.js";

/**
 * @param {object} deps - Injected dependencies.
 * @returns {object} Methods to be bound to the Application instance.
 */
export function createFeedCoordinator(deps) {
  const {
    devLogger,
    userLogger,
    nostrClient,
    watchHistoryService,
    subscriptions,
    getSidebarLoadingMarkup,
    pointerKey,
    isValidMagnetUri,
    readCachedUrlHealth,
    persistUrlHealth,
    // Feed engine factories
    createActiveNostrSource,
    createBlacklistFilterStage,
    createDisinterestFilterStage,
    createDedupeByRootStage,
    createExploreDiversitySorter,
    createExploreScorerStage,
    createKidsAudienceFilterStage,
    createKidsScorerStage,
    createKidsScoreSorter,
    createModerationStage,
    createResolvePostedAtStage,
    createTagPreferenceFilterStage,
    createWatchHistorySuppressionStage,
    createChronologicalSorter,
    createSubscriptionAuthorsSource,
    registerWatchHistoryFeed: registerWatchHistoryFeedFn,
  } = deps;

  return {
    registerRecentFeed() {
      if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
        return null;
      }

      const existingDefinition =
        typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition("recent")
          : null;
      if (existingDefinition) {
        return existingDefinition;
      }

      try {
        const app = this;
        const resolveThresholdFromApp = (key) => ({ runtimeValue, defaultValue }) => {
          if (
            Number.isFinite(runtimeValue) ||
            runtimeValue === Number.POSITIVE_INFINITY
          ) {
            return runtimeValue;
          }

          if (app && typeof app.getActiveModerationThresholds === "function") {
            const active = app.getActiveModerationThresholds();
            const candidate = active && typeof active === "object" ? active[key] : undefined;
            if (
              Number.isFinite(candidate) ||
              candidate === Number.POSITIVE_INFINITY
            ) {
              return candidate;
            }
          }

          return defaultValue;
        };
        return this.feedEngine.registerFeed("recent", {
          source: createActiveNostrSource({ service: this.nostrService }),
          stages: [
            createBlacklistFilterStage({
              shouldIncludeVideo: (video, options) =>
                this.nostrService.shouldIncludeVideo(video, options),
            }),
            createDedupeByRootStage({
              dedupe: (videos) => this.dedupeVideosByRoot(videos),
            }),
            createModerationStage({
              getService: () => this.nostrService.getModerationService(),
              autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
              blurThreshold: resolveThresholdFromApp("blurThreshold"),
              trustedMuteHideThreshold: resolveThresholdFromApp("trustedMuteHideThreshold"),
              trustedReportHideThreshold: resolveThresholdFromApp("trustedSpamHideThreshold"),
            }),
            createResolvePostedAtStage(),
          ],
          sorter: createChronologicalSorter(),
          hooks: {
            timestamps: {
              getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
              resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
            },
          },
        });
      } catch (error) {
        devLogger.warn("[Application] Failed to register recent feed:", error);
        return null;
      }
    },

    /**
     * Register the FEED_TYPES.FOR_YOU feed pipeline.
     */
    registerForYouFeed() {
      if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
        return null;
      }

      const existingDefinition =
        typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition(FEED_TYPES.FOR_YOU)
          : null;
      if (existingDefinition) {
        return existingDefinition;
      }

      try {
        const app = this;
        const resolveThresholdFromApp = (key) => ({ runtimeValue, defaultValue }) => {
          if (
            Number.isFinite(runtimeValue) ||
            runtimeValue === Number.POSITIVE_INFINITY
          ) {
            return runtimeValue;
          }

          if (app && typeof app.getActiveModerationThresholds === "function") {
            const active = app.getActiveModerationThresholds();
            const candidate = active && typeof active === "object" ? active[key] : undefined;
            if (
              Number.isFinite(candidate) ||
              candidate === Number.POSITIVE_INFINITY
            ) {
              return candidate;
            }
          }

          return defaultValue;
        };
        return this.feedEngine.registerFeed(FEED_TYPES.FOR_YOU, {
          source: createActiveNostrSource({ service: this.nostrService }),
          stages: [
            // Note: Tag-preference filtering is consolidated in createTagPreferenceFilterStage
            // so each feed has a single source of truth for interest-based inclusion/ranking.
            createTagPreferenceFilterStage(),
            createBlacklistFilterStage({
              shouldIncludeVideo: (video, options) =>
                this.nostrService.shouldIncludeVideo(video, options),
            }),
            createWatchHistorySuppressionStage(),
            createDedupeByRootStage({
              dedupe: (videos) => this.dedupeVideosByRoot(videos),
            }),
            createModerationStage({
              getService: () => this.nostrService.getModerationService(),
              autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
              blurThreshold: resolveThresholdFromApp("blurThreshold"),
              trustedMuteHideThreshold: resolveThresholdFromApp("trustedMuteHideThreshold"),
              trustedReportHideThreshold: resolveThresholdFromApp("trustedSpamHideThreshold"),
            }),
            createResolvePostedAtStage(),
          ],
          sorter: createChronologicalSorter(),
          hooks: {
            timestamps: {
              getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
              resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
            },
          },
        });
      } catch (error) {
        devLogger.warn("[Application] Failed to register for-you feed:", error);
        return null;
      }
    },

    /**
     * Register the FEED_TYPES.KIDS feed pipeline.
     */
    registerKidsFeed() {
      if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
        return null;
      }

      const existingDefinition =
        typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition(FEED_TYPES.KIDS)
          : null;
      if (existingDefinition) {
        return existingDefinition;
      }

      try {
        const app = this;
        const resolveThresholdFromApp = (key, kidsDefault) => ({
          runtimeValue,
          defaultValue,
        }) => {
          if (
            Number.isFinite(runtimeValue) ||
            runtimeValue === Number.POSITIVE_INFINITY
          ) {
            return runtimeValue;
          }

          if (app && typeof app.getActiveModerationThresholds === "function") {
            const active = app.getActiveModerationThresholds();
            const candidate = active && typeof active === "object" ? active[key] : undefined;
            if (
              Number.isFinite(candidate) ||
              candidate === Number.POSITIVE_INFINITY
            ) {
              return candidate;
            }
          }

          if (
            Number.isFinite(kidsDefault) ||
            kidsDefault === Number.POSITIVE_INFINITY
          ) {
            return kidsDefault;
          }

          return defaultValue;
        };

        const kidsDefaults = {
          blurThreshold: 1,
          trustedReportHideThreshold: 1,
          trustedMuteHideThreshold: 1,
        };

        const disallowedWarnings = [
          "nudity",
          "sexual",
          "graphic-violence",
          "self-harm",
          "drugs",
        ];

        const moderationStages = ["nudity", "violence", "self-harm"].map(
          (reportType) =>
            createModerationStage({
              stageName: `kids-moderation-${reportType}`,
              reportType,
              getService: () => this.nostrService.getModerationService(),
              autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
              blurThreshold: resolveThresholdFromApp(
                "blurThreshold",
                kidsDefaults.blurThreshold,
              ),
              trustedMuteHideThreshold: resolveThresholdFromApp(
                "trustedMuteHideThreshold",
                kidsDefaults.trustedMuteHideThreshold,
              ),
              trustedReportHideThreshold: resolveThresholdFromApp(
                "trustedSpamHideThreshold",
                kidsDefaults.trustedReportHideThreshold,
              ),
            }),
        );

        return this.feedEngine.registerFeed(FEED_TYPES.KIDS, {
          source: createActiveNostrSource({ service: this.nostrService }),
          stages: [
            createBlacklistFilterStage({
              shouldIncludeVideo: (video, options) =>
                this.nostrService.shouldIncludeVideo(video, options),
            }),
            createKidsAudienceFilterStage({
              disallowedWarnings,
            }),
            ...moderationStages,
            createResolvePostedAtStage(),
            createDedupeByRootStage({
              dedupe: (videos) => this.dedupeVideosByRoot(videos),
            }),
            createKidsScorerStage(),
          ],
          sorter: createKidsScoreSorter(),
          defaultConfig: {
            ageGroup: "preschool",
            educationalTags: [],
            disallowedWarnings,
          },
          configSchema: {
            ageGroup: {
              type: "enum",
              values: ["toddler", "preschool", "early", "older"],
              description: "Target age group used for kids scoring defaults.",
              default: "preschool",
            },
            educationalTags: {
              type: "string[]",
              description: "Optional educational tag overrides for kids scoring.",
              default: [],
            },
            disallowedWarnings: {
              type: "string[]",
              description:
                "Content warnings that should exclude videos from the kids feed.",
              default: disallowedWarnings,
            },
          },
          hooks: {
            timestamps: {
              getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
              resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
            },
          },
        });
      } catch (error) {
        devLogger.warn("[Application] Failed to register kids feed:", error);
        return null;
      }
    },

    /**
     * Register the FEED_TYPES.EXPLORE feed pipeline.
     */
    registerExploreFeed() {
      if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
        return null;
      }

      const existingDefinition =
        typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition(FEED_TYPES.EXPLORE)
          : null;
      if (existingDefinition) {
        return existingDefinition;
      }

      try {
        const app = this;
        const resolveThresholdFromApp = (key) => ({ runtimeValue, defaultValue }) => {
          if (
            Number.isFinite(runtimeValue) ||
            runtimeValue === Number.POSITIVE_INFINITY
          ) {
            return runtimeValue;
          }

          if (app && typeof app.getActiveModerationThresholds === "function") {
            const active = app.getActiveModerationThresholds();
            const candidate = active && typeof active === "object" ? active[key] : undefined;
            if (
              Number.isFinite(candidate) ||
              candidate === Number.POSITIVE_INFINITY
            ) {
              return candidate;
            }
          }

          return defaultValue;
        };
        return this.feedEngine.registerFeed(FEED_TYPES.EXPLORE, {
          source: createActiveNostrSource({ service: this.nostrService }),
          stages: [
            createDisinterestFilterStage(),
            createBlacklistFilterStage({
              shouldIncludeVideo: (video, options) =>
                this.nostrService.shouldIncludeVideo(video, options),
            }),
            createDedupeByRootStage({
              dedupe: (videos) => this.dedupeVideosByRoot(videos),
            }),
            createModerationStage({
              getService: () => this.nostrService.getModerationService(),
              autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
              blurThreshold: resolveThresholdFromApp("blurThreshold"),
              trustedMuteHideThreshold: resolveThresholdFromApp("trustedMuteHideThreshold"),
              trustedReportHideThreshold: resolveThresholdFromApp("trustedSpamHideThreshold"),
            }),
            createResolvePostedAtStage(),
            createExploreScorerStage(),
          ],
          sorter: createExploreDiversitySorter(),
          hooks: {
            timestamps: {
              getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
              resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
            },
          },
        });
      } catch (error) {
        devLogger.warn("[Application] Failed to register explore feed:", error);
        return null;
      }
    },

    registerSubscriptionsFeed() {
      if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
        return null;
      }

      const existingDefinition =
        typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition(FEED_TYPES.SUBSCRIPTIONS)
          : null;
      if (existingDefinition) {
        return existingDefinition;
      }

      try {
        const app = this;
        const resolveThresholdFromApp = (key) => ({ runtimeValue, defaultValue }) => {
          if (
            Number.isFinite(runtimeValue) ||
            runtimeValue === Number.POSITIVE_INFINITY
          ) {
            return runtimeValue;
          }

          if (app && typeof app.getActiveModerationThresholds === "function") {
            const active = app.getActiveModerationThresholds();
            const candidate = active && typeof active === "object" ? active[key] : undefined;
            if (
              Number.isFinite(candidate) ||
              candidate === Number.POSITIVE_INFINITY
            ) {
              return candidate;
            }
          }

          return defaultValue;
        };
        return this.feedEngine.registerFeed(FEED_TYPES.SUBSCRIPTIONS, {
          source: createSubscriptionAuthorsSource({ service: this.nostrService }),
          stages: [
            // Note: Tag-preference filtering is consolidated in createTagPreferenceFilterStage
            // so each feed has a single source of truth for interest-based inclusion/ranking.
            createTagPreferenceFilterStage(),
            createBlacklistFilterStage({
              shouldIncludeVideo: (video, options) =>
                this.nostrService.shouldIncludeVideo(video, options),
            }),
            createDedupeByRootStage({
              dedupe: (videos) => this.dedupeVideosByRoot(videos),
            }),
            createModerationStage({
              getService: () => this.nostrService.getModerationService(),
              autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
              blurThreshold: resolveThresholdFromApp("blurThreshold"),
              trustedMuteHideThreshold: resolveThresholdFromApp("trustedMuteHideThreshold"),
              trustedReportHideThreshold: resolveThresholdFromApp("trustedSpamHideThreshold"),
            }),
            createResolvePostedAtStage(),
          ],
          sorter: createChronologicalSorter(),
          hooks: {
            subscriptions: {
              resolveAuthors: () => subscriptions.getSubscribedAuthors(),
            },
            timestamps: {
              getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
              resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
            },
          },
        });
      } catch (error) {
        devLogger.warn("[Application] Failed to register subscriptions feed:", error);
        return null;
      }
    },

    registerWatchHistoryFeed() {
      if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
        devLogger.warn("[Application] Cannot register watch-history feed: feedEngine not available.");
        return null;
      }

      const existingDefinition =
        typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition("watch-history")
          : null;
      if (existingDefinition) {
        return existingDefinition;
      }

      try {
        return registerWatchHistoryFeedFn(this.feedEngine, {
          service: watchHistoryService,
          nostr: this.nostrService,
        });
      } catch (error) {
        devLogger.warn("[Application] Failed to register watch history feed:", error);
        return null;
      }
    },

    buildForYouFeedRuntime({ watchHistoryItems = [] } = {}) {
      const blacklist =
        this.blacklistedEventIds instanceof Set
          ? new Set(this.blacklistedEventIds)
          : new Set();

      const preferenceSource =
        this.hashtagPreferencesSnapshot &&
        typeof this.hashtagPreferencesSnapshot === "object"
          ? this.hashtagPreferencesSnapshot
          : typeof this.createHashtagPreferencesSnapshot === "function"
          ? this.createHashtagPreferencesSnapshot()
          : typeof this.getHashtagPreferences === "function"
          ? this.getHashtagPreferences()
          : {};
      const { interests = [], disinterests = [] } = preferenceSource || {};
      const preferencesAvailable = preferenceSource?.dataReady === true;
      const moderationThresholds = this.getActiveModerationThresholds();

      const watchedKeys = new Set();
      if (Array.isArray(watchHistoryItems)) {
        for (const item of watchHistoryItems) {
          const key =
            typeof item.pointerKey === "string" && item.pointerKey
              ? item.pointerKey
              : pointerKey(item.pointer || item);
          if (key) {
            watchedKeys.add(key);
          }
        }
      }

      return {
        blacklistedEventIds: blacklist,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
        tagPreferences: {
          interests: Array.isArray(interests) ? [...interests] : [],
          disinterests: Array.isArray(disinterests) ? [...disinterests] : [],
          available: preferencesAvailable,
        },
        moderationThresholds: moderationThresholds
          ? { ...moderationThresholds }
          : undefined,
        watchHistory: {
          shouldSuppress: (item) => {
            const video = item?.video;
            if (!video || typeof video !== "object") {
              return false;
            }

            if (video.id) {
              const eKey = pointerKey({ type: "e", value: video.id });
              if (watchedKeys.has(eKey)) {
                return true;
              }
            }

            if (
              Number.isFinite(video.kind) &&
              video.kind >= 30000 &&
              video.kind < 40000 &&
              typeof video.pubkey === "string"
            ) {
              const dTag = Array.isArray(video.tags)
                ? video.tags.find((t) => Array.isArray(t) && t[0] === "d")
                : null;
              const dValue = dTag && typeof dTag[1] === "string" ? dTag[1] : "";
              if (dValue) {
                const aValue = `${video.kind}:${video.pubkey}:${dValue}`;
                const aKey = pointerKey({ type: "a", value: aValue });
                if (watchedKeys.has(aKey)) {
                  return true;
                }
              }
            }
            return false;
          },
        },
      };
    },

    buildExploreFeedRuntime() {
      const exploreDataService =
        this.exploreDataService && typeof this.exploreDataService === "object"
          ? this.exploreDataService
          : null;
      const blacklist =
        this.blacklistedEventIds instanceof Set
          ? new Set(this.blacklistedEventIds)
          : new Set();

      const preferenceSource =
        this.hashtagPreferencesSnapshot &&
        typeof this.hashtagPreferencesSnapshot === "object"
          ? this.hashtagPreferencesSnapshot
          : typeof this.createHashtagPreferencesSnapshot === "function"
          ? this.createHashtagPreferencesSnapshot()
          : typeof this.getHashtagPreferences === "function"
          ? this.getHashtagPreferences()
          : {};
      const { interests = [], disinterests = [] } = preferenceSource || {};
      const preferencesAvailable = preferenceSource?.dataReady === true;
      const moderationThresholds = this.getActiveModerationThresholds();

      const watchHistorySource =
        exploreDataService && typeof exploreDataService.getWatchHistoryTagCounts === "function"
          ? exploreDataService.getWatchHistoryTagCounts()
          : this.watchHistoryTagCounts;
      const watchHistoryTagCounts =
        watchHistorySource instanceof Map
          ? new Map(watchHistorySource)
          : watchHistorySource && typeof watchHistorySource === "object"
          ? { ...watchHistorySource }
          : undefined;

      const exploreTagSource =
        exploreDataService && typeof exploreDataService.getTagIdf === "function"
          ? exploreDataService.getTagIdf()
          : this.exploreTagIdf;
      const exploreTagIdf =
        exploreTagSource instanceof Map
          ? new Map(exploreTagSource)
          : exploreTagSource && typeof exploreTagSource === "object"
          ? { ...exploreTagSource }
          : undefined;

      return {
        blacklistedEventIds: blacklist,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
        tagPreferences: {
          interests: Array.isArray(interests) ? [...interests] : [],
          disinterests: Array.isArray(disinterests) ? [...disinterests] : [],
          available: preferencesAvailable,
        },
        watchHistoryTagCounts,
        exploreTagIdf,
        moderationThresholds: moderationThresholds
          ? { ...moderationThresholds }
          : undefined,
      };
    },

    buildRecentFeedRuntime() {
      const blacklist =
        this.blacklistedEventIds instanceof Set
          ? new Set(this.blacklistedEventIds)
          : new Set();

      const moderationThresholds = this.getActiveModerationThresholds();

      return {
        blacklistedEventIds: blacklist,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
        moderationThresholds: moderationThresholds
          ? { ...moderationThresholds }
          : undefined,
      };
    },

    buildKidsFeedRuntime() {
      const blacklist =
        this.blacklistedEventIds instanceof Set
          ? new Set(this.blacklistedEventIds)
          : new Set();

      const feedDefinition =
        this.feedEngine && typeof this.feedEngine.getFeedDefinition === "function"
          ? this.feedEngine.getFeedDefinition(FEED_TYPES.KIDS)
          : null;
      const configDefaults =
        feedDefinition && typeof feedDefinition.configDefaults === "object"
          ? feedDefinition.configDefaults
          : {};

      const runtimeOverrides =
        this.kidsFeedRuntime && typeof this.kidsFeedRuntime === "object"
          ? this.kidsFeedRuntime
          : {};
      const runtimeConfig =
        this.kidsFeedConfig && typeof this.kidsFeedConfig === "object"
          ? this.kidsFeedConfig
          : {};

      const resolveStringArray = (...candidates) => {
        for (const candidate of candidates) {
          if (!Array.isArray(candidate)) {
            continue;
          }
          return candidate
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean);
        }
        return [];
      };

      const disallowedWarnings = resolveStringArray(
        runtimeOverrides.disallowedWarnings,
        runtimeConfig.disallowedWarnings,
        configDefaults.disallowedWarnings,
      );
      const kidsEducationalTags = resolveStringArray(
        runtimeOverrides.kidsEducationalTags,
        runtimeOverrides.educationalTags,
        runtimeConfig.kidsEducationalTags,
        runtimeConfig.educationalTags,
        configDefaults.educationalTags,
      );
      const trustedAuthors = resolveStringArray(
        runtimeOverrides.trustedAuthors,
        runtimeConfig.trustedAuthors,
      );

      const ageGroupCandidates = [
        runtimeOverrides.ageGroup,
        runtimeConfig.ageGroup,
        configDefaults.ageGroup,
      ];
      let ageGroup = "";
      for (const candidate of ageGroupCandidates) {
        if (typeof candidate !== "string") {
          continue;
        }
        const trimmed = candidate.trim();
        if (trimmed) {
          ageGroup = trimmed;
          break;
        }
      }

      const runtimeModerationOverrides =
        runtimeOverrides.moderationThresholds &&
        typeof runtimeOverrides.moderationThresholds === "object"
          ? runtimeOverrides.moderationThresholds
          : null;
      const configModerationOverrides =
        runtimeConfig.moderationThresholds &&
        typeof runtimeConfig.moderationThresholds === "object"
          ? runtimeConfig.moderationThresholds
          : null;
      const kidsThresholdOverrides =
        runtimeModerationOverrides || configModerationOverrides
          ? {
              ...(configModerationOverrides || {}),
              ...(runtimeModerationOverrides || {}),
            }
          : null;

      const moderationThresholds = this.getActiveModerationThresholds();
      const resolvedModerationThresholds =
        moderationThresholds || kidsThresholdOverrides
          ? {
              ...(moderationThresholds || {}),
              ...(kidsThresholdOverrides || {}),
            }
          : undefined;

      const parentalAllowlist = resolveStringArray(
        runtimeOverrides.parentalAllowlist,
        runtimeOverrides.allowlist,
        runtimeConfig.parentalAllowlist,
        runtimeConfig.allowlist,
      );
      const parentalBlocklist = resolveStringArray(
        runtimeOverrides.parentalBlocklist,
        runtimeOverrides.blocklist,
        runtimeConfig.parentalBlocklist,
        runtimeConfig.blocklist,
      );

      return {
        blacklistedEventIds: blacklist,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
        disallowedWarnings,
        kidsEducationalTags,
        educationalTags: kidsEducationalTags,
        trustedAuthors,
        ageGroup: ageGroup || undefined,
        moderationThresholds: resolvedModerationThresholds,
        parentalAllowlist,
        parentalBlocklist,
      };
    },

    async refreshFeed(feedType, { reason, fallbackVideos } = {}) {
      const normalizedReason = typeof reason === "string" ? reason : undefined;
      const fallback = Array.isArray(fallbackVideos) ? fallbackVideos : [];
      let runtime = {};
      let metadataModifier = (m) => m;

      // 1. Prepare Runtime
      try {
        switch (feedType) {
          case FEED_TYPES.FOR_YOU: {
            let watchHistoryItems = [];
            try {
              watchHistoryItems = await watchHistoryService.loadLatest(
                undefined,
                { allowStale: true },
              );
            } catch (err) {
              devLogger.warn(
                "[Application] Failed to preload watch history for For You feed:",
                err,
              );
            }
            runtime = this.buildForYouFeedRuntime({ watchHistoryItems });
            break;
          }
          case FEED_TYPES.KIDS:
            runtime = this.buildKidsFeedRuntime();
            metadataModifier = (m) => {
              if (runtime?.ageGroup && !m.ageGroup)
                m.ageGroup = runtime.ageGroup;
              return m;
            };
            break;
          case FEED_TYPES.EXPLORE:
            runtime = this.buildExploreFeedRuntime();
            metadataModifier = (m) => {
              const next = { ...m };
              if (!next.sortOrder) next.sortOrder = FEED_TYPES.EXPLORE;
              next.preserveOrder = true;
              return next;
            };
            break;
          case "recent":
            runtime = this.buildRecentFeedRuntime();
            break;
          default:
            devLogger.warn(`[Application] Unknown feed type: ${feedType}`);
            return Promise.resolve({
              videos: fallback,
              metadata: { reason: normalizedReason, engine: "unknown" },
            });
        }
      } catch (err) {
        devLogger.error(
          `[Application] Failed to build runtime for ${feedType}:`,
          err,
        );
      }

      // 2. Check Engine
      if (!this.feedEngine || typeof this.feedEngine.run !== "function") {
        const metadata = metadataModifier({
          reason: normalizedReason,
          engine: "unavailable",
        });
        this.latestFeedMetadata = metadata;
        this.videosMap = this.nostrService.getVideosMap();
        if (this.videoListView) {
          this.videoListView.state.videosMap = this.videosMap;
        }
        // Telemetry update for unavailable engine?
        if (feedType === FEED_TYPES.FOR_YOU || feedType === FEED_TYPES.KIDS) {
          this.updateFeedTelemetryMetadata(feedType, [], metadata);
        }
        this.renderVideoList({ videos: fallback, metadata });
        return Promise.resolve({ videos: fallback, metadata });
      }

      // 3. Run Engine
      return this.feedEngine
        .run(feedType, { runtime })
        .then((result) => {
          const videos = Array.isArray(result?.videos) ? result.videos : [];
          let metadata = { ...(result?.metadata || {}) };
          if (normalizedReason) metadata.reason = normalizedReason;
          metadata = metadataModifier(metadata);

          this.latestFeedMetadata = metadata;
          this.videosMap = this.nostrService.getVideosMap();
          if (this.videoListView) {
            this.videoListView.state.videosMap = this.videosMap;
          }

          const items = Array.isArray(result?.items) ? result.items : [];
          if (feedType === FEED_TYPES.FOR_YOU || feedType === FEED_TYPES.KIDS) {
            this.updateFeedTelemetryMetadata(feedType, items, metadata);
          }

          const payload = { videos, metadata };
          this.renderVideoList(payload);
          return payload;
        })
        .catch((error) => {
          devLogger.error(
            `[Application] Failed to run ${feedType} feed:`,
            error,
          );
          let metadata = {
            reason: normalizedReason || `error:${feedType}-feed`,
            error: true,
          };
          metadata = metadataModifier(metadata);

          this.latestFeedMetadata = metadata;
          this.videosMap = this.nostrService.getVideosMap();
          if (this.videoListView) {
            this.videoListView.state.videosMap = this.videosMap;
          }

          if (feedType === FEED_TYPES.FOR_YOU || feedType === FEED_TYPES.KIDS) {
            this.updateFeedTelemetryMetadata(feedType, [], metadata);
          }

          const payload = { videos: fallback, metadata };
          this.renderVideoList(payload);
          return payload;
        });
    },

    checkRelayHealthWarning() {
      if (!nostrClient || typeof nostrClient.getHealthyRelays !== "function") {
        return false;
      }

      // Give the app a grace period to establish initial connections before complaining.
      const now = Date.now();
      const GRACE_PERIOD_MS = 10000;
      if (now - (this.appStartedAt || now) < GRACE_PERIOD_MS) {
        return false;
      }

      const relayCandidates = Array.isArray(nostrClient.relays) ? nostrClient.relays : [];
      if (!relayCandidates.length) {
        return false;
      }

      const healthyRelays = nostrClient.getHealthyRelays(relayCandidates);
      if (healthyRelays.length) {
        return false;
      }

      const cooldownMs = 30000;
      if (now - (this.lastRelayHealthWarningAt || 0) < cooldownMs) {
        return true;
      }

      this.lastRelayHealthWarningAt = now;
      this.showStatus(
        "All configured relays are unhealthy. Data may be missing until a relay reconnects.",
        { autoHideMs: 12000, showSpinner: false },
      );
      return true;
    },

    /**
     * Unified loader for all feed types.
     */
    async loadFeedVideos(feedType, forceFetch = false) {
      devLogger.log(`Starting loadFeedVideos(${feedType})... (forceFetch =`, forceFetch, ")");
      this.setFeedTelemetryContext(feedType);

      let includeTags = false;
      let loadingMessage = "Fetching videos\u2026";
      let refreshMethod = null;
      let shouldCheckRelayHealth = false;

      switch (feedType) {
        case "recent":
          includeTags = true;
          loadingMessage = "Fetching recent videos\u2026";
          refreshMethod = (opts) => this.refreshFeed("recent", opts);
          shouldCheckRelayHealth = true;
          break;
        case FEED_TYPES.FOR_YOU:
          includeTags = false;
          loadingMessage = "Fetching for-you videos\u2026";
          refreshMethod = (opts) => this.refreshFeed(FEED_TYPES.FOR_YOU, opts);
          shouldCheckRelayHealth = true;
          break;
        case FEED_TYPES.KIDS:
          includeTags = true;
          loadingMessage = "Fetching kids videos\u2026";
          refreshMethod = (opts) => this.refreshFeed(FEED_TYPES.KIDS, opts);
          shouldCheckRelayHealth = false;
          break;
        case FEED_TYPES.EXPLORE:
          includeTags = false;
          loadingMessage = "Fetching explore videos\u2026";
          refreshMethod = (opts) => this.refreshFeed(FEED_TYPES.EXPLORE, opts);
          shouldCheckRelayHealth = false;
          break;
        default:
          devLogger.warn(
            `[Application] Unknown feed type for loadFeedVideos: ${feedType}`,
          );
          return;
      }

      if (shouldCheckRelayHealth) {
        this.checkRelayHealthWarning();
      }

      const container = this.mountVideoListView({ includeTags });
      const hasCachedVideos =
        this.nostrService &&
        Array.isArray(this.nostrService.getFilteredActiveVideos()) &&
        this.nostrService.getFilteredActiveVideos().length > 0;

      if (!hasCachedVideos) {
        if (this.videoListView && container) {
          this.videoListView.showLoading(loadingMessage);
        } else if (container) {
          container.innerHTML = getSidebarLoadingMarkup(loadingMessage);
        }
      }

      let initialRefreshPromise = null;

      const videos = await this.nostrService.loadVideos({
        forceFetch,
        blacklistedEventIds: this.blacklistedEventIds,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
        onVideos: (payload, detail = {}) => {
          const promise = refreshMethod({
            reason: detail?.reason,
            fallbackVideos: payload,
          });
          if (!initialRefreshPromise) {
            initialRefreshPromise = promise;
          }
        },
      });

      if (initialRefreshPromise) {
        await initialRefreshPromise;
      } else if (!Array.isArray(videos) || videos.length === 0) {
        await refreshMethod({ reason: "initial", fallbackVideos: [] });
      }

      this.videoSubscription = this.nostrService.getVideoSubscription() || null;
      this.videosMap = this.nostrService.getVideosMap();
      if (this.videoListView) {
        this.videoListView.state.videosMap = this.videosMap;
      }
    },

    /**
     * Subscribe to videos (older + new) and render them as they come in.
     */
    async loadVideos(forceFetch = false) {
      if (this.loadVideosPromise && !forceFetch) {
        devLogger.log("Reusing in-flight loadVideos request.");
        return this.loadVideosPromise;
      }

      const now = Date.now();
      if (this.lastLoadVideosTime && (now - this.lastLoadVideosTime < 2000) && !forceFetch) {
        devLogger.log("Skipping redundant loadVideos request (cooldown).");
        return Promise.resolve();
      }
      this.lastLoadVideosTime = now;

      this.loadVideosPromise = (async () => {
        await this.loadFeedVideos("recent", forceFetch);
      })();

      try {
        await this.loadVideosPromise;
      } finally {
        this.loadVideosPromise = null;
      }
    },

    async loadForYouVideos(forceFetch = false) {
      return this.loadFeedVideos(FEED_TYPES.FOR_YOU, forceFetch);
    },

    async loadKidsVideos(forceFetch = false) {
      return this.loadFeedVideos(FEED_TYPES.KIDS, forceFetch);
    },

    async loadExploreVideos(forceFetch = false) {
      return this.loadFeedVideos(FEED_TYPES.EXPLORE, forceFetch);
    },

    async loadOlderVideos(lastTimestamp) {
      const olderVideos = await this.nostrService.loadOlderVideos(lastTimestamp, {
        blacklistedEventIds: this.blacklistedEventIds,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      });

      if (!Array.isArray(olderVideos) || olderVideos.length === 0) {
        this.showSuccess("No more older videos found.");
        return;
      }

      await this.refreshFeed("recent", { reason: "older-fetch" });
    },

    /**
     * Returns true if there's at least one strictly older version
     * (same videoRootId, created_at < current) which is NOT deleted.
     */
    hasOlderVersion(video, allEvents) {
      if (!video || !video.videoRootId) return false;

      const rootId = video.videoRootId;
      const currentTs = video.created_at;

      // among ALL known events (including overshadowed), find older, not deleted
      const olderMatches = allEvents.filter(
        (v) => v.videoRootId === rootId && v.created_at < currentTs && !v.deleted
      );
      return olderMatches.length > 0;
    },

    /**
     * Centralised helper for other modules (channel profiles, subscriptions)
     * so they can re-use the exact same badge skeleton. Keeping the markup in
     * one place avoids subtle mismatches when we tweak copy or classes later.
     */
    getUrlHealthPlaceholderMarkup(options = {}) {
      return this.urlHealthController.getUrlHealthPlaceholderMarkup(options);
    },

    getTorrentHealthBadgeMarkup(options = {}) {
      const includeMargin = options?.includeMargin !== false;
      const classes = ["badge", "torrent-health-badge"];
      if (includeMargin) {
        classes.push("mt-sm");
      }

      return `
      <span
        class="${classes.join(" ")}"
        data-stream-health-state="checking"
        data-variant="neutral"
        aria-live="polite"
        role="status"
      >
        \u23F3 Torrent
      </span>
    `;
    },

    isMagnetUriSupported(magnet) {
      return isValidMagnetUri(magnet);
    },

    getCachedUrlHealth(eventId, url) {
      return readCachedUrlHealth(eventId, url);
    },

    storeUrlHealth(eventId, url, result, ttlMs) {
      return persistUrlHealth(eventId, url, result, ttlMs);
    },

    updateUrlHealthBadge(badgeEl, state, videoId) {
      return this.urlHealthController.updateUrlHealthBadge(badgeEl, state, videoId);
    },

    handleUrlHealthBadge(payload) {
      return this.urlHealthController.handleUrlHealthBadge(payload);
    },

    handleStreamHealthBadgeUpdate(detail) {
      if (!detail || typeof detail !== "object") {
        return;
      }

      const card = detail.card;
      if (!(card instanceof HTMLElement)) {
        return;
      }

      let videoId =
        (card.dataset && card.dataset.videoId) ||
        (typeof card.getAttribute === "function" ? card.getAttribute("data-video-id") : "") ||
        "";

      if (!videoId && typeof card.querySelector === "function") {
        const fallback = card.querySelector("[data-video-id]");
        if (fallback instanceof HTMLElement && fallback.dataset.videoId) {
          videoId = fallback.dataset.videoId;
        }
      }

      if (!videoId) {
        return;
      }

      if (this.videoListView && typeof this.videoListView.cacheStreamHealth === "function") {
        this.videoListView.cacheStreamHealth(videoId, {
          state: detail.state,
          peers: detail.peers,
          reason: detail.reason,
          checkedAt: detail.checkedAt,
          text: detail.text,
          tooltip: detail.tooltip,
          role: detail.role,
          ariaLive: detail.ariaLive,
        });
      }
    },

    getFeedTelemetryState(feedName = "") {
      if (!this.feedTelemetryState || typeof this.feedTelemetryState !== "object") {
        this.feedTelemetryState = {
          activeFeed: "",
          feeds: new Map(),
        };
      }

      if (!(this.feedTelemetryState.feeds instanceof Map)) {
        this.feedTelemetryState.feeds = new Map();
      }

      const normalized =
        typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
      if (!normalized) {
        return null;
      }

      if (this.feedTelemetryState.feeds.has(normalized)) {
        return this.feedTelemetryState.feeds.get(normalized);
      }

      const state = {
        matchedTagsById: new Map(),
        matchReasonsById: new Map(),
        kidsScoreById: new Map(),
        moderationById: new Map(),
        ageGroup: "",
        lastImpressionSignature: "",
        activePlayback: null,
      };
      this.feedTelemetryState.feeds.set(normalized, state);
      return state;
    },

    setFeedTelemetryContext(feedName = "") {
      const normalized =
        typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
      const previousFeed = this.feedTelemetryState?.activeFeed || "";
      if (previousFeed && previousFeed !== normalized) {
        const previousState = this.getFeedTelemetryState(previousFeed);
        if (previousState) {
          previousState.lastImpressionSignature = "";
          previousState.activePlayback = null;
        }
      }

      const nextState = this.getFeedTelemetryState(normalized);
      if (previousFeed !== normalized && nextState) {
        nextState.lastImpressionSignature = "";
        nextState.activePlayback = null;
      }

      this.feedTelemetryState.activeFeed = normalized;
    },

    isFeedActive(feedName = "") {
      const normalized =
        typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
      return Boolean(normalized && this.feedTelemetryState?.activeFeed === normalized);
    },

    isForYouFeedActive() {
      return this.feedTelemetryState?.activeFeed === FEED_TYPES.FOR_YOU;
    },

    updateFeedTelemetryMetadata(feedName = "", items = [], metadata = {}) {
      if (!this.isFeedActive(feedName)) {
        return;
      }

      const feedState = this.getFeedTelemetryState(feedName);
      if (!feedState) {
        return;
      }

      const matchedTagsById = new Map();
      const matchReasonsById = new Map();
      const kidsScoreById = new Map();
      const moderationById = new Map();

      if (Array.isArray(items)) {
        items.forEach((item) => {
          const videoId =
            typeof item?.video?.id === "string" ? item.video.id : "";
          if (!videoId) {
            return;
          }
          const matched =
            Array.isArray(item?.metadata?.matchedInterests)
              ? item.metadata.matchedInterests
              : [];
          matchedTagsById.set(videoId, matched);

          const kidsScoreRaw = Number(item?.metadata?.kidsScore);
          if (Number.isFinite(kidsScoreRaw)) {
            kidsScoreById.set(videoId, kidsScoreRaw);
          }

          const moderationPayload = this.buildModerationTelemetry(item?.video);
          if (moderationPayload) {
            moderationById.set(videoId, moderationPayload);
          }
        });
      }

      const whyEntries = Array.isArray(metadata?.why) ? metadata.why : [];
      whyEntries.forEach((entry) => {
        if (!entry || entry.reason !== "matched-interests") {
          return;
        }
        const videoId = typeof entry.videoId === "string" ? entry.videoId : "";
        if (!videoId) {
          return;
        }
        const reasons = matchReasonsById.get(videoId) || [];
        reasons.push({
          stage: typeof entry.stage === "string" ? entry.stage : "",
          reason: entry.reason,
        });
        matchReasonsById.set(videoId, reasons);
      });

      const ageGroup =
        typeof metadata?.ageGroup === "string" ? metadata.ageGroup.trim() : "";

      feedState.matchedTagsById = matchedTagsById;
      feedState.matchReasonsById = matchReasonsById;
      feedState.kidsScoreById = kidsScoreById;
      feedState.moderationById = moderationById;
      feedState.ageGroup = ageGroup;
    },

    updateForYouTelemetryMetadata(items = [], metadata = {}) {
      this.updateFeedTelemetryMetadata(FEED_TYPES.FOR_YOU, items, metadata);
    },

    resolveVideoForTelemetry(videoId) {
      if (typeof videoId !== "string" || !videoId) {
        return null;
      }

      if (this.videosMap instanceof Map && this.videosMap.has(videoId)) {
        return this.videosMap.get(videoId) || null;
      }

      if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
        return this.videoListView.currentVideos.find((video) => video?.id === videoId) || null;
      }

      return null;
    },

    resolveVideoIndex(videoId) {
      if (!this.videoListView || !Array.isArray(this.videoListView.currentVideos)) {
        return null;
      }

      const index = this.videoListView.currentVideos.findIndex(
        (video) => video?.id === videoId,
      );
      return index >= 0 ? index : null;
    },

    buildModerationTelemetry(video) {
      if (!video || typeof video !== "object") {
        return null;
      }

      const moderation =
        video.moderation && typeof video.moderation === "object"
          ? video.moderation
          : null;
      if (!moderation) {
        return null;
      }

      const payload = {
        hidden: moderation.hidden === true,
        blurThumbnail: moderation.blurThumbnail === true,
        blockAutoplay: moderation.blockAutoplay === true,
        viewerOverride: moderation.viewerOverride?.showAnyway === true,
        trustedMuted: moderation.trustedMuted === true,
      };

      const reportType =
        typeof moderation.reportType === "string" ? moderation.reportType : "";
      if (reportType) {
        payload.reportType = reportType;
      }

      return payload;
    },

    buildFeedTelemetryPayload(feedName = "", { video, videoId, position } = {}) {
      if (!this.isFeedActive(feedName)) {
        return null;
      }

      const feedState = this.getFeedTelemetryState(feedName);
      if (!feedState) {
        return null;
      }

      const eventId =
        typeof videoId === "string" && videoId
          ? videoId
          : typeof video?.id === "string"
            ? video.id
            : "";
      if (!eventId) {
        return null;
      }

      const payload = {
        feed: feedName,
        eventId,
        videoId: eventId,
      };

      if (feedName === FEED_TYPES.FOR_YOU) {
        const matchedTagsRaw = feedState.matchedTagsById?.get(eventId) || [];
        const matchedTags = Array.isArray(matchedTagsRaw)
          ? Array.from(
              new Set(
                matchedTagsRaw
                  .filter((tag) => typeof tag === "string")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ),
            )
          : [];

        const whyRaw = feedState.matchReasonsById?.get(eventId) || [];
        const why = Array.isArray(whyRaw)
          ? whyRaw.map((entry) => ({
              stage: typeof entry.stage === "string" ? entry.stage : "",
              reason: typeof entry.reason === "string" ? entry.reason : "",
            }))
          : [];

        payload.matchedTags = matchedTags;
        payload.why = why;
      }

      const ageGroup =
        typeof feedState.ageGroup === "string" ? feedState.ageGroup : "";
      if (ageGroup) {
        payload.ageGroup = ageGroup;
      }

      const kidsScore = feedState.kidsScoreById?.get(eventId);
      if (Number.isFinite(kidsScore)) {
        payload.kidsScore = kidsScore;
      }

      const moderationPayload =
        this.buildModerationTelemetry(video) || feedState.moderationById?.get(eventId);
      if (moderationPayload) {
        payload.moderation = moderationPayload;
      }

      const videoRootId =
        typeof video?.videoRootId === "string" ? video.videoRootId : "";
      if (videoRootId) {
        payload.videoRootId = videoRootId;
      }

      const pubkey = typeof video?.pubkey === "string" ? video.pubkey : "";
      if (pubkey) {
        payload.pubkey = pubkey;
      }

      if (Number.isFinite(position)) {
        payload.position = Math.max(0, Math.floor(position));
      }

      return payload;
    },

    buildForYouTelemetryPayload({ video, videoId, position } = {}) {
      return this.buildFeedTelemetryPayload(FEED_TYPES.FOR_YOU, {
        video,
        videoId,
        position,
      });
    },

    emitTelemetryEvent(eventName, payload) {
      if (!eventName || !payload) {
        return false;
      }

      const doc =
        (this.videoModal && this.videoModal.document) ||
        (typeof document !== "undefined" ? document : null);

      if (!doc || typeof doc.dispatchEvent !== "function") {
        return false;
      }

      try {
        doc.dispatchEvent(
          new CustomEvent("bitvid:telemetry", {
            detail: { event: eventName, payload },
          }),
        );
        return true;
      } catch (error) {
        userLogger.warn("[Application] Failed to emit telemetry event:", error);
        return false;
      }
    },

    resolveFeedTelemetryEventName(feedName = "", suffix = "") {
      const normalized =
        typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
      if (!normalized || !suffix) {
        return "";
      }

      const prefixMap = new Map([
        [FEED_TYPES.FOR_YOU, "for_you"],
        [FEED_TYPES.KIDS, "kids_feed"],
      ]);

      const prefix = prefixMap.get(normalized);
      if (!prefix) {
        return "";
      }

      return `${prefix}_${suffix}`;
    },

    emitFeedTelemetryEvent(
      feedName = "",
      eventName = "",
      { video, videoId, position } = {},
    ) {
      const payload = this.buildFeedTelemetryPayload(feedName, {
        video,
        videoId,
        position,
      });
      if (!payload) {
        return false;
      }

      return this.emitTelemetryEvent(eventName, payload);
    },

    emitForYouTelemetryEvent(eventName, { video, videoId, position } = {}) {
      const payload = this.buildForYouTelemetryPayload({
        video,
        videoId,
        position,
      });
      if (!payload) {
        return false;
      }

      return this.emitTelemetryEvent(eventName, payload);
    },

    emitFeedImpressions(videos = [], { feedName } = {}) {
      const normalized =
        typeof feedName === "string"
          ? feedName.trim().toLowerCase()
          : this.feedTelemetryState?.activeFeed || "";
      if (!normalized || !Array.isArray(videos)) {
        return;
      }

      const feedState = this.getFeedTelemetryState(normalized);
      if (!feedState) {
        return;
      }

      const signature = videos
        .map((video) => (typeof video?.id === "string" ? video.id : ""))
        .filter(Boolean)
        .join("|");

      if (signature && signature === feedState.lastImpressionSignature) {
        return;
      }

      feedState.lastImpressionSignature = signature;

      const eventName = this.resolveFeedTelemetryEventName(normalized, "impression");
      if (!eventName) {
        return;
      }

      videos.forEach((video, index) => {
        this.emitFeedTelemetryEvent(normalized, eventName, {
          video,
          videoId: video?.id,
          position: index,
        });
      });
    },

    emitForYouImpressions(videos = []) {
      this.emitFeedImpressions(videos, { feedName: FEED_TYPES.FOR_YOU });
    },

    recordFeedClick(videoId, { feedName } = {}) {
      const normalized =
        typeof feedName === "string"
          ? feedName.trim().toLowerCase()
          : this.feedTelemetryState?.activeFeed || "";
      if (!normalized || !videoId) {
        return;
      }

      const feedState = this.getFeedTelemetryState(normalized);
      if (!feedState) {
        return;
      }

      const eventName = this.resolveFeedTelemetryEventName(normalized, "click");
      if (!eventName) {
        return;
      }

      const video = this.resolveVideoForTelemetry(videoId);
      const position = this.resolveVideoIndex(videoId);

      feedState.activePlayback = {
        feed: normalized,
        videoId,
      };

      this.emitFeedTelemetryEvent(normalized, eventName, {
        video,
        videoId,
        position,
      });
    },

    recordForYouClick(videoId) {
      this.recordFeedClick(videoId, { feedName: FEED_TYPES.FOR_YOU });
    },

    handleFeedViewTelemetry(detail = {}) {
      const activeFeed = this.feedTelemetryState?.activeFeed || "";
      if (!activeFeed) {
        return;
      }

      const feedState = this.getFeedTelemetryState(activeFeed);
      if (!feedState) {
        return;
      }

      const activePlayback = feedState.activePlayback;
      if (!activePlayback || activePlayback.feed !== activeFeed) {
        return;
      }

      const currentVideoId =
        typeof this.currentVideo?.id === "string"
          ? this.currentVideo.id
          : activePlayback.videoId;
      if (!currentVideoId || currentVideoId !== activePlayback.videoId) {
        return;
      }

      const pointerKey =
        typeof detail?.pointerKey === "string" ? detail.pointerKey : "";
      if (activePlayback.pointerKey && pointerKey) {
        if (activePlayback.pointerKey !== pointerKey) {
          return;
        }
      }

      const video = this.resolveVideoForTelemetry(currentVideoId);
      const payload = this.buildFeedTelemetryPayload(activeFeed, {
        video,
        videoId: currentVideoId,
      });
      if (!payload) {
        return;
      }

      if (pointerKey) {
        payload.pointerKey = pointerKey;
      }

      const eventName = this.resolveFeedTelemetryEventName(activeFeed, "watch");
      if (!eventName) {
        return;
      }

      this.emitTelemetryEvent(eventName, payload);
      feedState.activePlayback = null;
    },

    async renderVideoList(payload) {
      if (!this.videoListView) {
        return;
      }

      const container = this.mountVideoListView();
      if (!container) {
        return;
      }

      let videos = [];
      let metadata = null;

      if (Array.isArray(payload)) {
        videos = payload;
      } else if (payload && typeof payload === "object") {
        if (Array.isArray(payload.videos)) {
          videos = payload.videos;
        }
        if (payload.metadata && typeof payload.metadata === "object") {
          metadata = { ...payload.metadata };
        }
      }

      this.latestFeedMetadata = metadata;
      if (this.videoListView) {
        this.videoListView.state.feedMetadata = metadata;
      }

      const decoratedVideos = Array.isArray(videos)
        ? videos.map((video) => {
            const moderated = this.decorateVideoModeration(video);
            const targetVideo =
              moderated && typeof moderated === "object" ? moderated : video;
            const withIdentity = this.decorateVideoCreatorIdentity(targetVideo);
            return withIdentity && typeof withIdentity === "object"
              ? withIdentity
              : targetVideo;
          })
        : [];

      this.videoListView.render(decoratedVideos, metadata);
      this.emitFeedImpressions(decoratedVideos);
      this.updateModalSimilarContent();
    },

    refreshVideoDiscussionCounts(videos = [], options = {}) {
      if (!this.discussionCountService) {
        return;
      }

      const { videoListRoot = this.videoList || null } = options;

      this.discussionCountService.refreshCounts(videos, {
        videoListRoot,
        nostrClient,
      });
    },
  };
}
