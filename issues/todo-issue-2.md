# todo: Investigate failing visual moderation tests in headless mode

**File:** `tests/visual/moderation.spec.ts`
**Priority:** Medium
**Tags:** ai, needs-review

**Description:**
Multiple tests in `tests/visual/moderation.spec.ts` have commented-out assertions due to failures in headless/CI environments. These failures relate to visibility checks and click timeouts.

**Context:**
```typescript
    // TODO: Investigate why visibility check fails in fixture environment (headless)
    // await expect(showAnywayButton).toBeVisible();

    // TODO: Investigate why click times out in fixture environment (headless)
    // await showAnywayButton.click({ force: true });
```
This pattern repeats in:
- "show anyway override persists across reloads"
- "trusted report hide fixture supports show anyway override"
- "trusted mute hide fixture annotates mute reason and can be overridden"

**Suggested Next Step:**
Investigate why the headless environment (fixture) causes these visibility checks and clicks to fail. It might be related to rendering speed, element overlap, or how the fixture loads.
