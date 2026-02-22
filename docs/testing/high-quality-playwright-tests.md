# High-Quality, Low-Flake Playwright Testing Guide

This guide defines how we write and evolve Playwright tests in bitvid so they stay reliable while increasing coverage.

## Goals

1. Catch user-visible regressions early.
2. Keep CI signal trustworthy (low flake rate).
3. Improve runtime coverage with deterministic tests, not brittle ones.

## Core Principles

1. Test behavior, not implementation details.
2. Prefer deterministic setup over live-network dependence.
3. Wait for explicit app state, not arbitrary sleep.
4. Use resilient selectors and scoped locators.
5. Keep assertions strict on outcomes, flexible on timing and non-critical internals.

## Determinism First

Use the existing harness and fixture stack:

- `tests/e2e/helpers/bitvidTestFixture.ts`
- `window.__bitvidTest__` APIs in `js/testHarness.js`

Prefer these patterns:

1. Use seeded relay data instead of remote relays.
2. Use programmatic login (`loginAs`) instead of manual UI auth for most tests.
3. Use harness APIs to force edge conditions (`setSignerDecryptBehavior`, relay overrides).
4. Open complex modals via deterministic controller/harness methods when available.

Why: nondeterministic setup is the top source of flaky tests.

## Selector Strategy

1. Prefer `data-testid` selectors.
2. Scope locators to visible/active containers when duplicates can exist.
3. Avoid broad selectors like `button` unless nested under a stable root.

Example:

- Better: `#playerModal #closeModal:visible`
- Worse: `#closeModal` (can resolve hidden duplicate elements)

## Waiting Strategy (Do This, Not That)

Do:

1. Wait for explicit state changes (`data-open="true"`, absence of `.hidden`, expected text/attribute).
2. Use `waitForFunction` only with concrete conditions and clear timeouts.
3. Add fallback action paths for known intermittent UI event misses when justified.

Avoid:

1. `waitForTimeout(...)` as primary synchronization.
2. Assuming a click always opens a modal immediately.
3. Chained interactions without state confirmation between steps.

## Modal Testing Pattern

Recommended flow:

1. Trigger modal open via deterministic helper (harness/controller), fallback to UI click.
2. Wait for modal-open condition.
3. Assert visible + semantic state (`role`, `aria-modal`, `data-open`).
4. Interact with modal.
5. Close modal and verify closed state.

If your tests repeatedly fail opening the same modal, add a harness helper for that modal instead of adding sleeps.

## Accessibility Test Stability

Accessibility tests are especially prone to timing flake. For keyboard and modal tests:

1. Ensure focus target exists and is visible before key presses.
2. Prefer element-scoped key actions (`locator.press("Enter")`) over global keyboard when possible.
3. Verify modal opened before asserting internals.
4. For Escape-close tests, first confirm modal open state deterministically.

## Coverage Without Brittle UI Tests

Not all coverage gains require full UI choreography.

Use runtime module tests in browser context for pure/mostly-pure modules:

1. `page.evaluate(async () => import("/js/module.js"))`
2. Execute exported APIs with deterministic inputs.
3. Assert normalized outputs and edge cases.

This is effective for utilities, state transforms, and view-logic modules that are hard to reach through full flows.

## Anti-Patterns to Avoid

1. Duplicate clicks on close/open controls “just in case.”
2. Assertions that only check element attachment but not visible state when visibility matters.
3. Overly permissive assertions (`expect(x || true).toBe(true)`) unless documented as intentional.
4. Tests that rely on console noise rather than asserting intended state transitions.

## Flake Triage Workflow

When a test flakes:

1. Reproduce with repeats:
- `npx playwright test <spec> --project=e2e --repeat-each=5`
2. Identify failure type:
- setup nondeterminism
- selector ambiguity
- missing state wait
- race in app init
3. Fix in this order:
- add deterministic harness/controller hook
- tighten selectors
- add explicit state waits
- only then consider timeout tuning
4. Re-run repeats and then run coverage lane.

## Quality Gates for Sustainable Improvement

1. Keep `npm run test:e2e:coverage` green before raising coverage thresholds.
2. Track coverage trend, but do not trade reliability for raw percentage.
3. Ratchet coverage targets gradually (example: 40% -> 45% -> 50%).
4. Require flaky-test fixes to include deterministic synchronization changes, not just longer timeouts.

## PR Checklist for E2E Changes

1. Does this test use deterministic fixture/harness setup?
2. Are selectors stable (`data-testid` or scoped stable IDs)?
3. Are waits condition-based (not sleep-based)?
4. Does the test fail for real regressions and pass reliably under repeats?
5. If adding coverage tests, do they increase useful coverage in high-risk paths?

## Useful Commands

1. Single spec:
- `npx playwright test tests/e2e/<spec>.spec.ts --project=e2e`
2. Repeat to detect flake:
- `npx playwright test tests/e2e/<spec>.spec.ts --project=e2e --repeat-each=5`
3. Full deterministic E2E coverage run:
- `npm run test:e2e:coverage`
4. Regenerate report from existing raw artifacts:
- `npm run test:e2e:coverage:report`

## Related Docs

- `docs/testing/playwright-function-coverage.md`
- `docs/testing/playwright-integration-recommendations-2026-02-22.md`
- `AGENTS.md` (testing infrastructure and harness references)
