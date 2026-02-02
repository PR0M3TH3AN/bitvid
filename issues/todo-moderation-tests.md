# TODO: Investigate flaky visual regression tests

**Source:** `tests/visual/moderation.spec.ts`

**Context:**
Visual regression tests for moderation features (blurring, blocking autoplay, trusted lists) are currently commented out or failing in headless mode due to:
- Visibility checks failing (`await expect(...).toBeVisible()`)
- Click timeouts

**TODOs:**
- Investigate why visibility check fails in fixture environment (headless)
- Investigate why click times out in fixture environment (headless)

**Next Steps:**
- Run tests in docker container using `./scripts/run-playwright-docker.sh` to reproduce.
- Debug the fixture environment or wait conditions.

## Visual Regression Flakes
- `tests/visual/overlay-layers.spec.ts`: "mobile sidebar shares desktop rail behavior" skipped due to timeouts waiting for `#sidebar` to lose `fade-in` class.
