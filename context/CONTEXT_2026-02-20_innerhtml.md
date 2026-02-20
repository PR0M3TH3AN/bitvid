# Context: innerHTML Migration for ShareNostrModal.js

**Date:** 2026-02-20
**Agent:** bitvid-innerhtml-migration-agent (via Jules)
**Target File:** `js/ui/components/ShareNostrModal.js`
**Reason:** High count (3 assignments). Contains static SVG injection and template loading.

**Environment:**
- Node: v22.22.0
- npm: 11.7.0

**Plan:**
1.  Analyze `innerHTML` assignments.
2.  Replace `wrapper.innerHTML = html` with `DOMParser` or similar safe parsing.
3.  Replace `this.relayPills.innerHTML = ""` with `replaceChildren()`.
4.  Replace `removeButton.innerHTML = SVG` with `createElementNS` or safe SVG construction.
5.  Verify with lint and tests.
