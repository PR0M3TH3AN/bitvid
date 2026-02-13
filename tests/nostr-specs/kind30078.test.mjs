
import { test, describe, it, before } from 'node:test';
import assert from 'node:assert';

// Mock window/localstorage/etc
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
}

// We need to import the schema builder.
// Since it's an ES module, we can import it directly.
import {
  buildVideoPostEvent,
  NOTE_TYPES,
  getNostrEventSchema,
  validateEventStructure
} from '../../js/nostrEventSchemas.js';

describe('Kind 30078 (Video Note) Compliance', () => {
  it('should have correct kind 30078', () => {
    const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_POST);
    assert.strictEqual(schema.kind, 30078);
  });

  it('should require version 3', () => {
    const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_POST);
    const versionField = schema.content.fields.find(f => f.key === 'version');
    assert.ok(versionField, 'Version field missing in schema');
    assert.strictEqual(versionField.required, true);
  });

  it('should build a valid event with required fields', () => {
    const params = {
      pubkey: '00'.repeat(32),
      created_at: Math.floor(Date.now() / 1000),
      dTagValue: 'my-video-slug',
      content: {
        version: 3,
        title: 'Test Video',
        videoRootId: 'my-video-slug',
        url: 'https://example.com/video.mp4'
      }
    };

    const event = buildVideoPostEvent(params);

    assert.strictEqual(event.kind, 30078);
    assert.strictEqual(event.pubkey, params.pubkey);

    const parsedContent = JSON.parse(event.content);
    assert.strictEqual(parsedContent.version, 3);
    assert.strictEqual(parsedContent.title, 'Test Video');

    // Validate structure
    const validation = validateEventStructure(NOTE_TYPES.VIDEO_POST, event);
    assert.strictEqual(validation.valid, true, `Validation failed: ${validation.errors.join(', ')}`);
  });

  it('should allow magnet links', () => {
    const params = {
      pubkey: '00'.repeat(32),
      created_at: Math.floor(Date.now() / 1000),
      dTagValue: 'magnet-video',
      content: {
        version: 3,
        title: 'Magnet Video',
        videoRootId: 'magnet-video',
        magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=video.mp4'
      }
    };

    const event = buildVideoPostEvent(params);
    const parsedContent = JSON.parse(event.content);
    assert.strictEqual(parsedContent.magnet, params.content.magnet);

    const validation = validateEventStructure(NOTE_TYPES.VIDEO_POST, event);
    assert.strictEqual(validation.valid, true);
  });

  it('should include "s" tag for storage pointer', () => {
    const params = {
        pubkey: '00'.repeat(32),
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: 'pointer-test',
        content: {
          version: 3,
          title: 'Pointer Test',
          videoRootId: 'pointer-test',
          url: 'https://example.com/video.mp4'
        }
      };

      const event = buildVideoPostEvent(params);
      const sTag = event.tags.find(t => t[0] === 's');
      assert.ok(sTag, 'Missing s tag');
      // "url" pointer format from storagePointer.js: "url:https://example.com/video.mp4" (roughly)
      // Actually deriveStoragePointerFromUrl -> buildStoragePointerValue -> "url:<url>"
      assert.match(sTag[1], /^url:/);
  });

  it('should include "d" tag', () => {
    const params = {
        pubkey: '00'.repeat(32),
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: 'd-tag-test',
        content: {
          version: 3,
          title: 'D Tag Test',
          videoRootId: 'd-tag-test'
        }
      };

      const event = buildVideoPostEvent(params);
      const dTag = event.tags.find(t => t[0] === 'd');
      assert.ok(dTag, 'Missing d tag');
      assert.strictEqual(dTag[1], 'd-tag-test');
  });
});
