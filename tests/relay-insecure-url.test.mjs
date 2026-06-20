// The relay-list UI flags relays that can never connect from the browser so the
// user knows to remove them. A cleartext ws:// relay that is NOT localhost is
// blocked by the app's CSP (connect-src allows wss: and ws://localhost only), so
// it must be reported as insecure/blocked; wss:// and local ws:// must not be.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { ProfileRelayController } from "../js/ui/profileModal/ProfileRelayController.js";

const controller = Object.create(ProfileRelayController.prototype);
const isInsecure = (url) => controller.isInsecureRelayUrl(url);

test("flags remote cleartext ws:// relays as insecure (CSP-blocked)", () => {
  assert.equal(isInsecure("ws://209.122.211.18:4848"), true);
  assert.equal(isInsecure("ws://relay.example.com"), true);
  assert.equal(isInsecure("WS://Relay.Example.com"), true, "case-insensitive");
});

test("does not flag secure or local relays", () => {
  assert.equal(isInsecure("wss://relay.damus.io"), false);
  assert.equal(isInsecure("wss://nos.lol"), false);
  assert.equal(isInsecure("ws://localhost:8000"), false);
  assert.equal(isInsecure("ws://127.0.0.1:4848"), false);
});

test("handles empty/invalid input safely", () => {
  assert.equal(isInsecure(""), false);
  assert.equal(isInsecure(null), false);
  assert.equal(isInsecure(undefined), false);
  assert.equal(isInsecure(12345), false);
});
