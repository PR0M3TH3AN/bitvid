import { k, c as P, r as T, f as x, m as H, h } from "./bitlogin-shared-C4PaJAtm.js";
import { b as $, g as q } from "./bitlogin-shared-C4PaJAtm.js";
import { a as B } from "./bitlogin-shared-Da_P-cjP.js";
const A = "bitlogin:allowed-sites:v1", c = {
  /** No more entries than this are kept: the oldest go first. */
  entries: 200,
  /** How long an entry is kept after it has ended, in seconds. */
  keepEndedSec: 720 * 3600
}, F = /^[0-9a-f]{64}$/u;
function E(t) {
  if (!t || typeof t != "object") return null;
  const e = t, n = P(e.site);
  if (!n || n !== e.site || typeof e.pubkey != "string" || !F.test(e.pubkey) || typeof e.at != "number" || typeof e.until != "number" || !Number.isFinite(e.at) || !Number.isFinite(e.until) || e.until < e.at) return null;
  const r = e.wants === void 0 ? void 0 : T(e.wants);
  return r === null ? null : { site: n, pubkey: e.pubkey, at: Math.floor(e.at), until: Math.floor(e.until), remembered: e.remembered === !0, ...r ? { wants: r } : {} };
}
function _(t, e) {
  if (!t) return [];
  let n;
  try {
    n = JSON.parse(t);
  } catch {
    return [];
  }
  return Array.isArray(n) ? n.slice(0, c.entries * 2).map(E).filter((r) => r !== null && r.until + c.keepEndedSec > e).sort((r, l) => l.at - r.at).slice(0, c.entries) : [];
}
function j(t, e) {
  const n = E(e);
  return n ? [n, ...t.filter((r) => !(r.site === n.site && r.pubkey === n.pubkey))].slice(0, c.entries) : [...t];
}
function W(t, e, n) {
  return t.filter((r) => !(r.site === e && r.pubkey === n));
}
function G(t, e) {
  const n = t.until <= e;
  return {
    known: k(t.site),
    ended: n,
    lasts: n ? "Ended." : t.remembered ? "Remembered on this device until then, unless you sign out there sooner." : "For one visit: it ended when that site's page was closed or loaded again, and by then at the latest."
  };
}
const w = () => {
  try {
    return typeof localStorage > "u" ? null : localStorage;
  } catch {
    return null;
  }
};
function J(t = Date.now() / 1e3, e = w()) {
  try {
    return _(e?.getItem(A), t);
  } catch {
    return [];
  }
}
function R(t, e = w()) {
  try {
    return e?.setItem(A, JSON.stringify(t)), !!e;
  } catch {
    return !1;
  }
}
function K(t, e = w()) {
  return R(j(J(t.at, e), t), e);
}
function V(t = {}) {
  const e = typeof window > "u" ? null : window.opener;
  if (!e) return Promise.resolve(null);
  const n = location.origin, r = crypto.getRandomValues(new Uint8Array(12)), l = Array.from(r, (u) => u.toString(16).padStart(2, "0")).join("");
  return new Promise((u) => {
    let i = null, d = !1, p = null;
    const g = () => {
      if (!i)
        try {
          const o = e.frames;
          for (let s = 0; s < o.length; s++) o[s].postMessage(h({ t: "hello", nonce: l }), n);
        } catch {
        }
    }, y = setInterval(g, 350), S = setTimeout(() => {
      clearInterval(y), d || (d = !0, window.removeEventListener("message", f), u(null));
    }, t.timeoutMs ?? 6e3), f = (o) => {
      if (o.origin !== n || !o.source || o.source === window) return;
      const s = x(o.data);
      if (!s || s.nonce !== l) return;
      if (s.t === "done" && i && o.source === i) return void p?.(s.ok);
      if (s.t !== "frame" || i) return;
      i = o.source, clearInterval(y), clearTimeout(S), d = !0;
      const { world: a, recipient: I } = s, m = s.wants && H(a, s.wants) ? s.wants : null;
      u({
        site: a,
        wants: m,
        known: k(a) !== null,
        async grant(L, b, M) {
          const N = await L.exportHandoff(I, m ? { site: a, permissions: m } : void 0, a, M === !0), D = new Promise((v) => {
            p = v, setTimeout(() => v(!1), 8e3);
          });
          i.postMessage(h({ t: "grant", nonce: l, world: a, sealed: N, ...b ? { name: b } : {} }), n);
          const O = await D;
          return window.removeEventListener("message", f), O;
        }
      });
    };
    window.addEventListener("message", f), g();
  });
}
export {
  $ as SIGN_LIMITS,
  B as askLockDevice,
  G as describeAllowed,
  q as describePermissions,
  V as findEmbeddedSigner,
  k as knownAppName,
  J as loadAllowed,
  K as recordAllowed,
  W as removeAllowed,
  R as saveAllowed
};
