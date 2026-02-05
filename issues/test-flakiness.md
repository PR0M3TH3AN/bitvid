# Test Flakiness (Modals)

**Problem:**
E2E tests for modals are prone to timeouts, likely due to animation/transition handling or resource loading delays in the CI environment. Using `applyReducedMotion` consistently helps but doesn't solve all timing issues.
