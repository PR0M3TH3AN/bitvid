import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTE_TYPES,
  getNostrEventSchema,
} from "../js/nostrEventSchemas.js";
import { convertEventToVideo } from "../js/nostr/nip71.js";

test("video post schema documents nsfw and kids flags", () => {
  const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_POST);
  const fieldKeys = Array.isArray(schema?.content?.fields)
    ? schema.content.fields.map((field) => field?.key)
    : [];

  assert.ok(
    fieldKeys.includes("isNsfw"),
    "schema should include isNsfw field"
  );
  assert.ok(
    fieldKeys.includes("isForKids"),
    "schema should include isForKids field"
  );
});

test("convertEventToVideo normalizes nsfw and kids booleans", () => {
  const nsfwEvent = {
    id: "evt-nsfw",
    content: JSON.stringify({
      version: 3,
      title: "Flagged clip",
      url: "https://cdn.example/nsfw.mp4",
      videoRootId: "root-nsfw",
      isNsfw: true,
      isForKids: true,
    }),
    tags: [],
  };

  const nsfwParsed = convertEventToVideo(nsfwEvent);
  assert.equal(nsfwParsed.isNsfw, true);
  assert.equal(
    nsfwParsed.isForKids,
    false,
    "isForKids should be suppressed when nsfw is true"
  );

  const kidsEvent = {
    id: "evt-kids",
    content: JSON.stringify({
      version: 3,
      title: "Kids clip",
      url: "https://cdn.example/kids.mp4",
      videoRootId: "root-kids",
      isForKids: true,
    }),
    tags: [],
  };

  const kidsParsed = convertEventToVideo(kidsEvent);
  assert.equal(kidsParsed.isNsfw, false);
  assert.equal(kidsParsed.isForKids, true);

  const defaultEvent = {
    id: "evt-default",
    content: JSON.stringify({
      version: 3,
      title: "Default clip",
      url: "https://cdn.example/default.mp4",
      videoRootId: "root-default",
    }),
    tags: [],
  };

  const defaultParsed = convertEventToVideo(defaultEvent);
  assert.equal(defaultParsed.isNsfw, false);
  assert.equal(defaultParsed.isForKids, false);
});

// TODO #60: audio-only notes (podcasts/music published as native kind-30078)
// must not leak into the video feed — bitvid has no <audio> player, so they
// render as a broken <video>. convertEventToVideo marks them invalid so every
// feed/grid ingestion path (which already drops invalid) filters them out.

test("audio-only event with imeta m audio/* is filtered as invalid", () => {
  const podcast = {
    id: "evt-audio-imeta",
    content: JSON.stringify({
      version: 3,
      title: "Nostr Compass Podcast #20",
      url: "https://relay.example/episode.ogg",
      videoRootId: "root-podcast",
    }),
    tags: [
      [
        "imeta",
        "url https://relay.example/episode.ogg",
        "m audio/ogg",
        "duration 5254",
      ],
    ],
  };

  const parsed = convertEventToVideo(podcast);
  assert.equal(parsed.invalid, true, "audio-only note should be invalid");
  assert.match(parsed.reason, /audio-only/);
});

test("audio-only url extension (mp3) with no imeta is filtered", () => {
  const track = {
    id: "evt-audio-ext",
    content: JSON.stringify({
      version: 3,
      title: "A song",
      url: "https://cdn.example/track.mp3?v=2",
      videoRootId: "root-track",
    }),
    tags: [],
  };

  assert.equal(convertEventToVideo(track).invalid, true);
});

test(".ogg url WITHOUT an audio imeta is kept (ambiguous → treated as video)", () => {
  const ambiguousOgg = {
    id: "evt-ogg-ambiguous",
    content: JSON.stringify({
      version: 3,
      title: "Theora clip",
      url: "https://cdn.example/clip.ogg",
      videoRootId: "root-ogg",
    }),
    tags: [],
  };

  const parsed = convertEventToVideo(ambiguousOgg);
  assert.equal(parsed.invalid, false, ".ogg alone must not be filtered");
  assert.equal(parsed.url, "https://cdn.example/clip.ogg");
});

test("a video imeta variant wins even when an audio variant is also present", () => {
  const mixed = {
    id: "evt-mixed",
    content: JSON.stringify({
      version: 3,
      title: "Talk with audio alt",
      url: "https://cdn.example/talk.mp4",
      videoRootId: "root-mixed",
    }),
    tags: [
      ["imeta", "url https://cdn.example/talk.mp4", "m video/mp4"],
      ["imeta", "url https://cdn.example/talk.ogg", "m audio/ogg"],
    ],
  };

  assert.equal(convertEventToVideo(mixed).invalid, false);
});

test("an audio url paired with a magnet is kept (torrent may be video)", () => {
  const withMagnet = {
    id: "evt-audio-magnet",
    content: JSON.stringify({
      version: 3,
      title: "Torrented",
      url: "https://cdn.example/preview.mp3",
      magnet: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
      videoRootId: "root-magnet",
    }),
    tags: [["imeta", "url https://cdn.example/preview.mp3", "m audio/mpeg"]],
  };

  assert.equal(convertEventToVideo(withMagnet).invalid, false);
});

test("a normal video (mp4) event is unaffected by the audio guard", () => {
  const video = {
    id: "evt-video",
    content: JSON.stringify({
      version: 3,
      title: "Real video",
      url: "https://cdn.example/real.mp4",
      videoRootId: "root-video",
    }),
    tags: [["imeta", "url https://cdn.example/real.mp4", "m video/mp4"]],
  };

  const parsed = convertEventToVideo(video);
  assert.equal(parsed.invalid, false);
  assert.equal(parsed.url, "https://cdn.example/real.mp4");
});
