import { c as K } from "./bitlogin-shared-D-JqvHzL.js";
import { k as Q } from "./bitlogin-shared-Bz2TyEFe.js";
import { f as B } from "./bitlogin-shared-h0qMlq2Q.js";
import { c as W, a as u, b as g, A as h, s as _, d as V, m as X, p as Y, e as Z, l as $, f as ee, k as te, W as ne, h as re } from "./bitlogin-shared-DsCziTXz.js";
function le(N = {}) {
  if (typeof window > "u" || window.parent === window) return { embedded: !1, stop() {
  } };
  const F = location.origin;
  let i = W(location.ancestorOrigins?.[0] ?? ""), a = null, r = null, m = null, f = null, p = 0, y = !1, S = u();
  const x = { burst: g.passBurst, perMs: g.perMs, hourly: g.passHourly };
  let E = u(x), o = null, M = null, P = !1, w = [], H = [], k = { quiet: u(h.quiet), public: u(h.public), sensitive: u(h.sensitive), read: u(h.read) };
  const R = (t = [], l = []) => ({
    quiet: u(h.quiet),
    public: u(h.public, t),
    sensitive: u(h.sensitive, l),
    read: u(h.read)
  });
  let D = null;
  const L = async () => a ??= await K(N), C = () => {
    const t = a;
    a = null, r = null, m = null, f = null, p = 0, y = !1, o = null, t?.destroy();
  }, O = async () => {
    const t = a;
    !t || !r || !y || !i || await t.checkTakenBack(i).catch(() => "ok") === "ok" || a !== t || (C(), c(v()));
  }, G = () => {
    const t = a, l = i;
    a = null, r = null, m = null, f = null, p = 0, y = !1, o = null, w = [], t && (l ? t.forgetSignerGrant(l) : Promise.resolve()).catch(() => {
    }).finally(() => t.destroy());
  };
  let U = null;
  const A = () => U ??= (async () => {
    if (i)
      try {
        const t = await (await L()).restoreSignerGrant(i, B(i) || void 0);
        if (!t) return;
        r = t.pubkey, m = t.name ?? null, f = t.profile ?? null, p = t.until, y = !0, o = t.permissions ?? null, w = o ? [] : t.more ?? [], o ? k = R(t.signed, t.signedSensitive) : S = u(g, t.signed), t.check === "overdue" ? await O() : t.check === "due" && O(), E = u(x, t.signedPass);
      } catch {
      }
  })(), c = (t) => {
    i && window.parent.postMessage(_(t), i);
  }, v = (t) => (r && Date.now() / 1e3 >= p && G(), {
    t: "state",
    ...t ? { id: t } : {},
    unlocked: !!r,
    ...r ? { pubkey: r, until: p, remembered: y } : {},
    // The name in their own signed profile, where they have one; else the name the sign-in address knew them by.
    ...r && (f?.name || m) ? { name: f?.name || m } : {},
    ...r && f?.picture ? { picture: f.picture } : {},
    ...r && f?.about ? { about: f.about } : {},
    // An application is told what it was approved for, so it can tell that from what it now wants.
    ...r && o ? { permissions: o } : {},
    // A world is told what more it was let do, so it asks for nothing that isn't there.
    ...r && !o && w.length ? { more: w } : {},
    // What can be asked for here at all, said locked or unlocked. Not to an application: it is held to its set.
    ...o ? {} : { offers: [...ne] }
  }), j = async (t) => {
    const l = W(t.origin);
    if (!l || (i ||= l, l !== i)) return;
    const e = V(t.data);
    if (!e) return;
    if (await A(), e.t === "state") return c(v(e.id));
    if (e.t === "lock")
      return G(), c(v(e.id));
    if (e.t === "wantMore")
      return H = e.more, c(v(e.id));
    if (e.t === "want") {
      const s = X(i, e.permissions);
      return M = s ? e.permissions : null, P = !s, c({ ...v(e.id), taken: s });
    }
    const n = () => c({ t: "refused", id: e.id });
    if (r && Date.now() / 1e3 >= p && G(), !a || !r) return n();
    if (e.t === "encrypt" || e.t === "decrypt" || e.t === "read") {
      if (!o || e.t !== "encrypt" && !k.read.take(Date.now())) return n();
      try {
        const s = e.t === "read" ? await a.appDecryptEvent(e.event) : e.t === "encrypt" ? await a.appEncrypt(e.peer, e.text, e.scheme) : await a.appDecrypt(e.peer, e.text, e.scheme);
        return c({ t: "text", id: e.id, text: s });
      } catch {
        return n();
      }
    }
    if (e.t === "save" || e.t === "find" || e.t === "open") {
      if (o) return n();
      try {
        if (e.t === "find") return c({ t: "found", id: e.id, d: await a.worldFind(e.slot) });
        if (e.t === "open") return c({ t: "opened", id: e.id, ...await a.worldOpen(e.event) });
        const s = await a.worldSave(e.slot, e.data);
        return s.pubkey !== r ? n() : c({ t: "signed", id: e.id, event: s });
      } catch {
        return n();
      }
    }
    if (e.t === "follow") {
      if (o || !w.includes("follows")) return n();
      try {
        const s = await a.worldFollow(e.list, e.add ? { add: e.add } : { remove: e.remove });
        return s.pubkey !== r ? n() : c({ t: "signed", id: e.id, event: s });
      } catch {
        return n();
      }
    }
    if (e.t === "score" || e.t === "achieve") {
      if (o) return n();
      try {
        const s = e.t === "score" ? await a.worldScore(e.world, e.board, e.score, { ...e.title ? { title: e.title } : {}, ...e.format ? { format: e.format } : {} }) : await a.worldAchieve(e.world, e.achievement, e.title);
        return s.pubkey !== r ? n() : c({ t: "signed", id: e.id, event: s });
      } catch {
        return n();
      }
    }
    if (e.t === "seal" || e.t === "unwrap" || e.t === "reach") {
      if (o || !w.includes("messages")) return n();
      try {
        if (e.t === "unwrap") return c({ t: "message", id: e.id, message: await a.worldUnwrap(e.event) });
        if (e.t === "reach") {
          const q = await a.worldReach(e.relays);
          return q.pubkey !== r ? n() : c({ t: "signed", id: e.id, event: q });
        }
        const s = await a.worldSeal(e.to, e.text);
        return s.message.pubkey !== r || s.seals.some((q) => q.pubkey !== r) ? n() : c({ t: "sealed", id: e.id, message: s.message, seals: s.seals });
      } catch {
        return n();
      }
    }
    if (e.t === "pass") {
      if (o || e.session === r || !E.take(Date.now())) return n();
      try {
        const s = await a.roomPass(e.session);
        if (s.pubkey !== r) return n();
        c({ t: "signed", id: e.id, event: s }), a.touchSignerGrant(i, S.times(), void 0, E.times()).catch(() => {
        });
      } catch {
        n();
      }
      return;
    }
    const d = Date.now(), I = o ? Y(o, e.event, i, d / 1e3) : Z(e.event, i, d / 1e3);
    if (!I) return n();
    const b = o ? $(I.kind) : null;
    if (!(b ? k[b] : S).take(d)) return n();
    try {
      const s = await a.signEvent(I);
      if (s.pubkey !== r) return n();
      c({ t: "signed", id: e.id, event: s }), b ? b !== "quiet" && a.touchSignerGrant(i, k.public.times(), k.sensitive.times()).catch(() => {
      }) : a.touchSignerGrant(i, S.times()).catch(() => {
      });
    } catch {
      n();
    }
  }, z = async (t) => {
    const l = ee(t.data);
    if (!l || !t.source) return;
    const e = (n) => t.source.postMessage(re(n), F);
    if (l.t === "hello") {
      if (!i) return;
      await A();
      try {
        const n = await (await L()).beginHandoff();
        D = { nonce: l.nonce, from: t.source }, e({ t: "frame", nonce: l.nonce, world: i, recipient: n, ...M ? { wants: M } : {}, ...P ? { turnedDown: !0 } : {}, ...!M && H.length ? { more: H } : {}, ...!M && r && !o && w.length ? { has: w } : {} });
      } catch {
      }
      return;
    }
    if (l.t === "grant" && !(!D || D.nonce !== l.nonce || D.from !== t.source || l.world !== i)) {
      D = null;
      try {
        const n = await L(), d = await n.acceptHandoff(l.sealed);
        if (d.app && d.app.site !== i || d.site && d.site !== i) throw new Error("for another site");
        if (d.family && d.family !== B(i)) throw new Error("for another family");
        f = d.profile ?? null, o = d.app?.permissions ?? null, w = o || d.family ? [] : d.more ?? [], k = R(), r = d.pubkey, m = l.name ?? null, S = u(), E = u(x);
        const b = (d.family ? Q(d.family) : te(i) !== null) && !w.includes("messages") ? g.grantSec : g.unknownGrantSec;
        p = Math.floor(Date.now() / 1e3) + (d.remember ? b : g.visitSec), y = d.remember === !0 && await n.keepSignerGrant({ site: i, until: p, ...m ? { name: m } : {} }).catch(() => !1), y || (p = Math.min(p, Math.floor(Date.now() / 1e3) + g.visitSec)), e({ t: "done", nonce: l.nonce, ok: !0 });
      } catch {
        G(), e({ t: "done", nonce: l.nonce, ok: !1 });
      }
      c(v());
    }
  }, T = (t) => {
    if (t.source === window.parent) return void j(t);
    t.origin === F && t.source !== window && z(t);
  };
  window.addEventListener("message", T);
  const J = setInterval(() => void O(), 36e5);
  return i && (window.parent.postMessage(_({ t: "ready" }), i), A().then(() => {
    r && c(v());
  })), {
    embedded: !0,
    stop() {
      clearInterval(J), window.removeEventListener("message", T), G();
    }
  };
}
export {
  le as startEmbeddedSigner
};
