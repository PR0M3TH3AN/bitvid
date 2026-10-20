# QA2: cold-feed fixed; original overflow failure and separate completed coverage

Actual app tested: unstable b1174163556e2705ba85868e21adcaf51b44bd5f, dispatch build6da89895.
Dispatch supplied explicit exclusive browser grant16:22:06; QA START16:25:27, runner16:25:30.066→16:25:33.901 UTC (3.835s).
All owned context/browser/app+relay servers closed at end; RELEASE16:25:47; dependency symlink removed.
No browser, server or build was run during the prior client7 gate hold. Blocked on fix/artifact from16:08:41 to grant16:22:06 (13m25s).

Original failure below is preserved. Dispatch subsequently authorized one geometry check plus independent remaining coverage; see follow-on below.

## Original run result and limits

`node /tmp/bitvid-playback-qa-2-final/noninteractive.mjs` process exit0 means controlled cleanup, **not baseline success**.
JSON baseline is blocked-or-failed:9 completed steps and1 failed step. Chromium154.0.8037.97, fresh360×800 context:

- Genuine canonical browser toolkit/signature/tamper/independent-Node checks passed; application readiness and existing fixture relay alignment passed.
- Original cold-feed assertion passed: exactly3 genuine signed synthetic events became actual cards within15s, without manual refresh/render/cache/card injection. This verifies the former measured cold-feed symptom on the fixed build, with canonical fixtures.
- Test identity login and360 Trending fit passed: documentWidth360, all3 cards x76.796875/right347.203125/width270.40625.
- Actual Explore, For You and Trending clicks/hash transitions passed. Headings captured; no claim of complete feed content correctness for those views.
- Profile open,6 keyboard tabs contained within modal, close and exact profileButton focus restoration passed.
- Upload opened in External Link mode;6 tabs contained, native empty-title rejection, exact missing-source error and unchanged relay video-event count all passed before the subsequent layout assertion failed.
- First failure: **Upload horizontal document overflow**. Full-page screenshots are362px wide at a360px viewport; feed/Profile screenshots are360px. Exact failed DOM scrollWidth and offending element bounds were not persisted because the assertion threw before returning layout. Do not invent a culprit or precise CSS fix from this evidence.
- Screenshot also shows Upload title/error-banner overlap; captured visual observation, no separately isolated cause.
- Remaining Upload close/focus restoration, Home navigation,390×844 and1280×720 checks were NOT EXECUTED. QA2 remains blocked/incomplete, not closed as successful. No product/CSS/helper/config/test changes.

Visible controls below44px are observations, not an invented failure threshold: e.g. sidebar35.1875, theme32, profile/upload38.390625, card buttons32.

[Feed](playback-qa-2-360-feed.png), [Profile](playback-qa-2-360-profile.png), [Upload failure](playback-qa-2-360-upload-validation.png), [stop](playback-qa-2-final-stop.png).
[Exact report](playback-qa-2-final-result.json), [exact driver](playback-qa-2-final-driver.md).
Report SHA2568434598bc187e203c313c2378e94d3beec853293471de987853af87dbe9eb31f.

## Provenance and fidelity

Fresh private frozen snapshot830files; full manifest SHA2562747d37916362971a5abe05db4018adf31b5c7031b48d8e4bd6eb1e19b9fa927.
All830file bytes verified before server start; supplied index78f8bb3d5ed2a92b5ab388eb9e9c3afd2a475e4525fa6ea23c454ffb0ac8cf40,
CSS283d04642d201edba1e9bd5cbc3ede8d74fbd11b50ff0cd2732d463847d2adf3,
nostrService d23884c8ec46d51ca602de9548e17b417975d6de08fa30d6a6fae76070c573ae all match dispatch pins.
First preparation selected nonexistent css/tailwind.css and ambiguously found duplicate equal-hash generated copies; assertion failed before copying/browser. Corrected to actual index-linked css/tailwind.generated.283d04642d201edb.css; no product change.

Canonical established fixture s=nostr:dTag was added explicitly per dispatch; original failed no-s inputs remain in prior evidence/source/commits. Cheap actual-runner seed-loop preflight:3 unique events,3 schema-valid,3 genuine signatures,3 tampered rejected,3 canonical s tags; exit0. This changes input fidelity, so not a same-input before/after claim. Client7 owns controlled service regression/mutants; QA observed actual DOM after fix.
Profile source uses requestAnimationFrame for restoration; exact bounded focus wait was added before unchanged expected-trigger assertion. Actual Home anchor is index.html with accessible name Return to the bitvid home page; added original required Home action to runner, but not reached.
Runner syntax check exit0. No new retained test/assertion changes, retries or sleeps; no mutant required for these evidence-only files.

Existing genuine VP8 fixture d911005a5bca7fb1f3e5aa2fbee701b6476c9baf93460264c2aa5105dd0b3c69 (1019bytes): actual local HEAD200/GET200/Range206 passed. Fixture not played; no actual playback/decoding/WebTorrent/live-service claim here.
Only exact Buffer CDN URL fulfilled once with previously pinned genuine cached bundle (not CDN-byte equivalence).15 nonlocal HTTP and4 nonlocal WebSocket attempts blocked, including auth fallback/robohash/relay attempts;0 external requests allowed.0 pageerrors,0 failed local HTTP. Private ports31847/31848/31849; preview3000 untouched. No real signer/wallet/cloud/peers.

## Follow-up routing

Dispatch notified first failure plus release; client-reliability notified actual cold3card pass. Possible next owner scope is upload modal/CSS layout, requiring dispatch routing and bounded exact DOM measurements before a fix. QA did not reopen browser or patch product. Original baseline remains required after resolution; stop-milestone review cannot claim these unexecuted checks passed.
Historical evidence: [cold render gap](playback-qa-2-render-gap.md), [prior interventions](playback-qa-2-second-pass.md).

## Separately authorized geometry and remaining coverage

Dispatch16:26:39 authorized exact Upload geometry; if minor and usable, continue independent remaining checks while preserving original failure. START16:27:42, runner16:27:44.416→16:28:10.112 UTC (25.696s); RELEASE16:28:25; all owned resources closed and dependency link removed. No product/CSS edits or build/full-suite run.

`node /tmp/bitvid-playback-qa-2-final/follow-on.mjs` exit0, report explicitly says follow-on coverage completed; original360overflow remains failed/open.25 completed steps,0 hard failures. This is separate diagnostic coverage, **not a passing original baseline**.

| Viewport | Document client/scroll width | Body client/scroll width | Panel client/scroll width | Outcome |
|---|---|---|---|---|
|360×800|360/362|360/362|360/360|2px document overflow, usable controls|
|390×844|390/394|390/394|390/390|4px document overflow, usable controls|
|1280×720|1280/1280|1280/1280|502/502|No document overflow|

ScrollX/Y=0/0 for all samples. Modal root fits viewport.360 control bounds:inputs/publish x38.375→321.625, close283.21875→315.21875,y41.578125→73.578125; successful actual close and uploadButton focus restoration.390 close313.21875→345.21875; successful real close/focus. Inputs were actually filled, native required validation and missing-source message observed, invalid submission did not add relay video events. At desktop the scrolled form URL has negative y; actual prior fill/tab and close work, not all controls claimed simultaneously visible.

All3 viewports completed Trending feed exactly3/cards within viewport, Explore/ForYou/Trending navigation, Profile6Tab containment+close+trigger focus, Upload6Tab containment/title+source validation/no publication/close+trigger focus, and actual Home anchor navigation returning exactly3 cards. Home reload uses real app startup and persisted existing test-mode flag; no manual refreshFeed/render/card injection. Feed widths360/390/1280 fit. Touch-control size observations retained in JSON; no invented44px acceptance change.

Raw offender list includes unlabelled SPANs with large bounds even at desktop (where no document overflow), likely clipped/animated descendants. It does not isolate the cause; no culprit or CSS fix inferred. The diagnostic heuristic >16px or critical horizontal control outside viewport only decides whether to stop follow-on, not a new tolerance for original strict overflow assertion. Original2px failure and mobile4px finding remain open. Header/error overlap is visual observation, not independently isolated severity.

[Full follow-on report](playback-qa-2-follow-on-result.json), SHA2560c8b8eff287e06d47dc830425b258d969bc71eba1f07870b6b9dc88bc5819200; [exact separate driver](playback-qa-2-follow-on-driver.md).
Screenshots for each viewport use playback-qa-2-follow-on-{360,390,1280}-{feed,profile,upload-validation}.png.
4 exact genuine Buffer mirror fulfillments (initial plus3 Home reloads),53 externalHTTP/16 externalWS attempts denied,0 allowed external traffic,0 pageerrors,0 failed localHTTP. Real cloud/signers/peers/deployed CDN/full offline operation remain unverified; no actual media playback/decoding in QA2. Browser closed; dispatch to integrate open minor finding and local-review coverage. No optional CSS work started.
