import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { VideoListView } from "../../js/ui/views/VideoListView.js";

test("VideoListView disposes health observers before replacing its card grid", () => {
  const dom = new JSDOM("<div id=grid></div>");
  const grid = dom.window.document.getElementById("grid");
  let healthDetaches = 0;
  let urlDetaches = 0;
  const view = new VideoListView({
    document: dom.window.document,
    badgeHelpers: {
      attachHealthBadges: () => () => { healthDetaches += 1; },
      attachUrlHealthBadges: () => () => { urlDetaches += 1; },
    },
  });
  view.mount(grid);
  const videos = [{ id: "one", title: "One", pubkey: "a", created_at: 1 }];

  view.render(videos);
  view.render([{ ...videos[0], title: "Updated", created_at: 2 }]);
  view.unmount();

  assert.equal(healthDetaches, 2, "rerender and unmount each detach health observers");
  assert.equal(urlDetaches, 2, "rerender and unmount each detach URL observers");
  dom.window.close();
});

test("VideoListView restores cards when a navigation remount clears unchanged feed markup", () => {
  const dom = new JSDOM("<div id=grid></div>");
  const grid = dom.window.document.getElementById("grid");
  const view = new VideoListView({ document: dom.window.document });
  const videos = [{ id: "for-you-one", title: "For You", pubkey: "a", created_at: 1 }];

  view.mount(grid);
  view.render(videos);
  assert.equal(grid.querySelectorAll('[data-component="video-card"]').length, 1);

  // Loading a view replaces #videoList. The data can still be identical when
  // returning to For You, so a signature-only cache must not skip the repaint.
  grid.innerHTML = '<div data-for-you-empty-state="true"></div>';
  view.render(videos);

  assert.equal(grid.querySelectorAll('[data-component="video-card"]').length, 1);
  assert.equal(grid.querySelector('[data-for-you-empty-state]'), null);
  dom.window.close();
});
