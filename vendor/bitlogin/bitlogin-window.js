import { k as F, c as V, r as W, f as $, m as C, h as O, g as G, R as X } from "./bitlogin-shared-DsCziTXz.js";
import { b as we, i as ye } from "./bitlogin-shared-DsCziTXz.js";
import { r as y, f as q, k as N, i as k } from "./bitlogin-shared-Bz2TyEFe.js";
import { f as z } from "./bitlogin-shared-h0qMlq2Q.js";
import { a as be } from "./bitlogin-shared-D6Hzbnis.js";
const _ = "bitlogin:allowed-sites:v1", d = {
  /** No more entries than this are kept: the oldest go first. */
  entries: 200,
  /** How long an entry is kept after it has ended, in seconds. */
  keepEndedSec: 720 * 3600,
  /** After "Just this one", a family is not offered again for this long, in seconds (docs/site-family.md SF4). */
  familyDeclineSec: 720 * 3600,
  /** No more sites than this are listed under a family. */
  members: 20
}, B = /^[0-9a-f]{64}$/u;
function v(n) {
  if (!n || typeof n != "object") return null;
  const e = n, t = y(e.site), r = t || (typeof e.site == "string" && e.site.includes("*") ? "" : V(e.site));
  if (!r || r !== e.site || typeof e.pubkey != "string" || !B.test(e.pubkey) || typeof e.at != "number" || typeof e.until != "number" || !Number.isFinite(e.at) || !Number.isFinite(e.until) || e.until < e.at) return null;
  const s = e.wants === void 0 ? void 0 : W(e.wants);
  if (s === null || t && s) return null;
  const o = t && Array.isArray(e.members) ? [...new Set(e.members.filter((a) => k(a, t)))].slice(0, d.members) : [];
  return { site: r, ...o.length ? { members: o } : {}, pubkey: e.pubkey, at: Math.floor(e.at), until: Math.floor(e.until), remembered: e.remembered === !0, ...s ? { wants: s } : {} };
}
function Q(n, e) {
  if (!n) return [];
  let t;
  try {
    t = JSON.parse(n);
  } catch {
    return [];
  }
  return Array.isArray(t) ? t.slice(0, d.entries * 2).map(v).filter((r) => r !== null && r.until + d.keepEndedSec > e).sort((r, s) => s.at - r.at).slice(0, d.entries) : [];
}
function Z(n, e) {
  const t = v(e);
  if (!t) return [...n];
  const r = n.find((o) => o.site === t.site && o.pubkey === t.pubkey);
  return [y(t.site) && r?.members ? v({ ...t, members: [...t.members ?? [], ...r.members] }) ?? t : t, ...n.filter((o) => !(o.site === t.site && o.pubkey === t.pubkey))].slice(0, d.entries);
}
function ie(n, e, t, r) {
  return !y(t) || !k(e, t) ? null : n.find((s) => s.pubkey === r && s.remembered && s.site !== e && k(s.site, t)) ?? null;
}
function oe(n, e, t) {
  return n.filter((r) => !(r.site === e && r.pubkey === t));
}
function ae(n, e) {
  const t = n.until <= e, r = q(n.site) || null;
  return {
    known: r ? N(n.site) ? `every site at ${r}` : null : F(n.site),
    family: r,
    ended: t,
    lasts: t ? "Ended." : n.remembered ? "Remembered on this device until then, unless you sign out there sooner." : "For one visit: it ended when that site's page was closed or loaded again, and by then at the latest."
  };
}
const p = () => {
  try {
    return typeof localStorage > "u" ? null : localStorage;
  } catch {
    return null;
  }
};
function ee(n = Date.now() / 1e3, e = p()) {
  try {
    return Q(e?.getItem(_), n);
  } catch {
    return [];
  }
}
function te(n, e = p()) {
  try {
    return e?.setItem(_, JSON.stringify(n)), !!e;
  } catch {
    return !1;
  }
}
function le(n, e = p()) {
  return te(Z(ee(n.at, e), n), e);
}
const j = "bitlogin:family-declined:v1", P = (n) => {
  try {
    const e = JSON.parse(n?.getItem(j) ?? "{}");
    return e && typeof e == "object" && !Array.isArray(e) ? e : {};
  } catch {
    return {};
  }
};
function ue(n, e = Date.now() / 1e3, t = p()) {
  if (!y(n)) return !1;
  const r = Math.floor(e), s = Object.fromEntries(Object.entries(P(t)).filter(([o, a]) => y(o) && typeof a == "number" && a > r));
  s[n] = r + d.familyDeclineSec;
  try {
    return t?.setItem(j, JSON.stringify(s)), !!t;
  } catch {
    return !1;
  }
}
function ce(n, e = Date.now() / 1e3, t = p()) {
  const r = P(t)[n];
  return typeof r == "number" && r > e;
}
function fe(n = {}) {
  const e = typeof window > "u" ? null : window.opener;
  if (!e) return Promise.resolve(null);
  const t = location.origin, r = crypto.getRandomValues(new Uint8Array(12)), s = Array.from(r, (o) => o.toString(16).padStart(2, "0")).join("");
  return new Promise((o) => {
    let a = null, g = !1, A = null;
    const E = () => {
      if (!a)
        try {
          const u = e.frames;
          for (let i = 0; i < u.length; i++) u[i].postMessage(O({ t: "hello", nonce: s }), t);
        } catch {
        }
    }, S = setInterval(E, 350), R = setTimeout(() => {
      clearInterval(S), g || (g = !0, window.removeEventListener("message", h), o(null));
    }, n.timeoutMs ?? 6e3), h = (u) => {
      if (u.origin !== t || !u.source || u.source === window) return;
      const i = $(u.data);
      if (!i || i.nonce !== s) return;
      if (i.t === "done" && a && u.source === a) return void A?.(i.ok);
      if (i.t !== "frame" || a) return;
      a = u.source, clearInterval(S), clearTimeout(R), g = !0;
      const { world: c, recipient: T } = i, l = i.wants && C(c, i.wants) ? i.wants : null, x = i.turnedDown === !0 || !!i.wants && !l, f = l ? [] : i.has ?? [], b = l ? [] : (i.more ?? []).filter((w) => !f.includes(w)), m = l || b.length || f.length ? "" : z(c);
      o({
        site: c,
        wants: l,
        known: F(c) !== null,
        family: m,
        knownFamily: m ? N(m) : !1,
        turnedDown: x,
        more: b,
        has: f,
        local: !!l && G(c) && [...l.sign, ...l.read].some((w) => X.includes(w)),
        async grant(w, D, I, H, J) {
          const L = H === !0 && I === !0 && !!m, K = await w.exportHandoff(T, l ? { site: c, permissions: l } : void 0, c, I === !0, L ? m : void 0, L ? void 0 : J === !0 && b.length ? [...f, ...b] : f.length ? f : void 0), Y = new Promise((M) => {
            A = M, setTimeout(() => M(!1), 8e3);
          });
          a.postMessage(O({ t: "grant", nonce: s, world: c, sealed: K, ...D ? { name: D } : {} }), t);
          const U = await Y;
          return window.removeEventListener("message", h), U;
        }
      });
    };
    window.addEventListener("message", h), E();
  });
}
export {
  we as SIGN_LIMITS,
  be as askLockDevice,
  ue as declineFamily,
  ae as describeAllowed,
  ye as describePermissions,
  ce as familyDeclined,
  q as familyDomain,
  z as familyOf,
  ie as familyOffer,
  fe as findEmbeddedSigner,
  k as inFamily,
  F as knownAppName,
  N as knownFamily,
  ee as loadAllowed,
  le as recordAllowed,
  oe as removeAllowed,
  te as saveAllowed
};
