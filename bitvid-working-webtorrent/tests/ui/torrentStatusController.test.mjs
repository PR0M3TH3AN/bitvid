import test from "node:test";
import assert from "node:assert/strict";
import TorrentStatusController from "../../js/ui/torrentStatusController.js";

test("TorrentStatusController throws if accessor is missing", (t) => {
  assert.throws(() => new TorrentStatusController({}), /accessor/);
});

test("TorrentStatusController updates video modal and calls onRemovePoster", (t) => {
  let modalState = {};
  let posterRemoved = false;

  const mockModal = {
    updateStatus: (msg) => { modalState.status = msg; },
    updateProgress: (msg) => { modalState.progress = msg; },
    updatePeers: (msg) => { modalState.peers = msg; },
    updateSpeed: (msg) => { modalState.speed = msg; },
    updateDownloaded: (msg) => { modalState.downloaded = msg; },
  };

  const onRemovePoster = (reason) => {
    posterRemoved = reason;
  };

  const controller = new TorrentStatusController({
    getVideoModal: () => mockModal,
    onRemovePoster
  });

  // Test basic update
  controller.update({
    ready: false,
    progress: 0.5,
    numPeers: 5,
    downloadSpeed: 1024 * 100, // 100 KB/s
    downloaded: 1024 * 1024 * 10, // 10 MB
    length: 1024 * 1024 * 100 // 100 MB
  });

  assert.equal(modalState.status, "Downloading");
  assert.equal(modalState.progress, "50.00%");
  assert.equal(modalState.peers, "Peers: 5");
  assert.equal(modalState.speed, "100.00 KB/s");
  assert.equal(modalState.downloaded, "10.00 MB / 100.00 MB");
  assert.equal(posterRemoved, "torrent-progress");

  // Test complete
  controller.update({
    ready: true,
    progress: 1,
    numPeers: 0,
    downloadSpeed: 0,
    downloaded: 1024 * 1024 * 100,
    length: 1024 * 1024 * 100
  });

  // It sets "Complete" then "Ready to play" if ready is true
  assert.equal(modalState.status, "Ready to play");
  assert.equal(modalState.progress, "100.00%");
  assert.equal(posterRemoved, "torrent-ready-flag");
});

test("TorrentStatusController handles missing modal gracefully", (t) => {
  const controller = new TorrentStatusController({ getVideoModal: () => null });
  assert.doesNotThrow(() => controller.update({ progress: 0.5 }));
});
