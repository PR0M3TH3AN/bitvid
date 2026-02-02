import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { VideoListView } from "../../js/ui/views/VideoListView.js";

function createViewDom() {
  const dom = new JSDOM(
    "<!DOCTYPE html><body><section><div id=\"videoList\"></div></section></body>",
  );
  const { document } = dom.window;
  const listRoot = document.getElementById("videoList");
  return { dom, document, listRoot };
}

test("VideoListView sorts cards by original posted timestamp", () => {
  const { document, listRoot } = createViewDom();
  const view = new VideoListView({
    document,
    utils: {
      dedupeVideos: (videos) => (Array.isArray(videos) ? [...videos] : []),
      getKnownVideoPostedAt: (video) =>
        Number.isFinite(video?.rootCreatedAt) ? Math.floor(video.rootCreatedAt) : null,
    },
  });

  view.mount(listRoot);

  const videos = [
    {
      id: "video-a",
      title: "Edited Upload",
      created_at: 200,
      rootCreatedAt: 100,
    },
    {
      id: "video-b",
      title: "Recent Upload",
      created_at: 150,
      rootCreatedAt: 150,
    },
    {
      id: "video-c",
      title: "Vintage Upload",
      created_at: 140,
      rootCreatedAt: 90,
    },
  ];

  view.render(videos);

  assert.deepEqual(
    view.currentVideos.map((video) => video.id),
    ["video-b", "video-a", "video-c"],
  );

  const nodes = listRoot.querySelectorAll('[data-component="video-card"]');
  assert.equal(nodes.length, 3);
  assert.deepEqual(
    Array.from(nodes, (node) => node.dataset.videoId),
    ["video-b", "video-a", "video-c"],
  );
});

