# TODO: innerHTML Migration for ShareNostrModal.js

- [ ] L107: `wrapper.innerHTML = html;` (Template loading)
  - Strategy: Use `new DOMParser().parseFromString(html, 'text/html')` and append children to `wrapper`.
- [ ] L274: `this.relayPills.innerHTML = "";` (Clearing content)
  - Strategy: `this.relayPills.replaceChildren();` or `textContent = ""` (replaceChildren is preferred for performance).
- [ ] L300: `removeButton.innerHTML = '<svg ...>...</svg>';` (SVG Icon)
  - Strategy: Create SVG elements using `document.createElementNS("http://www.w3.org/2000/svg", "svg")` and children.
