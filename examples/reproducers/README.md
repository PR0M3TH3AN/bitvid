# Fuzz Testing Reproducers

This directory contains reproducers for crashes found during fuzz testing.
These files contain the input that caused a crash and the error message.

## How to run

The reproducers are JSON files. To re-run a specific case, you can use the fuzz harness and load the JSON input, or manually import the function and call it with the input.

Example structure:
```json
{
  "target": "functionName",
  "input": { ... },
  "error": { ... }
}
```

## Known Issues

- `buildVideoPostEvent` crashes on circular objects if not handled (Fixed).
- `normalizeAndAugmentMagnet` crashes on non-iterable `extraTrackers` (Fixed).
- `build...` functions crash on `null`/`undefined` input (Fixed).

# Bug Reproducers

This directory also contains minimal reproducers for known bugs in the repository.

## Sidebar Layout (Mobile Margin Mismatch)

**Issue**: The sidebar layout on mobile viewports has a margin calculation mismatch.
**Reproducer**: `examples/reproducers/issue-sidebar-layout/repro.spec.ts`
**Run**:
```bash
npx playwright test -c examples/reproducers/playwright.config.ts examples/reproducers/issue-sidebar-layout/repro.spec.ts
```

## Moderation UI ("Show Anyway" Button Visibility)

**Issue**: The "Show anyway" button fails to appear in the DOM during tests, causing visibility checks to fail.
**Reproducer**: `examples/reproducers/issue-moderation-ui/repro.spec.ts`
**Run**:
```bash
npx playwright test -c examples/reproducers/playwright.config.ts examples/reproducers/issue-moderation-ui/repro.spec.ts
```

## NIP-07 Login Test (ReferenceError)

**Issue**: The unit test for NIP-07 login fallback fails with `ReferenceError: plainCall is not defined`.
**Reproducer**: `examples/reproducers/issue-nip07-login/repro.mjs`
**Run**:
```bash
node examples/reproducers/issue-nip07-login/repro.mjs
```
