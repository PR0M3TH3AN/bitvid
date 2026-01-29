// js/embedDiagnostics.js

let activeEmitter = null;

export function initEmbedDiagnostics({ enabled = true } = {}) {
  if (!enabled) {
    return { emit: () => {} };
  }

  function postToParent(type, payload) {
    try {
      // NOTE: using "*" so tester receives messages; in a production build you may restrict origin.
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __bitvid_debug: true, type, payload }, "*");
      }
    } catch (e) {
      // ignore
    }
  }

  function safeStringify(obj, max = 2000) {
    try {
      const s = JSON.stringify(
        obj,
        (k, v) => {
          if (typeof v === "string" && v.length > 1000)
            return v.slice(0, 1000) + "…";
          // redact likely sensitive fields
          if (k && /key|secret|sk|priv|pass|token/i.test(k)) return "[REDACTED]";
          return v;
        },
        2
      );
      return s.length > max ? s.slice(0, max) + "…" : s;
    } catch (e) {
      try {
        return String(obj);
      } catch (e2) {
        return "[unserializable]";
      }
    }
  }

  // console wrappers
  ["log", "info", "warn", "error", "debug"].forEach((lvl) => {
    // eslint-disable-next-line no-console
    const orig = console[lvl] ? console[lvl].bind(console) : null;
    if (orig) {
      // eslint-disable-next-line no-console
      console[lvl] = (...args) => {
        try {
          postToParent("console", {
            level: lvl,
            args: args.map((a) =>
              typeof a === "string" ? a : safeStringify(a, 1000)
            ),
          });
        } catch (e) {
          /* no-op */
        }
        try {
          orig(...args);
        } catch (e) {
          /* no-op */
        }
      };
    }
  });

  // global errors
  window.addEventListener(
    "error",
    (ev) => {
      try {
        const payload = {
          message: ev.message,
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
          stack: ev.error && ev.error.stack ? ev.error.stack : null,
        };
        postToParent("error", payload);
      } catch (e) {
        /* no-op */
      }
    },
    true
  );

  window.addEventListener("unhandledrejection", (ev) => {
    try {
      const reason =
        ev && ev.reason
          ? ev.reason && ev.reason.stack
            ? ev.reason.stack
            : safeStringify(ev.reason)
          : "unknown";
      postToParent("unhandledrejection", { reason });
    } catch (e) {
      /* no-op */
    }
  });

  // light fetch/XHR monitoring (failures only)
  (function wrapFetch() {
    if (!window.fetch) return;
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      try {
        const res = await orig(...args);
        if (!res.ok) {
          postToParent("fetch-error", {
            url: args[0],
            status: res.status,
            statusText: res.statusText,
          });
        }
        return res;
      } catch (err) {
        postToParent("fetch-exception", { url: args[0], error: String(err) });
        throw err;
      }
    };
  })();

  (function wrapXhr() {
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (...args) {
        this.__embed_diag_url = args[1];
        return origOpen.apply(this, args);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        try {
          this.addEventListener("error", () =>
            postToParent("xhr-error", { url: this.__embed_diag_url })
          );
          this.addEventListener("load", () => {
            if (this.status >= 400)
              postToParent("xhr-status", {
                url: this.__embed_diag_url,
                status: this.status,
              });
          });
        } catch (e) {
          /* no-op */
        }
        return origSend.apply(this, args);
      };
    } catch (e) {
      /* no-op */
    }
  })();

  function emitEmbedEvent(name, payload = {}) {
    try {
      postToParent("embed-event", { name, payload });
    } catch (e) {
      /* no-op */
    }
  }

  activeEmitter = emitEmbedEvent;

  return { emit: emitEmbedEvent };
}

export function emit(name, payload) {
  if (activeEmitter) {
    try {
      activeEmitter(name, payload);
    } catch (e) {
      /* no-op */
    }
  }
}
