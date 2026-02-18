# Dependency Security & Health Report
**Date:** 2026-02-18
**Agent:** deps-security-agent

## 1. Vulnerability Audit
*Source: `npm audit`*

### Moderate Severity
*   **ajv** (<8.18.0)
    *   **Issue:** ReDoS when using `$data` option.
    *   **Path:** `serve` > `ajv`
    *   **Status:** `serve` is a devDependency used for local development (`npm start`).
    *   **Action:** Investigate `serve` updates or overrides. The suggested fix to downgrade to `6.5.8` is incorrect as we are on `^14.2.5`. Likely need to wait for `serve` to update its dependencies or use `overrides`.

## 2. Outdated Packages
*Source: `npm outdated`*

### Protocol / Critical (Manual Review Required)
*   **nostr-tools**
    *   Current: `2.19.4`
    *   Wanted: `2.23.1`
    *   Latest: `2.23.1`
    *   **Action:** Requires manual review and testing of NIP compliance before upgrade.

### Safe Candidates (Minor/Patch)
*   **stylelint**
    *   Current: `16.12.0`
    *   Wanted: `16.26.1`
    *   Latest: `17.3.0`
    *   **Action:** Safe to upgrade to `16.26.1` in next cycle.
*   **prettier-plugin-tailwindcss**
    *   Current: `0.6.14`
    *   Wanted: `0.6.14` (Wait, latest is 0.7.2)
    *   **Action:** Minor update available to 0.7.2.

### Major Upgrades (Breaking Changes)
*   **tailwindcss**
    *   Current: `3.4.19`
    *   Latest: `4.1.18`
    *   **Action:** Major migration required (v3 -> v4). Create a dedicated task.
*   **stylelint-config-standard**
    *   Current: `36.0.1`
    *   Latest: `40.0.0`
    *   **Action:** Major update.
*   **pixelmatch**
    *   Current: `5.3.0`
    *   Latest: `7.1.0`
    *   **Action:** Major update.
*   **postcss-import**
    *   Current: `15.1.0`
    *   Latest: `16.1.1`
    *   **Action:** Major update.

## 3. Recommendations
1.  **High Priority**: Monitor `serve` for updates that bump `ajv`.
2.  **Maintenance**: Schedule upgrade for `stylelint` (minor).
3.  **Refactor**: Plan `tailwindcss` v4 migration.
