import {
  isDevMode,
  ADMIN_SUPER_NPUB as CONFIG_ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL as CONFIG_ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL as CONFIG_BITVID_WEBSITE_URL,
  MAX_WALLET_DEFAULT_ZAP as CONFIG_MAX_WALLET_DEFAULT_ZAP,
  ENABLE_NIP17_RELAY_WARNING as CONFIG_ENABLE_NIP17_RELAY_WARNING,
} from "../config.js";
import { normalizeDesignSystemContext } from "../designSystem.js";
import { RUNTIME_FLAGS } from "../constants.js";
import {
  PROVIDER_BADGE_BASE_CLASS,
  DEFAULT_INTERNAL_MODERATION_SETTINGS,
  resolveProviderBadgeClass,
  createInternalDefaultNwcSettings,
  createInternalDefaultModerationSettings,
  createInternalDefaultDmPrivacySettings,
  ensureInternalModerationSettings,
  ensureInternalWalletSettings,
  buildServicesContract,
  buildStateContract,
} from "./profileModalContract.js";
import { getBreakpointLg } from "../designSystem/metrics.js";
import { getProviderMetadata } from "../services/authProviders/index.js";
import { AppShell } from "./dm/index.js";
import { devLogger, userLogger } from "../utils/logger.js";
import {
  describeAttachment,
  extractAttachmentsFromMessage,
  formatAttachmentSize,
} from "../attachments/attachmentUtils.js";
import {
  clearAttachmentCache,
  downloadAttachment,
  uploadAttachment,
  getAttachmentCacheStats,
} from "../services/attachmentService.js";
import {
  getLinkPreviewSettings,
  setLinkPreviewAutoFetch,
} from "../utils/linkPreviewSettings.js";
import { SubscriptionHistoryController } from "./subscriptionHistoryController.js";
import { DMSettingsModalController } from "./dm/DMSettingsModalController.js";
import { ProfileWalletController } from "./profileModal/ProfileWalletController.js";
import { ProfileStorageController } from "./profileModal/ProfileStorageController.js";
import { ProfileDirectMessageController } from "./profileModal/ProfileDirectMessageController.js";
import { ProfileRelayController } from "./profileModal/ProfileRelayController.js";
import { ProfileHashtagController } from "./profileModal/ProfileHashtagController.js";
import { ProfileAdminController } from "./profileModal/ProfileAdminController.js";
import { ProfileModerationController } from "./profileModal/ProfileModerationController.js";
import { ProfileBlockListController } from "./profileModal/ProfileBlockListController.js";
import { ProfileEditController } from "./profileModal/ProfileEditController.js";

const noop = () => {};

const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";
const DEFAULT_ADMIN_DM_IMAGE_URL =
  "https://beta.bitvid.network/assets/jpg/video-thumbnail-fallback.jpg";
const DEFAULT_BITVID_WEBSITE_URL = "https://bitvid.network/";
const SECRET_PLACEHOLDER = "*****";
const DEFAULT_MAX_WALLET_DEFAULT_ZAP = 100000000;
const DEFAULT_SAVED_PROFILE_LABEL = "Saved profile";
const TRUSTED_MUTE_HIDE_HELPER_TEXT =
  "Reaching this count hides cards (with “Show anyway”); lower signals only blur thumbnails or block autoplay.";
const TYPING_INDICATOR_TTL_SECONDS = 15;
const TYPING_INDICATOR_COOLDOWN_MS = 4000;
const DIRECT_MESSAGES_BATCH_DELAY_MS = 250;

const ADD_PROFILE_CANCELLATION_CODES = new Set([
  "login-cancelled",
  "user-cancelled",
  "modal-dismissed",
]);

/**
 * ProfileModalController
 *
 * Manages the "Profile" modal, which acts as the user's dashboard.
 * It uses a Facade pattern, delegating specific functionality to sub-controllers:
 * - ProfileDirectMessageController (DMs)
 * - ProfileRelayController (Relay list)
 * - ProfileWalletController (NWC/Zap settings)
 * - ProfileAdminController (Moderation tools)
 *
 * Responsibilities:
 * - Modal lifecycle (show/hide/load).
 * - Pane navigation (Account, DMs, Relays, etc.).
 * - Authentication state synchronization (Login/Logout/Switch).
 * - DOM event binding for the modal shell.
 */
export class ProfileModalController {
  /**
   * Creates a new ProfileModalController instance.
   *
   * @param {object} options - Configuration options.
   * @param {HTMLElement} [options.modalContainer] - The container to inject the modal into.
   * @param {object} [options.callbacks] - Event callbacks (onClose, onLogout, etc.).
   * @param {object} [options.services] - Service instances (nostrService, relayManager, etc.).
   * @param {object} [options.state] - State management hooks.
   */
  constructor(options = {}) {
    const {
      modalContainer = null,
      removeTrackingScripts = noop,
      createWatchHistoryRenderer = null,
      setGlobalModalState = noop,
      showError = noop,
      showSuccess = noop,
      showStatus = noop,
      callbacks = {},
      services = {},
      state = {},
      constants: providedConstants = {},
      designSystem = null,
    } = options;

    this.modalContainer = modalContainer;
    this.removeTrackingScripts = removeTrackingScripts;
    this.createWatchHistoryRenderer = createWatchHistoryRenderer;
    this.setGlobalModalState = setGlobalModalState;
    this.showError = showError;
    this.showSuccess = showSuccess;
    this.showStatus = showStatus;
    this.designSystem = normalizeDesignSystemContext(designSystem);

    const resolvedMaxWalletDefaultZap =
      typeof providedConstants.MAX_WALLET_DEFAULT_ZAP === "number" &&
      Number.isFinite(providedConstants.MAX_WALLET_DEFAULT_ZAP)
        ? providedConstants.MAX_WALLET_DEFAULT_ZAP
        : typeof CONFIG_MAX_WALLET_DEFAULT_ZAP === "number" &&
          Number.isFinite(CONFIG_MAX_WALLET_DEFAULT_ZAP)
        ? CONFIG_MAX_WALLET_DEFAULT_ZAP
        : DEFAULT_MAX_WALLET_DEFAULT_ZAP;

    const resolvedAdminSuperNpub = (() => {
      const fromOptions =
        typeof providedConstants.ADMIN_SUPER_NPUB === "string"
          ? providedConstants.ADMIN_SUPER_NPUB.trim()
          : "";
      if (fromOptions) {
        return fromOptions;
      }
      const fromConfig =
        typeof CONFIG_ADMIN_SUPER_NPUB === "string"
          ? CONFIG_ADMIN_SUPER_NPUB.trim()
          : "";
      return fromConfig || null;
    })();

    const resolvedAdminDmImageUrl = (() => {
      const fromOptions =
        typeof providedConstants.ADMIN_DM_IMAGE_URL === "string"
          ? providedConstants.ADMIN_DM_IMAGE_URL.trim()
          : "";
      if (fromOptions) {
        return fromOptions;
      }
      const fromConfig =
        typeof CONFIG_ADMIN_DM_IMAGE_URL === "string"
          ? CONFIG_ADMIN_DM_IMAGE_URL.trim()
          : "";
      return fromConfig || DEFAULT_ADMIN_DM_IMAGE_URL;
    })();

    const resolvedbitvidWebsiteUrl = (() => {
      const fromOptions =
        typeof providedConstants.BITVID_WEBSITE_URL === "string"
          ? providedConstants.BITVID_WEBSITE_URL.trim()
          : "";
      if (fromOptions) {
        return fromOptions;
      }
      const fromConfig =
        typeof CONFIG_BITVID_WEBSITE_URL === "string"
          ? CONFIG_BITVID_WEBSITE_URL.trim()
          : "";
      return fromConfig || DEFAULT_BITVID_WEBSITE_URL;
    })();

    const resolvedEnableNip17RelayWarning = (() => {
      if (typeof providedConstants.ENABLE_NIP17_RELAY_WARNING === "boolean") {
        return providedConstants.ENABLE_NIP17_RELAY_WARNING;
      }
      return typeof CONFIG_ENABLE_NIP17_RELAY_WARNING === "boolean"
        ? CONFIG_ENABLE_NIP17_RELAY_WARNING
        : true;
    })();

    this.maxWalletDefaultZap = resolvedMaxWalletDefaultZap;
    this.adminSuperNpub = resolvedAdminSuperNpub;
    this.adminDmImageUrl = resolvedAdminDmImageUrl;
    this.bitvidWebsiteUrl = resolvedbitvidWebsiteUrl;

    this.internalState = {
      savedProfiles: [],
      activePubkey: null,
      cachedSelection: null,
      activePane: "account",
      walletBusy: false,
      walletSettings: createInternalDefaultNwcSettings(),
      moderationSettings: createInternalDefaultModerationSettings(),
      dmRecipient: null,
      dmRelayHints: new Map(),
    };

    this.services = buildServicesContract(services, this.internalState);
    this.state = buildStateContract(state, this.internalState);

    this.dmController = new ProfileDirectMessageController(this);
    this.relayController = new ProfileRelayController(this);
    this.hashtagController = new ProfileHashtagController(this);
    this.adminController = new ProfileAdminController(this);
    this.moderationController = new ProfileModerationController(this);
    this.blockListController = new ProfileBlockListController(this);
    this.editController = new ProfileEditController(this);
    this.hashtagController.initialize();

    this.dmController.enableNip17RelayWarning = resolvedEnableNip17RelayWarning;
    this.dmController.hasShownRelayWarning = false;
    this.dmController.dmMobileView = "list";

    this.normalizeHexPubkey = this.services.normalizeHexPubkey;
    this.safeEncodeNpub = this.services.safeEncodeNpub;
    this.safeDecodeNpub = this.services.safeDecodeNpub;
    this.truncateMiddle = this.services.truncateMiddle;
    this.formatShortNpub = this.services.formatShortNpub;
    this.describeAdminErrorService = this.services.describeAdminError;
    this.describeNotificationErrorService =
      this.services.describeNotificationError;
    this.describeLoginErrorService = this.services.describeLoginError;
    this.requestAddProfileLoginService = this.services.requestAddProfileLogin;
    this.log =
      typeof this.services.log === "function"
        ? this.services.log
        : (...args) => {
            devLogger.log(...args);
          };

    this.nostrService =
      this.services.nostrService &&
      typeof this.services.nostrService === "object"
        ? this.services.nostrService
        : null;

    const subscriptionsServiceCandidate = this.services.subscriptions;
    this.subscriptionsService =
      subscriptionsServiceCandidate &&
      typeof subscriptionsServiceCandidate === "object"
        ? subscriptionsServiceCandidate
        : null;

    const moderationServiceCandidate = this.services.moderation;
    this.moderationService =
      moderationServiceCandidate &&
      typeof moderationServiceCandidate === "object"
        ? moderationServiceCandidate
        : null;
    this.unsubscribeModerationContacts = null;
    this.unsubscribeModerationStats = [];
    if (
      this.moderationService &&
      typeof this.moderationService.on === "function"
    ) {
      try {
        const updateTrustStats = () => {
          this.updateModerationTrustStats();
        };

        this.unsubscribeModerationContacts = this.moderationService.on(
          "contacts",
          () => {
            void this.populateFriendsList();
            updateTrustStats();
          },
        );

        this.unsubscribeModerationStats = [
          this.moderationService.on("trusted-mutes", updateTrustStats),
          this.moderationService.on("summary", updateTrustStats),
        ].filter((unsubscribe) => typeof unsubscribe === "function");
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to subscribe to moderation contacts updates:",
          error,
        );
      }
    }


    this.dmController.initializeDirectMessagesService();

    this.callbacks = {
      onClose: callbacks.onClose || noop,
      onLogout: callbacks.onLogout || noop,
      onChannelLink: callbacks.onChannelLink || noop,
      onAddAccount: callbacks.onAddAccount || noop,
      onRequestLogoutProfile: callbacks.onRequestLogoutProfile || noop,
      onSelectPane: callbacks.onSelectPane || noop,
      onPaneShown: callbacks.onPaneShown || noop,
      onAddRelay: callbacks.onAddRelay || noop,
      onRestoreRelays: callbacks.onRestoreRelays || noop,
      onAddBlocked: callbacks.onAddBlocked || noop,
      onWalletSave: callbacks.onWalletSave || noop,
      onWalletTest: callbacks.onWalletTest || noop,
      onWalletDisconnect: callbacks.onWalletDisconnect || noop,
      onAdminAddModerator: callbacks.onAdminAddModerator || noop,
      onAdminAddWhitelist: callbacks.onAdminAddWhitelist || noop,
      onAdminAddBlacklist: callbacks.onAdminAddBlacklist || noop,
      onAdminRemoveModerator: callbacks.onAdminRemoveModerator || noop,
      onAdminRemoveWhitelist: callbacks.onAdminRemoveWhitelist || noop,
      onAdminRemoveBlacklist: callbacks.onAdminRemoveBlacklist || noop,
      onHistoryReady: callbacks.onHistoryReady || noop,
      onRequestSwitchProfile: callbacks.onRequestSwitchProfile || noop,
      onRelayOperation: callbacks.onRelayOperation || noop,
      onRelayModeToggle: callbacks.onRelayModeToggle || noop,
      onRelayRestore: callbacks.onRelayRestore || noop,
      onBlocklistMutation: callbacks.onBlocklistMutation || noop,
      onWalletPersist: callbacks.onWalletPersist || noop,
      onWalletTestRequest: callbacks.onWalletTestRequest || callbacks.onWalletTest || noop,
      onWalletDisconnectRequest:
        callbacks.onWalletDisconnectRequest || callbacks.onWalletDisconnect || noop,
      onAdminMutation: callbacks.onAdminMutation || noop,
      onAdminNotifyError: callbacks.onAdminNotifyError || noop,
      onModerationSettingsChange:
        callbacks.onModerationSettingsChange || noop,
      onSendDm: callbacks.onSendDm || noop,
      onTogglePrivacy: callbacks.onTogglePrivacy || noop,
      onOpenRelays: callbacks.onOpenRelays || noop,
      onPublishDmRelayPreferences: callbacks.onPublishDmRelayPreferences || noop,
      onRequestPermissionPrompt: callbacks.onRequestPermissionPrompt || noop,
      onRetryAuthSync: callbacks.onRetryAuthSync || noop,
    };

    this.profileModal = null;
    this.profileModalRoot = null;
    this.profileModalPanel = null;
    this.profileModalBackdrop = null;
    this.profileModalLayout = null;
    this.profileModalMenu = null;
    this.profileModalPaneWrapper = null;
    this.profileModalBackButton = null;
    this.profileAvatar = null;
    this.profileName = null;
    this.profileNpub = null;
    this.switcherList = null;
    this.profileModalAvatar = null;
    this.profileModalName = null;
    this.profileModalNpub = null;
    this.profileSwitcherList = null;
    this.globalProfileAvatar = null;
    this.closeButton = null;
    this.logoutButton = null;
    this.mobileLogoutButton = null;
    this.channelLink = null;
    this.addAccountButton = null;
    this.navButtons = {
      account: null,
      relays: null,
      wallet: null,
      storage: null,
      hashtags: null,
      subscriptions: null,
      friends: null,
      blocked: null,
      messages: null,
      history: null,
      admin: null,
      safety: null,
    };
    this.panes = {
      account: null,
      relays: null,
      wallet: null,
      storage: null,
      hashtags: null,
      subscriptions: null,
      friends: null,
      blocked: null,
      messages: null,
      history: null,
      admin: null,
      safety: null,
    };
    this.relayController.relayList = null;
    this.relayController.relayInput = null;
    this.relayController.addRelayButton = null;
    this.relayController.restoreRelaysButton = null;
    this.relayController.relayHealthStatus = null;
    this.relayController.relayHealthTelemetryToggle = null;
    this.relayHealthRefreshPromise = null;
    this.profileRelayList = null;
    this.profileRelayInput = null;
    this.relayController.profileAddRelayBtn = null;
    this.relayController.profileRestoreRelaysBtn = null;
    this.subscriptionList = null;
    this.subscriptionListEmpty = null;
    this.friendList = null;
    this.friendListEmpty = null;
    this.friendInput = null;
    this.addFriendButton = null;
    this.blockList = null;
    this.blockListEmpty = null;
    this.blockListStatus = null;
    this.blockListLoadingState = "idle";
    this.blockInput = null;
    this.addBlockedButton = null;
    this.profileBlockedList = null;
    this.profileBlockedEmpty = null;
    this.profileBlockedInput = null;
    this.profileAddBlockedBtn = null;
    this.dmController.profileMessagesList = null;
    this.dmController.profileMessagesEmpty = null;
    this.dmController.profileMessagesLoading = null;
    this.dmController.profileMessagesError = null;
    this.dmController.profileMessagesStatus = null;
    this.dmController.profileMessagesReloadButton = null;
    this.dmController.profileMessagesPane = null;
    this.dmController.profileMessagesConversation = null;
    this.dmController.profileMessagesConversationEmpty = null;
    this.dmController.profileMessageInput = null;
    this.dmController.profileMessageSendButton = null;
    this.dmController.profileMessageAttachmentInput = null;
    this.dmController.profileMessageAttachmentButton = null;
    this.dmController.profileMessageAttachmentEncrypt = null;
    this.dmController.profileMessageAttachmentList = null;
    this.dmController.profileMessageAttachmentClearCache = null;
    this.dmController.profileMessagesComposerHelper = null;
    this.dmController.profileMessagesSendDmButton = null;
    this.dmController.profileMessagesOpenRelaysButton = null;
    this.dmController.profileMessagesPrivacyToggle = null;
    this.dmController.profileMessagesPrivacyMode = null;
    this.dmController.profileMessagesRelayList = null;
    this.dmController.profileMessagesRelayInput = null;
    this.dmController.profileMessagesRelayAddButton = null;
    this.dmController.profileMessagesRelayPublishButton = null;
    this.dmController.profileMessagesRelayStatus = null;
    this.dmController.profileMessagesUnreadDot = null;
    this.dmController.dmAppShellContainer = null;
    this.dmController.dmAppShell = null;
    this.dmController.profileLinkPreviewAutoToggle = null;
    this.walletUriInput = null;
    this.walletDefaultZapInput = null;
    this.walletSaveButton = null;
    this.walletTestButton = null;
    this.walletDisconnectButton = null;
    this.walletStatusText = null;
    this.profileWalletStatusText = null;
    this.subscriptionsStatusText = null;
    this.subscriptionsBackgroundLoading = false;
    this.permissionPromptCta = null;
    this.permissionPromptCtaMessage = null;
    this.permissionPromptCtaButton = null;
    this.permissionPromptCtaState = {
      visible: false,
      message: "",
      buttonLabel: "Enable permissions",
      busy: false,
      action: "permission",
    };
    this.authLoadingStateListener = null;
    this.profileSubscriptionsRefreshBtn = null;
    this.profileFriendsRefreshBtn = null;
    this.profileBlockedRefreshBtn = null;
    this.relayController.profileRelayRefreshBtn = null;
    // Legacy aliases managed via ProfileAdminController in cacheDomReferences
    this.adminModeratorsSection = null;
    this.adminModeratorsEmpty = null;
    this.adminAddModeratorButton = null;
    this.adminModeratorInput = null;
    this.adminWhitelistSection = null;
    this.adminWhitelistEmpty = null;
    this.adminWhitelistList = null;
    this.adminAddWhitelistButton = null;
    this.adminWhitelistInput = null;
    this.adminBlacklistSection = null;
    this.adminBlacklistEmpty = null;
    this.adminBlacklistList = null;
    this.adminAddBlacklistButton = null;
    this.adminBlacklistInput = null;

    this.dmController.messagesLoadingState = "idle";
    this.dmController.messagesInitialLoadPending = true;
    this.dmController.messagesViewActive = false;
    this.dmController.activeMessagesRequest = null;
    this.dmController.directMessagesCache = [];
    this.dmController.directMessagesLastActor = null;
    this.dmController.directMessagesSubscription = null;
    this.dmController.directMessagesUnsubscribes = [];
    this.dmController.directMessagesRenderTimeout = null;
    this.dmController.pendingDirectMessagesUpdate = null;
    this.dmController.pendingMessagesRender = null;
    this.dmController.messagesStatusClearTimeout = null;
    this.dmController.profileMessagesRenderToken = 0;
    this.dmController.dmPrivacyToggleTouched = false;
    this.dmController.dmReadReceiptCache = new Set();
    this.dmController.dmTypingLastSentAt = 0;
    this.dmController.dmAttachmentQueue = [];
    this.dmController.dmAttachmentUploads = new Map();
    this.dmController.activeDmConversationId = "";
    this.dmController.focusedDmConversationId = "";
    this.dmController.dmComposerState = "idle";

    this.profileHistoryRenderer = null;
    this.profileHistoryRendererConfig = null;
    this.boundProfileHistoryVisibility = null;
    this.boundKeydown = null;
    this.boundFocusIn = null;
    this.focusableElements = [];
    this.focusTrapContainer = null;
    this.focusTrapSuspended = false;
    this.focusTrapSuspendCount = 0;
    this.focusTrapAriaHiddenBeforeSuspend = null;
    this.focusTrapNestedModalActiveBeforeSuspend = null;
    this.profileSwitcherSelectionPubkey = null;
    this.previouslyFocusedElement = null;
    this.largeLayoutQuery = null;
    this.largeLayoutQueryListener = null;
    this.isLargeLayoutActiveFlag = false;
    this.walletController = new ProfileWalletController(this);
    this.storageController = new ProfileStorageController(this);
    this.mobileViewState = "menu";
    this.lastMobileViewState = "menu";
    this.setActivePane(this.getActivePane());
    this.walletController.setWalletPaneBusy(this.walletController.isWalletBusy());
    this.addAccountButtonState = null;
    this.adminEmptyMessages = new Map();
    this.hashtagPreferencesUnsubscribe = null;
    this.subscriptionHistoryController = new SubscriptionHistoryController();
    this.dmController.dmSettingsModalController = new DMSettingsModalController();

    if (
      this.subscriptionsService &&
      typeof this.subscriptionsService.on === "function"
    ) {
      this.subscriptionsService.on("change", (detail) => {
        this.handleSubscriptionsChange(detail);
      });
    }

    if (
      this.services.userBlocks &&
      typeof this.services.userBlocks.on === "function"
    ) {
      this.services.userBlocks.on("change", () => {
        this.populateBlockedList();
      });
    }
  }

  /**
   * Loads the modal HTML template and injects it into the DOM.
   * Initializes sub-controllers and binds event listeners.
   *
   * @returns {Promise<boolean>} Resolves true when loaded successfully.
   * @throws {Error} If the modal container is missing or the template fetch fails.
   */
  async load() {
    if (!(this.modalContainer instanceof HTMLElement)) {
      throw new Error("profile modal container missing");
    }

    // Invalidate any stale renderer reference so it is recreated
    // with the freshly loaded DOM elements.
    if (this.profileHistoryRenderer) {
      try {
        if (typeof this.profileHistoryRenderer.destroy === "function") {
          this.profileHistoryRenderer.destroy();
        }
      } catch (err) {
        devLogger.warn("[profileModal] Failed to destroy stale history renderer:", err);
      }
      this.profileHistoryRenderer = null;
      this.profileHistoryRendererConfig = null;
    }

    const response = await fetch("components/profile-modal.html");
    if (!response.ok) {
      throw new Error(`Failed to load profile modal HTML (${response.status})`);
    }

    const html = await response.text();
    const template = document.createElement("template");
    template.innerHTML = html;
    this.removeTrackingScripts(template.content);

    const modalRoot = template.content.querySelector("#profileModal");
    if (!(modalRoot instanceof HTMLElement)) {
      throw new Error("profile modal markup missing expected #profileModal root");
    }

    this.modalContainer.appendChild(template.content);
    this.profileModalRoot = modalRoot;
    this.profileModal = modalRoot;
    this.profileModalPanel =
      modalRoot.querySelector(".bv-modal__panel") || modalRoot;
    this.profileModalBackdrop =
      modalRoot.querySelector(".bv-modal-backdrop") || null;

    this.cacheDomReferences();
    this.setupLayoutBreakpointObserver();
    this.applyModalStackingOverrides();
    this.registerEventListeners();
    if (!this.authLoadingStateListener && typeof window !== "undefined") {
      this.authLoadingStateListener = (event) => {
        this.handleAuthLoadingStateChange(event?.detail || {});
      };
      window.addEventListener(
        "bitvid:auth-loading-state",
        this.authLoadingStateListener,
      );
    }
    this.hashtagController.populateHashtagPreferences();
    this.moderationController.refreshModerationSettingsUi();
    const preserveMenu = this.isMobileLayoutActive();
    this.selectPane(this.getActivePane(), { keepMenuView: preserveMenu });

    return true;
  }

  cacheDomReferences() {
    this.profileModalRoot = document.getElementById("profileModal") || null;
    this.profileModalPanel =
      this.profileModalRoot?.querySelector(".bv-modal__panel") || null;
    this.profileModalBackdrop =
      this.profileModalRoot?.querySelector(".bv-modal-backdrop") || null;
    this.profileModalLayout =
      this.profileModalRoot?.querySelector("[data-profile-layout]") || null;
    this.profileModalMenu =
      this.profileModalRoot?.querySelector("[data-profile-mobile-menu]") || null;
    this.profileModalPaneWrapper =
      this.profileModalRoot?.querySelector("[data-profile-mobile-pane]") || null;
    this.profileModal = this.profileModalRoot;
    this.permissionPromptCta =
      document.getElementById("profilePermissionPrompt") || null;
    this.permissionPromptCtaMessage =
      document.getElementById("profilePermissionPromptMessage") || null;
    this.permissionPromptCtaButton =
      document.getElementById("profilePermissionPromptButton") || null;
    this.closeButton = document.getElementById("closeProfileModal") || null;
    this.profileModalBackButton =
      document.getElementById("profileModalBack") || null;
    this.logoutButton = document.getElementById("profileLogoutBtn") || null;
    this.mobileLogoutButton =
      document.getElementById("profileMobileLogoutBtn") || null;
    this.channelLink = document.getElementById("profileChannelLink") || null;
    this.addAccountButton =
      document.getElementById("profileAddAccountBtn") || null;
    this.profileAvatar = document.getElementById("profileModalAvatar") || null;
    this.profileName = document.getElementById("profileModalName") || null;
    this.profileNpub = document.getElementById("profileModalNpub") || null;
    this.switcherList = document.getElementById("profileSwitcherList") || null;

    this.profileModalAvatar = this.profileAvatar;
    this.profileModalName = this.profileName;
    this.profileModalNpub = this.profileNpub;
    this.profileSwitcherList = this.switcherList;

    const topLevelProfileAvatar =
      document.getElementById("profileAvatar") || null;
    if (topLevelProfileAvatar) {
      this.globalProfileAvatar = topLevelProfileAvatar;
    }

    this.navButtons.account =
      document.getElementById("profileNavAccount") || null;
    this.navButtons.relays = document.getElementById("profileNavRelays") || null;
    this.navButtons.wallet = document.getElementById("profileNavWallet") || null;
    this.navButtons.storage = document.getElementById("profileNavStorage") || null;
    this.navButtons.hashtags =
      document.getElementById("profileNavHashtags") || null;
    this.navButtons.subscriptions =
      document.getElementById("profileNavSubscriptions") || null;
    this.navButtons.friends =
      document.getElementById("profileNavFriends") || null;
    this.navButtons.blocked =
      document.getElementById("profileNavBlocked") || null;
    this.navButtons.messages =
      document.getElementById("profileNavMessages") || null;
    this.navButtons.history =
      document.getElementById("profileNavHistory") || null;
    this.navButtons.admin = document.getElementById("profileNavAdmin") || null;
    this.navButtons.safety = document.getElementById("profileNavSafety") || null;

    this.profileEditBtn = document.getElementById("profileEditBtn") || null;
    this.profileEditBackBtn = document.getElementById("profileEditBackBtn") || null;

    this.panes.account = document.getElementById("profilePaneAccount") || null;
    this.panes.edit = document.getElementById("profilePaneEdit") || null;
    this.panes.relays = document.getElementById("profilePaneRelays") || null;
    this.panes.wallet = document.getElementById("profilePaneWallet") || null;
    this.panes.storage = document.getElementById("profilePaneStorage") || null;
    this.panes.hashtags = document.getElementById("profilePaneHashtags") || null;
    this.panes.subscriptions =
      document.getElementById("profilePaneSubscriptions") || null;
    this.panes.friends = document.getElementById("profilePaneFriends") || null;
    this.panes.blocked = document.getElementById("profilePaneBlocked") || null;
    this.panes.messages = document.getElementById("profilePaneMessages") || null;
    this.panes.history = document.getElementById("profilePaneHistory") || null;
    this.panes.admin = document.getElementById("profilePaneAdmin") || null;
    this.panes.safety = document.getElementById("profilePaneSafety") || null;

    this.relayController.relayList = document.getElementById("relayList") || null;
    this.relayController.relayInput = document.getElementById("relayInput") || null;
    this.relayController.addRelayButton = document.getElementById("addRelayBtn") || null;
    this.relayController.restoreRelaysButton =
      document.getElementById("restoreRelaysBtn") || null;
    this.relayController.relayHealthStatus =
      document.getElementById("relayHealthStatus") || null;
    this.relayController.relayHealthTelemetryToggle =
      document.getElementById("relayHealthTelemetryOptIn") || null;
    this.relayController.profileRelayRefreshBtn =
      document.getElementById("relayListRefreshBtn") || null;

    this.subscriptionList =
      document.getElementById("subscriptionsList") || null;
    this.subscriptionListEmpty =
      document.getElementById("subscriptionsEmpty") || null;
    this.profileSubscriptionsRefreshBtn =
      document.getElementById("subscriptionsRefreshBtn") || null;
    this.profileSubscriptionsHistoryBtn =
      document.getElementById("subscriptionsHistoryBtn") || null;
    this.profileSubscriptionsBackupBtn =
      document.getElementById("subscriptionsBackupBtn") || null;
    this.friendList = document.getElementById("friendsList") || null;
    this.friendListEmpty = document.getElementById("friendsEmpty") || null;
    this.friendInput = document.getElementById("friendsInput") || null;
    this.addFriendButton = document.getElementById("addFriendBtn") || null;
    this.profileFriendsRefreshBtn =
      document.getElementById("friendsRefreshBtn") || null;

    this.blockListController.cacheDomReferences();

    this.dmController.profileMessagesPane =
      document.getElementById("profilePaneMessages") || null;
    this.dmController.profileMessagesList =
      document.getElementById("profileMessagesList") || null;
    this.dmController.profileMessagesEmpty =
      document.getElementById("profileMessagesEmpty") || null;
    this.dmController.profileMessagesLoading =
      document.getElementById("profileMessagesLoading") || null;
    this.dmController.profileMessagesError =
      document.getElementById("profileMessagesError") || null;
    this.dmController.profileMessagesStatus =
      document.getElementById("profileMessagesStatus") || null;
    this.dmController.profileMessagesReloadButton =
      document.getElementById("profileMessagesReload") || null;
    this.dmController.profileMessagesConversation =
      document.getElementById("profileMessagesConversation") || null;
    this.dmController.profileMessagesConversationEmpty =
      document.getElementById("profileMessagesConversationEmpty") || null;
    this.dmController.profileMessageInput =
      document.getElementById("profileMessageInput") || null;
    this.dmController.profileMessageSendButton =
      document.getElementById("profileMessageSendBtn") || null;
    this.dmController.profileMessageAttachmentInput =
      document.getElementById("profileMessageAttachmentInput") || null;
    this.dmController.profileMessageAttachmentButton =
      document.getElementById("profileMessageAttachmentButton") || null;
    this.dmController.profileMessageAttachmentEncrypt =
      document.getElementById("profileMessageAttachmentEncrypt") || null;
    this.dmController.profileMessageAttachmentList =
      document.getElementById("profileMessageAttachmentList") || null;
    this.dmController.profileMessageAttachmentClearCache =
      document.getElementById("profileMessageAttachmentClearCache") || null;
    this.dmController.profileMessagesComposerHelper =
      document.getElementById("profileMessagesComposerHelper") || null;
    this.dmController.profileMessagesSendDmButton =
      document.getElementById("profileMessagesSendDm") || null;
    this.dmController.profileMessagesOpenRelaysButton =
      document.getElementById("profileMessagesOpenRelays") || null;
    this.dmController.profileMessagesPrivacyToggle =
      document.getElementById("profileMessagesPrivacyToggle") || null;
    this.dmController.profileMessagesPrivacyMode =
      document.getElementById("profileMessagesPrivacyMode") || null;
    this.cacheDmRelayElements();
    this.dmController.profileMessagesUnreadDot =
      document.getElementById("profileMessagesUnreadDot") || null;
    this.dmController.dmAppShellContainer =
      document.getElementById("dmAppShellMount") || null;
    this.dmController.profileLinkPreviewAutoToggle =
      document.getElementById("profileLinkPreviewAutoToggle") || null;

    this.walletController.cacheDomReferences();
    this.storageController.cacheDomReferences();

    if (this.dmController.pendingMessagesRender) {
      const { messages, actorPubkey } = this.dmController.pendingMessagesRender;
      this.dmController.pendingMessagesRender = null;
      void this.dmController.renderProfileMessages(messages, { actorPubkey }).catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to render pending direct messages:",
          error,
        );
      });
    } else if (
      (this.dmController.profileMessagesList instanceof HTMLElement ||
        this.dmController.dmAppShellContainer instanceof HTMLElement) &&
      Array.isArray(this.dmController.directMessagesCache) &&
      this.dmController.directMessagesCache.length
    ) {
      void this.dmController.renderProfileMessages(this.dmController.directMessagesCache, {
        actorPubkey: this.dmController.directMessagesLastActor,
      }).catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to render cached direct messages:",
          error,
        );
      });
    }

    this.dmController.setMessagesLoadingState(this.dmController.messagesLoadingState || "idle");
    this.dmController.updateMessagePrivacyModeDisplay();
    this.dmController.populateDmRelayPreferences();
    this.dmController.syncDmPrivacySettingsUi();

    this.hashtagController.cacheDomReferences();
    this.subscriptionsStatusText =
      document.getElementById("subscriptionsStatus") || null;
    this.applyPermissionPromptCtaState();

    this.profileRelayList = this.relayController.relayList;
    this.profileRelayInput = this.relayController.relayInput;
    this.relayController.profileAddRelayBtn = this.relayController.addRelayButton;
    this.relayController.profileRestoreRelaysBtn = this.relayController.restoreRelaysButton;
    this.profileSubscriptionsList = this.subscriptionList;
    this.profileSubscriptionsEmpty = this.subscriptionListEmpty;
    this.profileFriendsList = this.friendList;
    this.profileFriendsEmpty = this.friendListEmpty;
    this.profileFriendsInput = this.friendInput;
    this.profileAddFriendBtn = this.addFriendButton;
    this.moderationController.cacheDomReferences();
    this.adminController.cacheDomReferences();

    // Backwards-compatible aliases retained for application code that still
    // mirrors DOM references from the controller.
    this.adminModeratorsSection = this.adminController.moderatorSection;
    this.adminModeratorsEmpty = this.adminController.moderatorEmpty;
    this.adminAddModeratorButton = this.adminController.addModeratorButton;
    this.adminModeratorInput = this.adminController.moderatorInput;
    this.adminWhitelistSection = this.adminController.whitelistSection;
    this.adminWhitelistEmpty = this.adminController.whitelistEmpty;
    this.adminWhitelistList = this.adminController.whitelistList;
    this.adminAddWhitelistButton = this.adminController.addWhitelistButton;
    this.adminWhitelistInput = this.adminController.whitelistInput;
    this.adminBlacklistSection = this.adminController.blacklistSection;
    this.adminBlacklistEmpty = this.adminController.blacklistEmpty;
    this.adminBlacklistList = this.adminController.blacklistList;
    this.adminAddBlacklistButton = this.adminController.addBlacklistButton;
    this.adminBlacklistInput = this.adminController.blacklistInput;

    // Direct aliases for tests that expect un-prefixed names
    this.moderatorSection = this.adminController.moderatorSection;
    this.adminModeratorList = this.adminController.adminModeratorList;
    this.whitelistList = this.adminController.whitelistList;
    this.whitelistInput = this.adminController.whitelistInput;
    this.addWhitelistButton = this.adminController.addWhitelistButton;
    this.addModeratorButton = this.adminController.addModeratorButton;
    this.moderatorInput = this.adminController.moderatorInput;

    const ensureAriaLabel = (button, label) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", label);
      }
    };

    ensureAriaLabel(this.relayController.profileRelayRefreshBtn, "Refresh relay list");
    ensureAriaLabel(
      this.hashtagController.profileHashtagInterestRefreshBtn,
      "Refresh interest hashtags",
    );
    ensureAriaLabel(
      this.hashtagController.profileHashtagDisinterestRefreshBtn,
      "Refresh disinterest hashtags",
    );
    ensureAriaLabel(this.profileSubscriptionsRefreshBtn, "Refresh subscriptions");
    ensureAriaLabel(this.profileFriendsRefreshBtn, "Refresh friends");

    this.editController.cacheDomReferences();
    ensureAriaLabel(this.profileBlockedRefreshBtn, "Refresh muted & blocked users");

    if (this.createWatchHistoryRenderer) {
      this.ensureProfileHistoryRenderer();
    }
  }

  ensureProfileHistoryRenderer() {
    if (this.profileHistoryRenderer) {
      return this.profileHistoryRenderer;
    }

    if (!this.createWatchHistoryRenderer) {
      return null;
    }

    const config = this.getProfileHistoryRendererConfig();

    try {
      this.profileHistoryRenderer = this.createWatchHistoryRenderer({
        ...config,
        container: this.profileModalPanel || this.profileModalRoot,
      });
    } catch (error) {
      userLogger.error(
        "[profileModal] Failed to create watch history renderer:",
        error,
      );
      this.profileHistoryRenderer = null;
    }

    return this.profileHistoryRenderer;
  }

  getProfileHistoryRendererConfig() {
    if (this.profileHistoryRendererConfig) {
      return this.profileHistoryRendererConfig;
    }

    this.profileHistoryRendererConfig = {
      viewSelector: "#profilePaneHistory",
      gridSelector: "#profileHistoryGrid",
      loadingSelector: "#profileHistoryLoading",
      statusSelector: "#profileHistoryStatus",
      emptySelector: "#profileHistoryEmpty",
      sentinelSelector: "#profileHistorySentinel",
      scrollContainerSelector: "#profileModalPanes",
      errorBannerSelector: "#profileHistoryError",
      clearButtonSelector: "#profileHistoryClear",
      refreshButtonSelector: "#profileHistoryRefresh",
      privacyBannerSelector: "#profileHistoryPrivacyBanner",
      privacyMessageSelector: "#profileHistoryPrivacyMessage",
      privacyToggleSelector: "#profileHistoryPrivacyToggle",
      privacyDismissSelector: "#profileHistoryPrivacyDismiss",
      infoSelector: "#profileHistoryInfo",
      featureBannerSelector: "#profileHistoryFeatureBanner",
      sessionWarningSelector: "#profileHistorySessionWarning",
      emptyCopy: "You haven’t watched any videos yet.",
      variant: "modal",
      remove: (payload) =>
        this.callbacks.onHistoryReady({
          ...(typeof payload === "object" && payload ? payload : {}),
          controller: this,
          renderer: this.profileHistoryRenderer,
        }),
    };

    return this.profileHistoryRendererConfig;
  }















  syncLinkPreviewSettingsUi() {
    if (!(this.dmController.profileLinkPreviewAutoToggle instanceof HTMLInputElement)) {
      return;
    }
    const settings = getLinkPreviewSettings();
    this.dmController.profileLinkPreviewAutoToggle.checked = Boolean(
      settings?.autoFetchUnknownDomains,
    );
  }


  cacheDmRelayElements() {
    this.dmController.profileMessagesRelayList =
      document.getElementById("profileMessagesRelayList") || null;
    this.dmController.profileMessagesRelayInput =
      document.getElementById("profileMessagesRelayInput") || null;
    this.dmController.profileMessagesRelayAddButton =
      document.getElementById("profileMessagesRelayAdd") || null;
    this.dmController.profileMessagesRelayPublishButton =
      document.getElementById("profileMessagesRelayPublish") || null;
    this.dmController.profileMessagesRelayStatus =
      document.getElementById("profileMessagesRelayStatus") || null;
  }

  bindDmRelayControls() {
    const bindOnce = (element, eventName, handler, key) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const datasetKey = key || "dmRelayBound";
      if (element.dataset[datasetKey] === "true") {
        return;
      }
      element.dataset[datasetKey] = "true";
      element.addEventListener(eventName, handler);
    };

    bindOnce(
      this.dmController.profileMessagesRelayAddButton,
      "click",
      () => {
        void this.dmController.handleAddDmRelayPreference();
      },
      "dmRelayAddBound",
    );

    bindOnce(
      this.dmController.profileMessagesRelayInput,
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.dmController.handleAddDmRelayPreference();
        }
      },
      "dmRelayInputBound",
    );

    bindOnce(
      this.dmController.profileMessagesRelayPublishButton,
      "click",
      () => {
        void this.handlePublishDmRelayPreferences();
      },
      "dmRelayPublishBound",
    );
  }

  async refreshDmRelayPreferences({ force = false } = {}) {
    const owner = this.dmController.resolveActiveDmRelayOwner();
    if (!owner) {
      this.dmController.populateDmRelayPreferences();
      return;
    }

    const existing = this.dmController.getActiveDmRelayPreferences();
    if (!existing.length || force) {
      if (typeof this.services.fetchDmRelayHints === "function") {
        try {
          const hints = await this.services.fetchDmRelayHints(owner);
          if (typeof this.state.setDmRelayPreferences === "function") {
            this.state.setDmRelayPreferences(owner, hints);
          }
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to refresh DM relay hints for profile:",
            error,
          );
        }
      }
    }

    this.dmController.populateDmRelayPreferences();
  }




  async handlePublishDmRelayPreferences() {
    const owner = this.dmController.resolveActiveDmRelayOwner();
    if (!owner) {
      this.showError("Please sign in to publish DM relay hints.");
      return;
    }

    const relays = this.dmController.getActiveDmRelayPreferences();
    if (!relays.length) {
      this.showError("Add at least one DM relay before publishing.");
      return;
    }

    const callback = this.callbacks.onPublishDmRelayPreferences;
    if (!callback || callback === noop) {
      this.showError("DM relay publishing is unavailable right now.");
      return;
    }

    this.dmController.setDmRelayPreferencesStatus("Publishing DM relay hints…");

    try {
      const result = await callback({
        pubkey: owner,
        relays,
        controller: this,
      });
      if (result?.ok) {
        const acceptedCount = Array.isArray(result.accepted)
          ? result.accepted.length
          : 0;
        const summary = acceptedCount
          ? `Published to ${acceptedCount} relay${acceptedCount === 1 ? "" : "s"}.`
          : "DM relay hints published.";
        this.showSuccess("DM relay hints published.");
        this.dmController.setDmRelayPreferencesStatus(summary);
        return;
      }
      this.showError("Failed to publish DM relay hints.");
      this.dmController.setDmRelayPreferencesStatus("DM relay hints publish failed.");
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to publish DM relay hints.";
      this.showError(message);
      this.dmController.setDmRelayPreferencesStatus(message);
    }
  }





  updateDmPrivacyToggleForRecipient(recipientContext, { force = false } = {}) {
    if (!recipientContext) {
      return;
    }

    const relayHints = Array.isArray(recipientContext.relayHints)
      ? recipientContext.relayHints
      : [];
    const hasHints = relayHints.length > 0;

    if (!this.dmController.dmPrivacyToggleTouched || force) {
      this.setPrivacyToggleState(hasHints);
    }
  }




  setPrivacyToggleState(enabled) {
    if (this.dmController.profileMessagesPrivacyToggle instanceof HTMLInputElement) {
      this.dmController.profileMessagesPrivacyToggle.checked = Boolean(enabled);
    }
    this.dmController.updateMessagePrivacyModeDisplay();
  }



  handleActiveDmIdentityChanged(actorPubkey = null) {
    const normalized = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.dmController.resolveActiveDmActor();

    this.dmController.hasShownRelayWarning = false;
    this.dmController.setDirectMessageRecipient(null, { reason: "clear" });
    this.resetAttachmentQueue({ clearInput: true });
    this.dmController.dmReadReceiptCache.clear();
    this.dmController.dmTypingLastSentAt = 0;
    this.dmController.syncDmPrivacySettingsUi();

    if (
      this.dmController.directMessagesSubscription &&
      this.dmController.directMessagesSubscription.actor &&
      normalized !== this.dmController.directMessagesSubscription.actor
    ) {
      this.dmController.resetDirectMessageSubscription();
    }

    this.dmController.directMessagesLastActor = normalized || null;
    this.dmController.directMessagesCache = [];
    this.dmController.messagesInitialLoadPending = true;
    this.dmController.pendingMessagesRender = null;

    if (this.dmController.profileMessagesList instanceof HTMLElement) {
      this.dmController.profileMessagesList.textContent = "";
      this.dmController.profileMessagesList.classList.add("hidden");
      this.dmController.profileMessagesList.setAttribute("hidden", "");
    }
    if (this.dmController.profileMessagesConversation instanceof HTMLElement) {
      this.dmController.profileMessagesConversation.textContent = "";
      this.dmController.profileMessagesConversation.classList.add("hidden");
      this.dmController.profileMessagesConversation.setAttribute("hidden", "");
    }
    if (this.dmController.profileMessagesConversationEmpty instanceof HTMLElement) {
      this.dmController.profileMessagesConversationEmpty.classList.remove("hidden");
      this.dmController.profileMessagesConversationEmpty.removeAttribute("hidden");
    }

    if (!normalized) {
      this.dmController.setMessagesLoadingState("unauthenticated");
      this.dmController.updateMessagesReloadState();
      this.dmController.populateDmRelayPreferences();
      this.dmController.setDmRelayPreferencesStatus("");
      return;
    }

    this.dmController.setMessagesLoadingState("loading");
    void this.dmController.ensureDirectMessageSubscription(normalized);
    this.dmController.updateMessagesReloadState();

    if (this.getActivePane() === "messages") {
      void this.dmController.populateProfileMessages({
        force: true,
        reason: "identity-change",
      });
    }

    void this.refreshDmRelayPreferences({ force: true });
  }



  setMessagesUnreadIndicator(visible) {
    if (!(this.dmController.profileMessagesUnreadDot instanceof HTMLElement)) {
      return;
    }

    const button = this.navButtons.messages;
    const isVisible =
      button instanceof HTMLElement &&
      !button.classList.contains("hidden") &&
      !button.hasAttribute("hidden");

    this.dmController.profileMessagesUnreadDot.classList.toggle(
      "is-visible",
      Boolean(visible) && isVisible,
    );
  }






  generateAttachmentId(file) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    const name = typeof file?.name === "string" ? file.name : "attachment";
    return `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  resetAttachmentQueue({ clearInput = false } = {}) {
    this.dmController.dmAttachmentQueue.forEach((entry) => {
      if (entry?.previewUrl && typeof URL !== "undefined") {
        try {
          URL.revokeObjectURL(entry.previewUrl);
        } catch (error) {
          devLogger.warn("[profileModal] Failed to revoke attachment preview URL.", error);
        }
      }
    });
    this.dmController.dmAttachmentQueue = [];
    this.dmController.dmAttachmentUploads.clear();

    if (clearInput && this.dmController.profileMessageAttachmentInput) {
      this.dmController.profileMessageAttachmentInput.value = "";
    }

    this.renderAttachmentQueue();
  }


  renderAttachmentQueue() {
    const list = this.dmController.profileMessageAttachmentList;
    if (!(list instanceof HTMLElement)) {
      return;
    }

    list.textContent = "";

    if (!this.dmController.dmAttachmentQueue.length) {
      return;
    }

    this.dmController.dmAttachmentQueue.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "card flex flex-col gap-2 p-3";
      item.dataset.attachmentId = entry.id;

      const header = document.createElement("div");
      header.className = "flex items-center justify-between gap-2";
      const title = document.createElement("div");
      title.className = "text-sm font-semibold text-text";
      title.textContent = entry.name || "Attachment";
      header.appendChild(title);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn-ghost focus-ring inline-flex items-center";
      removeButton.dataset.size = "sm";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        this.dmController.dmAttachmentQueue = this.dmController.dmAttachmentQueue.filter(
          (queued) => queued.id !== entry.id,
        );
        if (entry.previewUrl && typeof URL !== "undefined") {
          URL.revokeObjectURL(entry.previewUrl);
        }
        this.renderAttachmentQueue();
      });
      header.appendChild(removeButton);
      item.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "text-xs text-muted";
      const sizeLabel = formatAttachmentSize(entry.size);
      meta.textContent = sizeLabel
        ? `${entry.type || "file"} · ${sizeLabel}`
        : entry.type || "file";
      item.appendChild(meta);

      if (entry.previewUrl && entry.type?.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = entry.previewUrl;
        img.alt = entry.name || "Attachment preview";
        img.className = "h-24 w-24 rounded-lg object-cover";
        img.loading = "lazy";
        img.decoding = "async";
        item.appendChild(img);
      }

      const progress = document.createElement("progress");
      progress.className = "progress";
      progress.value = entry.progress || 0;
      progress.max = 1;
      progress.dataset.variant = "surface";
      item.appendChild(progress);

      const status = document.createElement("div");
      status.className = "text-xs text-muted";
      status.textContent =
        entry.status === "uploading"
          ? "Uploading…"
          : entry.status === "error"
          ? entry.error || "Upload failed."
          : "Ready to upload.";
      item.appendChild(status);

      list.appendChild(item);
    });
  }

  async uploadAttachmentQueue(actorPubkey) {
    const r2Service = this.services.r2Service;
    if (!r2Service) {
      throw new Error("Storage service unavailable.");
    }

    const encrypt =
      this.dmController.profileMessageAttachmentEncrypt instanceof HTMLInputElement
        ? this.dmController.profileMessageAttachmentEncrypt.checked
        : false;

    const payloads = [];

    for (const entry of this.dmController.dmAttachmentQueue) {
      entry.status = "uploading";
      entry.progress = 0;
      this.renderAttachmentQueue();

      try {
        const payload = await uploadAttachment({
          r2Service,
          pubkey: actorPubkey,
          file: entry.file,
          encrypt,
          buildKey: buildR2Key,
          buildUrl: buildPublicUrl,
          onProgress: (fraction) => {
            entry.progress = Number.isFinite(fraction) ? fraction : entry.progress;
            this.renderAttachmentQueue();
          },
        });
        payloads.push(payload);
        entry.status = "uploaded";
        entry.progress = 1;
      } catch (error) {
        entry.status = "error";
        entry.error =
          error && typeof error.message === "string"
            ? error.message
            : "Attachment upload failed.";
        this.renderAttachmentQueue();
        throw error;
      }
    }

    return payloads;
  }



  resolveLatestDirectMessageForRecipient(recipientPubkey, actorPubkey = null) {
    const normalizedRecipient =
      typeof recipientPubkey === "string"
        ? this.normalizeHexPubkey(recipientPubkey)
        : "";
    if (!normalizedRecipient || !Array.isArray(this.dmController.directMessagesCache)) {
      return null;
    }

    const resolvedActor = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.dmController.resolveActiveDmActor();

    let latest = null;
    let latestTimestamp = 0;

    for (const entry of this.dmController.directMessagesCache) {
      if (this.dmController.resolveDirectMessageRemote(entry, resolvedActor) !== normalizedRecipient) {
        continue;
      }
      const timestamp = Number(entry?.timestamp) || 0;
      if (!latest || timestamp > latestTimestamp) {
        latest = entry;
        latestTimestamp = timestamp;
      }
    }

    return latest;
  }



  async maybePublishTypingIndicator() {
    const settings = this.dmController.getDmPrivacySettingsSnapshot();
    if (!settings.typingIndicatorsEnabled) {
      return;
    }

    if (
      !this.services.nostrClient ||
      typeof this.services.nostrClient.publishDmTypingIndicator !== "function"
    ) {
      return;
    }

    const input = this.dmController.profileMessageInput;
    const messageText =
      input instanceof HTMLTextAreaElement ? input.value.trim() : "";
    if (!messageText) {
      return;
    }

    const recipient = this.dmController.resolveActiveDmRecipient();
    if (!recipient) {
      return;
    }

    const now = Date.now();
    if (now - this.dmController.dmTypingLastSentAt < TYPING_INDICATOR_COOLDOWN_MS) {
      return;
    }

    this.dmController.dmTypingLastSentAt = now;

    const relayHints = this.dmController.buildDmRecipientContext(recipient)?.relayHints || [];
    const latestMessage = this.resolveLatestDirectMessageForRecipient(
      recipient,
      this.dmController.resolveActiveDmActor(),
    );
    const latestEventId = this.dmController.resolveDirectMessageEventId(latestMessage);

    try {
      await this.services.nostrClient.publishDmTypingIndicator({
        recipientPubkey: recipient,
        conversationEventId: latestEventId || null,
        relays: relayHints,
        expiresInSeconds: TYPING_INDICATOR_TTL_SECONDS,
      });
    } catch (error) {
      devLogger.warn("[profileModal] Failed to publish typing indicator:", error);
    }
  }



  clearProfileMessages({ message } = {}) {
    this.dmController.directMessagesCache = [];
    this.dmController.directMessagesLastActor = this.dmController.resolveActiveDmActor();
    this.dmController.messagesInitialLoadPending = true;
    this.dmController.setDirectMessageRecipient(null, { reason: "clear" });

    if (this.dmController.profileMessagesList instanceof HTMLElement) {
      this.dmController.profileMessagesList.textContent = "";
      this.dmController.profileMessagesList.classList.add("hidden");
      this.dmController.profileMessagesList.setAttribute("hidden", "");
    }

    const actor = this.dmController.directMessagesLastActor;
    this.dmController.setMessagesLoadingState(actor ? "empty" : "unauthenticated", {
      message,
    });

    if (this.dmController.dmAppShellContainer instanceof HTMLElement) {
      void this.dmController.renderDmAppShell(this.dmController.directMessagesCache, {
        actorPubkey: actor,
      });
    }
  }








  resolveDirectMessageScheme(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    const scheme =
      typeof message.scheme === "string"
        ? message.scheme
        : typeof message.encryption_scheme === "string"
        ? message.encryption_scheme
        : typeof message?.decryptor?.scheme === "string"
        ? message.decryptor.scheme
        : "";

    return typeof scheme === "string" ? scheme.trim().toLowerCase() : "";
  }
































  registerEventListeners() {
    if (this.closeButton instanceof HTMLElement) {
      this.closeButton.addEventListener("click", () => {
        this.hide();
      });
    }

    if (this.mobileLogoutButton instanceof HTMLElement) {
      this.mobileLogoutButton.addEventListener("click", async () => {
        try {
          await this.callbacks.onLogout(this);
        } catch (error) {
          this.showError("Failed to logout. Please try again.");
        }
        this.hide();
      });
    }

    if (this.profileModalBackButton instanceof HTMLElement) {
      this.profileModalBackButton.addEventListener("click", () => {
        this.setMobileView("menu", { focusMenu: true });
      });
    }

    if (this.logoutButton instanceof HTMLElement) {
      this.logoutButton.addEventListener("click", async () => {
        try {
          await this.callbacks.onLogout(this);
        } catch (error) {
          this.showError("Failed to logout. Please try again.");
        }
        this.hide();
      });
    }

    if (this.channelLink instanceof HTMLElement) {
      this.channelLink.addEventListener("click", (event) => {
        event.preventDefault();
        this.callbacks.onChannelLink(this.channelLink, this);
      });
    }

    if (this.addAccountButton instanceof HTMLElement) {
      this.addAccountButton.addEventListener("click", () => {
        void this.handleAddAccountRequest();
      });
    }

    if (this.permissionPromptCtaButton instanceof HTMLElement) {
      this.permissionPromptCtaButton.addEventListener("click", () => {
        if (this.permissionPromptCtaButton?.dataset?.action === "retry-auth-sync") {
          this.callbacks.onRetryAuthSync({ controller: this });
          return;
        }
        this.callbacks.onRequestPermissionPrompt({ controller: this });
      });
    }

    Object.entries(this.navButtons).forEach(([name, button]) => {
      if (button instanceof HTMLElement) {
        button.addEventListener("click", () => {
          this.selectPane(name);
        });
      }
    });

    if (this.relayController.addRelayButton instanceof HTMLElement) {
      this.relayController.addRelayButton.addEventListener("click", () => {
        void this.relayController.handleAddRelay();
      });
    }

    if (this.relayController.restoreRelaysButton instanceof HTMLElement) {
      this.relayController.restoreRelaysButton.addEventListener("click", () => {
        void this.relayController.handleRestoreRelays();
      });
    }

    if (this.relayController.profileRelayRefreshBtn instanceof HTMLElement) {
      this.relayController.profileRelayRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const service = this.services.relayManager;
        if (!service || typeof service.loadRelayList !== "function") {
          return;
        }
        void service
          .loadRelayList(activeHex)
          .then(() => {
            this.relayController.populateProfileRelays();
            void this.relayController.refreshRelayHealthPanel({
              forceRefresh: true,
              reason: "relay-update",
            });
          })
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh relay list:", error);
          });
      });
    }

    if (this.relayController.relayHealthTelemetryToggle instanceof HTMLInputElement) {
      this.relayController.relayHealthTelemetryToggle.addEventListener("change", () => {
        this.relayController.handleRelayHealthTelemetryToggle();
      });
    }

    this.blockListController.registerEventListeners();

    if (this.profileSubscriptionsRefreshBtn instanceof HTMLElement) {
      this.profileSubscriptionsRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const service = this.subscriptionsService;
        if (!service || typeof service.loadSubscriptions !== "function") {
          return;
        }
        void service
          .loadSubscriptions(activeHex, { allowPermissionPrompt: true })
          .then(() => {
            void this.populateSubscriptionsList();
          })
          .catch((error) => {
            devLogger.warn(
              "[profileModal] Failed to refresh subscriptions list:",
              error,
            );
          });
      });
    }

    if (this.profileFriendsRefreshBtn instanceof HTMLElement) {
      this.profileFriendsRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const moderationService = this.moderationService;
        const refreshPromise =
          moderationService &&
          typeof moderationService.ensureViewerContactsLoaded === "function"
            ? moderationService.ensureViewerContactsLoaded(activeHex)
            : this.subscriptionsService &&
              typeof this.subscriptionsService.ensureLoaded === "function"
            ? this.subscriptionsService.ensureLoaded(activeHex)
            : null;

        void Promise.resolve(refreshPromise)
          .then(() => {
            this.populateFriendsList();
          })
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh friends list:", error);
          });
      });
    }

    if (this.hashtagController.addHashtagInterestButton instanceof HTMLElement) {
      this.hashtagController.addHashtagInterestButton.addEventListener("click", () => {
        void this.hashtagController.handleAddHashtagPreference("interest");
      });
    }

    const handleHashtagRefresh = () => {
      const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
      if (!activeHex) {
        return;
      }
      const service = this.services.hashtagPreferences;
      if (!service || typeof service.load !== "function") {
        return;
      }
      void service
        .load(activeHex, { allowPermissionPrompt: true })
        .catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to refresh hashtag preferences:",
          error,
        );
      });
    };

    if (this.hashtagController.profileHashtagInterestRefreshBtn instanceof HTMLElement) {
      this.hashtagController.profileHashtagInterestRefreshBtn.addEventListener(
        "click",
        handleHashtagRefresh,
      );
    }

    if (this.hashtagController.profileHashtagDisinterestRefreshBtn instanceof HTMLElement) {
      this.hashtagController.profileHashtagDisinterestRefreshBtn.addEventListener(
        "click",
        handleHashtagRefresh,
      );
    }

    if (this.hashtagController.hashtagInterestInput instanceof HTMLElement) {
      this.hashtagController.hashtagInterestInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.hashtagController.handleAddHashtagPreference("interest");
        }
      });
    }

    if (this.hashtagController.addHashtagDisinterestButton instanceof HTMLElement) {
      this.hashtagController.addHashtagDisinterestButton.addEventListener("click", () => {
        void this.hashtagController.handleAddHashtagPreference("disinterest");
      });
    }

    if (this.hashtagController.hashtagDisinterestInput instanceof HTMLElement) {
      this.hashtagController.hashtagDisinterestInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.hashtagController.handleAddHashtagPreference("disinterest");
        }
      });
    }

    if (this.dmController.profileMessagesReloadButton instanceof HTMLElement) {
      this.dmController.profileMessagesReloadButton.addEventListener("click", () => {
        void this.dmController.populateProfileMessages({ force: true, reason: "manual" });
      });
    }

    if (this.dmController.profileMessagesSendDmButton instanceof HTMLElement) {
      this.dmController.profileMessagesSendDmButton.addEventListener("click", () => {
        void this.dmController.handleSendDmRequest();
      });
    }

    if (this.dmController.profileMessagesOpenRelaysButton instanceof HTMLElement) {
      this.dmController.profileMessagesOpenRelaysButton.addEventListener("click", () => {
        void this.dmController.handleOpenDmRelaysRequest();
      });
    }

    if (this.dmController.profileMessagesPrivacyToggle instanceof HTMLElement) {
      this.dmController.profileMessagesPrivacyToggle.addEventListener("change", (event) => {
        const toggle = event.currentTarget;
        if (toggle instanceof HTMLInputElement) {
          this.dmController.handlePrivacyToggle(toggle.checked);
        }
      });
    }

    // Legacy toggles removed - handled by DMPrivacySettings in AppShell

    if (this.dmController.profileLinkPreviewAutoToggle instanceof HTMLElement) {
      this.dmController.profileLinkPreviewAutoToggle.addEventListener("change", (event) => {
        const toggle = event.currentTarget;
        if (toggle instanceof HTMLInputElement) {
          this.dmController.handleLinkPreviewToggle(toggle.checked);
        }
      });
    }

    this.bindDmRelayControls();
    this.walletController.registerEventListeners();
    this.storageController.registerEventListeners();
    this.adminController.registerEventListeners();
    this.moderationController.registerEventListeners();

    if (this.dmController.profileMessageSendButton instanceof HTMLElement) {
      this.dmController.profileMessageSendButton.addEventListener("click", () => {
        void this.dmController.handleSendProfileMessage();
      });
    }

    if (this.dmController.profileMessageAttachmentButton instanceof HTMLElement) {
      this.dmController.profileMessageAttachmentButton.addEventListener("click", () => {
        if (this.dmController.profileMessageAttachmentInput instanceof HTMLInputElement) {
          this.dmController.profileMessageAttachmentInput.click();
        }
      });
    }

    if (this.dmController.profileMessageAttachmentInput instanceof HTMLElement) {
      this.dmController.profileMessageAttachmentInput.addEventListener("change", () => {
        this.dmController.handleAttachmentSelection();
      });
    }

    if (this.dmController.profileMessageAttachmentClearCache instanceof HTMLElement) {
      this.dmController.profileMessageAttachmentClearCache.addEventListener("click", () => {
        clearAttachmentCache();
        const stats = getAttachmentCacheStats();
        this.showStatus(
          `Attachment cache cleared (${stats.size}/${stats.maxSize}).`,
        );
      });
    }

    if (this.dmController.profileMessageInput instanceof HTMLElement) {
      this.dmController.profileMessageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void this.dmController.handleSendProfileMessage();
        }
      });
      this.dmController.profileMessageInput.addEventListener("input", () => {
        void this.maybePublishTypingIndicator();
      });
    }

    if (this.profileSubscriptionsHistoryBtn) {
      this.profileSubscriptionsHistoryBtn.addEventListener("click", () => {
        const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
        if (pubkey) {
          this.subscriptionHistoryController.show(pubkey);
        } else {
          this.showError("Please log in to view subscription history.");
        }
      });
    }

    if (this.profileSubscriptionsBackupBtn) {
      this.profileSubscriptionsBackupBtn.addEventListener("click", () => {
        const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
        if (pubkey) {
          if (confirm("Create a backup of your current subscription list?")) {
             this.subscriptionHistoryController.handleCreateBackup(pubkey).then(() => {
                 this.showSuccess("Backup created.");
             });
          }
        } else {
          this.showError("Please log in to backup subscriptions.");
        }
      });
    }


    this.editController.registerEventListeners();

    this.dmController.updateMessagesReloadState();
  }

  resolveAddAccountLoginError(error, fallbackMessage = "") {
    const describe = this.describeLoginErrorService;
    const fallback =
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : "Couldn't add that profile. Please try again.";

    if (typeof describe === "function") {
      try {
        const message = describe(error, fallback);
        if (typeof message === "string" && message.trim()) {
          return message.trim();
        }
      } catch (describeError) {
        devLogger.warn(
          "[ProfileModalController] describeLoginError service threw:",
          describeError,
        );
      }
    }

    return fallback;
  }


  setAddAccountLoading(isLoading) {
    if (!(this.addAccountButton instanceof HTMLElement)) {
      return;
    }

    const button = this.addAccountButton;
    const titleEl = button.querySelector("[data-profile-add-title]");
    const hintEl = button.querySelector("[data-profile-add-hint]");

    if (isLoading) {
      this.addAccountButtonState = {
        originalDisabled: button.disabled,
        originalAriaLabel: button.getAttribute("aria-label"),
        titleElement: titleEl instanceof HTMLElement ? titleEl : null,
        hintElement: hintEl instanceof HTMLElement ? hintEl : null,
        originalTitle:
          titleEl instanceof HTMLElement ? titleEl.textContent || "" : "",
        originalHint:
          hintEl instanceof HTMLElement ? hintEl.textContent || "" : "",
      };

      button.disabled = true;
      button.dataset.state = "loading";
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-disabled", "true");

      if (this.addAccountButtonState.titleElement) {
        this.addAccountButtonState.titleElement.textContent = "Connecting...";
      }

      if (this.addAccountButtonState.hintElement) {
        this.addAccountButtonState.hintElement.textContent =
          "Complete the login prompt from your provider.";
      }

      button.setAttribute(
        "aria-label",
        "Connecting to your Nostr account",
      );

      return;
    }

    const state = this.addAccountButtonState;

    if (state) {
      button.disabled = !!state.originalDisabled;
      if (state.originalDisabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }

      if (state.titleElement) {
        state.titleElement.textContent = state.originalTitle || "";
      }

      if (state.hintElement) {
        state.hintElement.textContent = state.originalHint || "";
      }

      if (state.originalAriaLabel === null) {
        button.removeAttribute("aria-label");
      } else if (typeof state.originalAriaLabel === "string") {
        button.setAttribute("aria-label", state.originalAriaLabel);
      }
    } else {
      if (button.disabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }
    }

    button.setAttribute("aria-busy", "false");
    delete button.dataset.state;

    this.addAccountButtonState = null;
  }

  isAddAccountCancellationError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const code =
      typeof error.code === "string" && error.code.trim()
        ? error.code.trim()
        : "";

    if (!code) {
      return false;
    }

    return ADD_PROFILE_CANCELLATION_CODES.has(code);
  }

  async handleAddAccountRequest() {
    if (!(this.addAccountButton instanceof HTMLElement)) {
      return;
    }

    if (this.addAccountButton.dataset.state === "loading") {
      return;
    }

    const requestLogin = this.requestAddProfileLoginService;
    if (typeof requestLogin !== "function") {
      devLogger.warn(
        "[ProfileModalController] requestAddProfileLogin service unavailable.",
      );
      this.showError("Login is unavailable right now. Please try again later.");
      return;
    }

    this.setAddAccountLoading(true);

    try {
      this.bringLoginModalToFront();
    } catch (error) {
      devLogger.warn(
        "[ProfileModalController] Failed to elevate login modal before add profile authentication:",
        error,
      );
    }

    let suspendedFocusTrap = false;
    try {
      this.suspendFocusTrap();
      suspendedFocusTrap = true;
    } catch (error) {
      devLogger.warn(
        "[ProfileModalController] Failed to suspend profile modal focus trap before login:",
        error,
      );
    }

    try {
      const loginResult = await requestLogin({
        controller: this,
        triggerElement: this.addAccountButton,
      });

      if (loginResult === undefined) {
        return;
      }

      await this.invokeAddAccountCallback(loginResult);
    } catch (error) {
      if (this.isAddAccountCancellationError(error)) {
        try {
          this.log(
            "[ProfileModalController] Add profile flow cancelled by user.",
            error,
          );
        } catch (logError) {
          devLogger.warn(
            "[ProfileModalController] Failed to log cancellation event:",
            logError,
          );
        }
        return;
      }

      devLogger.error(
        "[ProfileModalController] Failed to complete add profile authentication:",
        error,
      );

      const message = this.resolveAddAccountLoginError(
        error,
        "Couldn't add that profile. Please try again.",
      );

      if (message) {
        this.showError(message);
      }
    } finally {
      if (suspendedFocusTrap) {
        try {
          this.resumeFocusTrap();
        } catch (error) {
          devLogger.warn(
            "[ProfileModalController] Failed to resume profile modal focus trap after login:",
            error,
          );
        }
      }

      this.setAddAccountLoading(false);
    }
  }

  /**
   * Processes a request to add a new account to the "Saved Profiles" list.
   *
   * @param {object} payload - The result from the auth provider (pubkey, etc.).
   */
  async handleAddProfile(payload = {}) {
    const loginResult =
      payload && typeof payload === "object" ? payload.loginResult : null;

    if (!loginResult) {
      devLogger.warn(
        "[ProfileModalController] Ignoring add profile callback without an authentication result.",
      );
      return;
    }

    try {
      const { pubkey, authType: loginAuthType, providerId } =
        typeof loginResult === "object" && loginResult
          ? loginResult
          : { pubkey: loginResult };

      const detailAuthType =
        typeof loginResult?.detail?.authType === "string"
          ? loginResult.detail.authType
          : null;
      const detailProviderId =
        typeof loginResult?.detail?.providerId === "string"
          ? loginResult.detail.providerId
          : null;

      const resolvedAuthType = (() => {
        const candidates = [
          detailAuthType,
          loginAuthType,
          detailProviderId,
          providerId,
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
        return "nip07";
      })();

      const resolvedProviderId = (() => {
        const candidates = [detailProviderId, providerId, resolvedAuthType];
        for (const candidate of candidates) {
          if (typeof candidate !== "string") {
            continue;
          }
          const trimmed = candidate.trim();
          if (trimmed) {
            return trimmed;
          }
        }
        return resolvedAuthType;
      })();

      const normalizedPubkey = this.normalizeHexPubkey(pubkey);
      if (!normalizedPubkey) {
        throw new Error(
          "Received an invalid public key from the authentication provider.",
        );
      }

      const savedProfiles = this.getSavedProfiles();
      const alreadySaved = savedProfiles.some(
        (entry) => this.normalizeHexPubkey(entry.pubkey) === normalizedPubkey,
      );
      if (alreadySaved) {
        this.showSuccess("That profile is already saved on this device.");
        return;
      }

      const npub = this.safeEncodeNpub(normalizedPubkey) || "";
      let profileMeta = this.services.getProfileCacheEntry(normalizedPubkey)?.profile;

      if (!profileMeta) {
        await this.services.authService.loadOwnProfile(normalizedPubkey);
        profileMeta = this.services.getProfileCacheEntry(normalizedPubkey)?.profile;
      }

      const name = profileMeta?.name || "";
      const picture =
        profileMeta?.picture || "assets/svg/default-profile.svg";

      savedProfiles.push({
        pubkey: normalizedPubkey,
        npub,
        name,
        picture,
        authType: resolvedAuthType,
        providerId: resolvedProviderId,
      });

      this.setSavedProfiles(savedProfiles, { persist: false, persistActive: false });
      this.persistSavedProfiles({ persistActive: false });
      this.renderSavedProfiles();

      this.showSuccess("Profile added. Select it when you're ready to switch.");
    } catch (error) {
      const cancellationCodes = new Set([
        "login-cancelled",
        "user-cancelled",
        "modal-dismissed",
      ]);
      if (
        error &&
        typeof error === "object" &&
        typeof error.code === "string" &&
        cancellationCodes.has(error.code)
      ) {
        this.log("[ProfileModalController] Add profile flow cancelled.", error);
        return;
      }

      devLogger.error(
        "[ProfileModalController] Failed to add profile via authentication provider:",
        error,
      );

      const message = this.describeLoginErrorService(
        error,
        "Couldn't add that profile. Please try again.",
      );

      const rejectionError =
        error instanceof Error
          ? error
          : new Error(message || "Couldn't add that profile. Please try again.");

      if (message && rejectionError.message !== message) {
        rejectionError.message = message;
      }

      if (
        error &&
        typeof error === "object" &&
        error.code &&
        !rejectionError.code
      ) {
        rejectionError.code = error.code;
      }

      throw rejectionError;
    }
  }

  async invokeAddAccountCallback(loginResult) {
    return this.handleAddProfile({ loginResult });
  }

  /**
   * Renders the list of saved profiles in the modal header and switcher menu.
   * Handles avatar/name resolution, selection state, and "logout" button creation.
   * Triggers a batch fetch for any missing profile metadata.
   */
  renderSavedProfiles() {
    const normalizedActive = this.normalizeHexPubkey(this.getActivePubkey());
    const entriesNeedingFetch = new Set();
    const savedProfiles = this.getSavedProfiles();

    const resolveMeta = (entry) => {
      if (!entry || typeof entry !== "object") {
        return {
          name: "",
          picture: FALLBACK_PROFILE_AVATAR,
          npub: null,
        };
      }

      const normalizedPubkey = this.normalizeHexPubkey(entry.pubkey);
      let cacheEntry = null;
      if (normalizedPubkey) {
        cacheEntry = this.services.getProfileCacheEntry(normalizedPubkey);
      }
      const cachedProfile = cacheEntry?.profile || {};

      const hasStoredName =
        typeof entry.name === "string" && entry.name.trim().length > 0;
      const hasStoredPicture =
        typeof entry.picture === "string" && entry.picture.trim().length > 0;

      if (
        !cacheEntry &&
        normalizedPubkey &&
        (!hasStoredName || !hasStoredPicture)
      ) {
        entriesNeedingFetch.add(normalizedPubkey);
      }

      let resolvedNpub =
        typeof entry.npub === "string" && entry.npub.trim()
          ? entry.npub.trim()
          : null;
      if (!resolvedNpub && entry.pubkey) {
        resolvedNpub = this.safeEncodeNpub(entry.pubkey);
      }

      return {
        name: cachedProfile.name || entry.name || "",
        picture: cachedProfile.picture || entry.picture || FALLBACK_PROFILE_AVATAR,
        npub: resolvedNpub,
      };
    };

    const savedEntries = Array.isArray(savedProfiles)
      ? savedProfiles.filter((entry) => entry && entry.pubkey)
      : [];

    let activeEntry = null;
    if (normalizedActive) {
      activeEntry = savedEntries.find(
        (entry) => this.normalizeHexPubkey(entry.pubkey) === normalizedActive,
      );
    }
    if (!activeEntry && savedEntries.length) {
      activeEntry = savedEntries[0];
    }

    const activeMeta = activeEntry ? resolveMeta(activeEntry) : null;
    const hasActiveProfile = Boolean(activeEntry && activeMeta);
    const truncate = this.truncateMiddle || ((value) => value);
    const formatNpub =
      typeof this.formatShortNpub === "function"
        ? (value) => this.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");
    const activeNameFallback = activeMeta?.npub
      ? formatNpub(activeMeta.npub) || DEFAULT_SAVED_PROFILE_LABEL
      : DEFAULT_SAVED_PROFILE_LABEL;
    const activeDisplayName = hasActiveProfile
      ? activeMeta?.name?.trim() || activeNameFallback
      : "No active profile";
    const activeAvatarSrc = hasActiveProfile
      ? activeMeta?.picture || FALLBACK_PROFILE_AVATAR
      : FALLBACK_PROFILE_AVATAR;

    if (this.profileName) {
      this.profileName.textContent = activeDisplayName;
    }

    if (this.profileAvatar instanceof HTMLImageElement) {
      if (this.profileAvatar.src !== activeAvatarSrc) {
        this.profileAvatar.src = activeAvatarSrc;
      }
      this.profileAvatar.alt = hasActiveProfile
        ? `${activeDisplayName} avatar`
        : "Default profile avatar";
    } else if (this.profileAvatar instanceof HTMLElement) {
      this.profileAvatar.setAttribute("data-avatar-src", activeAvatarSrc);
    }

    if (this.profileNpub) {
      if (hasActiveProfile && activeMeta?.npub) {
        const displayNpub = formatNpub(activeMeta.npub);
        this.profileNpub.textContent = displayNpub || "npub unavailable";
      } else if (hasActiveProfile) {
        this.profileNpub.textContent = "npub unavailable";
      } else {
        this.profileNpub.textContent = "Link a profile to get started";
      }
    }

    if (this.channelLink instanceof HTMLElement) {
      if (hasActiveProfile && activeMeta?.npub) {
        const encodedNpub = activeMeta.npub;
        this.channelLink.href = `#view=channel-profile&npub=${encodeURIComponent(
          encodedNpub,
        )}`;
        this.channelLink.dataset.targetNpub = encodedNpub;
        this.channelLink.classList.remove("hidden");
        this.channelLink.setAttribute("aria-hidden", "false");
      } else {
        this.channelLink.classList.add("hidden");
        this.channelLink.removeAttribute("href");
        if (this.channelLink.dataset) {
          delete this.channelLink.dataset.targetNpub;
        }
        this.channelLink.setAttribute("aria-hidden", "true");
      }
    }

    if (this.globalProfileAvatar instanceof HTMLImageElement) {
      if (this.globalProfileAvatar.src !== activeAvatarSrc) {
        this.globalProfileAvatar.src = activeAvatarSrc;
      }
      this.globalProfileAvatar.alt = hasActiveProfile
        ? `${activeDisplayName} avatar`
        : this.globalProfileAvatar.alt || "Profile avatar";
    }

    const listEl = this.switcherList;
    if (listEl instanceof HTMLElement) {
      listEl.textContent = "";
      let normalizedSelection = this.normalizeHexPubkey(
        this.profileSwitcherSelectionPubkey,
      );
      if (normalizedSelection && normalizedSelection === normalizedActive) {
        normalizedSelection = null;
        this.profileSwitcherSelectionPubkey = null;
      }

      const entriesToRender = savedEntries.filter((entry) => {
        const normalized = this.normalizeHexPubkey(entry.pubkey);
        return normalized && normalized !== normalizedActive;
      });

      if (!entriesToRender.length) {
        listEl.setAttribute("data-profile-switcher-empty", "true");
        const helper = document.createElement("p");
        helper.className = "text-sm text-muted";
        helper.textContent = "No other profiles saved yet.";
        helper.setAttribute("role", "note");
        listEl.appendChild(helper);
      } else {
        listEl.removeAttribute("data-profile-switcher-empty");

        entriesToRender.forEach((entry) => {
          const meta = resolveMeta(entry);
          const button = document.createElement("button");
          button.type = "button";
          button.className =
            "card focus-ring flex w-full items-center gap-4 p-4 text-left transition";
          button.dataset.pubkey = entry.pubkey;
          if (meta.npub) {
            button.dataset.npub = meta.npub;
          }
          const normalizedAuthType =
            typeof entry.authType === "string" && entry.authType.trim()
              ? entry.authType.trim()
              : null;
          if (normalizedAuthType) {
            button.dataset.authType = normalizedAuthType;
          }

          const normalizedPubkey = this.normalizeHexPubkey(entry.pubkey);
          const isSelected =
            normalizedSelection && normalizedPubkey === normalizedSelection;
          if (isSelected) {
            button.dataset.state = "active";
            button.setAttribute("aria-pressed", "true");
          } else {
            delete button.dataset.state;
            button.setAttribute("aria-pressed", "false");
          }

          const avatarSpan = document.createElement("span");
          avatarSpan.className =
            "flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-overlay-strong bg-overlay-panel-soft";
          const avatarImg = document.createElement("img");
          avatarImg.className = "h-full w-full object-cover";
          avatarImg.src = meta.picture || FALLBACK_PROFILE_AVATAR;
          const cardDisplayName =
            meta.name?.trim() ||
            (meta.npub
              ? formatNpub(meta.npub) || DEFAULT_SAVED_PROFILE_LABEL
              : DEFAULT_SAVED_PROFILE_LABEL);
          avatarImg.alt = `${cardDisplayName} avatar`;
          avatarImg.loading = "lazy";
          avatarImg.decoding = "async";
          avatarSpan.appendChild(avatarImg);

          const metaSpan = document.createElement("div");
          metaSpan.className = "flex min-w-0 flex-1 flex-col gap-2";

          const topLine = document.createElement("div");
          topLine.className =
            "flex flex-wrap items-center justify-between gap-3";

          const providerId = this.getEntryProviderId(entry);
          const providerInfo = this.resolveEntryProviderMetadata(entry);
          const providerLabel =
            (providerInfo && providerInfo.label) || DEFAULT_SAVED_PROFILE_LABEL;
          const badgeVariant = resolveProviderBadgeClass(
            providerInfo && providerInfo.badgeVariant,
          );

          const resolvedProviderId =
            providerId || (providerInfo && providerInfo.id) || "";

          const label = document.createElement("span");
          label.className = `${PROVIDER_BADGE_BASE_CLASS} ${badgeVariant}`;
          label.textContent = providerLabel;
          label.dataset.providerVariant =
            (providerInfo && providerInfo.badgeVariant) || "neutral";
          if (providerId) {
            label.dataset.providerId = providerId;
          } else if (providerInfo && providerInfo.id) {
            label.dataset.providerId = providerInfo.id;
          }

          const actionGroup = document.createElement("div");
          actionGroup.className = "flex flex-wrap items-center gap-2";

          const action = document.createElement("span");
          action.className = "text-xs font-medium text-muted";
          action.setAttribute("aria-hidden", "true");
          action.textContent = isSelected ? "Selected" : "Switch";

          actionGroup.appendChild(action);

          const logoutButton = this.createSavedProfileLogoutButton({
            entry,
            providerId: resolvedProviderId || null,
            cardButton: button,
            displayName: cardDisplayName,
          });
          if (logoutButton) {
            actionGroup.appendChild(logoutButton);
          }

          topLine.append(label, actionGroup);

          const nameSpan = document.createElement("span");
          nameSpan.className = "truncate text-sm font-semibold text-primary";
          nameSpan.textContent = cardDisplayName;

          const npubSpan = document.createElement("span");
          npubSpan.className = "break-all font-mono text-xs text-muted";
          if (meta.npub) {
            const displayNpub = formatNpub(meta.npub);
            npubSpan.textContent = displayNpub || "npub unavailable";
          } else {
            npubSpan.textContent = "npub unavailable";
          }

          metaSpan.append(topLine, nameSpan, npubSpan);
          button.append(avatarSpan, metaSpan);

          const ariaLabel = isSelected
            ? `${cardDisplayName} selected`
            : `Switch to ${cardDisplayName}`;
          button.setAttribute("aria-label", ariaLabel);

          if (resolvedProviderId) {
            button.dataset.providerId = resolvedProviderId;
          } else {
            delete button.dataset.providerId;
          }

          const activateProfile = async (event) => {
            if (event) {
              event.preventDefault();
              event.stopPropagation();
            }

            if (button.dataset.loading === "true") {
              return;
            }

            button.dataset.loading = "true";
            button.setAttribute("aria-busy", "true");

            const logProviderId =
              providerId || (providerInfo && providerInfo.id) || normalizedAuthType || "unknown";

            try {
              await this.switchProfile(entry.pubkey, {
                entry,
                providerId: providerId || null,
              });
            } catch (error) {
              userLogger.error(
                `[ProfileModalController] Failed to switch profile for provider ${logProviderId}:`,
                error,
              );
            } finally {
              button.dataset.loading = "false";
              button.setAttribute("aria-busy", "false");
            }
          };

          button.addEventListener("click", activateProfile);
          button.addEventListener("keydown", (event) => {
            const key = event?.key;
            if (key === "Enter" || key === " " || key === "Spacebar") {
              activateProfile(event);
            }
          });

          listEl.appendChild(button);
        });
      }

      this.updateFocusTrap();
    } else {
      this.updateFocusTrap();
    }

    if (entriesNeedingFetch.size) {
      this.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  async handleSavedProfileLogout({
    entry,
    providerId,
    triggerButton,
    cardButton,
    displayName,
  } = {}) {
    if (!entry || typeof entry !== "object") {
      this.showError("Failed to logout this account. Please try again.");
      return { loggedOut: false, reason: "invalid-entry" };
    }

    const targetPubkey =
      typeof entry.pubkey === "string" && entry.pubkey.trim()
        ? entry.pubkey.trim()
        : "";
    if (!targetPubkey) {
      this.showError("Failed to logout this account. Please try again.");
      return { loggedOut: false, reason: "invalid-pubkey" };
    }

    if (
      !this.callbacks.onRequestLogoutProfile ||
      this.callbacks.onRequestLogoutProfile === noop
    ) {
      this.showError("Account logout is not available right now.");
      return { loggedOut: false, reason: "logout-unavailable" };
    }

    const revertUiState = () => {
      if (triggerButton instanceof HTMLElement) {
        triggerButton.disabled = false;
        triggerButton.removeAttribute("aria-busy");
        delete triggerButton.dataset.state;
      }

      if (cardButton instanceof HTMLElement) {
        cardButton.disabled = false;
        cardButton.removeAttribute("aria-busy");
        delete cardButton.dataset.loading;
      }
    };

    if (triggerButton instanceof HTMLElement) {
      triggerButton.dataset.state = "loading";
      triggerButton.disabled = true;
      triggerButton.setAttribute("aria-busy", "true");
    }

    if (cardButton instanceof HTMLElement) {
      cardButton.dataset.loading = "true";
      cardButton.disabled = true;
      cardButton.setAttribute("aria-busy", "true");
    }

    let result;
    try {
      result = await this.callbacks.onRequestLogoutProfile({
        controller: this,
        pubkey: targetPubkey,
        entry,
        providerId: this.normalizeProviderId(providerId) || null,
      });
    } catch (error) {
      this.showError("Failed to logout this account. Please try again.");
      result = { loggedOut: false, error, reason: "logout-error" };
    } finally {
      revertUiState();
    }

    if (!result || typeof result !== "object") {
      this.showError("Failed to logout this account. Please try again.");
      return { loggedOut: false, reason: "unknown" };
    }

    if (result.loggedOut || result.removed) {
      const successName =
        typeof displayName === "string" && displayName.trim()
          ? displayName.trim()
          : null;
      const message = successName
        ? `${successName} logged out.`
        : "Account logged out.";

      this.profileSwitcherSelectionPubkey = null;
      this.showSuccess(message);
      this.renderSavedProfiles();

      return { ...result, loggedOut: true };
    }

    if (result.reason === "not-found") {
      this.profileSwitcherSelectionPubkey = null;
      this.showStatus("This account is no longer connected.");
      this.renderSavedProfiles();
      return result;
    }

    if (result.reason === "active-profile") {
      return result;
    }

    if (result.error) {
      this.showError("Failed to logout this account. Please try again.");
      return result;
    }

    this.showError("Failed to logout this account. Please try again.");
    return result;
  }


  createViewChannelButton({ targetNpub, displayNpub } = {}) {
    const normalizedTarget =
      typeof targetNpub === "string" && targetNpub.trim()
        ? targetNpub.trim()
        : "";
    if (!normalizedTarget) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-xs";
    button.textContent = "View channel";
    button.dataset.targetNpub = normalizedTarget;

    if (displayNpub && typeof displayNpub === "string") {
      button.setAttribute(
        "aria-label",
        `View channel ${displayNpub.trim() || normalizedTarget}`,
      );
      button.title = `View channel ${displayNpub.trim() || normalizedTarget}`;
    }

    button.addEventListener("click", () => {
      this.callbacks.onChannelLink(button, this);
    });

    return button;
  }

  createCopyNpubButton({ targetNpub, displayNpub } = {}) {
    const normalizedTarget =
      typeof targetNpub === "string" && targetNpub.trim()
        ? targetNpub.trim()
        : "";
    if (!normalizedTarget) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-xs";
    button.textContent = "Copy npub";

    if (displayNpub && typeof displayNpub === "string") {
      button.setAttribute(
        "aria-label",
        `Copy ${displayNpub.trim() || normalizedTarget}`,
      );
      button.title = `Copy ${displayNpub.trim() || normalizedTarget}`;
    }

    const handleCopy = async () => {
      if (button.dataset.state === "loading") {
        return;
      }

      button.dataset.state = "loading";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      try {
        await this.copyNpubToClipboard(normalizedTarget, { displayNpub });
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        delete button.dataset.state;
      }
    };

    button.addEventListener("click", () => {
      void handleCopy();
    });

    return button;
  }

  createSavedProfileLogoutButton({
    entry,
    cardButton,
    providerId,
    displayName,
  } = {}) {
    if (this.callbacks.onRequestLogoutProfile === noop) {
      return null;
    }

    if (!entry || typeof entry !== "object" || !entry.pubkey) {
      return null;
    }

    const safeName =
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : "this account";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-2xs";
    button.dataset.variant = "critical";
    button.dataset.role = "logout";
    button.textContent = "Logout";
    button.setAttribute("aria-label", `Log out ${safeName}`);
    button.title = `Log out ${safeName}`;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.state === "loading") {
        return;
      }

      void this.handleSavedProfileLogout({
        entry,
        providerId,
        triggerButton: button,
        cardButton,
        displayName: safeName,
      });
    });

    return button;
  }

  createRemoveButton({
    label = "Remove",
    confirmMessage,
    confirmValue,
    onRemove,
  } = {}) {
    if (typeof onRemove !== "function") {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-xs profile-modal__remove-button";
    button.dataset.variant = "critical";
    button.dataset.role = "remove";
    button.textContent = label;

    const handleRemove = async () => {
      if (confirmMessage) {
        const replacement =
          typeof confirmValue === "string" && confirmValue.trim()
            ? confirmValue.trim()
            : "this entry";
        const prompt = confirmMessage.replace("{npub}", replacement);
        if (!window.confirm(prompt)) {
          return;
        }
      }

      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      try {
        await onRemove(button);
      } catch (error) {
        userLogger.error("Failed to remove entry:", error);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    };

    button.addEventListener("click", () => {
      void handleRemove();
    });

    return button;
  }

  async copyNpubToClipboard(npub, { displayNpub } = {}) {
    const normalized =
      typeof npub === "string" && npub.trim() ? npub.trim() : "";
    if (!normalized) {
      this.showError("Unable to copy npub. Invalid value provided.");
      return { copied: false, reason: "invalid" };
    }

    const clipboard = (() => {
      if (
        this.services?.clipboard &&
        typeof this.services.clipboard.writeText === "function"
      ) {
        return this.services.clipboard;
      }
      if (
        typeof navigator !== "undefined" &&
        navigator?.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        return navigator.clipboard;
      }
      return null;
    })();

    if (!clipboard) {
      this.showError("Copy to clipboard is not supported in this browser.");
      return { copied: false, reason: "unsupported" };
    }

    try {
      await clipboard.writeText(normalized);
      this.showSuccess("npub copied to clipboard!");
      return { copied: true };
    } catch (error) {
      userLogger.error("Failed to copy npub:", error);
      this.showError("Failed to copy npub. Please try again.");
      return { copied: false, error };
    }
  }

  setupLayoutBreakpointObserver() {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      this.largeLayoutQuery = null;
      this.largeLayoutQueryListener = null;
      this.isLargeLayoutActiveFlag = false;
      return;
    }

    if (this.largeLayoutQuery && this.largeLayoutQueryListener) {
      this.teardownLayoutBreakpointObserver();
    }

    try {
      const breakpointLg = getBreakpointLg();
      const query = window.matchMedia(`(min-width: ${breakpointLg})`);
      const handler = (event) => {
        const matches =
          typeof event?.matches === "boolean" ? event.matches : query.matches;
        this.handleLayoutBreakpointChange(matches);
      };
      this.largeLayoutQuery = query;
      this.largeLayoutQueryListener = handler;

      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handler);
      } else if (typeof query.addListener === "function") {
        query.addListener(handler);
      }

      this.handleLayoutBreakpointChange(query.matches);
    } catch (error) {
      this.largeLayoutQuery = null;
      this.largeLayoutQueryListener = null;
      devLogger.warn(
        "[profileModal] Failed to initialize responsive breakpoint observer:",
        error,
      );
      this.handleLayoutBreakpointChange(false);
    }
  }

  teardownLayoutBreakpointObserver() {
    const query = this.largeLayoutQuery;
    const handler = this.largeLayoutQueryListener;
    if (query && handler) {
      if (typeof query.removeEventListener === "function") {
        query.removeEventListener("change", handler);
      } else if (typeof query.removeListener === "function") {
        query.removeListener(handler);
      }
    }
    this.largeLayoutQuery = null;
    this.largeLayoutQueryListener = null;
  }

  handleLayoutBreakpointChange(matches) {
    const isLarge = Boolean(matches);
    this.isLargeLayoutActiveFlag = isLarge;
    if (isLarge) {
      this.setMobileView("pane", { skipFocusTrap: false });
      return;
    }

    const targetView = this.lastMobileViewState || this.mobileViewState || "menu";
    this.setMobileView(targetView, { skipFocusTrap: false });
  }

  isLargeLayoutActive() {
    return Boolean(this.isLargeLayoutActiveFlag);
  }

  isMobileLayoutActive() {
    return !this.isLargeLayoutActive();
  }

  focusActiveNavButton() {
    const active = this.getActivePane();
    const candidates = [];
    if (active && this.navButtons[active] instanceof HTMLElement) {
      candidates.push(this.navButtons[active]);
    }
    Object.values(this.navButtons).forEach((button) => {
      if (
        button instanceof HTMLElement &&
        !candidates.includes(button) &&
        !button.classList.contains("hidden")
      ) {
        candidates.push(button);
      }
    });

    const target = candidates.find((button) => button instanceof HTMLElement);
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      try {
        target.focus();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to focus active navigation button:",
          error,
        );
      }
    });
  }

  setMobileView(view = "menu", options = {}) {
    const normalizedView = view === "pane" ? "pane" : "menu";
    const settings =
      options && typeof options === "object" ? options : { skipFocusTrap: false };
    const skipFocusTrap = Boolean(settings.skipFocusTrap);
    const focusMenu = Boolean(settings.focusMenu);

    const layoutElement =
      this.profileModalLayout instanceof HTMLElement
        ? this.profileModalLayout
        : null;
    const paneWrapper =
      this.profileModalPaneWrapper instanceof HTMLElement
        ? this.profileModalPaneWrapper
        : null;
    const menuWrapper =
      this.profileModalMenu instanceof HTMLElement
        ? this.profileModalMenu
        : null;
    const panelElement =
      this.profileModalPanel instanceof HTMLElement
        ? this.profileModalPanel
        : null;
    const rootElement =
      this.profileModalRoot instanceof HTMLElement ? this.profileModalRoot : null;
    const backButton =
      this.profileModalBackButton instanceof HTMLElement
        ? this.profileModalBackButton
        : null;

    const isLarge = this.isLargeLayoutActive();
    this.mobileViewState = normalizedView;
    if (!isLarge) {
      this.lastMobileViewState = normalizedView;
    }

    if (layoutElement) {
      layoutElement.dataset.mobileView = normalizedView;
    }
    if (panelElement) {
      panelElement.dataset.mobileView = normalizedView;
    }
    if (rootElement) {
      rootElement.dataset.mobileView = normalizedView;
    }

    const menuHidden = !isLarge && normalizedView === "pane";
    const paneHidden = !isLarge && normalizedView === "menu";

    if (menuWrapper) {
      menuWrapper.setAttribute("aria-hidden", menuHidden ? "true" : "false");
      if (menuHidden) {
        menuWrapper.classList.add("hidden");
        menuWrapper.setAttribute("hidden", "");
      } else {
        menuWrapper.classList.remove("hidden");
        menuWrapper.removeAttribute("hidden");
      }
    }

    if (paneWrapper) {
      paneWrapper.setAttribute("aria-hidden", paneHidden ? "true" : "false");
      if (paneHidden) {
        paneWrapper.classList.add("hidden");
        paneWrapper.setAttribute("hidden", "");
      } else {
        paneWrapper.classList.remove("hidden");
        paneWrapper.removeAttribute("hidden");
      }
    }

    if (backButton) {
      if (isLarge || normalizedView === "menu") {
        backButton.classList.add("hidden");
        backButton.setAttribute("aria-hidden", "true");
      } else {
        backButton.classList.remove("hidden");
        backButton.setAttribute("aria-hidden", "false");
      }
    }

    if (!skipFocusTrap) {
      this.updateFocusTrap();
    }

    if (focusMenu && normalizedView === "menu") {
      this.focusActiveNavButton();
    }

    return normalizedView;
  }

  selectPane(name = "account", options = {}) {
    const { keepMenuView = false } =
      options && typeof options === "object" ? options : {};
    const normalized = typeof name === "string" ? name.toLowerCase() : "account";
    const previous = this.getActivePane();
    const availableKeys = Object.keys(this.panes).filter((key) => {
      const pane = this.panes[key];
      if (!(pane instanceof HTMLElement)) {
        return false;
      }
      const button = this.navButtons[key];
      if (button instanceof HTMLElement && button.classList.contains("hidden")) {
        return false;
      }
      return true;
    });

    const fallbackTarget = availableKeys.includes("account")
      ? "account"
      : availableKeys[0] || "account";
    const target = availableKeys.includes(normalized)
      ? normalized
      : fallbackTarget;

    if (previous === "history" && target !== "history") {
      try {
        this.profileHistoryRenderer?.pause();
      } catch (error) {
        userLogger.warn("[profileModal] Failed to pause history renderer:", error);
      }
    }

    if (previous === "messages" && target !== "messages") {
      this.dmController.pauseProfileMessages();
    }

    Object.entries(this.panes).forEach(([key, pane]) => {
      if (!(pane instanceof HTMLElement)) {
        return;
      }
      const isActive = key === target;
      pane.classList.toggle("hidden", !isActive);
      pane.setAttribute("aria-hidden", (!isActive).toString());
    });

    Object.entries(this.navButtons).forEach(([key, button]) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const isActive = key === target;
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) {
        button.dataset.state = "active";
      } else {
        delete button.dataset.state;
      }
    });

    this.setActivePane(target);
    const isMobile = this.isMobileLayoutActive();
    const shouldStayInMenu = keepMenuView && isMobile;
    this.setMobileView(shouldStayInMenu ? "menu" : "pane");

    setTimeout(() => {
      const activeHex = this.normalizeHexPubkey(this.getActivePubkey());

      if (target === "history") {
        void this.populateProfileWatchHistory();
      } else if (target === "relays") {
        this.relayController.populateProfileRelays();
        void this.relayController.refreshRelayHealthPanel({
          forceRefresh: true,
          reason: "pane-select",
        });
      } else if (target === "messages") {
        this.dmController.resumeProfileMessages();
        void this.dmController.populateProfileMessages({ reason: "pane-select" });
        void this.refreshDmRelayPreferences();
      } else if (target === "wallet") {
        this.walletController.refreshWalletPaneState();
      } else if (target === "storage") {
        this.storageController.populateStoragePane();
      } else if (target === "hashtags") {
        this.hashtagController.populateHashtagPreferences();
        if (activeHex && this.services.hashtagPreferences) {
          this.services.hashtagPreferences
            .load(activeHex, { allowPermissionPrompt: true })
            .catch(noop);
        }
        this.hashtagController.refreshHashtagBackgroundStatus();
      } else if (target === "subscriptions") {
        if (activeHex && this.subscriptionsService) {
          this.subscriptionsService
            .loadSubscriptions(activeHex, { allowPermissionPrompt: true })
            .catch(noop);
        }
        void this.populateSubscriptionsList();
        this.refreshSubscriptionsBackgroundStatus();
      } else if (target === "blocked") {
        if (activeHex && this.services.userBlocks) {
          this.services.userBlocks.loadBlocks(activeHex).catch(noop);
        }
        this.populateBlockedList();
      } else if (target === "safety") {
        this.refreshModerationSettingsUi();
        this.syncLinkPreviewSettingsUi();
      }

      this.callbacks.onSelectPane(target, { controller: this });
      this.callbacks.onPaneShown(target, { controller: this });
    }, 0);
  }











  setBlockListLoadingState(...args) {
    return this.blockListController.setBlockListLoadingState(...args);
  }

  setPermissionPromptCtaState(nextState = {}) {
    if (!nextState || typeof nextState !== "object") {
      return;
    }

    this.permissionPromptCtaState = {
      ...this.permissionPromptCtaState,
      ...nextState,
    };

    this.applyPermissionPromptCtaState();
  }

  applyPermissionPromptCtaState() {
    if (!(this.permissionPromptCta instanceof HTMLElement)) {
      return;
    }

    const fallbackMessage =
      "Enable permissions to load your subscriptions and hashtag preferences.";
    const {
      visible,
      message,
      buttonLabel,
      busy,
      action,
    } = this.permissionPromptCtaState || {};
    const normalizedMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : fallbackMessage;

    this.permissionPromptCta.classList.toggle("hidden", !visible);
    this.permissionPromptCta.setAttribute("aria-hidden", (!visible).toString());

    if (this.permissionPromptCtaMessage instanceof HTMLElement) {
      this.permissionPromptCtaMessage.textContent = normalizedMessage;
    }

    if (this.permissionPromptCtaButton instanceof HTMLButtonElement) {
      const normalizedLabel =
        typeof buttonLabel === "string" && buttonLabel.trim()
          ? buttonLabel.trim()
          : "Enable permissions";
      this.permissionPromptCtaButton.textContent = normalizedLabel;
      this.permissionPromptCtaButton.disabled = Boolean(busy);
      this.permissionPromptCtaButton.setAttribute(
        "aria-busy",
        busy ? "true" : "false",
      );
      this.permissionPromptCtaButton.dataset.action =
        action === "retry-auth-sync" ? "retry-auth-sync" : "permission";
    }
  }

  handleAuthLoadingStateChange(detail = {}) {
    const listsState =
      typeof detail?.lists === "string" ? detail.lists.trim().toLowerCase() : "";
    const listsDetail = detail?.listsDetail && typeof detail.listsDetail === "object"
      ? detail.listsDetail
      : null;
    if (!listsDetail || !listsState || listsState === "loading" || listsState === "idle") {
      return;
    }

    const failedTasks = Array.isArray(listsDetail.tasks)
      ? listsDetail.tasks.filter((task) => task && task.ok === false)
      : [];
    const loadedFromCacheTasks = failedTasks.filter((task) => task.fromCache === true);
    const hardFailTasks = failedTasks.filter((task) => task.fromCache !== true);

    if (loadedFromCacheTasks.length > 0 && hardFailTasks.length === 0) {
      this.setSubscriptionsStatus(
        "Subscriptions loaded from cache; sync is retrying in background.",
        "warning",
      );
      this.hashtagController.setHashtagStatus(
        "Hashtag preferences loaded from cache; sync is retrying in background.",
        "warning",
      );
      this.setBlockListLoadingState("error", {
        message: "Blocked creators loaded from cache; syncing latest in background.",
      });
    } else if (hardFailTasks.length > 0) {
      this.setSubscriptionsStatus(
        "Some profile lists failed to sync. Use Retry sync.",
        "warning",
      );
      this.hashtagController.setHashtagStatus(
        "Some profile lists failed to sync. Use Retry sync.",
        "warning",
      );
      this.setBlockListLoadingState("error", {
        message: "Blocked creators failed to sync. Retry to fetch latest lists.",
      });
    }

    if (failedTasks.length > 0) {
      this.setPermissionPromptCtaState({
        visible: true,
        message:
          loadedFromCacheTasks.length > 0
            ? "Some lists are currently from cache. Retry now to sync with relays."
            : "Failed to sync required profile lists. Retry now.",
        buttonLabel: "Retry list sync",
        action: "retry-auth-sync",
        busy: false,
      });
      return;
    }

    if (listsState === "ready") {
      this.setPermissionPromptCtaState({
        visible: false,
        message: "",
        action: "permission",
        busy: false,
      });
    }
  }

  setSubscriptionsStatus(message = "", tone = "muted") {
    if (!(this.subscriptionsStatusText instanceof HTMLElement)) {
      return;
    }

    const classList = this.subscriptionsStatusText.classList;
    classList.remove(
      "text-status-success",
      "text-status-warning",
      "text-status-danger",
      "text-status-info",
      "text-muted",
    );

    const normalized =
      typeof message === "string" && message.trim() ? message.trim() : "";

    if (!normalized) {
      this.subscriptionsStatusText.textContent = "";
      this.subscriptionsStatusText.classList.add("text-muted", "hidden");
      return;
    }

    this.subscriptionsStatusText.textContent = normalized;
    this.subscriptionsStatusText.classList.remove("hidden");

    switch (tone) {
      case "success":
        classList.add("text-status-success");
        break;
      case "warning":
      case "error":
        classList.add("text-status-warning");
        break;
      case "info":
        classList.add("text-status-info");
        break;
      default:
        classList.add("text-muted");
        break;
    }
  }

  refreshSubscriptionsBackgroundStatus() {
    const isBackground = this.subscriptionsService?.backgroundLoading === true;
    const statusText = this.subscriptionsStatusText?.textContent?.trim?.() || "";

    if (isBackground && !this.subscriptionsBackgroundLoading) {
      this.subscriptionsBackgroundLoading = true;
      if (!statusText) {
        this.setSubscriptionsStatus("Loading in background…", "info");
      }
      return;
    }

    if (!isBackground && this.subscriptionsBackgroundLoading) {
      if (statusText === "Loading in background…") {
        this.setSubscriptionsStatus("", "muted");
      }
      this.subscriptionsBackgroundLoading = false;
    }
  }

  handleSubscriptionsChange(detail = {}) {
    const action = typeof detail?.action === "string" ? detail.action : "";

    if (action === "background-loading") {
      this.subscriptionsBackgroundLoading = true;
      this.setSubscriptionsStatus("Loading in background…", "info");
    } else if (
      (action === "sync" || action === "background-loaded" || action === "reset") &&
      this.subscriptionsBackgroundLoading
    ) {
      const statusText = this.subscriptionsStatusText?.textContent?.trim?.() || "";
      if (statusText === "Loading in background…") {
        this.setSubscriptionsStatus("", "muted");
      }
      this.subscriptionsBackgroundLoading = false;
    }

    void this.populateSubscriptionsList();
    this.refreshSubscriptionsBackgroundStatus();
  }

  populateBlockedList(...args) {
    return this.blockListController.populateBlockedList(...args);
  }

  async populateSubscriptionsList(subscriptions = null) {
    if (
      !(this.subscriptionList instanceof HTMLElement) ||
      !(this.subscriptionListEmpty instanceof HTMLElement)
    ) {
      return;
    }

    const service = this.subscriptionsService;
    if (!service) {
      this.clearSubscriptionsList();
      this.refreshSubscriptionsBackgroundStatus();
      return;
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      this.clearSubscriptionsList();
      this.refreshSubscriptionsBackgroundStatus();
      return;
    }

    try {
      const loadState =
        typeof service.getLoadState === "function" ? service.getLoadState() : {};
      const uiReady = loadState?.uiReady === true || service.uiReady === true;
      const dataReady = loadState?.dataReady === true || service.dataReady === true;
      const lastLoadError = loadState?.lastLoadError || service.lastLoadError || null;

      if (!uiReady) {
        this.clearSubscriptionsList("Loading subscriptions…");
        this.setSubscriptionsStatus("Loading subscriptions…", "info");
        this.refreshSubscriptionsBackgroundStatus();
        return;
      }

      if (!dataReady) {
        this.clearSubscriptionsList("Subscriptions unavailable. Retry to sync your list.");
        this.setSubscriptionsStatus(
          lastLoadError
            ? "Couldn’t sync subscriptions. Retry to load your list."
            : "Subscriptions unavailable right now. Retry to sync your list.",
          "warning",
        );
        this.refreshSubscriptionsBackgroundStatus();
        return;
      }

      let sourceEntries = [];

      if (Array.isArray(subscriptions) && subscriptions.length) {
        sourceEntries = subscriptions;
      } else {
        if (typeof service.getSubscribedAuthors === "function") {
          try {
            sourceEntries = service.getSubscribedAuthors() || [];
          } catch (error) {
            devLogger.warn(
              "[profileModal] Failed to resolve subscriptions for subscriptions list:",
              error,
            );
            sourceEntries = [];
          }
        } else if (service.subscribedPubkeys instanceof Set) {
          sourceEntries = Array.from(service.subscribedPubkeys);
        } else if (Array.isArray(service.subscribedPubkeys)) {
          sourceEntries = service.subscribedPubkeys.slice();
        }
      }

      const normalizedEntries = [];
      const pushEntry = (hex, label) => {
        if (!hex) {
          return;
        }
        normalizedEntries.push({ hex, label });
      };

      sourceEntries.forEach((entry) => {
        if (!entry) {
          return;
        }

        if (typeof entry === "string") {
          const trimmed = entry.trim();
          if (!trimmed) {
            return;
          }

          if (trimmed.startsWith("npub1")) {
            const decoded = this.safeDecodeNpub(trimmed);
            if (!decoded) {
              return;
            }
            const label = this.safeEncodeNpub(decoded) || trimmed;
            pushEntry(decoded, label);
            return;
          }

          if (/^[0-9a-f]{64}$/i.test(trimmed)) {
            pushEntry(trimmed.toLowerCase(), trimmed);
          }
          return;
        }

        if (typeof entry !== "object") {
          return;
        }

        const candidateHex =
          typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";
        if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
          pushEntry(candidateHex.toLowerCase(), candidateHex);
          return;
        }

        const candidateNpub =
          typeof entry.npub === "string" ? entry.npub.trim() : "";
        if (candidateNpub && candidateNpub.startsWith("npub1")) {
          const decoded = this.safeDecodeNpub(candidateNpub);
          if (!decoded) {
            return;
          }
          const label = this.safeEncodeNpub(decoded) || candidateNpub;
          pushEntry(decoded, label);
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

      this.subscriptionList.textContent = "";

      if (!deduped.length) {
        this.setSubscriptionsStatus("No subscriptions yet.", "muted");
        this.subscriptionListEmpty.classList.remove("hidden");
        this.subscriptionList.classList.add("hidden");
        this.refreshSubscriptionsBackgroundStatus();
        return;
      }

      this.subscriptionListEmpty.classList.add("hidden");
      this.subscriptionList.classList.remove("hidden");

      const formatNpub =
        typeof this.formatShortNpub === "function"
          ? (value) => this.formatShortNpub(value)
          : (value) => (typeof value === "string" ? value : "");
      const entriesNeedingFetch = new Set();

      deduped.forEach(({ hex, label }) => {
        const item = document.createElement("li");
        item.className = "card flex items-center justify-between gap-4 p-4";

        let cachedProfile = null;
        if (hex && typeof this.services.getProfileCacheEntry === "function") {
          const cacheEntry = this.services.getProfileCacheEntry(hex);
          cachedProfile = cacheEntry?.profile || null;
          if (!cacheEntry) {
            entriesNeedingFetch.add(hex);
          }
        }

        const encodedNpub =
          hex && typeof this.safeEncodeNpub === "function"
            ? this.safeEncodeNpub(hex)
            : label;
        const displayNpub = formatNpub(encodedNpub) || encodedNpub || label;
        const displayName =
          (cachedProfile?.name && cachedProfile.name.trim()) ||
          (cachedProfile?.display_name &&
            typeof cachedProfile.display_name === "string" &&
            cachedProfile.display_name.trim()) ||
          displayNpub ||
          "Subscription";
        const avatarSrc = cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

        const summary = this.dmController.createCompactProfileSummary({
          displayName,
          displayNpub,
          avatarSrc,
        });

        const actions = document.createElement("div");
        actions.className = "flex flex-wrap items-center justify-end gap-2";

        const viewButton = this.createViewChannelButton({
          targetNpub: encodedNpub,
          displayNpub,
        });
        if (viewButton) {
          actions.appendChild(viewButton);
        }

        const copyButton = this.createCopyNpubButton({
          targetNpub: encodedNpub,
          displayNpub,
        });
        if (copyButton) {
          actions.appendChild(copyButton);
        }

        if (hex) {
          const unsubscribeButton = this.createRemoveButton({
            label: "Unsubscribe",
            onRemove: () => this.handleUnsubscribeFromCreator(hex),
          });
          if (unsubscribeButton) {
            unsubscribeButton.dataset.subscriptionHex = hex;
            actions.appendChild(unsubscribeButton);
          }
        }

        item.appendChild(summary);
        if (actions.childElementCount > 0) {
          item.appendChild(actions);
        }

        this.subscriptionList.appendChild(item);
      });

      if (
        entriesNeedingFetch.size &&
        typeof this.services.batchFetchProfiles === "function"
      ) {
        try {
          this.services.batchFetchProfiles(entriesNeedingFetch);
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to batch fetch profiles for subscriptions list:",
            error,
          );
        }
      }
      this.refreshSubscriptionsBackgroundStatus();
    } catch (error) {
      devLogger.warn("[profileModal] Failed to populate subscriptions list:", error);
    }
  }

  clearSubscriptionsList(emptyMessage = "No subscriptions yet.") {
    if (this.subscriptionList instanceof HTMLElement) {
      this.subscriptionList.textContent = "";
      this.subscriptionList.classList.add("hidden");
    }

    if (this.subscriptionListEmpty instanceof HTMLElement) {
      this.subscriptionListEmpty.textContent =
        typeof emptyMessage === "string" && emptyMessage.trim()
          ? emptyMessage.trim()
          : "No subscriptions yet.";
      this.subscriptionListEmpty.classList.remove("hidden");
    }
  }

  async handleUnsubscribeFromCreator(candidate) {
    const refresh = async () => {
      try {
        await this.populateSubscriptionsList();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh subscriptions list after unsubscribe:",
          error,
        );
      }

      try {
        await this.populateFriendsList();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh friends list after unsubscribe:",
          error,
        );
      }
    };

    return this.handleRemoveFriend(candidate, {
      successMessage: "You unsubscribed from this creator.",
      refresh,
      successReason: "unsubscribed",
    });
  }

  async populateFriendsList(friends = null) {
    if (
      !(this.friendList instanceof HTMLElement) ||
      !(this.friendListEmpty instanceof HTMLElement)
    ) {
      return;
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      this.clearFriendsList();
      return;
    }

    try {
      let sourceEntries = [];
      let usedModerationService = false;

      if (Array.isArray(friends) && friends.length) {
        sourceEntries = friends;
      } else {
        const moderationService = this.moderationService;

        if (moderationService) {
          let contacts = [];

          if (
            typeof moderationService.ensureViewerContactsLoaded === "function"
          ) {
            try {
              contacts =
                (await moderationService.ensureViewerContactsLoaded(activeHex)) ||
                [];
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to ensure viewer contacts before populating friends list:",
                error,
              );
              contacts = [];
            }
          }

          if (!Array.isArray(contacts) || !contacts) {
            contacts = [];
          }

          if (!contacts.length) {
            if (moderationService.viewerContacts instanceof Set) {
              contacts = Array.from(moderationService.viewerContacts);
            }
          }

          if (Array.isArray(contacts)) {
            sourceEntries = contacts;
            usedModerationService = true;
          }
        }

        if (!usedModerationService) {
          const service = this.subscriptionsService;

          if (!service) {
            this.clearFriendsList();
            return;
          }

          if (typeof service.ensureLoaded === "function") {
            try {
              await service.ensureLoaded(activeHex);
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to ensure subscriptions before populating friends list:",
                error,
              );
            }
          }

          if (typeof service.getSubscribedAuthors === "function") {
            try {
              sourceEntries = service.getSubscribedAuthors() || [];
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to resolve subscriptions for friends list:",
                error,
              );
              sourceEntries = [];
            }
          } else if (service.subscribedPubkeys instanceof Set) {
            sourceEntries = Array.from(service.subscribedPubkeys);
          } else if (Array.isArray(service.subscribedPubkeys)) {
            sourceEntries = service.subscribedPubkeys.slice();
          }
        }
      }

      const normalizedEntries = [];
      const pushEntry = (hex, label) => {
        if (!hex) {
          return;
        }
        normalizedEntries.push({ hex, label });
      };

      sourceEntries.forEach((entry) => {
        if (!entry) {
          return;
        }

        if (typeof entry === "string") {
          const trimmed = entry.trim();
          if (!trimmed) {
            return;
          }

          if (trimmed.startsWith("npub1")) {
            const decoded = this.safeDecodeNpub(trimmed);
            if (!decoded) {
              return;
            }
            const label = this.safeEncodeNpub(decoded) || trimmed;
            pushEntry(decoded, label);
            return;
          }

          if (/^[0-9a-f]{64}$/i.test(trimmed)) {
            const normalizedHex = trimmed.toLowerCase();
            const label = this.safeEncodeNpub(normalizedHex) || normalizedHex;
            pushEntry(normalizedHex, label);
          }
          return;
        }

        if (entry && typeof entry === "object") {
          const candidateHex =
            typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";
          const candidateNpub =
            typeof entry.npub === "string" ? entry.npub.trim() : "";

          if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
            const normalizedHex = candidateHex.toLowerCase();
            const label =
              candidateNpub && candidateNpub.startsWith("npub1")
                ? candidateNpub
                : this.safeEncodeNpub(normalizedHex) || normalizedHex;
            pushEntry(normalizedHex, label);
            return;
          }

          if (candidateNpub && candidateNpub.startsWith("npub1")) {
            const decoded = this.safeDecodeNpub(candidateNpub);
            if (!decoded) {
              return;
            }
            pushEntry(decoded, candidateNpub);
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

      this.friendList.textContent = "";

      if (!deduped.length) {
        this.friendListEmpty.classList.remove("hidden");
        this.friendList.classList.add("hidden");
        return;
      }

      this.friendListEmpty.classList.add("hidden");
      this.friendList.classList.remove("hidden");

      const formatNpub =
        typeof this.formatShortNpub === "function"
          ? (value) => this.formatShortNpub(value)
          : (value) => (typeof value === "string" ? value : "");

      const entriesNeedingFetch = new Set();
      const canRemoveFriends = this.canManageFriendsList();

      deduped.forEach(({ hex, label }) => {
        const item = document.createElement("li");
        item.className = "card flex items-center justify-between gap-4 p-4";

        let cachedProfile = null;
        if (hex && typeof this.services.getProfileCacheEntry === "function") {
          const cacheEntry = this.services.getProfileCacheEntry(hex);
          cachedProfile = cacheEntry?.profile || null;
          if (!cacheEntry) {
            entriesNeedingFetch.add(hex);
          }
        }

        const encodedNpub =
          hex && typeof this.safeEncodeNpub === "function"
            ? this.safeEncodeNpub(hex)
            : label;
        const displayNpub = formatNpub(encodedNpub) || encodedNpub || label;
        const displayName =
          (cachedProfile?.name && cachedProfile.name.trim()) ||
          (cachedProfile?.display_name &&
            typeof cachedProfile.display_name === "string" &&
            cachedProfile.display_name.trim()) ||
          displayNpub ||
          "Friend";
        const avatarSrc = cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

        const summary = this.dmController.createCompactProfileSummary({
          displayName,
          displayNpub,
          avatarSrc,
        });

        const actions = document.createElement("div");
        actions.className = "flex flex-wrap items-center justify-end gap-2";

        const viewButton = this.createViewChannelButton({
          targetNpub: encodedNpub,
          displayNpub,
        });
        if (viewButton) {
          actions.appendChild(viewButton);
        }

        const copyButton = this.createCopyNpubButton({
          targetNpub: encodedNpub,
          displayNpub,
        });
        if (copyButton) {
          actions.appendChild(copyButton);
        }

        if (hex && canRemoveFriends) {
          const removeButton = this.createRemoveButton({
            label: "Unfriend",
            onRemove: () => this.handleRemoveFriend(hex),
          });
          if (removeButton) {
            removeButton.dataset.friendHex = hex;
            actions.appendChild(removeButton);
          }
        }

        item.appendChild(summary);
        if (actions.childElementCount > 0) {
          item.appendChild(actions);
        }

        this.friendList.appendChild(item);
      });

      if (
        entriesNeedingFetch.size &&
        typeof this.services.batchFetchProfiles === "function"
      ) {
        try {
          this.services.batchFetchProfiles(entriesNeedingFetch);
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to batch fetch profiles for friends list:",
            error,
          );
        }
      }
    } catch (error) {
      devLogger.warn("[profileModal] Failed to populate friends list:", error);
    }
  }

  canManageFriendsList() {
    if (
      this.moderationService &&
      (!this.subscriptionsService ||
        typeof this.subscriptionsService.removeChannel !== "function")
    ) {
      return false;
    }

    return (
      this.subscriptionsService &&
      typeof this.subscriptionsService.removeChannel === "function"
    );
  }

  clearFriendsList() {
    if (this.friendList instanceof HTMLElement) {
      this.friendList.textContent = "";
      this.friendList.classList.add("hidden");
    }

    if (this.friendListEmpty instanceof HTMLElement) {
      this.friendListEmpty.classList.remove("hidden");
    }
  }

  async handleRemoveFriend(candidate, options = {}) {
    if (
      this.moderationService &&
      (!this.subscriptionsService ||
        typeof this.subscriptionsService.removeChannel !== "function")
    ) {
      this.showError(
        "Friends are synced with your Nostr follows. Update your follows in your Nostr client to make changes.",
      );
      return {
        success: false,
        reason: "nostr-friends-managed-externally",
      };
    }

    const service = this.subscriptionsService;
    if (!service || typeof service.removeChannel !== "function") {
      this.showError("Friends list is unavailable right now.");
      return { success: false, reason: "service-unavailable" };
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      this.showError("Please login to manage your friends list.");
      return { success: false, reason: "no-active-pubkey" };
    }

    const {
      successMessage = "Creator removed from your friends list.",
      refresh = async () => {
        await this.populateFriendsList();
      },
      successReason = "removed",
    } = typeof options === "object" && options ? options : {};

    let targetHex = "";
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.startsWith("npub1")) {
        targetHex = this.safeDecodeNpub(trimmed) || "";
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        targetHex = trimmed.toLowerCase();
      }
    } else if (candidate && typeof candidate === "object") {
      const candidateHex =
        typeof candidate.pubkey === "string" ? candidate.pubkey.trim() : "";
      const candidateNpub =
        typeof candidate.npub === "string" ? candidate.npub.trim() : "";

      if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
        targetHex = candidateHex.toLowerCase();
      } else if (candidateNpub && candidateNpub.startsWith("npub1")) {
        targetHex = this.safeDecodeNpub(candidateNpub) || "";
      }
    }

    if (!targetHex) {
      devLogger.warn(
        "[profileModal] No valid pubkey to remove from friends list:",
        candidate,
      );
      return { success: false, reason: "invalid-target" };
    }

    try {
      await service.removeChannel(targetHex, activeHex);
    } catch (error) {
      userLogger.error(
        "[profileModal] Failed to remove creator from friends list:",
        error,
      );
      const message =
        error?.code === "extension-permission-denied"
          ? "Your Nostr extension must allow encryption to manage subscriptions."
          : error?.message || "Failed to update your friends list. Please try again.";
      if (message) {
        this.showError(message);
      }
      return { success: false, reason: error?.code || "service-error", error };
    }

    this.showSuccess(successMessage);

    if (typeof refresh === "function") {
      try {
        await refresh();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh lists after removing friend:",
          error,
        );
      }
    }

    return { success: true, reason: successReason };
  }

  handleAddBlockedCreator(...args) {
    return this.blockListController.handleAddBlockedCreator(...args);
  }

  handleRemoveBlockedCreator(...args) {
    return this.blockListController.handleRemoveBlockedCreator(...args);
  }

  handleEditProfile(...args) {
    return this.editController.handleEditProfile(...args);
  }

  populateEditPane(...args) {
    return this.editController.populateEditPane(...args);
  }

  async handleUpload(...args) {
    return this.editController.handleUpload(...args);
  }

  async handleSaveProfile(...args) {
    return this.editController.handleSaveProfile(...args);
  }


  async populateProfileWatchHistory() {
    const renderer = this.ensureProfileHistoryRenderer();
    if (!renderer) {
      return;
    }

    let primaryActor = this.normalizeHexPubkey(this.getActivePubkey());
    if (!primaryActor && this.services.nostrClient?.sessionActor?.pubkey) {
      const candidate = this.services.nostrClient.sessionActor.pubkey;
      if (typeof candidate === "string" && candidate) {
        primaryActor = candidate;
      }
    }

    try {
      const state = typeof renderer.getState === "function" ? renderer.getState() : {};
      if (state.initialized) {
        await renderer.refresh({ actor: primaryActor, force: true });
      } else {
        await renderer.ensureInitialLoad({ actor: primaryActor });
      }

      if (!this.boundProfileHistoryVisibility) {
        this.boundProfileHistoryVisibility = () => {
          if (!this.profileHistoryRenderer) {
            return;
          }
          if (document.visibilityState === "visible") {
            this.profileHistoryRenderer.resume();
          } else {
            this.profileHistoryRenderer.pause();
          }
        };
        document.addEventListener(
          "visibilitychange",
          this.boundProfileHistoryVisibility,
        );
      }

      if (document.visibilityState === "hidden") {
        renderer.pause();
      } else {
        renderer.resume();
      }
    } catch (error) {
      userLogger.error(
        "[profileModal] Failed to populate watch history pane:",
        error,
      );
    }
  }








  // Legacy wrappers for backward compatibility and test stability
  describeAdminError(...args) {
    return this.adminController.describeAdminError(...args);
  }

  describeNotificationError(...args) {
    return this.adminController.describeNotificationError(...args);
  }

  sendAdminListNotification(...args) {
    return this.adminController.sendAdminListNotification(...args);
  }

  async requestSwitchProfile({ pubkey, entry, providerId } = {}) {
    const callback = this.callbacks.onRequestSwitchProfile;
    if (callback && callback !== noop) {
      return callback({ controller: this, pubkey, entry, providerId });
    }

    if (!pubkey) {
      throw new Error("Missing target pubkey for switch request.");
    }

    if (providerId) {
      return this.services.switchProfile(pubkey, { providerId });
    }

    return this.services.switchProfile(pubkey);
  }

  async runRelayOperation({
    action,
    url,
    activePubkey,
    skipPublishIfUnchanged = true,
  } = {}) {
    const callback = this.callbacks.onRelayOperation;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this,
        action,
        url,
        activePubkey,
        skipPublishIfUnchanged,
      });
      if (result !== undefined) {
        return result;
      }
    }

    const context = {
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

    const previous = this.services.relayManager.snapshot();

    const runOperation = () => {
      switch (action) {
        case "add":
          return this.services.relayManager.addRelay(url);
        case "remove":
          return this.services.relayManager.removeRelay(url);
        case "restore":
          return this.services.relayManager.restoreDefaults();
        case "mode-toggle":
          return this.services.relayManager.cycleRelayMode(url);
        default:
          throw Object.assign(new Error("Unknown relay operation."), {
            code: "invalid-operation",
          });
      }
    };

    let operationResult;
    try {
      operationResult = runOperation();
      context.operationResult = operationResult;
    } catch (error) {
      context.reason = error?.code || "operation-error";
      context.error = error;
      return context;
    }

    context.changed = Boolean(operationResult?.changed);
    if (!context.changed && skipPublishIfUnchanged) {
      context.reason = operationResult?.reason || "unchanged";
      return context;
    }

    try {
      const publishResult = await this.services.relayManager.publishRelayList(
        activePubkey,
      );
      if (!publishResult?.ok) {
        throw new Error("No relays accepted the update.");
      }
      context.ok = true;
      context.publishResult = publishResult;
      return context;
    } catch (error) {
      this.services.relayManager.setEntries(previous, { allowEmpty: false });
      context.reason = error?.code || "publish-failed";
      context.error = error;
      return context;
    }
  }

  async mutateBlocklist({ action, actorHex, targetHex } = {}) {
    const callback = this.callbacks.onBlocklistMutation;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this,
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
      await this.services.userBlocks.ensureLoaded(actorHex);
      const isBlocked = this.services.userBlocks.isBlocked(targetHex);

      if (action === "add") {
        if (isBlocked) {
          context.reason = "already-blocked";
          return context;
        }
        await this.services.userBlocks.addBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "blocked";
      } else if (action === "remove") {
        if (!isBlocked) {
          context.reason = "not-blocked";
          return context;
        }
        await this.services.userBlocks.removeBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "unblocked";
      } else {
        context.reason = "invalid-action";
        return context;
      }

      if (context.ok) {
        try {
          await this.services.onVideosShouldRefresh({
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


  runAdminMutation(...args) {
    return this.adminController.runAdminMutation(...args);
  }

  notifyAdminError(...args) {
    return this.adminController.notifyAdminError(...args);
  }

  refreshAdminPaneState(...args) {
    return this.adminController.refreshAdminPaneState(...args);
  }

  refreshModerationSettingsUi(...args) {
    return this.moderationController.refreshModerationSettingsUi(...args);
  }

  updateModerationTrustStats(...args) {
    return this.moderationController.updateModerationTrustStats(...args);
  }

  handleAddModerator(...args) {
    return this.adminController.handleAddModerator(...args);
  }

  handleRemoveModerator(...args) {
    return this.adminController.handleRemoveModerator(...args);
  }

  handleAdminListMutation(...args) {
    return this.adminController.handleAdminListMutation(...args);
  }

  updateFocusTrap() {
    const container =
      this.profileModalPanel instanceof HTMLElement
        ? this.profileModalPanel
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (!container) {
      this.focusableElements = [];
      return;
    }

    const selector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(container.querySelectorAll(selector));
    this.focusableElements = nodes.filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (node.hasAttribute("disabled")) {
        return false;
      }
      if (node.getAttribute("aria-hidden") === "true") {
        return false;
      }
      return true;
    });

    this.bindFocusTrap(container);
  }

  bindFocusTrap(container) {
    const targetContainer =
      container ||
      (this.profileModalPanel instanceof HTMLElement
        ? this.profileModalPanel
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null);

    if (!targetContainer) {
      return;
    }

    if (this.focusTrapSuspended) {
      this.focusTrapContainer = targetContainer;
      return;
    }

    if (!this.boundKeydown) {
      this.boundKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.hide();
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        if (!this.focusableElements.length) {
          event.preventDefault();
          const fallback =
            this.profileModalPanel || this.profileModal || targetContainer;
          if (typeof fallback?.focus === "function") {
            fallback.focus();
          }
          return;
        }

        const first = this.focusableElements[0];
        const last = this.focusableElements[this.focusableElements.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !targetContainer.contains(active)) {
            event.preventDefault();
            if (typeof last?.focus === "function") {
              last.focus();
            }
          }
          return;
        }

        if (active === last) {
          event.preventDefault();
          if (typeof first?.focus === "function") {
            first.focus();
          }
        }
      };
    }

    if (!this.boundFocusIn) {
      this.boundFocusIn = (event) => {
        const modalRoot = this.profileModalRoot || this.profileModal;
        if (
          !modalRoot ||
          modalRoot.classList.contains("hidden") ||
          modalRoot.contains(event.target)
        ) {
          return;
        }

        const fallback =
          this.focusableElements[0] ||
          this.profileModalPanel ||
          this.profileModal;
        if (typeof fallback?.focus === "function") {
          fallback.focus();
        }
      };
    }

    if (
      this.focusTrapContainer &&
      this.focusTrapContainer !== targetContainer &&
      this.boundKeydown
    ) {
      this.focusTrapContainer.removeEventListener("keydown", this.boundKeydown);
    }

    targetContainer.addEventListener("keydown", this.boundKeydown);
    this.focusTrapContainer = targetContainer;

    document.addEventListener("focusin", this.boundFocusIn);
  }

  getModalRootElement() {
    if (this.profileModalRoot instanceof HTMLElement) {
      return this.profileModalRoot;
    }
    if (this.profileModal instanceof HTMLElement) {
      return this.profileModal;
    }
    return null;
  }

  getModalPanelElement() {
    if (this.profileModalPanel instanceof HTMLElement) {
      return this.profileModalPanel;
    }
    return this.getModalRootElement();
  }

  suspendFocusTrap() {
    this.focusTrapSuspendCount += 1;
    this.focusTrapSuspended = true;

    if (this.focusTrapSuspendCount > 1) {
      return this.focusTrapSuspendCount;
    }

    if (
      this.boundKeydown &&
      this.focusTrapContainer instanceof HTMLElement
    ) {
      this.focusTrapContainer.removeEventListener(
        "keydown",
        this.boundKeydown,
      );
    }

    if (this.boundFocusIn) {
      document.removeEventListener("focusin", this.boundFocusIn);
    }

    const modalRoot = this.getModalRootElement();
    if (modalRoot) {
      this.focusTrapAriaHiddenBeforeSuspend = modalRoot.getAttribute(
        "aria-hidden",
      );
      this.focusTrapNestedModalActiveBeforeSuspend =
        typeof modalRoot.dataset.nestedModalActive === "string"
          ? modalRoot.dataset.nestedModalActive
          : null;

      modalRoot.dataset.nestedModalActive = "true";
      modalRoot.setAttribute("aria-hidden", "true");
    } else {
      this.focusTrapAriaHiddenBeforeSuspend = null;
      this.focusTrapNestedModalActiveBeforeSuspend = null;
    }

    const panel = this.getModalPanelElement();
    if (panel) {
      panel.setAttribute("inert", "");
    }

    return this.focusTrapSuspendCount;
  }

  resumeFocusTrap() {
    if (this.focusTrapSuspendCount === 0) {
      return 0;
    }

    this.focusTrapSuspendCount = Math.max(
      0,
      this.focusTrapSuspendCount - 1,
    );

    if (this.focusTrapSuspendCount > 0) {
      return this.focusTrapSuspendCount;
    }

    this.focusTrapSuspended = false;

    const modalRoot = this.getModalRootElement();
    if (modalRoot) {
      delete modalRoot.dataset.nestedModalActive;
      if (!modalRoot.classList.contains("hidden")) {
        if (this.focusTrapAriaHiddenBeforeSuspend === null) {
          modalRoot.removeAttribute("aria-hidden");
        } else {
          modalRoot.setAttribute(
            "aria-hidden",
            this.focusTrapAriaHiddenBeforeSuspend,
          );
        }
      }

      if (this.focusTrapNestedModalActiveBeforeSuspend === null) {
        delete modalRoot.dataset.nestedModalActive;
      } else {
        modalRoot.dataset.nestedModalActive =
          this.focusTrapNestedModalActiveBeforeSuspend;
      }
    }

    const panel = this.getModalPanelElement();
    if (panel) {
      panel.removeAttribute("inert");
    }

    this.focusTrapAriaHiddenBeforeSuspend = null;
    this.focusTrapNestedModalActiveBeforeSuspend = null;

    this.updateFocusTrap();

    return 0;
  }

  bringLoginModalToFront() {
    if (typeof document === "undefined") {
      return;
    }

    const loginModal = document.getElementById("loginModal");
    if (!(loginModal instanceof HTMLElement)) {
      return;
    }

    const container =
      this.modalContainer instanceof HTMLElement
        ? this.modalContainer
        : loginModal.parentElement;

    if (!container) {
      return;
    }

    if (loginModal.parentElement !== container) {
      container.appendChild(loginModal);
      return;
    }

    if (container.lastElementChild !== loginModal) {
      container.appendChild(loginModal);
    }
  }

  ensureModalOrder(modalRoot) {
    if (!(modalRoot instanceof HTMLElement)) {
      return;
    }

    const container =
      this.modalContainer instanceof HTMLElement ? this.modalContainer : null;
    const parentElement = modalRoot.parentElement;

    if (container) {
      if (parentElement !== container) {
        container.appendChild(modalRoot);
        return;
      }

      if (container.lastElementChild !== modalRoot) {
        container.appendChild(modalRoot);
      }
      return;
    }

    if (parentElement) {
      if (parentElement.lastElementChild !== modalRoot) {
        parentElement.appendChild(modalRoot);
      }
      return;
    }

    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(modalRoot);
    }
  }

  applyModalStackingOverrides() {
    const modalRoot =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (modalRoot) {
      modalRoot.dataset.modalStack = "top";
    }
  }

  /**
   * Displays the profile modal, defaulting to the "account" pane.
   * Triggers hydration of data for the active pane.
   *
   * @param {string} [targetPane="account"] - The pane to display initially.
   * @returns {Promise<boolean>} Resolves true after the show animation starts.
   */
  async show(targetPane = "account") {
    const pane =
      typeof targetPane === "string" && targetPane.trim()
        ? targetPane.trim()
        : "account";

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modalRoot =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (activeElement && modalRoot && modalRoot.contains(activeElement)) {
      this.previouslyFocusedElement = null;
    } else {
      this.previouslyFocusedElement = activeElement;
    }

    // Render the header (saved profiles) synchronously so the modal doesn't look empty.
    // This is generally fast as it only touches the top section.
    this.renderSavedProfiles();

    // Show the modal immediately to prevent UI lag.
    this.open(pane);

    const hasBlockHydrator =
      this.services.userBlocks &&
      typeof this.services.userBlocks.ensureLoaded === "function";

    if (hasBlockHydrator) {
      this.setBlockListLoadingState("loading");
    }

    // Defer expensive operations to the next animation frame to allow the modal to paint.
    requestAnimationFrame(() => {
      this.walletController.refreshWalletPaneState();
      this.refreshModerationSettingsUi();
      this.syncLinkPreviewSettingsUi();

      if (!hasBlockHydrator) {
        this.populateBlockedList();
      }

      const backgroundTasks = [];

      backgroundTasks.push(
        Promise.resolve()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            userLogger.error(
              "Failed to refresh admin pane while opening profile modal:",
              error,
            );
          }),
      );

      backgroundTasks.push(
        Promise.resolve().then(() => {
          try {
            this.relayController.populateProfileRelays();
          } catch (error) {
            userLogger.warn(
              "Failed to populate relay list while opening profile modal:",
              error,
            );
          }
        }),
      );

      if (hasBlockHydrator) {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        backgroundTasks.push(
          Promise.resolve()
            .then(() => this.services.userBlocks.ensureLoaded(activeHex))
            .then(() => {
              try {
                this.populateBlockedList();
              } catch (error) {
                userLogger.warn(
                  "Failed to render blocked creators after hydration:",
                  error,
                );
                this.setBlockListLoadingState("error", {
                  message: "Blocked creators may be out of date. Try again later.",
                });
              }
            })
            .catch((error) => {
              userLogger.warn(
                "Failed to refresh user block list while opening profile modal:",
                error,
              );
              this.setBlockListLoadingState("error", {
                message: "Blocked creators may be out of date. Try again later.",
              });
              try {
                this.populateBlockedList();
              } catch (populateError) {
                userLogger.warn(
                  "Failed to render blocked creators after hydration failure:",
                  populateError,
                );
              }
            }),
        );
      }

      if (backgroundTasks.length) {
        void Promise.allSettled(backgroundTasks);
      }
    });

    return true;
  }

  showWalletPane() {
    return this.show("wallet");
  }

  open(pane = "account") {
    const modalRoot =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (!modalRoot) {
      return;
    }

    this.ensureModalOrder(modalRoot);
    this.applyModalStackingOverrides();

    modalRoot.classList.remove("hidden");
    modalRoot.setAttribute("aria-hidden", "false");
    if (document.body) {
      document.body.classList.add("modal-open");
    }
    if (document.documentElement) {
      document.documentElement.classList.add("modal-open");
    }
    this.setGlobalModalState("profile", true);
    const preserveMenu = this.isMobileLayoutActive();
    this.selectPane(pane, { keepMenuView: preserveMenu });

    const focusTarget =
      this.focusableElements[0] ||
      this.profileModalPanel ||
      modalRoot;
    window.requestAnimationFrame(() => {
      if (typeof focusTarget?.focus === "function") {
        focusTarget.focus();
      }
    });
  }

  /**
   * Hides the profile modal and resets temporary state.
   *
   * @param {object} [options]
   * @param {boolean} [options.silent=false] - If true, suppresses the `onClose` callback.
   */
  hide(options = {}) {
    const { silent = false } =
      options && typeof options === "object" ? options : {};

    this.dmController.pauseProfileMessages();

    const modalElement =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (modalElement) {
      modalElement.classList.add("hidden");
      modalElement.setAttribute("aria-hidden", "true");
      delete modalElement.dataset.nestedModalActive;
      delete modalElement.dataset.modalStack;
      if (document.body) {
        document.body.classList.remove("modal-open");
      }
      if (document.documentElement) {
        document.documentElement.classList.remove("modal-open");
      }
      this.setGlobalModalState("profile", false);
      this.setMobileView("menu", { skipFocusTrap: true });

      if (this.boundKeydown && this.focusTrapContainer) {
        this.focusTrapContainer.removeEventListener(
          "keydown",
          this.boundKeydown,
        );
      }
    }

    if (this.boundFocusIn) {
      document.removeEventListener("focusin", this.boundFocusIn);
    }

    const panel = this.getModalPanelElement();
    if (panel) {
      panel.removeAttribute("inert");
    }

    this.focusTrapContainer = null;

    this.focusTrapSuspendCount = 0;
    this.focusTrapSuspended = false;
    this.focusTrapAriaHiddenBeforeSuspend = null;
    this.focusTrapNestedModalActiveBeforeSuspend = null;

    if (
      this.boundProfileHistoryVisibility &&
      typeof document !== "undefined" &&
      typeof document.removeEventListener === "function"
    ) {
      document.removeEventListener(
        "visibilitychange",
        this.boundProfileHistoryVisibility,
      );
      this.boundProfileHistoryVisibility = null;
    }

    if (this.profileHistoryRenderer) {
      try {
        if (typeof this.profileHistoryRenderer.destroy === "function") {
          this.profileHistoryRenderer.destroy();
        }
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to reset watch history renderer on close:",
          error,
        );
      }
      this.profileHistoryRenderer = null;
      this.profileHistoryRendererConfig = null;
    }

    this.setActivePane(null);
    this.walletController.setWalletPaneBusy(false);

    const previous = this.previouslyFocusedElement;
    this.previouslyFocusedElement = null;

    if (
      previous &&
      typeof previous.focus === "function" &&
      (!modalElement || !modalElement.contains(previous))
    ) {
      const shouldRestore =
        "isConnected" in previous ? previous.isConnected !== false : true;
      if (shouldRestore) {
        window.requestAnimationFrame(() => {
          try {
            previous.focus();
          } catch (error) {
            userLogger.warn(
              "[profileModal] Failed to restore focus after closing modal:",
              error,
            );
          }
        });
      }
    }

    if (!silent) {
      try {
        this.callbacks.onClose(this);
      } catch (error) {
        userLogger.warn(
          "[profileModal] onClose callback threw while hiding modal:",
          error,
        );
      }
    }
  }

  /**
   * Handles a successful login event.
   * Syncs the active profile, hydrates wallet/admin state, and refreshes all lists.
   *
   * @param {object} detail - Login details (pubkey, savedProfiles, etc.).
   * @returns {Promise<boolean>}
   */
  async handleAuthLogin(detail = {}) {
    const postLoginPromise =
      detail && typeof detail.postLoginPromise?.then === "function"
        ? detail.postLoginPromise
        : Promise.resolve(detail?.postLogin ?? null);

    const savedProfiles = Array.isArray(detail?.savedProfiles)
      ? detail.savedProfiles
      : null;
    if (savedProfiles) {
      try {
        this.setSavedProfiles(savedProfiles, {
          persist: false,
          persistActive: false,
        });
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to sync saved profiles during login:",
          error,
        );
      }
    }

    const activePubkey =
      detail?.activeProfilePubkey ?? detail?.pubkey ?? undefined;
    if (activePubkey !== undefined) {
      this.setActivePubkey(activePubkey);
    }

    const walletPromise = this.hydrateActiveWalletSettings(activePubkey);
    const adminPromise = this.refreshAdminPaneState().catch((error) => {
      userLogger.warn("Failed to refresh admin pane after login:", error);
    });

    this.renderSavedProfiles();

    // Trigger aggressive parallel fetches
    if (activePubkey) {
      if (this.services.userBlocks) {
        this.services.userBlocks.loadBlocks(activePubkey).catch(noop);
      }
      if (this.subscriptionsService) {
        this.subscriptionsService
          .loadSubscriptions(activePubkey, { allowPermissionPrompt: false })
          .catch(noop);
      }
    }

    this.populateBlockedList();
    void this.populateSubscriptionsList();
    void this.populateFriendsList();
    this.relayController.populateProfileRelays();
    this.walletController.refreshWalletPaneState();
    this.hashtagController.populateHashtagPreferences();
    void this.storageController.populateStoragePane();
    this.handleActiveDmIdentityChanged(activePubkey);
    void this.refreshDmRelayPreferences({ force: true });

    // Ensure critical state is settled if possible, but don't block initial rendering
    Promise.all([walletPromise, adminPromise, postLoginPromise])
      .then(() => {
        // Re-run population to ensure any late-arriving data is reflected
        this.populateBlockedList();
        void this.populateSubscriptionsList();
        void this.populateFriendsList();
        this.relayController.populateProfileRelays();
        this.walletController.refreshWalletPaneState();
        this.hashtagController.populateHashtagPreferences();
        void this.storageController.populateStoragePane();
        void this.refreshDmRelayPreferences({ force: true });
      })
      .catch((error) => {
        userLogger.warn(
          "[profileModal] Failed to hydrate deferred login data:",
          error,
        );
      });

    return true;
  }

  /**
   * Handles a logout event.
   * Clears personal data (DMs, friends, subscriptions) from the UI.
   *
   * @param {object} detail - Logout details.
   * @returns {Promise<boolean>}
   */
  async handleAuthLogout(detail = {}) {
    const savedProfiles = Array.isArray(detail?.savedProfiles)
      ? detail.savedProfiles
      : null;
    if (savedProfiles) {
      try {
        this.setSavedProfiles(savedProfiles, {
          persist: false,
          persistActive: false,
        });
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to sync saved profiles during logout:",
          error,
        );
      }
    }

    if (detail?.activeProfilePubkey !== undefined) {
      this.setActivePubkey(detail.activeProfilePubkey);
    } else {
      this.setActivePubkey(null);
    }

    this.profileSwitcherSelectionPubkey = null;
    this.renderSavedProfiles();

    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      userLogger.warn("Failed to refresh admin pane after logout:", error);
    }

    if (
      this.subscriptionsService &&
      typeof this.subscriptionsService.reset === "function"
    ) {
      try {
        this.subscriptionsService.reset();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to reset subscriptions service on logout:",
          error,
        );
      }
    }

    this.populateBlockedList();
    this.clearSubscriptionsList();
    this.clearFriendsList();
    this.relayController.populateProfileRelays();
    this.walletController.refreshWalletPaneState();
    this.hashtagController.populateHashtagPreferences();
    void this.storageController.populateStoragePane();
    this.hashtagController.clearHashtagInputs();
    this.hashtagController.setHashtagStatus("", "muted");
    this.handleActiveDmIdentityChanged(null);
    this.setMessagesUnreadIndicator(false);
    this.dmController.populateDmRelayPreferences();
    this.dmController.setDmRelayPreferencesStatus("");

    return true;
  }

  handleProfileUpdated(detail = {}) {
    const previousActive = this.normalizeHexPubkey(this.getActivePubkey());

    if (Array.isArray(detail?.savedProfiles)) {
      try {
        this.setSavedProfiles(detail.savedProfiles, {
          persist: false,
          persistActive: false,
        });
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to sync saved profiles after profile update:",
          error,
        );
      }
    }

    if (detail?.activeProfilePubkey !== undefined) {
      this.setActivePubkey(detail.activeProfilePubkey);
    } else if (detail?.pubkey) {
      this.setActivePubkey(detail.pubkey);
    }

    this.renderSavedProfiles();
    void this.populateSubscriptionsList();

    const nextActive = this.normalizeHexPubkey(this.getActivePubkey());
    if (previousActive !== nextActive) {
      this.handleActiveDmIdentityChanged(nextActive);
    }
  }

  removeSavedProfile(pubkey) {
    if (!pubkey) {
      return { removed: false };
    }

    let result;
    try {
      result = this.services.removeSavedProfile(pubkey) || { removed: false };
    } catch (error) {
      userLogger.error("Failed to remove saved profile:", error);
      result = { removed: false, error };
    }

    if (result?.removed) {
      if (
        this.normalizeHexPubkey(pubkey) ===
        this.normalizeHexPubkey(this.getActivePubkey())
      ) {
        this.setActivePubkey(null);
      }
      this.renderSavedProfiles();
    }

    return result;
  }

  async hydrateActiveWalletSettings(pubkey) {
    const service = this.services.nwcSettings;
    const hydrate = service?.hydrateNwcSettingsForPubkey;
    if (typeof hydrate !== "function") {
      return null;
    }

    const normalized = this.normalizeHexPubkey(
      pubkey !== undefined ? pubkey : this.getActivePubkey(),
    );
    if (!normalized) {
      return null;
    }

    try {
      return await hydrate.call(service, normalized);
    } catch (error) {
      userLogger.warn(
        `[ProfileModalController] Failed to hydrate wallet settings for ${normalized}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Switches the active session to another saved profile.
   *
   * @param {string} pubkey - The public key of the target profile.
   * @param {object} [options]
   * @param {object} [options.entry] - The saved profile entry object.
   * @param {string} [options.providerId] - The auth provider ID to use.
   * @returns {Promise<{switched: boolean, error?: Error}>}
   */
  async switchProfile(pubkey, { entry, providerId } = {}) {
    if (!pubkey) {
      return { switched: false, reason: "missing-pubkey" };
    }

    let result;
    try {
      result = await this.requestSwitchProfile({ pubkey, entry, providerId });
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to switch profiles. Please try again.";
      this.showError(message);
      return {
        switched: false,
        error,
        reason: error?.code || "switch-error",
      };
    }

    if (!result?.switched) {
      this.hide();
      return result || { switched: false };
    }

    await this.hydrateActiveWalletSettings(pubkey);

    this.profileSwitcherSelectionPubkey = null;
    this.renderSavedProfiles();
    this.hide();

    return result;
  }

  getSavedProfiles() {
    return this.state.getSavedProfiles();
  }

  setSavedProfiles(...args) {
    return this.state.setSavedProfiles(...args);
  }

  normalizeProviderId(providerId) {
    if (typeof providerId !== "string") {
      return null;
    }

    const trimmed = providerId.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed;
  }

  getEntryProviderId(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const explicit = this.normalizeProviderId(entry.providerId);
    if (explicit) {
      return explicit;
    }

    return this.normalizeProviderId(entry.authType);
  }

  resolveEntryProviderMetadata(entry) {
    const providerId = this.getEntryProviderId(entry);
    if (providerId) {
      return getProviderMetadata(providerId);
    }

    return getProviderMetadata();
  }

  persistSavedProfiles(...args) {
    if (typeof this.services.persistSavedProfiles === "function") {
      try {
        return this.services.persistSavedProfiles(...args);
      } catch (error) {
        userLogger.warn(
          "[ProfileModalController] Persist saved profiles service threw:",
          error,
        );
      }
    }
    return this.state.persistSavedProfiles(...args);
  }

  getActivePubkey() {
    return this.state.getActivePubkey();
  }

  setActivePubkey(...args) {
    return this.state.setActivePubkey(...args);
  }

  getCachedProfileSelection() {
    return this.state.getCachedSelection();
  }

  setCachedProfileSelection(...args) {
    return this.state.setCachedSelection(...args);
  }

  getActivePane() {
    return this.state.getActivePane();
  }

  setActivePane(...args) {
    return this.state.setActivePane(...args);
  }


  populateProfileRelays(...args) {
    return this.relayController.populateProfileRelays(...args);
  }

  handleDirectMessagesRelayWarning(...args) {
    return this.dmController.handleDirectMessagesRelayWarning(...args);
  }

  // Moderation Controller Delegates & Aliases
  get moderationBlurInput() { return this.moderationController.moderationBlurInput; }
  get moderationAutoplayInput() { return this.moderationController.moderationAutoplayInput; }
  get moderationMuteHideInput() { return this.moderationController.moderationMuteHideInput; }
  get moderationSpamHideInput() { return this.moderationController.moderationSpamHideInput; }
  get moderationSaveButton() { return this.moderationController.moderationSaveButton; }
  get moderationResetButton() { return this.moderationController.moderationResetButton; }
  get moderationStatusText() { return this.moderationController.moderationStatusText; }
  get moderationOverridesList() { return this.moderationController.moderationOverridesList; }
  get moderationOverridesEmpty() { return this.moderationController.moderationOverridesEmpty; }
  get moderationTrustedContactsCount() { return this.moderationController.moderationTrustedContactsCount; }
  get moderationTrustedMuteCount() { return this.moderationController.moderationTrustedMuteCount; }
  get moderationTrustedReportCount() { return this.moderationController.moderationTrustedReportCount; }
  get moderationSeedOnlyIndicator() { return this.moderationController.moderationSeedOnlyIndicator; }
  get moderationHideControlsGroup() { return this.moderationController.moderationHideControlsGroup; }
  get moderationHideControlElements() { return this.moderationController.moderationHideControlElements; }

  handleModerationSettingsSave(...args) { return this.moderationController.handleModerationSettingsSave(...args); }
  handleModerationSettingsReset(...args) { return this.moderationController.handleModerationSettingsReset(...args); }
  getModerationSettingsDefaults(...args) { return this.moderationController.getModerationSettingsDefaults(...args); }

  get relayList() {
    return this.relayController.relayList;
  }

  get relayInput() {
    return this.relayController.relayInput;
  }

  get addRelayButton() {
    return this.relayController.addRelayButton;
  }

  get restoreRelaysButton() {
    return this.relayController.restoreRelaysButton;
  }

  get relayHealthStatus() {
    return this.relayController.relayHealthStatus;
  }

  get relayHealthTelemetryToggle() {
    return this.relayController.relayHealthTelemetryToggle;
  }

  get profileRelayRefreshBtn() {
    return this.relayController.profileRelayRefreshBtn;
  }

  // Hashtag Controller Delegates
  get hashtagStatusText() { return this.hashtagController.hashtagStatusText; }
  get hashtagBackgroundLoading() { return this.hashtagController.hashtagBackgroundLoading; }
  set hashtagBackgroundLoading(val) { this.hashtagController.hashtagBackgroundLoading = val; }
  get hashtagInterestList() { return this.hashtagController.hashtagInterestList; }
  get hashtagInterestEmpty() { return this.hashtagController.hashtagInterestEmpty; }
  get hashtagInterestInput() { return this.hashtagController.hashtagInterestInput; }
  get addHashtagInterestButton() { return this.hashtagController.addHashtagInterestButton; }
  get profileHashtagInterestRefreshBtn() { return this.hashtagController.profileHashtagInterestRefreshBtn; }
  get hashtagDisinterestList() { return this.hashtagController.hashtagDisinterestList; }
  get hashtagDisinterestEmpty() { return this.hashtagController.hashtagDisinterestEmpty; }
  get hashtagDisinterestInput() { return this.hashtagController.hashtagDisinterestInput; }
  get addHashtagDisinterestButton() { return this.hashtagController.addHashtagDisinterestButton; }
  get profileHashtagDisinterestRefreshBtn() { return this.hashtagController.profileHashtagDisinterestRefreshBtn; }

  populateHashtagPreferences(...args) { return this.hashtagController.populateHashtagPreferences(...args); }
  handleAddHashtagPreference(...args) { return this.hashtagController.handleAddHashtagPreference(...args); }
  handleRemoveHashtagPreference(...args) { return this.hashtagController.handleRemoveHashtagPreference(...args); }
  handleHashtagPreferencesChange(...args) { return this.hashtagController.handleHashtagPreferencesChange(...args); }
  normalizeHashtagTag(...args) { return this.hashtagController.normalizeHashtagTag(...args); }
  formatHashtagTag(...args) { return this.hashtagController.formatHashtagTag(...args); }
  sanitizeHashtagList(...args) { return this.hashtagController.sanitizeHashtagList(...args); }
  getResolvedHashtagPreferences(...args) { return this.hashtagController.getResolvedHashtagPreferences(...args); }
  setHashtagStatus(...args) { return this.hashtagController.setHashtagStatus(...args); }
  refreshHashtagBackgroundStatus(...args) { return this.hashtagController.refreshHashtagBackgroundStatus(...args); }
  clearHashtagInputs(...args) { return this.hashtagController.clearHashtagInputs(...args); }
  describeHashtagPreferencesError(...args) { return this.hashtagController.describeHashtagPreferencesError(...args); }
}

export default ProfileModalController;
