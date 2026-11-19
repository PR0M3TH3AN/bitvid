import { v as C } from "./bitlogin-shared-C0qJoVBo.js";
import "./bitlogin-shared-Cm1sH5zP.js";
import { c as N, r as x, S as I, P as L } from "./bitlogin-shared-C4PaJAtm.js";
class g extends Error {
  constructor(r) {
    super(`BitLogin refused to ${r}. The application may not be allowed to, or the user may have signed out.`), this.name = "BitLoginRefused";
  }
}
const A = (i, r) => !!i && r.sign.every((s) => i.sign.includes(s)) && r.read.every((s) => i.read.includes(s)) && r.appData.every((s) => i.appData.includes(s) || i.appData.includes("*")) && r.proofs.every((s) => i.proofs.includes(s)) && r.peers.every((s) => i.peers.includes(s));
function $(i) {
  const r = N(i.at);
  if (!r) throw new Error("`at` must be the sign-in address's origin, such as https://bitlogin.network");
  const s = x(i.permissions);
  if (!s) throw new Error("`permissions` is not a permission set BitLogin will show a user. See docs/sign-in-window.md §SW9.2.");
  const O = i.timeoutMs ?? 2e4, a = document.createElement("iframe");
  a.src = `${r}/signer/`, a.title = "BitLogin signer", a.setAttribute("aria-hidden", "true"), a.tabIndex = -1, a.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;opacity:0;pointer-events:none";
  let c = { signedIn: !1 }, m = {};
  const d = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Map();
  let h = !1;
  const S = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (e) => e.toString(16).padStart(2, "0")).join(""), B = (e) => {
    const t = e.unlocked === !0 && typeof e.pubkey == "string", n = t ? x(e.permissions) ?? void 0 : void 0, o = t && A(n, s);
    m = { unlocked: t, ...t ? { pubkey: e.pubkey } : {} };
    const p = {
      signedIn: o,
      ...o ? { pubkey: e.pubkey } : {},
      ...o && typeof e.name == "string" ? { name: e.name } : {},
      ...o && typeof e.until == "number" ? { until: e.until } : {},
      ...t && !o ? { needsMore: !0 } : {}
    }, R = JSON.stringify(p) !== JSON.stringify(c);
    if (c = p, R) for (const M of d) M(c);
  }, v = (e) => {
    if (e.source !== a.contentWindow || e.origin !== r) return;
    const t = e.data;
    if (!t || typeof t != "object" || t.nswp !== I || t.v !== L) return;
    if (t.t === "ready") return void y();
    if (t.t === "state" && B(t), typeof t.id != "string") return;
    const n = u.get(t.id);
    n && (u.delete(t.id), clearTimeout(n.timer), n.resolve(t));
  }, T = (e) => a.contentWindow?.postMessage({ nswp: I, v: L, ...e }, r), l = (e) => new Promise((t, n) => {
    if (h) return n(new Error("This BitLogin client was destroyed."));
    const o = S(), p = setTimeout(() => {
      u.delete(o), n(new Error("BitLogin's signer did not answer."));
    }, O);
    u.set(o, { resolve: t, reject: n, timer: p }), b.then(() => T({ ...e, id: o }));
  });
  let y = () => {
  };
  const b = new Promise((e) => {
    y = e;
  });
  let k = null;
  const w = () => k ??= (async () => (await b, await l({ t: "want", permissions: s }), c))().catch((e) => {
    throw k = null, e;
  });
  window.addEventListener("message", v), a.addEventListener("load", () => y()), (i.mount ?? document.body).append(a), w().catch(() => {
  });
  const f = async (e, t) => {
    const n = await l(e);
    if (n.t !== "text" || typeof n.text != "string") throw new g(t);
    return n.text;
  }, E = (e) => ({
    encrypt: (t, n) => f({ t: "encrypt", peer: t, text: n, scheme: e }, "encrypt that"),
    decrypt: (t, n) => f({ t: "decrypt", peer: t, text: n, scheme: e }, "decrypt that")
  });
  return {
    ready: () => w(),
    state: () => c,
    onChange(e) {
      return d.add(e), () => d.delete(e);
    },
    async signIn() {
      await w();
      const e = window.open(`${r}/connect/`, "bitlogin-connect", "popup,width=480,height=760");
      return e ? new Promise((t) => {
        const n = P((p) => p.signedIn ? (clearInterval(o), t(!0), !0) : !1), o = setInterval(() => {
          e.closed && (clearInterval(o), l({ t: "state" }).catch(() => {
          }).then(() => {
            n(), t(c.signedIn);
          }));
        }, 400);
      }) : !1;
    },
    async signOut() {
      await l({ t: "lock" });
    },
    async getPublicKey() {
      if (!c.signedIn || !c.pubkey) throw new g("say who is signed in");
      return c.pubkey;
    },
    async signEvent(e) {
      const t = await l({ t: "sign", event: e }), n = t.event;
      if (t.t !== "signed" || !C(n)) throw new g("sign that");
      if (n.pubkey !== m.pubkey || n.kind !== e.kind || n.content !== e.content) throw new g("sign that");
      return n;
    },
    nip44: E("nip44"),
    nip04: E("nip04"),
    decryptEvent: (e) => f({ t: "read", event: e }, "read that"),
    destroy() {
      h = !0, window.removeEventListener("message", v);
      for (const e of u.values())
        clearTimeout(e.timer), e.reject(new Error("This BitLogin client was destroyed."));
      u.clear(), d.clear(), a.remove();
    }
  };
  function P(e) {
    const t = (n) => {
      e(n) && d.delete(t);
    };
    return d.add(t), () => d.delete(t);
  }
}
export {
  g as BitLoginRefused,
  $ as createBitLoginClient
};
