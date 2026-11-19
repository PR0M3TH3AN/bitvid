import { c as W } from "./bitlogin-shared-DgyxWBMr.js";
import { c as T, a as o, b as m, s as B, d as j, m as z, p as J, e as K, l as Q, f as U, k as V, A as w, h as X } from "./bitlogin-shared-C4PaJAtm.js";
function $(F = {}) {
  if (typeof window > "u" || window.parent === window) return { embedded: !1, stop() {
  } };
  const L = location.origin;
  let n = T(location.ancestorOrigins?.[0] ?? ""), a = null, s = null, f = null, u = null, d = 0, g = !1, y = o();
  const D = { burst: m.passBurst, perMs: m.perMs, hourly: m.passHourly };
  let M = o(D), l = null, E = null, k = { quiet: o(w.quiet), public: o(w.public), sensitive: o(w.sensitive), read: o(w.read) };
  const P = (e = [], r = []) => ({
    quiet: o(w.quiet),
    public: o(w.public, e),
    sensitive: o(w.sensitive, r),
    read: o(w.read)
  });
  let b = null;
  const I = async () => a ??= await W(F), N = () => {
    const e = a;
    a = null, s = null, f = null, u = null, d = 0, g = !1, l = null, e?.destroy();
  }, q = async () => {
    const e = a;
    !e || !s || !g || !n || await e.checkTakenBack(n).catch(() => "ok") === "ok" || a !== e || (N(), p(v()));
  }, S = () => {
    const e = a, r = n;
    a = null, s = null, f = null, u = null, d = 0, g = !1, l = null, e && (r ? e.forgetSignerGrant(r) : Promise.resolve()).catch(() => {
    }).finally(() => e.destroy());
  };
  let O = null;
  const H = () => O ??= (async () => {
    if (n)
      try {
        const e = await (await I()).restoreSignerGrant(n);
        if (!e) return;
        s = e.pubkey, f = e.name ?? null, u = e.profile ?? null, d = e.until, g = !0, l = e.permissions ?? null, l ? k = P(e.signed, e.signedSensitive) : y = o(m, e.signed), e.check === "overdue" ? await q() : e.check === "due" && q(), M = o(D, e.signedPass);
      } catch {
      }
  })(), p = (e) => {
    n && window.parent.postMessage(B(e), n);
  }, v = (e) => (s && Date.now() / 1e3 >= d && S(), {
    t: "state",
    ...e ? { id: e } : {},
    unlocked: !!s,
    ...s ? { pubkey: s, until: d, remembered: g } : {},
    // The name in their own signed profile, where they have one; else the name the sign-in address knew them by.
    ...s && (u?.name || f) ? { name: u?.name || f } : {},
    ...s && u?.picture ? { picture: u.picture } : {},
    ...s && u?.about ? { about: u.about } : {},
    // An application is told what it was approved for, so it can tell that from what it now wants.
    ...s && l ? { permissions: l } : {}
  }), _ = async (e) => {
    const r = T(e.origin);
    if (!r || (n ||= r, r !== n)) return;
    const t = j(e.data);
    if (!t) return;
    if (await H(), t.t === "state") return p(v(t.id));
    if (t.t === "lock")
      return S(), p(v(t.id));
    if (t.t === "want")
      return E = z(n, t.permissions) ? t.permissions : null, p(v(t.id));
    const i = () => p({ t: "refused", id: t.id });
    if (s && Date.now() / 1e3 >= d && S(), !a || !s) return i();
    if (t.t === "encrypt" || t.t === "decrypt" || t.t === "read") {
      if (!l || t.t !== "encrypt" && !k.read.take(Date.now())) return i();
      try {
        const h = t.t === "read" ? await a.appDecryptEvent(t.event) : t.t === "encrypt" ? await a.appEncrypt(t.peer, t.text, t.scheme) : await a.appDecrypt(t.peer, t.text, t.scheme);
        return p({ t: "text", id: t.id, text: h });
      } catch {
        return i();
      }
    }
    if (t.t === "pass") {
      if (l || t.session === s || !M.take(Date.now())) return i();
      try {
        const h = await a.roomPass(t.session);
        if (h.pubkey !== s) return i();
        p({ t: "signed", id: t.id, event: h }), a.touchSignerGrant(n, y.times(), void 0, M.times()).catch(() => {
        });
      } catch {
        i();
      }
      return;
    }
    const c = Date.now(), x = l ? J(l, t.event, n, c / 1e3) : K(t.event, n, c / 1e3);
    if (!x) return i();
    const G = l ? Q(x.kind) : null;
    if (!(G ? k[G] : y).take(c)) return i();
    try {
      const h = await a.signEvent(x);
      if (h.pubkey !== s) return i();
      p({ t: "signed", id: t.id, event: h }), G ? G !== "quiet" && a.touchSignerGrant(n, k.public.times(), k.sensitive.times()).catch(() => {
      }) : a.touchSignerGrant(n, y.times()).catch(() => {
      });
    } catch {
      i();
    }
  }, C = async (e) => {
    const r = U(e.data);
    if (!r || !e.source) return;
    const t = (i) => e.source.postMessage(X(i), L);
    if (r.t === "hello") {
      if (!n) return;
      await H();
      try {
        const i = await (await I()).beginHandoff();
        b = { nonce: r.nonce, from: e.source }, t({ t: "frame", nonce: r.nonce, world: n, recipient: i, ...E ? { wants: E } : {} });
      } catch {
      }
      return;
    }
    if (r.t === "grant" && !(!b || b.nonce !== r.nonce || b.from !== e.source || r.world !== n)) {
      b = null;
      try {
        const i = await I(), c = await i.acceptHandoff(r.sealed);
        if (c.app && c.app.site !== n || c.site && c.site !== n) throw new Error("for another site");
        u = c.profile ?? null, l = c.app?.permissions ?? null, k = P(), s = c.pubkey, f = r.name ?? null, y = o(), M = o(D), d = Math.floor(Date.now() / 1e3) + (c.remember ? V(n) !== null ? m.grantSec : m.unknownGrantSec : m.visitSec), g = c.remember === !0 && await i.keepSignerGrant({ site: n, until: d, ...f ? { name: f } : {} }).catch(() => !1), g || (d = Math.min(d, Math.floor(Date.now() / 1e3) + m.visitSec)), t({ t: "done", nonce: r.nonce, ok: !0 });
      } catch {
        S(), t({ t: "done", nonce: r.nonce, ok: !1 });
      }
      p(v());
    }
  }, A = (e) => {
    if (e.source === window.parent) return void _(e);
    e.origin === L && e.source !== window && C(e);
  };
  window.addEventListener("message", A);
  const R = setInterval(() => void q(), 36e5);
  return n && (window.parent.postMessage(B({ t: "ready" }), n), H().then(() => {
    s && p(v());
  })), {
    embedded: !0,
    stop() {
      clearInterval(R), window.removeEventListener("message", A), S();
    }
  };
}
export {
  $ as startEmbeddedSigner
};
