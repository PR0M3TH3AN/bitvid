import test from 'node:test';
import assert from 'node:assert/strict';
import { tombstoneFixture, videoEvent, ids, author, filteredStorageKey } from './test-helpers/storage-tombstone-fixture.mjs';

const cachedVideo = (id, extra = {}) => ({ id, pubkey: author, videoRootId: id, created_at: 100, title: id, url: 'https://example.invalid/video.mp4', ...extra });
const assertSnapshot = (f, expected) => {
  assert.deepEqual(ids([...f.service.getVideosMap().values()]), expected);
  assert.deepEqual(ids(f.notifications.at(-1).videos), expected);
  assert.deepEqual(ids(f.updates.at(-1).videos), expected);
  assert.deepEqual(ids(f.persisted()), expected);
};

test('different-ID tombstone removes every obsolete cached version and preserves unrelated live content', async t => {
  const f = tombstoneFixture(t); await f.load();
  await f.ingest(videoEvent('first', 100));
  await f.ingest(videoEvent('edit', 150), videoEvent('other', 100, { root: 'other', pubkey: 'b'.repeat(64) }));
  await f.ingest(videoEvent('delete', 200, { deleted: true }));
  assertSnapshot(f, ['other']);
  assert.deepEqual(ids(f.updates.at(-1).deleted), ['delete']);
  await f.ingest(videoEvent('late', 120));
  assertSnapshot(f, ['other']);
});

test('deletion-only empty result persists and second consumer receives no optimistic resurrection', async t => {
  const f = tombstoneFixture(t); await f.load(); await f.ingest(videoEvent('first', 100));
  await f.ingest(videoEvent('delete', 200, { deleted: true }));
  assertSnapshot(f, []);
  const count = f.notifications.length;
  await f.load();
  assert.deepEqual(f.notifications.slice(count).map(entry => ids(entry.videos)), [[]]);
  assert.deepEqual(f.persisted(), []);
});

for (const viewer of ['public', 'author']) {
  test(`persistent deleted and invalid entries are rejected before ${viewer} access bypass`, async t => {
    const f = tombstoneFixture(t, { persisted: [cachedVideo('deleted', { deleted: true }), cachedVideo('invalid', { invalid: true }), cachedVideo('live')] });
    if (viewer === 'author') f.client.pubkey = author;
    const initial = await f.load();
    assert.deepEqual(ids(initial), ['live']);
    assert.equal(f.notifications.some(entry => entry.videos.some(video => video.deleted || video.invalid)), false);
    assert.deepEqual(ids([...f.service.getVideosMap().values()]), ['live']);
    assert.deepEqual(ids(f.persisted()), ['live']);
  });
}

test('all-ineligible persistent cache is cleared even when active snapshot is empty', async t => {
  const f = tombstoneFixture(t, { persisted: [cachedVideo('deleted', { deleted: true }), cachedVideo('invalid', { invalid: true })] });
  assert.deepEqual(await f.load(), []);
  assert.deepEqual(f.persisted(), []);
  assert.deepEqual(f.notifications.map(entry => ids(entry.videos)), [[]]);
});

test('stale nondeleted persistent copies honor known tombstone while strictly newer and unrelated entries survive', async t => {
  const f = tombstoneFixture(t); await f.load();
  await f.ingest(videoEvent('old', 100));
  const stale = f.persisted()[0];
  await f.ingest(videoEvent('delete', 200, { deleted: true }));
  await f.ingest(videoEvent('newer', 300), videoEvent('other', 150, { root: 'other' }));
  // A stale storage snapshot contains an independent, still-nondeleted copy.
  localStorage.setItem(filteredStorageKey, JSON.stringify([stale, ...f.persisted()]));
  const start = f.notifications.length;
  await f.load();
  assert.equal(f.notifications.slice(start).some(entry => entry.videos.some(video => video.id === 'old')), false);
  assertSnapshot(f, ['newer', 'other']);
});

test('direct cache API never reintroduces deleted invalid or tombstone-covered copies', async t => {
  const f = tombstoneFixture(t); await f.load(); await f.ingest(videoEvent('old', 100));
  const stale = f.persisted()[0];
  await f.ingest(videoEvent('delete', 200, { deleted: true }));
  f.service.cacheVideos([stale, cachedVideo('deleted', { deleted: true }), cachedVideo('invalid', { invalid: true }), cachedVideo('live')]);
  assert.deepEqual(ids([...f.service.getVideosMap().values()]), ['live']);
});

test('legacy tombstone cleanup retains other author with same d-tag and strictly newer content', async t => {
  const f = tombstoneFixture(t); await f.load();
  const legacy = { root: `LEGACY:${author}:same`, dTag: 'same' };
  const other = { root: `LEGACY:${'b'.repeat(64)}:same`, dTag: 'same', pubkey: 'b'.repeat(64) };
  await f.ingest(videoEvent('old', 100, legacy), videoEvent('other-author', 100, other));
  await f.ingest(videoEvent('delete', 200, { ...legacy, deleted: true }));
  assertSnapshot(f, ['other-author']);
  await f.ingest(videoEvent('newer', 300, legacy));
  await f.ingest(videoEvent('delete-replayed', 200, { ...legacy, deleted: true }));
  assertSnapshot(f, ['newer', 'other-author']);
});
