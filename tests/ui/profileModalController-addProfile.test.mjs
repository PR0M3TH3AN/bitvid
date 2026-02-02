import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import ProfileModalController from "../../js/ui/profileModalController.js";

const TEMPLATE_HTML = `
<div id="profileModal">
  <div class="bv-modal__panel"></div>
  <button id="profileAddAccountBtn" type="button"></button>
  <div id="profileSwitcherList"></div>
  <div id="profileModerationSettings">
    <label>
        <span class="text-xs"></span>
        <input id="profileModerationMuteHideThreshold" type="number" />
    </label>
  </div>
</div>
`;

let dom;
let documentRef;
let windowRef;
let controller;
let savedProfiles;
let profileCache;
let persistedProfiles;
let loadProfileError = null;

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
  global.HTMLButtonElement = windowRef.HTMLButtonElement;
  global.HTMLInputElement = windowRef.HTMLInputElement;
  global.HTMLTextAreaElement = windowRef.HTMLTextAreaElement;
  global.HTMLImageElement = windowRef.HTMLImageElement;
  global.Event = windowRef.Event;

  if (!global.localStorage) {
      global.localStorage = {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {}
      };
  }

  global.fetch = async (url) => {
    return {
      ok: true,
      async text() {
        return TEMPLATE_HTML;
      },
    };
  };

  savedProfiles = [];
  persistedProfiles = null;
  profileCache = new Map();
  loadProfileError = null;

  controller = new ProfileModalController({
    modalContainer: documentRef.body,
    removeTrackingScripts: () => {},
    showSuccess: (msg) => { console.log("Success:", msg); },
    showError: (msg) => { console.error("Error:", msg); },
    services: {
      normalizeHexPubkey: (k) => k,
      safeEncodeNpub: (k) => `npub${k}`,
      getProfileCacheEntry: (k) => ({ profile: profileCache.get(k) }),
      authService: {
        loadOwnProfile: async (k) => {
          if (loadProfileError) throw loadProfileError;
          if (!profileCache.has(k)) {
            profileCache.set(k, { name: "Loaded User", picture: "pic.jpg" });
          }
          return profileCache.get(k);
        }
      },
      persistSavedProfiles: (opts) => { persistedProfiles = [...savedProfiles]; },
      describeLoginError: (err, fb) => err.message || fb,
      // minimal mocks for other required services
      relayManager: {},
      userBlocks: {},
      nostrClient: {},
      accessControl: {},
      getCurrentUserNpub: () => null,
      moderationSettings: {},
      watchHistoryService: {},
      log: () => {},
      closeAllMoreMenus: () => {},
    },
    state: {
      getSavedProfiles: () => savedProfiles,
      setSavedProfiles: (profiles) => { savedProfiles = profiles; return savedProfiles; },
      persistSavedProfiles: (opts) => { persistedProfiles = [...savedProfiles]; },
      getActivePubkey: () => null,
      setActivePubkey: () => null,
    },
  });

  await controller.load();
});

afterEach(() => {
  if (dom) {
    dom.window.close();
  }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.HTMLButtonElement;
  delete global.HTMLInputElement;
  delete global.HTMLTextAreaElement;
  delete global.HTMLImageElement;
  delete global.Event;
  delete global.fetch;
});

test("handleAddProfile adds a new profile correctly", async () => {
  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  const loginResult = {
    pubkey,
    authType: "nip07",
  };

  await controller.handleAddProfile({ loginResult });

  assert.equal(savedProfiles.length, 1);
  assert.equal(savedProfiles[0].pubkey, pubkey);
  assert.equal(savedProfiles[0].name, "Loaded User"); // loaded via mock authService
  assert.equal(savedProfiles[0].picture, "pic.jpg");
  assert.deepEqual(persistedProfiles, savedProfiles);
});

test("handleAddProfile prevents duplicates", async () => {
  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  savedProfiles.push({ pubkey, name: "Existing" });

  const loginResult = { pubkey, authType: "nip07" };
  await controller.handleAddProfile({ loginResult });

  assert.equal(savedProfiles.length, 1);
  assert.equal(savedProfiles[0].name, "Existing");
});

test("handleAddProfile handles missing login result", async () => {
  await controller.handleAddProfile({});
  assert.equal(savedProfiles.length, 0);
});

test("handleAddProfile handles errors gracefully", async () => {
  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  const loginResult = { pubkey };

  loadProfileError = new Error("Network error loading profile");

  await assert.rejects(
      async () => {
          await controller.handleAddProfile({ loginResult });
      },
      (err) => {
          assert.equal(err.message, "Network error loading profile");
          return true;
      }
  );

  assert.equal(savedProfiles.length, 0);
});
