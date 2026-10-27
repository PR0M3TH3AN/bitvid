# QA4 post-restart checkpoint

HEAD `0ffd92a8d2072a19fe61ac6edcf5097a9538fddd`; QA4 re-claimed, QA3 remains blocked on unavailable CI-equivalent failing evidence. Existing dirty notes and original failed result retained.

- Read primary Oct26 RULE-CHANGES and updated COMMON following interpreter grant20261026T190751. One corrected360 A/B permitted only after fresh installed health OK. Old75C/load8 blanket prerequisite superseded for this bounded run; 85C CPU threshold preserved.
- Startup ready deps missing0, TCPU90.1C. Subsequent health19:08:21 TCPU77.1C/RAM65% but tight swap-in3pages;19:08:42 TCPU79.1C/RAM63.8% but tight swap-in1page. No launch while verdict tight; no unrelated process stops or config override.
- Independent archive byte/SHA256/SHA512 verification3/3. Original runnerce95cf5c/result868e6dd8 and corrected runner593fc055 digest checks3/3. Expected HEAD/source/unique output guards pass. Corrected runtime not yet executed.
- Read-only source review: css/components/js/index.js unchanged versus QA4 filedAt; animationend/animationcancel cleanup still removes fade-in. No conclusion on missed event timing or causal fix.
- Pending: one corrected actual-app/native UI A/B, strict widths, resources cleanup, independent reproduction/ownership. Historical362/360+394/390 overflow remains open; real-device/AA/CI/live playback unverified. No product/CSS/test/helper/config edits, commit/merge/submission/build/full-suite.

Saved UTC 2026-10-26T19:09:04.589658+00:00
