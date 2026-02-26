import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDTagValueFromTags } from '../../js/nostr/nip71.js';

test('getDTagValueFromTags utility', async (t) => {
  await t.test('returns empty string for invalid inputs', () => {
    assert.equal(getDTagValueFromTags(null), '');
    assert.equal(getDTagValueFromTags(undefined), '');
    assert.equal(getDTagValueFromTags({}), '');
    assert.equal(getDTagValueFromTags(''), '');
    assert.equal(getDTagValueFromTags(123), '');
  });

  await t.test('returns empty string if no d-tag present', () => {
    const tags = [['p', 'pubkey'], ['e', 'event-id']];
    assert.equal(getDTagValueFromTags(tags), '');
  });

  await t.test('returns correct value for single d-tag', () => {
    const tags = [['d', 'test-value']];
    assert.equal(getDTagValueFromTags(tags), 'test-value');
  });

  await t.test('returns first value for multiple d-tags', () => {
    const tags = [['d', 'first'], ['d', 'second']];
    assert.equal(getDTagValueFromTags(tags), 'first');
  });

  await t.test('skips invalid d-tags (malformed)', () => {
    const tags = [
      ['d'], // missing value
      ['d', 123], // value not string
      ['d', null], // value not string
      'invalid', // tag not array
      ['d', 'valid'],
    ];
    assert.equal(getDTagValueFromTags(tags), 'valid');
  });

  await t.test('handles empty d-tag value correctly', () => {
     // nip71 implementation returns empty string if value is empty string, OR skips it?
     // Implementation: if (typeof tag[1] === "string" && tag[1]) { return tag[1]; }
     // So it skips empty strings.
     const tags = [['d', ''], ['d', 'fallback']];
     assert.equal(getDTagValueFromTags(tags), 'fallback');
  });
});
