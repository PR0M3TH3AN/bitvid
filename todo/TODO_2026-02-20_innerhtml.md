# TODO: innerHTML Migration for ShareNostrModal.js

- [x] L107: `wrapper.innerHTML = html;` (Template loading)
  - Strategy: Use `new DOMParser().parseFromString(html, 'text/html')` and append children to `wrapper`.
- [x] L274: `this.relayPills.innerHTML = "";` (Clearing content)
  - Strategy: `this.relayPills.replaceChildren();` or `textContent = ""` (replaceChildren is preferred for performance).
- [x] L300: `removeButton.innerHTML = '<svg ...>...</svg>';` (SVG Icon)
  - Strategy: Create SVG elements using `document.createElementNS("http://www.w3.org/2000/svg", "svg")` and children.

---

**CLOSED 2026-07-30.** All three migrations already landed in later refactors —
`grep innerHTML js/ui/components/ShareNostrModal.js` returns nothing and the
innerHTML lint baseline holds. Kept for the record.
