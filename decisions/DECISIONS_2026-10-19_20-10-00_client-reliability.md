# client-reliability-1: classify the profile-modal timeout

- Product/test source unchanged between filedAt 8b204687 and startup HEAD 9e6c310d.
- Clean-environment 60s/file run reproduced timeout. Per-scenario tracing then completed all 26 scenarios naturally in 57041.55ms; no blocked await or retained resource was found. Timing near the bound varies with cold/warm JSDOM style caches.
- CPU profile of the Escape scenario points to CSS color/border normalization and computed-style resolution. The full markup has many controls; updateFocusTrap asks JSDOM for a full computed declaration for each control on repeated pane refreshes.
- Fix only the stylesheet-free test fixture: virtualize display/visibility, with explicit fixture CSS and a new native-JSDOM contract scenario. Preserve every existing assertion and real controller, focus events, DOM and pane operations. No timeout/retry/sleep/runner or product change.
- Regression compares fixture/native style filtering for visible, disabled, CSS-hidden, inherited-visibility-hidden, aria-hidden, and hidden-type controls, then checks actual Tab event focus wrapping.
- Limits: fixture does not model application CSS/layout. This suite never loaded those styles; browser and build checks are not required for this test-only fix. No release, browser, signer, network or wallet qualification claimed.
- Slowdown: initial cold worktree lacked dependencies; cached offline install resolved it. Native DOM assertion diffs made the first mutant diagnostic expensive; comparing control IDs yields a bounded useful failure. Tool improvement: show per-scenario start/end timestamps when a file exceeds its diagnostic bound, distinguishing slow progress from a blocked await.
