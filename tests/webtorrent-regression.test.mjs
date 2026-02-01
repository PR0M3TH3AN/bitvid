
import "./test-helpers/setup-localstorage.mjs";
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

        // Simulate webseed connection if urlList is present
        if (opts && Array.isArray(opts.urlList) && opts.urlList.length > 0) {
            torrent.emit('wire', { type: 'webSeed' });
        }
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
    this.wires = [];

    // Simulate webseeds if provided in opts
    if (opts && Array.isArray(opts.urlList) && opts.urlList.length > 0) {
        // Create mock wires for webseeds
        this.wires = opts.urlList.map(url => ({ type: 'webSeed' }));

        // Emit wire events asynchronously to simulate connection
        setTimeout(() => {
            this.wires.forEach(wire => this.emit('wire', wire));
        }, 5);
    }
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
      timeoutMs: 1000, // Significantly increased timeout for CI robustness
      urlList: [webSeedUrl]
    });

    if (!result.healthy) {
      console.log("Failed result:", result);
    }

    // The simplified implementation treats webseeds as peers
    assert.strictEqual(result.healthy, true, "Should be healthy due to webseed");
    assert.strictEqual(result.reason, "peer", "Reason should be 'peer'");
    assert.ok(result.peers >= 1, "Should report at least 1 peer");

    // Verify that the client ACTUALLY received the webseed in the urlList
    // This ensures we don't regress on passing the parameter
    // Note: probePeers uses 'probeClient', not the main 'client'
    const torrent = client.probeClient.torrents[0];
    assert.ok(torrent, "Torrent should have been created");
    assert.ok(Array.isArray(torrent.opts.urlList), "urlList should be an array");
    assert.ok(torrent.opts.urlList.includes(webSeedUrl), "urlList should contain the webseed URL");
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
