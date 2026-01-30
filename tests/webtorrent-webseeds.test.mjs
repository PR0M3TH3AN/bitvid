
import test from "node:test";
import assert from "node:assert/strict";

// Setup globals required by webtorrent.js
if (typeof self === 'undefined') global.self = global;
if (typeof navigator === 'undefined') {
  global.navigator = {
    userAgent: 'test',
    serviceWorker: {
      register: async () => ({ active: true }),
      ready: Promise.resolve({ active: true }),
      controller: { postMessage: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  };
}
if (typeof window === 'undefined') {
    global.window = {
        location: { hostname: 'localhost', origin: 'http://localhost' },
        isSecureContext: true,
        navigator: global.navigator
    }
}
if (typeof global.location === 'undefined') {
    global.location = global.window.location;
}

// Import dynamic to ensure globals are set
const { TorrentClient } = await import('../js/webtorrent.js');

class MockWebTorrent {
  constructor() {
    this.torrents = [];
  }
  add(magnet, opts, cb) {
    this.lastAdd = { magnet, opts };
    const torrent = {
        on: () => {},
        files: [{name: 'video.mp4', streamTo: () => {}}],
        once: () => {},
        destroy: () => {},
    };
    if (cb) cb(torrent);
    return torrent;
  }
  destroy() {}
  createServer() {}
}

test("streamVideo merges magnet web seeds with explicit web seeds", async () => {
  const client = new TorrentClient({ webTorrentClass: MockWebTorrent });
  client.serviceWorkerDisabled = true;

  const magnet = 'magnet:?xt=urn:btih:123&ws=http://magnet-seed.com/file.mp4';
  const urlList = ['http://direct-url.com/video.mp4'];

  const videoElement = {
      play: async () => {},
      addEventListener: () => {},
      muted: false,
      crossOrigin: null // streamVideo sets this
  };

  try {
      await client.streamVideo(magnet, videoElement, { urlList });
  } catch (e) {
      console.log(e);
  }

  const lastAdd = client.client.lastAdd;

  assert.ok(lastAdd.opts.urlList.includes('http://magnet-seed.com/file.mp4'), "Magnet web seed missing");
  assert.ok(lastAdd.opts.urlList.includes('http://direct-url.com/video.mp4'), "Explicit web seed missing");
});
