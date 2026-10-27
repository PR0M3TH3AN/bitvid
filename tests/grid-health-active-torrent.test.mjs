import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import './test-helpers/setup-localstorage.mjs';
const root = new URL('../', import.meta.url).href;
const { torrentClient } = await import(`${root}js/webtorrent.js`);
const { attachHealthBadges } = await import(`${root}js/gridHealth.js`);
const { readTorrentProbeFromStorage } = await import(`${root}js/utils/storage.js`);
const { getCardLivenessPolicy, setCardLivenessPolicy } = await import(`${root}js/constants.js`);
const turn = () => new Promise(resolve => setImmediate(resolve));
let nextHash = 100000;
const magnet = () => `magnet:?xt=urn:btih:${(nextHash++).toString(16).padStart(40, '0')}`;

class Clock {
  now = 0; next = 1; jobs = new Map();
  add(fn, ms, interval = false) {
    const id = this.next++;
    this.jobs.set(id, { fn, ms, at: this.now + ms, interval });
    return id;
  }
  tick(ms) {
    const end = this.now + ms;
    let steps = 0;
    while (true) {
      const entry = [...this.jobs].filter(([, job]) => job.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!entry) break;
      assert.ok(++steps < 1000, 'fake clock must remain bounded');
      const [id, job] = entry;
      this.now = job.at;
      if (job.interval) job.at += job.ms;
      else this.jobs.delete(id);
      job.fn();
    }
    this.now = end;
  }
  counts() {
    const all = [...this.jobs.values()];
    return { timeout: all.filter(x => !x.interval && x.ms > 0).length,
      poll: all.filter(x => x.interval).length,
      teardown: all.filter(x => !x.interval && x.ms === 0).length };
  }
}

function fixture(t) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.invalid' });
  Object.defineProperty(dom.window, 'innerHeight', { value: 20 });
  const names = ['window', 'document', 'HTMLElement', 'localStorage', 'IntersectionObserver',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'WebSocket', 'AbortController'];
  const saved = new Map(names.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousPolicy = getCardLivenessPolicy();
  const clock = new Clock();
  const config = {};
  // Isolate persistence IO: JSDOM StorageImpl schedules unrelated storage-event timers.
  // Production read/writeTorrentProbeToStorage still executes against this map.
  const store = new Map();
  const writes = [];
  const memoryStorage = { getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); store.set(String(key), String(value)); },
    removeItem: key => store.delete(key), clear: () => store.clear() };
  const observers = [], torrents = [], calls = [], disposals = [], updates = [], timeline = [];
  let networkAttempts = 0, peak = 0;
  class Observer {
    constructor(callback) { this.callback = callback; this.cards = []; observers.push(this); }
    observe(card) { this.cards.push(card); }
    takeRecords() { return []; }
    disconnect() { this.disconnected = true; }
    show() {
      this.callback(this.cards.map((target, index) => ({ target, isIntersecting: true,
        intersectionRatio: 1, intersectionRect: { top: index * 20, width: 100, height: 20 } })));
    }
  }
  class FakeTorrent extends EventEmitter {
    constructor(source, options) {
      super(); this.source = source; this.options = options; this.numPeers = 0;
      this.destroyed = false; this.destroyCount = 0; this.emitting = false;
    }
    on(event, listener) {
      super.on(event, listener);
      if (config.syncEvent === event && !this.syncEmitted) {
        this.syncEmitted = true;
        if (event === 'wire') this.wire(); else this.error();
      }
      return this;
    }
    destroy(options) {
      assert.deepEqual(options, { destroyStore: true });
      this.destroyedDuringEvent = this.emitting;
      this.destroyedDuringAdd = config.adding === true;
      this.destroyed = true; this.destroyCount++;
      if (config.throwDestroy) throw new Error('controlled destroy exception');
      this.removeAllListeners();
      timeline.push(['destroy', this.source, clock.now]);
    }
    wire() { this.numPeers = 1; this.emitting = true;
      try { this.emit('wire', {}); } finally { this.emitting = false; } }
    error() { this.emit('error', new Error('controlled fake torrent error')); }
  }
  class FakeClient {
    constructor() { config.onConstruct?.(); }
    setMaxListeners() {}
    destroy() { assert.fail('shared probe client must never be destroyed'); }
    add(source, options) {
      if (config.throwAdd) throw new Error('controlled add exception');
      const torrent = new FakeTorrent(source, options);
      torrents.push(torrent);
      peak = Math.max(peak, torrents.filter(x => !x.destroyed).length);
      timeline.push(['add', source, clock.now]);
      config.adding = true;
      try { config.onAdd?.(torrent); } finally { config.adding = false; }
      return torrent;
    }
  }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, localStorage: memoryStorage,
    IntersectionObserver: Observer,
    setTimeout: (fn, ms = 0) => clock.add(fn, ms), clearTimeout: id => clock.jobs.delete(id),
    setInterval: (fn, ms) => clock.add(fn, ms, true), clearInterval: id => clock.jobs.delete(id),
    fetch: () => { networkAttempts++; throw new Error('network forbidden'); },
    WebSocket: class { constructor() { networkAttempts++; throw new Error('network forbidden'); } }
  });
  const savedClient = { probeClient: torrentClient.probeClient, WebTorrentClass: torrentClient.WebTorrentClass,
    probePeers: torrentClient.probePeers };
  torrentClient.probeClient = null;
  torrentClient.WebTorrentClass = FakeClient;
  // Transparent measurement wrapper: execute the actual production method, do not stub its logic.
  torrentClient.probePeers = function(source, options, lifecycle) {
    const call = { source, options, lifecycle, settled: false, result: undefined };
    calls.push(call);
    return savedClient.probePeers.call(this, source, options, lifecycle).then(result => {
      call.settled = true; call.result = result; return result;
    });
  };
  setCardLivenessPolicy('show-pending');
  function feed(sources) {
    const container = document.createElement('section');
    const cards = sources.map(source => {
      const card = document.createElement('article');
      card.className = 'card'; card.dataset.videoId = source; card.dataset.magnet = source;
      const badge = document.createElement('span'); badge.className = 'torrent-health-badge';
      card.append(badge); container.append(card); return card;
    });
    document.body.append(container);
    const events = [];
    const dispose = attachHealthBadges(container, { onUpdate: event => { events.push(event); updates.push(event); } });
    disposals.push(dispose);
    return { container, cards, dispose, events, observer: observers.at(-1),
      show() { this.observer.show(); } };
  }
  const cache = source => readTorrentProbeFromStorage(source.match(/btih:([a-f0-9]{40})/)[1]);
  const snapshot = source => ({ started: torrents.length, activeTorrents: torrents.filter(x => !x.destroyed).length,
    destroyed: torrents.filter(x => x.destroyed).length,
    listeners: torrents.reduce((n, t) => n + t.eventNames().reduce((m, e) => m + t.listenerCount(e), 0), 0),
    unsettled: calls.filter(x => !x.settled).length, timers: clock.counts(),
    cache: source ? cache(source) : undefined, peak, networkAttempts });
  async function drain() { await turn(); clock.tick(0); await turn(); }
  async function cleanup() {
    disposals.forEach(dispose => dispose());
    for (let i = 0; i < 10 && (calls.some(x => !x.settled) || clock.jobs.size); i++) {
      torrents.filter(x => !x.destroyed).forEach(t => t.wire());
      await drain();
    }
    const final = snapshot();

    try {
      assert.equal(final.activeTorrents, 0); assert.equal(final.unsettled, 0);
      assert.equal(final.listeners, 0); assert.equal(clock.jobs.size, 0);
      assert.equal(networkAttempts, 0);
      assert.ok(torrents.every(x => x.destroyCount === 1), 'destroy exactly once');
      assert.ok(torrents.every(x => !x.destroyedDuringEvent && !x.destroyedDuringAdd), 'destroy after event/add unwind');
      assert.ok(calls.every(x => !x.lifecycle?.cancelActive), 'cancel hook removed');
    } finally {
      Object.assign(torrentClient, savedClient);
      setCardLivenessPolicy(previousPolicy);
      dom.window.close();
      for (const [key, desc] of saved) {
        if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key];
      }
    }
  }
  t.after(cleanup);
  return { feed, cache, snapshot, drain, clock, torrents, calls, timeline, config, writes,
    probe: (source, lifecycle) => torrentClient.probePeers(source, { timeoutMs: 20000 }, lifecycle),
    get peak() { return peak; } };
}

const cases = [
  ['final-owner-cleanup', async f => {
    const source = magnet(), feed = f.feed([source]); feed.show();
    assert.equal(f.torrents.length, 1);
    feed.dispose(); await f.drain();
    assert.equal(f.snapshot().activeTorrents, 0, 'last owner must not retain an active torrent');
    assert.equal(f.snapshot().unsettled, 0, 'last owner must settle without original timeout');
    assert.equal(f.calls[0].result, null);
    assert.equal(f.calls[0].lifecycle.cancelActive, null);
    assert.equal(f.clock.jobs.size, 0);
    assert.equal(f.cache(source), null);
  }],
  ['disposed-late-success-no-cache', async f => {
    const source = magnet(), feed = f.feed([source]); feed.show(); feed.dispose();
    f.torrents[0].wire(); await f.drain();
    assert.equal(feed.cards[0].dataset.streamHealthState, 'checking', 'stale badge guard retained');
    assert.equal(f.cache(source), null, 'obsolete active completion must not populate persistent cache');
  }],
  ['same-turn-fresh-rejoin', async f => {
    const source = magnet(), old = f.feed([source]); old.show(); old.dispose();
    const replacement = f.feed([source]); replacement.show();
    await f.drain();
    assert.equal(f.calls.length, 2, 'new same-turn owner must start a fresh probe');
  }],
  ['later-fresh-rejoin', async f => {
    const source = magnet(), old = f.feed([source]); old.show(); old.dispose(); await f.drain();
    const replacement = f.feed([source]); replacement.show(); await f.drain();
    assert.equal(f.calls.length, 2, 'new later owner must start a fresh probe');
  }],
  ['disposal-releases-fifo-capacity', async f => {
    const active = Array.from({ length: 4 }, () => f.feed([magnet()])); active.forEach(x => x.show());
    const queued = f.feed([magnet()]); queued.show(); assert.equal(f.calls.length, 4);
    active[0].dispose(); await f.drain();
    assert.equal(f.calls.length, 5, 'queued live owner must gain released obsolete active capacity');
    assert.ok(f.peak <= 4);
  }],
  ['shared-live-owner', async f => {
    const source = magnet(), old = f.feed([source]), live = f.feed([source]); old.show(); live.show();
    assert.equal(f.calls.length, 1); old.dispose(); await f.drain();
    assert.equal(f.snapshot().activeTorrents, 1); assert.equal(f.snapshot().timers.timeout, 1);
    f.torrents[0].wire(); await f.drain();
    assert.equal(live.cards[0].dataset.streamHealthState, 'healthy');
    assert.equal(old.cards[0].dataset.streamHealthState, 'checking'); assert.ok(f.cache(source));
  }],
  ['live-wire-cache', async f => {
    const source = magnet(), live = f.feed([source]); live.show(); f.torrents[0].wire(); await f.drain();
    assert.equal(live.cards[0].dataset.streamHealthState, 'healthy'); assert.ok(f.cache(source));
    const cached = f.feed([source]); cached.show(); assert.equal(f.calls.length, 1);
    assert.equal(cached.cards[0].dataset.streamHealthState, 'healthy');
  }],
  ['live-error-cleanup-cache', async f => {
    const source = magnet(), live = f.feed([source]); live.show(); f.torrents[0].error(); await f.drain();
    assert.equal(live.cards[0].dataset.streamHealthState, 'unhealthy');
    assert.equal(f.calls[0].result.reason, 'error'); assert.ok(f.cache(source));
    assert.equal(f.snapshot().activeTorrents, 0); assert.equal(f.clock.jobs.size, 0);
  }],
  ['live-timeout-cleanup-cache', async f => {
    const source = magnet(), live = f.feed([source]); live.show();
    f.clock.tick(19999); await turn(); assert.equal(f.calls[0].settled, false);
    f.clock.tick(1); await turn();
    assert.equal(live.cards[0].dataset.streamHealthState, 'unhealthy');
    assert.equal(f.calls[0].result.reason, 'timeout'); assert.ok(f.cache(source));
    assert.equal(f.snapshot().activeTorrents, 0); assert.equal(f.clock.jobs.size, 0);
  }],
  ['queued-cancel-priority-fifo', async f => {
    const active = f.feed(Array.from({ length: 4 }, magnet)); active.show();
    const firstSource = magnet(), lowSource = magnet(), equalSource = magnet(), cancelledSource = magnet();
    const batch = f.feed([firstSource, lowSource]); batch.show();
    const equal = f.feed([equalSource]); equal.show();
    const cancelled = f.feed([cancelledSource]); cancelled.show(); cancelled.dispose();
    for (const [slot, expected] of [[0, firstSource], [4, equalSource], [5, lowSource]]) {
      f.torrents[slot].wire(); await f.drain();
      assert.ok(f.torrents.at(-1).source.includes(expected.slice(-40)));
    }
    assert.equal(f.torrents.some(x => x.source.includes(cancelledSource.slice(-40))), false);
    assert.equal(f.calls.some(x => x.source === cancelledSource), false, 'pruned queued job never invokes helper');
    assert.ok(f.peak <= 4); assert.equal(f.cache(cancelledSource), null);
  }],
  ['deferred-teardown-precedes-next-slot', async f => {
    const active = f.feed(Array.from({ length: 4 }, magnet)); active.show();
    const queued = f.feed([magnet()]); queued.show();
    f.torrents[0].wire(); await turn();
    assert.equal(f.calls.length, 4, 'slot retained until delayed destroy');
    assert.equal(f.snapshot().timers.teardown, 1);
    f.clock.tick(0); await turn(); assert.equal(f.calls.length, 5); assert.equal(f.peak, 4);
    const destroyIndex = f.timeline.findIndex(x => x[0] === 'destroy');
    assert.equal(f.timeline[destroyIndex + 1][0], 'add');
  }],
  ['late-observer-disposed-guard', async f => {
    const old = f.feed([magnet()]); old.show(); old.dispose();
    const before = old.events.length; old.observer.show(); f.torrents[0].wire(); await f.drain();
    assert.equal(old.events.length, before); assert.equal(f.calls.length, 1);
    assert.equal(old.cards[0].dataset.streamHealthState, 'checking');
  }],
  ['old-callbacks-cannot-affect-replacement', async f => {
    const source = magnet(), old = f.feed([source]); old.show();
    const wire = f.torrents[0].listeners('wire')[0];
    const error = f.torrents[0].listeners('error')[0];
    const timers = [...f.clock.jobs.values()].map(job => job.fn);
    old.dispose();
    assert.equal(f.calls[0].lifecycle.cancelled, true, 'cancelled identity unavailable synchronously');
    const replacement = f.feed([source]); replacement.show();
    await f.drain();
    wire(); error(new Error('late')); timers.forEach(fn => fn()); await f.drain();
    const shared = f.feed([source]); shared.show();
    assert.equal(f.calls.length, 2, 'old finalizer must not delete replacement identity');
    assert.equal(f.cache(source), null);
    assert.equal(replacement.cards[0].dataset.streamHealthState, 'checking');
    f.torrents[1].wire(); await f.drain();
    assert.equal(f.writes.length, 1, 'only the new live result is cached');
    assert.equal(replacement.cards[0].dataset.streamHealthState, 'healthy');
    assert.equal(shared.cards[0].dataset.streamHealthState, 'healthy');
    assert.equal(old.cards[0].dataset.streamHealthState, 'checking');
  }],
  ['repeated-release-and-noncooperative-io', async f => {
    const live = f.feed([magnet()]); live.show();
    const cancel = f.calls[0].lifecycle.cancelActive;
    const lateWire = f.torrents[0].listeners('wire')[0];
    live.dispose(); live.dispose(); cancel(); cancel();
    // No fake transport completion or abort event is required to settle.
    await f.drain();
    assert.equal(f.calls[0].settled, true); assert.equal(f.calls[0].result, null);
    assert.equal(f.torrents[0].destroyCount, 1);
    lateWire(); cancel(); await f.drain();
    assert.equal(f.calls[0].result, null); assert.equal(f.torrents[0].destroyCount, 1);
  }],
  ['cancel-before-probe-start', async f => {
    const lifecycle = { cancelled: true, owners: new Set() };
    const promise = f.probe(magnet(), lifecycle); await f.drain();
    assert.equal(f.calls[0].settled, true); assert.equal(await promise, null);
    assert.equal(f.torrents.length, 0); assert.equal(torrentClient.probeClient, null);
    assert.equal(f.clock.jobs.size, 0);
  }],
  ['cancel-during-client-construction', async f => {
    const live = f.feed([magnet()]);
    f.config.onConstruct = () => live.dispose(); live.show(); await f.drain();
    assert.equal(f.calls[0].settled, true); assert.equal(f.calls[0].result, null);
    assert.equal(f.torrents.length, 0); assert.equal(f.clock.jobs.size, 0);
    assert.equal(f.calls[0].lifecycle.cancelActive, null);
  }],
  ['cancel-during-add-defers-destroy', async f => {
    const source = magnet(), live = f.feed([source]);
    f.config.onAdd = () => live.dispose(); live.show();
    assert.equal(f.calls[0].lifecycle.cancelled, true);
    assert.equal(f.calls[0].settled, false);
    assert.equal(f.torrents[0].destroyCount, 0);
    assert.equal(f.clock.counts().timeout, 0); assert.equal(f.clock.counts().poll, 0);
    f.torrents[0].error(); // Noncooperative IO can report an error before deferred destruction.
    await f.drain();
    assert.equal(f.calls[0].settled, true); assert.equal(f.calls[0].result, null);
    assert.equal(f.torrents[0].destroyCount, 1);
    assert.equal(f.torrents[0].destroyedDuringAdd, false); assert.equal(f.cache(source), null);
  }],
  ['same-source-owner-registers-during-add', async f => {
    const source = magnet(), first = f.feed([source]);
    let shared;
    f.config.onAdd = () => {
      f.config.onAdd = null;
      shared = f.feed([source]); shared.show(); first.dispose();
    };
    first.show(); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].lifecycle.cancelled, false);
    f.torrents[0].wire(); await f.drain();
    assert.equal(shared.cards[0].dataset.streamHealthState, 'healthy');
    assert.equal(first.cards[0].dataset.streamHealthState, 'checking');
  }],
  ['cancel-on-wire-unwind-before-destroy', async f => {
    const live = f.feed([magnet()]); live.show();
    f.torrents[0].on('wire', () => live.dispose());
    f.torrents[0].wire();
    assert.equal(f.torrents[0].destroyCount, 0);
    await f.drain();
    assert.equal(f.calls[0].settled, true); assert.equal(f.calls[0].result, null);
    assert.equal(f.torrents[0].destroyedDuringEvent, false); assert.equal(f.writes.length, 0);
  }],
  ['cancel-on-error-unwind-before-destroy', async f => {
    const live = f.feed([magnet()]); live.show();
    f.torrents[0].on('error', () => live.dispose());
    f.torrents[0].error();
    assert.equal(f.torrents[0].destroyCount, 0);
    await f.drain();
    assert.equal(f.calls[0].result, null); assert.equal(f.writes.length, 0);
    assert.equal(f.torrents[0].destroyedDuringEvent, false);
  }],
  ['throwing-destroy-still-settles-and-cleans-own-listeners', async f => {
    const live = f.feed([magnet()]); live.show();
    f.config.throwDestroy = true; live.dispose(); await f.drain();
    assert.equal(f.calls[0].settled, true); assert.equal(f.calls[0].result, null);
    assert.equal(f.torrents[0].destroyCount, 1);
    assert.equal(f.torrents[0].listenerCount('wire'), 0);
    assert.equal(f.torrents[0].listenerCount('error'), 0);
    assert.equal(f.calls[0].lifecycle.cancelActive, null);
  }],
  ['standalone-ownerless-caller-stays-live', async f => {
    const source = magnet(), promise = f.probe(source);
    assert.equal(f.calls[0].lifecycle, undefined);
    f.torrents[0].wire(); await f.drain(); assert.equal(f.calls[0].settled, true);
    const result = await promise;
    assert.equal(result.healthy, true); assert.equal(result.reason, 'peer');
    assert.equal(f.torrents[0].destroyCount, 1);
  }],
  ['synchronous-wire-listener-registration', async f => {
    f.config.syncEvent = 'wire'; const promise = f.probe(magnet());
    assert.equal(f.torrents[0].destroyCount, 0);
    await f.drain(); assert.equal(f.calls[0].settled, true);
    assert.equal((await promise).healthy, true); assert.equal(f.clock.jobs.size, 0);
  }],
  ['synchronous-error-listener-registration', async f => {
    f.config.syncEvent = 'error'; const promise = f.probe(magnet());
    await f.drain(); assert.equal(f.calls[0].settled, true);
    assert.equal((await promise).reason, 'error'); assert.equal(f.clock.jobs.size, 0);
  }],
  ['add-error-cleans-hook-and-keeps-shared-client', async f => {
    const lifecycle = { cancelled: false, owners: new Set([{}]) };
    f.config.throwAdd = true; const promise = f.probe(magnet(), lifecycle);
    await f.drain(); assert.equal(f.calls[0].settled, true);
    assert.equal((await promise).reason, 'error'); assert.equal(lifecycle.cancelActive, null);
    assert.equal(f.torrents.length, 0); assert.equal(f.clock.jobs.size, 0);
    const client = torrentClient.probeClient;
    f.config.throwAdd = false; const next = f.probe(magnet());
    f.torrents[0].wire(); await f.drain(); assert.equal(f.calls[1].settled, true);
    assert.equal((await next).healthy, true); assert.equal(torrentClient.probeClient, client);
  }],
  ['missing-AbortController-still-cancels', async f => {
    globalThis.AbortController = undefined;
    const source = magnet(), live = f.feed([source]); live.show(); live.dispose();
    await f.drain(); assert.equal(f.calls[0].settled, true);
    assert.equal(f.calls[0].result, null); assert.equal(f.cache(source), null);
    assert.equal(f.clock.jobs.size, 0); assert.equal(f.torrents[0].destroyCount, 1);
  }],
  ['error-and-throwing-teardown-release-queued-capacity-once', async f => {
    const active = f.feed(Array.from({ length: 4 }, magnet)); active.show();
    const source = magnet(), queued = f.feed([source]); queued.show();
    f.config.throwDestroy = true;
    f.torrents[0].error(); await turn();
    assert.equal(f.calls.length, 4, 'error result still holds slot until teardown');
    f.clock.tick(0); await turn();
    assert.equal(f.calls.length, 5); assert.equal(f.torrents[0].destroyCount, 1);
    assert.equal(f.torrents[0].listenerCount('error'), 0);
    f.config.throwDestroy = false;
    f.torrents[4].wire(); await f.drain();
    assert.equal(queued.cards[0].dataset.streamHealthState, 'healthy'); assert.equal(f.peak, 4);
  }]
];

for (const [name, scenario] of cases) {
  test(name, async t => { await scenario(fixture(t)); });
}
