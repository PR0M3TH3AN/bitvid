import assert from "node:assert/strict";
import test from "node:test";
import { pointerArrayToKey } from "../../js/utils/pointer.js";

test("pointerArrayToKey: returns empty string for non-array input", () => {
  assert.equal(pointerArrayToKey(null), "");
  assert.equal(pointerArrayToKey(undefined), "");
  assert.equal(pointerArrayToKey("not an array"), "");
  assert.equal(pointerArrayToKey(123), "");
  assert.equal(pointerArrayToKey({}), "");
});

test("pointerArrayToKey: returns empty string for array with length < 2", () => {
  assert.equal(pointerArrayToKey([]), "");
  assert.equal(pointerArrayToKey(["a"]), "");
});

test("pointerArrayToKey: returns empty string if type is not 'a' or 'e'", () => {
  assert.equal(pointerArrayToKey(["x", "value"]), "");
  assert.equal(pointerArrayToKey(["", "value"]), "");
  assert.equal(pointerArrayToKey([1, "value"]), "");
});

test("pointerArrayToKey: returns empty string if value is not a string", () => {
  assert.equal(pointerArrayToKey(["a", null]), "");
  assert.equal(pointerArrayToKey(["a", 123]), "");
  assert.equal(pointerArrayToKey(["a", {}]), "");
});

test("pointerArrayToKey: returns empty string if value is empty or whitespace", () => {
  assert.equal(pointerArrayToKey(["a", ""]), "");
  assert.equal(pointerArrayToKey(["a", "   "]), "");
});

test("pointerArrayToKey: returns 'type:value' for valid 'a' type without relay", () => {
  assert.equal(pointerArrayToKey(["a", "my-id"]), "a:my-id");
});

test("pointerArrayToKey: returns 'type:value' for valid 'e' type without relay", () => {
  assert.equal(pointerArrayToKey(["e", "event-id"]), "e:event-id");
});

test("pointerArrayToKey: trims and lowercases value", () => {
  assert.equal(pointerArrayToKey(["a", "  My-ID  "]), "a:my-id");
});

test("pointerArrayToKey: returns 'type:value:relay' when relay is provided", () => {
  assert.equal(pointerArrayToKey(["a", "id", "wss://relay.example.com"]), "a:id:wss://relay.example.com");
});

test("pointerArrayToKey: trims relay", () => {
  assert.equal(pointerArrayToKey(["a", "id", "  wss://relay.example.com  "]), "a:id:wss://relay.example.com");
});

test("pointerArrayToKey: ignores relay if it is not a string", () => {
  assert.equal(pointerArrayToKey(["a", "id", null]), "a:id");
  assert.equal(pointerArrayToKey(["a", "id", 123]), "a:id");
  assert.equal(pointerArrayToKey(["a", "id", {}]), "a:id");
});
