
import assert from "assert";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import TagPreferenceMenuController from "../../js/ui/tagPreferenceMenuController.js";
import { TAG_PREFERENCE_ACTIONS } from "../../js/ui/components/tagPreferenceMenu.js";

describe("TagPreferenceMenuController", () => {
  let controller;
  let mockHashtagPreferences;
  let mockServices;
  let mockCallbacks;
  let mockHelpers;
  let mockPopover;
  let mockPopoverInstance;

  beforeEach(() => {
    mockHashtagPreferences = {
      addInterest: mock.fn(() => true),
      removeInterest: mock.fn(() => true),
      addDisinterest: mock.fn(() => true),
      removeDisinterest: mock.fn(() => true),
      publish: mock.fn(async () => true),
    };

    mockServices = {
      hashtagPreferences: mockHashtagPreferences,
    };

    mockCallbacks = {
      isLoggedIn: mock.fn(() => true),
      getMembership: mock.fn(() => ({ interest: false, disinterest: false })),
      showError: mock.fn(),
      onPreferenceUpdate: mock.fn(),
      onMenuOpen: mock.fn(),
      getPubkey: mock.fn(() => "test-pubkey"),
    };

    mockPopoverInstance = {
      open: mock.fn(async () => {}),
      close: mock.fn(() => true),
      destroy: mock.fn(),
      isOpen: mock.fn(() => false),
    };

    mockPopover = mock.fn(() => mockPopoverInstance);

    mockHelpers = {
      createPopover: mockPopover,
      designSystem: { mode: "default" },
    };

    controller = new TagPreferenceMenuController({
      services: mockServices,
      callbacks: mockCallbacks,
      helpers: mockHelpers,
    });
  });

  afterEach(() => {
    mock.reset();
  });

  describe("ensurePopover", () => {
    it("should create a new popover entry if one does not exist", () => {
      const trigger = { nodeType: 1, ownerDocument: global.document }; // Mock DOM element
      const detail = { trigger, tag: "bitcoin" };

      const entry = controller.ensurePopover(detail);

      assert.ok(entry);
      assert.strictEqual(entry.tag, "bitcoin");
      assert.strictEqual(entry.trigger, trigger);
      assert.strictEqual(entry.popover, mockPopoverInstance);
      assert.strictEqual(mockPopover.mock.calls.length, 1);
    });

    it("should return existing entry if one exists", () => {
      const trigger = { nodeType: 1, ownerDocument: global.document };
      const detail = { trigger, tag: "bitcoin" };

      const entry1 = controller.ensurePopover(detail);
      const entry2 = controller.ensurePopover(detail);

      assert.strictEqual(entry1, entry2);
      assert.strictEqual(mockPopover.mock.calls.length, 1);
    });

    it("should return null if trigger or tag is missing", () => {
        assert.strictEqual(controller.ensurePopover({}), null);
        assert.strictEqual(controller.ensurePopover({ trigger: {} }), null); // trigger not element
        assert.strictEqual(controller.ensurePopover({ trigger: { nodeType: 1 } }), null); // missing tag
    });
  });

  describe("requestMenu", () => {
    it("should ensure popover, close others, and open the requested one", async () => {
      const trigger = { nodeType: 1, ownerDocument: global.document };
      const detail = { trigger, tag: "bitcoin" };

      // Spy on closeMenus
      const closeMenusSpy = mock.method(controller, "closeMenus");

      controller.requestMenu(detail);

      assert.strictEqual(closeMenusSpy.mock.calls.length, 1);
      assert.strictEqual(mockCallbacks.onMenuOpen.mock.calls.length, 1);
      assert.strictEqual(mockPopoverInstance.open.mock.calls.length, 1);
    });

    it("should close the popover if it is already open", () => {
        const trigger = { nodeType: 1, ownerDocument: global.document };
        const detail = { trigger, tag: "bitcoin" };

        mockPopoverInstance.isOpen = mock.fn(() => true);

        controller.requestMenu(detail);

        assert.strictEqual(mockPopoverInstance.close.mock.calls.length, 1);
        assert.strictEqual(mockPopoverInstance.open.mock.calls.length, 0);
    });
  });

  describe("handleMenuAction", () => {
    it("should call service method, notify update, publish, and notify update again", async () => {
      const tag = "bitcoin";
      const action = TAG_PREFERENCE_ACTIONS.ADD_INTEREST;

      await controller.handleMenuAction(action, { tag });

      assert.strictEqual(mockHashtagPreferences.addInterest.mock.calls.length, 1);
      assert.strictEqual(mockHashtagPreferences.addInterest.mock.calls[0].arguments[0], tag);

      // onPreferenceUpdate should be called twice (optimistic + confirmed)
      assert.strictEqual(mockCallbacks.onPreferenceUpdate.mock.calls.length, 2);

      // publish should be called
      assert.strictEqual(mockHashtagPreferences.publish.mock.calls.length, 1);
    });

    it("should handle error and call showError", async () => {
        const tag = "bitcoin";
        const action = TAG_PREFERENCE_ACTIONS.ADD_INTEREST;

        mockHashtagPreferences.addInterest = mock.fn(() => {
            throw new Error("Service error");
        });

        await controller.handleMenuAction(action, { tag });

        assert.strictEqual(mockCallbacks.showError.mock.calls.length, 1);
        assert.match(mockCallbacks.showError.mock.calls[0].arguments[0], /Failed to update hashtag preferences/);
    });
  });

  describe("persistPreferencesFromMenu", () => {
      it("should call service.publish", async () => {
          await controller.persistPreferencesFromMenu();
          assert.strictEqual(mockHashtagPreferences.publish.mock.calls.length, 1);
      });

      it("should reuse in-flight promise", async () => {
          let resolvePublish;
          const slowPublish = new Promise((resolve) => { resolvePublish = resolve; });
          mockHashtagPreferences.publish = mock.fn(() => slowPublish);

          const p1 = controller.persistPreferencesFromMenu();
          // Ensure p1 is set before calling again
          assert.strictEqual(controller.publishInFlight, true);

          const p2 = controller.persistPreferencesFromMenu();

          // Wait for p1 to finish, but we want to assert equality of promises returned.
          // Note: p1 is the result of async IIFE.
          // Inside controller:
          // this.publishPromise = publishPromise;
          // return publishPromise;

          assert.strictEqual(p1, p2);
          assert.strictEqual(mockHashtagPreferences.publish.mock.calls.length, 1);

          resolvePublish(true);
          await p1;
      });
  });
});
