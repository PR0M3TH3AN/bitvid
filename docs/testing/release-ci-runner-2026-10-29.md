# Release CI runner compatibility correction

Candidate a2dbaccc CI run 40896227464 failed all browser-installing jobs before tests: Playwright reports `does not support chromium on ubuntu26.04-x64`. The lint suite, app build, archive and DM checks passed separately. This is not a browser assertion result or a resolution of the earlier Firefox failures.

Pin only build, visual-regression, e2e-tests and e2e-headless runner definitions to ubuntu-24.04, which is explicitly supported by the installed Playwright registry and native dependencies. Matrix coverage, assertions, retries, timeouts, steps and deploy gating are unchanged. The broader duplicate-build/browser-job simplification remains deferred for timing-based evaluation.

Validation: exact four-line runner-only workflow delta verified; normal landing gate and hosted corrected-candidate CI results are recorded separately in the release evidence directory. Never treat unsupported-runner failure as a passing test suite.
