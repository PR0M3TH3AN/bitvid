import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { VideoListView } from "../../js/ui/views/VideoListView.js";

function createViewDom() {
  const dom = new JSDOM(
    "<!DOCTYPE html><body><section><div id=\"recentVideoTags\" hidden></div><div id=\"videoList\"></div></section></body>"
  );
  const { document } = dom.window;
  const listRoot = document.getElementById("videoList");
  const tagsRoot = document.getElementById("recentVideoTags");
  return { dom, document, listRoot, tagsRoot };
}

test("VideoListView renders sorted popular tag pills", () => {
  const { document, listRoot, tagsRoot } = createViewDom();
  const view = new VideoListView({ document });
  view.mount(listRoot);
  view.setPopularTagsContainer(tagsRoot);

  const videos = [
    {
      id: "v1",
      title: "First",
      pubkey: "pub1",
      created_at: 3,
      nip71: { hashtags: ["Nostr", "Video"] },
    },
    {
      id: "v2",
      title: "Second",
      pubkey: "pub2",
      created_at: 2,
      tags: [
        ["t", "nostr"],
        ["t", "Learning"],
      ],
    },
    {
      id: "v3",
      title: "Third",
      pubkey: "pub3",
      created_at: 1,
      nip71: { hashtags: ["video"] },
    },
  ];

  view.render(videos);

  assert(tagsRoot);
  assert.equal(tagsRoot.hidden, false);
  const buttons = tagsRoot.querySelectorAll("button");
  assert.equal(buttons.length, 3);
  assert.deepEqual(
    Array.from(buttons, (button) => button.dataset.tag),
    ["Nostr", "Video", "Learning"],
  );
});

test("VideoListView hides popular tags when no tags are available", () => {
  const { document, listRoot, tagsRoot } = createViewDom();
  const view = new VideoListView({ document });
  view.mount(listRoot);
  view.setPopularTagsContainer(tagsRoot);

  view.render([
    {
      id: "v10",
      title: "Tagless",
      pubkey: "pub10",
      created_at: 10,
    },
  ]);

  assert(tagsRoot);
  assert.equal(tagsRoot.hidden, true);
  assert.equal(tagsRoot.childElementCount, 0);
});
