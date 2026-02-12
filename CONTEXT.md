# Docs Audit Context

**Goal:** Audit and align public-facing documentation in `/content` with actual code behavior, focusing on uploading and contribution flows.

**Scope:**
- Docs: `content/docs/guides/upload-content.md` and related pages.
- Code: `js/ui/uploadModal.js`, `js/services/uploadService.js`, `js/constants.js`, `js/nostrEventSchemas.js`, etc.

**Date:** 2026-02-19
**Agent:** bitvid-content-audit-agent
**Branch:** daily/content-audit-agent

**Assumptions:**
- `content/docs/guides/upload-content.md` is the primary source of truth for users.
- Codebase is in `unstable` state.

**Definition of Done:**
- `inventory.md` created.
- `verification.md` created with verified/outdated statuses.
- Docs updated to match code.
- Artifacts collected.
