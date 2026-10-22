import test from 'node:test';
import assert from 'node:assert/strict';
import { tombstoneFixture, videoEvent, ids } from './test-helpers/storage-tombstone-fixture.mjs';

// Scenarios and deterministic IO boundaries: docs/testing/storage-cors-3-integrity.md.
for (const order of ['newer-first', 'delete-first', 'same-batch']) {
  test(`buffer preserves strictly newer active content: ${order}`, async t => {
    const f = tombstoneFixture(t); await f.load();
    const newer = videoEvent('newer', 300);
    const deletion = videoEvent('deletion', 200, { deleted: true });
    if (order === 'same-batch') await f.ingest(newer, deletion);
    else if (order === 'newer-first') { await f.ingest(newer); await f.ingest(deletion); }
    else { await f.ingest(deletion); await f.ingest(newer); }
    await f.ingest(videoEvent('unrelated', 100, { root: 'other', pubkey: 'b'.repeat(64) }));
    assert.deepEqual(ids(f.client.getActiveVideos()), ['newer', 'unrelated']);
    assert.equal(f.client.allEvents.get('newer').deleted, false);
    assert.equal(f.client.tombstones.get('ROOT:target'), 200);
    // Replayed markers must not erase a newer version either.
    await f.ingest(deletion);
    assert.deepEqual(ids(f.client.getActiveVideos()), ['newer', 'unrelated']);
  });
}

test('newer/equal tombstone removes older versions, late zombies stay absent, newer content may return', async t => {
  const f = tombstoneFixture(t); await f.load();
  await f.ingest(videoEvent('first', 100), videoEvent('edit', 150), videoEvent('other', 100, { root: 'other' }));
  await f.ingest(videoEvent('delete', 150, { deleted: true }));
  assert.deepEqual(ids(f.client.getActiveVideos()), ['other']);
  assert.equal(f.client.allEvents.get('first').deleted, true);
  assert.equal(f.client.allEvents.get('edit').deleted, true);
  await f.ingest(videoEvent('late', 120));
  assert.equal(f.client.allEvents.get('late').deleted, true);
  assert.deepEqual(ids(f.client.getActiveVideos()), ['other']);
  await f.ingest(videoEvent('fresh', 151));
  assert.deepEqual(ids(f.client.getActiveVideos()), ['fresh', 'other']);
});

test('legacy d-tag tombstones retain authoritative author scoping', async t => {
  const f = tombstoneFixture(t); await f.load();
  await f.ingest(videoEvent('target-legacy', 100, { root: `LEGACY:${'a'.repeat(64)}:same`, dTag: 'same' }), videoEvent('other-author', 100, { root: `LEGACY:${'b'.repeat(64)}:same`, dTag: 'same', pubkey: 'b'.repeat(64) }));
  await f.ingest(videoEvent('delete-legacy', 200, { root: `LEGACY:${'a'.repeat(64)}:same`, dTag: 'same', deleted: true }));
  assert.deepEqual(ids(f.client.getActiveVideos()), ['other-author']);
  await f.ingest(videoEvent('target-late', 90, { root: `LEGACY:${'a'.repeat(64)}:same`, dTag: 'same' }));
  assert.deepEqual(ids(f.client.getActiveVideos()), ['other-author']);
  assert.equal(f.client.allEvents.get('target-late').deleted, true);
});
