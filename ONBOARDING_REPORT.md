# Onboarding Audit Report

**Date:** 2026-02-21
**Agent:** onboarding-audit-agent
**Headline:** ⚠️ Onboarding failures found

## 1. Environment Assumptions
- **Node**: v22.22.0
- **NPM**: 10.9.0
- **OS**: Linux

## 2. Steps Executed
1. `npm ci`
2. `npx playwright install`
3. `npm run build` (Simulating `npm start` build phase)
4. `npm run test:unit:shard1`
5. `npm run test:smoke`
6. `npm run format`
7. `npm run lint`
8. `npm run audit`

## 3. Results

| Command | Status | Notes |
| :--- | :--- | :--- |
| `npm ci` | ✅ Pass | Installed dependencies successfully. |
| `npx playwright install` | ✅ Pass | Downloaded Chromium, Firefox, WebKit. |
| `npm run build` | ✅ Pass | Build completed, assets hashed. |
| `npm run test:unit:shard1` | ✅ Pass | Unit tests passed. |
| `npm run test:smoke` | ✅ Pass | Smoke test passed. |
| `npm run format` | ✅ Pass | No formatting changes needed. |
| `npm run lint` | ❌ Fail | **File size violation** in `js/subscriptions.js`. |
| `npm run audit` | ✅ Pass | Audit report generated. |

## 4. Failures

### `npm run lint`

**Error Log:**
```
1 file size violation(s):
  ✗ GREW: js/subscriptions.js (2426 lines, was 2374, limit 2424)

New files must stay under 1000 lines. Grandfathered files must not grow.
To decompose a large file, extract logic into smaller modules and re-export.
```

**Root Cause:**
`js/subscriptions.js` has grown beyond its grandfathered limit + buffer. The documented limit is 2424 lines, but the file is now 2426 lines.

**Recommendation:**
1.  Immediate fix: Increase the limit in `scripts/check-file-size.mjs` slightly to unblock CI if decomposition is not immediately possible.
2.  Long term: Decompose `js/subscriptions.js`.

## 5. Docs Changes Made
- None. Documentation accurately reflects the commands, but the codebase fails the lint check.

## 6. Devcontainer/Docker
- Not required. Environment setup (`npm ci`, `playwright install`) worked reliably.
