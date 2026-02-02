# Lint Issues Report

## Summary
Automated linting and formatting checks were run. No auto-fixable formatting issues were found. However, one linting error persists which requires manual intervention.

## Issues

### css/tailwind.source.css

The `npm run lint:tokens` check failed with the following error:

```
css/tailwind.source.css:5757 → 767.98px
  @media (max-width: 767.98px) {
```

**Recommendation:**
This raw measurement (`767.98px`) should be moved into `css/tokens.css` as a design token, or the linter configuration (`scripts/check-design-tokens.mjs`) should be updated to whitelist this specific value if it represents a standard responsive breakpoint for mobile layout fixes.

Note: This error currently prevents `npm run lint` from completing successfully, meaning subsequent checks (`lint:tailwind-brackets`, `lint:tailwind-colors`) are skipped in the standard run script. These subsequent checks were run manually and passed.
