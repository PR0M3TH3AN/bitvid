const TOAST_TYPE_CLASSES = {
  info: "torrent-toast torrent-toast--info",
  success: "torrent-toast torrent-toast--success",
  error: "torrent-toast torrent-toast--error",
  warn: "torrent-toast torrent-toast--warn",
};

const TRANSITION_CLASSES = "transition duration-200 ease-out";
const MOTION_CLASS = "beacon-toast-motion";
const MOTION_ATTR = "data-beacon-motion";

function scheduleMotionFrame(documentRef, callback) {
  const view = documentRef?.defaultView;

  if (view && typeof view.requestAnimationFrame === "function") {
    view.requestAnimationFrame(callback);
    return;
  }

  setTimeout(callback, 16);
}

function ensureContainer(doc) {
  const documentRef = doc || (typeof document !== "undefined" ? document : null);

  if (!documentRef) {
    return null;
  }

  let container = documentRef.getElementById("beacon-toast-container");

  if (!container) {
    container = documentRef.createElement("div");
    container.id = "beacon-toast-container";
    container.setAttribute("role", "region");
    container.setAttribute("aria-live", "polite");
    container.className = [
      "pointer-events-none",
      "fixed",
      "inset-x-0",
      "top-4",
      "z-[70]",
      "flex",
      "flex-col",
      "items-center",
      "gap-3",
      "px-4",
    ].join(" ");

    const body = documentRef.body || documentRef.getElementsByTagName?.("body")?.[0];
    if (body) {
      body.appendChild(container);
    }
  }

  return container;
}

function buildToastElement(documentRef, message, typeClass) {
  const toast = documentRef.createElement("div");
  toast.className = [TRANSITION_CLASSES, typeClass].join(" ");
  toast.setAttribute("role", "status");
  toast.setAttribute("tabindex", "0");
  toast.textContent = message;

  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.className = [
    "absolute",
    "right-3",
    "top-3",
    "rounded",
    "p-1",
    "text-current/70",
    "hover:text-current",
    "focus-visible:outline",
    "focus-visible:outline-2",
    "focus-visible:outline-offset-2",
    "focus-visible:outline-info",
  ].join(" ");
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.innerHTML =
    '<svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.75 3.75l8.5 8.5"></path><path d="M12.25 3.75l-8.5 8.5"></path></svg>';

  const wrapper = documentRef.createElement("div");
  wrapper.className = [
    "relative",
    "w-full",
    TRANSITION_CLASSES,
    MOTION_CLASS,
  ].join(" ");
  wrapper.setAttribute(MOTION_ATTR, "exit");

  wrapper.appendChild(toast);
  toast.appendChild(closeButton);

  return { wrapper, toast, closeButton };
}

export function createToastManager(documentRef, timeoutRef = setTimeout, clearTimeoutRef = clearTimeout) {
  return {
    show(message, options = {}) {
      if (!message) {
        return;
      }

      const type = options.type && TOAST_TYPE_CLASSES[options.type] ? options.type : "info";
      const container = ensureContainer(documentRef);

      if (!container) {
        return;
      }

      const { wrapper, toast, closeButton } = buildToastElement(
        documentRef,
        message,
        TOAST_TYPE_CLASSES[type],
      );

      container.appendChild(wrapper);

      scheduleMotionFrame(documentRef, () => {
        wrapper.setAttribute(MOTION_ATTR, "enter");
      });

      const duration = typeof options.duration === "number" ? options.duration : 3500;
      const cleanup = () => {
        wrapper.setAttribute(MOTION_ATTR, "exit");
        const removalTimer = timeoutRef(() => {
          if (wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
          }
        }, 200);
        closeButton.removeEventListener("click", dismissHandler);
        toast.removeEventListener("keydown", keydownHandler);
        closeButton.removeEventListener("keydown", keydownHandler);
        return removalTimer;
      };

      const dismissHandler = () => cleanup();
      const keydownHandler = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cleanup();
        }
      };

      closeButton.addEventListener("click", dismissHandler);
      toast.addEventListener("keydown", keydownHandler);
      closeButton.addEventListener("keydown", keydownHandler);

      let timerId = null;
      if (!options.sticky) {
        timerId = timeoutRef(() => {
          cleanup();
        }, duration);
      }

      return {
        dismiss() {
          if (timerId) {
            clearTimeoutRef(timerId);
          }
          cleanup();
        },
      };
    },
    set(message, typeOrOptions) {
      if (typeof typeOrOptions === "string") {
        return this.show(message, { type: typeOrOptions });
      }

      return this.show(message, typeOrOptions);
    },
    info(message, options = {}) {
      return this.show(message, { ...options, type: "info" });
    },
    success(message, options = {}) {
      return this.show(message, { ...options, type: "success" });
    },
    error(message, options = {}) {
      return this.show(message, { ...options, type: "error" });
    },
    warn(message, options = {}) {
      return this.show(message, { ...options, type: "warn" });
    },
  };
}

export function createBeaconToast(documentRef, timeoutRef = setTimeout, clearTimeoutRef = clearTimeout) {
  return createToastManager(documentRef, timeoutRef, clearTimeoutRef);
}
