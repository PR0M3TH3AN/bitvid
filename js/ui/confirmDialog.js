// Promise-based confirm dialog rendered with the site's modal styling, so yes/no
// confirmations live in the app's UI system instead of a native window.confirm.
//
// Importable anywhere (components AND services) — it builds its own
// `bv-modal modal-always-on-top` overlay, so it stacks above any open modal and is
// keyboard/click dismissible. Returns a Promise<boolean>: true = confirmed.

function makeButton(label, { ghost = false, danger = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = ghost ? "btn-ghost focus-ring" : "btn focus-ring";
  if (danger) {
    btn.setAttribute("data-variant", "danger");
  }
  btn.textContent = label;
  return btn;
}

export function showConfirm(message, options = {}) {
  const {
    title = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = options || {};

  // No DOM (tests without jsdom / SSR): fall back to window.confirm, else decline.
  if (typeof document === "undefined" || !document.body) {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return Promise.resolve(window.confirm(String(message || "")));
    }
    return Promise.resolve(false);
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
    body.className = "p-5";
    const text = document.createElement("p");
    text.className = "text-sm text-muted-strong whitespace-pre-line";
    text.textContent = String(message || "");
    body.appendChild(text);
    sheet.appendChild(body);

    const footer = document.createElement("div");
    footer.className =
      "flex items-center justify-end gap-3 border-t border-border/60 p-4";
    const cancelBtn = makeButton(cancelLabel, { ghost: true });
    const confirmBtn = makeButton(confirmLabel, { danger });
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
    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(false);
      } else if (event.key === "Enter" && document.activeElement === confirmBtn) {
        cleanup(true);
      }
    }

    cancelBtn.addEventListener("click", () => cleanup(false));
    backdrop.addEventListener("click", () => cleanup(false));
    confirmBtn.addEventListener("click", () => cleanup(true));
    document.addEventListener("keydown", onKeydown, true);

    document.body.appendChild(overlay);
    // Focus the safe action by default (Cancel for destructive prompts).
    (danger ? cancelBtn : confirmBtn).focus();
  });
}

export default showConfirm;
