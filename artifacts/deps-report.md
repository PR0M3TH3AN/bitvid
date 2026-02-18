# Dependency Security Report

**Date:** 2026-02-18
**Agent:** deps-security-agent
**Cadence:** Daily

## Summary
- **Vulnerabilities:** 1 Moderate (ajv via serve)
- **Outdated Packages:** 7 found (mixed major/minor)
- **Action Taken:** Upgrading `stylelint` to v16.26.1 (safe minor bump).

## Vulnerabilities

### Moderate
- **ajv** (<8.18.0)
  - **Via:** `serve` (devDependency)
  - **Issue:** ReDoS when using `$data` option.
  - **Advisory:** [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)
  - **Impact:** `serve` is a dev tool used for local preview. Low impact on production build artifacts, but should be addressed.
  - **Fix:** `npm audit` suggests a downgrade to `serve@6.5.8` which is likely incorrect or a major regression. Recommendation is to wait for `serve` to update its dependency or use an override if urgent.

## Outdated Packages

| Package | Current | Wanted | Latest | Type | Action |
|---------|---------|--------|--------|------|--------|
| `nostr-tools` | 2.19.4 | 2.23.1 | 2.23.1 | dep | **SKIP** (Crypto/Protocol - requires manual review) |
| `stylelint` | 16.12.0 | 16.26.1 | 17.3.0 | devDep | **UPGRADE** (Safe minor bump to 16.26.1) |
| `pixelmatch` | 5.3.0 | 5.3.0 | 7.1.0 | devDep | Skip (Major) |
| `postcss-import` | 15.1.0 | 15.1.0 | 16.1.1 | devDep | Skip (Major) |
| `prettier-plugin-tailwindcss` | 0.6.14 | 0.6.14 | 0.7.2 | devDep | Skip (Potential breaking) |
| `stylelint-config-standard` | 36.0.1 | 36.0.1 | 40.0.0 | devDep | Skip (Major) |
| `tailwindcss` | 3.4.19 | 3.4.19 | 4.1.18 | dep | Skip (Major) |

## Upgrade Plan
- **Package:** `stylelint`
- **From:** `16.12.0`
- **To:** `16.26.1`
- **Reason:** Routine maintenance, keeping dev tools current.
- **Verification:** Run `npm run lint:css` and `npm run test:unit`.
