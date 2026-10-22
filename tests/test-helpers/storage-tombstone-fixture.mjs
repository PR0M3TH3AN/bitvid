import './setup-localstorage.mjs';
import assert from 'node:assert/strict';
import { NostrClient } from '../../js/nostr/client.js';
import { NostrService } from '../../js/services/nostrService.js';
import { getVideosMap, setVideosMap, getVideoSubscription, setVideoSubscription } from '../../js/state/appState.js';

export const filteredStorageKey = 'bitvid:filtered-videos:v1';
export const author = 'a'.repeat(64);
export function videoEvent(id, created_at, { root = 'target', deleted = false, pubkey = author, dTag = root, ...payload } = {}) {
  return {
    id, kind: 30078, pubkey, created_at,
    tags: [['t', 'video'], ['d', dTag]],
    content: JSON.stringify({ version: 3, title: id, url: 'https://example.invalid/video.mp4', mode: 'live', videoRootId: root, deleted, ...payload }),
  };
}
export const ids = videos => videos.map(video => video.id).sort();

export function tombstoneFixture(t, { persisted = [] } = {}) {
  const previous = { map: getVideosMap(), sub: getVideoSubscription(), storage: localStorage.getItem(filteredStorageKey) };
  setVideosMap(new Map()); setVideoSubscription(null);
  localStorage.setItem(filteredStorageKey, JSON.stringify(persisted));
  let networkAttempts = 0;
  const oldFetch = globalThis.fetch;
  const oldSocket = globalThis.WebSocket;
  globalThis.fetch = () => { networkAttempts++; throw new Error('Unexpected network'); };
  globalThis.WebSocket = class { constructor() { networkAttempts++; throw new Error('Unexpected socket'); } };
  const client = new NostrClient();
  // Virtualize unrelated metadata and IndexedDB IO, keeping all ingest,
  // tombstone, active/history, service and filtered-localStorage logic real.
  client.saveLocalData = () => {};
  client.populateNip71MetadataForVideos = async () => {};
  client.videoEventVerifier = async events => new Set(events.map(event => event.id));
  const channels = [];
  client._subscriptionManager = { subscribe(config) {
    const channel = { ...config, closed: false };
    channels.push(channel);
    return { close() { channel.closed = true; } };
  } };
  const service = new NostrService();
  service.nostrClient = client;
  service.moderationService = null;
  service.accessControl = { isHydrated: () => true, ensureReady: async () => {}, canAccess: video => video.title !== 'denied' };
  const notifications = [];
  const updates = [];
  const off = service.on('videos:updated', detail => updates.push(structuredClone(detail)));
  const load = (options = {}) => service.loadVideos({ onVideos: (videos, detail) => notifications.push({ videos: structuredClone(videos), ...detail }), ...options });
  t.after(() => {
    service.clearVideoSubscription(); off();
    setVideosMap(previous.map); setVideoSubscription(previous.sub);
    if (previous.storage === null) localStorage.removeItem(filteredStorageKey);
    else localStorage.setItem(filteredStorageKey, previous.storage);
    globalThis.fetch = oldFetch; globalThis.WebSocket = oldSocket;
    assert.equal(networkAttempts, 0, 'no real network attempted');
    assert.ok(channels.every(channel => channel.closed), 'subscriptions naturally closed');
  });
  return { client, service, channels, notifications, updates, load,
    async ingest(...events) {
      const channel = channels.at(-1);
      for (const event of events) channel.onEvent(event);
      await channel.onEose();
    },
    persisted: () => JSON.parse(localStorage.getItem(filteredStorageKey) || '[]'),
  };
}
