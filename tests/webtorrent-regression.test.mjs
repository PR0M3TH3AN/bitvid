
import { test, describe, it, after, before } from "node:test";
import assert from "node:assert";
import EventEmitter from "events";
import { TorrentClient } from "../js/webtorrent.js";

// Mock WebTorrent class
class MockWebTorrent extends EventEmitter {
  constructor() {
    super();
    this.torrents = [];
    this.setMaxListeners = () => {};
  }

  add(magnet, opts, cb) {
    const torrent = new MockTorrent(magnet, opts);
    this.torrents.push(torrent);

    setTimeout(() => {
        if (typeof cb === 'function') cb(torrent);
        this.emit('torrent', torrent);
    }, 10);

    return torrent;
  }

  destroy(cb) {
      if (typeof cb === 'function') cb();
  }
}

class MockTorrent extends EventEmitter {
  constructor(magnet, opts) {
    super();
    this.magnet = magnet;
    this.opts = opts;
    this.numPeers = 0;
    this.files = [];
  }

  destroy(opts, cb) {
      if (typeof cb === 'function') cb();
  }
}

describe("WebTorrent Regression Tests", () => {
  before(() => {
    if (typeof global.window === "undefined") {
      global.window = {};
    }
    if (typeof global.window.location === "undefined") {
      global.window.location = { hostname: "localhost" };
    }
    if (typeof global.navigator === "undefined") {
      global.navigator = { userAgent: "node" };
    }
  });

  it("probePeers should report healthy if webseed is present even with 0 peers", async () => {
    const client = new TorrentClient({ webTorrentClass: MockWebTorrent });
    const magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";
    const webSeedUrl = "http://localhost:8080/video.mp4";

    const result = await client.probePeers(magnet, {
      timeoutMs: 500, // Increased timeout to prevent CI flakiness
      urlList: [webSeedUrl]
    });

    assert.strictEqual(result.webseedOnly, true, "Should detect webseed only scenario");
    assert.strictEqual(result.healthy, true, "Should be healthy due to webseed");
    assert.strictEqual(result.reason, "webseed", "Reason should be 'webseed'");
  });

  it("probePeers should report unhealthy if no webseed and 0 peers", async () => {
    const client = new TorrentClient({ webTorrentClass: MockWebTorrent });
    const magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";

    // Adding tracker to avoid "no-trackers" immediate return
    const magnetWithTr = magnet + "&tr=wss://tracker.example.com";

    const result = await client.probePeers(magnetWithTr, {
      timeoutMs: 50,
      urlList: []
    });

    assert.strictEqual(result.webseedOnly, false, "Should not be webseed only");
    assert.strictEqual(result.healthy, false, "Should be unhealthy");
    assert.strictEqual(result.reason, "timeout", "Reason should be 'timeout'");
  });
});
