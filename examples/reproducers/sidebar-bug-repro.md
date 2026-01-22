# Mobile Sidebar Layout Bug

## Bug Description
The `tests/visual/overlay-layers.spec.ts` test suite fails in the "mobile sidebar shares desktop rail behavior" test. There is a mismatch between the expected margin of the app container and the computed margin in the test environment (diff of ~45px or ~12.8px depending on environment). This indicates a layout issue where the mobile sidebar or app container margins are not being calculated or applied correctly according to the CSS variables.

## Steps to Reproduce
1. Install dependencies: `npm install`
2. Run the reproducer script: `npx playwright test examples/reproducers/sidebar-bug-repro.spec.ts`

## Logs
```
Error: expect(received).toBeLessThan(expected)

Expected: < 0.5
Received:   12.799999999999997
```
