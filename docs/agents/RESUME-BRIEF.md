# Resume brief — 2026-10-19 approved worker startup

## Goal and authority

Read fleet/GOAL.md and PROGRAM.md. Robustness/usability/TODO work is authorized. First client-reliability worker and routine local staffing/fixes/tests/builds/landings approved through Codex desktop chat relay; no deploys, spending, production data, real-wallet operations, or schedulers.

## Mid-flight

| area | item | state | next step |
| --- | --- | --- | --- |
| dispatch | dispatch-2 | active coordination | roster landed 9e6c310d; one worker running; monitor results, owner updates, and preview refresh |
| client-reliability | client-reliability-1 | running in fleet-bitvid:client-reliability | classify/fix reproducible profile-modal suite timeout, preserve assertions, mutation-check regression and run full gates |

## Evidence and local preview

Baseline product SHA d9059116; startup docs landed through 3e451aac. Lint 11/11; 219 unit files exited 0 before file 220 (profile-modal-controller) timed out at 60s; 205 files untested. Isolated unrestricted and clean-env reruns timed out. No client fix yet.

Preserve fleet-bitvid:preview serving dispatch dist at http://127.0.0.1:3000. After verified changes land, update dispatch from unstable and rebuild locally. No scheduler activation or extra worker launch implied.

## Bootstrap exception

One administrative roster/brief commit uses temporary exact-scope validation because the worker's assigned existing hang blocks full-suite completion. Persistent gate settings, product code, and tests must be unchanged. Subsequent code uses normal full gates. No additional owner approval pending within routine scope.
