import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTE_TYPES,
  getNostrEventSchema,
} from "../js/nostrEventSchemas.js";
<<<<<<< HEAD
import { convertEventToVideo } from "../js/nostr/nip71.js";
=======
import { convertEventToVideo } from "../js/nostr.js";
>>>>>>> origin/main

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
