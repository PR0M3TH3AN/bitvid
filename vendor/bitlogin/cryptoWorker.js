import { v as ee, g as _, s as X, b as Ue, a as oe, K as wr, j as pn, k as Et, l as Pt, m as ie, u as Y, n as br, o as mr, d as V, q as Q, t as tt, S as Kt, w as Rt, x as nt, D as Re, y as rt, z as At, A as kr, B as _r, C as Er, F as Pr, G as st, H as Xt, I as Nt, J as Kr, L as Rr, M as Ar, N as je, O as xt, P as Nr, Q as xr, T as Ct, U as ot, V as Me, W as Cr, X as fn, Y as E, Z as pt, _ as Sr, $ as Ir, h as St, a0 as vn, a1 as Ae, a2 as Tr, c as We, a3 as gn, a4 as Ee, a5 as Lr, a6 as Ge, a7 as ft, a8 as Ur, f as Yt, a9 as Mr } from "./bitlogin-shared-CEfP5Eg9.js";
class Pe extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class de extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class wn extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class Le extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class bn extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function Je(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const Or = { generation: -1, recoveryGeneration: -1 };
function It(e) {
  return `bitlogin:hwm:${e}`;
}
async function Tt(e, t) {
  const n = await e.get(It(t));
  return n ? JSON.parse(n) : Or;
}
async function mn(e, t, n) {
  const r = await Tt(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(It(t), JSON.stringify(o)), o;
}
async function Dr(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set(It(t), JSON.stringify(n));
}
function Vr(e) {
  const t = e.split(".");
  if (t.length !== 4 || t.some((r) => !/^\d{1,3}$/u.test(r)))
    return !1;
  const n = t.map(Number);
  return n.every((r) => r >= 0 && r <= 255) && n[0] === 127;
}
function it(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.username || t.password || t.hash ? !1 : t.protocol === "wss:" ? !0 : t.protocol !== "ws:" ? !1 : t.hostname === "localhost" || t.hostname === "[::1]" || Vr(t.hostname);
}
function qr() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
const Xe = 1e3, Wr = 262144;
function jr(e) {
  const t = Math.min(e.limit ?? Xe, Xe);
  return Math.max(50, t * 3);
}
const $r = 2048, Br = 1e4, zr = 100;
function Gr(e, t) {
  if (e.size >= $r) {
    const n = e.values().next().value;
    n !== void 0 && e.delete(n);
  }
  e.add(t);
}
class Lt {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    if (!it(t))
      throw new Error("Relay URL must use secure WebSockets, except for an explicit loopback development endpoint.");
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = qr(), o = new r(this.url);
      this.ws = o;
      const i = setTimeout(() => {
        n(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(i);
        for (const [a, s] of this.subs)
          o.send(JSON.stringify(["REQ", a, s.filter]));
        t();
      }), o.addEventListener("error", () => {
        clearTimeout(i), n(new Error(`WebSocket error connecting to relay ${this.url}`));
      }), o.addEventListener("close", () => {
        this.connectPromise = null;
      }), o.addEventListener("message", (a) => {
        this.handleMessage(String(a.data));
      });
    }), this.connectPromise);
  }
  close() {
    this.ws?.close(), this.ws = null, this.connectPromise = null, this.subs.clear(), this.pendingPublishes.clear();
  }
  send(t) {
    if (!this.ws)
      throw new Error("Not connected to relay.");
    this.ws.send(JSON.stringify(t));
  }
  handleMessage(t) {
    if (t.length > Wr)
      return;
    let n;
    try {
      n = JSON.parse(t);
    } catch {
      return;
    }
    if (!Array.isArray(n) || typeof n[0] != "string")
      return;
    const [r, ...o] = n;
    if (r === "EVENT") {
      const [i, a] = o;
      if (typeof i != "string")
        return;
      const s = this.subs.get(i);
      if (!s)
        return;
      const c = a?.id;
      if (typeof c != "string" || s.seenIds.has(c))
        return;
      if (s.onEvent) {
        const u = Date.now();
        if (u - s.liveWindowStart >= Br && (s.liveWindowStart = u, s.liveVerifies = 0), s.liveVerifies >= zr || (s.liveVerifies++, !ee(a) || !Qt(a, s.filter)))
          return;
        Gr(s.seenIds, a.id), s.onEvent(a);
        return;
      }
      const l = Math.min(s.filter.limit ?? Xe, Xe);
      if (s.events.length >= l || s.verifyBudget <= 0 || (s.verifyBudget--, !ee(a) || !Qt(a, s.filter)))
        return;
      s.seenIds.add(a.id), s.events.push(a);
      return;
    }
    if (r === "EOSE") {
      const [i] = o;
      if (typeof i != "string")
        return;
      this.subs.get(i)?.onEose();
      return;
    }
    if (r === "OK") {
      const [i, a, s] = o;
      if (typeof i != "string" || typeof a != "boolean" || s !== void 0 && typeof s != "string")
        return;
      this.pendingPublishes.get(i)?.({ ok: a, message: s ?? "" }), this.pendingPublishes.delete(i);
      return;
    }
    if (r === "AUTH") {
      const [i] = o;
      if (typeof i != "string")
        return;
      this.respondToAuthChallenge(i);
      return;
    }
  }
  async respondToAuthChallenge(t) {
    if (!this.authPrivateKey)
      return;
    const n = _(this.authPrivateKey), r = X({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: wr,
      tags: [
        ["relay", this.url],
        ["challenge", t]
      ],
      content: ""
    }, this.authPrivateKey);
    this.authenticated = !0, this.send(["AUTH", r]);
  }
  isAuthenticated() {
    return this.authenticated;
  }
  async publish(t, n = 8e3) {
    return await this.connect(), new Promise((r) => {
      const o = setTimeout(() => {
        this.pendingPublishes.delete(t.id), r({ ok: !1, message: "timeout: no OK received from relay" });
      }, n);
      this.pendingPublishes.set(t.id, (i) => {
        clearTimeout(o), r(i);
      }), this.send(["EVENT", t]);
    });
  }
  /**
   * Opens a subscription that stays live past EOSE: every verified,
   * filter-matching event is delivered to `onEvent` as it arrives, until the
   * returned handle is closed. Survives socket drops -- connect() re-issues
   * REQ for all open subscriptions on reopen -- though events published while
   * the socket was down are only seen if the relay replays them on the new REQ.
   */
  async subscribeLive(t, n) {
    await this.connect();
    const r = Ue(oe(8));
    return this.subs.set(r, {
      events: [],
      seenIds: /* @__PURE__ */ new Set(),
      verifyBudget: Number.POSITIVE_INFINITY,
      liveWindowStart: Date.now(),
      liveVerifies: 0,
      filter: t,
      onEose: () => {
      },
      onEvent: n
    }), this.send(["REQ", r, t]), {
      close: () => {
        if (this.subs.delete(r))
          try {
            this.send(["CLOSE", r]);
          } catch {
          }
      }
    };
  }
  async queryOnce(t, n = 8e3) {
    await this.connect();
    const r = Ue(oe(8));
    return new Promise((o, i) => {
      const a = [], s = (l) => {
        clearTimeout(c), this.subs.delete(r);
        try {
          this.send(["CLOSE", r]);
        } catch {
        }
        l ? i(l) : o(a);
      }, c = setTimeout(() => s(new Error("relay did not answer the subscription before the timeout")), n);
      this.subs.set(r, {
        events: a,
        seenIds: /* @__PURE__ */ new Set(),
        verifyBudget: jr(t),
        liveWindowStart: 0,
        liveVerifies: 0,
        filter: t,
        onEose: () => s()
      }), this.send(["REQ", r, t]);
    });
  }
}
function Qt(e, t) {
  if (t.ids && !t.ids.some((n) => e.id.startsWith(n)) || t.authors && !t.authors.some((n) => e.pubkey.startsWith(n)) || t.kinds && !t.kinds.includes(e.kind) || t.since !== void 0 && e.created_at < t.since || t.until !== void 0 && e.created_at > t.until)
    return !1;
  for (const [n, r] of Object.entries(t)) {
    if (!n.startsWith("#") || !Array.isArray(r))
      continue;
    const o = n.slice(1), i = r;
    if (!e.tags.some((a) => a[0] === o && i.some((s) => s === (a[1] ?? ""))))
      return !1;
  }
  return !0;
}
class x {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Lt(r, n));
  }
  get relayUrls() {
    return [...this.connections.keys()];
  }
  /** Queries every configured relay and waits for a quorum of responses (or all timeouts) before returning (§16.2). */
  async queryQuorum(t, n = 8e3) {
    const r = [...this.connections.entries()], o = await Promise.all(r.map(async ([s, c]) => {
      try {
        const l = await c.queryOnce(t, n);
        return { relayUrl: s, events: l, responded: !0 };
      } catch (l) {
        return { relayUrl: s, events: [], responded: !1, error: l.message };
      }
    })), i = o.filter((s) => s.responded).length, a = o.length;
    return {
      outcomes: o,
      quorumMet: i >= Math.ceil(a / 2),
      respondedCount: i,
      totalCount: a
    };
  }
  /** Publishes an event to every configured relay, best-effort (§15.6, §24.4). */
  async publishAll(t, n = 8e3) {
    const r = [...this.connections.entries()];
    return Promise.all(r.map(async ([o, i]) => {
      try {
        const a = await i.publish(t, n);
        return { relayUrl: o, result: a };
      } catch (a) {
        return { relayUrl: o, result: { ok: !1, message: a.message } };
      }
    }));
  }
  closeAll() {
    for (const t of this.connections.values())
      t.close();
  }
}
function pe(e) {
  return e.filter((t) => t.result.ok).length;
}
function Fr(e, t, n) {
  return X({ pubkey: _(e), created_at: n, kind: pn, tags: [], content: JSON.stringify(t) }, e);
}
function Hr(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return X({ pubkey: _(e), created_at: n, kind: Et, tags: r, content: "" }, e);
}
function Jr(e, t, n) {
  return X({
    pubkey: _(e),
    created_at: n,
    kind: Pt,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Xr(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function Yr(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function Qr(e) {
  const t = _(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new x(r), [i, a, s] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [pn] }),
    o.queryQuorum({ authors: [t], kinds: [Et] }),
    o.queryQuorum({ authors: [t], kinds: [Pt] })
  ]);
  o.closeAll();
  const c = i.outcomes.some((p) => p.events.length > 0), l = a.outcomes.some((p) => p.events.length > 0), u = s.outcomes.some((p) => p.events.length > 0), y = new x(r);
  let w = null, v = null, g = null;
  const f = [];
  if (!c && (e.name || e.about || e.picture)) {
    const p = Fr(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(y.publishAll(p).then((h) => void (w = h)));
  }
  if (!l) {
    const p = Hr(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    f.push(y.publishAll(p).then((h) => void (v = h)));
  }
  if (!u) {
    const p = Jr(e.everydayPrivateKey, e.dmRelays, n);
    f.push(y.publishAll(p).then((h) => void (g = h)));
  }
  return await Promise.all(f), y.closeAll(), {
    profilePublished: w !== null && pe(w) > 0,
    relayListAcknowledgedCount: v !== null ? pe(v) : 0,
    dmRelayListAcknowledgedCount: g !== null ? pe(g) : 0,
    profileSkippedExisting: c,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function Ke(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), a = pe(i), c = (await e.queryQuorum({ kinds: [ie], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: a,
    readbackVerifiedCount: c,
    success: a >= r && c >= o
  };
}
function Zr(e) {
  const t = br(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function eo(e) {
  return Y(Zr(e));
}
const Fe = [1024, 2048, 4096], ve = 4;
function to(e) {
  const t = ve + e.length, n = Fe.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${Fe[Fe.length - 1]} bytes minus ${ve}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, ve), r;
}
function no(e) {
  if (!Fe.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - ve)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(ve, ve + n), o = e.slice(ve + n);
  for (const i of o)
    if (i !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Ut() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function kn(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Ut().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function _n(e, t, n) {
  const r = mr(), o = await kn(e), i = await Ut().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function En(e, t, n, r) {
  const o = await kn(e);
  try {
    const i = await Ut().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function Pn(e) {
  return Y(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function Kn(e) {
  return Y(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function Mt(e, t, n) {
  const r = eo(e), o = to(r), i = await _n(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: V(i.nonce),
    ciphertext: V(i.ciphertext)
  };
}
async function Ot(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = Q(e.nonce), o = Q(e.ciphertext), i = await En(t, r, o, n), a = no(i);
  return JSON.parse(tt(a));
}
class Dt extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const ro = 1e6, oo = /^[0-9a-f]{64}$/u;
function P(e, t) {
  if (!e)
    throw new Dt(t);
}
function Ye(e) {
  return typeof e == "string" && oo.test(e);
}
function Rn(e) {
  P(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e)
    P(typeof t == "string", "Each relay hint must be a string (§12.4.7)."), P(it(t), `Relay URL must use secure WebSockets, except for an explicit loopback development endpoint (§12.4.7): ${t}`);
}
function An(e) {
  P(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = Q(e);
  } catch {
    throw new Dt("account_id is not valid base64url (§12.4.2).");
  }
  P(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function Nn(e, t) {
  P(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = Q(e);
  P(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), P(Rt(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), P(Ye(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = _(n);
  P(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function Qe(e, t) {
  P(typeof t == "string", `${e} must be a string (§CV5.2).`);
  let n;
  try {
    n = Q(t);
  } catch {
    throw new Dt(`${e} is not valid base64url (§CV5.2).`);
  }
  P(n.length === 32, `${e} must decode to exactly 32 bytes (§CV5.2).`);
}
function io(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (P(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2)."), Qe("connection_vault_root", t), Qe("vault_sudo_key", n));
}
function ao(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (P(t !== void 0, "vault_sudo_key cannot appear without connection_vault_root (§CV5.2)."), Qe("connection_vault_root", t), n !== void 0 && Qe("vault_sudo_key", n));
}
function xn(e, t) {
  P(Number.isInteger(e) && e >= 0 && e <= ro, `${t} is out of supported bounds (§12.4.8).`);
}
function so(e) {
  P(e.schema === nt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), An(e.account_id), xn(e.generation, "generation"), Nn(e.operational_private_key, e.operational_public_key), P(Ye(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), Rn(e.vault_relay_hints), ao(e);
  const t = e.recovery_capsule_event;
  P(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), P(ee(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), P(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function co(e) {
  P(e.schema === Kt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), An(e.account_id), xn(e.recovery_generation, "recovery_generation"), P(e.previous_recovery_event_id === null || Ye(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), Nn(e.operational_private_key, e.operational_public_key), P(Ye(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), Rn(e.vault_relay_hints), io(e);
}
function lo(e) {
  const t = /* @__PURE__ */ new Map();
  for (const r of e) {
    const o = t.get(r.recoveryGeneration);
    if (o && o.eventId !== r.eventId)
      return {
        consistent: !1,
        warning: `Two different recovery capsules both claim generation ${r.recoveryGeneration}: possible fork, replay, or relay misbehavior.`
      };
    t.set(r.recoveryGeneration, r);
  }
  const n = [...e].sort((r, o) => r.recoveryGeneration - o.recoveryGeneration);
  for (let r = 1; r < n.length; r++) {
    const o = n[r];
    if (o.previousRecoveryEventId === null)
      return {
        consistent: !1,
        warning: `Generation ${o.recoveryGeneration} has a null previous-event link but is not the first generation.`
      };
    const i = t.get(o.recoveryGeneration - 1);
    if (!i)
      return {
        consistent: !1,
        warning: `Recovery generation ${o.recoveryGeneration - 1} is missing, so the chain up to generation ${o.recoveryGeneration} cannot be verified.`
      };
    if (o.previousRecoveryEventId !== i.eventId)
      return {
        consistent: !1,
        warning: `Recovery generation chain is broken between generation ${o.recoveryGeneration - 1} and ${o.recoveryGeneration}: possible replay or relay misbehavior.`
      };
  }
  return { consistent: !0 };
}
async function Vt(e) {
  const t = _(e.locatorPrivateKey), n = await Mt(e.payload, e.capsuleKey, Pn(t));
  return X({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: ie,
    tags: [["d", Re]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function uo(e) {
  const t = _(e.oldLocatorPrivateKey);
  return X({
    pubkey: t,
    created_at: e.createdAt,
    kind: ie,
    tags: [["d", Re]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function yo(e, t) {
  if (!ee(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Ot(n, t, Pn(e.pubkey));
  return so(r), r;
}
async function Cn(e) {
  const t = _(e.recoveryPrivateKey), n = await Mt(e.payload, e.capsuleKey, Kn(t));
  return X({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: ie,
    tags: [["d", rt]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function Sn(e, t) {
  if (!ee(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Ot(n, t, Kn(e.pubkey));
  return co(r), r;
}
function Zt(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === ie && At(o, "d") === n && ee(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function In(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [ie], authors: [t], "#d": [n], limit: 5 }, o), a = i.outcomes.flatMap((w) => w.events), s = Zt(a, t, n), c = [];
  for (const w of s)
    try {
      const v = await r(w);
      c.push({ event: w, payload: v });
    } catch (v) {
      c.push({ event: w, payload: null, error: v.message });
    }
  const l = c.find((w) => w.payload !== null) ?? null, u = i.outcomes.map((w) => ({
    responded: w.responded,
    events: Zt(w.events, t, n)
  })).filter((w) => w.responded && w.events.length > 0).map((w) => w.events[0].id), y = new Set(u).size > 1;
  return {
    quorumMet: i.quorumMet,
    respondedCount: i.respondedCount,
    totalCount: i.totalCount,
    candidates: c,
    best: l,
    relayDisagreement: y
  };
}
async function Oe(e, t, n, r = 8e3) {
  return In(e, t, Re, (o) => yo(o, n), r);
}
async function ho(e, t, n, r = 8e3) {
  return In(e, t, rt, (o) => Sn(o, n), r);
}
function po(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : lo(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function fo(e, t, n, r) {
  const [o, i] = await Promise.all([
    e.publishAll(t, r),
    e.publishAll(n, r)
  ]);
  return {
    credentialAcknowledgedCount: pe(o),
    recoveryAcknowledgedCount: pe(i),
    relaysTried: e.relayUrls.length
  };
}
const Tn = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split(`
`);
function vo(e, t, n, r) {
  Er(e);
  const o = Pr({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: a, asyncTick: s } = o;
  if (st(i), st(a), st(s), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = Xt(t), l = Xt(n), u = new Uint8Array(a), y = Nt.create(e, c), w = y._cloneInto().update(l);
  return { c: i, dkLen: a, asyncTick: s, DK: u, PRF: y, PRFSalt: w };
}
function go(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), Kr(o), n;
}
async function wo(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: a, DK: s, PRF: c, PRFSalt: l } = vo(e, t, n, r);
  let u;
  const y = new Uint8Array(4), w = kr(y), v = new Uint8Array(c.outputLen);
  for (let g = 1, f = 0; f < i; g++, f += c.outputLen) {
    const p = s.subarray(f, f + c.outputLen);
    w.setInt32(0, g, !1), (u = l._cloneInto(u)).update(y).digestInto(v), p.set(v.subarray(0, p.length)), await _r(o - 1, a, () => {
      c._cloneInto(u).update(v).digestInto(v);
      for (let h = 0; h < p.length; h++)
        p[h] ^= v[h];
    });
  }
  return go(c, l, s, u, v);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const bo = (e) => e[0] === "あいこくしん";
function Ln(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function Un(e) {
  const t = Ln(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Mn(e) {
  Ar(e, 16, 20, 24, 28, 32);
}
const mo = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([xt(e)[0] >> t << t]);
};
function On(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), je.chain(je.checksum(1, mo), je.radix2(11, !0), je.alphabet(e));
}
function ko(e, t) {
  const { words: n } = Un(e), r = On(t).decode(n);
  return Mn(r), r;
}
function _o(e, t) {
  return Mn(e), On(t).encode(e).join(bo(t) ? "　" : " ");
}
function Eo(e, t) {
  try {
    ko(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const Po = (e) => Ln("mnemonic" + e);
function Ko(e, t = "") {
  return wo(Rr, Un(e).nfkd, Po(t), { c: 2048, dkLen: 64 });
}
function Ro(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return _o(e, Tn);
}
function Ao(e) {
  try {
    return Eo(Dn(e), Tn);
  } catch {
    return !1;
  }
}
function Dn(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function Vn(e) {
  return Ko(Dn(e), "");
}
const qt = Nr.id, De = "aes-256-gcm-v1", Ve = "bitlogin-bip39-hkdf-v1";
async function qn(e) {
  const t = ot(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await Me(e.password, t);
  try {
    const i = _(r), a = new x(e.vaultRelayUrls, {
      authPrivateKey: r
    });
    let s;
    try {
      s = await Oe(a, i, o, e.timeoutMs);
    } finally {
      a.closeAll();
    }
    if (!s.quorumMet)
      throw new de("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
    if (s.candidates.length > 0)
      throw new wn();
    const c = e.everydayPrivateKey !== void 0;
    if (c && !Rt(e.everydayPrivateKey))
      throw new de("The provided key is not a valid secp256k1 private key.");
    const l = Ro(Cr()), u = await Vn(l);
    let y, w;
    try {
      ({ recoveryPrivateKey: y, capsuleKey: w } = fn(u));
    } finally {
      E(u);
    }
    const v = c ? e.everydayPrivateKey : pt(), g = oe(32), f = oe(32);
    let p = !1;
    try {
      const h = _(y), b = _(v), m = V(Sr()), K = {
        schema: Kt,
        account_id: m,
        recovery_generation: 0,
        previous_recovery_event_id: null,
        operational_private_key: V(v),
        operational_public_key: b,
        recovery_public_key: h,
        connection_vault_root: V(g),
        vault_sudo_key: V(f),
        created_at: n,
        vault_relay_hints: e.vaultRelayUrls,
        protocol: {
          capsule_encryption: De,
          recovery_derivation: Ve
        }
      }, C = await Cn({
        recoveryPrivateKey: y,
        capsuleKey: w,
        payload: K
      }), R = new x(e.vaultRelayUrls, {
        authPrivateKey: y
      });
      let A;
      try {
        A = await Ke(R, C, {
          dTag: rt,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        R.closeAll();
      }
      if (!A.success)
        throw new de("The recovery capsule did not reach the required relay acknowledgement and readback quorum. No login credential was published. Please retry, or add more vault relays.");
      const N = {
        schema: nt,
        account_id: m,
        generation: 0,
        operational_private_key: V(v),
        operational_public_key: b,
        recovery_public_key: h,
        recovery_capsule_event: C,
        connection_vault_root: V(g),
        created_at: n,
        vault_relay_hints: e.vaultRelayUrls,
        protocol: {
          password_kdf: qt,
          capsule_encryption: De,
          recovery_derivation: Ve
        }
      }, S = await Vt({
        locatorPrivateKey: r,
        capsuleKey: o,
        payload: N
      }), L = new x(e.vaultRelayUrls, {
        authPrivateKey: r
      });
      let I;
      try {
        I = await Ke(L, S, {
          dTag: Re,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        L.closeAll();
      }
      if (!I.success)
        throw new de("Registration did not reach the required credential acknowledgement and readback quorum. Please retry, or add more vault relays.");
      return p = !0, {
        normalizedLoginName: t,
        recoveryPhrase: l,
        everydayPrivateKey: v,
        everydayPublicKey: b,
        recoveryPublicKey: h,
        locatorPublicKey: i,
        accountId: m,
        imported: c,
        connectionVaultRoot: g,
        vaultSudoKey: f,
        credentialEvent: S,
        recoveryEvent: C,
        credentialPublish: I,
        recoveryPublish: A
      };
    } finally {
      E(y, w), p || (c || E(v), E(g, f));
    }
  } finally {
    E(r, o);
  }
}
async function No(e) {
  const { nsecOrHex: t, ...n } = e, r = Wn(t);
  return qn({ ...n, everydayPrivateKey: r });
}
function Wn(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = xr(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = Ct(t.toLowerCase());
  else
    throw new de("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!Rt(n))
    throw new de("The provided key is not a valid secp256k1 private key.");
  return n;
}
class jn {
  map = /* @__PURE__ */ new Map();
  async get(t) {
    return this.map.get(t);
  }
  async set(t, n) {
    this.map.set(t, n);
  }
  async delete(t) {
    this.map.delete(t);
  }
}
async function xo(e) {
  const t = ot(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await Me(e.password, t), o = _(n), i = new x(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  try {
    const a = await Oe(i, o, r, e.timeoutMs);
    if (!a.quorumMet)
      throw new Pe("quorum-not-met");
    if (!a.best)
      throw new Pe(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const s = a.best.payload, c = e.store ?? new jn(), l = await Tt(c, s.operational_public_key), u = s.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new bn(l.generation, s.generation);
    const y = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${s.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await mn(c, s.operational_public_key, {
      generation: s.generation
    });
    const w = a.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: Q(s.operational_private_key),
      everydayPublicKey: s.operational_public_key,
      recoveryPublicKey: s.recovery_public_key,
      accountId: s.account_id,
      generation: s.generation,
      credentialEvent: a.best.event,
      recoveryCapsuleEvent: s.recovery_capsule_event,
      connectionVaultRoot: s.connection_vault_root ? Q(s.connection_vault_root) : void 0,
      rollbackWarning: y,
      relayDisagreementWarning: w
    };
  } finally {
    i.closeAll();
  }
}
function en(e) {
  return e.filter((t) => ee(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function Co(e) {
  if (!Ao(e.phrase))
    throw new Le("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Vn(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = fn(t);
  E(t);
  const o = _(n), i = new x(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  let a;
  try {
    a = await ho(i, o, r, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (ee(m))
        try {
          f.push({
            event: m,
            payload: await Sn(m, r)
          });
        } catch (K) {
          f.push({
            event: m,
            payload: null,
            error: K.message
          });
        }
    const p = /* @__PURE__ */ new Map();
    for (const m of [...a.candidates, ...f])
      p.set(m.event.id, m);
    const h = [...p.values()].sort((m, K) => K.event.created_at - m.event.created_at), b = h.find((m) => m.payload !== null) ?? null;
    a = {
      ...a,
      candidates: h,
      best: b,
      quorumMet: a.quorumMet || b !== null
    };
  }
  if (!a.quorumMet)
    throw new Pe("quorum-not-met");
  if (!a.best)
    throw new Pe(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = a.best.payload, c = po(a.candidates), l = Q(s.operational_private_key), u = s.operational_public_key, y = [
    .../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...s.vault_relay_hints])
  ], w = new x(y);
  let v = [], g = [];
  try {
    const f = await w.queryQuorum({ kinds: [Et], authors: [u], limit: 5 }, e.timeoutMs), p = en(f.outcomes.flatMap((m) => m.events));
    p && (v = Xr(p));
    const h = await w.queryQuorum({ kinds: [Pt], authors: [u], limit: 5 }, e.timeoutMs), b = en(h.outcomes.flatMap((m) => m.events));
    b && (g = Yr(b));
  } finally {
    w.closeAll();
  }
  return {
    everydayPrivateKey: l,
    everydayPublicKey: u,
    recoveryPrivateKey: n,
    recoveryPublicKey: o,
    recoveryCapsuleKey: r,
    accountId: s.account_id,
    currentRecoveryEvent: a.best.event,
    currentRecoveryPayload: s,
    generalRelays: v,
    dmRelays: g,
    chainWarning: c.consistent ? void 0 : c.warning
  };
}
async function So(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = ot(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root
  } : {}, { locatorPrivateKey: a, capsuleKey: s } = await Me(e.newPassword, n);
  try {
    const c = _(a), l = new x(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let u;
    try {
      u = await Oe(l, c, s, e.timeoutMs);
    } finally {
      l.closeAll();
    }
    if (!u.quorumMet)
      throw new Le("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
    const y = u.best?.payload ?? null, w = y !== null && y.account_id === r.accountId && y.operational_public_key === r.everydayPublicKey && y.recovery_public_key === r.recoveryPublicKey && y.generation === 0 && y.recovery_capsule_event.id === r.currentRecoveryEvent.id;
    if (u.candidates.length > 0 && !w)
      throw new Le("Another account is already registered with that login name and password. Pick a different one.");
    const v = r.currentRecoveryPayload.recovery_generation + 1, g = {
      schema: Kt,
      account_id: r.accountId,
      recovery_generation: v,
      previous_recovery_event_id: r.currentRecoveryEvent.id,
      operational_private_key: V(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      ...o,
      created_at: Je(r.currentRecoveryEvent.created_at, t),
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        capsule_encryption: De,
        recovery_derivation: Ve
      }
    }, f = await Cn({
      recoveryPrivateKey: r.recoveryPrivateKey,
      capsuleKey: r.recoveryCapsuleKey,
      payload: g
    }), p = new x(e.vaultRelayUrls, {
      authPrivateKey: r.recoveryPrivateKey
    });
    let h;
    try {
      h = await Ke(p, f, {
        dTag: rt,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      p.closeAll();
    }
    if (!h.success)
      throw new Le("Could not publish the refreshed recovery capsule to enough relays. No new credential was published; please retry.");
    r.currentRecoveryEvent = f, r.currentRecoveryPayload = g;
    const b = {
      schema: nt,
      account_id: r.accountId,
      generation: 0,
      operational_private_key: V(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      recovery_capsule_event: f,
      ...i,
      // A retry may be repairing a credential that reached only one relay.
      // It must replace that partial event deterministically on every relay.
      created_at: u.best ? Je(u.best.event.created_at, t) : t,
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        password_kdf: qt,
        capsule_encryption: De,
        recovery_derivation: Ve
      }
    }, m = await Vt({
      locatorPrivateKey: a,
      capsuleKey: s,
      payload: b
    }), K = new x(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let C;
    try {
      C = await Ke(K, m, {
        dTag: Re,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      K.closeAll();
    }
    if (!C.success)
      throw new Le("Could not publish the new credential capsule to enough relays. Please retry.");
    return e.store && await Dr(e.store, r.everydayPublicKey, {
      generation: 0,
      recoveryGeneration: v
    }), {
      normalizedLoginName: n,
      locatorPublicKey: c,
      credentialEvent: m,
      refreshedRecoveryEvent: f,
      credentialPublish: C,
      recoveryPublish: h
    };
  } finally {
    E(a, s);
  }
}
function $n(e) {
  const t = _(e.privateKey);
  return X({
    pubkey: t,
    created_at: e.createdAt,
    kind: Ir,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function Io(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = ot(e.loginName), r = await Me(e.oldPassword, n), o = _(r.locatorPrivateKey), i = new x(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  });
  let a;
  try {
    a = await Oe(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!a.quorumMet)
    throw new Pe("quorum-not-met");
  if (!a.best)
    throw new Pe(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = a.best.payload, c = a.best.event, l = e.store ?? new jn(), u = await Tt(l, s.operational_public_key);
  if (s.generation < u.generation && !e.acknowledgeRollback)
    throw new bn(u.generation, s.generation);
  const y = await Me(e.newPassword, n), w = _(y.locatorPrivateKey), v = new x(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  });
  let g;
  try {
    g = await Oe(v, w, y.capsuleKey, e.timeoutMs);
  } finally {
    v.closeAll();
  }
  if (!g.quorumMet)
    throw new de("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (g.candidates.length > 0)
    throw new wn("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = s.generation + 1, p = {
    schema: nt,
    account_id: s.account_id,
    generation: f,
    operational_private_key: s.operational_private_key,
    operational_public_key: s.operational_public_key,
    recovery_public_key: s.recovery_public_key,
    recovery_capsule_event: s.recovery_capsule_event,
    // Carry only the session root. A legacy credential may contain the sudo
    // key, but rotation deliberately scrubs it; personal-tier access remains
    // phrase-gated through the recovery capsule.
    ...s.connection_vault_root !== void 0 ? { connection_vault_root: s.connection_vault_root } : {},
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: qt,
      capsule_encryption: De,
      recovery_derivation: Ve
    }
  }, h = await Vt({
    locatorPrivateKey: y.locatorPrivateKey,
    capsuleKey: y.capsuleKey,
    payload: p
  }), b = new x(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  }), m = await Ke(b, h, {
    dTag: Re,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (b.closeAll(), !m.success)
    throw new de("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const K = uo({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: Je(c.created_at, t)
  }), C = $n({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: c.id,
    deletedEventKind: ie,
    createdAt: t
  }), R = new x(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  }), [A, N] = await Promise.all([
    R.publishAll(K, e.timeoutMs),
    R.publishAll(C, e.timeoutMs)
  ]);
  return R.closeAll(), await mn(l, s.operational_public_key, {
    generation: f
  }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: w,
    newGeneration: f,
    recoveryPublicKey: s.recovery_public_key,
    recoveryCapsuleEvent: s.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: K,
    deletionRequestEvent: C,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: pe(A),
    deletionAcknowledgedCount: pe(N)
  };
}
const To = "bitlogin/connection-vault-root/v1", Lo = "bitlogin/connection-vault-signing/v1", Uo = "bitlogin/connection-record-encryption/v1", Mo = "bitlogin/connection-vault-personal/v1", vt = "bitlogin:connection:";
function Oo(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return St(vn(To), e);
}
function Ne(e) {
  return Tr(e, Lo).scalar;
}
function Bn(e) {
  const t = Ne(e);
  try {
    return _(t);
  } finally {
    E(t);
  }
}
function Do(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return St(vn(Mo), Ae(e, t));
}
function zn(e, t) {
  const n = at(t);
  return We(e, Ae(Y(Uo), new Uint8Array([0]), n), 32);
}
function Vo() {
  return V(oe(16));
}
function at(e) {
  const t = Q(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function Gn(e) {
  return at(e), `${vt}${e}`;
}
function Fn(e) {
  if (!e.startsWith(vt))
    return null;
  const t = e.slice(vt.length);
  try {
    return at(t), t;
  } catch {
    return null;
  }
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function qo(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function tn(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function ct(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function O(e, t, n = "") {
  const r = qo(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const a = n && `"${n}" `, s = i ? ` of length ${t}` : "", c = r ? `length=${o}` : `type=${typeof e}`, l = a + "expected Uint8Array" + s + ", got " + c;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function T(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function be(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const Z = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, Wo = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, jo = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = Wo(e[t]);
  return e;
}, D = Z ? (e) => e : jo;
function $o(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Hn(e, t) {
  if ($o(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function Bo(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const zo = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (O(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      O(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && O(o[1], void 0, "AAD");
    const a = t(r, ...o), s = (u, y) => {
      if (y !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        O(y, void 0, "output");
      }
    };
    let c = !1;
    return {
      encrypt(u, y) {
        if (c)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return c = !0, O(u), s(a.encrypt.length, y), a.encrypt(u, y);
      },
      decrypt(u, y) {
        if (O(u), i && u.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return s(a.decrypt.length, y), a.decrypt(u, y);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Wt(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (O(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !ce(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function ce(e) {
  return e.byteOffset % 4 === 0;
}
function ge(e) {
  return Uint8Array.from(O(e));
}
const Jn = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), Go = D(T(Jn("expand 16-byte k"))), Fo = D(T(Jn("expand 32-byte k")));
function k(e, t) {
  return e << t | e >>> 32 - t;
}
const xe = 64, Ho = 16, gt = 2 ** 32 - 1, nn = /* @__PURE__ */ Uint32Array.of();
function Jo(e, t, n, r, o, i, a, s) {
  const c = o.length, l = new Uint8Array(xe), u = T(l), y = Z && ce(o) && ce(i), w = y ? T(o) : nn, v = y ? T(i) : nn;
  if (!Z) {
    for (let g = 0; g < c; a++) {
      if (e(t, n, r, u, a, s), D(u), a >= gt)
        throw new Error("arx: counter overflow");
      const f = Math.min(xe, c - g);
      for (let p = 0, h; p < f; p++)
        h = g + p, i[h] = o[h] ^ l[p];
      g += f;
    }
    return;
  }
  for (let g = 0; g < c; a++) {
    if (e(t, n, r, u, a, s), a >= gt)
      throw new Error("arx: counter overflow");
    const f = Math.min(xe, c - g);
    if (y && f === xe) {
      const p = g / 4;
      if (g % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < Ho; h++)
        b = p + h, v[b] = w[b] ^ u[h];
      g += xe;
      continue;
    }
    for (let p = 0, h; p < f; p++)
      h = g + p, i[h] = o[h] ^ l[p];
    g += f;
  }
}
function Xo(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: a } = Bo({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return ct(o), ct(a), tn(i), tn(n), (s, c, l, u, y = 0) => {
    O(s, void 0, "key"), O(c, void 0, "nonce"), O(l, void 0, "data");
    const w = l.length;
    if (u = Wt(w, u, !1), ct(y), y < 0 || y >= gt)
      throw new Error("arx: counter overflow");
    const v = [];
    let g = s.length, f, p;
    if (g === 32)
      v.push(f = ge(s)), p = Fo;
    else if (g === 16 && n)
      f = new Uint8Array(32), f.set(s), f.set(s, 16), p = Go, v.push(f);
    else
      throw O(s, 32, "arx key"), new Error("invalid key size");
    (!Z || !ce(c)) && v.push(c = ge(c));
    let h = T(f);
    if (r) {
      if (c.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const K = c.subarray(0, 16);
      if (Z)
        r(p, h, T(K), h);
      else {
        const C = D(Uint32Array.from(p));
        r(C, h, T(K), h), be(C), D(h);
      }
      c = c.subarray(16);
    } else Z || D(h);
    const b = 16 - o;
    if (b !== c.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const K = new Uint8Array(12);
      K.set(c, i ? 0 : 12 - c.length), c = K, v.push(c);
    }
    const m = D(T(c));
    try {
      return Jo(e, p, h, m, l, u, y, a), u;
    } finally {
      be(...v);
    }
  };
}
function Yo(e, t, n, r, o, i = 20) {
  let a = e[0], s = e[1], c = e[2], l = e[3], u = t[0], y = t[1], w = t[2], v = t[3], g = t[4], f = t[5], p = t[6], h = t[7], b = o, m = n[0], K = n[1], C = n[2], R = a, A = s, N = c, S = l, L = u, I = y, q = w, W = v, j = g, $ = f, B = p, z = h, G = b, F = m, H = K, J = C;
  for (let Jt = 0; Jt < i; Jt += 2)
    R = R + L | 0, G = k(G ^ R, 16), j = j + G | 0, L = k(L ^ j, 12), R = R + L | 0, G = k(G ^ R, 8), j = j + G | 0, L = k(L ^ j, 7), A = A + I | 0, F = k(F ^ A, 16), $ = $ + F | 0, I = k(I ^ $, 12), A = A + I | 0, F = k(F ^ A, 8), $ = $ + F | 0, I = k(I ^ $, 7), N = N + q | 0, H = k(H ^ N, 16), B = B + H | 0, q = k(q ^ B, 12), N = N + q | 0, H = k(H ^ N, 8), B = B + H | 0, q = k(q ^ B, 7), S = S + W | 0, J = k(J ^ S, 16), z = z + J | 0, W = k(W ^ z, 12), S = S + W | 0, J = k(J ^ S, 8), z = z + J | 0, W = k(W ^ z, 7), R = R + I | 0, J = k(J ^ R, 16), B = B + J | 0, I = k(I ^ B, 12), R = R + I | 0, J = k(J ^ R, 8), B = B + J | 0, I = k(I ^ B, 7), A = A + q | 0, G = k(G ^ A, 16), z = z + G | 0, q = k(q ^ z, 12), A = A + q | 0, G = k(G ^ A, 8), z = z + G | 0, q = k(q ^ z, 7), N = N + W | 0, F = k(F ^ N, 16), j = j + F | 0, W = k(W ^ j, 12), N = N + W | 0, F = k(F ^ N, 8), j = j + F | 0, W = k(W ^ j, 7), S = S + L | 0, H = k(H ^ S, 16), $ = $ + H | 0, L = k(L ^ $, 12), S = S + L | 0, H = k(H ^ S, 8), $ = $ + H | 0, L = k(L ^ $, 7);
  let U = 0;
  r[U++] = a + R | 0, r[U++] = s + A | 0, r[U++] = c + N | 0, r[U++] = l + S | 0, r[U++] = u + L | 0, r[U++] = y + I | 0, r[U++] = w + q | 0, r[U++] = v + W | 0, r[U++] = g + j | 0, r[U++] = f + $ | 0, r[U++] = p + B | 0, r[U++] = h + z | 0, r[U++] = b + G | 0, r[U++] = m + F | 0, r[U++] = K + H | 0, r[U++] = C + J | 0;
}
const Xn = /* @__PURE__ */ Xo(Yo, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Yn = 2, wt = 1, Qn = 65536, Qo = 4294967295, Zo = 132, ei = 99, bt = 1024 * 1024;
function Ze(e, t) {
  const n = Ae(new Uint8Array([2]), Ct(t)), o = gn.getSharedSecret(e, n, !0).slice(1, 33);
  return St(Y("nip44-v2"), o);
}
function Zn(e, t) {
  if (e.length !== 32)
    throw new Error("NIP-44 conversation key must be exactly 32 bytes.");
  if (t.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const n = We(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function jt(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
const er = 39 + jt(bt) + 32, ti = Math.ceil(er / 3) * 4;
function ni(e) {
  if (e < Qn) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function ri(e) {
  const t = e.length;
  if (t < wt || t > bt)
    throw new Error(`NIP-44 plaintext length must be between ${wt} and ${bt} bytes on this platform.`);
  const n = ni(t), r = jt(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function oi(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < Qn)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < wt || r > Qo || e.length !== o + jt(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function tr(e, t, n) {
  return Nt(xt, e, Ae(t, n));
}
function mt(e, t) {
  return ii(e, t, oe(32));
}
function ii(e, t, n) {
  if (n.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const { chachaKey: r, chachaNonce: o, hmacKey: i } = Zn(e, n), a = ri(Y(t)), s = Xn(r, o, a), c = tr(i, n, s);
  return Ee.encode(Ae(new Uint8Array([Yn]), n, s, c));
}
function $t(e, t) {
  if (t.startsWith("#"))
    throw new Error("Unsupported NIP-44 non-base64 encoding.");
  if (t.length < Zo || t.length > ti)
    throw new Error("NIP-44 payload size is outside this platform's supported range.");
  const n = Ee.decode(t);
  if (n.length < ei || n.length > er)
    throw new Error("NIP-44 decoded payload size is outside this platform's supported range.");
  if (n[0] !== Yn)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33);
  if (r.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const o = n.slice(n.length - 32), i = n.slice(33, n.length - 32), { chachaKey: a, chachaNonce: s, hmacKey: c } = Zn(e, r), l = tr(c, r, i);
  if (!Lr(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = Xn(a, s, i);
  return tt(oi(u));
}
const fe = 16, ai = 283;
function si(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function Bt(e) {
  return e << 1 ^ ai & -(e >> 7);
}
function _e(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = Bt(e);
  return n;
}
const kt = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= Bt(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return be(e), t;
})(), ci = /* @__PURE__ */ kt.map((e, t) => kt.indexOf(t)), li = (e) => e << 24 | e >>> 8, lt = (e) => e << 8 | e >>> 24;
function nr(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(lt), o = r.map(lt), i = o.map(lt), a = new Uint32Array(256 * 256), s = new Uint32Array(256 * 256), c = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const y = l * 256 + u;
      a[y] = n[l] ^ r[u], s[y] = o[l] ^ i[u], c[y] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: c, T0: n, T1: r, T2: o, T3: i, T01: a, T23: s };
}
const zt = /* @__PURE__ */ nr(kt, (e) => _e(e, 3) << 24 | e << 16 | e << 8 | _e(e, 2)), rr = /* @__PURE__ */ nr(ci, (e) => _e(e, 11) << 24 | _e(e, 13) << 16 | _e(e, 9) << 8 | _e(e, 14)), ui = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = Bt(n))
    e[t] = n;
  return e;
})();
function or(e) {
  O(e);
  const t = e.length;
  si(e);
  const { sbox2: n } = zt, r = [];
  (!Z || !ce(e)) && r.push(e = ge(e));
  const o = D(T(e)), i = o.length, a = (c) => re(n, c, c, c, c), s = new Uint32Array(t + 28);
  s.set(o);
  for (let c = i; c < s.length; c++) {
    let l = s[c - 1];
    c % i === 0 ? l = a(li(l)) ^ ui[c / i - 1] : i > 6 && c % i === 4 && (l = a(l)), s[c] = s[c - i] ^ l;
  }
  return be(...r), s;
}
function di(e) {
  const t = or(e), n = t.slice(), r = t.length, { sbox2: o } = zt, { T0: i, T1: a, T2: s, T3: c } = rr;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  be(t);
  for (let l = 4; l < r - 4; l++) {
    const u = n[l], y = re(o, u, u, u, u);
    n[l] = i[y & 255] ^ a[y >>> 8 & 255] ^ s[y >>> 16 & 255] ^ c[y >>> 24];
  }
  return n;
}
function ye(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function re(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function rn(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = zt;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[c++] ^ ye(a, s, t, n, r, o), p = e[c++] ^ ye(a, s, n, r, o, t), h = e[c++] ^ ye(a, s, r, o, t, n), b = e[c++] ^ ye(a, s, o, t, n, r);
    t = f, n = p, r = h, o = b;
  }
  const u = e[c++] ^ re(i, t, n, r, o), y = e[c++] ^ re(i, n, r, o, t), w = e[c++] ^ re(i, r, o, t, n), v = e[c++] ^ re(i, o, t, n, r);
  return { s0: u, s1: y, s2: w, s3: v };
}
function yi(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = rr;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[c++] ^ ye(a, s, t, o, r, n), p = e[c++] ^ ye(a, s, n, t, o, r), h = e[c++] ^ ye(a, s, r, n, t, o), b = e[c++] ^ ye(a, s, o, r, n, t);
    t = f, n = p, r = h, o = b;
  }
  const u = e[c++] ^ re(i, t, o, r, n), y = e[c++] ^ re(i, n, t, o, r), w = e[c++] ^ re(i, r, n, t, o), v = e[c++] ^ re(i, o, r, n, t);
  return { s0: u, s1: y, s2: w, s3: v };
}
function hi(e) {
  if (O(e), e.length % fe !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + fe);
}
function pi(e, t, n) {
  O(e);
  let r = e.length;
  const o = r % fe;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let s = fe - o;
    s || (s = fe), r = r + s;
  }
  n = Wt(r, n), Hn(e, n), (!Z || !ce(e)) && (e = ge(e));
  const i = T(e);
  D(i);
  const a = T(n);
  return { b: i, o: a, out: n };
}
function fi(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (n === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const r = e[n - 1];
  let o = 1;
  o &= r - 1 >>> 31 ^ 1, o &= 16 - r >>> 31 ^ 1;
  for (let i = 0; i < 16; i++) {
    const a = i - r >>> 31, s = (e[n - 1 - i] ^ r) === 0 ? 1 : 0;
    o &= s | a ^ 1;
  }
  if (!o)
    throw new Error("aes/pkcs7: wrong padding");
  return e.subarray(0, n - r);
}
function vi(e) {
  const t = new Uint8Array(16), n = T(t);
  t.set(e);
  const r = fe - e.length;
  for (let o = fe - r; o < fe; o++)
    t[o] = r;
  return n;
}
const ir = /* @__PURE__ */ zo({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, a) {
      const s = or(t), { b: c, o: l, out: u } = pi(i, o, a);
      let y = n;
      const w = [s];
      (!Z || !ce(y)) && w.push(y = ge(y));
      const v = T(y);
      D(v);
      let g = v[0], f = v[1], p = v[2], h = v[3], b = 0;
      for (; b + 4 <= c.length; )
        g ^= c[b + 0], f ^= c[b + 1], p ^= c[b + 2], h ^= c[b + 3], { s0: g, s1: f, s2: p, s3: h } = rn(s, g, f, p, h), l[b++] = g, l[b++] = f, l[b++] = p, l[b++] = h;
      if (o) {
        const m = vi(i.subarray(b * 4));
        D(m), g ^= m[0], f ^= m[1], p ^= m[2], h ^= m[3], { s0: g, s1: f, s2: p, s3: h } = rn(s, g, f, p, h), l[b++] = g, l[b++] = f, l[b++] = p, l[b++] = h;
      }
      return D(l), be(...w), u;
    },
    decrypt(i, a) {
      hi(i);
      const s = di(t);
      let c = n;
      const l = [s];
      (!Z || !ce(c)) && l.push(c = ge(c));
      const u = T(c);
      D(u), a = Wt(i.length, a), Hn(i, a), (!Z || !ce(i)) && l.push(i = ge(i));
      const y = T(i), w = T(a);
      D(y);
      let v = u[0], g = u[1], f = u[2], p = u[3];
      for (let h = 0; h + 4 <= y.length; ) {
        const b = v, m = g, K = f, C = p;
        v = y[h + 0], g = y[h + 1], f = y[h + 2], p = y[h + 3];
        const { s0: R, s1: A, s2: N, s3: S } = yi(s, v, g, f, p);
        w[h++] = R ^ b, w[h++] = A ^ m, w[h++] = N ^ K, w[h++] = S ^ C;
      }
      return D(w), be(...l), fi(a, o);
    }
  };
});
function ar(e, t) {
  const n = Ae(new Uint8Array([2]), Ct(t));
  return gn.getSharedSecret(e, n, !0).slice(1, 33);
}
function gi(e, t, n) {
  return wi(e, t, n, oe(16));
}
function wi(e, t, n, r) {
  if (r.length !== 16)
    throw new Error("NIP-04 iv must be exactly 16 bytes.");
  const o = ar(e, t), i = ir(o, r).encrypt(Y(n));
  return `${Ee.encode(i)}?iv=${Ee.encode(r)}`;
}
function bi(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = Ee.decode(n.slice(0, r)), i = Ee.decode(n.slice(r + 4)), a = ar(e, t), s = ir(a, i).decrypt(o);
  return tt(s);
}
class $e {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = _(t);
  }
  assertAlive() {
    if (this.destroyed)
      throw new Error("This signer has been destroyed (session locked or logged out).");
  }
  getPublicKey() {
    return this.assertAlive(), this.publicKeyHex;
  }
  signEvent(t) {
    return this.assertAlive(), X({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), mt(Ze(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), $t(Ze(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), gi(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), bi(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    E(this.privateKey), this.destroyed = !0;
  }
}
const mi = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band", "wss://nostr.wine", "wss://relay.snort.social"], ki = ["wss://purplepag.es", "wss://relay.nostr.band", "wss://nostr-pub.wellorder.net"], Gt = /^[0-9a-f]{64}$/u, _i = 8, Ei = 4096, Pi = 256, Ki = 512;
class me extends Error {
  name = "BunkerUriParseError";
}
class Ri extends Error {
  name = "Nip46RequestTimeoutError";
  constructor(t, n) {
    super(`The remote signer did not answer ${t} within ${Math.round(n / 1e3)}s. It may be offline, or waiting for your approval on another device -- check your signer and try again.`);
  }
}
class Ai extends Error {
  name = "Nip46ErrorResponse";
}
function Ni(e) {
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    return null;
  }
  const n = t.hostname === "localhost" || t.hostname === "127.0.0.1";
  return t.protocol === "https:" || t.protocol === "http:" && n ? t.toString() : null;
}
function xi(e) {
  if (e.length > Ei)
    throw new me("That bunker URI is unreasonably long.");
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    throw new me("That doesn't look like a valid URI.");
  }
  if (t.protocol !== "bunker:")
    throw new me("A remote-signer URI must start with bunker://");
  const n = (t.host || t.pathname.replace(/^\/+/u, "")).toLowerCase();
  if (!Gt.test(n))
    throw new me("The bunker URI does not name a valid signer public key.");
  const r = [
    ...new Set(t.searchParams.getAll("relay").map((i) => i.trim()).filter((i) => i.length > 0 && i.length <= Ki))
  ].slice(0, _i);
  if (r.length === 0)
    throw new me("The bunker URI names no relays -- without at least one relay= parameter there is no way to reach the signer.");
  const o = t.searchParams.get("secret") ?? void 0;
  if (o && o.length > Pi)
    throw new me("The bunker URI's secret is unreasonably long.");
  return { signerPubkey: n, relayUrls: r, secret: o || void 0 };
}
function Ci(e) {
  if (!Gt.test(e.clientPubkey))
    throw new Error("Client public key must be 64 hex characters.");
  if (e.relayUrls.length === 0)
    throw new Error("At least one relay is required.");
  if (!e.secret)
    throw new Error("A nostrconnect secret is required.");
  const t = new URLSearchParams();
  for (const n of e.relayUrls)
    t.append("relay", n);
  return t.set("secret", e.secret), e.name && t.set("name", e.name), e.perms?.length && t.set("perms", e.perms.join(",")), `nostrconnect://${e.clientPubkey}?${t.toString()}`;
}
const Si = 12e4;
class on {
  clientSecretKey;
  clientPubkey;
  pointer;
  conversationKey;
  conns;
  onAuthUrl;
  requestTimeoutMs;
  pending = /* @__PURE__ */ new Map();
  subs = [];
  startPromise = null;
  userPubkeyKnown = null;
  closed = !1;
  constructor(t) {
    this.clientSecretKey = t.clientSecretKey, this.clientPubkey = _(t.clientSecretKey), this.pointer = t.pointer, this.conversationKey = Ze(t.clientSecretKey, t.pointer.signerPubkey), this.onAuthUrl = t.onAuthUrl, this.requestTimeoutMs = t.requestTimeoutMs ?? Si, this.conns = t.pointer.relayUrls.map((n) => new Lt(n, { authPrivateKey: t.clientSecretKey }));
  }
  /** The user pubkey this session signs for, once get_public_key has answered. */
  get userPublicKey() {
    return this.userPubkeyKnown;
  }
  async start() {
    if (this.closed)
      throw new Error("This signer connection is closed.");
    return this.startPromise || (this.startPromise = (async () => {
      const t = {
        kinds: [Ge],
        authors: [this.pointer.signerPubkey],
        "#p": [this.clientPubkey]
      }, n = await Promise.allSettled(this.conns.map((r) => r.subscribeLive(t, (o) => this.handleResponse(o))));
      if (this.subs = n.filter((r) => r.status === "fulfilled").map((r) => r.value), this.subs.length === 0)
        throw this.startPromise = null, new Error("Could not reach any of the signer's relays.");
    })()), this.startPromise;
  }
  handleResponse(t) {
    if (t.pubkey !== this.pointer.signerPubkey)
      return;
    let n;
    try {
      n = JSON.parse($t(this.conversationKey, t.content));
    } catch {
      return;
    }
    if (typeof n.id != "string")
      return;
    const r = this.pending.get(n.id);
    if (r) {
      if (n.result === "auth_url") {
        if (!r.authUrlSeen && typeof n.error == "string" && n.error) {
          const o = Ni(n.error);
          o && (r.authUrlSeen = !0, this.onAuthUrl?.(o));
        }
        return;
      }
      if (this.pending.delete(n.id), clearTimeout(r.timer), typeof n.error == "string" && n.error) {
        r.reject(new Ai(n.error));
        return;
      }
      if (typeof n.result != "string") {
        r.reject(new Error("The signer returned a malformed response."));
        return;
      }
      r.resolve(n.result);
    }
  }
  async rpc(t, n) {
    await this.start();
    const r = Ue(oe(8)), o = mt(this.conversationKey, JSON.stringify({ id: r, method: t, params: n })), i = [["p", this.pointer.signerPubkey]], a = X({
      pubkey: this.clientPubkey,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Ge,
      tags: i,
      content: o
    }, this.clientSecretKey), s = new Promise((u, y) => {
      const w = setTimeout(() => {
        this.pending.delete(r), y(new Ri(t, this.requestTimeoutMs));
      }, this.requestTimeoutMs);
      this.pending.set(r, { resolve: u, reject: y, timer: w, authUrlSeen: !1 });
    });
    if (s.catch(() => {
    }), !(await Promise.allSettled(this.conns.map((u) => u.publish(a)))).some((u) => u.status === "fulfilled" && u.value.ok)) {
      const u = this.pending.get(r);
      throw u && (this.pending.delete(r), clearTimeout(u.timer)), new Error("No relay accepted the request to the signer.");
    }
    return s;
  }
  /** bunker:// flow: announce ourselves; any non-error answer is acceptance. */
  async connect() {
    await this.rpc("connect", [this.pointer.signerPubkey, this.pointer.secret ?? ""]);
  }
  async getUserPublicKey() {
    const t = (await this.rpc("get_public_key", [])).trim().toLowerCase();
    if (!Gt.test(t))
      throw new Error("The signer returned an invalid public key.");
    return this.userPubkeyKnown = t, t;
  }
  async signEvent(t) {
    const n = this.userPubkeyKnown ? { ...t, pubkey: this.userPubkeyKnown } : t, r = await this.rpc("sign_event", [JSON.stringify(n)]);
    let o;
    try {
      o = JSON.parse(r);
    } catch {
      throw new Error("The signer returned a malformed signed event.");
    }
    if (!ee(o))
      throw new Error("The signer returned an event that does not verify.");
    if (this.userPubkeyKnown && o.pubkey !== this.userPubkeyKnown)
      throw new Error("The signer returned an event signed by a different identity.");
    if (o.kind !== t.kind || o.content !== t.content || o.created_at !== t.created_at || JSON.stringify(o.tags) !== JSON.stringify(t.tags))
      throw new Error("The signer returned a different event than the one requested.");
    return o;
  }
  async nip44Encrypt(t, n) {
    return this.rpc("nip44_encrypt", [t, n]);
  }
  async nip44Decrypt(t, n) {
    return this.rpc("nip44_decrypt", [t, n]);
  }
  async nip04Encrypt(t, n) {
    return this.rpc("nip04_encrypt", [t, n]);
  }
  async nip04Decrypt(t, n) {
    return this.rpc("nip04_decrypt", [t, n]);
  }
  /**
   * Pre-signs the courtesy protocol logout event (current NIP-46 defines
   * logout as exactly that -- a courtesy, never a security boundary). Must
   * run BEFORE close(), while the keys still exist; the caller then closes
   * IMMEDIATELY (local revocation must not wait on the network, BL-26) and
   * delivers the pre-signed event afterward via publishCourtesy().
   */
  buildLogoutEvent() {
    if (this.closed)
      return null;
    try {
      const t = Ue(oe(8)), n = mt(this.conversationKey, JSON.stringify({ id: t, method: "logout", params: [] }));
      return X({
        pubkey: this.clientPubkey,
        created_at: Math.floor(Date.now() / 1e3),
        kind: Ge,
        tags: [["p", this.pointer.signerPubkey]],
        content: n
      }, this.clientSecretKey);
    } catch {
      return null;
    }
  }
  /**
   * Best-effort, bounded delivery of a pre-signed event. Safe (and intended)
   * to run AFTER close(): it needs no key material, and RelayConnection
   * reconnects transiently to publish. Never throws.
   */
  async publishCourtesy(t, n = 2e3) {
    try {
      await Promise.race([
        Promise.allSettled(this.conns.map((r) => r.publish(t))),
        new Promise((r) => setTimeout(r, n))
      ]);
    } catch {
    } finally {
      for (const r of this.conns)
        r.close();
    }
  }
  close() {
    this.closed = !0;
    for (const t of this.subs)
      t.close();
    this.subs = [];
    for (const t of this.conns)
      t.close();
    for (const [, t] of this.pending)
      clearTimeout(t.timer), t.reject(new Error("The signer connection was closed."));
    this.pending.clear(), E(this.clientSecretKey), E(this.conversationKey);
  }
}
async function Ii(e) {
  const t = _(e.clientSecretKey), n = e.timeoutMs, r = e.relayUrls.map((i) => new Lt(i, { authPrivateKey: e.clientSecretKey })), o = () => {
    for (const i of r)
      i.close();
  };
  return new Promise((i, a) => {
    let s = !1;
    const c = () => l(new Error("The signer-connection attempt was cancelled.")), l = (v) => {
      s || (s = !0, clearTimeout(u), e.signal?.removeEventListener("abort", c), o(), v instanceof Error ? a(v) : i(v));
    }, u = setTimeout(() => l(new Error(`No signer connected within ${Math.round(n / 1e3)}s. Scan or paste the connection code in your signer app, then try again.`)), n);
    if (e.signal?.aborted) {
      c();
      return;
    }
    e.signal?.addEventListener("abort", c, { once: !0 });
    const y = { kinds: [Ge], "#p": [t] }, w = (v) => {
      let g, f = null;
      try {
        f = Ze(e.clientSecretKey, v.pubkey), g = JSON.parse($t(f, v.content));
      } catch {
        return;
      } finally {
        f && E(f);
      }
      g.result === e.secret && l({ signerPubkey: v.pubkey });
    };
    Promise.allSettled(r.map((v) => v.subscribeLive(y, w))).then((v) => {
      v.some((g) => g.status === "fulfilled") || l(new Error("Could not reach any relay to listen for the signer."));
    });
  });
}
const sr = "bitlogin.connection.v1", cr = "bitlogin.connection.nwc.v1", an = 120, Ti = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), Li = /* @__PURE__ */ new Set(["connectable", "personal"]);
class ke extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function lr(e, t) {
  return Y(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function ur(e) {
  const t = e, n = (i) => {
    throw new ke(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== sr && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), Li.has(t.tier) || n("tier must be connectable or personal."), Ti.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > an) && n(`label must be a string of at most ${an} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function ut(e) {
  ur(e.record);
  const t = Ne(e.vaultPrk), n = _(t), r = Gn(e.record.connection_id), o = zn(e.recordPrk, e.record.connection_id), i = await Mt(e.record, o, lr(n, r));
  return X({
    pubkey: n,
    created_at: Je(e.previousCreatedAt, e.now),
    kind: ie,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function Ui(e, t, n) {
  if (!ee(e))
    throw new ke("Connection record event has an invalid id or signature.");
  const r = _(Ne(t));
  if (e.pubkey !== r)
    throw new ke("Connection record event is not signed by this vault's identity.");
  const o = At(e, "d") ?? "", i = Fn(o);
  if (i === null)
    throw new ke("Connection record event has a malformed d tag.");
  const a = JSON.parse(e.content), s = lr(e.pubkey, o), c = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const l of c) {
    let u;
    try {
      u = await Ot(a, zn(l.prk, i), s);
    } catch {
      continue;
    }
    if (ur(u), u.connection_id !== i)
      throw new ke("Connection record id does not match its d tag.");
    if (u.tier !== l.tier)
      throw new ke("Connection record tier does not match the key that decrypted it.");
    return { record: u, tier: l.tier, event: e };
  }
  return null;
}
function Mi(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const et = /^[0-9a-f]{64}$/u;
class le extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function sn(e) {
  const t = e.trim();
  if (!/^nostr\+walletconnect:\/\//iu.test(t))
    throw new le("Not an NWC URI: it must start with nostr+walletconnect://");
  let n;
  try {
    n = new URL(t.replace(/^nostr\+walletconnect:\/\//iu, "http://"));
  } catch {
    throw new le("The NWC URI is malformed.");
  }
  const r = n.hostname.toLowerCase();
  if (!et.test(r))
    throw new le("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let a = null, s = null;
  for (const [c, l] of n.searchParams.entries())
    if (c === "relay") {
      if (!it(l))
        throw new le("An NWC relay must use secure WebSockets, except for an explicit loopback development endpoint.");
      o.push(l);
    } else if (c === "secret") {
      const u = l.toLowerCase();
      if (!et.test(u))
        throw new le("The NWC URI's secret is not a 64-char hex client key.");
      a = u;
    } else c === "lud16" ? s = l : i.push([c, l]);
  if (o.length === 0)
    throw new le("The NWC URI names no relay.");
  if (a === null)
    throw new le("The NWC URI carries no secret.");
  return {
    schema: cr,
    wallet_pubkey: r,
    relays: o,
    secret: a,
    lud16: s,
    extra_params: i
  };
}
function Oi(e) {
  dr(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function Di(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function dr(e) {
  const t = e, n = (r) => {
    throw new le(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== cr && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !et.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), t.relays.some((r) => !it(r)) && n("NWC relays must use secure WebSockets, except for explicit loopback development endpoints."), (typeof t.secret != "string" || !et.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
const Vi = "bitlogin:vault-hwm:v2:", qi = "bitlogin/vault-hwm-index/v2", yr = "bitlogin/vault-hwm-encryption/v2", Wi = /^[0-9a-f]{64}$/u;
class he extends Error {
  constructor() {
    super("The local Connection Vault rollback marker is invalid or has been tampered with."), this.name = "RecordHighWaterMarkError";
  }
}
function Ft(e) {
  if (!e || typeof e != "object")
    return !1;
  const t = e;
  return Number.isInteger(t.createdAt) && (t.createdAt ?? -1) >= 0 && typeof t.eventId == "string" && Wi.test(t.eventId);
}
function hr(e, t) {
  at(t);
  const n = We(e, qi, 32), r = Y(t);
  try {
    return `${Vi}${V(Nt(xt, n, r))}`;
  } finally {
    E(n, r);
  }
}
function ji(e, t) {
  return `bitlogin:vault-hwm:${Bn(e)}:${t}`;
}
async function $i(e, t, n) {
  const r = We(e, yr, 32), o = Y(JSON.stringify(n)), i = Y(t);
  try {
    const a = await _n(r, o, i), s = {
      v: 2,
      nonce: V(a.nonce),
      ciphertext: V(a.ciphertext)
    };
    return JSON.stringify(s);
  } finally {
    E(r, o, i);
  }
}
async function Bi(e, t, n) {
  const r = We(e, yr, 32), o = Y(t);
  let i;
  try {
    const a = JSON.parse(n);
    if (a.v !== 2 || typeof a.nonce != "string" || typeof a.ciphertext != "string")
      throw new he();
    i = await En(r, Q(a.nonce), Q(a.ciphertext), o);
    const s = JSON.parse(tt(i));
    if (!Ft(s))
      throw new he();
    return s;
  } catch (a) {
    throw a instanceof he ? a : new he();
  } finally {
    E(r, o), i && E(i);
  }
}
async function pr(e, t, n, r) {
  const o = hr(t, n);
  await e.set(o, await $i(t, o, r));
}
async function fr(e, t, n) {
  const r = hr(t, n), o = await e.get(r);
  if (o !== void 0)
    return Bi(t, r, o);
  const i = ji(t, n), a = await e.get(i);
  if (a === void 0)
    return null;
  try {
    const s = JSON.parse(a);
    if (!Ft(s))
      throw new he();
    return await pr(e, t, n, s), await e.delete(i), s;
  } catch (s) {
    throw s instanceof he ? s : new he();
  }
}
async function vr(e, t, n, r) {
  if (!Ft(r))
    throw new he();
  const o = await fr(e, t, n);
  o && ft({ created_at: r.createdAt, id: r.eventId }, { created_at: o.createdAt, id: o.eventId }) <= 0 || await pr(e, t, n, r);
}
async function zi(e) {
  const t = Ne(e.vaultPrk), n = new x(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await Ke(n, e.event, {
      dTag: Gn(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll(), E(t);
  }
  return r.success && await vr(e.store, e.vaultPrk, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const cn = 500;
async function Gi(e) {
  const t = Ne(e.vaultPrk), n = _(t), r = new x(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [ie], authors: [n], limit: cn }, e.timeoutMs);
  } finally {
    r.closeAll(), E(t);
  }
  const i = o.outcomes.some((l) => l.events.length >= cn), a = /* @__PURE__ */ new Map();
  for (const l of o.outcomes.flatMap((u) => u.events)) {
    if (!ee(l) || l.pubkey !== n)
      continue;
    const u = Fn(At(l, "d") ?? "");
    if (u === null)
      continue;
    const y = a.get(u);
    (!y || ft(l, y) > 0) && a.set(u, l);
  }
  const s = /* @__PURE__ */ new Map(), c = [];
  for (const [l, u] of a) {
    const y = await fr(e.store, e.vaultPrk, l);
    if (y !== null && ft(u, {
      created_at: y.createdAt,
      id: y.eventId
    }) < 0) {
      c.push(l);
      continue;
    }
    s.set(l, u), await vr(e.store, e.vaultPrk, l, {
      createdAt: u.created_at,
      eventId: u.id
    });
  }
  return {
    events: s,
    rollbackWarnings: c,
    quorumMet: o.quorumMet,
    respondedCount: o.respondedCount,
    truncated: i
  };
}
class Fi {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = Oo(this.connectionVaultRoot), this.vaultPublicKey = Bn(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = Do(this.connectionVaultRoot, t), E(t);
  }
  /** Closes the sudo window and wipes the personal-tier key material. */
  endSudo() {
    this.personalPrk && E(this.personalPrk), this.personalPrk = null;
  }
  /**
   * Wipes everything this session holds, permanently.
   *
   * The ROOT is wiped too, not just the derived prk: the root regenerates the
   * prk and (with a sudo key) the personal prk, so leaving it live made
   * "wipes everything" false. And the session is marked destroyed rather than
   * merely zeroed, because a zeroed prk is not inert -- deriveRecordKey and
   * deriveVaultSigningKey over 32 zero bytes are deterministic, WORLD-
   * COMPUTABLE values. A stale reference calling createConnection() after
   * teardown would otherwise seal a wallet secret under a key any observer
   * can derive, sign it with a publicly known identity, and report success.
   * Failing loudly is the only safe behaviour.
   */
  destroy() {
    this.endSudo(), E(this.vaultPrk, this.connectionVaultRoot), this.destroyed = !0;
  }
  prkForTier(t) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    if (t === "connectable")
      return this.vaultPrk;
    if (!this.personalPrk)
      throw new Error("Personal-tier records require an open sudo window (enableSudo).");
    return this.personalPrk;
  }
  /** Builds a fresh record + its signed event. Purely local; publish separately. */
  async createConnection(t) {
    const n = t.now ?? Math.floor(Date.now() / 1e3), r = {
      schema: sr,
      connection_id: Vo(),
      connection_type: t.connection_type,
      tier: t.tier,
      state: "active",
      label: t.label,
      created_at: n,
      updated_at: n,
      credential: t.credential,
      application_binding: t.application_binding ?? {
        origin: null,
        app_pubkey: null
      },
      notes: t.notes ?? null
    }, o = await ut({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(t.tier),
      record: r,
      now: n
    });
    return { record: r, event: o };
  }
  /** Replaces a record's content. The tier is immutable — moving a secret
   *  between tiers is a delete-and-recreate, never a silent re-encryption. */
  async updateConnection(t, n, r) {
    const o = r ?? Math.floor(Date.now() / 1e3), i = {
      ...t.record,
      ...n,
      tier: t.record.tier,
      connection_id: t.record.connection_id,
      created_at: t.record.created_at,
      updated_at: o
    }, a = await ut({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(i.tier),
      record: i,
      previousCreatedAt: t.event.created_at,
      now: o
    });
    return { record: i, event: a };
  }
  /** §CV11 step 2: the encrypted tombstone replacement. */
  async deleteConnection(t, n) {
    const r = n ?? Math.floor(Date.now() / 1e3), o = Mi(t.record, r), i = await ut({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(o.tier),
      record: o,
      previousCreatedAt: t.event.created_at,
      now: r
    });
    return { record: o, event: i };
  }
  /** Trial-decrypts one event; personal-tier records resolve only inside a sudo window. */
  decryptEvent(t) {
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : Ui(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return $n({
      privateKey: Ne(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: ie,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return zi({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return Gi({ vaultPrk: this.vaultPrk, ...t });
  }
  /**
   * Fetches and decrypts everything decryptable right now. Outside a sudo
   * window the personal tier is simply absent from the result — invisible,
   * not erroring, exactly like the app-facing API contract.
   */
  async listConnections(t) {
    const n = await this.fetchEvents(t);
    if (!n.quorumMet && !t.acknowledgeIncompleteQuorum)
      throw new Error("Not enough vault relays answered to list your connections reliably. Check your connection and retry.");
    const r = [], o = [];
    for (const i of n.events.values())
      try {
        const a = await this.decryptEvent(i);
        a && r.push(a);
      } catch {
        o.push(i.id);
      }
    return r.sort((i, a) => a.record.updated_at - i.record.updated_at), {
      connections: r,
      rollbackWarnings: n.rollbackWarnings,
      unreadable: o,
      truncated: n.truncated,
      quorumMet: n.quorumMet
    };
  }
}
const Hi = "bitlogin", ue = "kv", te = "device-keys", Ji = 2;
function Xi() {
  return new Promise((e, t) => {
    const n = indexedDB.open(Hi, Ji);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(ue) || r.createObjectStore(ue), r.objectStoreNames.contains(te) || r.createObjectStore(te);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class Yi {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Xi()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(ue, "readonly").objectStore(ue).get(t);
      a.onsuccess = () => r(a.result), a.onerror = () => o(a.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, i) => {
      const a = r.transaction(ue, "readwrite");
      a.objectStore(ue).put(n, t), a.oncomplete = () => o(), a.onerror = () => i(a.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(ue, "readwrite");
      i.objectStore(ue).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
  /**
   * Returns a non-extractable AES-GCM key kept by the browser's IndexedDB
   * implementation. The key is deliberately separate from the string-only KV
   * API so callers cannot accidentally serialize it as application data.
   */
  async getOrCreateDeviceKey(t) {
    const n = await this.db(), r = await new Promise((i, a) => {
      const s = n.transaction(te, "readonly").objectStore(te).get(t);
      s.onsuccess = () => i(s.result), s.onerror = () => a(s.error);
    });
    if (r) return r;
    const o = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      !1,
      ["encrypt", "decrypt"]
    );
    try {
      return await new Promise((i, a) => {
        const s = n.transaction(te, "readwrite");
        s.objectStore(te).add(o, t), s.oncomplete = () => i(), s.onerror = () => a(s.error);
      }), o;
    } catch {
      const i = await new Promise((a, s) => {
        const c = n.transaction(te, "readonly").objectStore(te).get(t);
        c.onsuccess = () => a(c.result), c.onerror = () => s(c.error);
      });
      if (i) return i;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(te, "readwrite");
      i.objectStore(te).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
}
const qe = "bitlogin:session:v1", Ht = "bitlogin:session-device-key:v1";
function ln(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function un(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function dn(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function Qi(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function Zi(e, t) {
  const n = {
    everydayPrivateKeyHex: Array.from(t.everydayPrivateKey, (r) => r.toString(16).padStart(2, "0")).join(""),
    accountId: t.accountId,
    recoveryPublicKey: t.recoveryPublicKey,
    activeCredentialEvent: t.activeCredentialEvent,
    activeRecoveryEvent: t.activeRecoveryEvent,
    ...t.connectionVaultRoot ? {
      connectionVaultRootHex: Array.from(
        t.connectionVaultRoot,
        (r) => r.toString(16).padStart(2, "0")
      ).join("")
    } : {},
    ...t.vaultEnabled !== void 0 ? { vaultEnabled: t.vaultEnabled } : {}
  };
  try {
    if (typeof e.getOrCreateDeviceKey != "function") {
      await e.delete(qe);
      return;
    }
    const r = await e.getOrCreateDeviceKey(Ht), o = crypto.getRandomValues(new Uint8Array(12)), i = new TextEncoder().encode(JSON.stringify(n)), a = await crypto.subtle.encrypt({ name: "AES-GCM", iv: o }, r, i), s = {
      v: 2,
      iv: ln(o),
      ciphertext: ln(new Uint8Array(a))
    };
    await e.set(qe, JSON.stringify(s));
  } catch {
  }
}
async function ea(e) {
  let t;
  try {
    t = await e.get(qe);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    if (!Qi(n) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(qe), null;
    const r = await e.getOrCreateDeviceKey(Ht), o = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: dn(un(n.iv)) },
      r,
      dn(un(n.ciphertext))
    ), i = JSON.parse(new TextDecoder().decode(o));
    return typeof i.everydayPrivateKeyHex != "string" || typeof i.accountId != "string" || typeof i.recoveryPublicKey != "string" || !i.activeCredentialEvent || !i.activeRecoveryEvent ? null : {
      everydayPrivateKey: Uint8Array.from(
        i.everydayPrivateKeyHex.match(/.{1,2}/g) || [],
        (a) => Number.parseInt(a, 16)
      ),
      accountId: i.accountId,
      recoveryPublicKey: i.recoveryPublicKey,
      activeCredentialEvent: i.activeCredentialEvent,
      activeRecoveryEvent: i.activeRecoveryEvent,
      ...typeof i.connectionVaultRootHex == "string" ? {
        connectionVaultRoot: Uint8Array.from(
          i.connectionVaultRootHex.match(/.{1,2}/g) || [],
          (a) => Number.parseInt(a, 16)
        )
      } : {},
      ...typeof i.vaultEnabled == "boolean" ? { vaultEnabled: i.vaultEnabled } : {}
    };
  } catch {
    return null;
  }
}
async function ta(e) {
  try {
    await e.delete(qe), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(Ht);
  } catch {
  }
}
class na {
  tail = Promise.resolve();
  run(t) {
    const n = this.tail.then(t, t);
    return this.tail = n.then(
      () => {
      },
      () => {
      }
    ), n;
  }
}
const d = {
  signer: null,
  everydayPrivateKey: null,
  accountId: null,
  recoveryPublicKey: null,
  activeCredentialEvent: null,
  activeRecoveryEvent: null,
  pendingRecovery: null,
  connectionVaultRoot: null,
  vaultKnown: !1,
  vault: null
};
let M = [...mi], dt = [...ki];
const ne = new Yi(), ra = new na();
function ae() {
  if (!d.signer || !d.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: d.signer, everydayPrivateKey: d.everydayPrivateKey };
}
function Ce() {
  d.signer?.destroy(), d.everydayPrivateKey && d.everydayPrivateKey.fill(0), d.signer = null, d.everydayPrivateKey = null, d.accountId = null, d.recoveryPublicKey = null, d.activeCredentialEvent = null, d.activeRecoveryEvent = null, d.vault?.destroy(), d.vault = null, d.connectionVaultRoot && d.connectionVaultRoot.fill(0), d.connectionVaultRoot = null, d.vaultKnown = !1, d.pendingRecovery && (d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery.everydayPrivateKey.fill(0), d.pendingRecovery = null);
}
function yt(e, t) {
  d.connectionVaultRoot = e ?? null, d.vaultKnown = !0, d.vault = null, t && E(t);
}
async function Be() {
  !d.everydayPrivateKey || !d.accountId || !d.recoveryPublicKey || !d.activeCredentialEvent || !d.activeRecoveryEvent || await Zi(ne, {
    everydayPrivateKey: d.everydayPrivateKey,
    accountId: d.accountId,
    recoveryPublicKey: d.recoveryPublicKey,
    activeCredentialEvent: d.activeCredentialEvent,
    activeRecoveryEvent: d.activeRecoveryEvent,
    ...d.connectionVaultRoot ? { connectionVaultRoot: d.connectionVaultRoot } : {},
    ...d.vaultKnown ? { vaultEnabled: d.connectionVaultRoot !== null } : {}
  });
}
function Se() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function _t() {
  if (!d.signer) throw new Error("No identity is unlocked in this session.");
  if (!d.connectionVaultRoot)
    throw new Error(
      d.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return d.vault ??= new Fi(d.connectionVaultRoot.slice()), d.vault;
}
function Ie(e) {
  const { record: t } = e, n = {
    connectionId: t.connection_id,
    connectionType: t.connection_type,
    label: t.label,
    state: t.state,
    origin: t.application_binding.origin,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
  if (t.connection_type === "nwc" && t.state !== "deleted") {
    const r = t.credential;
    n.walletPubkey = r.wallet_pubkey, n.relayCount = r.relays?.length;
  }
  return n;
}
async function He() {
  const e = _t(), t = await e.listConnections({ relayUrls: M, store: ne });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings,
    unreadable: t.unreadable,
    truncated: t.truncated,
    quorumMet: t.quorumMet
  };
}
async function ht(e) {
  const { vault: t, connections: n } = await He(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
let we = null, se = null;
function yn(e) {
  self.postMessage({ notify: "nip46-auth-url", url: e });
}
function Te() {
  if (!we) throw new Error("No remote signer is connected.");
  return we;
}
function ze() {
  se && (se.abort.abort(), E(se.clientSecretKey), se = null);
}
function gr(e) {
  const t = e.buildLogoutEvent();
  e.close(), t && e.publishCourtesy(t);
}
function hn(e, t) {
  we && gr(we.client), we = { client: e, userPubkey: t };
}
async function oa(e, t) {
  switch (e) {
    case "nip46Connect": {
      const r = xi(t.uri), o = new on({
        clientSecretKey: pt(),
        pointer: r,
        onAuthUrl: yn
      });
      try {
        await o.connect();
        const i = await o.getUserPublicKey();
        return hn(o, i), ze(), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46NostrconnectStart": {
      const n = t, r = M.slice(0, 2);
      ze();
      const o = pt(), i = Ue(oe(16));
      return se = { clientSecretKey: o, relayUrls: r, secret: i, abort: new AbortController() }, { uri: Ci({
        clientPubkey: _(o),
        relayUrls: r,
        secret: i,
        name: n.appName?.trim() || "BitLogin",
        perms: ["sign_event", "nip44_encrypt", "nip44_decrypt", "nip04_encrypt", "nip04_decrypt"]
      }) };
    }
    case "nip46NostrconnectAwait": {
      const n = se;
      if (!n) throw new Error("No signer-connection attempt is in progress.");
      let r;
      try {
        ({ signerPubkey: r } = await Ii({
          clientSecretKey: n.clientSecretKey,
          relayUrls: n.relayUrls,
          secret: n.secret,
          timeoutMs: 18e4,
          signal: n.abort.signal
        }));
      } catch (i) {
        throw se === n && ze(), i;
      }
      if (se !== n) throw new Error("This signer-connection attempt was superseded.");
      se = null;
      const o = new on({
        clientSecretKey: n.clientSecretKey,
        pointer: { signerPubkey: r, relayUrls: n.relayUrls },
        onAuthUrl: yn
      });
      try {
        const i = await o.getUserPublicKey();
        return hn(o, i), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46SignEvent": {
      const n = t;
      return Te().client.signEvent({
        kind: n.kind,
        content: n.content,
        tags: n.tags ?? [],
        created_at: n.created_at ?? Math.floor(Date.now() / 1e3)
      });
    }
    case "nip46Nip44Encrypt": {
      const n = t;
      return { ciphertext: await Te().client.nip44Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip44Decrypt": {
      const n = t;
      return { plaintext: await Te().client.nip44Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Nip04Encrypt": {
      const n = t;
      return { ciphertext: await Te().client.nip04Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip04Decrypt": {
      const n = t;
      return { plaintext: await Te().client.nip04Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Disconnect": {
      const n = we;
      return we = null, ze(), n && gr(n.client), {};
    }
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (M = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (dt = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await No({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: M }) : await qn({ loginName: n.loginName, password: n.password, vaultRelayUrls: M });
      return Ce(), d.signer = new $e(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryEvent, yt(r.connectionVaultRoot, r.vaultSudoKey), await Be(), {
        recoveryPhrase: r.recoveryPhrase,
        everydayPublicKey: r.everydayPublicKey,
        recoveryPublicKey: r.recoveryPublicKey,
        accountId: r.accountId,
        imported: r.imported,
        credentialEventId: r.credentialEvent.id,
        recoveryEventId: r.recoveryEvent.id
      };
    }
    case "previewImportKey": {
      const r = Wn(t.nsecOrHex), o = _(r), i = { everydayPublicKey: o, npub: Yt(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await xo({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: M,
        store: ne,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return Ce(), d.signer = new $e(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryCapsuleEvent, yt(r.connectionVaultRoot, r.vaultSudoKey), await Be(), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await Co({
        phrase: n.phrase,
        vaultRelayUrls: M,
        discoveryRelayUrls: dt,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return Ce(), d.pendingRecovery = r, d.signer = new $e(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.currentRecoveryEvent, yt(
        r.currentRecoveryPayload.connection_vault_root ? Q(r.currentRecoveryPayload.connection_vault_root) : void 0
      ), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generalRelays: r.generalRelays,
        dmRelays: r.dmRelays,
        chainWarning: r.chainWarning
      };
    }
    case "completeRecovery": {
      const n = t;
      if (!d.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await So({
        recovered: d.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: M,
        store: ne
      });
      return d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.refreshedRecoveryEvent, d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery = null, await Be(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await Io({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: M,
        store: ne,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return d.activeCredentialEvent = r.newCredentialEvent, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.recoveryCapsuleEvent, await Be(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = ae();
      return Qr({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: dt
      });
    }
    case "getPublicKey": {
      const { signer: n } = ae();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = ae(), r = t;
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = ae(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = ae(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = ae(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = ae(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = ae();
      return { nsec: Mr(n), npub: Yt(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (ae(), !d.recoveryPublicKey || !d.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return Ur({
        recoveryPublicKeyHex: d.recoveryPublicKey,
        vaultRelayUrls: M,
        recoveryCapsuleEvents: [d.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const n = new x(M), r = await fo(n, d.activeCredentialEvent, d.activeRecoveryEvent);
      return n.closeAll(), r;
    }
    case "getSessionStatus":
      return { unlocked: !!d.signer, everydayPublicKey: d.signer?.getPublicKey() };
    // Called once, right after "configure", before the widget renders its welcome
    // screen -- restores whatever persistSession() last cached for this origin, so
    // a page reload doesn't ask for the login name + password again. A missing or
    // corrupt cache is not an error: it just means the widget falls through to its
    // normal welcome screen, exactly like it always has.
    case "restoreSession": {
      const n = await ea(ne);
      return n ? (Ce(), d.signer = new $e(n.everydayPrivateKey), d.everydayPrivateKey = n.everydayPrivateKey, d.accountId = n.accountId, d.recoveryPublicKey = n.recoveryPublicKey, d.activeCredentialEvent = n.activeCredentialEvent, d.activeRecoveryEvent = n.activeRecoveryEvent, d.connectionVaultRoot = n.connectionVaultRoot ?? null, d.vaultKnown = n.vaultEnabled !== void 0, { restored: !0, everydayPublicKey: d.signer.getPublicKey(), accountId: n.accountId }) : { restored: !1 };
    }
    case "logout":
      return Ce(), await ta(ne), {};
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return d.signer ? d.connectionVaultRoot ? { enabled: !0, vaultPublicKey: _t().vaultPublicKey } : { enabled: !1, reason: d.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a } = await He();
      return { connections: n.map(Ie), rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a };
    }
    case "vaultSaveNwc": {
      const n = t, r = Se(), o = _t(), i = sn(n.uri), a = n.label.trim().slice(0, 120) || "Wallet connection", { record: s, event: c } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: a,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: c,
        connectionId: s.connection_id,
        relayUrls: M,
        store: ne
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const u = await o.decryptEvent(c);
      return Ie(u);
    }
    case "vaultFindForOrigin": {
      const n = Se(), { connections: r } = await He(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? Ie(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await ht(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== Se())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return dr(i), { uri: Oi(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await ht(n.connectionId), i = n.origin === null ? null : Se(), { record: a, event: s } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: s,
        connectionId: a.connection_id,
        relayUrls: M,
        store: ne
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const l = await r.decryptEvent(s);
      return Ie(l);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await ht(n.connectionId), { record: i, event: a } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: a,
        connectionId: i.connection_id,
        relayUrls: M,
        store: ne
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const c = r.buildDeletionRequest(o.event.id), l = new x(M);
        await l.publishAll(c), l.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = Se(), o = sn(n.uri), { connections: i } = await He(), a = i.find(
        (s) => s.record.connection_type === "nwc" && Di(s.record.credential, o)
      );
      return a ? a.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: Ie(a) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const ia = /* @__PURE__ */ new Set([
  "configure",
  "register",
  "previewImportKey",
  "login",
  "recover",
  "completeRecovery",
  "changePassword",
  "publishProfileAndRelayLists",
  "getPublicKey",
  "signEvent",
  "nip44Encrypt",
  "nip44Decrypt",
  "nip04Encrypt",
  "nip04Decrypt",
  "exportIdentity",
  "buildRecoveryExport",
  "repairReplicas",
  "getSessionStatus",
  "restoreSession",
  "logout",
  "vaultStatus",
  "vaultList",
  "vaultSaveNwc",
  "vaultFindForOrigin",
  "vaultRevealNwc",
  "vaultSetBinding",
  "vaultDelete",
  "vaultOfferCheck",
  "nip46Connect",
  "nip46NostrconnectStart",
  "nip46NostrconnectAwait",
  "nip46SignEvent",
  "nip46Nip44Encrypt",
  "nip46Nip44Decrypt",
  "nip46Nip04Encrypt",
  "nip46Nip04Decrypt",
  "nip46Disconnect"
]);
self.addEventListener("message", (e) => {
  const t = e.data;
  if (!t || typeof t != "object" || typeof t.id != "string") return;
  if (typeof t.action != "string" || !ia.has(t.action)) {
    const a = {
      id: t.id,
      ok: !1,
      error: `Unknown worker action: ${String(t.action)}`,
      errorName: "Error"
    };
    self.postMessage(a);
    return;
  }
  const { id: n, action: r, payload: o } = e.data;
  (r.startsWith("nip46") ? (a) => a() : (a) => ra.run(a))(() => oa(r, o)).then(
    (a) => {
      const s = { id: n, ok: !0, result: a };
      self.postMessage(s);
    },
    (a) => {
      const s = a instanceof Error ? a : new Error(String(a)), c = { id: n, ok: !1, error: s.message, errorName: s.name };
      self.postMessage(c);
    }
  );
});
