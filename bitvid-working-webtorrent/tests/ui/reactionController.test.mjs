import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import ReactionController from "../../js/ui/reactionController.js";

describe("ReactionController", () => {
  let controller;
  let mockReactionCounter;
  let mockVideoModal;
  let mockState;
  let mockCallbacks;
  let mockUi;

  beforeEach(() => {
    mockReactionCounter = {
      subscribe: (pointer, cb) => {
        return () => {};
      },
      publish: async () => ({ ok: true }),
    };

    mockVideoModal = {
      updateReactionSummary: () => {},
      setUserReaction: () => {},
    };

    mockUi = {
      getVideoModal: () => mockVideoModal,
      showError: () => {},
    };

    mockState = {
      getCurrentVideo: () => ({ id: "v1", pubkey: "p1" }),
      getCurrentVideoPointer: () => ["e", "v1"],
      getCurrentVideoPointerKey: () => "e:v1",
    };

    mockCallbacks = {
      isUserLoggedIn: () => true,
      normalizeHexPubkey: (val) => val,
      getPubkey: () => "user1",
    };

    controller = new ReactionController({
      services: { reactionCounter: mockReactionCounter },
      ui: mockUi,
      state: mockState,
      callbacks: mockCallbacks,
    });
  });

  it("should subscribe to reactions", (t) => {
    const subscribeMock = t.mock.method(mockReactionCounter, "subscribe");

    controller.subscribe(["e", "v1"], "e:v1");

    assert.strictEqual(subscribeMock.mock.callCount(), 1);
    assert.deepStrictEqual(subscribeMock.mock.calls[0].arguments[0], ["e", "v1"]);
  });

  it("should handle reaction update from subscription", (t) => {
    let subCallback;
    mockReactionCounter.subscribe = (pointer, cb) => {
      subCallback = cb;
      return () => {};
    };
    const updateSummaryMock = t.mock.method(mockVideoModal, "updateReactionSummary");

    controller.subscribe(["e", "v1"], "e:v1");
    // subscribe calls unsubscribe which calls resetState which calls updateReactionSummary (1st call)

    subCallback({
        total: 10,
        counts: { "+": 10 },
        reactions: { "user1": { content: "+" } }
    });
    // subCallback calls updateReactionSummary (2nd call)

    assert.strictEqual(updateSummaryMock.mock.callCount(), 2);
    assert.deepStrictEqual(updateSummaryMock.mock.calls[1].arguments[0], {
        total: 10,
        counts: { "+": 10, "-": 0 },
        userReaction: "+"
    });
  });

  it("should apply optimistic update on handleReaction", async (t) => {
    const updateSummaryMock = t.mock.method(mockVideoModal, "updateReactionSummary");
    const publishMock = t.mock.method(mockReactionCounter, "publish");

    // Pre-seed state
    controller.reactionState = {
        total: 5,
        counts: { "+": 5, "-": 0 },
        userReaction: ""
    };

    await controller.handleReaction({ reaction: "+" });

    // Verify optimistic update call
    // Should increment + count and total
    assert.strictEqual(updateSummaryMock.mock.callCount(), 1);
    const updateArgs = updateSummaryMock.mock.calls[0].arguments[0];
    assert.strictEqual(updateArgs.total, 6);
    assert.strictEqual(updateArgs.counts["+"], 6);
    assert.strictEqual(updateArgs.userReaction, "+");

    // Verify publish call
    assert.strictEqual(publishMock.mock.callCount(), 1);
  });

  it("should rollback optimistic update on publish failure", async (t) => {
    mockReactionCounter.publish = async () => ({ ok: false });
    const updateSummaryMock = t.mock.method(mockVideoModal, "updateReactionSummary");

    // We need to update controller.ui.showError because constructor copied the reference
    const showErrorMock = t.mock.method(mockUi, "showError");
    controller.ui.showError = showErrorMock;

    controller.reactionState = {
        total: 5,
        counts: { "+": 5, "-": 0 },
        userReaction: ""
    };

    await controller.handleReaction({ reaction: "+" });

    // 1st call: optimistic update
    // 2nd call: restore snapshot
    assert.strictEqual(updateSummaryMock.mock.callCount(), 2);

    // Restore check
    const restoreArgs = updateSummaryMock.mock.calls[1].arguments[0];
    assert.strictEqual(restoreArgs.total, 5);
    assert.strictEqual(restoreArgs.counts["+"], 5);
    assert.strictEqual(restoreArgs.userReaction, "");

    assert.strictEqual(showErrorMock.mock.callCount(), 1);
  });

  it("should not react if user not logged in", async (t) => {
    // Update callback on controller instance
    controller.callbacks.isUserLoggedIn = () => false;

    const showErrorMock = t.mock.method(mockUi, "showError");
    controller.ui.showError = showErrorMock;

    const publishMock = t.mock.method(mockReactionCounter, "publish");

    await controller.handleReaction({ reaction: "+" });

    assert.strictEqual(showErrorMock.mock.callCount(), 1);
    assert.strictEqual(publishMock.mock.callCount(), 0);
  });
});
