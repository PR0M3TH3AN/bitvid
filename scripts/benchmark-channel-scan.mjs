import { JSDOM } from 'jsdom';
import { performance } from 'perf_hooks';
import * as NostrTools from 'nostr-tools';

const dom = new JSDOM(`<!DOCTYPE html><body><div id="channelVideoList"></div></body>`, {
  url: "http://localhost/#view=channel-profile&npub=npub1test"
});

global.window = dom.window;
global.self = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.NodeList = dom.window.NodeList;
global.URLSearchParams = dom.window.URLSearchParams;
global.URL = dom.window.URL;
global.Blob = dom.window.Blob;
global.TextEncoder = dom.window.TextEncoder;
global.TextDecoder = dom.window.TextDecoder;
// global.crypto = dom.window.crypto; // Node has crypto

global.window.NostrTools = NostrTools;

// Mock requestIdleCallback
global.requestIdleCallback = (cb) => setTimeout(cb, 0);
global.cancelIdleCallback = (id) => clearTimeout(id);

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

// We need to mock AccessControl because it's called in refreshActiveChannelVideoGrid
// accessControl.ensureReady()
// It imports accessControl from js/accessControl.js
// We can try to rely on its default behavior or mock the module if necessary.
// But importing real modules is easier if they don't have heavy side effects.

// Import nostrClient
const { nostrClient } = await import('../js/nostrClientFacade.js');
// Import channelProfile
const channelProfile = await import('../js/channelProfile.js');

async function runBenchmark() {
  console.log("Setting up benchmark...");

  nostrClient.pool = {
    list: async () => [],
    ensureRelay: async () => {},
    get: async () => null,
  };
  nostrClient.relays = ["wss://relay.example.com"];

  // Populate rawEvents with many events
  const eventCount = 1000000;
  const targetPubkey = "0000000000000000000000000000000000000000000000000000000000000001";

  console.log(`Populating ${eventCount} events...`);
  const rawEvents = nostrClient.rawEvents;

  for (let i = 0; i < eventCount; i++) {
    const id = i.toString(16).padStart(64, '0');
    // Mix of target events and noise
    const isTarget = i % 1000 === 0;
    const pubkey = isTarget ? targetPubkey : id; // Unique pubkey for noise
    const event = {
      id,
      pubkey,
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000) - i,
      content: "{}",
      tags: []
    };
    rawEvents.set(id, event);
  }

  console.log(`Populated. Raw events size: ${rawEvents.size}`);

  // Setup test state
  channelProfile.__setChannelProfileTestState({ pubkey: targetPubkey });

  // Benchmark
  console.log("Starting benchmark...");
  const start = performance.now();

  // We call refreshActiveChannelVideoGrid which triggers the scan
  await channelProfile.refreshActiveChannelVideoGrid();

  const end = performance.now();
  console.log(`refreshActiveChannelVideoGrid took ${(end - start).toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
