# Dependencies Security Report

## Vulnerable Packages
- **High**: minimatch, rollup, serve, serve-handler
- **Moderate**: ajv

## Triage
- **serve**: Direct dependency with high vulnerability (via minimatch and ajv). `npm audit` states a major version fix is available (`13.0.4`). Manual review and upgrade required.
- **rollup**: Transitive dependency with high vulnerability (Arbitrary File Write via Path Traversal). `npm audit fix` can resolve it.

## Actions Taken
- Created report.
- Ran clean install and captured logs.
- Attempted to run tests (none run as we are stopping at reporting).
- Generated `npm-audit-YYYY-MM-DD.json` and `npm-outdated-YYYY-MM-DD.json`.
