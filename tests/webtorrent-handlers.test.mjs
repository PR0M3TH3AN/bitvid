
import "./test-helpers/setup-localstorage.mjs";
import { test, describe, it, before, after } from "node:test";
import assert from "node:assert";
import EventEmitter from "events";
import { TorrentClient } from "../js/webtorrent.js";

// Mock JSDOM-like environment if needed
if (!global.window) {
    global.window = new EventEmitter();
    global.window.navigator = { userAgent: "Node" };
}

class MockFile {
    constructor(name) {
        this.name = name;
    }
    streamTo(elem, opts) {
        elem.opts = opts; // Capture opts for verification
        elem.src = "blob:mock-stream";
        // Simulate ready state progression
        setTimeout(() => {
             elem.readyState = 3;
             elem.emit('canplay');
             elem.emit('loadeddata');
        }, 10);
    }
}

class MockTorrent extends EventEmitter {
    constructor(magnet, opts) {
        super();
        this.magnet = magnet;
        this.files = [new MockFile("video.mp4")];
        this._opts = opts || {};
    }
    destroy() {}
}

class MockVideoElement extends EventEmitter {
    constructor() {
        super();
        this.playCalled = false;
        this.crossOrigin = null;
        this.readyState = 0;
        this.muted = false;
        this.error = null;
    }
    play() {
        this.playCalled = true;
        return Promise.resolve();
    }
    addEventListener(event, handler, opts) {
        this.on(event, handler);
    }
    removeEventListener(event, handler) {
        this.off(event, handler);
    }
}

describe("TorrentClient Handlers", () => {
    let client;
    let videoElement;
    let torrent;

    before(() => {
        client = new TorrentClient();
        // Silence logs for tests
        client.log = () => {};
    });

    it("handleTorrentStream (chrome) should set up video correctly", async () => {
        videoElement = new MockVideoElement();
        torrent = new MockTorrent("magnet:?xt=urn:btih:test");

        await new Promise((resolve, reject) => {
            client.handleTorrentStream(torrent, videoElement, resolve, reject, "chrome");
        });

        // Wait for events to fire
        await new Promise(r => setTimeout(r, 20));

        assert.strictEqual(videoElement.crossOrigin, "anonymous", "crossOrigin should be anonymous");
        assert.strictEqual(videoElement.playCalled, true, "play() should be called");
        assert.ok(videoElement.src, "src should be set");
        assert.strictEqual(client.currentTorrent, torrent, "currentTorrent should be set");
    });

    it("handleTorrentStream (firefox) should set up video correctly with highWaterMark", async () => {
        videoElement = new MockVideoElement();
        torrent = new MockTorrent("magnet:?xt=urn:btih:test");

        await new Promise((resolve, reject) => {
            client.handleTorrentStream(torrent, videoElement, resolve, reject, "firefox");
        });

        // Wait for events to fire
        await new Promise(r => setTimeout(r, 20));

        assert.strictEqual(videoElement.crossOrigin, "anonymous", "crossOrigin should be anonymous");
        assert.strictEqual(videoElement.playCalled, true, "play() should be called");
        assert.ok(videoElement.src, "src should be set");
        // Check options directly on videoElement which our mock sets
        assert.ok(videoElement.opts, "opts should be set");
        assert.strictEqual(videoElement.opts.highWaterMark, 256 * 1024, "highWaterMark should be set for Firefox");
        assert.strictEqual(client.currentTorrent, torrent, "currentTorrent should be set");
    });

    it("handleTorrentStream (chrome) should handle CORS warning logic", () => {
        videoElement = new MockVideoElement();
        torrent = new MockTorrent("magnet:?xt=urn:btih:test", {
            urlList: ["http://distribution.bbb3d.renderfarming.net/video.mp4", "http://good.com/video.mp4"],
            announce: ["ws://fastcast.nz", "ws://good.com"]
        });

        // We don't await because we are testing the event listener setup which happens synchronously
        // But we need a dummy resolve/reject
        client.handleTorrentStream(torrent, videoElement, () => {}, () => {}, "chrome");

        // Emit warning
        torrent.emit('warning', { message: 'CORS policy' });

        assert.strictEqual(torrent._opts.urlList.length, 1, "Should filter urlList");
        assert.strictEqual(torrent._opts.urlList[0], "http://good.com/video.mp4", "Should keep good url");
        assert.strictEqual(torrent._opts.announce.length, 1, "Should filter announce");
        assert.strictEqual(torrent._opts.announce[0], "ws://good.com", "Should keep good tracker");
    });
});
