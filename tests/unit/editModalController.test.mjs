import { test, describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import EditModalController from "../../js/ui/editModalController.js";

describe("EditModalController", () => {
  let controller;
  let services, state, ui, callbacks, helpers;

  beforeEach(() => {
    services = {
      nostrService: {
        fetchVideos: mock.fn(async () => []),
        handleEditVideoSubmit: mock.fn(async () => {}),
      },
    };
    state = {
      getPubkey: mock.fn(() => "test-pubkey"),
      getBlacklistedEventIds: mock.fn(() => new Set()),
      getVideosMap: mock.fn(() => new Map()),
    };
    ui = {
      getEditModal: mock.fn(() => ({
        load: mock.fn(async () => {}),
        open: mock.fn(async () => {}),
        setSubmitState: mock.fn(),
        close: mock.fn(),
      })),
      showError: mock.fn(),
      showSuccess: mock.fn(),
    };
    callbacks = {
      loadVideos: mock.fn(async () => {}),
      forceRefreshAllProfiles: mock.fn(),
      isAuthorBlocked: mock.fn(() => false),
    };
    helpers = {
      normalizeActionTarget: mock.fn((t) => ({ triggerElement: null })),
      resolveVideoActionTarget: mock.fn(async () => ({
        id: "v1",
        pubkey: "test-pubkey",
      })),
    };

    controller = new EditModalController({
      services,
      state,
      ui,
      callbacks,
      helpers,
    });
  });

  describe("open()", () => {
    it("should resolve target and open modal if authorized", async () => {
      await controller.open("target");

      assert.strictEqual(helpers.normalizeActionTarget.mock.callCount(), 1);
      assert.strictEqual(services.nostrService.fetchVideos.mock.callCount(), 1);
      assert.strictEqual(helpers.resolveVideoActionTarget.mock.callCount(), 1);
      assert.strictEqual(ui.getEditModal.mock.callCount(), 1);

      const modal = ui.getEditModal.mock.calls[0].result;
      assert.strictEqual(modal.load.mock.callCount(), 1);
      assert.strictEqual(modal.open.mock.callCount(), 1);
    });

    it("should show error if not logged in", async () => {
      state.getPubkey = mock.fn(() => null);
      await controller.open("target");

      assert.strictEqual(ui.showError.mock.callCount(), 1);
      assert.match(ui.showError.mock.calls[0].arguments[0], /login/i);

      const modal = ui.getEditModal.mock.calls[0]?.result;
      if (modal) {
          assert.strictEqual(modal.open.mock.callCount(), 0);
      }
    });

    it("should show error if user does not own video", async () => {
      helpers.resolveVideoActionTarget = mock.fn(async () => ({
        id: "v1",
        pubkey: "other-pubkey",
      }));
      await controller.open("target");

      assert.strictEqual(ui.showError.mock.callCount(), 1);
      assert.match(ui.showError.mock.calls[0].arguments[0], /own/i);
    });

    it("should handle modal load errors", async () => {
      ui.getEditModal = mock.fn(() => ({
        load: mock.fn(async () => { throw new Error("Load failed"); }),
        open: mock.fn(async () => {}),
      }));

      await controller.open("target");

      assert.strictEqual(ui.showError.mock.callCount(), 1);
      assert.match(ui.showError.mock.calls[0].arguments[0], /initialize/i);
    });
  });

  describe("handleSubmit()", () => {
    it("should handle successful submission", async () => {
      const event = {
        detail: {
          originalEvent: {},
          updatedData: {},
        },
      };

      await controller.handleSubmit(event);

      assert.strictEqual(services.nostrService.handleEditVideoSubmit.mock.callCount(), 1);
      assert.strictEqual(callbacks.loadVideos.mock.callCount(), 1);
      assert.strictEqual(callbacks.forceRefreshAllProfiles.mock.callCount(), 1);
      assert.strictEqual(ui.showSuccess.mock.callCount(), 1);

      const modal = ui.getEditModal.mock.calls[0].result;
      assert.strictEqual(modal.close.mock.callCount(), 1);
    });

    it("should show error if not logged in", async () => {
      state.getPubkey = mock.fn(() => null);
      const event = {
        detail: {
          originalEvent: {},
          updatedData: {},
        },
      };

      await controller.handleSubmit(event);

      assert.strictEqual(ui.showError.mock.callCount(), 1);
      assert.strictEqual(services.nostrService.handleEditVideoSubmit.mock.callCount(), 0);
    });

    it("should handle submission errors", async () => {
        services.nostrService.handleEditVideoSubmit = mock.fn(async () => {
            throw new Error("Submit failed");
        });
        const event = {
            detail: {
              originalEvent: {},
              updatedData: {},
            },
        };

        await controller.handleSubmit(event);

        assert.strictEqual(ui.showError.mock.callCount(), 1);
        assert.match(ui.showError.mock.calls[0].arguments[0], /failed/i);

        const modal = ui.getEditModal.mock.calls[0].result;
        assert.strictEqual(modal.setSubmitState.mock.callCount(), 1);
        assert.deepStrictEqual(modal.setSubmitState.mock.calls[0].arguments[0], { pending: false });
    });
  });
});
