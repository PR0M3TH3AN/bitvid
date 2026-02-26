# Test Audit Context

**Goal:** Ensure test suite reliability and identify potential flakiness or bad practices.

**Scope:**
-   Audit all tests in `test/` directory.
-   Check for non-deterministic behavior (flakiness).
-   Check for "cheat vectors" like `setTimeout`.

**Constraints:**
-   Must use provided audit tools.
-   Must report findings to `reports/test-audit/`.
