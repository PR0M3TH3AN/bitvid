import test from "node:test";
import assert from "node:assert/strict";
import "./test-setup.mjs";

import { setupModal } from "./video-modal-accessibility.test.mjs";

const RESTORE_BUTTON_LABEL = "Restore default moderation";

test("VideoModal blurs and restores playback when moderation overlay toggles", async (t) => {
  const { modal, cleanup } = await setupModal();
  const document = modal.document;
  const window = document.defaultView;

  try {
    await t.test("trusted reports blur the active video", async () => {
      const videoElement = modal.getVideoElement();
      assert.ok(videoElement, "modal video element should exist");

      let pauseCalls = 0;
      const originalPause = videoElement.pause;
      videoElement.pause = function patchedPause() {
        pauseCalls += 1;
        if (typeof originalPause === "function") {
          return originalPause.call(this);
        }
        return undefined;
      };

      const video = {
        id: "event-trusted-blur",
        title: "Blurred video",
        moderation: {
          blurThumbnail: true,
          trustedCount: 3,
          reporterDisplayNames: ["Alice", "Bob"],
          summary: {
            types: {
              nudity: { trusted: 3 },
            },
          },
        },
      };

      modal.open(video);

      const stage = document.querySelector(".video-modal__video");
      assert.ok(stage, "video stage should exist");
      assert.equal(stage.dataset.visualState, "blurred");

      const overlay = document.querySelector("[data-moderation-bar]");
      assert.ok(overlay, "moderation overlay should be rendered");
      assert.equal(overlay.hasAttribute("hidden"), false);

      assert.ok(pauseCalls > 0, "video pause should be invoked when blur is applied");

      const textEl = overlay.querySelector("[data-moderation-text]");
      assert.ok(textEl, "moderation text element should exist");
      assert.match(
        textEl.textContent,
        /blurred/i,
        "overlay text should describe the blur state",
      );

      let overrideEvent = null;
      let hideEvent = null;
      modal.addEventListener("video:moderation-override", (event) => {
        overrideEvent = event;
      });
      modal.addEventListener("video:moderation-hide", (event) => {
        hideEvent = event;
      });

      const showButton = overlay.querySelector(
        "[data-moderation-action='override']",
      );
      assert.ok(showButton, "Show anyway button should be present");
      showButton.click();

      assert.ok(overrideEvent, "clicking the CTA should emit override event");
      assert.equal(overrideEvent.detail.video, video);

      video.moderation.blurThumbnail = false;
      video.moderation.viewerOverride = { showAnyway: true };

      const overrideSignal = new window.CustomEvent("video:moderation-override", {
        detail: { video },
      });
      document.dispatchEvent(overrideSignal);

      assert.equal(stage.dataset.visualState, undefined);
      assert.equal(overlay.hasAttribute("hidden"), false);
      assert.equal(overlay.dataset.overlayState, "override");

      const restoreButton = document.querySelector(
        "[data-moderation-action='hide']",
      );
      assert.ok(
        restoreButton,
        "Restore default moderation button should be present after override",
      );
      assert.equal(
        restoreButton.textContent.trim(),
        RESTORE_BUTTON_LABEL,
        "Restore button should expose the new label",
      );

      restoreButton.click();

      assert.ok(hideEvent, "clicking restore should emit moderation hide event");
      assert.equal(hideEvent.detail.video, video);

      delete video.moderation.viewerOverride;
      video.moderation.blurThumbnail = true;

      const hideSignal = new window.CustomEvent("video:moderation-block", {
        detail: { video },
      });
      document.dispatchEvent(hideSignal);

      assert.equal(stage.dataset.visualState, "blurred");
      assert.equal(overlay.hasAttribute("hidden"), false);

      videoElement.pause = originalPause;
      modal.close();
    });

    await t.test("trusted mute blur state matches moderation context", async () => {
      const video = {
        id: "event-trusted-mute",
        title: "Trusted mute video",
        moderation: {
          blurThumbnail: true,
          trustedMuted: true,
          trustedMuteCount: 2,
          trustedMuteDisplayNames: ["Carol", "Dave"],
        },
      };

      modal.open(video);

      const stage = document.querySelector(".video-modal__video");
      assert.ok(stage, "video stage should exist");
      assert.equal(stage.dataset.visualState, "blurred");

      const overlay = document.querySelector("[data-moderation-bar]");
      assert.ok(overlay, "moderation overlay should be rendered");
      assert.equal(overlay.hasAttribute("hidden"), false);

      const badge = overlay.querySelector("[data-moderation-badge='true']");
      assert.ok(badge, "moderation badge should exist");
      assert.equal(badge.dataset.moderationState, "trusted-mute");

      modal.close();
    });
  } finally {
    await cleanup();
  }
});
