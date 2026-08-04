import { r as be, e as Se, E as Le, v as Ne, u as we, a as z, b as me, h as Pe, c as ae, d as Re, p as Be, R as $e, f as _, i as le } from "./bitlogin-shared-CEfP5Eg9.js";
const Me = 6, ce = 64;
function G(o = Me) {
  const e = Se(), t = [];
  for (let r = 0; r < o; r++)
    t.push(e[be(e.length)]);
  const n = o * Le;
  if (n < ce)
    throw new Error(`Passphrase of ${o} words provides only ~${n.toFixed(1)} bits; must exceed ${ce}.`);
  return { kind: "passphrase", secret: t.join(" "), entropyBits: n };
}
const Te = 6e4, K = 26e4, Ae = 32e4;
class _e {
  worker;
  pending = /* @__PURE__ */ new Map();
  counter = 0;
  dead = !1;
  /** Set by the element to receive unsolicited worker frames (auth_url). */
  onNotification = null;
  constructor() {
    const e = ["cryptoWorker", ".js"].join(""), t = new URL(e, import.meta.url);
    this.worker = new Worker(t, { type: "module" }), this.worker.addEventListener("message", (r) => {
      const a = r.data;
      if (!a || typeof a != "object") return;
      const s = a;
      if (s.notify === "nip46-auth-url" && typeof s.url == "string") {
        this.onNotification?.(s);
        return;
      }
      if (typeof a.id != "string") return;
      const i = this.pending.get(a.id);
      if (i)
        if (this.pending.delete(a.id), clearTimeout(i.timer), a.ok)
          i.resolve(a.result);
        else {
          const u = new Error(a.error);
          u.name = a.errorName ?? "Error", i.reject(u);
        }
    });
    const n = (r) => () => this.failAll(r);
    this.worker.addEventListener("error", n("The BitLogin crypto worker stopped unexpectedly.")), this.worker.addEventListener(
      "messageerror",
      n("The BitLogin crypto worker sent an unreadable message.")
    );
  }
  /** Settles every outstanding call with an error. Idempotent. */
  failAll(e) {
    const t = [...this.pending.values()];
    this.pending.clear();
    for (const n of t)
      clearTimeout(n.timer), n.reject(new Error(e));
  }
  call(e, t, n = Te) {
    if (this.dead)
      return Promise.reject(new Error("This BitLogin session was torn down; reload the page to sign in again."));
    const r = `${Date.now().toString(36)}-${(this.counter++).toString(36)}`;
    return new Promise((a, s) => {
      const i = setTimeout(() => {
        this.pending.delete(r), s(new Error(`BitLogin's ${e} call timed out.`));
      }, n);
      this.pending.set(r, { resolve: a, reject: s, timer: i });
      const u = { id: r, action: e, payload: t };
      this.worker.postMessage(u);
    });
  }
  configure(e) {
    return this.call("configure", e);
  }
  register(e) {
    return this.call("register", e);
  }
  previewImportKey(e) {
    return this.call("previewImportKey", e);
  }
  login(e) {
    return this.call("login", e);
  }
  recover(e) {
    return this.call("recover", e);
  }
  completeRecovery(e) {
    return this.call("completeRecovery", e);
  }
  changePassword(e) {
    return this.call("changePassword", e);
  }
  publishProfileAndRelayLists(e) {
    return this.call("publishProfileAndRelayLists", e);
  }
  getPublicKey() {
    return this.call("getPublicKey", {});
  }
  signEvent(e) {
    return this.call("signEvent", e);
  }
  nip44Encrypt(e) {
    return this.call("nip44Encrypt", e);
  }
  nip44Decrypt(e) {
    return this.call("nip44Decrypt", e);
  }
  nip04Encrypt(e) {
    return this.call("nip04Encrypt", e);
  }
  nip04Decrypt(e) {
    return this.call("nip04Decrypt", e);
  }
  exportIdentity() {
    return this.call("exportIdentity", {});
  }
  buildRecoveryExport() {
    return this.call("buildRecoveryExport", {});
  }
  repairReplicas() {
    return this.call("repairReplicas", {});
  }
  getSessionStatus() {
    return this.call("getSessionStatus", {});
  }
  restoreSession() {
    return this.call("restoreSession", {});
  }
  vaultStatus() {
    return this.call("vaultStatus", {});
  }
  vaultList() {
    return this.call("vaultList", {});
  }
  vaultSaveNwc(e) {
    return this.call("vaultSaveNwc", e);
  }
  vaultFindForOrigin() {
    return this.call("vaultFindForOrigin", {});
  }
  vaultRevealNwc(e) {
    return this.call("vaultRevealNwc", e);
  }
  vaultSetBinding(e) {
    return this.call("vaultSetBinding", e);
  }
  vaultDelete(e) {
    return this.call("vaultDelete", e);
  }
  vaultOfferCheck(e) {
    return this.call("vaultOfferCheck", e);
  }
  // ---- NIP-46 remote-signer session (§LM5) ----
  nip46Connect(e) {
    return this.call("nip46Connect", e, K);
  }
  nip46NostrconnectStart(e) {
    return this.call("nip46NostrconnectStart", e);
  }
  nip46NostrconnectAwait() {
    return this.call("nip46NostrconnectAwait", {}, Ae);
  }
  nip46SignEvent(e) {
    return this.call("nip46SignEvent", e, K);
  }
  nip46Nip44Encrypt(e) {
    return this.call("nip46Nip44Encrypt", e, K);
  }
  nip46Nip44Decrypt(e) {
    return this.call("nip46Nip44Decrypt", e, K);
  }
  nip46Nip04Encrypt(e) {
    return this.call("nip46Nip04Encrypt", e, K);
  }
  nip46Nip04Decrypt(e) {
    return this.call("nip46Nip04Decrypt", e, K);
  }
  nip46Disconnect() {
    return this.call("nip46Disconnect", {});
  }
  logout() {
    return this.call("logout", {});
  }
  terminate() {
    this.dead = !0, this.worker.terminate(), this.failAll("The BitLogin crypto worker was terminated.");
  }
}
function De(o, e) {
  return {
    getPublicKey: () => o.getPublicKey(),
    signEvent: (t) => o.signEvent(t),
    async getRelays() {
      const t = {};
      for (const n of e()) t[n] = { read: !0, write: !0 };
      return t;
    },
    nip44: {
      encrypt: (t, n) => o.nip44Encrypt(t, n),
      decrypt: (t, n) => o.nip44Decrypt(t, n)
    },
    nip04: {
      encrypt: (t, n) => o.nip04Encrypt(t, n),
      decrypt: (t, n) => o.nip04Decrypt(t, n)
    },
    _bitlogin: !0
  };
}
const Ie = "BitLogin: no identity is unlocked yet. Add <bitlogin-auth> to the page and let the user sign in, or call it programmatically before invoking window.nostr.";
function F(o) {
  return o.catch((e) => {
    throw e.message.includes("No identity is unlocked") ? new Error(Ie) : e;
  });
}
function mt(o, e) {
  return {
    async getPublicKey() {
      const { publicKey: t } = await F(o.getPublicKey());
      return t;
    },
    async signEvent(t) {
      return F(o.signEvent(t));
    },
    async getRelays() {
      const t = {};
      for (const n of e()) t[n] = { read: !0, write: !0 };
      return t;
    },
    nip44: {
      async encrypt(t, n) {
        const { ciphertext: r } = await F(o.nip44Encrypt({ peerPublicKey: t, plaintext: n }));
        return r;
      },
      async decrypt(t, n) {
        const { plaintext: r } = await F(o.nip44Decrypt({ peerPublicKey: t, payload: n }));
        return r;
      }
    },
    nip04: {
      async encrypt(t, n) {
        const { ciphertext: r } = await F(o.nip04Encrypt({ peerPublicKey: t, plaintext: n }));
        return r;
      },
      async decrypt(t, n) {
        const { plaintext: r } = await F(o.nip04Decrypt({ peerPublicKey: t, payload: n }));
        return r;
      }
    },
    _bitlogin: !0
  };
}
function Oe(o) {
  const e = o.getAttribute("vault-relays"), t = o.getAttribute("discovery-relays");
  return {
    vaultRelayUrls: e ? e.split(",").map((n) => n.trim()).filter(Boolean) : void 0,
    discoveryRelayUrls: t ? t.split(",").map((n) => n.trim()).filter(Boolean) : void 0
  };
}
const Ue = (
  /* css */
  `
:host {
  --bl-accent: #6d28d9;
  --bl-accent-hover: #5b21b6;
  --bl-accent-fg: white;
  --bl-bg: #ffffff;
  --bl-fg: #16151a;
  --bl-muted: #6b7280;
  --bl-border: #e5e7eb;
  --bl-input-bg: #f9fafb;
  --bl-danger: #b91c1c;
  --bl-danger-bg: #fef2f2;
  --bl-warn: #92400e;
  --bl-warn-bg: #fffbeb;
  --bl-radius: 14px;
  /* Caps the widget's own width; a host page that wants it to fill a wider
     container (rather than stay a fixed-width card) overrides this to a
     larger value or "none". */
  --bl-max-width: 380px;
  --bl-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  all: initial;
  display: inline-block;
  width: 100%;
  max-width: var(--bl-max-width);
  font-family: var(--bl-font-family);
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bl-bg: #17151f;
    --bl-fg: #f4f2f8;
    --bl-muted: #9a94ab;
    --bl-border: #322d40;
    --bl-input-bg: #201d2b;
    --bl-danger: #fca5a5;
    --bl-danger-bg: #3a1414;
    --bl-warn: #fcd34d;
    --bl-warn-bg: #3a2a0a;
  }
}
:host([data-theme="dark"]) {
  --bl-bg: #17151f;
  --bl-fg: #f4f2f8;
  --bl-muted: #9a94ab;
  --bl-border: #322d40;
  --bl-input-bg: #201d2b;
}
:host([data-theme="light"]) {
  --bl-bg: #ffffff;
  --bl-fg: #16151a;
  --bl-muted: #6b7280;
  --bl-border: #e5e7eb;
  --bl-input-bg: #f9fafb;
}
* { box-sizing: border-box; }
.card {
  position: relative;
  width: 100%;
  background: var(--bl-bg);
  color: var(--bl-fg);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 24px;
  font-size: 14px;
  line-height: 1.5;
}
h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}
/* One fixed SVG (icon + wordmark, same file as the marketing site's assets/lockup.svg)
   with the relative size and spacing between them baked in -- only the overall height
   is ever set here, so the lockup can never end up looking different in one place than
   another the way independently-sized icon + text elements could drift apart. */
.brand-lockup {
  display: block;
  height: 20px;
  width: auto;
  margin: 0 0 6px;
  color: var(--bl-fg);
}
/* Brief confirmation stamp shown over the destination screen right after a real
   security-relevant success (see flashSuccess() in element.ts) -- the same brass ring
   and checkmark as the brand mark, so a successful sign-in/create/recover/rotate reads
   as "sealed," not just a silent screen change. Never blocks interaction, and fades out
   on its own; the JS timer that removes it entirely doesn't depend on the animation. */
.success-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--bl-bg);
  border-radius: var(--bl-radius);
  pointer-events: none;
  animation: bl-overlay-fade-out 0.4s ease 0.7s both;
}
.success-stamp svg {
  width: 56px;
  height: 56px;
  animation: bl-stamp-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.success-label {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--bl-fg);
  opacity: 0;
  animation: bl-label-in 0.3s ease 0.35s both;
}
@keyframes bl-stamp-in {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes bl-label-in {
  to { opacity: 1; }
}
@keyframes bl-overlay-fade-out {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .success-overlay { animation: none; }
  .success-stamp svg { animation: none; }
  .success-label { animation: none; opacity: 1; }
}
p.sub {
  color: var(--bl-muted);
  margin: 0 0 18px;
  font-size: 13px;
}
label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin: 14px 0 6px;
}
input[type="text"], input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid var(--bl-border);
  background: var(--bl-input-bg);
  color: var(--bl-fg);
  font-size: 14px;
  font-family: inherit;
}
input:focus { outline: 2px solid var(--bl-accent); outline-offset: 1px; }
.credential-box {
  background: var(--bl-input-bg);
  border: 1px solid var(--bl-border);
  border-radius: 9px;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13.5px;
  word-break: break-word;
  margin: 6px 0 2px;
  user-select: all;
}
.phrase-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 10px 0;
}
.phrase-word {
  background: var(--bl-input-bg);
  border: 1px solid var(--bl-border);
  border-radius: 7px;
  padding: 6px 8px;
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  display: flex;
  gap: 4px;
}
.phrase-word span { color: var(--bl-muted); }
button {
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  border-radius: 9px;
  border: none;
  padding: 11px 14px;
  cursor: pointer;
  width: 100%;
  margin-top: 14px;
}
button.primary { background: var(--bl-accent); color: var(--bl-accent-fg); }
button.primary:hover { background: var(--bl-accent-hover); }
button.primary:disabled { opacity: 0.55; cursor: default; }
button.secondary { background: transparent; color: var(--bl-fg); border: 1px solid var(--bl-border); }
button.secondary:hover { background: var(--bl-input-bg); }
button.link {
  display: block;
  background: none;
  color: var(--bl-accent);
  width: auto;
  padding: 0;
  margin: 12px 0 0;
  font-weight: 500;
  font-size: 13px;
}
button:focus-visible { outline: 2px solid var(--bl-accent); outline-offset: 2px; }
.screen-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px -8px; /* negative left margin optically aligns the chevron with the content edge */
}
.screen-head h2 { margin: 0; }
.icon-back {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: none;
  color: var(--bl-muted);
}
.icon-back:hover { background: var(--bl-input-bg); color: var(--bl-fg); }
.icon-back svg { width: 20px; height: 20px; }
/* Right-aligned helper link under an input (e.g. "Forgot password?"). */
.field-hint { display: flex; justify-content: flex-end; margin-top: 8px; }
.field-hint .link-inline {
  width: auto;
  margin: 0;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--bl-accent);
  font-size: 12.5px;
  font-weight: 500;
}
/* Collapsed disclosure for every non-primary sign-in path (§LM9.1: the
   password flow stays the visual headline; alternatives are one tap away).
   Rows are full-bleed buttons with generous minimum height so the menu works
   as well under a thumb as a pointer. */
.options-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  color: var(--bl-muted);
  font-size: 13px;
  font-weight: 500;
  padding: 10px 0 8px;
  margin-top: 8px;
}
.options-toggle:hover { color: var(--bl-fg); }
.options-toggle svg { width: 14px; height: 14px; transition: transform 0.18s ease; }
.options-toggle.open svg { transform: rotate(180deg); }
.option-menu {
  border: 1px solid var(--bl-border);
  border-radius: 12px;
  margin-top: 4px;
  overflow: hidden;
}
.option-group-label {
  padding: 10px 14px 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bl-muted);
}
.option-group-label + .option-row { border-top: none; }
.notice .link-inline {
  width: auto;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-size: inherit;
  font-weight: 600;
  text-decoration: underline;
}
.option-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 12px 14px;
  min-height: 56px;
  background: none;
  border: none;
  border-radius: 0;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: var(--bl-fg);
}
.option-row + .option-row { border-top: 1px solid var(--bl-border); }
.option-row:hover { background: var(--bl-input-bg); }
.option-row:disabled { opacity: 0.55; cursor: default; }
.option-icon { flex: none; width: 20px; height: 20px; color: var(--bl-muted); }
.option-icon svg { display: block; width: 100%; height: 100%; }
.option-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.option-sub { font-size: 12px; font-weight: 400; color: var(--bl-muted); }
@media (prefers-reduced-motion: reduce) {
  .options-toggle svg { transition: none; }
}
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
.notice {
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 13px;
  margin: 12px 0;
}
.notice.warn { background: var(--bl-warn-bg); color: var(--bl-warn); }
.notice.error { background: var(--bl-danger-bg); color: var(--bl-danger); }
.notice.info { background: var(--bl-input-bg); color: var(--bl-fg); border: 1px solid var(--bl-border); }
.pubkey {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--bl-muted);
  word-break: break-all;
}
.divider { border-top: 1px solid var(--bl-border); margin: 18px 0; }
.small { font-size: 12px; color: var(--bl-muted); }
.checkbox-row { display: flex; align-items: flex-start; gap: 8px; margin: 14px 0; font-size: 13px; }
.checkbox-row input { margin-top: 3px; }
.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: bl-spin 0.7s linear infinite;
  vertical-align: -2px;
  margin-right: 6px;
}
@keyframes bl-spin { to { transform: rotate(360deg); } }

/* nostrconnect QR (§LM5). The white backing and quiet zone are drawn inside
   the SVG itself -- scanners need them regardless of host theme -- so the
   wrapper only sizes and centers it. */
.qr-wrap {
  display: block;
  width: min(240px, 100%);
  margin: 14px auto;
}
.qr-wrap svg { display: block; width: 100%; height: auto; }
`
), ve = "bc:config", Ke = /^nostr\+walletconnect:\/\//iu;
let Z = null;
function Fe(o) {
  if (!Z) {
    try {
      localStorage.removeItem(ve);
    } catch {
    }
    Z = import("./bitlogin-shared-Co4_WTb5.js").then((e) => (e.init({
      appName: o,
      filters: ["nwc"],
      showBalance: !1,
      autoConnect: !1,
      persistConnection: !1,
      providerConfig: {
        nwc: {
          authorizationUrlOptions: {
            name: o,
            requestMethods: ["pay_invoice"]
          }
        }
      }
    }), e)).catch((e) => {
      throw Z = null, e;
    });
  }
  return Z;
}
function We(o) {
  const e = o instanceof Error ? o.message : String(o);
  return /closed|cancell?ed|dismissed|aborted/iu.test(e);
}
async function qe(o) {
  const e = await Fe(o);
  try {
    const t = await e.requestProvider(), n = e.getConnectorConfig()?.nwcUrl, r = t.client?.nostrWalletConnectUrl, a = typeof n == "string" ? n : typeof r == "string" ? r : "";
    if (!Ke.test(a.trim()))
      throw new Error("The wallet did not return an NWC connection. Try again or paste one manually.");
    return a.trim();
  } catch (t) {
    if (We(t)) return null;
    throw t;
  } finally {
    try {
      e.disconnect();
    } catch {
    }
    try {
      localStorage.removeItem(ve);
    } catch {
    }
  }
}
function je(o) {
  const e = [];
  return o.rollbackWarnings.length > 0 && e.push(
    `${o.rollbackWarnings.length} wallet record${o.rollbackWarnings.length === 1 ? " was" : "s were"} withheld because relays served an older version than this device previously accepted.`
  ), o.quorumMet || e.push(
    "Not enough vault relays answered. This connection list may be incomplete."
  ), o.truncated && e.push(
    "A relay returned the maximum record page. Some wallet connections may be missing."
  ), o.unreadable.length > 0 && e.push(
    `${o.unreadable.length} encrypted wallet record${o.unreadable.length === 1 ? " was" : "s were"} unreadable and omitted.`
  ), e;
}
class J extends Error {
  constructor(e, t) {
    super(`The active signer (${t}) does not support ${e}.`), this.name = "SignerUnsupportedError";
  }
}
class Ve extends Error {
  constructor(e, t) {
    super(
      `The signer did not answer ${e} within ${Math.round(t / 1e3)}s. It may be waiting for your approval in another window, or unavailable -- check your signer and try again.`
    ), this.name = "SignerTimeoutError";
  }
}
function ue(o = window) {
  const e = o.nostr;
  return !e || typeof e != "object" || e._bitlogin === !0 || typeof e.getPublicKey != "function" || typeof e.signEvent != "function" ? null : e;
}
const He = 12e4;
function W(o, e, t) {
  return new Promise((n, r) => {
    const a = setTimeout(() => r(new Ve(e, t)), t);
    o.then(
      (s) => {
        clearTimeout(a), n(s);
      },
      (s) => {
        clearTimeout(a), r(s);
      }
    );
  });
}
class Ye {
  method = "nip07";
  capabilities;
  provider;
  timeoutMs;
  constructor(e, t = {}) {
    this.provider = e, this.timeoutMs = t.timeoutMs ?? He, this.capabilities = {
      nip44: typeof e.nip44?.encrypt == "function" && typeof e.nip44?.decrypt == "function",
      nip04: typeof e.nip04?.encrypt == "function" && typeof e.nip04?.decrypt == "function",
      getRelays: typeof e.getRelays == "function"
    };
  }
  /** Identity this extension reported; later signEvent results must come
   *  from it -- a multi-profile extension switching accounts mid-session
   *  must surface as an error, not as silently mixed authorship. */
  knownPublicKey = null;
  async getPublicKey() {
    const e = await W(this.provider.getPublicKey(), "getPublicKey", this.timeoutMs), t = typeof e == "string" ? e.toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(t))
      throw new Error("The extension returned an invalid public key (expected 64 hex characters).");
    return this.knownPublicKey = t, t;
  }
  async signEvent(e) {
    const t = {
      kind: e.kind,
      content: e.content,
      tags: e.tags ?? [],
      created_at: e.created_at ?? Math.floor(Date.now() / 1e3)
    }, n = await W(this.provider.signEvent(t), "signEvent", this.timeoutMs);
    if (!Ne(n))
      throw new Error("The extension returned an event that does not verify.");
    if (this.knownPublicKey && n.pubkey !== this.knownPublicKey)
      throw new Error("The extension signed with a different identity than this session's.");
    if (n.kind !== t.kind || n.content !== t.content || n.created_at !== t.created_at || JSON.stringify(n.tags) !== JSON.stringify(t.tags))
      throw new Error("The extension returned a different event than the one requested.");
    return n;
  }
  async nip44Encrypt(e, t) {
    if (!this.capabilities.nip44) throw new J("nip44.encrypt", this.method);
    return W(this.provider.nip44.encrypt(e, t), "nip44.encrypt", this.timeoutMs);
  }
  async nip44Decrypt(e, t) {
    if (!this.capabilities.nip44) throw new J("nip44.decrypt", this.method);
    return W(this.provider.nip44.decrypt(e, t), "nip44.decrypt", this.timeoutMs);
  }
  async nip04Encrypt(e, t) {
    if (!this.capabilities.nip04) throw new J("nip04.encrypt", this.method);
    return W(this.provider.nip04.encrypt(e, t), "nip04.encrypt", this.timeoutMs);
  }
  async nip04Decrypt(e, t) {
    if (!this.capabilities.nip04) throw new J("nip04.decrypt", this.method);
    return W(this.provider.nip04.decrypt(e, t), "nip04.decrypt", this.timeoutMs);
  }
}
class Ge {
  constructor(e, t) {
    this.worker = e, this.userPubkey = t;
  }
  method = "nip46";
  /** The NIP-46 RPC surface always carries all four encryption calls; whether a
   *  particular signer approves them is a per-request policy decision that
   *  surfaces as its error, not a missing capability. */
  capabilities = { nip44: !0, nip04: !0, getRelays: !1 };
  getPublicKey() {
    return Promise.resolve(this.userPubkey);
  }
  signEvent(e) {
    return this.worker.nip46SignEvent({
      kind: e.kind,
      content: e.content,
      tags: e.tags,
      created_at: e.created_at
    });
  }
  async nip44Encrypt(e, t) {
    return (await this.worker.nip46Nip44Encrypt({ peerPublicKey: e, plaintext: t })).ciphertext;
  }
  async nip44Decrypt(e, t) {
    return (await this.worker.nip46Nip44Decrypt({ peerPublicKey: e, payload: t })).plaintext;
  }
  async nip04Encrypt(e, t) {
    return (await this.worker.nip46Nip04Encrypt({ peerPublicKey: e, plaintext: t })).ciphertext;
  }
  async nip04Decrypt(e, t) {
    return (await this.worker.nip46Nip04Decrypt({ peerPublicKey: e, payload: t })).plaintext;
  }
}
const q = function(o, e) {
  let r = o;
  const a = V[e];
  let s = null, i = 0, u = null;
  const b = [], w = {}, g = function(c, p) {
    i = r * 4 + 17, s = (function(l) {
      const d = new Array(l);
      for (let h = 0; h < l; h += 1) {
        d[h] = new Array(l);
        for (let y = 0; y < l; y += 1)
          d[h][y] = null;
      }
      return d;
    })(i), f(0, 0), f(i - 7, 0), f(0, i - 7), L(), B(), M(c, p), r >= 7 && P(c), u == null && (u = Ce(r, a, b)), $(u, p);
  }, f = function(c, p) {
    for (let l = -1; l <= 7; l += 1)
      if (!(c + l <= -1 || i <= c + l))
        for (let d = -1; d <= 7; d += 1)
          p + d <= -1 || i <= p + d || (0 <= l && l <= 6 && (d == 0 || d == 6) || 0 <= d && d <= 6 && (l == 0 || l == 6) || 2 <= l && l <= 4 && 2 <= d && d <= 4 ? s[c + l][p + d] = !0 : s[c + l][p + d] = !1);
  }, x = function() {
    let c = 0, p = 0;
    for (let l = 0; l < 8; l += 1) {
      g(!0, l);
      const d = I.getLostPoint(w);
      (l == 0 || c > d) && (c = d, p = l);
    }
    return p;
  }, B = function() {
    for (let c = 8; c < i - 8; c += 1)
      s[c][6] == null && (s[c][6] = c % 2 == 0);
    for (let c = 8; c < i - 8; c += 1)
      s[6][c] == null && (s[6][c] = c % 2 == 0);
  }, L = function() {
    const c = I.getPatternPosition(r);
    for (let p = 0; p < c.length; p += 1)
      for (let l = 0; l < c.length; l += 1) {
        const d = c[p], h = c[l];
        if (s[d][h] == null)
          for (let y = -2; y <= 2; y += 1)
            for (let m = -2; m <= 2; m += 1)
              y == -2 || y == 2 || m == -2 || m == 2 || y == 0 && m == 0 ? s[d + y][h + m] = !0 : s[d + y][h + m] = !1;
      }
  }, P = function(c) {
    const p = I.getBCHTypeNumber(r);
    for (let l = 0; l < 18; l += 1) {
      const d = !c && (p >> l & 1) == 1;
      s[Math.floor(l / 3)][l % 3 + i - 8 - 3] = d;
    }
    for (let l = 0; l < 18; l += 1) {
      const d = !c && (p >> l & 1) == 1;
      s[l % 3 + i - 8 - 3][Math.floor(l / 3)] = d;
    }
  }, M = function(c, p) {
    const l = a << 3 | p, d = I.getBCHTypeInfo(l);
    for (let h = 0; h < 15; h += 1) {
      const y = !c && (d >> h & 1) == 1;
      h < 6 ? s[h][8] = y : h < 8 ? s[h + 1][8] = y : s[i - 15 + h][8] = y;
    }
    for (let h = 0; h < 15; h += 1) {
      const y = !c && (d >> h & 1) == 1;
      h < 8 ? s[8][i - h - 1] = y : h < 9 ? s[8][15 - h - 1 + 1] = y : s[8][15 - h - 1] = y;
    }
    s[i - 8][8] = !c;
  }, $ = function(c, p) {
    let l = -1, d = i - 1, h = 7, y = 0;
    const m = I.getMaskFunction(p);
    for (let Q = i - 1; Q > 0; Q -= 2)
      for (Q == 6 && (Q -= 1); ; ) {
        for (let C = 0; C < 2; C += 1)
          if (s[d][Q - C] == null) {
            let S = !1;
            y < c.length && (S = (c[y] >>> h & 1) == 1), m(d, Q - C) && (S = !S), s[d][Q - C] = S, h -= 1, h == -1 && (y += 1, h = 7);
          }
        if (d += l, d < 0 || i <= d) {
          d -= l, l = -l;
          break;
        }
      }
  }, Qe = function(c, p) {
    let l = 0, d = 0, h = 0;
    const y = new Array(p.length), m = new Array(p.length);
    for (let v = 0; v < p.length; v += 1) {
      const E = p[v].dataCount, R = p[v].totalCount - E;
      d = Math.max(d, E), h = Math.max(h, R), y[v] = new Array(E);
      for (let T = 0; T < y[v].length; T += 1)
        y[v][T] = 255 & c.getBuffer()[T + l];
      l += E;
      const X = I.getErrorCorrectPolynomial(R), se = H(y[v], X.getLength() - 1).mod(X);
      m[v] = new Array(X.getLength() - 1);
      for (let T = 0; T < m[v].length; T += 1) {
        const oe = T + se.getLength() - m[v].length;
        m[v][T] = oe >= 0 ? se.getAt(oe) : 0;
      }
    }
    let Q = 0;
    for (let v = 0; v < p.length; v += 1)
      Q += p[v].totalCount;
    const C = new Array(Q);
    let S = 0;
    for (let v = 0; v < d; v += 1)
      for (let E = 0; E < p.length; E += 1)
        v < y[E].length && (C[S] = y[E][v], S += 1);
    for (let v = 0; v < h; v += 1)
      for (let E = 0; E < p.length; E += 1)
        v < m[E].length && (C[S] = m[E][v], S += 1);
    return C;
  }, Ce = function(c, p, l) {
    const d = he.getRSBlocks(c, p), h = de();
    for (let m = 0; m < l.length; m += 1) {
      const Q = l[m];
      h.put(Q.getMode(), 4), h.put(Q.getLength(), I.getLengthInBits(Q.getMode(), c)), Q.write(h);
    }
    let y = 0;
    for (let m = 0; m < d.length; m += 1)
      y += d[m].dataCount;
    if (h.getLengthInBits() > y * 8)
      throw "code length overflow. (" + h.getLengthInBits() + ">" + y * 8 + ")";
    for (h.getLengthInBits() + 4 <= y * 8 && h.put(0, 4); h.getLengthInBits() % 8 != 0; )
      h.putBit(!1);
    for (; !(h.getLengthInBits() >= y * 8 || (h.put(236, 8), h.getLengthInBits() >= y * 8)); )
      h.put(17, 8);
    return Qe(h, d);
  };
  w.addData = function(c, p) {
    p = p || "Byte";
    let l = null;
    switch (p) {
      case "Numeric":
        l = Ze(c);
        break;
      case "Alphanumeric":
        l = Je(c);
        break;
      case "Byte":
        l = ze(c);
        break;
      case "Kanji":
        l = Xe(c);
        break;
      default:
        throw "mode:" + p;
    }
    b.push(l), u = null;
  }, w.isDark = function(c, p) {
    if (c < 0 || i <= c || p < 0 || i <= p)
      throw c + "," + p;
    return s[c][p];
  }, w.getModuleCount = function() {
    return i;
  }, w.make = function() {
    if (r < 1) {
      let c = 1;
      for (; c < 40; c++) {
        const p = he.getRSBlocks(c, a), l = de();
        for (let h = 0; h < b.length; h++) {
          const y = b[h];
          l.put(y.getMode(), 4), l.put(y.getLength(), I.getLengthInBits(y.getMode(), c)), y.write(l);
        }
        let d = 0;
        for (let h = 0; h < p.length; h++)
          d += p[h].dataCount;
        if (l.getLengthInBits() <= d * 8)
          break;
      }
      r = c;
    }
    g(!1, x());
  }, w.createTableTag = function(c, p) {
    c = c || 2, p = typeof p > "u" ? c * 4 : p;
    let l = "";
    l += '<table style="', l += " border-width: 0px; border-style: none;", l += " border-collapse: collapse;", l += " padding: 0px; margin: " + p + "px;", l += '">', l += "<tbody>";
    for (let d = 0; d < w.getModuleCount(); d += 1) {
      l += "<tr>";
      for (let h = 0; h < w.getModuleCount(); h += 1)
        l += '<td style="', l += " border-width: 0px; border-style: none;", l += " border-collapse: collapse;", l += " padding: 0px; margin: 0px;", l += " width: " + c + "px;", l += " height: " + c + "px;", l += " background-color: ", l += w.isDark(d, h) ? "#000000" : "#ffffff", l += ";", l += '"/>';
      l += "</tr>";
    }
    return l += "</tbody>", l += "</table>", l;
  }, w.createSvgTag = function(c, p, l, d) {
    let h = {};
    typeof arguments[0] == "object" && (h = arguments[0], c = h.cellSize, p = h.margin, l = h.alt, d = h.title), c = c || 2, p = typeof p > "u" ? c * 4 : p, l = typeof l == "string" ? { text: l } : l || {}, l.text = l.text || null, l.id = l.text ? l.id || "qrcode-description" : null, d = typeof d == "string" ? { text: d } : d || {}, d.text = d.text || null, d.id = d.text ? d.id || "qrcode-title" : null;
    const y = w.getModuleCount() * c + p * 2;
    let m, Q, C, S, v = "", E;
    for (E = "l" + c + ",0 0," + c + " -" + c + ",0 0,-" + c + "z ", v += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"', v += h.scalable ? "" : ' width="' + y + 'px" height="' + y + 'px"', v += ' viewBox="0 0 ' + y + " " + y + '" ', v += ' preserveAspectRatio="xMinYMin meet"', v += d.text || l.text ? ' role="img" aria-labelledby="' + U([d.id, l.id].join(" ").trim()) + '"' : "", v += ">", v += d.text ? '<title id="' + U(d.id) + '">' + U(d.text) + "</title>" : "", v += l.text ? '<description id="' + U(l.id) + '">' + U(l.text) + "</description>" : "", v += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>', v += '<path d="', C = 0; C < w.getModuleCount(); C += 1)
      for (S = C * c + p, m = 0; m < w.getModuleCount(); m += 1)
        w.isDark(C, m) && (Q = m * c + p, v += "M" + Q + "," + S + E);
    return v += '" stroke="transparent" fill="black"/>', v += "</svg>", v;
  }, w.createDataURL = function(c, p) {
    c = c || 2, p = typeof p > "u" ? c * 4 : p;
    const l = w.getModuleCount() * c + p * 2, d = p, h = l - p;
    return rt(l, l, function(y, m) {
      if (d <= y && y < h && d <= m && m < h) {
        const Q = Math.floor((y - d) / c), C = Math.floor((m - d) / c);
        return w.isDark(C, Q) ? 0 : 1;
      } else
        return 1;
    });
  }, w.createImgTag = function(c, p, l) {
    c = c || 2, p = typeof p > "u" ? c * 4 : p;
    const d = w.getModuleCount() * c + p * 2;
    let h = "";
    return h += "<img", h += ' src="', h += w.createDataURL(c, p), h += '"', h += ' width="', h += d, h += '"', h += ' height="', h += d, h += '"', l && (h += ' alt="', h += U(l), h += '"'), h += "/>", h;
  };
  const U = function(c) {
    let p = "";
    for (let l = 0; l < c.length; l += 1) {
      const d = c.charAt(l);
      switch (d) {
        case "<":
          p += "&lt;";
          break;
        case ">":
          p += "&gt;";
          break;
        case "&":
          p += "&amp;";
          break;
        case '"':
          p += "&quot;";
          break;
        default:
          p += d;
          break;
      }
    }
    return p;
  }, Ee = function(c) {
    c = typeof c > "u" ? 2 : c;
    const l = w.getModuleCount() * 1 + c * 2, d = c, h = l - c;
    let y, m, Q, C, S;
    const v = {
      "██": "█",
      "█ ": "▀",
      " █": "▄",
      "  ": " "
    }, E = {
      "██": "▀",
      "█ ": "▀",
      " █": " ",
      "  ": " "
    };
    let R = "";
    for (y = 0; y < l; y += 2) {
      for (Q = Math.floor((y - d) / 1), C = Math.floor((y + 1 - d) / 1), m = 0; m < l; m += 1)
        S = "█", d <= m && m < h && d <= y && y < h && w.isDark(Q, Math.floor((m - d) / 1)) && (S = " "), d <= m && m < h && d <= y + 1 && y + 1 < h && w.isDark(C, Math.floor((m - d) / 1)) ? S += " " : S += "█", R += c < 1 && y + 1 >= h ? E[S] : v[S];
      R += `
`;
    }
    return l % 2 && c > 0 ? R.substring(0, R.length - l - 1) + Array(l + 1).join("▀") : R.substring(0, R.length - 1);
  };
  return w.createASCII = function(c, p) {
    if (c = c || 1, c < 2)
      return Ee(p);
    c -= 1, p = typeof p > "u" ? c * 2 : p;
    const l = w.getModuleCount() * c + p * 2, d = p, h = l - p;
    let y, m, Q, C;
    const S = Array(c + 1).join("██"), v = Array(c + 1).join("  ");
    let E = "", R = "";
    for (y = 0; y < l; y += 1) {
      for (Q = Math.floor((y - d) / c), R = "", m = 0; m < l; m += 1)
        C = 1, d <= m && m < h && d <= y && y < h && w.isDark(Q, Math.floor((m - d) / c)) && (C = 0), R += C ? S : v;
      for (Q = 0; Q < c; Q += 1)
        E += R + `
`;
    }
    return E.substring(0, E.length - 1);
  }, w.renderTo2dContext = function(c, p) {
    p = p || 2;
    const l = w.getModuleCount();
    for (let d = 0; d < l; d++)
      for (let h = 0; h < l; h++)
        c.fillStyle = w.isDark(d, h) ? "black" : "white", c.fillRect(h * p, d * p, p, p);
  }, w;
};
q.stringToBytes = function(o) {
  const e = [];
  for (let t = 0; t < o.length; t += 1) {
    const n = o.charCodeAt(t);
    e.push(n & 255);
  }
  return e;
};
q.createStringToBytes = function(o, e) {
  const t = (function() {
    const r = tt(o), a = function() {
      const u = r.read();
      if (u == -1) throw "eof";
      return u;
    };
    let s = 0;
    const i = {};
    for (; ; ) {
      const u = r.read();
      if (u == -1) break;
      const b = a(), w = a(), g = a(), f = String.fromCharCode(u << 8 | b), x = w << 8 | g;
      i[f] = x, s += 1;
    }
    if (s != e)
      throw s + " != " + e;
    return i;
  })(), n = 63;
  return function(r) {
    const a = [];
    for (let s = 0; s < r.length; s += 1) {
      const i = r.charCodeAt(s);
      if (i < 128)
        a.push(i);
      else {
        const u = t[r.charAt(s)];
        typeof u == "number" ? (u & 255) == u ? a.push(u) : (a.push(u >>> 8), a.push(u & 255)) : a.push(n);
      }
    }
    return a;
  };
};
const N = {
  MODE_NUMBER: 1,
  MODE_ALPHA_NUM: 2,
  MODE_8BIT_BYTE: 4,
  MODE_KANJI: 8
}, V = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
}, D = {
  PATTERN000: 0,
  PATTERN001: 1,
  PATTERN010: 2,
  PATTERN011: 3,
  PATTERN100: 4,
  PATTERN101: 5,
  PATTERN110: 6,
  PATTERN111: 7
}, I = (function() {
  const o = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ], e = 1335, t = 7973, n = 21522, r = {}, a = function(s) {
    let i = 0;
    for (; s != 0; )
      i += 1, s >>>= 1;
    return i;
  };
  return r.getBCHTypeInfo = function(s) {
    let i = s << 10;
    for (; a(i) - a(e) >= 0; )
      i ^= e << a(i) - a(e);
    return (s << 10 | i) ^ n;
  }, r.getBCHTypeNumber = function(s) {
    let i = s << 12;
    for (; a(i) - a(t) >= 0; )
      i ^= t << a(i) - a(t);
    return s << 12 | i;
  }, r.getPatternPosition = function(s) {
    return o[s - 1];
  }, r.getMaskFunction = function(s) {
    switch (s) {
      case D.PATTERN000:
        return function(i, u) {
          return (i + u) % 2 == 0;
        };
      case D.PATTERN001:
        return function(i, u) {
          return i % 2 == 0;
        };
      case D.PATTERN010:
        return function(i, u) {
          return u % 3 == 0;
        };
      case D.PATTERN011:
        return function(i, u) {
          return (i + u) % 3 == 0;
        };
      case D.PATTERN100:
        return function(i, u) {
          return (Math.floor(i / 2) + Math.floor(u / 3)) % 2 == 0;
        };
      case D.PATTERN101:
        return function(i, u) {
          return i * u % 2 + i * u % 3 == 0;
        };
      case D.PATTERN110:
        return function(i, u) {
          return (i * u % 2 + i * u % 3) % 2 == 0;
        };
      case D.PATTERN111:
        return function(i, u) {
          return (i * u % 3 + (i + u) % 2) % 2 == 0;
        };
      default:
        throw "bad maskPattern:" + s;
    }
  }, r.getErrorCorrectPolynomial = function(s) {
    let i = H([1], 0);
    for (let u = 0; u < s; u += 1)
      i = i.multiply(H([1, O.gexp(u)], 0));
    return i;
  }, r.getLengthInBits = function(s, i) {
    if (1 <= i && i < 10)
      switch (s) {
        case N.MODE_NUMBER:
          return 10;
        case N.MODE_ALPHA_NUM:
          return 9;
        case N.MODE_8BIT_BYTE:
          return 8;
        case N.MODE_KANJI:
          return 8;
        default:
          throw "mode:" + s;
      }
    else if (i < 27)
      switch (s) {
        case N.MODE_NUMBER:
          return 12;
        case N.MODE_ALPHA_NUM:
          return 11;
        case N.MODE_8BIT_BYTE:
          return 16;
        case N.MODE_KANJI:
          return 10;
        default:
          throw "mode:" + s;
      }
    else if (i < 41)
      switch (s) {
        case N.MODE_NUMBER:
          return 14;
        case N.MODE_ALPHA_NUM:
          return 13;
        case N.MODE_8BIT_BYTE:
          return 16;
        case N.MODE_KANJI:
          return 12;
        default:
          throw "mode:" + s;
      }
    else
      throw "type:" + i;
  }, r.getLostPoint = function(s) {
    const i = s.getModuleCount();
    let u = 0;
    for (let g = 0; g < i; g += 1)
      for (let f = 0; f < i; f += 1) {
        let x = 0;
        const B = s.isDark(g, f);
        for (let L = -1; L <= 1; L += 1)
          if (!(g + L < 0 || i <= g + L))
            for (let P = -1; P <= 1; P += 1)
              f + P < 0 || i <= f + P || L == 0 && P == 0 || B == s.isDark(g + L, f + P) && (x += 1);
        x > 5 && (u += 3 + x - 5);
      }
    for (let g = 0; g < i - 1; g += 1)
      for (let f = 0; f < i - 1; f += 1) {
        let x = 0;
        s.isDark(g, f) && (x += 1), s.isDark(g + 1, f) && (x += 1), s.isDark(g, f + 1) && (x += 1), s.isDark(g + 1, f + 1) && (x += 1), (x == 0 || x == 4) && (u += 3);
      }
    for (let g = 0; g < i; g += 1)
      for (let f = 0; f < i - 6; f += 1)
        s.isDark(g, f) && !s.isDark(g, f + 1) && s.isDark(g, f + 2) && s.isDark(g, f + 3) && s.isDark(g, f + 4) && !s.isDark(g, f + 5) && s.isDark(g, f + 6) && (u += 40);
    for (let g = 0; g < i; g += 1)
      for (let f = 0; f < i - 6; f += 1)
        s.isDark(f, g) && !s.isDark(f + 1, g) && s.isDark(f + 2, g) && s.isDark(f + 3, g) && s.isDark(f + 4, g) && !s.isDark(f + 5, g) && s.isDark(f + 6, g) && (u += 40);
    let b = 0;
    for (let g = 0; g < i; g += 1)
      for (let f = 0; f < i; f += 1)
        s.isDark(f, g) && (b += 1);
    const w = Math.abs(100 * b / i / i - 50) / 5;
    return u += w * 10, u;
  }, r;
})(), O = (function() {
  const o = new Array(256), e = new Array(256);
  for (let n = 0; n < 8; n += 1)
    o[n] = 1 << n;
  for (let n = 8; n < 256; n += 1)
    o[n] = o[n - 4] ^ o[n - 5] ^ o[n - 6] ^ o[n - 8];
  for (let n = 0; n < 255; n += 1)
    e[o[n]] = n;
  const t = {};
  return t.glog = function(n) {
    if (n < 1)
      throw "glog(" + n + ")";
    return e[n];
  }, t.gexp = function(n) {
    for (; n < 0; )
      n += 255;
    for (; n >= 256; )
      n -= 255;
    return o[n];
  }, t;
})(), H = function(o, e) {
  if (typeof o.length > "u")
    throw o.length + "/" + e;
  const t = (function() {
    let r = 0;
    for (; r < o.length && o[r] == 0; )
      r += 1;
    const a = new Array(o.length - r + e);
    for (let s = 0; s < o.length - r; s += 1)
      a[s] = o[s + r];
    return a;
  })(), n = {};
  return n.getAt = function(r) {
    return t[r];
  }, n.getLength = function() {
    return t.length;
  }, n.multiply = function(r) {
    const a = new Array(n.getLength() + r.getLength() - 1);
    for (let s = 0; s < n.getLength(); s += 1)
      for (let i = 0; i < r.getLength(); i += 1)
        a[s + i] ^= O.gexp(O.glog(n.getAt(s)) + O.glog(r.getAt(i)));
    return H(a, 0);
  }, n.mod = function(r) {
    if (n.getLength() - r.getLength() < 0)
      return n;
    const a = O.glog(n.getAt(0)) - O.glog(r.getAt(0)), s = new Array(n.getLength());
    for (let i = 0; i < n.getLength(); i += 1)
      s[i] = n.getAt(i);
    for (let i = 0; i < r.getLength(); i += 1)
      s[i] ^= O.gexp(O.glog(r.getAt(i)) + a);
    return H(s, 0).mod(r);
  }, n;
}, he = (function() {
  const o = [
    // L
    // M
    // Q
    // H
    // 1
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    // 2
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    // 3
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    // 4
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    // 5
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    // 6
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    // 7
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    // 8
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    // 9
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    // 10
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    // 11
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    // 12
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    // 13
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    // 14
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    // 15
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    // 16
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    // 17
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    // 18
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    // 19
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    // 20
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
    // 21
    [4, 144, 116, 4, 145, 117],
    [17, 68, 42],
    [17, 50, 22, 6, 51, 23],
    [19, 46, 16, 6, 47, 17],
    // 22
    [2, 139, 111, 7, 140, 112],
    [17, 74, 46],
    [7, 54, 24, 16, 55, 25],
    [34, 37, 13],
    // 23
    [4, 151, 121, 5, 152, 122],
    [4, 75, 47, 14, 76, 48],
    [11, 54, 24, 14, 55, 25],
    [16, 45, 15, 14, 46, 16],
    // 24
    [6, 147, 117, 4, 148, 118],
    [6, 73, 45, 14, 74, 46],
    [11, 54, 24, 16, 55, 25],
    [30, 46, 16, 2, 47, 17],
    // 25
    [8, 132, 106, 4, 133, 107],
    [8, 75, 47, 13, 76, 48],
    [7, 54, 24, 22, 55, 25],
    [22, 45, 15, 13, 46, 16],
    // 26
    [10, 142, 114, 2, 143, 115],
    [19, 74, 46, 4, 75, 47],
    [28, 50, 22, 6, 51, 23],
    [33, 46, 16, 4, 47, 17],
    // 27
    [8, 152, 122, 4, 153, 123],
    [22, 73, 45, 3, 74, 46],
    [8, 53, 23, 26, 54, 24],
    [12, 45, 15, 28, 46, 16],
    // 28
    [3, 147, 117, 10, 148, 118],
    [3, 73, 45, 23, 74, 46],
    [4, 54, 24, 31, 55, 25],
    [11, 45, 15, 31, 46, 16],
    // 29
    [7, 146, 116, 7, 147, 117],
    [21, 73, 45, 7, 74, 46],
    [1, 53, 23, 37, 54, 24],
    [19, 45, 15, 26, 46, 16],
    // 30
    [5, 145, 115, 10, 146, 116],
    [19, 75, 47, 10, 76, 48],
    [15, 54, 24, 25, 55, 25],
    [23, 45, 15, 25, 46, 16],
    // 31
    [13, 145, 115, 3, 146, 116],
    [2, 74, 46, 29, 75, 47],
    [42, 54, 24, 1, 55, 25],
    [23, 45, 15, 28, 46, 16],
    // 32
    [17, 145, 115],
    [10, 74, 46, 23, 75, 47],
    [10, 54, 24, 35, 55, 25],
    [19, 45, 15, 35, 46, 16],
    // 33
    [17, 145, 115, 1, 146, 116],
    [14, 74, 46, 21, 75, 47],
    [29, 54, 24, 19, 55, 25],
    [11, 45, 15, 46, 46, 16],
    // 34
    [13, 145, 115, 6, 146, 116],
    [14, 74, 46, 23, 75, 47],
    [44, 54, 24, 7, 55, 25],
    [59, 46, 16, 1, 47, 17],
    // 35
    [12, 151, 121, 7, 152, 122],
    [12, 75, 47, 26, 76, 48],
    [39, 54, 24, 14, 55, 25],
    [22, 45, 15, 41, 46, 16],
    // 36
    [6, 151, 121, 14, 152, 122],
    [6, 75, 47, 34, 76, 48],
    [46, 54, 24, 10, 55, 25],
    [2, 45, 15, 64, 46, 16],
    // 37
    [17, 152, 122, 4, 153, 123],
    [29, 74, 46, 14, 75, 47],
    [49, 54, 24, 10, 55, 25],
    [24, 45, 15, 46, 46, 16],
    // 38
    [4, 152, 122, 18, 153, 123],
    [13, 74, 46, 32, 75, 47],
    [48, 54, 24, 14, 55, 25],
    [42, 45, 15, 32, 46, 16],
    // 39
    [20, 147, 117, 4, 148, 118],
    [40, 75, 47, 7, 76, 48],
    [43, 54, 24, 22, 55, 25],
    [10, 45, 15, 67, 46, 16],
    // 40
    [19, 148, 118, 6, 149, 119],
    [18, 75, 47, 31, 76, 48],
    [34, 54, 24, 34, 55, 25],
    [20, 45, 15, 61, 46, 16]
  ], e = function(r, a) {
    const s = {};
    return s.totalCount = r, s.dataCount = a, s;
  }, t = {}, n = function(r, a) {
    switch (a) {
      case V.L:
        return o[(r - 1) * 4 + 0];
      case V.M:
        return o[(r - 1) * 4 + 1];
      case V.Q:
        return o[(r - 1) * 4 + 2];
      case V.H:
        return o[(r - 1) * 4 + 3];
      default:
        return;
    }
  };
  return t.getRSBlocks = function(r, a) {
    const s = n(r, a);
    if (typeof s > "u")
      throw "bad rs block @ typeNumber:" + r + "/errorCorrectionLevel:" + a;
    const i = s.length / 3, u = [];
    for (let b = 0; b < i; b += 1) {
      const w = s[b * 3 + 0], g = s[b * 3 + 1], f = s[b * 3 + 2];
      for (let x = 0; x < w; x += 1)
        u.push(e(g, f));
    }
    return u;
  }, t;
})(), de = function() {
  const o = [];
  let e = 0;
  const t = {};
  return t.getBuffer = function() {
    return o;
  }, t.getAt = function(n) {
    const r = Math.floor(n / 8);
    return (o[r] >>> 7 - n % 8 & 1) == 1;
  }, t.put = function(n, r) {
    for (let a = 0; a < r; a += 1)
      t.putBit((n >>> r - a - 1 & 1) == 1);
  }, t.getLengthInBits = function() {
    return e;
  }, t.putBit = function(n) {
    const r = Math.floor(e / 8);
    o.length <= r && o.push(0), n && (o[r] |= 128 >>> e % 8), e += 1;
  }, t;
}, Ze = function(o) {
  const e = N.MODE_NUMBER, t = o, n = {};
  n.getMode = function() {
    return e;
  }, n.getLength = function(s) {
    return t.length;
  }, n.write = function(s) {
    const i = t;
    let u = 0;
    for (; u + 2 < i.length; )
      s.put(r(i.substring(u, u + 3)), 10), u += 3;
    u < i.length && (i.length - u == 1 ? s.put(r(i.substring(u, u + 1)), 4) : i.length - u == 2 && s.put(r(i.substring(u, u + 2)), 7));
  };
  const r = function(s) {
    let i = 0;
    for (let u = 0; u < s.length; u += 1)
      i = i * 10 + a(s.charAt(u));
    return i;
  }, a = function(s) {
    if ("0" <= s && s <= "9")
      return s.charCodeAt(0) - 48;
    throw "illegal char :" + s;
  };
  return n;
}, Je = function(o) {
  const e = N.MODE_ALPHA_NUM, t = o, n = {};
  n.getMode = function() {
    return e;
  }, n.getLength = function(a) {
    return t.length;
  }, n.write = function(a) {
    const s = t;
    let i = 0;
    for (; i + 1 < s.length; )
      a.put(
        r(s.charAt(i)) * 45 + r(s.charAt(i + 1)),
        11
      ), i += 2;
    i < s.length && a.put(r(s.charAt(i)), 6);
  };
  const r = function(a) {
    if ("0" <= a && a <= "9")
      return a.charCodeAt(0) - 48;
    if ("A" <= a && a <= "Z")
      return a.charCodeAt(0) - 65 + 10;
    switch (a) {
      case " ":
        return 36;
      case "$":
        return 37;
      case "%":
        return 38;
      case "*":
        return 39;
      case "+":
        return 40;
      case "-":
        return 41;
      case ".":
        return 42;
      case "/":
        return 43;
      case ":":
        return 44;
      default:
        throw "illegal char :" + a;
    }
  };
  return n;
}, ze = function(o) {
  const e = N.MODE_8BIT_BYTE, t = q.stringToBytes(o), n = {};
  return n.getMode = function() {
    return e;
  }, n.getLength = function(r) {
    return t.length;
  }, n.write = function(r) {
    for (let a = 0; a < t.length; a += 1)
      r.put(t[a], 8);
  }, n;
}, Xe = function(o) {
  const e = N.MODE_KANJI, t = q.stringToBytes;
  (function(a, s) {
    const i = t(a);
    if (i.length != 2 || (i[0] << 8 | i[1]) != s)
      throw "sjis not supported.";
  })("友", 38726);
  const n = t(o), r = {};
  return r.getMode = function() {
    return e;
  }, r.getLength = function(a) {
    return ~~(n.length / 2);
  }, r.write = function(a) {
    const s = n;
    let i = 0;
    for (; i + 1 < s.length; ) {
      let u = (255 & s[i]) << 8 | 255 & s[i + 1];
      if (33088 <= u && u <= 40956)
        u -= 33088;
      else if (57408 <= u && u <= 60351)
        u -= 49472;
      else
        throw "illegal char at " + (i + 1) + "/" + u;
      u = (u >>> 8 & 255) * 192 + (u & 255), a.put(u, 13), i += 2;
    }
    if (i < s.length)
      throw "illegal char at " + (i + 1);
  }, r;
}, ke = function() {
  const o = [], e = {};
  return e.writeByte = function(t) {
    o.push(t & 255);
  }, e.writeShort = function(t) {
    e.writeByte(t), e.writeByte(t >>> 8);
  }, e.writeBytes = function(t, n, r) {
    n = n || 0, r = r || t.length;
    for (let a = 0; a < r; a += 1)
      e.writeByte(t[a + n]);
  }, e.writeString = function(t) {
    for (let n = 0; n < t.length; n += 1)
      e.writeByte(t.charCodeAt(n));
  }, e.toByteArray = function() {
    return o;
  }, e.toString = function() {
    let t = "";
    t += "[";
    for (let n = 0; n < o.length; n += 1)
      n > 0 && (t += ","), t += o[n];
    return t += "]", t;
  }, e;
}, et = function() {
  let o = 0, e = 0, t = 0, n = "";
  const r = {}, a = function(i) {
    n += String.fromCharCode(s(i & 63));
  }, s = function(i) {
    if (i < 0)
      throw "n:" + i;
    if (i < 26)
      return 65 + i;
    if (i < 52)
      return 97 + (i - 26);
    if (i < 62)
      return 48 + (i - 52);
    if (i == 62)
      return 43;
    if (i == 63)
      return 47;
    throw "n:" + i;
  };
  return r.writeByte = function(i) {
    for (o = o << 8 | i & 255, e += 8, t += 1; e >= 6; )
      a(o >>> e - 6), e -= 6;
  }, r.flush = function() {
    if (e > 0 && (a(o << 6 - e), o = 0, e = 0), t % 3 != 0) {
      const i = 3 - t % 3;
      for (let u = 0; u < i; u += 1)
        n += "=";
    }
  }, r.toString = function() {
    return n;
  }, r;
}, tt = function(o) {
  const e = o;
  let t = 0, n = 0, r = 0;
  const a = {};
  a.read = function() {
    for (; r < 8; ) {
      if (t >= e.length) {
        if (r == 0)
          return -1;
        throw "unexpected end of file./" + r;
      }
      const u = e.charAt(t);
      if (t += 1, u == "=")
        return r = 0, -1;
      if (u.match(/^\s$/))
        continue;
      n = n << 6 | s(u.charCodeAt(0)), r += 6;
    }
    const i = n >>> r - 8 & 255;
    return r -= 8, i;
  };
  const s = function(i) {
    if (65 <= i && i <= 90)
      return i - 65;
    if (97 <= i && i <= 122)
      return i - 97 + 26;
    if (48 <= i && i <= 57)
      return i - 48 + 52;
    if (i == 43)
      return 62;
    if (i == 47)
      return 63;
    throw "c:" + i;
  };
  return a;
}, nt = function(o, e) {
  const t = o, n = e, r = new Array(o * e), a = {};
  a.setPixel = function(b, w, g) {
    r[w * t + b] = g;
  }, a.write = function(b) {
    b.writeString("GIF87a"), b.writeShort(t), b.writeShort(n), b.writeByte(128), b.writeByte(0), b.writeByte(0), b.writeByte(0), b.writeByte(0), b.writeByte(0), b.writeByte(255), b.writeByte(255), b.writeByte(255), b.writeString(","), b.writeShort(0), b.writeShort(0), b.writeShort(t), b.writeShort(n), b.writeByte(0);
    const w = 2, g = i(w);
    b.writeByte(w);
    let f = 0;
    for (; g.length - f > 255; )
      b.writeByte(255), b.writeBytes(g, f, 255), f += 255;
    b.writeByte(g.length - f), b.writeBytes(g, f, g.length - f), b.writeByte(0), b.writeString(";");
  };
  const s = function(b) {
    const w = b;
    let g = 0, f = 0;
    const x = {};
    return x.write = function(B, L) {
      if (B >>> L)
        throw "length over";
      for (; g + L >= 8; )
        w.writeByte(255 & (B << g | f)), L -= 8 - g, B >>>= 8 - g, f = 0, g = 0;
      f = B << g | f, g = g + L;
    }, x.flush = function() {
      g > 0 && w.writeByte(f);
    }, x;
  }, i = function(b) {
    const w = 1 << b, g = (1 << b) + 1;
    let f = b + 1;
    const x = u();
    for (let $ = 0; $ < w; $ += 1)
      x.add(String.fromCharCode($));
    x.add(String.fromCharCode(w)), x.add(String.fromCharCode(g));
    const B = ke(), L = s(B);
    L.write(w, f);
    let P = 0, M = String.fromCharCode(r[P]);
    for (P += 1; P < r.length; ) {
      const $ = String.fromCharCode(r[P]);
      P += 1, x.contains(M + $) ? M = M + $ : (L.write(x.indexOf(M), f), x.size() < 4095 && (x.size() == 1 << f && (f += 1), x.add(M + $)), M = $);
    }
    return L.write(x.indexOf(M), f), L.write(g, f), L.flush(), B.toByteArray();
  }, u = function() {
    const b = {};
    let w = 0;
    const g = {};
    return g.add = function(f) {
      if (g.contains(f))
        throw "dup key:" + f;
      b[f] = w, w += 1;
    }, g.size = function() {
      return w;
    }, g.indexOf = function(f) {
      return b[f];
    }, g.contains = function(f) {
      return typeof b[f] < "u";
    }, g;
  };
  return a;
}, rt = function(o, e, t) {
  const n = nt(o, e);
  for (let i = 0; i < e; i += 1)
    for (let u = 0; u < o; u += 1)
      n.setPixel(u, i, t(u, i));
  const r = ke();
  n.write(r);
  const a = et(), s = r.toByteArray();
  for (let i = 0; i < s.length; i += 1)
    a.writeByte(s[i]);
  return a.flush(), "data:image/gif;base64," + a;
};
q.stringToBytes;
const A = 4, it = 0.42, ne = "#14101f", st = "#ffffff";
function ot(o, e, t) {
  const n = (a) => a < 7, r = (a) => a >= t - 7;
  return n(o) && n(e) || n(o) && r(e) || r(o) && n(e);
}
function ee(o, e) {
  return `<rect x="${o + 0.5}" y="${e + 0.5}" width="6" height="6" rx="2.1" fill="none" stroke="${ne}" stroke-width="1"/><rect x="${o + 2}" y="${e + 2}" width="3" height="3" rx="1.1" fill="${ne}"/>`;
}
function at(o, e = "QR code") {
  const t = q(0, "M");
  t.addData(o), t.make();
  const n = t.getModuleCount(), r = n + A * 2, a = [];
  a.push(`<rect x="0" y="0" width="${r}" height="${r}" rx="3" fill="${st}"/>`), a.push(ee(A, A)), a.push(ee(A + n - 7, A)), a.push(ee(A, A + n - 7));
  for (let s = 0; s < n; s++)
    for (let i = 0; i < n; i++) {
      if (ot(s, i, n) || !t.isDark(s, i)) continue;
      const u = A + i + 0.5, b = A + s + 0.5;
      a.push(`<circle cx="${u}" cy="${b}" r="${it}" fill="${ne}"/>`);
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r} ${r}" role="img" aria-label="${e}" shape-rendering="geometricPrecision">${a.join("")}</svg>`;
}
let Y = null;
function lt(o, e) {
  Y = { owner: o, info: e };
}
function te(o) {
  Y?.owner === o && (Y = null);
}
function pe() {
  return Y ? { ...Y.info } : null;
}
const xe = we("bitlogin:passkey-credential:v1"), ct = we("bitlogin:passkey-derive:v1"), ut = "bitlogin passkey login-name v1", ht = "bitlogin passkey password v1";
function re(o) {
  return Uint8Array.from(o);
}
function dt(o) {
  if (o.length !== 32)
    throw new Error(`Passkey PRF output must be 32 bytes, got ${o.length}.`);
  const e = Pe(ct, o), t = `pk-${me(ae(e, ut, 6))}`, n = Re(ae(e, ht, 32));
  return { loginName: t, password: n };
}
function pt(o = window) {
  return typeof o.PublicKeyCredential == "function";
}
function fe(o, e) {
  return {
    publicKey: {
      // The challenge protects sign-count/liveness in server-verified
      // WebAuthn; here the PRF OUTPUT is the secret and the "verification"
      // is whether the derived credential opens the capsule. Random anyway.
      challenge: re(z(32)),
      ...e ? { allowCredentials: [{ type: "public-key", id: e }] } : {},
      userVerification: "required",
      extensions: { prf: { eval: { first: xe } } }
    }
  };
}
function ft(o, e) {
  const t = `${o} (${me(z(2))})`;
  return {
    publicKey: {
      challenge: re(z(32)),
      rp: { name: o },
      user: {
        // Opaque handle; the account identity is DERIVED from the PRF, not
        // from this. Random so re-creates don't silently overwrite.
        id: re(z(16)),
        name: t,
        displayName: t
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        // ES256
        { type: "public-key", alg: -257 }
        // RS256
      ],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      },
      extensions: { prf: { eval: { first: xe } } }
    }
  };
}
function ge(o) {
  const t = o.getClientExtensionResults().prf?.results?.first;
  if (!t) return null;
  const n = t instanceof Uint8Array ? t : new Uint8Array(t);
  return n.length === 32 ? n : null;
}
const j = {
  extension: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M6.5 6.7h.01"/><path d="M9.3 6.7h.01"/></svg>',
  remote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3"/><path d="M21 14v0.01"/><path d="M14 21h0.01"/><path d="M17.5 17.5L21 21"/></svg>',
  importKey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21"/><path d="M18 12v3.2"/><path d="M14.8 12v2.2"/></svg>',
  recover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5v5h5"/><path d="M4.2 14a8 8 0 1 0 1.9-8.3L2.5 10"/></svg>',
  passkey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c-3 0-5.5 2.4-5.5 5.4v2.3c0 3.4-.7 5.3-1.6 6.8"/><path d="M12 7.2a2.9 2.9 0 0 0-2.9 2.9v2.1c0 2.6-.5 4.6-1.3 6.3"/><path d="M12 10.5v2.2c0 2.7-.4 4.9-1.1 6.8"/><path d="M15 9.6c.3.7.4 1.5.4 2.4 0 2.9-.3 5.3-.9 7.3"/><path d="M17.5 8.9c.6 3.4.4 7.1-.4 10.2"/></svg>'
}, gt = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>', yt = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
class ie extends HTMLElement {
  root;
  worker;
  vaultRelayUrls = [];
  discoveryRelayUrls = [];
  installedProvider = null;
  screen = "welcome";
  busy = !1;
  errorMessage;
  /** Welcome-screen disclosure for non-primary sign-in paths; survives
   *  re-renders so an open menu doesn't snap shut on an error render. */
  moreOptionsOpen = !1;
  loginName = "";
  generatedCredential = "";
  savedCheckbox = !1;
  recoveryPhrase = "";
  confirmSlots = [];
  // Import flow (§SF10). importKey holds the pasted nsec/hex only until registration completes.
  importKey = "";
  importPreviewNpub = "";
  recoverPhraseInput = "";
  recoveredPreview = null;
  newCredentialAfterRecovery = "";
  // Optional recovery-export-file fallback (§19.5) for when live relays can't be reached.
  // Never a substitute for the phrase -- the file never contains it or any phrase-derived key.
  offlineExportFile = null;
  offlineExportFileNotice;
  session = null;
  // ---- Alternative-method sessions (docs/login-methods.md §LM4, §LM5, §LM7) ----
  // `pending*` state holds a candidate between "the signer answered" and the user
  // confirming that npub is theirs; only `altSigner` routes the public API. Thin by
  // design: no capsule, no vault, no persistence -- a reload simply signs the user
  // out, and the signer is asked again next visit.
  pendingExtensionSigner = null;
  altSigner = null;
  extensionPreviewNpub = "";
  extensionPreviewPubkey = "";
  // NIP-46 connect flow (§LM5). The QR/copyable nostrconnect URI, the signer's
  // interactive-approval URL if one arrives mid-connect, and the confirmed-but-
  // not-yet-adopted user identity.
  bunkerConnectUri = "";
  bunkerAuthUrl = "";
  pendingBunker = null;
  // ---- Passkey rail (docs/passkey-login.md) ----
  // Zero registration, zero servers: a PRF-capable passkey deterministically
  // derives this site's login name + password (a frozen contract, see
  // passkey.ts), and the ordinary password flows do everything else.
  // `pendingPasskey` holds the derived credential between "the ceremony
  // succeeded" and the new user's fresh-vs-import choice. `passkeySession`
  // marks the standing for dashboard labeling. There is deliberately NO
  // deferred-phrase state: passkey registration runs the recovery ceremony
  // before granting the session (see runPasskeyRegistration).
  pendingPasskey = null;
  passkeySession = !1;
  sessionWarnings = [];
  lastSignedEventJson = "";
  exportedNsec = "";
  changePasswordNewCredential = "";
  // Brief animated brass-seal stamp (matching the widget's own brand mark) shown once over
  // the destination screen right after a real security-relevant success -- see flashSuccess().
  pendingSuccessLabel = null;
  successDismissTimer = null;
  // Rollback confirmation (§16.2 step 6). A RollbackDetectedError from either login or
  // password-change means this device has already seen a newer credential generation than the
  // one just read -- most likely a rotated-away password being replayed from a relay that never
  // processed its tombstone. Rather than a passive dashboard banner shown after the fact (which
  // let an old, "revoked" password fully unlock a session), this blocks BEFORE claiming the
  // signer or dispatching bitlogin-login, and requires an explicit second step to proceed.
  pendingRollback = null;
  rollbackMessage = "";
  // ---- Connection Vault request flow (vault-ux.md §2-§4, reveal mode) ----
  // stage "auth": waiting for the user to sign in first; the goto("dashboard")
  // hook resumes the request exactly once. stage "active": the vault screens
  // own navigation until finishVaultRequest() settles the promise.
  vaultRequest = null;
  vaultCandidate = null;
  /** True when the account cannot store the connection (no vault root); the
   *  flow still hands the URI to the app, labeled as unsaved. */
  vaultUnsaved = !1;
  vaultUnsavedReason;
  vaultConnections = null;
  vaultIntegrityWarnings = [];
  /** offerNwcConnection state: the app already holds this URI; the only
   *  question on screen is whether a copy enters the user's vault. */
  /** Claimed synchronously by offerNwcConnection before any await (see there). */
  offerInFlight = !1;
  vaultOffer = null;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" });
    const e = new CSSStyleSheet();
    e.replaceSync(Ue), this.root.adoptedStyleSheets = [e], this.worker = new _e(), this.worker.onNotification = (t) => {
      t.notify === "nip46-auth-url" && (this.bunkerAuthUrl = t.url, this.render());
    };
  }
  connectedCallback() {
    const e = Oe(this);
    if (this.vaultRelayUrls = e.vaultRelayUrls ?? [], this.discoveryRelayUrls = e.discoveryRelayUrls ?? [], this.worker.configure({ vaultRelayUrls: this.vaultRelayUrls, discoveryRelayUrls: this.discoveryRelayUrls }).then(() => this.tryRestoreSession()), this.root.addEventListener("click", (t) => this.onClick(t)), this.root.addEventListener("submit", (t) => this.onSubmit(t)), this.root.addEventListener("change", (t) => void this.onFileChange(t)), this.render(), this.installedProvider = De(this, () => this.vaultRelayUrls), !window.nostr)
      try {
        window.nostr = this.installedProvider;
      } catch {
      }
  }
  disconnectedCallback() {
    this.successDismissTimer !== null && clearTimeout(this.successDismissTimer), te(this), this.releaseSigner(), this.worker.terminate();
  }
  // ---- Public API mirroring window.nostr, scoped to this element instance ----
  // Routed through the active signer: the worker for BitLogin-account sessions (as
  // always), the extension's provider for a NIP-07 session (§LM3). Hosts holding a
  // reference to this element get the right backend either way.
  async getPublicKey() {
    return this.altSigner ? this.altSigner.getPublicKey() : (await this.worker.getPublicKey()).publicKey;
  }
  async signEvent(e) {
    return this.altSigner ? this.altSigner.signEvent(e) : this.worker.signEvent(e);
  }
  /**
   * Element-scoped NIP-44 encryption, matching getPublicKey/signEvent above. A host page
   * embedding multiple signing methods (its own extension detection, another widget) should
   * prefer this over reaching through `window.nostr.nip44` -- window.nostr is a single global
   * slot that whichever provider signed in last currently owns, so a host holding a direct
   * reference to ITS OWN `<bitlogin-auth>` element can talk to it deterministically instead of
   * racing other providers for that slot.
   */
  async nip44Encrypt(e, t) {
    return this.altSigner ? this.altSigner.nip44Encrypt(e, t) : (await this.worker.nip44Encrypt({ peerPublicKey: e, plaintext: t })).ciphertext;
  }
  async nip44Decrypt(e, t) {
    return this.altSigner ? this.altSigner.nip44Decrypt(e, t) : (await this.worker.nip44Decrypt({ peerPublicKey: e, payload: t })).plaintext;
  }
  /**
   * Legacy relative to nip44Encrypt/nip44Decrypt above, but still what a real NIP-07
   * extension exposes as window.nostr.nip04 -- implemented for drop-in parity with sites
   * (or their older DM code paths) that still expect NIP-04 rather than NIP-44.
   */
  async nip04Encrypt(e, t) {
    return this.altSigner ? this.altSigner.nip04Encrypt(e, t) : (await this.worker.nip04Encrypt({ peerPublicKey: e, plaintext: t })).ciphertext;
  }
  async nip04Decrypt(e, t) {
    return this.altSigner ? this.altSigner.nip04Decrypt(e, t) : (await this.worker.nip04Decrypt({ peerPublicKey: e, payload: t })).plaintext;
  }
  async logout() {
    if (this.altSigner) {
      this.altSigner.method === "nip46" && this.worker.nip46Disconnect(), this.altSigner = null, this.session = null, this.passkeySession = !1, te(this), this.releaseSigner(), this.dispatchEvent(new CustomEvent("bitlogin-logout")), this.goto("welcome");
      return;
    }
    await this.worker.logout(), this.session = null, this.passkeySession = !1, te(this), this.releaseSigner(), this.dispatchEvent(new CustomEvent("bitlogin-logout")), this.goto("welcome");
  }
  /**
   * Connection Vault request API (connection-vault.md §12, vault-ux.md §2-§4).
   *
   * Asks the user to share an NWC wallet connection with THIS page's origin
   * and resolves the raw `nostr+walletconnect://` URI, or null if the user
   * declines or dismisses. REVEAL MODE, stated plainly: the caller receives
   * the full bearer credential and everything its wallet-side budget allows —
   * an embedded same-origin widget cannot broker (§CV12.3), so it does not
   * pretend to. The consent copy tells the user the same thing.
   *
   * If nobody is signed in, the widget shows its sign-in flow first and
   * resumes the request after. If the account already has a connection bound
   * to this origin, the user sees a one-tap approval; otherwise a guided
   * import (Bitcoin Connect chooser, or paste).
   */
  async requestNwcConnection(e = {}) {
    if (this.vaultRequest) throw new Error("A wallet connection request is already in progress.");
    if (this.altSigner) return null;
    const t = window.location.origin, n = e.appName?.trim() || window.location.hostname || "This app";
    return new Promise((r) => {
      this.vaultRequest = { appName: n, reason: e.reason, origin: t, stage: "auth", resolve: r }, this.dispatchEvent(new CustomEvent("bitlogin-request-pending")), (async () => {
        try {
          if (!(await this.worker.getSessionStatus()).unlocked) {
            this.goto("login");
            return;
          }
          await this.continueVaultRequest();
        } catch (a) {
          this.fail(a);
        }
      })();
    });
  }
  /**
   * Offer-to-save (the inverse of requestNwcConnection): the app OBTAINED an
   * NWC URI by its own means — its own wallet chooser, its own paste box —
   * and offers the user a portable copy. Consent-gated in this widget's own
   * UI, never silent: the write goes to the user's account (encrypted events
   * under their vault identity), and nothing enters or leaves the vault
   * without the user seeing it happen in BitLogin's chrome.
   *
   * Resolves "saved", "declined", "already-saved" (same wallet + secret
   * exists; its origin binding was refreshed, no UI shown), or "unavailable"
   * (no session or no vault root — the offer is quietly impossible, and an
   * app should treat that as a no-op rather than an error).
   */
  async offerNwcConnection(e, t = {}) {
    if (this.vaultOffer || this.vaultRequest || this.offerInFlight) return "unavailable";
    this.offerInFlight = !0;
    try {
      return await this.runOfferNwcConnection(e, t);
    } finally {
      this.offerInFlight = !1;
    }
  }
  async runOfferNwcConnection(e, t) {
    if (!(await this.worker.getSessionStatus().catch(() => ({ unlocked: !1 }))).unlocked || !(await this.worker.vaultStatus()).enabled) return "unavailable";
    if ((await this.worker.vaultOfferCheck({ uri: e })).duplicate) return "already-saved";
    const s = t.appName?.trim() || window.location.hostname || "This app";
    return new Promise((i) => {
      this.vaultOffer = {
        uri: e,
        appName: s,
        label: t.label?.trim() || `${s} wallet`,
        resolve: i
      }, this.dispatchEvent(new CustomEvent("bitlogin-offer-pending")), this.goto("vault-offer");
    });
  }
  finishVaultOffer(e) {
    const t = this.vaultOffer;
    t && (this.vaultOffer = null, t.resolve(e), this.goto(this.session ? "dashboard" : "welcome"));
  }
  async acceptVaultOffer() {
    const e = this.vaultOffer;
    if (e) {
      this.setBusy(!0);
      try {
        const t = this.field("vaultOfferLabel").trim() || e.label;
        await this.worker.vaultSaveNwc({ uri: e.uri, label: t }), this.setBusy(!1), this.finishVaultOffer("saved"), this.flashSuccess(this.screen, "Wallet saved"), this.dispatchEvent(
          new CustomEvent("bitlogin-connection-granted", { detail: { origin: window.location.origin } })
        );
      } catch (t) {
        this.setBusy(!1), this.fail(t);
      }
    }
  }
  /** Settles the pending request exactly once and returns to a neutral screen. */
  finishVaultRequest(e) {
    const t = this.vaultRequest;
    t && (this.vaultRequest = null, this.vaultCandidate = null, this.vaultUnsaved = !1, this.vaultUnsavedReason = void 0, t.resolve(e), e !== null && this.dispatchEvent(
      new CustomEvent("bitlogin-connection-granted", { detail: { origin: t.origin } })
    ), this.goto(this.session ? "dashboard" : "welcome"));
  }
  async continueVaultRequest() {
    const e = this.vaultRequest;
    if (!e) return;
    e.stage = "active";
    const t = await this.worker.vaultStatus();
    if (!t.enabled) {
      this.vaultUnsaved = !0, this.vaultUnsavedReason = t.reason, this.goto("vault-import");
      return;
    }
    this.vaultUnsaved = !1;
    const n = await this.worker.vaultFindForOrigin();
    n.connection ? (this.vaultCandidate = n.connection, this.goto("vault-consent")) : this.goto("vault-import");
  }
  async approveVaultCandidate() {
    const e = this.vaultCandidate;
    if (!(!e || !this.vaultRequest)) {
      this.setBusy(!0);
      try {
        const { uri: t } = await this.worker.vaultRevealNwc({ connectionId: e.connectionId });
        this.setBusy(!1), this.finishVaultRequest(t), this.flashSuccess(this.screen, "Wallet shared");
      } catch (t) {
        this.setBusy(!1), this.fail(t);
      }
    }
  }
  async runVaultBcChooser() {
    const e = this.vaultRequest;
    if (e) {
      this.setBusy(!0);
      try {
        const t = await qe(e.appName);
        if (t === null) {
          this.setBusy(!1);
          return;
        }
        await this.saveAndShareVaultUri(t, this.field("vaultLabel"));
      } catch (t) {
        this.setBusy(!1), this.fail(t);
      }
    }
  }
  async handleVaultImportSubmit() {
    const e = this.field("vaultUri").trim();
    if (e) {
      this.setBusy(!0);
      try {
        await this.saveAndShareVaultUri(e, this.field("vaultLabel"));
      } catch (t) {
        this.setBusy(!1), this.fail(t);
      }
    }
  }
  async saveAndShareVaultUri(e, t) {
    const n = this.vaultRequest;
    if (!n) return;
    if (this.vaultUnsaved) {
      this.setBusy(!1), this.finishVaultRequest(e);
      return;
    }
    const r = t.trim() || `${n.appName} wallet`;
    await this.worker.vaultSaveNwc({ uri: e, label: r }), this.setBusy(!1), this.finishVaultRequest(e), this.flashSuccess(this.screen, "Wallet connected");
  }
  async loadVaultManage() {
    this.vaultConnections = null, this.vaultIntegrityWarnings = [], this.goto("vault-manage");
    try {
      const e = await this.worker.vaultList();
      this.vaultConnections = e.connections, this.vaultIntegrityWarnings = je(e);
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e), this.vaultConnections = [];
    }
    this.render();
  }
  async vaultUnbind(e) {
    this.setBusy(!0);
    try {
      await this.worker.vaultSetBinding({ connectionId: e, origin: null }), this.busy = !1, await this.loadVaultManage();
    } catch (t) {
      this.setBusy(!1), this.fail(t);
    }
  }
  async vaultDeleteConnection(e) {
    this.setBusy(!0);
    try {
      await this.worker.vaultDelete({ connectionId: e }), this.busy = !1, await this.loadVaultManage();
    } catch (t) {
      this.setBusy(!1), this.fail(t);
    }
  }
  /**
   * (Re)installs this element's own provider as window.nostr, taking over from whatever is
   * currently there (an extension, a different BitLogin instance, or nothing). Called
   * automatically whenever a user completes sign-in through this widget — that's an
   * explicit signal they want BitLogin active. Also public: a host page offering several
   * signing methods can call it directly (e.g. `document.querySelector('bitlogin-auth').claimSigner()`)
   * when the user re-selects BitLogin from its own method picker, without a page reload.
   *
   * Best-effort: some NIP-07 extensions install window.nostr as a non-configurable,
   * non-writable property specifically to prevent another script from overwriting it, and
   * the plain assignment below throws a TypeError in that case ("Cannot assign to read only
   * property 'nostr'..."). This is never fatal to BitLogin's own session -- a host page
   * holding a reference to this element (getPublicKey/signEvent/nip44Encrypt/nip44Decrypt
   * above) never depends on window.nostr at all -- so the failure is caught and reported
   * through the returned boolean and the event detail rather than thrown, and every caller
   * below proceeds to complete sign-in regardless. Only a host page that reads window.nostr
   * directly (instead of talking to this element) is actually affected, and only for as long
   * as the other extension holds the slot.
   */
  claimSigner() {
    try {
      return window.nostr = this.installedProvider, this.dispatchEvent(new CustomEvent("bitlogin-signer-claimed", { detail: { windowNostrClaimed: !0 } })), !0;
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      return this.dispatchEvent(new CustomEvent("bitlogin-signer-claimed", { detail: { windowNostrClaimed: !1, error: t } })), !1;
    }
  }
  /**
   * Surfaces a claimSigner() failure on the dashboard itself (not just the event detail),
   * using the same sessionWarnings/renderWarnings mechanism already shown for rollback and
   * relay-disagreement warnings -- so a user isn't left wondering why some other app still
   * seems to be using a different signer.
   */
  /** Single dispatch point for bitlogin-login so every sign-in path reports the same
   * detail shape: which method granted the session and what it can do (§LM3). The
   * pre-existing `publicKey` field is unchanged for hosts written before `method`. */
  dispatchLogin() {
    const e = this.altSigner?.capabilities ?? {
      nip44: !0,
      nip04: !0,
      getRelays: !0
    };
    this.session && lt(this, {
      method: this.session.method,
      publicKey: this.session.publicKey,
      npub: this.session.npub
    }), this.dispatchEvent(
      new CustomEvent("bitlogin-login", {
        detail: {
          publicKey: this.session?.publicKey,
          method: this.session?.method ?? "bitlogin",
          capabilities: e
        }
      })
    );
  }
  noteSignerClaim(e) {
    e || (this.sessionWarnings = [
      ...this.sessionWarnings,
      "Another Nostr signer (browser extension) is active in this browser and couldn't be replaced. You're signed in to BitLogin, but any app that reads window.nostr directly may still use that other signer instead of this one."
    ]);
  }
  /**
   * Releases window.nostr back to undefined, but only if it's still this element's own
   * provider — never clobbers a different signing method a host page (or another widget
   * instance) may have since taken over. Called automatically on logout and on removal from
   * the DOM, so a page offering multiple signing methods (an extension, a NIP-46 bunker,
   * BitLogin) can let a user switch away from BitLogin without a full page reload — before
   * this existed, window.nostr stayed pointed at a signed-out BitLogin provider forever.
   * Returns whether it actually released anything. Best-effort for the same reason as
   * claimSigner above: a property some other extension made non-configurable can also fail
   * to `delete`, and that must not block logout either.
   */
  releaseSigner() {
    const e = window;
    if (this.installedProvider && e.nostr === this.installedProvider) {
      try {
        delete e.nostr;
      } catch {
        return !1;
      }
      return this.dispatchEvent(new CustomEvent("bitlogin-signer-released")), !0;
    }
    return !1;
  }
  goto(e) {
    if (e === "dashboard" && this.vaultRequest?.stage === "auth") {
      this.continueVaultRequest().catch((t) => this.fail(t));
      return;
    }
    if (e === "welcome" && this.vaultRequest) {
      this.finishVaultRequest(null);
      return;
    }
    if (e === "welcome" && this.vaultOffer) {
      this.finishVaultOffer("declined");
      return;
    }
    this.screen = e, this.errorMessage = void 0, this.render();
  }
  setBusy(e) {
    this.busy = e, this.render();
  }
  fail(e) {
    this.errorMessage = e instanceof Error ? e.message : String(e), this.busy = !1, this.render();
  }
  field(e) {
    return this.root.querySelector(`[name="${e}"]`)?.value ?? "";
  }
  /**
   * Explicitly asks the browser to offer saving this credential via the Credential
   * Management API (Chromium-based browsers only — Firefox and Safari never implemented
   * `PasswordCredential`). This is the primary fix for password-manager integration here,
   * not just a nice-to-have: the generated-password screen never puts the password into a
   * real `<input>` for a browser to observe being filled (it's shown as text), and even on
   * the login screen — which does use real, correctly-`autocomplete`d inputs — save/autofill
   * heuristics are unreliable inside a shadow root, and this widget's JS-driven submit
   * (`preventDefault`, no real form POST) doesn't produce the passive signal most heuristics
   * expect anyway. An explicit `navigator.credentials.store()` call sidesteps all of that.
   * Best-effort only: never blocks or fails the surrounding flow.
   */
  async offerToSaveCredential(e, t) {
    try {
      const n = window.PasswordCredential;
      if (!n || !navigator.credentials?.store) return;
      const r = new n({ id: e, password: t, name: e });
      await navigator.credentials.store(r);
    } catch {
    }
  }
  async onClick(e) {
    if (!e.isTrusted) return;
    const t = e.target.closest("[data-action]");
    if (!t) return;
    switch (t.dataset.action) {
      case "vault-offer-save":
        return this.acceptVaultOffer();
      case "vault-offer-decline":
        this.finishVaultOffer("declined");
        return;
      case "vault-approve":
        return this.approveVaultCandidate();
      case "vault-different":
        this.vaultCandidate = null, this.goto("vault-import");
        return;
      case "vault-bc":
        return this.runVaultBcChooser();
      case "vault-cancel":
        this.finishVaultRequest(null);
        return;
      case "goto-vault-manage":
        return this.loadVaultManage();
      case "vault-unbind":
        return this.vaultUnbind(t.dataset.id);
      case "vault-delete":
        return this.vaultDeleteConnection(t.dataset.id);
      case "goto-create":
        this.loginName = "", this.importKey = "", this.importPreviewNpub = "", this.goto("create-name");
        return;
      case "goto-import":
        this.importKey = "", this.importPreviewNpub = "", this.goto("import-key");
        return;
      case "preview-import":
        return this.handlePreviewImport();
      case "import-continue":
        return this.handleImportContinue();
      case "goto-login":
        this.goto("login");
        return;
      case "goto-recover":
        this.offlineExportFile = null, this.offlineExportFileNotice = void 0, this.goto("recover-phrase");
        return;
      case "goto-welcome":
        this.pendingRollback = null, this.pendingExtensionSigner = null, this.pendingPasskey = null, !this.altSigner && (this.bunkerConnectUri || this.pendingBunker) && this.worker.nip46Disconnect(), this.pendingBunker = null, this.bunkerConnectUri = "", this.bunkerAuthUrl = "", this.goto("welcome");
        return;
      case "toggle-more":
        this.moreOptionsOpen = !this.moreOptionsOpen, this.render();
        return;
      case "goto-passkey":
        this.pendingPasskey = null, this.errorMessage = void 0, this.goto("passkey");
        return;
      case "passkey-auth":
        return this.handlePasskeyAuth();
      case "passkey-register":
        return this.handlePasskeyRegisterCeremony();
      case "passkey-new":
        return this.importKey = "", this.importPreviewNpub = "", void this.runPasskeyRegistration();
      case "passkey-import":
        this.importKey = "", this.importPreviewNpub = "", this.goto("import-key");
        return;
      case "extension-signin":
        return this.handleExtensionSignIn();
      case "extension-continue":
        this.handleExtensionConfirm();
        return;
      case "goto-bunker":
        this.pendingBunker = null, this.bunkerConnectUri = "", this.bunkerAuthUrl = "", this.errorMessage = void 0, this.goto("bunker-connect"), this.startNostrconnect();
        return;
      case "bunker-continue":
        this.handleBunkerConfirm();
        return;
      case "copy-bunker-uri": {
        const r = t, a = r.textContent ?? "Copy", s = (i) => {
          r.textContent = i, setTimeout(() => {
            r.isConnected && (r.textContent = a);
          }, 2e3);
        };
        if (!this.bunkerConnectUri || !navigator.clipboard?.writeText) {
          s("Copy not available");
          return;
        }
        navigator.clipboard.writeText(this.bunkerConnectUri).then(
          () => s("Copied"),
          () => s("Copy failed")
        );
        return;
      }
      case "goto-dashboard":
        this.goto("dashboard");
        return;
      case "goto-verify-phrase":
        this.goto("verify-phrase");
        return;
      case "goto-confirm-phrase":
        this.goto("confirm-phrase");
        return;
      case "goto-change-password":
        this.changePasswordNewCredential = G().secret, this.goto("change-password");
        return;
      case "goto-export":
        this.goto("export");
        return;
      case "regenerate-credential":
        this.generatedCredential = G().secret, this.savedCheckbox = !1, this.render();
        return;
      case "copy-credential": {
        const r = this.root.querySelector("#credential-box"), a = t, s = a.textContent ?? "Copy", i = (u) => {
          a.textContent = u, setTimeout(() => {
            a.isConnected && (a.textContent = s);
          }, 2e3);
        };
        if (!r || !navigator.clipboard?.writeText) {
          i("Copy not available — select the text manually");
          return;
        }
        navigator.clipboard.writeText(r.textContent ?? "").then(
          () => i("Copied"),
          () => i("Copy failed — select the text manually")
        );
        return;
      }
      case "download-recovery-export":
        return this.handleDownloadRecoveryExport();
      case "sign-test-event":
        return this.handleSignTestEvent();
      case "reveal-nsec":
        return this.handleRevealNsec();
      case "logout":
        return this.logout();
      case "rollback-retry": {
        const r = this.pendingRollback?.kind;
        this.pendingRollback = null, this.goto(r === "change-password" ? "change-password" : "login");
        return;
      }
      case "rollback-continue":
        return this.handleRollbackContinue();
      default:
        return;
    }
  }
  async onSubmit(e) {
    if (e.preventDefault(), !e.isTrusted) return;
    const n = e.target.dataset.form;
    try {
      switch (n) {
        case "import-key":
          return await this.handlePreviewImport();
        case "create-name":
          return this.handleCreateNameSubmit();
        case "create-credential":
          return await this.handleCreateCredentialSubmit();
        case "verify-phrase":
          return this.handleVerifyPhraseSubmit();
        case "login":
          return await this.handleLoginSubmit();
        case "recover-phrase":
          return await this.handleRecoverPhraseSubmit();
        case "recover-new-credentials":
          return await this.handleRecoverNewCredentialsSubmit();
        case "change-password":
          return await this.handleChangePasswordSubmit();
        case "vault-import":
          return await this.handleVaultImportSubmit();
        case "bunker-connect":
          return await this.handleBunkerSubmit();
        default:
          return;
      }
    } catch (r) {
      this.fail(r);
    }
  }
  /**
   * Reads and validates an optional recovery-export file (§19.5) for the recover-phrase
   * screen. Purely a relay-outage fallback -- the file never contains the phrase or any
   * phrase-derived key, so it's ignored entirely unless the user also enters their phrase.
   */
  async onFileChange(e) {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.name !== "offlineExportFile" || t.type !== "file") return;
    const n = t.files?.[0];
    if (!n) {
      this.offlineExportFile = null, this.offlineExportFileNotice = void 0, this.render();
      return;
    }
    try {
      const r = await n.text();
      this.offlineExportFile = Be(JSON.parse(r)), this.offlineExportFileNotice = `Loaded recovery export from ${new Date(this.offlineExportFile.created_at * 1e3).toLocaleString()}.`;
    } catch (r) {
      this.offlineExportFile = null, this.offlineExportFileNotice = r instanceof $e || r instanceof SyntaxError ? `Couldn't read that file: ${r.message}` : `Couldn't read that file: ${String(r)}`;
    }
    this.render();
  }
  async handlePreviewImport() {
    const e = this.field("importKey").trim();
    if (!e) {
      this.errorMessage = "Paste your nsec or hex private key first.", this.render();
      return;
    }
    this.setBusy(!0);
    try {
      const t = await this.worker.previewImportKey({ nsecOrHex: e });
      this.importKey = e, this.importPreviewNpub = t.npub, this.busy = !1, this.render();
    } catch (t) {
      this.importKey = "", this.importPreviewNpub = "", this.fail(t);
    }
  }
  handleImportContinue() {
    if (!this.importKey || !this.importPreviewNpub) {
      this.errorMessage = "Check your key before continuing.", this.render();
      return;
    }
    if (this.pendingPasskey) {
      this.runPasskeyRegistration();
      return;
    }
    this.loginName = "", this.goto("create-name");
  }
  static PRF_UNSUPPORTED_MESSAGE = "This passkey (or this browser) doesn't support the extension BitLogin needs. Try a different browser or password manager, or use one of the other sign-in methods.";
  /** Runs a WebAuthn ceremony and returns the derived credential, or null
   *  after rendering the appropriate message (cancelled / PRF-unsupported). */
  async runPasskeyCeremony(e) {
    try {
      const t = e === "get" ? await navigator.credentials.get(fe()) : await navigator.credentials.create(ft("BitLogin"));
      if (!t) throw new Error("The passkey ceremony returned nothing.");
      let n = ge(t);
      if (!n && e === "create") {
        const r = await navigator.credentials.get(
          fe(void 0, t.rawId)
        );
        n = r ? ge(r) : null;
      }
      return n ? dt(n) : (this.busy = !1, this.errorMessage = ie.PRF_UNSUPPORTED_MESSAGE, this.render(), null);
    } catch (t) {
      return this.busy = !1, this.errorMessage = t instanceof Error && t.name === "NotAllowedError" ? "The passkey prompt was cancelled or timed out." : t instanceof Error ? t.message : String(t), this.render(), null;
    }
  }
  /** "Use my passkey": sign in, or route a passkey with no account here into
   *  first-time setup with the credential it derived. */
  async handlePasskeyAuth() {
    if (this.busy) return;
    this.setBusy(!0);
    const e = await this.runPasskeyCeremony("get");
    if (e)
      try {
        const t = await this.worker.login({ loginName: e.loginName, password: e.password });
        this.loginName = e.loginName, this.session = {
          publicKey: t.everydayPublicKey,
          npub: _(t.everydayPublicKey),
          accountId: t.accountId,
          method: "bitlogin"
        }, this.sessionWarnings = [t.rollbackWarning, t.relayDisagreementWarning].filter((n) => !!n), this.busy = !1, this.passkeySession = !0, this.noteSignerClaim(this.claimSigner()), this.dispatchLogin(), this.flashSuccess("dashboard", "Signed in");
      } catch (t) {
        if (t instanceof Error && t.name === "AccountNotFoundError") {
          this.pendingPasskey = e, this.busy = !1, this.goto("passkey-create");
          return;
        }
        if (t instanceof Error && t.name === "RollbackDetectedError") {
          this.pendingRollback = { kind: "login", loginName: e.loginName, password: e.password }, this.rollbackMessage = t.message, this.busy = !1, this.goto("rollback-confirm");
          return;
        }
        this.fail(t);
      }
  }
  /** "Create a new passkey": mint it, then set up (or rejoin) its account. */
  async handlePasskeyRegisterCeremony() {
    if (this.busy) return;
    this.setBusy(!0);
    const e = await this.runPasskeyCeremony("create");
    e && (this.pendingPasskey = e, this.busy = !1, this.goto("passkey-create"));
  }
  /** Registers the account a passkey-derived credential unlocks (fresh
   *  identity, or wrapping an imported key, §SF10). Tier B2 phrase handling:
   *  ceremony deferred behind the dashboard card. */
  async runPasskeyRegistration() {
    const e = this.pendingPasskey;
    if (e) {
      this.setBusy(!0);
      try {
        const t = await this.worker.register({
          loginName: e.loginName,
          password: e.password,
          importKey: this.importKey || void 0
        });
        this.importKey = "", this.importPreviewNpub = "", this.pendingPasskey = null, this.loginName = e.loginName, this.recoveryPhrase = t.recoveryPhrase;
        const n = this.recoveryPhrase.split(" "), r = ye(n.length, 3);
        this.confirmSlots = r.map((a) => ({ index: a, value: "" })), this.session = {
          publicKey: t.everydayPublicKey,
          npub: _(t.everydayPublicKey),
          accountId: t.accountId,
          method: "bitlogin"
        }, this.sessionWarnings = [], this.worker.publishProfileAndRelayLists({
          name: this.loginName,
          generalRelays: this.vaultRelayUrls,
          dmRelays: this.vaultRelayUrls
        }), this.busy = !1, this.passkeySession = !0, this.goto("confirm-phrase");
      } catch (t) {
        if (t instanceof Error && t.name === "AccountAlreadyExistsError") {
          this.pendingPasskey = null, this.busy = !1, this.handlePasskeySignInWith(e);
          return;
        }
        this.fail(t);
      }
    }
  }
  async handlePasskeySignInWith(e) {
    this.passkeySession = !0, await this.attemptLogin(e.loginName, e.password);
  }
  handleCreateNameSubmit() {
    const e = this.field("loginName").trim().toLowerCase();
    if (!le(e)) {
      this.errorMessage = "Login name must be 3-32 characters: a-z, 0-9, '.', '_', '-', and not start/end with punctuation.", this.render();
      return;
    }
    this.loginName = e, this.generatedCredential = G().secret, this.savedCheckbox = !1, this.goto("create-credential");
  }
  async handleCreateCredentialSubmit() {
    this.savedCheckbox = this.root.querySelector("#saved-check")?.checked ?? !1;
    const e = this.generatedCredential;
    if (!this.savedCheckbox) {
      this.errorMessage = "Please confirm you saved your password before continuing.", this.render();
      return;
    }
    this.setBusy(!0);
    const t = await this.worker.register({
      loginName: this.loginName,
      password: e,
      importKey: this.importKey || void 0
    });
    this.importKey = "", this.importPreviewNpub = "", this.recoveryPhrase = t.recoveryPhrase;
    const n = this.recoveryPhrase.split(" "), r = ye(n.length, 3);
    this.confirmSlots = r.map((a) => ({ index: a, value: "" })), this.session = { publicKey: t.everydayPublicKey, npub: _(t.everydayPublicKey), accountId: t.accountId, method: "bitlogin" }, this.busy = !1, this.goto("confirm-phrase"), this.worker.publishProfileAndRelayLists({
      name: this.loginName,
      generalRelays: this.vaultRelayUrls,
      dmRelays: this.vaultRelayUrls
    }), this.offerToSaveCredential(this.loginName, e);
  }
  handleVerifyPhraseSubmit() {
    const e = this.recoveryPhrase.split(" ");
    for (const t of this.confirmSlots)
      if (this.field(`confirm-${t.index}`).trim().toLowerCase() !== e[t.index]) {
        this.errorMessage = `Word #${t.index + 1} doesn't match. Please check your saved phrase and try again.`, this.render();
        return;
      }
    this.sessionWarnings = [], this.noteSignerClaim(this.claimSigner()), this.dispatchLogin(), this.flashSuccess("dashboard", "Account created");
  }
  async handleLoginSubmit() {
    const e = this.field("loginName").trim().toLowerCase(), t = this.field("password");
    this.passkeySession = !1, await this.attemptLogin(e, t);
  }
  /**
   * "Use your Nostr extension instead" (§LM4) -- asks the detected extension for its
   * public key, then shows it for the user to confirm before any session exists. The
   * provider reference is snapshotted here so a later change of window.nostr occupant
   * can never swap the backend mid-session.
   */
  async handleExtensionSignIn() {
    if (this.busy) return;
    const e = ue();
    if (!e) {
      this.errorMessage = "No Nostr signer extension was found in this browser.", this.render();
      return;
    }
    this.setBusy(!0);
    try {
      const t = new Ye(e), n = await t.getPublicKey();
      this.pendingExtensionSigner = t, this.extensionPreviewPubkey = n, this.extensionPreviewNpub = _(n), this.busy = !1, this.goto("extension-confirm");
    } catch (t) {
      this.pendingExtensionSigner = null, this.fail(t);
    }
  }
  /** The user confirmed the npub the extension reported is theirs; grant the thin
   * session (§LM7). Deliberately no claimSigner(): the extension owns window.nostr
   * and this session's whole point is to use it, not replace it (§LM4). */
  handleExtensionConfirm() {
    const e = this.pendingExtensionSigner;
    if (!e || !this.extensionPreviewPubkey) {
      this.goto("welcome");
      return;
    }
    this.pendingExtensionSigner = null, this.altSigner = e, this.session = { publicKey: this.extensionPreviewPubkey, npub: this.extensionPreviewNpub, method: "nip07" }, this.sessionWarnings = [], this.vaultRequest && this.finishVaultRequest(null), this.dispatchLogin(), this.flashSuccess("dashboard", "Signed in");
  }
  /**
   * nostrconnect leg of the remote-signer flow (§LM5.1): the worker mints an
   * ephemeral client key and a secret, we show the resulting URI as a QR for a
   * phone signer to scan, and the worker listens for whichever signer echoes
   * the secret. Runs alongside the paste form -- whichever leg completes first
   * wins, and the worker refuses a superseded listen.
   */
  async startNostrconnect() {
    try {
      const { uri: e } = await this.worker.nip46NostrconnectStart({
        appName: window.location.hostname || "BitLogin"
      });
      if (this.screen !== "bunker-connect") return;
      this.bunkerConnectUri = e, this.render();
      const { userPubkey: t } = await this.worker.nip46NostrconnectAwait();
      if (this.screen !== "bunker-connect" || this.pendingBunker)
        return;
      this.adoptBunkerPreview(t);
    } catch (e) {
      this.screen === "bunker-connect" && !this.pendingBunker && !this.session && (this.bunkerConnectUri = "", this.fail(e));
    }
  }
  /** bunker:// paste leg (§LM5.1). */
  async handleBunkerSubmit() {
    const e = this.field("bunkerUri").trim();
    if (!e) {
      this.errorMessage = "Paste a bunker:// address first.", this.render();
      return;
    }
    this.setBusy(!0), this.bunkerAuthUrl = "";
    try {
      const { userPubkey: t } = await this.worker.nip46Connect({ uri: e });
      this.busy = !1, this.adoptBunkerPreview(t);
    } catch (t) {
      this.fail(t);
    }
  }
  adoptBunkerPreview(e) {
    this.pendingBunker = { userPubkey: e, npub: _(e) }, this.bunkerConnectUri = "", this.bunkerAuthUrl = "", this.errorMessage = void 0, this.goto("bunker-confirm");
  }
  /** The user confirmed the identity their remote signer reported (§LM5). */
  handleBunkerConfirm() {
    const e = this.pendingBunker;
    if (!e) {
      this.goto("welcome");
      return;
    }
    this.pendingBunker = null, this.altSigner = new Ge(this.worker, e.userPubkey), this.session = { publicKey: e.userPubkey, npub: e.npub, method: "nip46" }, this.sessionWarnings = [], this.vaultRequest && this.finishVaultRequest(null), this.noteSignerClaim(this.claimSigner()), this.dispatchLogin(), this.flashSuccess("dashboard", "Signed in");
  }
  /**
   * Called once per connectedCallback, right after "configure" -- restores whatever
   * a prior login/register/rotate cached locally (§21), so a page reload lands
   * straight on the dashboard instead of asking for the login name + password
   * again. Silent by design: no flashSuccess() stamp (that's reserved for a
   * deliberate action the user just took) and no offerToSaveCredential (there's
   * no password in hand to save). If the welcome screen already rendered by the
   * time this resolves, goto() just re-renders over it -- a brief flash, not a
   * correctness issue.
   */
  async tryRestoreSession() {
    try {
      const e = await this.worker.restoreSession();
      if (!e.restored || !e.everydayPublicKey) return;
      this.session = {
        publicKey: e.everydayPublicKey,
        npub: _(e.everydayPublicKey),
        accountId: e.accountId,
        method: "bitlogin"
      }, this.noteSignerClaim(this.claimSigner()), this.dispatchLogin(), this.goto("dashboard");
    } catch {
    }
  }
  /**
   * Shared by the login form and the "continue anyway" rollback-confirmation step so both
   * paths grant a session identically -- claimSigner() and the bitlogin-login event only ever
   * fire once a RollbackDetectedError (if any) has been resolved one way or the other.
   */
  async attemptLogin(e, t, n = !1) {
    this.setBusy(!0);
    try {
      const r = await this.worker.login({ loginName: e, password: t, acknowledgeRollback: n });
      this.loginName = e, this.session = { publicKey: r.everydayPublicKey, npub: _(r.everydayPublicKey), accountId: r.accountId, method: "bitlogin" }, this.sessionWarnings = [r.rollbackWarning, r.relayDisagreementWarning].filter((a) => !!a), this.busy = !1, this.noteSignerClaim(this.claimSigner()), this.dispatchLogin(), this.flashSuccess("dashboard", "Signed in"), this.offerToSaveCredential(e, t);
    } catch (r) {
      if (r instanceof Error && r.name === "RollbackDetectedError") {
        this.pendingRollback = { kind: "login", loginName: e, password: t }, this.rollbackMessage = r.message, this.busy = !1, this.goto("rollback-confirm");
        return;
      }
      this.fail(r);
    }
  }
  async handleRollbackContinue() {
    const e = this.pendingRollback;
    if (this.pendingRollback = null, !e) {
      this.goto("welcome");
      return;
    }
    e.kind === "login" ? await this.attemptLogin(e.loginName, e.password, !0) : await this.attemptChangePassword(e.oldPassword, e.newPassword, !0);
  }
  async handleRecoverPhraseSubmit() {
    const e = this.field("phrase").trim();
    this.setBusy(!0);
    const t = await this.worker.recover({ phrase: e, offlineExportFile: this.offlineExportFile ?? void 0 });
    this.recoverPhraseInput = e, this.recoveredPreview = {
      generalRelaysCount: t.generalRelays.length,
      dmRelaysCount: t.dmRelays.length,
      chainWarning: t.chainWarning
    }, this.session = { publicKey: t.everydayPublicKey, npub: _(t.everydayPublicKey), accountId: t.accountId, method: "bitlogin" }, this.newCredentialAfterRecovery = G().secret, this.busy = !1, this.goto("recover-new-credentials");
  }
  async handleRecoverNewCredentialsSubmit() {
    const e = this.field("newLoginName").trim().toLowerCase();
    if (!le(e)) {
      this.errorMessage = "Login name must be 3-32 characters: a-z, 0-9, '.', '_', '-', and not start/end with punctuation.", this.render();
      return;
    }
    const t = this.newCredentialAfterRecovery;
    this.setBusy(!0), await this.worker.completeRecovery({ newLoginName: e, newPassword: t }), this.loginName = e, this.busy = !1, this.sessionWarnings = [], this.noteSignerClaim(this.claimSigner()), this.dispatchLogin(), this.flashSuccess("dashboard", "Account recovered"), this.offerToSaveCredential(e, t);
  }
  async handleChangePasswordSubmit() {
    const e = this.field("oldPassword"), t = this.changePasswordNewCredential;
    await this.attemptChangePassword(e, t);
  }
  /** Shared by the rotation form and the "continue anyway" rollback-confirmation step; see attemptLogin. */
  async attemptChangePassword(e, t, n = !1) {
    this.setBusy(!0);
    try {
      await this.worker.changePassword({
        loginName: this.loginName,
        oldPassword: e,
        newPassword: t,
        acknowledgeRollback: n
      }), this.busy = !1, this.sessionWarnings = [], this.noteSignerClaim(this.claimSigner()), this.flashSuccess("dashboard", "Password updated"), this.offerToSaveCredential(this.loginName, t);
    } catch (r) {
      if (r instanceof Error && r.name === "RollbackDetectedError") {
        this.pendingRollback = { kind: "change-password", oldPassword: e, newPassword: t }, this.rollbackMessage = r.message, this.busy = !1, this.goto("rollback-confirm");
        return;
      }
      this.fail(r);
    }
  }
  async handleDownloadRecoveryExport() {
    const e = await this.worker.buildRecoveryExport(), t = new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t), r = document.createElement("a");
    r.href = n, r.download = "bitlogin-recovery-export.json", r.click(), URL.revokeObjectURL(n);
  }
  async handleSignTestEvent() {
    try {
      const e = await this.signEvent({ kind: 1, content: `Hello from BitLogin at ${(/* @__PURE__ */ new Date()).toISOString()}` });
      this.lastSignedEventJson = JSON.stringify(e, null, 2), this.render();
    } catch (e) {
      this.fail(e);
    }
  }
  async handleRevealNsec() {
    const { nsec: e } = await this.worker.exportIdentity();
    this.exportedNsec = e, this.render();
  }
  render() {
    const e = this.pendingSuccessLabel ? this.renderSuccessOverlay(this.pendingSuccessLabel) : "";
    this.root.innerHTML = `<div class="card">${this.renderScreen()}${e}</div>`;
  }
  renderSuccessOverlay(e) {
    return `
      <div class="success-overlay" data-success-overlay>
        <span class="success-stamp">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id="bl-success-brass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#e6c481" />
                <stop offset="1" stop-color="#b3924a" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="21" fill="none" stroke="url(#bl-success-brass)" stroke-width="2.5" />
            <path d="M27 32.5l3.6 3.6L38 28.2" fill="none" stroke="url(#bl-success-brass)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <p class="success-label">${k(e)}</p>
      </div>
    `;
  }
  /**
   * Navigates to `screen` and briefly stamps it with the same brass-ring-and-checkmark mark
   * used in the logo, for the handful of moments that are a genuine security-relevant success
   * -- signing in, creating an account, recovering one, or rotating a password -- rather than
   * every validation step or navigation. Purely decorative: `pointer-events: none` (see
   * styles.ts) means it never blocks interacting with the screen underneath, and a JS timer
   * (not just the CSS animation) guarantees it's removed even if the animation can't run.
   */
  flashSuccess(e, t) {
    this.goto(e), this.successDismissTimer !== null && clearTimeout(this.successDismissTimer), this.pendingSuccessLabel = t, this.render(), this.successDismissTimer = setTimeout(() => {
      this.pendingSuccessLabel = null, this.successDismissTimer = null, this.root.querySelector("[data-success-overlay]")?.remove();
    }, 1100);
  }
  /** Screen header with an icon back button, replacing the dangling "Back"
   *  link every pre-auth screen used to end with -- back navigation belongs
   *  where the eye starts, not after the form. */
  renderScreenHead(e, t = "goto-welcome") {
    return `
      <div class="screen-head">
        <button class="icon-back" type="button" data-action="${t}" aria-label="Back">${yt}</button>
        <h2>${e}</h2>
      </div>`;
  }
  renderError() {
    return this.errorMessage ? `<div class="notice error">${k(this.errorMessage)}</div>` : "";
  }
  renderWarnings() {
    return this.sessionWarnings.map((e) => `<div class="notice warn">${k(e)}</div>`).join("");
  }
  /** The widget's own brand lockup (mark + wordmark), inlined as vector paths rather than
   * relying on the host page having loaded any particular font -- shown once, on the
   * welcome screen, as the widget's one branding moment. */
  renderBrandLockup() {
    return '<svg class="brand-lockup" xmlns="http://www.w3.org/2000/svg" viewBox="0 -74.8 511.6 103.3" role="img" aria-label="BitLogin"> <defs> <linearGradient id="bl-lockup-seal" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#8368ff" /> <stop offset="1" stop-color="#6a4de8" /> </linearGradient> <linearGradient id="bl-lockup-brass" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#e6c481" /> <stop offset="1" stop-color="#b3924a" /> </linearGradient> </defs> <g transform="translate(0 -61.88) scale(1.3496)"> <circle cx="32" cy="32" r="21" fill="none" stroke="url(#bl-lockup-brass)" stroke-width="2.5" /> <circle cx="32" cy="32" r="14.5" fill="url(#bl-lockup-seal)" /> <path d="M27 32.5l3.6 3.6L38 28.2" fill="none" stroke="url(#bl-lockup-brass)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /> </g> <g transform="translate(92.50 0)"> <path d="M68.55 -16.85Q68.55 -9.4 62.13 -4.7Q55.7 0 42.85 0L8.2 0Q6.65 0 5.93 -0.62Q5.2 -1.25 5.2 -2.3Q5.2 -4.2 7.3 -4.85L10.15 -5.5Q11.4 -5.85 12.03 -6.55Q12.65 -7.25 12.65 -8.35L12.65 -61.65Q12.65 -62.75 12.03 -63.45Q11.4 -64.15 10.15 -64.5L7.3 -65.15Q5.2 -65.8 5.2 -67.7Q5.2 -68.8 5.93 -69.4Q6.65 -70 8.2 -70L35.2 -70Q44.5 -70 51.08 -67.45Q57.65 -64.9 61.1 -60.37Q64.55 -55.85 64.55 -49.8Q64.55 -44.75 61.73 -40.8Q58.9 -36.85 53.35 -34.58Q47.8 -32.3 39.65 -32.3L42.45 -33.85Q50.4 -33.85 56.25 -31.67Q62.1 -29.5 65.33 -25.67Q68.55 -21.85 68.55 -16.85ZM37.15 -30.45L23.8 -30.45L23.8 -34.5L35.9 -34.5Q40.35 -34.5 43.45 -36.18Q46.55 -37.85 48.15 -41.1Q49.75 -44.35 49.75 -49Q49.75 -53.95 47.78 -57.62Q45.8 -61.3 42 -63.35Q38.2 -65.4 32.7 -65.4L28.15 -65.4L28.15 -9.45Q28.15 -7 29.68 -5.8Q31.2 -4.6 34.15 -4.6L39.45 -4.6Q43.9 -4.6 46.93 -6.15Q49.95 -7.7 51.5 -10.57Q53.05 -13.45 53.05 -17.25Q53.05 -23.25 48.98 -26.85Q44.9 -30.45 37.15 -30.45ZM94.5 -45.1L94.5 -8Q94.5 -6.45 94.93 -5.72Q95.35 -5 96.25 -4.7L98.15 -4.2Q99.1 -3.9 99.55 -3.37Q100 -2.85 100 -2.05Q100 -1.1 99.35 -0.55Q98.7 0 97.25 0L77.55 0Q76.15 0 75.5 -0.55Q74.85 -1.1 74.85 -2.05Q74.85 -2.8 75.3 -3.32Q75.75 -3.85 76.7 -4.2L78.65 -4.7Q79.55 -5.05 79.98 -5.75Q80.4 -6.45 80.4 -8L80.4 -36.65Q80.4 -37.95 80.03 -38.5Q79.65 -39.05 78.8 -39.2L76.15 -39.4Q75.25 -39.6 74.85 -40.05Q74.45 -40.5 74.45 -41.2Q74.45 -42.05 74.93 -42.55Q75.4 -43.05 76.75 -43.55L86.05 -46.95Q88 -47.65 89.18 -47.95Q90.35 -48.25 91.15 -48.25Q92.85 -48.25 93.68 -47.37Q94.5 -46.5 94.5 -45.1ZM86.35 -55.9Q82.35 -55.9 79.93 -57.97Q77.5 -60.05 77.5 -63.4Q77.5 -66.75 79.93 -68.78Q82.35 -70.8 86.35 -70.8Q90.4 -70.8 92.83 -68.78Q95.25 -66.75 95.25 -63.4Q95.25 -60.05 92.83 -57.97Q90.4 -55.9 86.35 -55.9ZM108.9 -42.45L106.6 -43.15Q105.4 -43.55 104.9 -44.07Q104.4 -44.6 104.4 -45.3Q104.4 -46.3 105.08 -46.82Q105.75 -47.35 106.9 -47.35L109.95 -47.35Q111.15 -47.35 111.95 -47.8Q112.75 -48.25 113.6 -49.4L119.05 -57.05Q120.1 -58.35 121.05 -58.95Q122 -59.55 122.95 -59.55Q124 -59.55 124.6 -58.9Q125.2 -58.25 125.2 -57L125.2 -14.25Q125.2 -10.75 126.58 -8.9Q127.95 -7.05 130.4 -7.05Q132.25 -7.05 133.28 -7.77Q134.3 -8.5 134.9 -9.45Q135.5 -10.4 136.08 -11.12Q136.65 -11.85 137.55 -11.9Q138.3 -11.9 138.73 -11.4Q139.15 -10.9 139.15 -9.75Q139.1 -6.9 137.28 -4.45Q135.45 -2 132.2 -0.47Q128.95 1.05 124.8 1.05Q118.4 1.05 114.78 -2.18Q111.15 -5.4 111.15 -11.9L111.15 -39.5Q111.15 -40.8 110.63 -41.42Q110.1 -42.05 108.9 -42.45ZM119.65 -42.4L119.65 -47.35L136.2 -47.35Q137.35 -47.35 138.03 -46.87Q138.7 -46.4 138.7 -45.5Q138.7 -44.2 137.4 -43.3Q136.1 -42.4 133.2 -42.4ZM174.95 -65.15L172.1 -64.5Q170.9 -64.15 170.25 -63.45Q169.6 -62.75 169.6 -61.65L169.6 -8.55Q169.6 -6.65 170.7 -5.82Q171.8 -5 174.05 -5L182.35 -5Q185.2 -5 187.2 -5.77Q189.2 -6.55 190.8 -8.5Q192.4 -10.45 194.05 -14.05L197.05 -20.95Q197.65 -22.2 198.53 -22.62Q199.4 -23.05 200.55 -22.75Q201.75 -22.45 202.25 -21.62Q202.75 -20.8 202.35 -19.4L197.85 -1.8Q197.3 0.05 196.48 0.95Q195.65 1.85 194.05 1.85Q193 1.85 191.98 1.4Q190.95 0.95 189.73 0.48Q188.5 0 186.65 0L149.7 0Q148.15 0 147.43 -0.62Q146.7 -1.25 146.7 -2.3Q146.7 -4.2 148.8 -4.85L151.65 -5.5Q152.85 -5.85 153.5 -6.55Q154.15 -7.25 154.15 -8.35L154.15 -61.65Q154.15 -62.75 153.5 -63.45Q152.85 -64.15 151.65 -64.5L148.8 -65.15Q146.7 -65.8 146.7 -67.7Q146.7 -68.8 147.43 -69.4Q148.15 -70 149.7 -70L174.05 -70Q175.6 -70 176.33 -69.4Q177.05 -68.8 177.05 -67.7Q177.05 -65.8 174.95 -65.15ZM234.65 -48.5Q242.4 -48.5 248.25 -45.35Q254.1 -42.2 257.38 -36.58Q260.65 -30.95 260.65 -23.5Q260.65 -16.45 257.27 -10.85Q253.9 -5.25 247.95 -2Q242 1.25 234.15 1.25Q226.45 1.25 220.63 -1.95Q214.8 -5.15 211.5 -10.77Q208.2 -16.4 208.2 -23.75Q208.2 -30.9 211.58 -36.47Q214.95 -42.05 220.9 -45.28Q226.85 -48.5 234.65 -48.5ZM238.2 -4Q241.6 -4.5 243.68 -7.12Q245.75 -9.75 246.33 -14.35Q246.9 -18.95 245.7 -25.4Q244.55 -31.85 242.35 -36.02Q240.15 -40.2 237.15 -42.05Q234.15 -43.9 230.65 -43.3Q227.2 -42.75 225.13 -40.12Q223.05 -37.5 222.53 -32.93Q222 -28.35 223.15 -21.85Q224.3 -15.45 226.5 -11.27Q228.7 -7.1 231.7 -5.25Q234.7 -3.4 238.2 -4ZM299.9 -4.6Q292.95 -5.6 289.83 -6.37Q286.7 -7.15 285.9 -7.85Q285.1 -8.55 285.1 -9.3Q285.1 -10.1 285.75 -10.8Q286.4 -11.5 287.9 -12.15L286.85 -12.95Q281.9 -12.45 279.08 -11.12Q276.25 -9.8 275.08 -7.95Q273.9 -6.1 273.9 -4Q273.9 -1.6 275.33 0.1Q276.75 1.8 280.65 3.13Q284.55 4.45 292.05 5.55Q298.15 6.45 301.55 7.48Q304.95 8.5 306.3 9.8Q307.65 11.1 307.65 12.85Q307.65 15.05 306.25 16.63Q304.85 18.2 301.8 19.03Q298.75 19.85 293.7 19.85Q284.9 19.85 281.35 17.23Q277.8 14.6 277.8 10.3Q277.8 7.95 279.77 6.08Q281.75 4.2 285.5 3.6L284.7 2.1Q274.75 3.3 270.9 6.35Q267.05 9.4 267.05 13.35Q267.05 16.55 269.35 19.08Q271.65 21.6 276.97 23.05Q282.3 24.5 291.35 24.5Q305.3 24.5 312.68 20.13Q320.05 15.75 320.05 8.9Q320.05 5.15 318.13 2.5Q316.2 -0.15 311.77 -1.87Q307.35 -3.6 299.9 -4.6ZM301.05 -43.3L304.3 -42.85Q306.15 -46.5 307.35 -47.75Q308.55 -49 310.15 -49Q311.6 -49 312.43 -48.28Q313.25 -47.55 313.9 -46.6Q314.55 -45.65 315.45 -44.92Q316.35 -44.2 317.95 -44.2Q320.25 -44.2 321.6 -45.87Q322.95 -47.55 322.95 -50.3Q322.95 -53.4 320.95 -55.17Q318.95 -56.95 315.8 -56.95Q311.95 -56.95 308.52 -54.42Q305.1 -51.9 302.75 -46.8ZM315.9 -30.45Q315.9 -35.5 313.13 -39.58Q310.35 -43.65 305.23 -46Q300.1 -48.35 293 -48.35Q285.7 -48.35 280.22 -45.9Q274.75 -43.45 271.72 -39.08Q268.7 -34.7 268.7 -28.9Q268.7 -23.85 271.47 -19.78Q274.25 -15.7 279.4 -13.35Q284.55 -11 291.65 -11Q298.95 -11 304.43 -13.45Q309.9 -15.9 312.9 -20.28Q315.9 -24.65 315.9 -30.45ZM290.5 -44.1Q294.8 -44.4 297.55 -40.7Q300.3 -37 301.1 -30Q301.9 -23.15 300.08 -19.45Q298.25 -15.75 294.1 -15.45Q291.25 -15.3 289.05 -16.87Q286.85 -18.45 285.45 -21.67Q284.05 -24.9 283.5 -29.55Q283 -34.15 283.63 -37.3Q284.25 -40.45 286 -42.17Q287.75 -43.9 290.5 -44.1ZM345.55 -45.1L345.55 -8Q345.55 -6.45 345.98 -5.72Q346.4 -5 347.3 -4.7L349.2 -4.2Q350.15 -3.9 350.6 -3.37Q351.05 -2.85 351.05 -2.05Q351.05 -1.1 350.4 -0.55Q349.75 0 348.3 0L328.6 0Q327.2 0 326.55 -0.55Q325.9 -1.1 325.9 -2.05Q325.9 -2.8 326.35 -3.32Q326.8 -3.85 327.75 -4.2L329.7 -4.7Q330.6 -5.05 331.03 -5.75Q331.45 -6.45 331.45 -8L331.45 -36.65Q331.45 -37.95 331.08 -38.5Q330.7 -39.05 329.85 -39.2L327.2 -39.4Q326.3 -39.6 325.9 -40.05Q325.5 -40.5 325.5 -41.2Q325.5 -42.05 325.97 -42.55Q326.45 -43.05 327.8 -43.55L337.1 -46.95Q339.05 -47.65 340.23 -47.95Q341.4 -48.25 342.2 -48.25Q343.9 -48.25 344.73 -47.37Q345.55 -46.5 345.55 -45.1ZM337.4 -55.9Q333.4 -55.9 330.98 -57.97Q328.55 -60.05 328.55 -63.4Q328.55 -66.75 330.98 -68.78Q333.4 -70.8 337.4 -70.8Q341.45 -70.8 343.88 -68.78Q346.3 -66.75 346.3 -63.4Q346.3 -60.05 343.88 -57.97Q341.45 -55.9 337.4 -55.9ZM377.2 -45.1L377.2 -8Q377.2 -6.45 377.65 -5.75Q378.1 -5.05 379 -4.7L380.8 -4.2Q382.4 -3.55 382.4 -2.2Q382.4 0 379.6 0L360.3 0Q358.9 0 358.25 -0.55Q357.6 -1.1 357.6 -2.05Q357.6 -2.8 358.03 -3.32Q358.45 -3.85 359.4 -4.2L361.4 -4.7Q362.3 -5.05 362.73 -5.75Q363.15 -6.45 363.15 -8L363.15 -36.65Q363.15 -37.95 362.78 -38.5Q362.4 -39.05 361.55 -39.2L358.9 -39.4Q358 -39.6 357.6 -40.05Q357.2 -40.5 357.2 -41.2Q357.2 -42.05 357.67 -42.55Q358.15 -43.05 359.5 -43.55L368.8 -46.95Q370.7 -47.65 371.85 -47.95Q373 -48.25 374.05 -48.25Q375.6 -48.25 376.4 -47.37Q377.2 -46.5 377.2 -45.1ZM375.7 -33.95L373.4 -36.3L375.35 -38.05Q381.7 -43.85 386.42 -46.17Q391.15 -48.5 395.3 -48.5Q401.75 -48.5 405.67 -44.4Q409.6 -40.3 409.6 -33.4L409.6 -8.15Q409.6 -6.5 410.08 -5.75Q410.55 -5 411.5 -4.7L413.25 -4.2Q414.25 -3.85 414.67 -3.32Q415.1 -2.8 415.1 -2.05Q415.1 -1.1 414.45 -0.55Q413.8 0 412.4 0L393.05 0Q390.25 0 390.25 -2.2Q390.25 -3.55 391.8 -4.2L393.7 -4.7Q394.7 -5.05 395.13 -5.8Q395.55 -6.55 395.55 -8.15L395.55 -31.35Q395.55 -35.75 393.4 -37.93Q391.25 -40.1 387.65 -40.1Q385.4 -40.1 382.88 -39.05Q380.35 -38 377.7 -35.7Z" fill="currentColor" /> </g> </svg>';
  }
  renderScreen() {
    switch (this.screen) {
      case "welcome": {
        const e = (a, s, i, u, b = !1) => `
          <button class="option-row" type="button" data-action="${a}" ${b ? "disabled" : ""}>
            <span class="option-icon">${s}</span>
            <span class="option-text"><span>${i}</span><span class="option-sub">${u}</span></span>
          </button>`, t = ue() ? e(
          "extension-signin",
          j.extension,
          this.busy ? "Asking your extension…" : "Nostr extension",
          "Use the signer extension in this browser",
          this.busy
        ) : "", n = pt() ? e(
          "goto-passkey",
          j.passkey,
          "Continue with a passkey",
          "Kept in your phone or browser's password manager"
        ) : "", r = this.moreOptionsOpen ? `<div class="option-menu">
              <div class="option-group-label">Use an account you already have</div>
              ${n}
              ${t}
              ${e("goto-bunker", j.remote, "Remote signer", "Scan a code with Amber or another signer app")}
              ${e("goto-import", j.importKey, "Import a Nostr key", "Wrap an existing identity in a login name and password")}
              ${e("goto-recover", j.recover, "Recover account", "Sign back in with your 12-word recovery phrase")}
            </div>` : "";
        return `
          ${this.renderBrandLockup()}
          <p class="sub">A portable Nostr identity with a familiar login name and password.</p>
          ${this.renderError()}
          <button class="primary" data-action="goto-login">Sign in</button>
          <button class="secondary" data-action="goto-create">Create account</button>
          <button class="options-toggle ${this.moreOptionsOpen ? "open" : ""}" type="button" data-action="toggle-more" aria-expanded="${this.moreOptionsOpen}">
            More sign-in options ${gt}
          </button>
          ${r}
        `;
      }
      case "passkey":
        return `
          ${this.renderScreenHead("Use a passkey")}
          <p class="sub">A passkey kept in your phone, browser, or security key — usually synced by your Google or Apple account. This site needs no setup and runs no server; the passkey itself unlocks your Nostr account.</p>
          ${this.renderError()}
          <button class="primary" type="button" data-action="passkey-auth" ${this.busy ? "disabled" : ""}>
            ${this.busy ? '<span class="spinner"></span>Waiting for your passkey…' : "Use my passkey"}
          </button>
          <button class="secondary" type="button" data-action="passkey-register" ${this.busy ? "disabled" : ""}>Create a new passkey</button>
          <p class="small">First time here? "Use my passkey" also works — if this passkey has no account on this site yet, you'll be taken to set one up.</p>
        `;
      case "passkey-create":
        return `
          ${this.renderScreenHead("Almost there")}
          <p class="sub">Your passkey is ready — it will unlock this account from now on, with nothing stored anywhere else. Choose how to set up the account's identity:</p>
          ${this.renderError()}
          <button class="primary" type="button" data-action="passkey-new" ${this.busy ? "disabled" : ""}>
            ${this.busy ? '<span class="spinner"></span>Creating your account…' : "Create a fresh identity"}
          </button>
          <button class="secondary" type="button" data-action="passkey-import" ${this.busy ? "disabled" : ""}>I already have a Nostr key</button>
          <p class="small">Next you'll save a 12-word recovery phrase. It's the only way back if you ever lose the passkey, so it isn't optional — and it's the same phrase that lets you take full control of this account, or leave for any other Nostr app, without losing your identity.</p>
        `;
      case "extension-confirm":
        return `
          ${this.renderScreenHead("Sign in with your extension")}
          <p class="sub">Your Nostr signer extension reports this identity:</p>
          <div class="credential-box">${k(this.extensionPreviewNpub)}</div>
          <p class="small">Check this is the profile you expect — extensions can hold more than one. BitLogin never sees this identity's private key; your extension signs on its behalf. This session lasts until you log out or leave the page, and BitLogin account features (wallet connections, password rotation, recovery) stay with BitLogin accounts.</p>
          ${this.renderError()}
          <button class="primary" type="button" data-action="extension-continue">This is me — continue</button>
        `;
      case "bunker-connect": {
        let e = "";
        if (this.bunkerAuthUrl)
          try {
            const n = new URL(this.bunkerAuthUrl).hostname;
            e = `<div class="notice info">Your signer asks you to approve this connection first.
               <a href="${k(this.bunkerAuthUrl)}" target="_blank" rel="noopener noreferrer">Open the approval page at ${k(n)}</a>, then return here.</div>`;
          } catch {
            e = "";
          }
        const t = this.bunkerConnectUri ? `<div class="qr-wrap" aria-live="polite">${at(this.bunkerConnectUri, "Nostr Connect QR code")}</div>
             <button class="secondary" type="button" data-action="copy-bunker-uri">Copy connection code</button>
             <p class="small">Waiting for your signer to connect…</p>` : this.errorMessage ? '<button class="secondary" type="button" data-action="goto-bunker">Generate a new code</button>' : '<p class="sub"><span class="spinner"></span>Preparing connection code…</p>';
        return `
          ${this.renderScreenHead("Use a remote signer")}
          <p class="sub">Scan with a signer app on your phone (Amber, nsec.app, …). Your key stays in the signer; BitLogin only requests signatures.</p>
          ${this.renderError()}
          ${e}
          ${t}
          <div class="divider"></div>
          <form data-form="bunker-connect">
            <label for="bunkerUri">Or paste a bunker:// address</label>
            <input type="password" name="bunkerUri" id="bunkerUri" autocomplete="off" placeholder="bunker://…" />
            <button class="secondary" type="submit" ${this.busy ? "disabled" : ""}>
              ${this.busy ? '<span class="spinner"></span>Contacting your signer…' : "Connect"}
            </button>
          </form>
        `;
      }
      case "bunker-confirm":
        return `
          ${this.renderScreenHead("Remote signer connected")}
          <p class="sub">Your signer reports this identity:</p>
          <div class="credential-box">${k(this.pendingBunker?.npub ?? "")}</div>
          <p class="small">Check this is the profile you expect. Your private key stays in your signer — each signature is requested over relays, and your signer can require approval or be disconnected at any time. This session lasts until you log out or leave the page; BitLogin account features (wallet connections, password rotation, recovery) stay with BitLogin accounts.</p>
          ${this.renderError()}
          <button class="primary" type="button" data-action="bunker-continue">This is me — continue</button>
        `;
      case "import-key": {
        const e = !!this.importPreviewNpub;
        return `
          ${this.renderScreenHead("Import an existing Nostr key")}
          <p class="sub">Wrap a Nostr identity you already control in a BitLogin login name and password. Your key never changes — you just get a friendlier way in.</p>
          <div class="notice warn">Pasting a private key into any web page is risky. Only do this on a BitLogin build you trust, and clear your clipboard afterward. BitLogin can't secure copies of this key that already exist elsewhere.</div>
          ${this.renderError()}
          <form data-form="import-key">
            <label for="importKey">Your nsec or hex private key</label>
            <input type="password" name="importKey" id="importKey" autocomplete="off" placeholder="nsec1… or 64-character hex" required />
            <button class="secondary" type="submit" ${this.busy ? "disabled" : ""}>
              ${this.busy ? '<span class="spinner"></span>Checking…' : "Check key"}
            </button>
          </form>
          ${e ? `<div class="notice info">This key's public identity:</div>
                 <div class="credential-box">${k(this.importPreviewNpub)}</div>
                 <button class="primary" type="button" data-action="import-continue">This is my identity — continue</button>` : ""}
        `;
      }
      case "create-name":
        return `
          ${this.renderScreenHead(this.importKey ? "Set up your login" : "Create your BitLogin")}
          <p class="sub">${this.importKey ? "Choose a login name for your imported identity. It's a convenience, not a secret." : "Choose a login name. It's a convenience, not a secret (it contributes no security)."}</p>
          ${this.renderError()}
          <form data-form="create-name">
            <label for="loginName">Login name</label>
            <input type="text" name="loginName" id="loginName" placeholder="adam" autocomplete="off" required minlength="3" maxlength="32" />
            <button class="primary" type="submit">Continue</button>
          </form>
        `;
      case "create-credential": {
        const e = this.busy ? `<span class="spinner"></span>${this.importKey ? "Importing…" : "Creating account…"}` : this.importKey ? "Import account" : "Create account";
        return `
          <h2>Your generated password</h2>
          <p class="sub">BitLogin generates your password because no server can rate-limit guesses against a downloadable encrypted file.</p>
          <div class="credential-box" id="credential-box">${k(this.generatedCredential)}</div>
          <button class="secondary" type="button" data-action="copy-credential">Copy</button>
          <button class="secondary" type="button" data-action="regenerate-credential">Generate a different one</button>
          ${this.renderError()}
          <form data-form="create-credential" autocomplete="on">
            <input type="text" name="username" autocomplete="username" value="${k(this.loginName)}" readonly hidden />
            <label class="checkbox-row">
              <input type="checkbox" id="saved-check" ${this.savedCheckbox ? "checked" : ""} />
              I have saved this password somewhere safe.
            </label>
            <button class="primary" type="submit" ${this.busy ? "disabled" : ""}>${e}</button>
          </form>
        `;
      }
      case "confirm-phrase":
        return `
          <h2>Save your recovery phrase</h2>
          <p class="sub">These 12 words can recover your identity if you forget your password or lose all your devices. We cannot recover these words for you.</p>
          <p class="small">Do not enter a Bitcoin or other cryptocurrency-wallet recovery phrase into BitLogin. This is a BitLogin-only phrase.</p>
          <div class="phrase-grid">
            ${this.recoveryPhrase.split(" ").map((e, t) => `<div class="phrase-word"><span>${t + 1}.</span>${k(e)}</div>`).join("")}
          </div>
          ${this.renderError()}
          <button class="primary" type="button" data-action="goto-verify-phrase">I've saved my phrase — continue</button>
        `;
      case "verify-phrase":
        return `
          <h2>Verify your recovery phrase</h2>
          <p class="sub">Your phrase is hidden now so you can confirm you actually saved it. Enter the requested words below.</p>
          ${this.renderError()}
          <form data-form="verify-phrase">
            ${this.confirmSlots.map(
          (e) => `
              <label for="confirm-${e.index}">Word #${e.index + 1}</label>
              <input type="text" name="confirm-${e.index}" id="confirm-${e.index}" autocomplete="off" required />
            `
        ).join("")}
            <button class="primary" type="submit">Confirm and continue</button>
          </form>
          <button class="link" data-action="goto-confirm-phrase">Back to phrase</button>
        `;
      case "login":
        return `
          ${this.renderScreenHead("Sign in")}
          ${this.renderError()}
          <form data-form="login">
            <label for="loginName">Login name</label>
            <input type="text" name="loginName" id="loginName" autocomplete="username" required />
            <label for="password">Password</label>
            <input type="password" name="password" id="password" autocomplete="current-password" required />
            <div class="field-hint">
              <button class="link-inline" type="button" data-action="goto-recover">Forgot password?</button>
            </div>
            <button class="primary" type="submit" ${this.busy ? "disabled" : ""}>
              ${this.busy ? '<span class="spinner"></span>Signing in…' : "Sign in"}
            </button>
          </form>
        `;
      case "recover-phrase":
        return `
          ${this.renderScreenHead("Recover with phrase")}
          <p class="sub">Enter your 12-word BitLogin recovery phrase.</p>
          <p class="small">Do not enter a Bitcoin or other cryptocurrency-wallet recovery phrase into BitLogin.</p>
          ${this.renderError()}
          <form data-form="recover-phrase">
            <label for="phrase">Recovery phrase</label>
            <input type="text" name="phrase" id="phrase" autocomplete="off" required placeholder="12 words separated by spaces" />
            <label for="offlineExportFile" style="margin-top:14px">Recovery export file (optional)</label>
            <input type="file" name="offlineExportFile" id="offlineExportFile" accept=".json,application/json" />
            <p class="small">Only needed if relays are unreachable -- the phrase above is still required either way. The file alone can never recover an account by itself.</p>
            ${this.offlineExportFileNotice ? `<div class="notice ${this.offlineExportFile ? "info" : "warn"}">${k(this.offlineExportFileNotice)}</div>` : ""}
            <button class="primary" type="submit" ${this.busy ? "disabled" : ""}>
              ${this.busy ? '<span class="spinner"></span>Recovering…' : "Continue"}
            </button>
          </form>
        `;
      case "recover-new-credentials": {
        const e = this.recoveredPreview?.chainWarning ? `<div class="notice warn">${k(this.recoveredPreview.chainWarning)}</div>` : "", t = this.busy ? '<span class="spinner"></span>Finishing recovery…' : "Finish recovery";
        return `
          <h2>Identity recovered</h2>
          <p class="sub">Found your account. Restored ${this.recoveredPreview?.generalRelaysCount ?? 0} general relay(s) and ${this.recoveredPreview?.dmRelaysCount ?? 0} DM relay(s) from your public events.</p>
          ${e}
          <p class="sub">Now set a new login name. BitLogin generated a new high-entropy password for this account.</p>
          <div class="credential-box" id="credential-box">${k(this.newCredentialAfterRecovery)}</div>
          <button class="secondary" type="button" data-action="copy-credential">Copy generated password</button>
          ${this.renderError()}
          <form data-form="recover-new-credentials">
            <label for="newLoginName">New login name</label>
            <input type="text" name="newLoginName" id="newLoginName" autocomplete="off" required />
            <button class="primary" type="submit" ${this.busy ? "disabled" : ""}>${t}</button>
          </form>
        `;
      }
      case "dashboard": {
        const e = this.session?.method ?? "bitlogin", n = e !== "bitlogin" ? `<p class="small">${e === "nip07" ? "Signed in through your Nostr extension." : "Signed in through your remote signer — each signature is requested from it over relays."} Wallet connections, password rotation, and identity export are features of BitLogin accounts — create one to get your settings on every device.</p>` : `
          <button class="secondary" type="button" data-action="goto-vault-manage">Wallet connections</button>
          <button class="secondary" type="button" data-action="goto-change-password">Rotate password</button>
          <button class="secondary" type="button" data-action="goto-export">Export identity</button>`, r = this.passkeySession ? `<p class="small">Signed in with a passkey — it unlocks this account from your device's password manager; your identity lives on the open Nostr network. Your recovery phrase works even if the passkey is lost.</p>` : "";
        return `
          <h2>Signed in</h2>
          ${this.renderWarnings()}
          <p class="pubkey">${k(this.session?.npub ?? "")}</p>
          ${r}
          ${this.renderError()}
          <button class="secondary" type="button" data-action="sign-test-event">Sign a test event</button>
          ${this.lastSignedEventJson ? `<div class="credential-box" style="white-space:pre-wrap">${k(this.lastSignedEventJson)}</div>` : ""}
          <div class="divider"></div>
          ${n}
          <button class="secondary" type="button" data-action="logout">Log out</button>
        `;
      }
      case "vault-consent": {
        const e = this.vaultRequest, t = this.vaultCandidate;
        if (!e || !t) return '<div class="notice error">No wallet request is in progress.</div>';
        const n = new Date(t.createdAt * 1e3).toLocaleDateString();
        return `
          <h2>Share a wallet with ${k(e.appName)}?</h2>
          ${e.reason ? `<p class="sub">Reason given: ${k(e.reason)}</p>` : ""}
          ${this.renderError()}
          <div class="credential-box">
            <strong>${k(t.label)}</strong><br />
            Connected ${k(n)} · wallet ${k((t.walletPubkey ?? "").slice(0, 10))}…
          </div>
          <div class="notice info">${k(e.appName)} will receive this connection and can spend within the budget your wallet enforces, until you revoke it from Wallet connections.</div>
          <button class="primary" type="button" data-action="vault-approve" ${this.busy ? "disabled" : ""}>
            ${this.busy ? '<span class="spinner"></span>Sharing…' : "Use this wallet"}
          </button>
          <button class="secondary" type="button" data-action="vault-different">Use a different wallet</button>
          <button class="link" type="button" data-action="vault-cancel">Cancel</button>
        `;
      }
      case "vault-import": {
        const e = this.vaultRequest;
        if (!e) return '<div class="notice error">No wallet request is in progress.</div>';
        const t = this.vaultUnsaved ? `<div class="notice warn">${this.vaultUnsavedReason === "no-vault" ? "This account predates the Connection Vault, so the connection will be handed to the app but not saved to your account. Enable the vault from your account manager (recovery phrase required) to make wallets portable." : "Sign in again to save connections to your account — until then the connection will be handed to the app but not saved."}</div>` : "";
        return `
          <h2>Connect a wallet for ${k(e.appName)}</h2>
          ${e.reason ? `<p class="sub">Reason given: ${k(e.reason)}</p>` : ""}
          ${t}
          ${this.renderError()}
          <button class="primary" type="button" data-action="vault-bc" ${this.busy ? "disabled" : ""}>
            ${this.busy ? '<span class="spinner"></span>Waiting for your wallet…' : "Connect a wallet"}
          </button>
          <div class="divider"></div>
          <form data-form="vault-import">
            <label for="vaultUri">Or paste an NWC connection</label>
            <input type="password" name="vaultUri" id="vaultUri" autocomplete="off" placeholder="nostr+walletconnect://…" />
            <label for="vaultLabel">Name this connection</label>
            <input type="text" name="vaultLabel" id="vaultLabel" autocomplete="off" maxlength="120" value="${k(`${e.appName} wallet`)}" />
            <button class="secondary" type="submit" ${this.busy ? "disabled" : ""}>
              ${this.vaultUnsaved ? "Share without saving" : "Save and share"}
            </button>
          </form>
          <div class="notice info">Set a spending budget on the wallet's own authorization page — the wallet is the only place a budget is actually enforced.</div>
          <button class="link" type="button" data-action="vault-cancel">Cancel</button>
        `;
      }
      case "vault-offer": {
        const e = this.vaultOffer;
        return e ? `
          <h2>Save this wallet to your BitLogin?</h2>
          <p class="sub">${k(e.appName)} just connected a wallet on this device. Saved to your BitLogin, the connection follows you — on a new device it's one tap instead of another paste.</p>
          ${this.renderError()}
          <label for="vaultOfferLabel">Name this connection</label>
          <input type="text" name="vaultOfferLabel" id="vaultOfferLabel" autocomplete="off" maxlength="120" value="${k(e.label)}" />
          <button class="primary" type="button" data-action="vault-offer-save" ${this.busy ? "disabled" : ""}>
            ${this.busy ? '<span class="spinner"></span>Saving…' : "Save to BitLogin"}
          </button>
          <button class="link" type="button" data-action="vault-offer-decline" ${this.busy ? "disabled" : ""}>No thanks — keep it on this device only</button>
          <div class="notice info">Stored encrypted on your account; ${k(e.appName)} keeps working either way. Remove it any time from Wallet connections.</div>
        ` : '<div class="notice error">No wallet offer is in progress.</div>';
      }
      case "vault-manage": {
        const e = this.vaultConnections, t = e === null ? '<p class="sub">Loading…</p>' : e.length === 0 ? `<p class="sub">No connections stored yet. They're added when you connect a wallet inside an app.</p>` : e.map(
          (n) => `
          <div class="credential-box">
            <strong>${k(n.label)}</strong> <span class="sub">(${k(n.connectionType)})</span><br />
            ${n.origin ? `Linked to ${k(n.origin)}` : "Not linked to an app"}
            <div>
              ${n.origin ? `<button class="link" type="button" data-action="vault-unbind" data-id="${k(n.connectionId)}" ${this.busy ? "disabled" : ""}>Revoke app access</button>` : ""}
              <button class="link" type="button" data-action="vault-delete" data-id="${k(n.connectionId)}" ${this.busy ? "disabled" : ""}>Remove from BitLogin</button>
            </div>
          </div>`
        ).join("");
        return `
          <h2>Wallet connections</h2>
          <p class="sub">Connections your apps use, stored encrypted on your account and restored on any device you sign in to.</p>
          ${this.renderError()}
          ${this.vaultIntegrityWarnings.map((n) => `<div class="notice warn">${k(n)}</div>`).join("")}
          ${t}
          <div class="notice info">"Remove from BitLogin" deletes the stored copy only — the connection itself keeps working for any app that already has it. To revoke spending authority, delete the connection inside your wallet app.</div>
          <button class="link" data-action="goto-dashboard">Back</button>
        `;
      }
      case "rollback-confirm":
        return `
          <h2>This looks like a stale or revoked credential</h2>
          <div class="notice warn">${k(this.rollbackMessage)}</div>
          <p class="sub">This usually means the password just entered was rotated away in an earlier session on this device, and a relay hasn't caught up with that change. If you rotated your password, use the new one instead. Only continue if you're confident this is relay lag, not a stale credential.</p>
          <button class="primary" type="button" data-action="rollback-retry">Try again</button>
          <button class="link" type="button" data-action="rollback-continue">I understand the risk — continue anyway</button>
          <button class="link" data-action="goto-welcome">Cancel</button>
        `;
      case "change-password":
        return `
          <h2>Rotate password</h2>
          ${this.passkeySession ? '<div class="notice info">This takes over from passkey sign-in: your passkey stops unlocking this account, and from then on you sign in with the new password below — you hold it, nobody else. This is the graduation step.</div>' : ""}
          <p class="sub">Your old password's capsule will be tombstoned and a deletion request issued. This does not erase copies an attacker may already have downloaded, and a relay that hasn't processed the deletion may keep serving the old password's capsule until a device that has already seen the new generation refuses it.</p>
          <div class="credential-box" id="credential-box">${k(this.changePasswordNewCredential)}</div>
          <button class="secondary" type="button" data-action="copy-credential">Copy generated password</button>
          ${this.renderError()}
          <form data-form="change-password">
            <label for="oldPassword">Current password</label>
            <input type="password" name="oldPassword" id="oldPassword" autocomplete="current-password" required />
            <button class="primary" type="submit" ${this.busy ? "disabled" : ""}>
              ${this.busy ? '<span class="spinner"></span>Rotating…' : "Confirm rotation"}
            </button>
          </form>
          <button class="link" data-action="goto-dashboard">Cancel</button>
        `;
      case "export":
        return `
          <h2>Export identity</h2>
          <p class="sub">Your public identity (npub) is safe to share. Your private key (nsec) is not.</p>
          <label>Public key (npub)</label>
          <div class="credential-box">${k(this.session?.npub ?? "")}</div>
          <button class="secondary" type="button" data-action="download-recovery-export">Download recovery export</button>
          ${this.renderError()}
          <button class="secondary" type="button" data-action="reveal-nsec">Reveal private key (nsec)</button>
          ${this.exportedNsec ? `<div class="notice warn">Never share this. Anyone with it controls your identity.</div><div class="credential-box">${k(
          this.exportedNsec
        )}</div>` : ""}
          <button class="link" data-action="goto-dashboard">Back</button>
        `;
      default:
        return "";
    }
  }
}
function ye(o, e) {
  const t = Array.from({ length: o }, (r, a) => a), n = [];
  for (let r = 0; r < e && t.length > 0; r++)
    n.push(t.splice(be(t.length), 1)[0]);
  return n.sort((r, a) => r - a);
}
function k(o) {
  return o.replace(/[&<>"']/gu, (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[e]);
}
customElements.get("bitlogin-auth") || customElements.define("bitlogin-auth", ie);
window.bitlogin = {
  version: "0.1.0",
  isActiveSigner() {
    return window.nostr?._bitlogin === !0;
  },
  releaseSigner() {
    const o = window;
    return o.nostr?._bitlogin === !0 ? (delete o.nostr, window.dispatchEvent(new CustomEvent("bitlogin-signer-released")), !0) : !1;
  },
  activeMethod() {
    return pe()?.method ?? null;
  },
  activeSession() {
    return pe();
  }
};
export {
  ie as BitLoginAuthElement,
  _e as WorkerClient,
  mt as createNip07Provider
};
