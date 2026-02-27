# Known Issues

## Test Infrastructure

### Missing `jsdom` Dependency
- **Status:** Active
- **Detected:** 2026-02-26
- **Description:** Multiple unit tests fail with `ERR_MODULE_NOT_FOUND` because `jsdom` is imported but not installed in the project.
- **Impact:** Prevents running unit tests that rely on DOM simulation.
- **Remediation:** `npm install --save-dev jsdom`
