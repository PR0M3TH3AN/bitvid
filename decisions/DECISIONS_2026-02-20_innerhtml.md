# Decisions: innerHTML Migration for ShareNostrModal.js

## 1. Template Loading (L107)
**Original:** `wrapper.innerHTML = html;`
**New:**
```javascript
const parser = new DOMParser();
const doc = parser.parseFromString(html, "text/html");
wrapper.replaceChildren(...doc.body.childNodes);
```
**Rationale:** Avoids innerHTML while parsing the fetched HTML string safely.

## 2. Clearing Content (L274)
**Original:** `this.relayPills.innerHTML = "";`
**New:** `this.relayPills.replaceChildren();`
**Rationale:** Modern, faster, and safer method to clear DOM nodes.

## 3. SVG Icon (L300)
**Original:** `removeButton.innerHTML = '<svg ...>...</svg>';`
**New:**
```javascript
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "h-3 w-3");
svg.setAttribute("viewBox", "0 0 24 24");
svg.setAttribute("fill", "none");
svg.setAttribute("stroke", "currentColor");
svg.setAttribute("stroke-width", "2");

const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
path.setAttribute("d", "M18 6L6 18M6 6l12 12");
path.setAttribute("stroke-linecap", "round");
path.setAttribute("stroke-linejoin", "round");

svg.appendChild(path);
removeButton.appendChild(svg);
```
**Rationale:** Using `createElementNS` is the correct way to build SVG elements without `innerHTML`.
