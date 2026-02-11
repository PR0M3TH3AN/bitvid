# NIP Compliance Audit Context

## Goal
Build a rigorous, repo-tethered NIP & note-kind compliance program. Inventory NIPs & kinds relevant to the client, extract authoritative specifications and best practices, map each to the client code, and produce verification steps + small fixes/PRs or issues to bring the client into compliance.

## Scope
- **Primary NIPs:** NIP-07, NIP-04/44, NIP-33, NIP-46, NIP-51/56, NIP-59, NIP-94.
- **Note Kinds:** 30078 (video), 10000 (mute), 30002 (block list), 10002 (relay list), Watch History.
- **Cross-cutting:** Tag semantics, Event validation, Relay behavior, Encryption/Decryption, Addressing, Moderation.

## Definition of Done (DoD)
1. A per-NIP / per-kind checklist exists in `NIP_INVENTORY.md` with compliance status.
2. All P0 NIPs/kinds have concrete testable validation steps and at least one small PR or issue created.
3. Documentation (`CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md`) created/updated.
4. `nip-report-YYYY-MM-DD.md` produced.

## Timeline
- **Day 1:** Inventory complete, P0 items listed.
- **Day 2:** Research + specs; tests for NIP-04/44/07.
- **Day 3:** PRs for P0 fixes; update docs.
