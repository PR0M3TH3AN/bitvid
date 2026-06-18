
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

// --- Hardened streaming behavior (audit follow-ups) ---

class SelectableFile {
    constructor(name, length) {
        this.name = name;
        this.length = length;
        this.selected = false;
        this.deselected = false;
    }
    select() { this.selected = true; }
    deselect() { this.deselected = true; }
    streamTo(elem) { elem.src = "blob:mock-stream"; }
}

class MultiFileTorrent extends EventEmitter {
    constructor(files, { numPeers = 1 } = {}) {
        super();
        this.files = files;
        this.numPeers = numPeers;
        this._opts = {};
    }
    destroy() {}
}

function freshClient() {
    const c = new TorrentClient();
    c.log = () => {};
    return c;
}

describe("TorrentClient streaming hardening", () => {
    it("streams the LARGEST playable file and deselects the rest (multi-file)", () => {
        const client = freshClient();
        const small = new SelectableFile("sample.mp4", 100);
        const big = new SelectableFile("feature.mp4", 100000);
        const other = new SelectableFile("readme.txt", 5);
        const torrent = new MultiFileTorrent([small, big, other]);
        const videoElement = new MockVideoElement();

        client.handleTorrentStream(torrent, videoElement, () => {}, () => {}, "chrome");

        assert.strictEqual(big.selected, true, "largest video file is selected");
        assert.strictEqual(small.deselected, true, "smaller video file is deselected");
        assert.strictEqual(other.deselected, true, "non-video file is deselected");
        assert.strictEqual(videoElement.src, "blob:mock-stream", "streamTo ran on the chosen file");
    });

    it("does NOT resolve until the video is actually ready to play", async () => {
        const client = freshClient();
        // streamTo here does NOT advance readyState or emit canplay.
        const file = { name: "v.mp4", length: 10, streamTo: (el) => { el.src = "blob:x"; } };
        const torrent = new MultiFileTorrent([file]);
        const videoElement = new MockVideoElement();

        let resolved = false;
        client.handleTorrentStream(torrent, videoElement, () => { resolved = true; }, () => {}, "chrome");

        await new Promise((r) => setTimeout(r, 20));
        assert.strictEqual(resolved, false, "no premature success while playback is not viable");
        assert.strictEqual(client.currentTorrent, torrent, "currentTorrent set up front so cleanup can tear it down");

        // Once real playback data arrives, it resolves.
        videoElement.emit("loadeddata");
        assert.strictEqual(resolved, true, "resolves once playback is viable");
    });

    it("pre-playback torrent error rejects (so the caller can fall back)", async () => {
        const client = freshClient();
        const file = { name: "v.mp4", length: 10, streamTo: (el) => { el.src = "blob:x"; } };
        const torrent = new MultiFileTorrent([file]);
        const videoElement = new MockVideoElement();

        let rejected = null;
        let resolved = false;
        client.handleTorrentStream(torrent, videoElement, () => { resolved = true; }, (e) => { rejected = e; }, "chrome");

        torrent.emit("error", new Error("swarm dead"));
        assert.ok(rejected, "rejects before playback starts");
        assert.strictEqual(resolved, false, "does not also resolve");
    });

    it("post-playback torrent error goes to onPlaybackError, not a dead reject", async () => {
        const client = freshClient();
        const file = { name: "v.mp4", length: 10, streamTo: (el) => { el.src = "blob:x"; } };
        const torrent = new MultiFileTorrent([file]);
        const videoElement = new MockVideoElement();

        const playbackErrors = [];
        let rejectedAfter = false;
        client.handleTorrentStream(
            torrent,
            videoElement,
            () => {},
            () => { rejectedAfter = true; },
            "chrome",
            { onPlaybackError: (e) => playbackErrors.push(e) }
        );

        videoElement.emit("canplay"); // becomes ready -> resolved
        torrent.emit("error", new Error("peers dropped"));

        assert.strictEqual(playbackErrors.length, 1, "post-start error surfaced via hook");
        assert.strictEqual(rejectedAfter, false, "promise was already settled; no dead reject");
    });

    it("surfaces a stall via onStall when playback buffers without progress", async () => {
        const client = freshClient();
        const file = { name: "v.mp4", length: 10, streamTo: (el) => { el.src = "blob:x"; } };
        const torrent = new MultiFileTorrent([file], { numPeers: 0 });
        const videoElement = new MockVideoElement();

        const stalls = [];
        client.handleTorrentStream(
            torrent,
            videoElement,
            () => {},
            () => {},
            "chrome",
            { onStall: (info) => stalls.push(info), stallMs: 15 }
        );

        videoElement.emit("canplay"); // ready
        videoElement.emit("waiting"); // buffering with no progress
        await new Promise((r) => setTimeout(r, 40));

        assert.strictEqual(stalls.length, 1, "stall surfaced once");
        assert.strictEqual(stalls[0].peers, 0, "stall reports current peer count");
    });

    it("clears the stall timer when playback progresses", async () => {
        const client = freshClient();
        const file = { name: "v.mp4", length: 10, streamTo: (el) => { el.src = "blob:x"; } };
        const torrent = new MultiFileTorrent([file]);
        const videoElement = new MockVideoElement();

        const stalls = [];
        client.handleTorrentStream(
            torrent, videoElement, () => {}, () => {}, "chrome",
            { onStall: (i) => stalls.push(i), stallMs: 30 }
        );
        videoElement.emit("canplay");
        videoElement.emit("waiting");
        await new Promise((r) => setTimeout(r, 10));
        videoElement.emit("timeupdate"); // progress -> clears the pending stall
        await new Promise((r) => setTimeout(r, 40));

        assert.strictEqual(stalls.length, 0, "no stall fired because playback resumed");
    });

    it("does not leak <video> listeners across streams (reused element)", () => {
        const client = freshClient();
        const videoElement = new MockVideoElement();
        const mk = () => new MultiFileTorrent([
            { name: "v.mp4", length: 10, streamTo: (el) => { el.src = "blob:x"; } },
        ]);

        client.handleTorrentStream(mk(), videoElement, () => {}, () => {}, "chrome");
        client.handleTorrentStream(mk(), videoElement, () => {}, () => {}, "chrome");
        client.handleTorrentStream(mk(), videoElement, () => {}, () => {}, "chrome");

        assert.strictEqual(
            videoElement.listenerCount("error"),
            1,
            "previous streams' error listeners are torn down (no accumulation)",
        );
    });
});
