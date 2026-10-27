# QA4 separate causal A/B attempt — blocked by reconstructed runner

Source HEAD/unstable `0ffd92a8d2072a19fe61ac6edcf5097a9538fddd` printed by git. Interpreter mailbox20261026T151946 grants one separate360x800 A/B after freshhealth;152449 permits bounded health rechecks. Client offline only/dispatch source-only, no competing browser recorded. No product/CSS/retained tests/helpers/config edited.

## Preparation and command

Durable reproduction directory: `/home/user/.local/state/agent-fleet/bitvid/evidence/playback-qa-4/ab-20261026/` contains prepare.py, README.md, run.cjs, entry.mjs, genuine extracted package sources, buffer.mjs, verified-provenance.json, bundle-provenance.json, health-snapshots.jsonl and result.json. No sole reliance on /tmp. Existing original dirty QA evidence retained.

`python3 .../ab-20261026/prepare.py` exit0: all3 restored genuine archives independently verified byte count+SHA256+SHA512 before any extraction. Existing dispatch esbuild0.27.3 produced Buffer mirror65583bytes, SHA256ff1c4a2377a9df17eaffa1f5b00da3d835f748f3d832a0490bd309756434f73d; absolute-path comments differ from historical bundle, no claim of output byte equality. Runtime Buffer API sanity6/6. CSS hash283d0464 and two relay source hashesab11b299 match prior pins; relevant CSS/template/buildsource diff d9424fb7..HEAD exit0. No download/install/productbuild.

`node --check /home/user/.local/state/agent-fleet/bitvid/evidence/playback-qa-4/ab-20261026/run.cjs` exit0. Runner SHA256ce95cf5c8ae04db564e38569859a750403ccb8f5b6505c8e19ae8eb3017c8e69 preserved exactly after execution.

Prelaunch health15:25:13.754Z max74C/load6.15/availableRAM61.5%/battery70%49min, satisfying explicit short-run grant. Earlier15:22:58 load17.23 and15:24:11 max76/load8.74 were held, no launch. START.task written before execution. No unrelated process stopped.

Exact command: `node /home/user/.local/state/agent-fleet/bitvid/evidence/playback-qa-4/ab-20261026/run.cjs` from own worktree, approved host execution. Natural exit1. START15:25:27.773Z; runtime15:25:28.223Z; RELEASE15:25:46.532Z (18.759s total). Chromium145.0.7632.6. Result SHA256868e6dd80a0887dce319b5a2a9e5f0be083721541a1f5820d306b8bfe12134a9.

## Exact first failure and interpretation

`page.waitForFunction: Timeout 15000ms exceeded` at run.cjs:84, after native I Understand locator.click resolved. Predicate incorrectly requires `disclaimerModal.hidden && dataset.open === "false"`. Source js/ui/components/staticModalAccessibility.js:125-143 uses `classList.add("hidden")` and data-open=false, rather than the HTML hidden property. This reconstructed-runner mistake makes the wait incompatible with normal source behavior. The run did not capture disclaimer DOM at failure, so do not claim it independently measured the closed state or a product disclaimer regression.

A second independently visible setup mistake: routeWebSocket compares ws.url() exactly with `ws://127.0.0.1:31865`; recorded actual URL is `ws://127.0.0.1:31865/`. All8 local-relay attempts were denied by this faulty allowlist. These8 are LOCAL attempts, not public-network attempts; no remote WebSockets were recorded. The guard continued to deny other public WebSockets, but local relay functionality was not qualified.

These two runner defects were identified after natural exit via source/result inspection only. Executed runner/results remain unchanged. At the first failure checkpoint no corrected script was created/executed and no retry occurred. Later source-only preparation is recorded below. A future independently reviewed preparation can normalize and compare allowed WebSocket URL components (only localhost31865 path/) and wait for class-hidden plus data-open=false; it must preserve exact public-deny scope and receive a distinct run grant/path. No longer timeout/force click/skip disclaimer/forced UI state substitute is justified.

Counts: browser1/context1; actual applicationContext.getApplicationReady plus app/harness/videoList readiness1; resolved disclaimer native click1 but successful closed-state check0; Upload0, wheel0, checkbox native clicks0, interventions0, A/B comparisons0, width runtime assertions0, product edits0, tests/builds/submissions0. Pageerrors0. Genuine Buffer route served1; public HTTP denied10; localWS denied8. No fixture login/relay seeding/publishing/media/cloud action reached.

Cleanup awaited context, browser, relay and server closure; tracked app sockets0, resourcesClosed=true. No separate OS socket inventory was taken. Private app31864/relay31865 only; preview3000/peers untouched. Durable evidence/dependency sources retained, no temporary runtime process intentionally left running. Slot RELEASED. No continuing browser qualification implied.

## Remaining evidence boundary

Original horizontal overflow362/360 and394/390 remains open. Previous native checkbox interception1/1 and prior width passes remain historical observations, not results of this attempt. Causal A/B, startup listener timing, original overflow cause, Firefox CI-equivalent failure, other viewport/device parity and real-device/AA remain unverified. No product/CSS fix recommendation follows from this setup failure. Independent causal reproduction and explicit ownership routing remain required before implementation.

Recorded UTC: 2026-10-26T15:26:56.714504+00:00

## Interpreter-directed corrected preparation (no runtime)

Mailbox20261026T152632 explicitly requests source-only diagnosis/proposal, no immediate rerun. Separate durable `.../ab-20261026/corrected-prep/run.cjs` prepared with exactly two predicate substitutions: normalized URL href equality for the intended local WS root, and classList hidden + data-open=false for disclaimer closure. `node --check` exit0; runtime not executed. SHA25614f327b92c7adb4373761dece9359158300f944ab2270781e87de64ac5ed9181. Supporting Buffer/provenance copies are byte-identical to parent. README records exact future command and requires NEW explicit grant/fresh health/START. Existing A/B preconditions, strict widths, points/geometry, publicdeny and awaitedcleanup unchanged.

After preparation original runner SHA256ce95cf5c and result SHA256868e6dd8 rechecked unchanged. No second browser/server launch, no A/B attempt or product changes. Post-release health15:26:59 max72.9C/load5.35/RAM62.1%/battery66%41min is advisory, not permission for another run. .task records RELEASE plus proposed preparation READY awaiting new routing.

Mailbox20261026T152816 authorizes corrected preparation only, with stronger prerequisites. Updated prepared SHA256593fc0556257e1943f61e9496d3fcd5b906dee9025ccbb6368f7ea26d78fc5f2: exact WS protocol/hostname/port/rootpath plus empty search/hash/user/password; disclaimer class hidden+data-open=false+computed display none+hasSeenDisclaimer=true following genuine button click. Source js/disclaimer.js hide writes hasSeenDisclaimer=true; staticModalAccessibility.closeStaticModal adds CSS hidden/data-open=false. Two original lines replaced, all other assertions/deadlines unchanged. Prior prepared14f327b9 was never executed; updated preparation also runtime0. Await NEW grant.
