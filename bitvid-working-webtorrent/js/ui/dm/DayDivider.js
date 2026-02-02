function createElement(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (typeof text === "string") {
    element.textContent = text;
  }
  return element;
}

export function DayDivider({ document: doc, label = "" } = {}) {
  if (!doc) {
    throw new Error("DayDivider requires a document reference.");
  }

  const divider = createElement(doc, "div", "dm-day-divider");
  const line = createElement(doc, "span", "dm-day-divider__line");
  const text = createElement(doc, "span", "dm-day-divider__label", label);
  divider.appendChild(line);
  divider.appendChild(text);
  divider.appendChild(line.cloneNode());
  return divider;
}
