import { v as C } from "./bitlogin-shared-Cj9s0_W_.js";
import { c as N, r as x, S as L, P as O } from "./bitlogin-shared-DsCziTXz.js";
class g extends Error {
  constructor(i) {
    super(`BitLogin refused to ${i}. The application may not be allowed to, or the user may have signed out.`), this.name = "BitLoginRefused";
  }
}
const $ = (s, i) => !!s && i.sign.every((r) => s.sign.includes(r)) && i.read.every((r) => s.read.includes(r)) && i.appData.every((r) => s.appData.includes(r) || s.appData.includes("*")) && i.proofs.every((r) => s.proofs.includes(r)) && i.peers.every((r) => s.peers.includes(r));
function W(s) {
  const i = N(s.at);
  if (!i) throw new Error("`at` must be the sign-in address's origin, such as https://bitlogin.network");
  const r = x(s.permissions);
  if (!r) throw new Error("`permissions` is not a permission set BitLogin will show a user. See docs/sign-in-window.md §SW9.2.");
  const S = s.timeoutMs ?? 2e4, a = document.createElement("iframe");
  a.src = `${i}/signer/`, a.title = "BitLogin signer", a.setAttribute("aria-hidden", "true"), a.tabIndex = -1, a.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;opacity:0;pointer-events:none";
  let c = { signedIn: !1 }, m = {}, y;
  const d = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Map();
  let v = !1;
  const B = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (e) => e.toString(16).padStart(2, "0")).join(""), P = (e) => {
    const t = e.unlocked === !0 && typeof e.pubkey == "string";
    typeof e.taken == "boolean" && (y = e.taken);
    const n = t ? x(e.permissions) ?? void 0 : void 0, o = t && $(n, r);
    m = { unlocked: t, ...t ? { pubkey: e.pubkey } : {} };
    const l = {
      signedIn: o,
      ...o ? { pubkey: e.pubkey } : {},
      ...o && typeof e.name == "string" ? { name: e.name } : {},
      ...o && typeof e.until == "number" ? { until: e.until } : {},
      ...t && !o ? { needsMore: !0 } : {},
      ...y !== void 0 ? { canAsk: y } : {}
    }, M = JSON.stringify(l) !== JSON.stringify(c);
    if (c = l, M) for (const A of d) A(c);
  }, b = (e) => {
    if (e.source !== a.contentWindow || e.origin !== i) return;
    const t = e.data;
    if (!t || typeof t != "object" || t.nswp !== L || t.v !== O) return;
    if (t.t === "ready") return void f();
    if (t.t === "state" && P(t), typeof t.id != "string") return;
    const n = u.get(t.id);
    n && (u.delete(t.id), clearTimeout(n.timer), n.resolve(t));
  }, T = (e) => a.contentWindow?.postMessage({ nswp: L, v: O, ...e }, i), p = (e) => new Promise((t, n) => {
    if (v) return n(new Error("This BitLogin client was destroyed."));
    const o = B(), l = setTimeout(() => {
      u.delete(o), n(new Error("BitLogin's signer did not answer."));
    }, S);
    u.set(o, { resolve: t, reject: n, timer: l }), k.then(() => T({ ...e, id: o }));
  });
  let f = () => {
  };
  const k = new Promise((e) => {
    f = e;
  });
  let I = null;
  const w = () => I ??= (async () => (await k, await p({ t: "want", permissions: r }), c))().catch((e) => {
    throw I = null, e;
  });
  window.addEventListener("message", b), a.addEventListener("load", () => f()), (s.mount ?? document.body).append(a), w().catch(() => {
  });
  const h = async (e, t) => {
    const n = await p(e);
    if (n.t !== "text" || typeof n.text != "string") throw new g(t);
    return n.text;
  }, E = (e) => ({
    encrypt: (t, n) => h({ t: "encrypt", peer: t, text: n, scheme: e }, "encrypt that"),
    decrypt: (t, n) => h({ t: "decrypt", peer: t, text: n, scheme: e }, "decrypt that")
  });
  return {
    ready: () => w(),
    state: () => c,
    onChange(e) {
      return d.add(e), () => d.delete(e);
    },
    async signIn() {
      await w();
      const e = window.open(`${i}/connect/`, "bitlogin-connect", "popup,width=480,height=760");
      return e ? new Promise((t) => {
        const n = R((l) => l.signedIn ? (clearInterval(o), t(!0), !0) : !1), o = setInterval(() => {
          e.closed && (clearInterval(o), p({ t: "state" }).catch(() => {
          }).then(() => {
            n(), t(c.signedIn);
          }));
        }, 400);
      }) : !1;
    },
    async switchAccount() {
      await w();
      const e = window.open(`${i}/connect/#switch`, "bitlogin-connect", "popup,width=480,height=760");
      return e ? new Promise((t) => {
        const n = setInterval(() => {
          e.closed && (clearInterval(n), p({ t: "state" }).catch(() => {
          }).then(() => t(c.signedIn)));
        }, 400);
      }) : !1;
    },
    async signOut() {
      await p({ t: "lock" });
    },
    async getPublicKey() {
      if (!c.signedIn || !c.pubkey) throw new g("say who is signed in");
      return c.pubkey;
    },
    async signEvent(e) {
      const t = await p({ t: "sign", event: e }), n = t.event;
      if (t.t !== "signed" || !C(n)) throw new g("sign that");
      if (n.pubkey !== m.pubkey || n.kind !== e.kind || n.content !== e.content) throw new g("sign that");
      return n;
    },
    nip44: E("nip44"),
    nip04: E("nip04"),
    decryptEvent: (e) => h({ t: "read", event: e }, "read that"),
    destroy() {
      v = !0, window.removeEventListener("message", b);
      for (const e of u.values())
        clearTimeout(e.timer), e.reject(new Error("This BitLogin client was destroyed."));
      u.clear(), d.clear(), a.remove();
    }
  };
  function R(e) {
    const t = (n) => {
      e(n) && d.delete(t);
    };
    return d.add(t), () => d.delete(t);
  }
}
export {
  g as BitLoginRefused,
  W as createBitLoginClient
};
