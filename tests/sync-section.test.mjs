// The wallet + storage profile sections now share one sync UI implementation
// (syncSection.js) so they give identical notifications and one overwrite confirm,
// with conflict-only prompting. This covers the shared enable/disable/restore
// handlers (the run* helpers) that both controllers delegate to.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-sync-section-shared-handlers
//       given: "a mock sync service + status/success callbacks"
//       when: "runSyncToggle / runSyncRestore run for various outcomes"
//       then: "consistent messages + conflict-only confirm + rollback on failure"
//   observable_outcomes:
//     - "enable success -> success status + '<Item> synced (encrypted).' toast"
//     - "conflict -> keep-newer status, no success toast, no rollback"
//     - "nothing-to-sync -> toggle rolled back + disable() + empty hint"
//     - "preEnableConfirm rejected -> toggle rolled back, enable() never called"
//     - "restore imported -> success + onImported() re-render"
//   determinism_controls:
//     - "fully mocked service + callbacks; no DOM/network/clock"
//   anti_cheat_rationale:
//     prevents: ["over-mocking internal logic", "hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { runSyncToggle, runSyncRestore } from "../js/ui/profileModal/syncSection.js";

function harness(overrides = {}) {
  const calls = { status: [], success: [], toggle: [], enable: 0, disable: 0, pull: 0, imported: 0 };
  const service = {
    enable: async () => overrides.enableResult ?? { ok: true, accepted: 2, total: 3 },
    disable: async () => { calls.disable += 1; },
    pull: async () => { calls.pull += 1; return overrides.pullResult ?? { found: false }; },
  };
  const base = {
    service,
    pubkey: "f".repeat(64),
    itemLabel: "wallet connection",
    setStatus: (msg, tone) => calls.status.push([msg, tone]),
    showSuccess: (msg) => calls.success.push(msg),
    setToggle: (v) => calls.toggle.push(v),
    onImported: async () => { calls.imported += 1; },
  };
  const trackedEnable = service.enable;
  service.enable = async (...a) => { calls.enable += 1; return trackedEnable(...a); };
  return { calls, base };
}

test("enable success: success status + '<Item> synced (encrypted).' toast", async () => {
  const { calls, base } = harness();
  await runSyncToggle({ ...base, enabled: true });
  assert.ok(calls.status.some(([m, t]) => t === "success" && /Synced to 2\/3 relays/.test(m)));
  assert.deepEqual(calls.success, ["Wallet connection synced (encrypted)."]);
});

test("conflict: keep-newer status, no success toast, no rollback", async () => {
  const { calls, base } = harness({ enableResult: { ok: false, conflict: true } });
  await runSyncToggle({ ...base, enabled: true });
  assert.ok(calls.status.some(([m]) => /Kept the newer copy/.test(m)));
  assert.deepEqual(calls.success, []);
  assert.deepEqual(calls.toggle, []); // not rolled back
  assert.equal(calls.disable, 0);
});

test("nothing-to-sync: rolls back toggle, disables, shows the empty hint", async () => {
  const { calls, base } = harness({ enableResult: { ok: false, error: "nothing-to-sync" } });
  await runSyncToggle({ ...base, enabled: true, emptyHint: "Connect a wallet first." });
  assert.deepEqual(calls.toggle, [false]);
  assert.equal(calls.disable, 1);
  assert.ok(calls.status.some(([m, t]) => t === "error" && m === "Connect a wallet first."));
});

test("preEnableConfirm rejected: rolls back toggle, never calls enable()", async () => {
  const { calls, base } = harness();
  await runSyncToggle({ ...base, enabled: true, preEnableConfirm: async () => false });
  assert.deepEqual(calls.toggle, [false]);
  assert.equal(calls.enable, 0);
});

test("disable: clears + 'sync turned off' toast", async () => {
  const { calls, base } = harness();
  await runSyncToggle({ ...base, enabled: false });
  assert.equal(calls.disable, 1);
  assert.deepEqual(calls.success, ["Wallet connection sync turned off."]);
});

test("restore imported: success status + toast + onImported re-render", async () => {
  const { calls, base } = harness({ pullResult: { found: true, imported: true } });
  await runSyncRestore({ ...base });
  assert.ok(calls.status.some(([m, t]) => t === "success" && /Restored/.test(m)));
  assert.deepEqual(calls.success, ["Wallet connection restored."]);
  assert.equal(calls.imported, 1);
});

test("restore not found: 'No synced settings found' status", async () => {
  const { calls, base } = harness({ pullResult: { found: false } });
  await runSyncRestore({ ...base });
  assert.ok(calls.status.some(([m]) => /No synced settings found/.test(m)));
  assert.equal(calls.imported, 0);
});

test("storage vs wallet produce the SAME message shapes (just the label differs)", async () => {
  const w = harness();
  await runSyncToggle({ ...w.base, itemLabel: "wallet connection", enabled: true });
  const s = harness();
  await runSyncToggle({ ...s.base, itemLabel: "storage settings", enabled: true });
  assert.deepEqual(w.calls.success, ["Wallet connection synced (encrypted)."]);
  assert.deepEqual(s.calls.success, ["Storage settings synced (encrypted)."]);
});
