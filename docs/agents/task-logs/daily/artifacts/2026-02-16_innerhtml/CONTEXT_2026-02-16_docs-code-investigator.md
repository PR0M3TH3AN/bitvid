# Context: Documentation of js/services/moderationService.js

## Selection
- **File**: `js/services/moderationService.js`
- **Line Count**: ~1350 lines
- **Reason**: This is a critical Trust & Safety module implementing the "Web of Trust" model. It is large, complex, and central to the user experience (filtering, blurring). It lacks comprehensive high-level documentation and detailed JSDoc for its public API.
- **Goal**: Analyze the file, add in-code JSDoc, and create a `docs/moderationService-overview.md` to explain the trust graph and report aggregation logic.

## Analysis Plan
1.  **High-level summary**: Web of Trust implementation using NIP-56 (Reports) and NIP-51 (Mutes), filtered by the user's social graph (Kind 3 contacts).
2.  **Public Surface**: `ModerationService` class, `submitReport`, `recomputeSummaryForEvent`, `refreshViewerFromClient`, `setViewerPubkey`.
3.  **Key Flows**:
    -   **Initialization**: `setViewerPubkey` -> `fetchTrustedContacts` -> `rebuildTrustedContacts`.
    -   **Reporting**: `submitReport` -> sign -> publish -> ingest.
    -   **Aggregation**: `subscribeToReports` -> `ingestReportEvent` -> `recomputeSummaryForEvent` (checks trust).
4.  **Invariants**:
    -   Reports are only counted if the reporter is in `trustedContacts` (or whitelist).
    -   Admin actions (blacklist/whitelist) override the trust graph.
    -   Viewer mutes are synchronized with `userBlocks`.

## Tasks
- [ ] Add file-header JSDoc explaining the module.
- [ ] Add JSDoc to `ModerationService` methods (`constructor`, `setViewerPubkey`, `submitReport`, etc.).
- [ ] Create `docs/moderationService-overview.md` with architecture diagrams (text) and usage examples.
- [ ] Verify with `npm run lint` and `npm run test:unit`.
