# todo: Investigate why visibility check fails in fixture environment

Found TODOs in `tests/visual/moderation.spec.ts` related to Playwright test failures in headless mode.

## Context
Several tests in `tests/visual/moderation.spec.ts` have commented-out assertions and interactions due to visibility checks failing or clicks timing out when running in the fixture environment (headless).

## TODOs
- `// TODO: Investigate why visibility check fails in fixture environment (headless)`
- `// TODO: Investigate why click times out in fixture environment (headless)`
- `// TODO: Investigate visibility check failure`
- `// TODO: Investigate click timeout failure`

## Code Excerpt
```typescript
    // TODO: Investigate why visibility check fails in fixture environment (headless)
    // await expect(showAnywayButton).toBeVisible();
    await expect(restoreButtonQuery).toHaveCount(0);

    // TODO: Investigate why click times out in fixture environment (headless)
    // await showAnywayButton.click({ force: true });
```

## Suggested Next Step
Investigate the `tests/visual/moderation.spec.ts` execution in headless mode. It might be related to rendering timing, fixture loading state, or specific CSS properties affecting visibility in the headless renderer.
