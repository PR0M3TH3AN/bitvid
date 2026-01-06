// Run with: node tests/discussion-count-service.test.mjs

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import DiscussionCountService, {
  COUNT_UNSUPPORTED_TITLE,
} from "../js/services/discussionCountService.js";
import { COMMENT_EVENT_KIND } from "../js/nostr/commentEvents.js";

function createDomWithCountElement(videoId) {
  const dom = new JSDOM(`
    <div id="root">
      <div data-discussion-count="${videoId}" data-count-state="idle">
        <span data-discussion-count-value>0</span>
      </div>
    </div>
  `);
  const document = dom.window.document;
  const container = document.getElementById("root");
  const target = container.querySelector(
    `[data-discussion-count="${videoId}"]`
  );
  return { dom, document, container, target };
}

async function testRefreshCountsCachesResults() {
  const video = {
    id: "count-video-1",
    tags: [["d", "identifier-1"]],
    pubkey: "pubkey-1",
    kind: 30078,
  };
  const { container, target } = createDomWithCountElement(video.id);
  const service = new DiscussionCountService();
  const nostrClient = {
    pool: {},
    countEventsAcrossRelays: async (filters) => {
      assert.equal(filters.length, 3, "should request id, uppercase, and address filters");
      const [eventFilter, uppercaseFilter, addressFilter] = filters;
      assert.deepEqual(eventFilter, {
        kinds: [COMMENT_EVENT_KIND],
        "#E": ["count-video-1"],
      });
      assert.deepEqual(uppercaseFilter, {
        kinds: [COMMENT_EVENT_KIND],
        "#A": ["30078:pubkey-1:identifier-1"],
        "#K": ["30078"],
        "#P": ["pubkey-1"],
      });
      assert.deepEqual(addressFilter, {
        kinds: [COMMENT_EVENT_KIND],
        "#A": ["30078:pubkey-1:identifier-1"],
      });
      return {
        total: 5,
        perRelay: [{ ok: true }],
      };
    },
  };

  service.refreshCounts([video], {
    videoListRoot: container,
    nostrClient,
  });

  const inFlight = service.inFlightDiscussionCounts.get(video.id);
  assert.ok(inFlight, "refresh should record an in-flight request");
  await inFlight;

  assert.equal(
    service.getCachedCount(video.id),
    5,
    "successful responses should be cached"
  );
  assert.equal(
    target.dataset.countState,
    "ready",
    "DOM should transition to ready after a successful fetch"
  );
  assert.equal(
    target.querySelector("[data-discussion-count-value]").textContent,
    "5",
    "count value should reflect the fetched total"
  );

  let callCount = 0;
  nostrClient.countEventsAcrossRelays = async () => {
    callCount += 1;
    return { total: 99, perRelay: [{ ok: true }] };
  };

  service.refreshCounts([video], {
    videoListRoot: container,
    nostrClient,
  });

  assert.equal(
    callCount,
    0,
    "cached videos should not trigger additional COUNT queries"
  );
  assert.equal(
    target.querySelector("[data-discussion-count-value]").textContent,
    "5",
    "cached values should remain visible without pending states"
  );
}

async function testUnsupportedRelaysUpdateDomState() {
  const video = {
    id: "unsupported-video",
    tags: [["d", "identifier-2"]],
    pubkey: "pubkey-2",
    kind: 30078,
  };
  const { container, target } = createDomWithCountElement(video.id);
  const service = new DiscussionCountService();
  const nostrClient = {
    pool: {},
    countEventsAcrossRelays: async (filters) => {
      assert.equal(filters.length, 3, "unsupported relays should still receive all filters");
      const [eventFilter, uppercaseFilter, addressFilter] = filters;
      assert.deepEqual(eventFilter, {
        kinds: [COMMENT_EVENT_KIND],
        "#E": ["unsupported-video"],
      });
      assert.deepEqual(uppercaseFilter, {
        kinds: [COMMENT_EVENT_KIND],
        "#A": ["30078:pubkey-2:identifier-2"],
        "#K": ["30078"],
        "#P": ["pubkey-2"],
      });
      assert.deepEqual(addressFilter, {
        kinds: [COMMENT_EVENT_KIND],
        "#A": ["30078:pubkey-2:identifier-2"],
      });
      return {
        total: 7,
        perRelay: [{ ok: false }],
      };
    },
  };

  service.refreshCounts([video], {
    videoListRoot: container,
    nostrClient,
  });

  const inFlight = service.inFlightDiscussionCounts.get(video.id);
  assert.ok(inFlight, "unsupported relays should still trigger in-flight tracking");
  await inFlight;

  assert.equal(
    service.getCachedCount(video.id),
    undefined,
    "unsupported relay responses should not populate the cache"
  );
  assert.equal(
    target.dataset.countState,
    "unsupported",
    "DOM should flag unsupported relays for COUNT queries"
  );
  assert.equal(
    target.querySelector("[data-discussion-count-value]").textContent,
    "—",
    "unsupported states should render an em dash for the count value"
  );
  assert.equal(
    target.getAttribute("title"),
    COUNT_UNSUPPORTED_TITLE,
    "unsupported states should expose a descriptive tooltip"
  );
}

await testRefreshCountsCachesResults();
await testUnsupportedRelaysUpdateDomState();

console.log("discussion-count-service tests passed");
