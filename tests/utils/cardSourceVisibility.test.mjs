import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../test-setup.mjs";
import { updateVideoCardSourceVisibility } from "../../js/utils/cardSourceVisibility.js";

describe("cardSourceVisibility", () => {
  let card;

  beforeEach(() => {
    card = document.createElement("div");
    card.classList.add("card");
    // Default state: not hidden, no health state set (so pending)
    card.hidden = false;
    // Clear any previous attributes
    delete card.dataset.urlHealthState;
    delete card.dataset.streamHealthState;
    delete card.dataset.ownerIsViewer;
    delete card.dataset.sourceVisibility;
  });

  describe("updateVideoCardSourceVisibility", () => {
    it("should handle null or undefined input gracefully", () => {
      assert.doesNotThrow(() => updateVideoCardSourceVisibility(null));
      assert.doesNotThrow(() => updateVideoCardSourceVisibility(undefined));
    });

    it("should resolve card from object with .card property", () => {
      const wrapper = { card: card };
      card.dataset.urlHealthState = "failed";
      card.dataset.streamHealthState = "failed";

      // Should hide because both failed
      updateVideoCardSourceVisibility(wrapper);
      assert.equal(card.hidden, true);
    });

    it("should always show card if owner is viewer", () => {
      card.dataset.ownerIsViewer = "true";
      // Set to failed state which would normally hide it
      card.dataset.urlHealthState = "failed";
      card.dataset.streamHealthState = "failed";
      card.hidden = true; // Start hidden to verify it unhides

      updateVideoCardSourceVisibility(card);

      assert.equal(card.hidden, false);
      assert.equal(card.dataset.sourceVisibility, "visible");
    });

    it("should show card if at least one source is healthy", () => {
        // Case 1: URL healthy
        card.dataset.urlHealthState = "healthy";
        card.dataset.streamHealthState = "failed";
        card.hidden = true;

        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, false);
        assert.equal(card.dataset.sourceVisibility, "visible");

        // Reset
        card.hidden = true;

        // Case 2: Stream healthy
        card.dataset.urlHealthState = "failed";
        card.dataset.streamHealthState = "healthy";

        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, false);
        assert.equal(card.dataset.sourceVisibility, "visible");
    });

    it("should show card if at least one source is checking/pending", () => {
        // Case 1: URL checking
        card.dataset.urlHealthState = "checking";
        card.dataset.streamHealthState = "failed";
        card.hidden = true;

        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, false);

        // Reset
        card.hidden = true;

        // Case 2: Stream checking
        card.dataset.urlHealthState = "failed";
        card.dataset.streamHealthState = "checking";

        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, false);

        // Reset
        card.hidden = true;

        // Case 3: Empty state (pending)
        delete card.dataset.urlHealthState; // undefined/empty means pending
        card.dataset.streamHealthState = "failed";

        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, false);
    });

    it("should hide card ONLY if both sources are failed (not healthy and not pending)", () => {
        card.dataset.urlHealthState = "failed";
        card.dataset.streamHealthState = "failed";
        card.hidden = false;

        updateVideoCardSourceVisibility(card);

        assert.equal(card.hidden, true);
        assert.equal(card.dataset.sourceVisibility, "hidden");
    });

    it("should recover from hidden state when source becomes healthy", () => {
        // First failed
        card.dataset.urlHealthState = "failed";
        card.dataset.streamHealthState = "failed";
        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, true);

        // Then healthy
        card.dataset.urlHealthState = "healthy";
        updateVideoCardSourceVisibility(card);
        assert.equal(card.hidden, false);
        assert.equal(card.dataset.sourceVisibility, "visible");
    });

    it("should check closest .card if element is not .card itself", () => {
        const container = document.createElement("div");
        container.classList.add("card");
        const inner = document.createElement("div");
        container.appendChild(inner);
        // We need to attach to DOM or mock closest if not attached?
        // JSDOM supports closest on detached elements too usually.

        // Fail state on container
        container.dataset.urlHealthState = "failed";
        container.dataset.streamHealthState = "failed";

        updateVideoCardSourceVisibility(inner);

        assert.equal(container.hidden, true);
    });
  });
});
