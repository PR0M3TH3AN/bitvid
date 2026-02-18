import { test, describe, it } from "node:test";
import assert from "node:assert";
import { normalizeVideoNotePayload } from "../../../js/services/videoNotePayload.js";

describe("normalizeVideoNotePayload", () => {
  it("should normalize hashtags from 'hashtags' property", () => {
    const input = {
      title: "Test Video",
      url: "https://example.com/video.mp4",
      nip71: {
        hashtags: ["one", "two"],
      },
    };

    const { payload, errors } = normalizeVideoNotePayload(input);
    assert.strictEqual(errors.length, 0);
    assert.deepStrictEqual(payload.nip71.hashtags, ["one", "two"]);
  });

  it("should normalize hashtags from 't' property (Bug Fix)", () => {
    const input = {
      title: "Test Video",
      url: "https://example.com/video.mp4",
      nip71: {
        t: ["one", "two"],
      },
    };

    const { payload, errors } = normalizeVideoNotePayload(input);
    assert.strictEqual(errors.length, 0);

    // This assertion is expected to FAIL before the fix
    assert.deepStrictEqual(payload.nip71.hashtags, ["one", "two"], "Hashtags should be extracted from 't' property");
  });
});
