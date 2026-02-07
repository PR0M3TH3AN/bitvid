# Popover Flip Layout Reproducer

Reproduction for the visual regression layout issue where the popover fails to flip to the top in a restricted viewport.

## Prerequisites

You must build the CSS assets before running the test:

```bash
npm run build:css
```

## Usage

```bash
npx playwright test -c examples/reproducers/issue-popover-flip/playwright.config.ts
```

## Expected Failure

The test should fail asserting that the popover is within the viewport (it fails to flip to top, so it overflows bottom):
```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 250.5
Received: 311.625
```
