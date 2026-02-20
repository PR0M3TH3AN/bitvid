# Context: Documentation for `js/nostrEventSchemas.js`

**Agent**: docs-code-investigator
**Date**: 2026-02-20
**Selected File**: `js/nostrEventSchemas.js`

## Selection Reason
This file is a critical core module that defines the Nostr event schemas, Kinds, and helper functions for building events throughout the application. It is large (approx. 3000 LOC) and currently lacks a dedicated overview document in `docs/`. Documenting this file will provide significant value for understanding the protocol layer of the application.

## Plan
1.  **Analyze**: Read the file to understand its exports, constants, and builder functions.
2.  **Overview Document**: Create `docs/nostrEventSchemas-overview.md` to explain:
    *   The file's role as the central schema definition.
    *   Key constants (`NOTE_TYPES`, `KINDS`).
    *   Validation logic.
    *   How to use the builder functions.
3.  **In-Code Documentation**:
    *   Add a top-level file comment explaining the module's purpose.
    *   Add JSDoc comments to exported functions and constants to improve IDE support and code readability.
4.  **Verification**:
    *   Run `npm run lint` to ensure style compliance.
    *   Run `npm run test:unit` to ensure no regressions.
