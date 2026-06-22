/**
 * @file tests/nostr/utils.test.mjs
 * @description Unit tests for js/nostr/utils.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getActiveKey } from '../../js/nostr/utils.js';

describe('js/nostr/utils.js', () => {
  describe('getActiveKey', () => {
    test('returns ROOT key when videoRootId is present', () => {
      const video = {
        videoRootId: 'root-123',
        id: 'note-456',
        pubkey: 'pk1',
        tags: [['d', 'd-tag-val']]
      };
      const key = getActiveKey(video);
      assert.strictEqual(key, 'ROOT:root-123');
    });

    test('returns pubkey:d key when videoRootId is missing but d-tag exists', () => {
      const video = {
        id: 'note-456',
        pubkey: 'pk1',
        tags: [['d', 'd-tag-val']]
      };
      const key = getActiveKey(video);
      assert.strictEqual(key, 'pk1:d-tag-val');
    });

    test('returns LEGACY key when videoRootId and d-tag are missing', () => {
      const video = {
        id: 'note-456',
        pubkey: 'pk1',
        tags: [['t', 'hashtag']]
      };
      const key = getActiveKey(video);
      assert.strictEqual(key, 'LEGACY:note-456');
    });

    test('handles missing tags array gracefully (returns LEGACY)', () => {
      const video = {
        id: 'note-789',
        pubkey: 'pk2'
      };
      const key = getActiveKey(video);
      assert.strictEqual(key, 'LEGACY:note-789');
    });

    test('handles empty tags array gracefully (returns LEGACY)', () => {
        const video = {
          id: 'note-789',
          pubkey: 'pk2',
          tags: []
        };
        const key = getActiveKey(video);
        assert.strictEqual(key, 'LEGACY:note-789');
      });

    test('a synthesized LEGACY: root keys the same as the bare legacy event', () => {
      // The deletion builder synthesizes videoRootId = "LEGACY:<pubkey>:<dTag>"
      // for legacy videos. Its tombstone must map to the SAME key as the
      // original legacy event (which has no videoRootId), or the zombie is never
      // suppressed.
      const original = { id: 'note-1', pubkey: 'pk1', tags: [['d', 'd-val']] };
      const deletion = {
        id: 'note-2',
        pubkey: 'pk1',
        tags: [['d', 'd-val']],
        videoRootId: 'LEGACY:pk1:d-val',
      };
      const originalKey = getActiveKey(original);
      const deletionKey = getActiveKey(deletion);
      assert.strictEqual(originalKey, 'pk1:d-val');
      assert.strictEqual(
        deletionKey,
        originalKey,
        'legacy deletion tombstone must share the original event key',
      );
    });
  });
});
