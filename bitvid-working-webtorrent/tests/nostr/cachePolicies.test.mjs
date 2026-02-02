import { test } from 'node:test';
import assert from 'node:assert';
import { CACHE_POLICIES, STORAGE_TIERS, MERGE_STRATEGIES } from '../../js/nostr/cachePolicies.js';
import { NOTE_TYPES } from '../../js/nostrEventSchemas.js';

test('CACHE_POLICIES structure', () => {
  assert.ok(CACHE_POLICIES, 'CACHE_POLICIES should be defined');
  assert.ok(STORAGE_TIERS, 'STORAGE_TIERS should be defined');
  assert.ok(MERGE_STRATEGIES, 'MERGE_STRATEGIES should be defined');
});

test('VIDEO_POST policy', () => {
  const policy = CACHE_POLICIES[NOTE_TYPES.VIDEO_POST];
  assert.ok(policy, 'VIDEO_POST policy should exist');
  assert.strictEqual(policy.storage, STORAGE_TIERS.INDEXED_DB);
  assert.strictEqual(policy.ttl, 10 * 60 * 1000);
  assert.strictEqual(policy.merge, MERGE_STRATEGIES.REPLACEABLE);
});

test('WATCH_HISTORY policy', () => {
  const policy = CACHE_POLICIES[NOTE_TYPES.WATCH_HISTORY];
  assert.ok(policy, 'WATCH_HISTORY policy should exist');
  assert.strictEqual(policy.storage, STORAGE_TIERS.LOCAL_STORAGE);
  assert.strictEqual(policy.ttl, 24 * 60 * 60 * 1000);
  assert.strictEqual(policy.merge, MERGE_STRATEGIES.APPEND_ONLY);
});

test('SUBSCRIPTION_LIST policy', () => {
  const policy = CACHE_POLICIES[NOTE_TYPES.SUBSCRIPTION_LIST];
  assert.ok(policy, 'SUBSCRIPTION_LIST policy should exist');
  assert.strictEqual(policy.storage, STORAGE_TIERS.LOCAL_STORAGE);
  assert.strictEqual(policy.ttl, Infinity);
});

test('VIDEO_COMMENT policy', () => {
  const policy = CACHE_POLICIES[NOTE_TYPES.VIDEO_COMMENT];
  assert.ok(policy, 'VIDEO_COMMENT policy should exist');
  assert.strictEqual(policy.storage, STORAGE_TIERS.MEMORY);
});
