# Popover Flip Bug in Constrained Viewports

## Problem

The popover (using Floating UI `flip` middleware) fails to respect viewport boundaries in constrained height scenarios, causing it to overlap or be cut off instead of flipping to the top.

## Affected Components

- `js/ui/overlay/popoverEngine.js`
- Popovers triggered from `data-test-trigger="grid-bottom-right"` (e.g., in `tests/e2e/popover.spec.ts`).

## Reproduction Steps

1. Open a popover near the bottom of a constrained viewport.
2. Ensure there is enough space above the popover to flip.
3. Observe that the popover stays at the bottom and is clipped.

## Test Case

- `tests/e2e/popover.spec.ts`: `keeps the bottom-right grid menu inside the viewport` (skipped).

## History

- **2025-02-23**: Verification failed. Fix attempt failed.
- **2026-02-08**: Verification attempted but failed due to missing environment dependencies (`@playwright/test`).
- **2026-02-08**: Environment fixed. Test validated as still failing (skipped).

## Possible Causes

- Misconfiguration of `flip` middleware (padding, boundary).
- Conflict with `shift` middleware.
- Viewport detection issues in constrained test environment.

## Tags

- ui
- bug
- floating-ui
