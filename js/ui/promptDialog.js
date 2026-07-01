// Promise-based password/PIN prompt rendered with the site's modal styling (sibling of
// confirmDialog). Used to collect the passphrase that unlocks a stored nsec key — e.g.
// when switching to a saved nsec account. Resolves the entered string, or null if the
// user cancels. Builds its own `bv-modal modal-always-on-top` overlay so it stacks above
// other modals (and is typable thanks to the stacked-modal focus fix).

export function showPasswordPrompt(message, options = {}) {
  const {
    title = "",
    confirmLabel = "Unlock",
    cancelLabel = "Cancel",
    placeholder = "PIN / passphrase",
  } = options || {};

  if (typeof document === "undefined" || !document.body) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className =
      "bv-modal modal-always-on-top items-start justify-center md:items-center";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const backdrop = document.createElement("div");
    backdrop.className = "bv-modal-backdrop";
    overlay.appendChild(backdrop);

    const sheet = document.createElement("div");
    sheet.className = "modal-sheet w-full max-w-md flex flex-col";
    sheet.tabIndex = -1;
    overlay.appendChild(sheet);

    if (title) {
      const header = document.createElement("div");
      header.className = "modal-header";
      const heading = document.createElement("h2");
      heading.className = "text-lg font-bold text-text";
      heading.textContent = title;
      header.appendChild(heading);
      sheet.appendChild(header);
    }

    const body = document.createElement("div");
    body.className = "p-5 space-y-3";
    if (message) {
      const text = document.createElement("p");
      text.className = "text-sm text-muted-strong whitespace-pre-line";
      text.textContent = String(message);
      body.appendChild(text);
    }
    const input = document.createElement("input");
    input.type = "password";
    input.className = "input w-full";
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.setAttribute("aria-label", placeholder);
    body.appendChild(input);
    sheet.appendChild(body);

    const footer = document.createElement("div");
    footer.className =
      "flex items-center justify-end gap-3 border-t border-border/60 p-4";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-ghost focus-ring";
    cancelBtn.textContent = cancelLabel;
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn focus-ring";
    confirmBtn.textContent = confirmLabel;
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    sheet.appendChild(footer);

    let settled = false;
    const cleanup = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
      resolve(result);
    };
    const submit = () => cleanup(input.value);
    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(null);
      }
    }

    cancelBtn.addEventListener("click", () => cleanup(null));
    backdrop.addEventListener("click", () => cleanup(null));
    confirmBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
    document.addEventListener("keydown", onKeydown, true);

    document.body.appendChild(overlay);
    input.focus();
  });
}

export default showPasswordPrompt;
