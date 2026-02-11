
import test from 'node:test';
import assert from 'node:assert/strict';
import * as RealNostrTools from 'nostr-tools';
import { utils } from 'nostr-tools';

// Polyfill
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    },
    crypto: globalThis.crypto,
    location: { protocol: 'https:' },
    bitvidNostrEventOverrides: {},
  };
  globalThis.localStorage = globalThis.window.localStorage;

  // Inject NostrTools for toolkit.js
  globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = {
      ...RealNostrTools,
      utils: RealNostrTools.utils
  };
}

// Mock magnet-uri if not already mocked by file system
// (We created node_modules/magnet-uri/index.js in previous step)

test('Video Note Compliance (Kind 30078 & NIP-71)', async (t) => {
  const { prepareVideoPublishPayload } = await import('../../js/nostr/videoPayloadBuilder.js');
  const { NOTE_TYPES, getNostrEventSchema } = await import('../../js/nostrEventSchemas.js');

  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";

  await t.test('prepareVideoPublishPayload creates Kind 30078 event', async () => {
    const videoPayload = {
      title: "Test Video",
      url: "https://example.com/video.mp4",
      description: "A test video",
      thumbnail: "https://example.com/thumb.jpg",
      mimeType: "video/mp4"
    };

    const result = await prepareVideoPublishPayload(videoPayload, pubkey);
    const event = result.event;

    assert.equal(event.kind, 30078, 'Event kind should be 30078');
    assert.equal(event.pubkey, pubkey, 'Pubkey should match');

    // Check tags
    const dTag = event.tags.find(t => t[0] === 'd');
    assert.ok(dTag, 'Should have a d tag');
    assert.ok(dTag[1], 'd tag should have a value');

    const tTag = event.tags.find(t => t[0] === 't');
    assert.equal(tTag[1], 'video', 'Should have t=video tag');

    // Check content
    const content = JSON.parse(event.content);
    assert.equal(content.title, "Test Video");
    assert.equal(content.url, "https://example.com/video.mp4");
    assert.equal(content.version, 3);
  });

  await t.test('prepareVideoPublishPayload includes NIP-71 tags when provided', async () => {
    const nip71Metadata = {
      title: "NIP-71 Title",
      summary: "NIP-71 Summary",
      hashtags: ["nostr", "bitcoin"],
      segments: [{ start: 0, end: 10, title: "Intro" }]
    };

    const videoPayload = {
      title: "Test Video",
      url: "https://example.com/video.mp4",
      nip71: nip71Metadata
    };

    const result = await prepareVideoPublishPayload(videoPayload, pubkey);
    const event = result.event;

    // Check for NIP-71 tags in the 30078 event (merged as tags?)
    // videoPayloadBuilder.js says:
    // const nip71Tags = buildNip71MetadataTags(nip71Metadata ...);
    // const additionalTags = ... nip71Tags ...
    // const event = buildVideoPostEvent({ ... additionalTags });

    const titleTag = event.tags.find(t => t[0] === 'title');
    assert.equal(titleTag[1], "NIP-71 Title");

    // summary is not a tag in NIP-71 (it's the content of Kind 21/22), so it won't appear as a tag on Kind 30078
    // const summaryTag = event.tags.find(t => t[0] === 'summary');
    // assert.equal(summaryTag[1], "NIP-71 Summary");

    const tTags = event.tags.filter(t => t[0] === 't');
    assert.ok(tTags.some(t => t[1] === 'nostr'));
    assert.ok(tTags.some(t => t[1] === 'bitcoin'));
    // "video" tag should also be there
    assert.ok(tTags.some(t => t[1] === 'video'));

    const segmentTag = event.tags.find(t => t[0] === 'segment');
    assert.ok(segmentTag);
    assert.equal(segmentTag[1], '0'); // start
    assert.equal(segmentTag[2], '10'); // end
    assert.equal(segmentTag[3], 'Intro'); // title
  });
});
