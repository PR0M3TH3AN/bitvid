// #48: switching to a saved nsec account must prompt for the PIN and unlock its stored
// key (switchProfile alone threw "secret-required"). evaluateStoredNsecSwitch is the
// pure gate: proceed to prompt when a matching stored nsec key exists; error otherwise.

import test from "node:test";
import { strict as assert } from "node:assert";
import { evaluateStoredNsecSwitch } from "../js/app/storedNsecSwitch.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
const nsecMeta = (pubkey = A) => ({ hasEncryptedKey: true, pubkey, source: "nsec" });

test("prompts when a stored nsec key matches the target account", () => {
  assert.deepEqual(evaluateStoredNsecSwitch(nsecMeta(A), A), { action: "prompt" });
});

test("prompts when the stored key has no pubkey to compare (can't rule it out)", () => {
  assert.deepEqual(
    evaluateStoredNsecSwitch({ hasEncryptedKey: true, source: "nsec" }, A),
    { action: "prompt" },
  );
});

test("errors when there is no stored session at all", () => {
  assert.deepEqual(evaluateStoredNsecSwitch(null, A), {
    action: "error",
    reason: "no-stored-key",
  });
});

test("errors when the stored key isn't an nsec (e.g. left-over non-nsec metadata)", () => {
  assert.deepEqual(
    evaluateStoredNsecSwitch({ hasEncryptedKey: true, pubkey: A, source: "extension" }, A),
    { action: "error", reason: "no-stored-key" },
  );
});

test("errors when the stored key belongs to a DIFFERENT account", () => {
  assert.deepEqual(evaluateStoredNsecSwitch(nsecMeta(A), B), {
    action: "error",
    reason: "pubkey-mismatch",
  });
});

test("case-insensitive pubkey match", () => {
  assert.deepEqual(evaluateStoredNsecSwitch(nsecMeta(A.toUpperCase()), A), {
    action: "prompt",
  });
});
