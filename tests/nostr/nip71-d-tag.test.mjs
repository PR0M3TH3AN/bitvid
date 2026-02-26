import test from "node:test";
import assert from "node:assert/strict";
import { getDTagValueFromTags } from "../../js/nostr/nip71.js";

test("getDTagValueFromTags handles invalid inputs", (t) => {
  assert.equal(getDTagValueFromTags(null), "");
  assert.equal(getDTagValueFromTags(undefined), "");
  assert.equal(getDTagValueFromTags("not an array"), "");
  assert.equal(getDTagValueFromTags({}), "");
});

test("getDTagValueFromTags handles empty tags array", (t) => {
  assert.equal(getDTagValueFromTags([]), "");
});

test("getDTagValueFromTags returns empty string if no d-tag present", (t) => {
  const tags = [
    ["e", "eventId"],
    ["p", "pubkey"],
    ["t", "hashtag"],
  ];
  assert.equal(getDTagValueFromTags(tags), "");
});

test("getDTagValueFromTags returns correct value for single d-tag", (t) => {
  const tags = [
    ["e", "eventId"],
    ["d", "my-identifier"],
    ["p", "pubkey"],
  ];
  assert.equal(getDTagValueFromTags(tags), "my-identifier");
});

test("getDTagValueFromTags returns first value for multiple d-tags", (t) => {
  const tags = [
    ["d", "first-identifier"],
    ["d", "second-identifier"],
  ];
  assert.equal(getDTagValueFromTags(tags), "first-identifier");
});

test("getDTagValueFromTags skips malformed d-tags", (t) => {
  const tags = [
    ["d"], // too short
    ["d", null], // invalid value type
    ["d", 123], // invalid value type
    "not an array tag",
    ["d", "valid-identifier"],
  ];
  assert.equal(getDTagValueFromTags(tags), "valid-identifier");
});

test("getDTagValueFromTags skips empty string d-tag value", (t) => {
    // nip71 implementation: if (typeof tag[1] === "string" && tag[1]) { ... }
    const tags = [
        ["d", ""],
        ["d", "next-valid"],
    ];
    assert.equal(getDTagValueFromTags(tags), "next-valid");
});
