# QA3 Firefox CI investigation — first checkpoint

**Disposition:** blocked, not fixed/done. Dispatch20261022T142307 accepted this bounded checkpoint and stopped further Firefox reruns. Public CI184passed/2failed/3flaky remains open; actual serial local runner3/3 passed without retry. No causal defect was established. Need new actionable CI-equivalent failure evidence; public logs403 and no E2E artifact limit investigation. Evidence-only checkpoint approved for normal docs queue; no product gate or new browser work is implied.

2026-10-22. Current HEAD `c5b678f7c9d0b92fbf786b16ae831f1be1d0b899`; filed CI SHA `fb54cea3a2ba99b4860421724a5050af6b97c293`. Own clean branch fast-forwarded to unstable, no unique commits discarded. Relevant original view modules and runtime-coverage spec have zero diff between these SHAs. QA3 claimed; implementation remains unrouted.

Plan: identify exact CI failures through public metadata; inspect original scenario and view wiring; run one narrow Firefox diagnostic with all external traffic denied; preserve first result and release resources; route any further environment preparation or demonstrated fix through dispatch. Product, existing tests, helpers, and configuration remain read-only.

## Public CI evidence

Unauthenticated GET job119013565277 in run39536282396 succeeds. Head SHA matches filedAt. Job `e2e-tests (22, e2e-firefox)` failed at step9, `Run deterministic E2E suite (e2e-firefox)`; build and browser install passed. Workflow command is `npx playwright test tests/e2e --project=${{ matrix.project }}`. Current config enables one CI retry; no local retry was used.

Public check annotations endpoint returned13 entries. Summary:184 passed,2 failed,3 flaky in15.8minutes. Terminal failures, including their original attempts and CI retry:

- `runtime-coverage-expansion.spec.ts:73`: For You `profileShows` expected to contain `hashtags`, received `[]`.
- Same file line156: Kids `emptyInitial` expected true, received false.

Three flaky tests had `browserContext.newPage`/page setup120000ms timeouts: notification-system line84, profile-management line49 and line126. These are distinct from terminal assertion failures. The known feed hydration flake is not established as the cause.

Logs endpoint returned HTTP403 (curl exit22). Artifact listing returned one artifact, `dist-hashes-current`; no retained Playwright trace/report artifact was listed. Check output summary/text are null, but annotations provide the assertions above. No credentials, rerun, or remote write used. Initial sandbox DNS failure was resolved by approved read-only network escalation.

## First local controlled result

Command `node /tmp/playback-qa-3-run.cjs`; Node22.23.1, existing read-only Playwright1.58.2 dependencies, Firefox146.0.1. Scratch HTTP server private31857 serves this worktree. Existing spec imported through Playwright's TypeScript transformer with only its test registration import replaced by a collector; exact first three test callbacks/assertions execute against fresh Firefox contexts. Coverage/console fixture is not executed; no full-run concurrency, build or CI environment equivalence claimed.

Initial sandbox bind failed EPERM before browser start; approved escalation then executed once. Measured run14:11:11.923→14:11:17.342UTC:3/3 original view scenarios passed (For You, Explore control, Kids). Node exited naturally0. All owned browser/context/server resources closed in finally; preview3000 untouched. Driver contains no retries, sleeps, assertion weakening or forced exit.

Three external requests, all exact Buffer CDN import, were blocked. No external HTTP/WebSocket allowed. No pageerror events recorded. This prevents the full application module graph from booting, so these results establish only the original view scenarios with blocked bootstrap. They do not reproduce, fix or clear the CI failures, and are not actual-app qualification. Original CI failures remain open. Exact first result is retained in `playback-qa-3-local-first-result.json`.

## Blocker and next boundary

Dispatch notified CI assertions and resource release. Further browser work awaits routing/resource grant for genuine offline dependency preparation and app/DOM interference measurement. No fake Buffer, substituted product behavior, public fixture traffic, real signer/relay/media/cloud, product/test/helper/config edits, full suite or build used. CI browser version, full logs, concurrency/resource conditions, cause and actual-app behavior remain unverified. No new retained test was added, so no mutant claim is made.

## Authorized cached-artifact preparation: missing bundle

Dispatch message20261022T141235 authorized reuse of the genuine cached Buffer artifact only, matching prior QA provenance/hash, followed by app readiness and isolated-view controls. It explicitly requires reporting a blocker if the artifact is missing. No new browser was started.

Prior durable `playback-qa-2-assets-plan.md` and `playback-qa-2-second-pass.md` identify a65405-byte locally bundled genuine npm Buffer6.0.3 artifact, SHA256 `507a593508c51d1397a9a5818ad0b8dbf7e3ad810feaa87cabff87ff56cf3984`. Its old QA scratch directories (`/tmp/bitvid-playback-qa-2-assets`, `-snapshot`, `-integrated`, `-final`) are absent. Filename inventory of `/tmp`, fleet state and relevant repository paths found no reusable Buffer bundle. Existing source polyfill files reference the remote CDN; they are not the bundle.

`npm cache ls buffer base64-js ieee754` exited0 and lists the three original versioned tarball cache keys. These are source packages, not the approved built artifact; no extraction, install, rebundle, substitute, external fetch or browser execution followed. Dispatch was asked to identify a surviving exact-hash prepared artifact or route offline reconstruction separately. The conditional browser grant has not been consumed; browser/expensive resources remain released. Actual app readiness, original CI assertion reproduction and root cause remain unverified.

## Separately authorized offline reconstruction and readiness controls

Dispatch20261022T141453 explicitly authorized offline reconstruction from the three exact cached upstream packages. Cache SHA512 matched cached registry metadata and cache integrity for3/3; historical tarball and index.js SHA256 pins matched3/3. Safe extraction admitted regular package files only, rejecting traversal and links. Existing read-only esbuild0.27.3 bundled precisely buffer6.0.3/base64-js1.5.1/ieee7541.2.1 plus the scratch entry, with no fetch/install scripts/product changes. New output65331bytes SHA256 `2f1f8730af8c9fb08068a41c9c18356b9f48f21635fe5deed6d17fc6b9b97be7` differs from historical65405bytes/507a; no byte-equivalence claim. Native-Node comparisons/API probes passed6/6: exports, UTF8, base64, shared subarray backing, float64 bytes, typed-array hex. Provenance and output report retained beside this note.

Granted command `node /tmp/playback-qa-3-ready-run.cjs` ran14:16:24.113→14:16:35.031UTC at the same QA HEAD. Firefox146.0.1, private31857, fresh contexts. Exact CDN Buffer import was fulfilled3 times with the verified reconstructed artifact; all other public HTTP/WebSocket attempts denied. Node exited naturally0; all owned resources closed, RELEASE sent. No pageerrors recorded. No broad/full suite/build or test retry used.

With explicit `getApplicationReady()` resolution, actual application object, harness and videoList readiness required before the original callbacks, all three scenarios passed3/3. Each observed Trending heading and one videoList before DOM replacement. Separate inert-document isolated-view controls passed3/3. Original assertions unchanged; exact drivers and result JSON retained. This adds app-readiness timing relative to original CI `networkidle` only, so it does not prove CI equivalence or root cause and does not erase either terminal CI failure. No control establishes real relay, signer, cloud, playback, CDN or production behavior.

Next proposed causal measurement sent to dispatch: retain original networkidle-only timing with verified Buffer, passively trace document/container replacement and application-context identity while executing original callbacks. This would distinguish app-bootstrap interference from view behavior without weakening assertions or adding readiness waits. It has not yet run; browser resources remain released pending routing. CI concurrency, exact browser version and logs remain unavailable/unverified.

## Approved original-timing causal diagnostic

Dispatch20261022T141750 granted the original networkidle-only timing with passive DOM/application traces. Command `node /tmp/playback-qa-3-causal-run.cjs > /tmp/playback-qa-3-causal-stdout.json` ran14:18:54.853→14:19:02.503UTC, exit0, Firefox146.0.1, same HEAD/verified Buffer/private31857/public-deny boundary. No readiness waits, sleeps, retries or original callback/assertion edits. All3 scenarios passed3/3; CI terminal failures remain unreproduced. Browser/context/server closed naturally; RELEASE sent.

Passive traces assign identity1 to app videoList, identity2 to body, identity3 to replacement fixture videoList. Each original callback replaces the body's content; each view initializer then resolves connected fixture node3. All initial empty states are observed and all expected actions/transitions pass. App feed loading/render writes occurred before fixture replacement; no app-driven videoList/root replacement during the measured callbacks is observed. No evidence yet supports a causal race fix. Instrumentation wrappers preserve getter/setter values but their execution overhead remains an environmental difference.

Post-result application-context sampling is not exact-assertion sampling: For You has application false because its original callback explicitly calls setApplication(null); Explore/Kids application true. Harness is present and one videoList remains in all3. This cannot rule out unobserved context changes at other times and must not be presented as proof of CI app identity. Buffer fulfillment3, pageerrors0; all other public attempts denied.

Inspected original instrumentedTest: Firefox does not start JS coverage; console/pageerror capture requires environment flags; no additional readiness waits or before-test app setup is supplied. Scratch VM registration still differs from actual Playwright fixture/worker execution. Results retain unchanged source callbacks but do not reproduce CI concurrency, browser revision, CDN transport, fixture execution or full runner. No product/test/helper/config fix is justified from these passing local measurements. Proposed next bounded diagnostic, not yet run: actual original Playwright runner/fixture with external network guard and exact three selectors to remove the scratch registration difference. Resources released pending dispatch routing.

## Approved actual Playwright runner checkpoint

Dispatch20261022T142037 authorized exact runner/fixture diagnostic with scratch overlay and exactly3 tests. Preflight `--list` exited0 and selected only For You line4, Explore line79, Kids line120 in one copied spec. Copy differs from original solely in its registration import pointing to a scratch auto network guard; that guard extends the actual original instrumentedTest. Original callbacks/expectations and instrumentation/globalSetup source are unchanged.

Execution command (stdout redirected to owned scratch):

```sh
env -u NODE_TEST_CONTEXT NODE_PATH=/home/user/Documents/GitHub/bitvid-dispatch/node_modules node /home/user/Documents/GitHub/bitvid-dispatch/node_modules/playwright/cli.js test -c /tmp/playback-qa-3-runner/playwright.config.ts --project=e2e-firefox --grep 'exercises (for-you|explore|kids) view' --workers=1 --retries=0
```

Natural exit0. Start14:22:01.436UTC, duration9955.026ms;3 passed,0 unexpected,0 flaky,0 skipped, one attempt each. No readiness wait or passive DOM wrappers were added to this execution. Runner owns/stops its private31857 webServer; post-exit process inventory showed only checking shell/sandbox command lines, no node server process. An independent socket check was sandbox-denied and is not claimed as port verification. RELEASE sent; no other server/preview was touched.

Explicit environment differences: source checkout rather than CI install/build; existing read-only Playwright1.58.2/Firefox146.0.1 dependency/browser; NODE_PATH resolution; scratch testDir/output and list+JSON reporter; private31857/baseURL; blocked service workers and all nonlocal HTTP/WebSocket; verified reconstructed genuine Buffer fulfillment; workers1 and retries0 instead of CI defaults/retry1. Original http-server dependency is absent locally, so the authorized scratch overlay uses the same prior Node static server (MIME/path serving) rather than installing it. Original global setup absolute path and instrumentedTest/coverage helper are preserved. No coverage/console-capture environment opt-in was added. These differences preclude whole-CI parity claims.

Retained JSON report, stdout, and exact scratch overlay/guard/server are beside this note. All previous first results remain intact. No product, existing test, helper or configuration file changed. No demonstrated causal defect or fix proposal yet; CI failures remain OPEN/unreproduced, with precise public annotations preserved. Further execution awaits dispatch disposition; no retries/concurrency ramp/broad suite/build planned autonomously.
