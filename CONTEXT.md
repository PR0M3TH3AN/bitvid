# Test Audit Context

## Purpose
This audit aims to verify the integrity and effectiveness of the bitvid test suite. The goal is to ensure tests actually test the behaviors they claim to, find fragile or missing tests, and propose small, high-confidence fixes to raise test quality and coverage.

## Scope
-   **Focus Areas**: UX- and security-critical code paths including:
    -   Login/Auth (`js/services/authService.js`)
    -   Relay Management (`js/relayManager.js`)
    -   Decryption (`js/nostr/dmDecryptWorker.js`)
    -   Watch History (`js/nostr/watchHistory.js`)
    -   Moderation (`js/userBlocks.js`)
-   **Exclusions**: Non-critical UI components, deprecated code.

## Definition of Done
-   A daily audit report (`test-audit-report-YYYY-MM-DD.md`) is generated.
-   Failing and flaky tests are identified.
-   Coverage gaps for critical files are mapped.
-   At least one P0 test problem is fixed or tracked as an actionable issue.
-   All artifacts are committed.
