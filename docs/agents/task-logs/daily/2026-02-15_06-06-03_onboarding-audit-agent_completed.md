# Onboarding Audit Report

Headline: ⚠️ Onboarding failures found (Fixed)

## 1) Environment assumptions
- **OS**: Linux (Sandbox)
- **Node**: v22+ (from package.json engine check)
- **npm**: v10+

## 2) Steps executed
1. `npm ci`
2. `npm run build`
3. `npm run test:smoke`

## 3) Results
- `npm ci`: **PASS**
- `npm run build`: **PASS**
- `npm run test:smoke`: **FAIL** (initial run), **PASS** (after fix)

## 4) Failures and Fixes

### Failure: Missing Playwright Browsers
When running `npm run test:smoke` on a fresh environment (simulated by the sandbox), the test failed with:
```
browserType.launch: Executable doesn't exist at /home/jules/.cache/ms-playwright/...
Looks like Playwright Test or Playwright was just installed or updated.
Please run the following command to download new browsers:
    npx playwright install
```

**Root Cause**: The `README.md` and `CONTRIBUTING.md` instructions did not explicitly mention `npx playwright install` as a prerequisite for running tests locally, assuming a dev container or pre-configured environment.

**Fix**: Updated `README.md` and `CONTRIBUTING.md` to include `npx playwright install` as a step for users planning to run visual or smoke tests.

## 5) Docs changes made
- **README.md**: Added `npx playwright install` instruction under "Local Setup".
- **CONTRIBUTING.md**: Added `npx playwright install` instruction under "Development Setup".

## 6) Verification
After installing browsers, `npm run test:smoke` passed successfully.

```
[2026-02-15T06:05:13.771Z] --- Smoke Test PASSED ---
```
