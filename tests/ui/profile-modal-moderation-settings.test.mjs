import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import ProfileModalController from "../../js/ui/profileModalController.js";
import { getDefaultModerationSettings } from "../../js/state/cache.js";

function createDefaultModerationSettingsSnapshot() {
  return getDefaultModerationSettings();
}

const {
  blurThreshold: DEFAULT_BLUR_THRESHOLD,
  autoplayBlockThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  trustedSpamHideThreshold: DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
} = createDefaultModerationSettingsSnapshot();

const DEFAULT_BLUR_STRING = String(DEFAULT_BLUR_THRESHOLD);
const DEFAULT_AUTOPLAY_STRING = String(DEFAULT_AUTOPLAY_BLOCK_THRESHOLD);
const DEFAULT_TRUSTED_MUTE_STRING = String(DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD);
const DEFAULT_TRUSTED_SPAM_STRING = String(DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD);

const TEMPLATE_HTML = `
<div id="profileModal">
  <div class="bv-modal__panel"></div>
  <div class="bv-modal-backdrop"></div>
  <div data-profile-layout>
    <div data-profile-mobile-menu></div>
    <div data-profile-mobile-pane></div>
  </div>
  <button id="closeProfileModal" type="button"></button>
  <button id="profileModalBack" type="button"></button>
  <button id="profileLogoutBtn" type="button"></button>
  <a id="profileChannelLink" href="#"></a>
  <button id="profileAddAccountBtn" type="button"></button>
  <div id="profileNavAccount"></div>
  <div id="profilePaneAccount"></div>
  <div id="profileModerationSettings">
    <input id="profileModerationBlurThreshold" type="number" />
    <input id="profileModerationAutoplayThreshold" type="number" />
<<<<<<< HEAD
    <div id="profileModerationTrustedContactsCount"></div>
    <div id="profileModerationTrustedMuteCount"></div>
    <div id="profileModerationTrustedReportCount"></div>
=======
>>>>>>> origin/main
    <div data-role="trusted-hide-controls">
      <input id="profileModerationMuteHideThreshold" type="number" />
      <input id="profileModerationSpamHideThreshold" type="number" />
    </div>
    <button id="profileModerationSave" type="button">Save</button>
    <button id="profileModerationReset" type="button">Reset</button>
    <p id="profileModerationStatus"></p>
  </div>
</div>
`;

let dom;
let documentRef;
let windowRef;
let controller;
let storedSettings;
let moderationService;
let callbackPayloads;

beforeEach(async () => {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://example.com",
  });

  windowRef = dom.window;
  documentRef = windowRef.document;

  global.window = windowRef;
  global.document = documentRef;
  global.HTMLElement = windowRef.HTMLElement;
  global.HTMLInputElement = windowRef.HTMLInputElement;
  global.Event = windowRef.Event;

  global.fetch = async (url) => {
    assert.equal(url, "components/profile-modal.html");
    return {
      ok: true,
      async text() {
        return TEMPLATE_HTML;
      },
    };
  };

  storedSettings = { ...createDefaultModerationSettingsSnapshot() };
  moderationService = {
    getDefaultModerationSettings() {
      return createDefaultModerationSettingsSnapshot();
    },
    getActiveModerationSettings() {
      return { ...storedSettings };
    },
    updateModerationSettings(partial = {}) {
      const defaults = createDefaultModerationSettingsSnapshot();
      if (Object.prototype.hasOwnProperty.call(partial, "blurThreshold")) {
        const value = partial.blurThreshold;
        storedSettings.blurThreshold =
          value === null ? defaults.blurThreshold : value;
      }
      if (
        Object.prototype.hasOwnProperty.call(
          partial,
          "autoplayBlockThreshold",
        )
      ) {
        const value = partial.autoplayBlockThreshold;
        storedSettings.autoplayBlockThreshold =
          value === null ? defaults.autoplayBlockThreshold : value;
      }
      if (
        Object.prototype.hasOwnProperty.call(
          partial,
          "trustedMuteHideThreshold",
        )
      ) {
        const value = partial.trustedMuteHideThreshold;
        storedSettings.trustedMuteHideThreshold =
          value === null ? defaults.trustedMuteHideThreshold : value;
      }
      if (
        Object.prototype.hasOwnProperty.call(
          partial,
          "trustedSpamHideThreshold",
        )
      ) {
        const value = partial.trustedSpamHideThreshold;
        storedSettings.trustedSpamHideThreshold =
          value === null ? defaults.trustedSpamHideThreshold : value;
      }
      return { ...storedSettings };
    },
    resetModerationSettings() {
      storedSettings = { ...createDefaultModerationSettingsSnapshot() };
      return { ...storedSettings };
    },
  };

  callbackPayloads = [];

  controller = new ProfileModalController({
    modalContainer: documentRef.body,
    removeTrackingScripts: () => {},
    services: {
      relayManager: {},
      userBlocks: {},
      nostrClient: {},
      accessControl: {},
      getCurrentUserNpub: () => null,
      moderationSettings: moderationService,
      loadVideos: async () => undefined,
      onVideosShouldRefresh: async () => undefined,
      onAccessControlUpdated: async () => undefined,
      persistSavedProfiles: () => {},
      watchHistoryService: {},
      authService: {},
      log: () => {},
      closeAllMoreMenus: () => {},
    },
    state: {
      getSavedProfiles: () => [],
      setSavedProfiles: () => ({ changed: false, profiles: [] }),
      persistSavedProfiles: () => {},
      getActivePubkey: () => null,
      setActivePubkey: () => null,
    },
    callbacks: {
      onModerationSettingsChange: (payload) => callbackPayloads.push(payload),
    },
  });
});

afterEach(() => {
  if (dom) {
    dom.window.close();
  }
  dom = null;
  documentRef = null;
  windowRef = null;
  controller = null;
  storedSettings = null;
  moderationService = null;
  callbackPayloads = null;
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.HTMLInputElement;
  delete global.Event;
  delete global.fetch;
});

test("moderation settings save updates service and disables control", async () => {
  await controller.load();

  assert.equal(controller.moderationBlurInput.value, DEFAULT_BLUR_STRING);
  assert.equal(controller.moderationAutoplayInput.value, DEFAULT_AUTOPLAY_STRING);
  assert.equal(controller.moderationMuteHideInput.value, DEFAULT_TRUSTED_MUTE_STRING);
  assert.equal(controller.moderationSpamHideInput.value, DEFAULT_TRUSTED_SPAM_STRING);
  assert.equal(controller.moderationSaveButton.disabled, true);

  controller.moderationBlurInput.value = "5";
  controller.moderationBlurInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationAutoplayInput.value = "4";
  controller.moderationAutoplayInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationMuteHideInput.value = "2";
  controller.moderationMuteHideInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationSpamHideInput.value = "6";
  controller.moderationSpamHideInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );

  assert.equal(controller.moderationSaveButton.disabled, false);

  const result = await controller.handleModerationSettingsSave();
  assert.equal(result.success, true);
  assert.deepEqual(storedSettings, {
    blurThreshold: 5,
    autoplayBlockThreshold: 4,
    trustedMuteHideThreshold: 2,
    trustedSpamHideThreshold: 6,
  });
  assert.equal(controller.moderationSaveButton.disabled, true);
  assert.equal(
    controller.moderationStatusText.textContent,
    "Moderation settings saved.",
  );
  assert.equal(callbackPayloads.length, 1);
  assert.deepEqual(callbackPayloads[0].settings, {
    blurThreshold: 5,
    autoplayBlockThreshold: 4,
    trustedMuteHideThreshold: 2,
    trustedSpamHideThreshold: 6,
  });
});

test("moderation reset restores defaults and clearing inputs uses defaults", async () => {
  storedSettings = {
    blurThreshold: 6,
    autoplayBlockThreshold: 4,
    trustedMuteHideThreshold: 3,
    trustedSpamHideThreshold: 5,
  };
  await controller.load();

  assert.equal(controller.moderationBlurInput.value, "6");
  assert.equal(controller.moderationAutoplayInput.value, "4");
  assert.equal(controller.moderationMuteHideInput.value, "3");
  assert.equal(controller.moderationSpamHideInput.value, "5");

  const resetContext = await controller.handleModerationSettingsReset();
  assert.equal(resetContext.success, true);
  assert.deepEqual(storedSettings, {
    blurThreshold: DEFAULT_BLUR_THRESHOLD,
    autoplayBlockThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
    trustedSpamHideThreshold: DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  });
  assert.equal(controller.moderationBlurInput.value, DEFAULT_BLUR_STRING);
  assert.equal(controller.moderationAutoplayInput.value, DEFAULT_AUTOPLAY_STRING);
  assert.equal(controller.moderationMuteHideInput.value, DEFAULT_TRUSTED_MUTE_STRING);
  assert.equal(controller.moderationSpamHideInput.value, DEFAULT_TRUSTED_SPAM_STRING);
  assert.equal(
    controller.moderationStatusText.textContent,
    "Moderation defaults restored.",
  );
  assert.equal(controller.moderationSaveButton.disabled, true);

  controller.moderationBlurInput.value = "7.8";
  controller.moderationBlurInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationSpamHideInput.value = "8";
  controller.moderationSpamHideInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  const saveResult = await controller.handleModerationSettingsSave();
  assert.equal(saveResult.success, true);
  assert.deepEqual(storedSettings, {
    blurThreshold: 7,
    autoplayBlockThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
    trustedSpamHideThreshold: 8,
  });

  controller.moderationBlurInput.value = "";
  controller.moderationAutoplayInput.value = "";
  controller.moderationMuteHideInput.value = "";
  controller.moderationSpamHideInput.value = "";
  controller.moderationBlurInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationAutoplayInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationMuteHideInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  controller.moderationSpamHideInput.dispatchEvent(
    new windowRef.Event("input", { bubbles: true }),
  );
  assert.equal(controller.moderationSaveButton.disabled, false);

  const revertContext = await controller.handleModerationSettingsSave();
  assert.equal(revertContext.success, true);
  assert.deepEqual(storedSettings, {
    blurThreshold: DEFAULT_BLUR_THRESHOLD,
    autoplayBlockThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
    trustedSpamHideThreshold: DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  });
});

test("guest fallback uses config moderation defaults", async () => {
  moderationService.getDefaultModerationSettings = () => null;
  moderationService.getActiveModerationSettings = () => null;
  storedSettings = null;

  await controller.load();

  assert.equal(controller.moderationBlurInput.value, DEFAULT_BLUR_STRING);
  assert.equal(
    controller.moderationAutoplayInput.value,
    DEFAULT_AUTOPLAY_STRING,
  );
  assert.equal(
    controller.moderationMuteHideInput.value,
    DEFAULT_TRUSTED_MUTE_STRING,
  );
  assert.equal(
    controller.moderationSpamHideInput.value,
    DEFAULT_TRUSTED_SPAM_STRING,
  );

  const defaults = controller.getModerationSettingsDefaults();
  assert.deepEqual(defaults, {
    blurThreshold: DEFAULT_BLUR_THRESHOLD,
    autoplayBlockThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
    trustedSpamHideThreshold: DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  });
});
