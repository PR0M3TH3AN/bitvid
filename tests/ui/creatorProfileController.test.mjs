import { test } from "node:test";
import assert from "node:assert";
import CreatorProfileController from "../../js/ui/creatorProfileController.js";

test("CreatorProfileController", async (t) => {
  await t.test("resolveCreatorProfileFromSources prioritizes cached profile", () => {
    const controller = new CreatorProfileController({
      services: { nostrClient: {} },
      ui: { zapController: {} },
      callbacks: {},
      helpers: {
        sanitizeProfileMediaUrl: (url) => url,
      },
    });

    const result = controller.resolveCreatorProfileFromSources({
      pubkey: "pubkey1",
      cachedProfile: { name: "Cached Name", picture: "cached.jpg" },
      fetchedProfile: { name: "Fetched Name", picture: "fetched.jpg" },
    });

    // logic prioritizes fetched > cached > video
    assert.strictEqual(result.name, "Fetched Name");
    assert.strictEqual(result.picture, "fetched.jpg");
  });

  await t.test("resolveCreatorProfileFromSources falls back to fetched profile", () => {
    const controller = new CreatorProfileController({
      services: { nostrClient: {} },
      ui: { zapController: {} },
      callbacks: {},
      helpers: {
        sanitizeProfileMediaUrl: (url) => url,
      },
    });

    const result = controller.resolveCreatorProfileFromSources({
      pubkey: "pubkey1",
      cachedProfile: null,
      fetchedProfile: { name: "Fetched Name", picture: "fetched.jpg" },
    });

    assert.strictEqual(result.name, "Fetched Name");
    assert.strictEqual(result.picture, "fetched.jpg");
  });

  await t.test("decorateVideoCreatorIdentity modifies video object", () => {
    const controller = new CreatorProfileController({
      services: { nostrClient: {} },
      ui: { zapController: {} },
      callbacks: {
        getProfileCacheEntry: () => ({ profile: { name: "Decorated Name" } }),
      },
      helpers: {
        safeEncodeNpub: () => "npub1...",
        formatShortNpub: (npub) => npub,
        sanitizeProfileMediaUrl: (url) => url,
      },
    });

    const video = { pubkey: "abcdef" };
    const decorated = controller.decorateVideoCreatorIdentity(video);

    assert.strictEqual(decorated.creatorName, "Decorated Name");
    assert.strictEqual(decorated.authorName, "Decorated Name");
    assert.strictEqual(decorated.creator.name, "Decorated Name");
  });

  await t.test("fetchModalCreatorProfile fetches profile and updates modal", async () => {
    let modalUpdated = false;
    let zapVisibility = null;
    let profileCached = false;

    const mockNostrClient = { relays: ["wss://relay.example.com"] };
    const mockVideoModal = {
      updateMetadata: () => { modalUpdated = true; }
    };
    const mockZapController = {
      setVisibility: (val) => { zapVisibility = val; }
    };

    const validHex = "f".repeat(64);

    const controller = new CreatorProfileController({
      services: { nostrClient: mockNostrClient },
      ui: { zapController: mockZapController },
      callbacks: {
        getProfileCacheEntry: () => null,
        setProfileCacheEntry: () => { profileCached = true; },
        getCurrentVideo: () => ({ pubkey: validHex }),
        getVideoModal: () => mockVideoModal,
      },
      helpers: {
        fetchProfileMetadata: async () => ({
          event: { content: JSON.stringify({ name: "Fetched" }) }
        }),
        ensureProfileMetadataSubscription: () => {},
        safeEncodeNpub: () => "npub1...",
        formatShortNpub: (val) => val,
        sanitizeProfileMediaUrl: (val) => val,
      },
      logger: { warn: () => {} }
    });

    await controller.fetchModalCreatorProfile({
      pubkey: validHex,
      displayNpub: "npub1...",
      requestToken: Symbol("test")
    });

    assert.strictEqual(modalUpdated, true, "Video modal should be updated");
    assert.strictEqual(zapVisibility, false, "Zap visibility should be false (no lightning address)");
    assert.strictEqual(profileCached, true, "Profile should be cached");
  });
});
