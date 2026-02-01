
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import SimilarContentController from "../../js/ui/similarContentController.js";

describe("SimilarContentController", () => {
  let controller;
  let services;
  let callbacks;
  let ui;
  let state;
  let helpers;

  beforeEach(() => {
    services = {
      nostrClient: {
        getActiveVideos: mock.fn(() => []),
      },
    };
    callbacks = {
      isAuthorBlocked: mock.fn(() => false),
      decorateVideoModeration: mock.fn((v) => v),
      decorateVideoCreatorIdentity: mock.fn((v) => v),
    };
    ui = {
      videoModal: {
        setSimilarContent: mock.fn(),
        clearSimilarContent: mock.fn(),
      },
    };
    state = {
      getVideoListView: mock.fn(() => ({ currentVideos: [] })),
      getVideosMap: mock.fn(() => new Map()),
    };
    helpers = {
      getKnownVideoPostedAt: mock.fn(() => Date.now()),
      buildShareUrlFromEventId: mock.fn((id) => `https://example.com/v/${id}`),
      formatTimeAgo: mock.fn(() => "just now"),
    };

    controller = new SimilarContentController({
      services,
      callbacks,
      ui,
      state,
      helpers,
    });
  });

  describe("extractDTagValue", () => {
    it("should return the 'd' tag value", () => {
      const tags = [["e", "123"], ["d", "my-d-tag"]];
      const result = controller.extractDTagValue(tags);
      assert.strictEqual(result, "my-d-tag");
    });

    it("should return empty string if no 'd' tag", () => {
        const tags = [["e", "123"]];
        const result = controller.extractDTagValue(tags);
        assert.strictEqual(result, "");
    });
  });

  describe("computeCandidates", () => {
    it("should return empty array if no active video", () => {
      const result = controller.computeCandidates();
      assert.deepStrictEqual(result, []);
    });

    it("should compute similar candidates based on tags", () => {
        const activeVideo = {
            id: "active",
            displayTags: ["fun", "music"],
            pubkey: "abc"
        };
        const candidate1 = {
            id: "c1",
            displayTags: ["fun", "other"],
            pubkey: "def"
        };
        const candidate2 = {
            id: "c2",
            displayTags: ["boring"],
            pubkey: "ghi"
        };

        state.getVideoListView.mock.mockImplementationOnce(() => ({
            currentVideos: [candidate1, candidate2]
        }));

        const result = controller.computeCandidates({ activeVideo });

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].video.id, "c1");
        assert.strictEqual(result[0].sharedTagCount, 1);
    });

    it("should exclude blocked authors", () => {
        const activeVideo = { id: "active", displayTags: ["fun"] };
        const candidate1 = { id: "c1", displayTags: ["fun"], pubkey: "bad-guy" };

        state.getVideoListView.mock.mockImplementationOnce(() => ({
            currentVideos: [candidate1]
        }));

        callbacks.isAuthorBlocked.mock.mockImplementationOnce((pubkey) => pubkey === "bad-guy");

        const result = controller.computeCandidates({ activeVideo });
        assert.strictEqual(result.length, 0);
    });

    it("should prioritize higher shared tag count", () => {
        const activeVideo = { id: "active", displayTags: ["a", "b", "c"] };
        const candidate1 = { id: "c1", displayTags: ["a"] };
        const candidate2 = { id: "c2", displayTags: ["a", "b"] };

        state.getVideoListView.mock.mockImplementationOnce(() => ({
            currentVideos: [candidate1, candidate2]
        }));

        const result = controller.computeCandidates({ activeVideo });
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].video.id, "c2"); // 2 shared tags
        assert.strictEqual(result[1].video.id, "c1"); // 1 shared tag
    });
  });

  describe("updateModal", () => {
    it("should clear similar content if no active video", () => {
        controller.updateModal();
        assert.strictEqual(ui.videoModal.clearSimilarContent.mock.callCount(), 1);
    });

    it("should set similar content if matches found", () => {
        const activeVideo = { id: "active", displayTags: ["fun"] };
        const candidate1 = { id: "c1", displayTags: ["fun"] };

        state.getVideoListView.mock.mockImplementationOnce(() => ({
            currentVideos: [candidate1]
        }));

        controller.updateModal({ activeVideo });

        assert.strictEqual(ui.videoModal.setSimilarContent.mock.callCount(), 1);
        const args = ui.videoModal.setSimilarContent.mock.calls[0].arguments;
        assert.strictEqual(args[0].length, 1);
        assert.strictEqual(args[0][0].video.id, "c1");
    });

    it("should clear similar content if no matches found", () => {
        const activeVideo = { id: "active", displayTags: ["fun"] };
        const candidate1 = { id: "c1", displayTags: ["boring"] };

        state.getVideoListView.mock.mockImplementationOnce(() => ({
            currentVideos: [candidate1]
        }));

        controller.updateModal({ activeVideo });

        assert.strictEqual(ui.videoModal.clearSimilarContent.mock.callCount(), 1);
    });
  });

});
