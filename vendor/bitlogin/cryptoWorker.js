import { v as ae, g as k, s as ne, b as er, c as be, K as tr, d as Yt, f as yt, h as ht, j as re, u as Y, k as nr, l as rr, m as V, n as X, o as Ge, S as pt, q as ft, t as Fe, D as Ee, w as He, x as vt, y as or, z as ir, A as ar, B as cr, C as Qe, F as Mt, G as gt, H as sr, I as lr, J as ur, L as Ue, M as wt, N as dr, O as yr, P as bt, Q as Je, T as Se, U as hr, V as Xt, W as x, X as pr, Y as fr, Z as vr, _ as mt, $ as Qt, a0 as Pe, a1 as gr, a2 as Me, a3 as Zt, a4 as me, a5 as wr, a6 as it, a7 as br, a as Ut, a8 as mr } from "./bitlogin-shared-DTz11m56.js";
class _e extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class le extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class en extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class Ne extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class tn extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function We(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const _r = { generation: -1, recoveryGeneration: -1 };
function _t(e) {
  return `bitlogin:hwm:${e}`;
}
async function kt(e, t) {
  const n = await e.get(_t(t));
  return n ? JSON.parse(n) : _r;
}
async function nn(e, t, n) {
  const r = await kt(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(_t(t), JSON.stringify(o)), o;
}
async function kr(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set(_t(t), JSON.stringify(n));
}
function Er(e) {
  const t = e.split(".");
  if (t.length !== 4 || t.some((r) => !/^\d{1,3}$/u.test(r)))
    return !1;
  const n = t.map(Number);
  return n.every((r) => r >= 0 && r <= 255) && n[0] === 127;
}
function Ye(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.username || t.password || t.hash ? !1 : t.protocol === "wss:" ? !0 : t.protocol !== "ws:" ? !1 : t.hostname === "localhost" || t.hostname === "[::1]" || Er(t.hostname);
}
function Pr() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
class Kr {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    if (!Ye(t))
      throw new Error("Relay URL must use secure WebSockets, except for an explicit loopback development endpoint.");
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = Pr(), o = new r(this.url);
      this.ws = o;
      const i = setTimeout(() => {
        n(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(i), t();
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
      const c = this.subs.get(i);
      c && ae(a) && Rr(a, c.filter) && c.events.push(a);
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
      const [i, a, c] = o;
      if (typeof i != "string" || typeof a != "boolean" || c !== void 0 && typeof c != "string")
        return;
      this.pendingPublishes.get(i)?.({ ok: a, message: c ?? "" }), this.pendingPublishes.delete(i);
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
    const n = k(this.authPrivateKey), r = ne({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: tr,
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
  async queryOnce(t, n = 8e3) {
    await this.connect();
    const r = er(be(8));
    return new Promise((o, i) => {
      const a = [], c = (l) => {
        clearTimeout(s), this.subs.delete(r), this.send(["CLOSE", r]), l ? i(l) : o(a);
      }, s = setTimeout(() => c(new Error("relay did not answer the subscription before the timeout")), n);
      this.subs.set(r, { events: a, filter: t, onEose: () => c() }), this.send(["REQ", r, t]);
    });
  }
}
function Rr(e, t) {
  if (t.ids && !t.ids.some((n) => e.id.startsWith(n)) || t.authors && !t.authors.some((n) => e.pubkey.startsWith(n)) || t.kinds && !t.kinds.includes(e.kind) || t.since !== void 0 && e.created_at < t.since || t.until !== void 0 && e.created_at > t.until)
    return !1;
  for (const [n, r] of Object.entries(t)) {
    if (!n.startsWith("#") || !Array.isArray(r))
      continue;
    const o = n.slice(1), i = r;
    if (!e.tags.some((a) => a[0] === o && i.some((c) => c === (a[1] ?? ""))))
      return !1;
  }
  return !0;
}
class C {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Kr(r, n));
  }
  get relayUrls() {
    return [...this.connections.keys()];
  }
  /** Queries every configured relay and waits for a quorum of responses (or all timeouts) before returning (§16.2). */
  async queryQuorum(t, n = 8e3) {
    const r = [...this.connections.entries()], o = await Promise.all(r.map(async ([c, s]) => {
      try {
        const l = await s.queryOnce(t, n);
        return { relayUrl: c, events: l, responded: !0 };
      } catch (l) {
        return { relayUrl: c, events: [], responded: !1, error: l.message };
      }
    })), i = o.filter((c) => c.responded).length, a = o.length;
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
function ye(e) {
  return e.filter((t) => t.result.ok).length;
}
function Ar(e, t, n) {
  return ne({ pubkey: k(e), created_at: n, kind: Yt, tags: [], content: JSON.stringify(t) }, e);
}
function xr(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return ne({ pubkey: k(e), created_at: n, kind: yt, tags: r, content: "" }, e);
}
function Cr(e, t, n) {
  return ne({
    pubkey: k(e),
    created_at: n,
    kind: ht,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Nr(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function Sr(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function Ir(e) {
  const t = k(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new C(r), [i, a, c] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [Yt] }),
    o.queryQuorum({ authors: [t], kinds: [yt] }),
    o.queryQuorum({ authors: [t], kinds: [ht] })
  ]);
  o.closeAll();
  const s = i.outcomes.some((p) => p.events.length > 0), l = a.outcomes.some((p) => p.events.length > 0), u = c.outcomes.some((p) => p.events.length > 0), y = new C(r);
  let v = null, w = null, g = null;
  const f = [];
  if (!s && (e.name || e.about || e.picture)) {
    const p = Ar(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(y.publishAll(p).then((h) => void (v = h)));
  }
  if (!l) {
    const p = xr(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    f.push(y.publishAll(p).then((h) => void (w = h)));
  }
  if (!u) {
    const p = Cr(e.everydayPrivateKey, e.dmRelays, n);
    f.push(y.publishAll(p).then((h) => void (g = h)));
  }
  return await Promise.all(f), y.closeAll(), {
    profilePublished: v !== null && ye(v) > 0,
    relayListAcknowledgedCount: w !== null ? ye(w) : 0,
    dmRelayListAcknowledgedCount: g !== null ? ye(g) : 0,
    profileSkippedExisting: s,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function ke(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), a = ye(i), s = (await e.queryQuorum({ kinds: [re], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: a,
    readbackVerifiedCount: s,
    success: a >= r && s >= o
  };
}
function Tr(e) {
  const t = nr(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function Lr(e) {
  return Y(Tr(e));
}
const qe = [1024, 2048, 4096], pe = 4;
function Or(e) {
  const t = pe + e.length, n = qe.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${qe[qe.length - 1]} bytes minus ${pe}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, pe), r;
}
function Mr(e) {
  if (!qe.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - pe)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(pe, pe + n), o = e.slice(pe + n);
  for (const i of o)
    if (i !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Et() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function rn(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Et().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function on(e, t, n) {
  const r = rr(), o = await rn(e), i = await Et().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function an(e, t, n, r) {
  const o = await rn(e);
  try {
    const i = await Et().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function cn(e) {
  return Y(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function sn(e) {
  return Y(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function Pt(e, t, n) {
  const r = Lr(e), o = Or(r), i = await on(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: V(i.nonce),
    ciphertext: V(i.ciphertext)
  };
}
async function Kt(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = X(e.nonce), o = X(e.ciphertext), i = await an(t, r, o, n), a = Mr(i);
  return JSON.parse(Ge(a));
}
class Rt extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const Ur = 1e6, Dr = /^[0-9a-f]{64}$/u;
function E(e, t) {
  if (!e)
    throw new Rt(t);
}
function $e(e) {
  return typeof e == "string" && Dr.test(e);
}
function ln(e) {
  E(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e)
    E(typeof t == "string", "Each relay hint must be a string (§12.4.7)."), E(Ye(t), `Relay URL must use secure WebSockets, except for an explicit loopback development endpoint (§12.4.7): ${t}`);
}
function un(e) {
  E(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = X(e);
  } catch {
    throw new Rt("account_id is not valid base64url (§12.4.2).");
  }
  E(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function dn(e, t) {
  E(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = X(e);
  E(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), E(ft(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), E($e(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = k(n);
  E(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function ze(e, t) {
  E(typeof t == "string", `${e} must be a string (§CV5.2).`);
  let n;
  try {
    n = X(t);
  } catch {
    throw new Rt(`${e} is not valid base64url (§CV5.2).`);
  }
  E(n.length === 32, `${e} must decode to exactly 32 bytes (§CV5.2).`);
}
function Vr(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (E(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2)."), ze("connection_vault_root", t), ze("vault_sudo_key", n));
}
function qr(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (E(t !== void 0, "vault_sudo_key cannot appear without connection_vault_root (§CV5.2)."), ze("connection_vault_root", t), n !== void 0 && ze("vault_sudo_key", n));
}
function yn(e, t) {
  E(Number.isInteger(e) && e >= 0 && e <= Ur, `${t} is out of supported bounds (§12.4.8).`);
}
function jr(e) {
  E(e.schema === Fe, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), un(e.account_id), yn(e.generation, "generation"), dn(e.operational_private_key, e.operational_public_key), E($e(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), ln(e.vault_relay_hints), qr(e);
  const t = e.recovery_capsule_event;
  E(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), E(ae(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), E(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Wr(e) {
  E(e.schema === pt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), un(e.account_id), yn(e.recovery_generation, "recovery_generation"), E(e.previous_recovery_event_id === null || $e(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), dn(e.operational_private_key, e.operational_public_key), E($e(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), ln(e.vault_relay_hints), Vr(e);
}
function $r(e) {
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
async function At(e) {
  const t = k(e.locatorPrivateKey), n = await Pt(e.payload, e.capsuleKey, cn(t));
  return ne({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: re,
    tags: [["d", Ee]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function zr(e) {
  const t = k(e.oldLocatorPrivateKey);
  return ne({
    pubkey: t,
    created_at: e.createdAt,
    kind: re,
    tags: [["d", Ee]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Br(e, t) {
  if (!ae(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Kt(n, t, cn(e.pubkey));
  return jr(r), r;
}
async function hn(e) {
  const t = k(e.recoveryPrivateKey), n = await Pt(e.payload, e.capsuleKey, sn(t));
  return ne({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: re,
    tags: [["d", He]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function pn(e, t) {
  if (!ae(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Kt(n, t, sn(e.pubkey));
  return Wr(r), r;
}
function Dt(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === re && vt(o, "d") === n && ae(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function fn(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [re], authors: [t], "#d": [n], limit: 5 }, o), a = i.outcomes.flatMap((v) => v.events), c = Dt(a, t, n), s = [];
  for (const v of c)
    try {
      const w = await r(v);
      s.push({ event: v, payload: w });
    } catch (w) {
      s.push({ event: v, payload: null, error: w.message });
    }
  const l = s.find((v) => v.payload !== null) ?? null, u = i.outcomes.map((v) => ({
    responded: v.responded,
    events: Dt(v.events, t, n)
  })).filter((v) => v.responded && v.events.length > 0).map((v) => v.events[0].id), y = new Set(u).size > 1;
  return {
    quorumMet: i.quorumMet,
    respondedCount: i.respondedCount,
    totalCount: i.totalCount,
    candidates: s,
    best: l,
    relayDisagreement: y
  };
}
async function Ie(e, t, n, r = 8e3) {
  return fn(e, t, Ee, (o) => Br(o, n), r);
}
async function Gr(e, t, n, r = 8e3) {
  return fn(e, t, He, (o) => pn(o, n), r);
}
function Fr(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : $r(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function Hr(e, t, n, r) {
  const [o, i] = await Promise.all([
    e.publishAll(t, r),
    e.publishAll(n, r)
  ]);
  return {
    credentialAcknowledgedCount: ye(o),
    recoveryAcknowledgedCount: ye(i),
    relaysTried: e.relayUrls.length
  };
}
const vn = `abandon
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
function Jr(e, t, n, r) {
  ar(e);
  const o = cr({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: a, asyncTick: c } = o;
  if (Qe(i), Qe(a), Qe(c), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const s = Mt(t), l = Mt(n), u = new Uint8Array(a), y = gt.create(e, s), v = y._cloneInto().update(l);
  return { c: i, dkLen: a, asyncTick: c, DK: u, PRF: y, PRFSalt: v };
}
function Yr(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), sr(o), n;
}
async function Xr(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: a, DK: c, PRF: s, PRFSalt: l } = Jr(e, t, n, r);
  let u;
  const y = new Uint8Array(4), v = or(y), w = new Uint8Array(s.outputLen);
  for (let g = 1, f = 0; f < i; g++, f += s.outputLen) {
    const p = c.subarray(f, f + s.outputLen);
    v.setInt32(0, g, !1), (u = l._cloneInto(u)).update(y).digestInto(w), p.set(w.subarray(0, p.length)), await ir(o - 1, a, () => {
      s._cloneInto(u).update(w).digestInto(w);
      for (let h = 0; h < p.length; h++)
        p[h] ^= w[h];
    });
  }
  return Yr(s, l, c, u, w);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const Qr = (e) => e[0] === "あいこくしん";
function gn(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function wn(e) {
  const t = gn(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function bn(e) {
  ur(e, 16, 20, 24, 28, 32);
}
const Zr = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([wt(e)[0] >> t << t]);
};
function mn(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), Ue.chain(Ue.checksum(1, Zr), Ue.radix2(11, !0), Ue.alphabet(e));
}
function eo(e, t) {
  const { words: n } = wn(e), r = mn(t).decode(n);
  return bn(r), r;
}
function to(e, t) {
  return bn(e), mn(t).encode(e).join(Qr(t) ? "　" : " ");
}
function no(e, t) {
  try {
    eo(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const ro = (e) => gn("mnemonic" + e);
function oo(e, t = "") {
  return Xr(lr, wn(e).nfkd, ro(t), { c: 2048, dkLen: 64 });
}
function io(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return to(e, vn);
}
function ao(e) {
  try {
    return no(_n(e), vn);
  } catch {
    return !1;
  }
}
function _n(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function kn(e) {
  return oo(_n(e), "");
}
const xt = dr.id, Te = "aes-256-gcm-v1", Le = "bitlogin-bip39-hkdf-v1";
async function En(e) {
  const t = Je(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await Se(e.password, t);
  try {
    const i = k(r), a = new C(e.vaultRelayUrls, {
      authPrivateKey: r
    });
    let c;
    try {
      c = await Ie(a, i, o, e.timeoutMs);
    } finally {
      a.closeAll();
    }
    if (!c.quorumMet)
      throw new le("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
    if (c.candidates.length > 0)
      throw new en();
    const s = e.everydayPrivateKey !== void 0;
    if (s && !ft(e.everydayPrivateKey))
      throw new le("The provided key is not a valid secp256k1 private key.");
    const l = io(hr()), u = await kn(l);
    let y, v;
    try {
      ({ recoveryPrivateKey: y, capsuleKey: v } = Xt(u));
    } finally {
      x(u);
    }
    const w = s ? e.everydayPrivateKey : pr(), g = be(32), f = be(32);
    let p = !1;
    try {
      const h = k(y), b = k(w), m = V(fr()), P = {
        schema: pt,
        account_id: m,
        recovery_generation: 0,
        previous_recovery_event_id: null,
        operational_private_key: V(w),
        operational_public_key: b,
        recovery_public_key: h,
        connection_vault_root: V(g),
        vault_sudo_key: V(f),
        created_at: n,
        vault_relay_hints: e.vaultRelayUrls,
        protocol: {
          capsule_encryption: Te,
          recovery_derivation: Le
        }
      }, N = await hn({
        recoveryPrivateKey: y,
        capsuleKey: v,
        payload: P
      }), K = new C(e.vaultRelayUrls, {
        authPrivateKey: y
      });
      let R;
      try {
        R = await ke(K, N, {
          dTag: He,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        K.closeAll();
      }
      if (!R.success)
        throw new le("The recovery capsule did not reach the required relay acknowledgement and readback quorum. No login credential was published. Please retry, or add more vault relays.");
      const A = {
        schema: Fe,
        account_id: m,
        generation: 0,
        operational_private_key: V(w),
        operational_public_key: b,
        recovery_public_key: h,
        recovery_capsule_event: N,
        connection_vault_root: V(g),
        created_at: n,
        vault_relay_hints: e.vaultRelayUrls,
        protocol: {
          password_kdf: xt,
          capsule_encryption: Te,
          recovery_derivation: Le
        }
      }, S = await At({
        locatorPrivateKey: r,
        capsuleKey: o,
        payload: A
      }), L = new C(e.vaultRelayUrls, {
        authPrivateKey: r
      });
      let I;
      try {
        I = await ke(L, S, {
          dTag: Ee,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        L.closeAll();
      }
      if (!I.success)
        throw new le("Registration did not reach the required credential acknowledgement and readback quorum. Please retry, or add more vault relays.");
      return p = !0, {
        normalizedLoginName: t,
        recoveryPhrase: l,
        everydayPrivateKey: w,
        everydayPublicKey: b,
        recoveryPublicKey: h,
        locatorPublicKey: i,
        accountId: m,
        imported: s,
        connectionVaultRoot: g,
        vaultSudoKey: f,
        credentialEvent: S,
        recoveryEvent: N,
        credentialPublish: I,
        recoveryPublish: R
      };
    } finally {
      x(y, v), p || (s || x(w), x(g, f));
    }
  } finally {
    x(r, o);
  }
}
async function co(e) {
  const { nsecOrHex: t, ...n } = e, r = Pn(t);
  return En({ ...n, everydayPrivateKey: r });
}
function Pn(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = yr(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = bt(t.toLowerCase());
  else
    throw new le("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!ft(n))
    throw new le("The provided key is not a valid secp256k1 private key.");
  return n;
}
class Kn {
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
async function so(e) {
  const t = Je(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await Se(e.password, t), o = k(n), i = new C(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  try {
    const a = await Ie(i, o, r, e.timeoutMs);
    if (!a.quorumMet)
      throw new _e("quorum-not-met");
    if (!a.best)
      throw new _e(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const c = a.best.payload, s = e.store ?? new Kn(), l = await kt(s, c.operational_public_key), u = c.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new tn(l.generation, c.generation);
    const y = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${c.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await nn(s, c.operational_public_key, {
      generation: c.generation
    });
    const v = a.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: X(c.operational_private_key),
      everydayPublicKey: c.operational_public_key,
      recoveryPublicKey: c.recovery_public_key,
      accountId: c.account_id,
      generation: c.generation,
      credentialEvent: a.best.event,
      recoveryCapsuleEvent: c.recovery_capsule_event,
      connectionVaultRoot: c.connection_vault_root ? X(c.connection_vault_root) : void 0,
      rollbackWarning: y,
      relayDisagreementWarning: v
    };
  } finally {
    i.closeAll();
  }
}
function Vt(e) {
  return e.filter((t) => ae(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function lo(e) {
  if (!ao(e.phrase))
    throw new Ne("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await kn(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = Xt(t);
  x(t);
  const o = k(n), i = new C(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  let a;
  try {
    a = await Gr(i, o, r, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (ae(m))
        try {
          f.push({
            event: m,
            payload: await pn(m, r)
          });
        } catch (P) {
          f.push({
            event: m,
            payload: null,
            error: P.message
          });
        }
    const p = /* @__PURE__ */ new Map();
    for (const m of [...a.candidates, ...f])
      p.set(m.event.id, m);
    const h = [...p.values()].sort((m, P) => P.event.created_at - m.event.created_at), b = h.find((m) => m.payload !== null) ?? null;
    a = {
      ...a,
      candidates: h,
      best: b,
      quorumMet: a.quorumMet || b !== null
    };
  }
  if (!a.quorumMet)
    throw new _e("quorum-not-met");
  if (!a.best)
    throw new _e(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = a.best.payload, s = Fr(a.candidates), l = X(c.operational_private_key), u = c.operational_public_key, y = [
    .../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...c.vault_relay_hints])
  ], v = new C(y);
  let w = [], g = [];
  try {
    const f = await v.queryQuorum({ kinds: [yt], authors: [u], limit: 5 }, e.timeoutMs), p = Vt(f.outcomes.flatMap((m) => m.events));
    p && (w = Nr(p));
    const h = await v.queryQuorum({ kinds: [ht], authors: [u], limit: 5 }, e.timeoutMs), b = Vt(h.outcomes.flatMap((m) => m.events));
    b && (g = Sr(b));
  } finally {
    v.closeAll();
  }
  return {
    everydayPrivateKey: l,
    everydayPublicKey: u,
    recoveryPrivateKey: n,
    recoveryPublicKey: o,
    recoveryCapsuleKey: r,
    accountId: c.account_id,
    currentRecoveryEvent: a.best.event,
    currentRecoveryPayload: c,
    generalRelays: w,
    dmRelays: g,
    chainWarning: s.consistent ? void 0 : s.warning
  };
}
async function uo(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Je(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root
  } : {}, { locatorPrivateKey: a, capsuleKey: c } = await Se(e.newPassword, n);
  try {
    const s = k(a), l = new C(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let u;
    try {
      u = await Ie(l, s, c, e.timeoutMs);
    } finally {
      l.closeAll();
    }
    if (!u.quorumMet)
      throw new Ne("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
    const y = u.best?.payload ?? null, v = y !== null && y.account_id === r.accountId && y.operational_public_key === r.everydayPublicKey && y.recovery_public_key === r.recoveryPublicKey && y.generation === 0 && y.recovery_capsule_event.id === r.currentRecoveryEvent.id;
    if (u.candidates.length > 0 && !v)
      throw new Ne("Another account is already registered with that login name and password. Pick a different one.");
    const w = r.currentRecoveryPayload.recovery_generation + 1, g = {
      schema: pt,
      account_id: r.accountId,
      recovery_generation: w,
      previous_recovery_event_id: r.currentRecoveryEvent.id,
      operational_private_key: V(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      ...o,
      created_at: We(r.currentRecoveryEvent.created_at, t),
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        capsule_encryption: Te,
        recovery_derivation: Le
      }
    }, f = await hn({
      recoveryPrivateKey: r.recoveryPrivateKey,
      capsuleKey: r.recoveryCapsuleKey,
      payload: g
    }), p = new C(e.vaultRelayUrls, {
      authPrivateKey: r.recoveryPrivateKey
    });
    let h;
    try {
      h = await ke(p, f, {
        dTag: He,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      p.closeAll();
    }
    if (!h.success)
      throw new Ne("Could not publish the refreshed recovery capsule to enough relays. No new credential was published; please retry.");
    r.currentRecoveryEvent = f, r.currentRecoveryPayload = g;
    const b = {
      schema: Fe,
      account_id: r.accountId,
      generation: 0,
      operational_private_key: V(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      recovery_capsule_event: f,
      ...i,
      // A retry may be repairing a credential that reached only one relay.
      // It must replace that partial event deterministically on every relay.
      created_at: u.best ? We(u.best.event.created_at, t) : t,
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        password_kdf: xt,
        capsule_encryption: Te,
        recovery_derivation: Le
      }
    }, m = await At({
      locatorPrivateKey: a,
      capsuleKey: c,
      payload: b
    }), P = new C(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let N;
    try {
      N = await ke(P, m, {
        dTag: Ee,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      P.closeAll();
    }
    if (!N.success)
      throw new Ne("Could not publish the new credential capsule to enough relays. Please retry.");
    return e.store && await kr(e.store, r.everydayPublicKey, {
      generation: 0,
      recoveryGeneration: w
    }), {
      normalizedLoginName: n,
      locatorPublicKey: s,
      credentialEvent: m,
      refreshedRecoveryEvent: f,
      credentialPublish: N,
      recoveryPublish: h
    };
  } finally {
    x(a, c);
  }
}
function Rn(e) {
  const t = k(e.privateKey);
  return ne({
    pubkey: t,
    created_at: e.createdAt,
    kind: vr,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function yo(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Je(e.loginName), r = await Se(e.oldPassword, n), o = k(r.locatorPrivateKey), i = new C(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  });
  let a;
  try {
    a = await Ie(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!a.quorumMet)
    throw new _e("quorum-not-met");
  if (!a.best)
    throw new _e(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = a.best.payload, s = a.best.event, l = e.store ?? new Kn(), u = await kt(l, c.operational_public_key);
  if (c.generation < u.generation && !e.acknowledgeRollback)
    throw new tn(u.generation, c.generation);
  const y = await Se(e.newPassword, n), v = k(y.locatorPrivateKey), w = new C(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  });
  let g;
  try {
    g = await Ie(w, v, y.capsuleKey, e.timeoutMs);
  } finally {
    w.closeAll();
  }
  if (!g.quorumMet)
    throw new le("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (g.candidates.length > 0)
    throw new en("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = c.generation + 1, p = {
    schema: Fe,
    account_id: c.account_id,
    generation: f,
    operational_private_key: c.operational_private_key,
    operational_public_key: c.operational_public_key,
    recovery_public_key: c.recovery_public_key,
    recovery_capsule_event: c.recovery_capsule_event,
    // Carry only the session root. A legacy credential may contain the sudo
    // key, but rotation deliberately scrubs it; personal-tier access remains
    // phrase-gated through the recovery capsule.
    ...c.connection_vault_root !== void 0 ? { connection_vault_root: c.connection_vault_root } : {},
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: xt,
      capsule_encryption: Te,
      recovery_derivation: Le
    }
  }, h = await At({
    locatorPrivateKey: y.locatorPrivateKey,
    capsuleKey: y.capsuleKey,
    payload: p
  }), b = new C(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  }), m = await ke(b, h, {
    dTag: Ee,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (b.closeAll(), !m.success)
    throw new le("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const P = zr({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: We(s.created_at, t)
  }), N = Rn({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: s.id,
    deletedEventKind: re,
    createdAt: t
  }), K = new C(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  }), [R, A] = await Promise.all([
    K.publishAll(P, e.timeoutMs),
    K.publishAll(N, e.timeoutMs)
  ]);
  return K.closeAll(), await nn(l, c.operational_public_key, {
    generation: f
  }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: v,
    newGeneration: f,
    recoveryPublicKey: c.recovery_public_key,
    recoveryCapsuleEvent: c.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: P,
    deletionRequestEvent: N,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: ye(R),
    deletionAcknowledgedCount: ye(A)
  };
}
const ho = "bitlogin/connection-vault-root/v1", po = "bitlogin/connection-vault-signing/v1", fo = "bitlogin/connection-record-encryption/v1", vo = "bitlogin/connection-vault-personal/v1", at = "bitlogin:connection:";
function go(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return mt(Qt(ho), e);
}
function Ke(e) {
  return gr(e, po).scalar;
}
function An(e) {
  const t = Ke(e);
  try {
    return k(t);
  } finally {
    x(t);
  }
}
function wo(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return mt(Qt(vo), Pe(e, t));
}
function xn(e, t) {
  const n = Xe(t);
  return Me(e, Pe(Y(fo), new Uint8Array([0]), n), 32);
}
function bo() {
  return V(be(16));
}
function Xe(e) {
  const t = X(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function Cn(e) {
  return Xe(e), `${at}${e}`;
}
function Nn(e) {
  if (!e.startsWith(at))
    return null;
  const t = e.slice(at.length);
  try {
    return Xe(t), t;
  } catch {
    return null;
  }
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function mo(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function qt(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Ze(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function M(e, t, n = "") {
  const r = mo(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const a = n && `"${n}" `, c = i ? ` of length ${t}` : "", s = r ? `length=${o}` : `type=${typeof e}`, l = a + "expected Uint8Array" + c + ", got " + s;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function T(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function ve(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const Q = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, _o = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, ko = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = _o(e[t]);
  return e;
}, U = Q ? (e) => e : ko;
function Eo(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Sn(e, t) {
  if (Eo(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function Po(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const Ko = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (M(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      M(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && M(o[1], void 0, "AAD");
    const a = t(r, ...o), c = (u, y) => {
      if (y !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        M(y, void 0, "output");
      }
    };
    let s = !1;
    return {
      encrypt(u, y) {
        if (s)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return s = !0, M(u), c(a.encrypt.length, y), a.encrypt(u, y);
      },
      decrypt(u, y) {
        if (M(u), i && u.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return c(a.decrypt.length, y), a.decrypt(u, y);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Ct(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (M(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !ie(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function ie(e) {
  return e.byteOffset % 4 === 0;
}
function fe(e) {
  return Uint8Array.from(M(e));
}
const In = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), Ro = U(T(In("expand 16-byte k"))), Ao = U(T(In("expand 32-byte k")));
function _(e, t) {
  return e << t | e >>> 32 - t;
}
const Re = 64, xo = 16, ct = 2 ** 32 - 1, jt = /* @__PURE__ */ Uint32Array.of();
function Co(e, t, n, r, o, i, a, c) {
  const s = o.length, l = new Uint8Array(Re), u = T(l), y = Q && ie(o) && ie(i), v = y ? T(o) : jt, w = y ? T(i) : jt;
  if (!Q) {
    for (let g = 0; g < s; a++) {
      if (e(t, n, r, u, a, c), U(u), a >= ct)
        throw new Error("arx: counter overflow");
      const f = Math.min(Re, s - g);
      for (let p = 0, h; p < f; p++)
        h = g + p, i[h] = o[h] ^ l[p];
      g += f;
    }
    return;
  }
  for (let g = 0; g < s; a++) {
    if (e(t, n, r, u, a, c), a >= ct)
      throw new Error("arx: counter overflow");
    const f = Math.min(Re, s - g);
    if (y && f === Re) {
      const p = g / 4;
      if (g % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < xo; h++)
        b = p + h, w[b] = v[b] ^ u[h];
      g += Re;
      continue;
    }
    for (let p = 0, h; p < f; p++)
      h = g + p, i[h] = o[h] ^ l[p];
    g += f;
  }
}
function No(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: a } = Po({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Ze(o), Ze(a), qt(i), qt(n), (c, s, l, u, y = 0) => {
    M(c, void 0, "key"), M(s, void 0, "nonce"), M(l, void 0, "data");
    const v = l.length;
    if (u = Ct(v, u, !1), Ze(y), y < 0 || y >= ct)
      throw new Error("arx: counter overflow");
    const w = [];
    let g = c.length, f, p;
    if (g === 32)
      w.push(f = fe(c)), p = Ao;
    else if (g === 16 && n)
      f = new Uint8Array(32), f.set(c), f.set(c, 16), p = Ro, w.push(f);
    else
      throw M(c, 32, "arx key"), new Error("invalid key size");
    (!Q || !ie(s)) && w.push(s = fe(s));
    let h = T(f);
    if (r) {
      if (s.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const P = s.subarray(0, 16);
      if (Q)
        r(p, h, T(P), h);
      else {
        const N = U(Uint32Array.from(p));
        r(N, h, T(P), h), ve(N), U(h);
      }
      s = s.subarray(16);
    } else Q || U(h);
    const b = 16 - o;
    if (b !== s.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const P = new Uint8Array(12);
      P.set(s, i ? 0 : 12 - s.length), s = P, w.push(s);
    }
    const m = U(T(s));
    try {
      return Co(e, p, h, m, l, u, y, a), u;
    } finally {
      ve(...w);
    }
  };
}
function So(e, t, n, r, o, i = 20) {
  let a = e[0], c = e[1], s = e[2], l = e[3], u = t[0], y = t[1], v = t[2], w = t[3], g = t[4], f = t[5], p = t[6], h = t[7], b = o, m = n[0], P = n[1], N = n[2], K = a, R = c, A = s, S = l, L = u, I = y, q = v, j = w, W = g, $ = f, z = p, B = h, G = b, F = m, H = P, J = N;
  for (let Ot = 0; Ot < i; Ot += 2)
    K = K + L | 0, G = _(G ^ K, 16), W = W + G | 0, L = _(L ^ W, 12), K = K + L | 0, G = _(G ^ K, 8), W = W + G | 0, L = _(L ^ W, 7), R = R + I | 0, F = _(F ^ R, 16), $ = $ + F | 0, I = _(I ^ $, 12), R = R + I | 0, F = _(F ^ R, 8), $ = $ + F | 0, I = _(I ^ $, 7), A = A + q | 0, H = _(H ^ A, 16), z = z + H | 0, q = _(q ^ z, 12), A = A + q | 0, H = _(H ^ A, 8), z = z + H | 0, q = _(q ^ z, 7), S = S + j | 0, J = _(J ^ S, 16), B = B + J | 0, j = _(j ^ B, 12), S = S + j | 0, J = _(J ^ S, 8), B = B + J | 0, j = _(j ^ B, 7), K = K + I | 0, J = _(J ^ K, 16), z = z + J | 0, I = _(I ^ z, 12), K = K + I | 0, J = _(J ^ K, 8), z = z + J | 0, I = _(I ^ z, 7), R = R + q | 0, G = _(G ^ R, 16), B = B + G | 0, q = _(q ^ B, 12), R = R + q | 0, G = _(G ^ R, 8), B = B + G | 0, q = _(q ^ B, 7), A = A + j | 0, F = _(F ^ A, 16), W = W + F | 0, j = _(j ^ W, 12), A = A + j | 0, F = _(F ^ A, 8), W = W + F | 0, j = _(j ^ W, 7), S = S + L | 0, H = _(H ^ S, 16), $ = $ + H | 0, L = _(L ^ $, 12), S = S + L | 0, H = _(H ^ S, 8), $ = $ + H | 0, L = _(L ^ $, 7);
  let O = 0;
  r[O++] = a + K | 0, r[O++] = c + R | 0, r[O++] = s + A | 0, r[O++] = l + S | 0, r[O++] = u + L | 0, r[O++] = y + I | 0, r[O++] = v + q | 0, r[O++] = w + j | 0, r[O++] = g + W | 0, r[O++] = f + $ | 0, r[O++] = p + z | 0, r[O++] = h + B | 0, r[O++] = b + G | 0, r[O++] = m + F | 0, r[O++] = P + H | 0, r[O++] = N + J | 0;
}
const Tn = /* @__PURE__ */ No(So, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Ln = 2, st = 1, On = 65536, Io = 4294967295, To = 132, Lo = 99, lt = 1024 * 1024;
function Wt(e, t) {
  const n = Pe(new Uint8Array([2]), bt(t)), o = Zt.getSharedSecret(e, n, !0).slice(1, 33);
  return mt(Y("nip44-v2"), o);
}
function Mn(e, t) {
  if (e.length !== 32)
    throw new Error("NIP-44 conversation key must be exactly 32 bytes.");
  if (t.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const n = Me(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function Nt(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
const Un = 39 + Nt(lt) + 32, Oo = Math.ceil(Un / 3) * 4;
function Mo(e) {
  if (e < On) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function Uo(e) {
  const t = e.length;
  if (t < st || t > lt)
    throw new Error(`NIP-44 plaintext length must be between ${st} and ${lt} bytes on this platform.`);
  const n = Mo(t), r = Nt(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function Do(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < On)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < st || r > Io || e.length !== o + Nt(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function Dn(e, t, n) {
  return gt(wt, e, Pe(t, n));
}
function Vo(e, t) {
  return qo(e, t, be(32));
}
function qo(e, t, n) {
  if (n.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const { chachaKey: r, chachaNonce: o, hmacKey: i } = Mn(e, n), a = Uo(Y(t)), c = Tn(r, o, a), s = Dn(i, n, c);
  return me.encode(Pe(new Uint8Array([Ln]), n, c, s));
}
function jo(e, t) {
  if (t.startsWith("#"))
    throw new Error("Unsupported NIP-44 non-base64 encoding.");
  if (t.length < To || t.length > Oo)
    throw new Error("NIP-44 payload size is outside this platform's supported range.");
  const n = me.decode(t);
  if (n.length < Lo || n.length > Un)
    throw new Error("NIP-44 decoded payload size is outside this platform's supported range.");
  if (n[0] !== Ln)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33);
  if (r.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const o = n.slice(n.length - 32), i = n.slice(33, n.length - 32), { chachaKey: a, chachaNonce: c, hmacKey: s } = Mn(e, r), l = Dn(s, r, i);
  if (!wr(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = Tn(a, c, i);
  return Ge(Do(u));
}
const he = 16, Wo = 283;
function $o(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function St(e) {
  return e << 1 ^ Wo & -(e >> 7);
}
function we(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = St(e);
  return n;
}
const ut = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= St(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return ve(e), t;
})(), zo = /* @__PURE__ */ ut.map((e, t) => ut.indexOf(t)), Bo = (e) => e << 24 | e >>> 8, et = (e) => e << 8 | e >>> 24;
function Vn(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(et), o = r.map(et), i = o.map(et), a = new Uint32Array(256 * 256), c = new Uint32Array(256 * 256), s = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const y = l * 256 + u;
      a[y] = n[l] ^ r[u], c[y] = o[l] ^ i[u], s[y] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: s, T0: n, T1: r, T2: o, T3: i, T01: a, T23: c };
}
const It = /* @__PURE__ */ Vn(ut, (e) => we(e, 3) << 24 | e << 16 | e << 8 | we(e, 2)), qn = /* @__PURE__ */ Vn(zo, (e) => we(e, 11) << 24 | we(e, 13) << 16 | we(e, 9) << 8 | we(e, 14)), Go = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = St(n))
    e[t] = n;
  return e;
})();
function jn(e) {
  M(e);
  const t = e.length;
  $o(e);
  const { sbox2: n } = It, r = [];
  (!Q || !ie(e)) && r.push(e = fe(e));
  const o = U(T(e)), i = o.length, a = (s) => te(n, s, s, s, s), c = new Uint32Array(t + 28);
  c.set(o);
  for (let s = i; s < c.length; s++) {
    let l = c[s - 1];
    s % i === 0 ? l = a(Bo(l)) ^ Go[s / i - 1] : i > 6 && s % i === 4 && (l = a(l)), c[s] = c[s - i] ^ l;
  }
  return ve(...r), c;
}
function Fo(e) {
  const t = jn(e), n = t.slice(), r = t.length, { sbox2: o } = It, { T0: i, T1: a, T2: c, T3: s } = qn;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  ve(t);
  for (let l = 4; l < r - 4; l++) {
    const u = n[l], y = te(o, u, u, u, u);
    n[l] = i[y & 255] ^ a[y >>> 8 & 255] ^ c[y >>> 16 & 255] ^ s[y >>> 24];
  }
  return n;
}
function ue(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function te(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function $t(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: c } = It;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[s++] ^ ue(a, c, t, n, r, o), p = e[s++] ^ ue(a, c, n, r, o, t), h = e[s++] ^ ue(a, c, r, o, t, n), b = e[s++] ^ ue(a, c, o, t, n, r);
    t = f, n = p, r = h, o = b;
  }
  const u = e[s++] ^ te(i, t, n, r, o), y = e[s++] ^ te(i, n, r, o, t), v = e[s++] ^ te(i, r, o, t, n), w = e[s++] ^ te(i, o, t, n, r);
  return { s0: u, s1: y, s2: v, s3: w };
}
function Ho(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: c } = qn;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[s++] ^ ue(a, c, t, o, r, n), p = e[s++] ^ ue(a, c, n, t, o, r), h = e[s++] ^ ue(a, c, r, n, t, o), b = e[s++] ^ ue(a, c, o, r, n, t);
    t = f, n = p, r = h, o = b;
  }
  const u = e[s++] ^ te(i, t, o, r, n), y = e[s++] ^ te(i, n, t, o, r), v = e[s++] ^ te(i, r, n, t, o), w = e[s++] ^ te(i, o, r, n, t);
  return { s0: u, s1: y, s2: v, s3: w };
}
function Jo(e) {
  if (M(e), e.length % he !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + he);
}
function Yo(e, t, n) {
  M(e);
  let r = e.length;
  const o = r % he;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let c = he - o;
    c || (c = he), r = r + c;
  }
  n = Ct(r, n), Sn(e, n), (!Q || !ie(e)) && (e = fe(e));
  const i = T(e);
  U(i);
  const a = T(n);
  return { b: i, o: a, out: n };
}
function Xo(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (n === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const r = e[n - 1];
  let o = 1;
  o &= r - 1 >>> 31 ^ 1, o &= 16 - r >>> 31 ^ 1;
  for (let i = 0; i < 16; i++) {
    const a = i - r >>> 31, c = (e[n - 1 - i] ^ r) === 0 ? 1 : 0;
    o &= c | a ^ 1;
  }
  if (!o)
    throw new Error("aes/pkcs7: wrong padding");
  return e.subarray(0, n - r);
}
function Qo(e) {
  const t = new Uint8Array(16), n = T(t);
  t.set(e);
  const r = he - e.length;
  for (let o = he - r; o < he; o++)
    t[o] = r;
  return n;
}
const Wn = /* @__PURE__ */ Ko({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, a) {
      const c = jn(t), { b: s, o: l, out: u } = Yo(i, o, a);
      let y = n;
      const v = [c];
      (!Q || !ie(y)) && v.push(y = fe(y));
      const w = T(y);
      U(w);
      let g = w[0], f = w[1], p = w[2], h = w[3], b = 0;
      for (; b + 4 <= s.length; )
        g ^= s[b + 0], f ^= s[b + 1], p ^= s[b + 2], h ^= s[b + 3], { s0: g, s1: f, s2: p, s3: h } = $t(c, g, f, p, h), l[b++] = g, l[b++] = f, l[b++] = p, l[b++] = h;
      if (o) {
        const m = Qo(i.subarray(b * 4));
        U(m), g ^= m[0], f ^= m[1], p ^= m[2], h ^= m[3], { s0: g, s1: f, s2: p, s3: h } = $t(c, g, f, p, h), l[b++] = g, l[b++] = f, l[b++] = p, l[b++] = h;
      }
      return U(l), ve(...v), u;
    },
    decrypt(i, a) {
      Jo(i);
      const c = Fo(t);
      let s = n;
      const l = [c];
      (!Q || !ie(s)) && l.push(s = fe(s));
      const u = T(s);
      U(u), a = Ct(i.length, a), Sn(i, a), (!Q || !ie(i)) && l.push(i = fe(i));
      const y = T(i), v = T(a);
      U(y);
      let w = u[0], g = u[1], f = u[2], p = u[3];
      for (let h = 0; h + 4 <= y.length; ) {
        const b = w, m = g, P = f, N = p;
        w = y[h + 0], g = y[h + 1], f = y[h + 2], p = y[h + 3];
        const { s0: K, s1: R, s2: A, s3: S } = Ho(c, w, g, f, p);
        v[h++] = K ^ b, v[h++] = R ^ m, v[h++] = A ^ P, v[h++] = S ^ N;
      }
      return U(v), ve(...l), Xo(a, o);
    }
  };
});
function $n(e, t) {
  const n = Pe(new Uint8Array([2]), bt(t));
  return Zt.getSharedSecret(e, n, !0).slice(1, 33);
}
function Zo(e, t, n) {
  return ei(e, t, n, be(16));
}
function ei(e, t, n, r) {
  if (r.length !== 16)
    throw new Error("NIP-04 iv must be exactly 16 bytes.");
  const o = $n(e, t), i = Wn(o, r).encrypt(Y(n));
  return `${me.encode(i)}?iv=${me.encode(r)}`;
}
function ti(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = me.decode(n.slice(0, r)), i = me.decode(n.slice(r + 4)), a = $n(e, t), c = Wn(a, i).decrypt(o);
  return Ge(c);
}
class De {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = k(t);
  }
  assertAlive() {
    if (this.destroyed)
      throw new Error("This signer has been destroyed (session locked or logged out).");
  }
  getPublicKey() {
    return this.assertAlive(), this.publicKeyHex;
  }
  signEvent(t) {
    return this.assertAlive(), ne({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), Vo(Wt(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), jo(Wt(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Zo(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), ti(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    x(this.privateKey), this.destroyed = !0;
  }
}
const ni = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band", "wss://nostr.wine", "wss://relay.snort.social"], ri = ["wss://purplepag.es", "wss://relay.nostr.band", "wss://nostr-pub.wellorder.net"], zn = "bitlogin.connection.v1", Bn = "bitlogin.connection.nwc.v1", zt = 120, oi = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), ii = /* @__PURE__ */ new Set(["connectable", "personal"]);
class ge extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function Gn(e, t) {
  return Y(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function Fn(e) {
  const t = e, n = (i) => {
    throw new ge(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== zn && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), ii.has(t.tier) || n("tier must be connectable or personal."), oi.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > zt) && n(`label must be a string of at most ${zt} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function tt(e) {
  Fn(e.record);
  const t = Ke(e.vaultPrk), n = k(t), r = Cn(e.record.connection_id), o = xn(e.recordPrk, e.record.connection_id), i = await Pt(e.record, o, Gn(n, r));
  return ne({
    pubkey: n,
    created_at: We(e.previousCreatedAt, e.now),
    kind: re,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function ai(e, t, n) {
  if (!ae(e))
    throw new ge("Connection record event has an invalid id or signature.");
  const r = k(Ke(t));
  if (e.pubkey !== r)
    throw new ge("Connection record event is not signed by this vault's identity.");
  const o = vt(e, "d") ?? "", i = Nn(o);
  if (i === null)
    throw new ge("Connection record event has a malformed d tag.");
  const a = JSON.parse(e.content), c = Gn(e.pubkey, o), s = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const l of s) {
    let u;
    try {
      u = await Kt(a, xn(l.prk, i), c);
    } catch {
      continue;
    }
    if (Fn(u), u.connection_id !== i)
      throw new ge("Connection record id does not match its d tag.");
    if (u.tier !== l.tier)
      throw new ge("Connection record tier does not match the key that decrypted it.");
    return { record: u, tier: l.tier, event: e };
  }
  return null;
}
function ci(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const Be = /^[0-9a-f]{64}$/u;
class ce extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function Bt(e) {
  const t = e.trim();
  if (!/^nostr\+walletconnect:\/\//iu.test(t))
    throw new ce("Not an NWC URI: it must start with nostr+walletconnect://");
  let n;
  try {
    n = new URL(t.replace(/^nostr\+walletconnect:\/\//iu, "http://"));
  } catch {
    throw new ce("The NWC URI is malformed.");
  }
  const r = n.hostname.toLowerCase();
  if (!Be.test(r))
    throw new ce("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let a = null, c = null;
  for (const [s, l] of n.searchParams.entries())
    if (s === "relay") {
      if (!Ye(l))
        throw new ce("An NWC relay must use secure WebSockets, except for an explicit loopback development endpoint.");
      o.push(l);
    } else if (s === "secret") {
      const u = l.toLowerCase();
      if (!Be.test(u))
        throw new ce("The NWC URI's secret is not a 64-char hex client key.");
      a = u;
    } else s === "lud16" ? c = l : i.push([s, l]);
  if (o.length === 0)
    throw new ce("The NWC URI names no relay.");
  if (a === null)
    throw new ce("The NWC URI carries no secret.");
  return {
    schema: Bn,
    wallet_pubkey: r,
    relays: o,
    secret: a,
    lud16: c,
    extra_params: i
  };
}
function si(e) {
  Hn(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function li(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function Hn(e) {
  const t = e, n = (r) => {
    throw new ce(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== Bn && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !Be.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), t.relays.some((r) => !Ye(r)) && n("NWC relays must use secure WebSockets, except for explicit loopback development endpoints."), (typeof t.secret != "string" || !Be.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
const ui = "bitlogin:vault-hwm:v2:", di = "bitlogin/vault-hwm-index/v2", Jn = "bitlogin/vault-hwm-encryption/v2", yi = /^[0-9a-f]{64}$/u;
class de extends Error {
  constructor() {
    super("The local Connection Vault rollback marker is invalid or has been tampered with."), this.name = "RecordHighWaterMarkError";
  }
}
function Tt(e) {
  if (!e || typeof e != "object")
    return !1;
  const t = e;
  return Number.isInteger(t.createdAt) && (t.createdAt ?? -1) >= 0 && typeof t.eventId == "string" && yi.test(t.eventId);
}
function Yn(e, t) {
  Xe(t);
  const n = Me(e, di, 32), r = Y(t);
  try {
    return `${ui}${V(gt(wt, n, r))}`;
  } finally {
    x(n, r);
  }
}
function hi(e, t) {
  return `bitlogin:vault-hwm:${An(e)}:${t}`;
}
async function pi(e, t, n) {
  const r = Me(e, Jn, 32), o = Y(JSON.stringify(n)), i = Y(t);
  try {
    const a = await on(r, o, i), c = {
      v: 2,
      nonce: V(a.nonce),
      ciphertext: V(a.ciphertext)
    };
    return JSON.stringify(c);
  } finally {
    x(r, o, i);
  }
}
async function fi(e, t, n) {
  const r = Me(e, Jn, 32), o = Y(t);
  let i;
  try {
    const a = JSON.parse(n);
    if (a.v !== 2 || typeof a.nonce != "string" || typeof a.ciphertext != "string")
      throw new de();
    i = await an(r, X(a.nonce), X(a.ciphertext), o);
    const c = JSON.parse(Ge(i));
    if (!Tt(c))
      throw new de();
    return c;
  } catch (a) {
    throw a instanceof de ? a : new de();
  } finally {
    x(r, o), i && x(i);
  }
}
async function Xn(e, t, n, r) {
  const o = Yn(t, n);
  await e.set(o, await pi(t, o, r));
}
async function Qn(e, t, n) {
  const r = Yn(t, n), o = await e.get(r);
  if (o !== void 0)
    return fi(t, r, o);
  const i = hi(t, n), a = await e.get(i);
  if (a === void 0)
    return null;
  try {
    const c = JSON.parse(a);
    if (!Tt(c))
      throw new de();
    return await Xn(e, t, n, c), await e.delete(i), c;
  } catch (c) {
    throw c instanceof de ? c : new de();
  }
}
async function Zn(e, t, n, r) {
  if (!Tt(r))
    throw new de();
  const o = await Qn(e, t, n);
  o && it({ created_at: r.createdAt, id: r.eventId }, { created_at: o.createdAt, id: o.eventId }) <= 0 || await Xn(e, t, n, r);
}
async function vi(e) {
  const t = Ke(e.vaultPrk), n = new C(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await ke(n, e.event, {
      dTag: Cn(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll(), x(t);
  }
  return r.success && await Zn(e.store, e.vaultPrk, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const Gt = 500;
async function gi(e) {
  const t = Ke(e.vaultPrk), n = k(t), r = new C(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [re], authors: [n], limit: Gt }, e.timeoutMs);
  } finally {
    r.closeAll(), x(t);
  }
  const i = o.outcomes.some((l) => l.events.length >= Gt), a = /* @__PURE__ */ new Map();
  for (const l of o.outcomes.flatMap((u) => u.events)) {
    if (!ae(l) || l.pubkey !== n)
      continue;
    const u = Nn(vt(l, "d") ?? "");
    if (u === null)
      continue;
    const y = a.get(u);
    (!y || it(l, y) > 0) && a.set(u, l);
  }
  const c = /* @__PURE__ */ new Map(), s = [];
  for (const [l, u] of a) {
    const y = await Qn(e.store, e.vaultPrk, l);
    if (y !== null && it(u, {
      created_at: y.createdAt,
      id: y.eventId
    }) < 0) {
      s.push(l);
      continue;
    }
    c.set(l, u), await Zn(e.store, e.vaultPrk, l, {
      createdAt: u.created_at,
      eventId: u.id
    });
  }
  return {
    events: c,
    rollbackWarnings: s,
    quorumMet: o.quorumMet,
    respondedCount: o.respondedCount,
    truncated: i
  };
}
class wi {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = go(this.connectionVaultRoot), this.vaultPublicKey = An(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = wo(this.connectionVaultRoot, t), x(t);
  }
  /** Closes the sudo window and wipes the personal-tier key material. */
  endSudo() {
    this.personalPrk && x(this.personalPrk), this.personalPrk = null;
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
    this.endSudo(), x(this.vaultPrk, this.connectionVaultRoot), this.destroyed = !0;
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
      schema: zn,
      connection_id: bo(),
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
    }, o = await tt({
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
    }, a = await tt({
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
    const r = n ?? Math.floor(Date.now() / 1e3), o = ci(t.record, r), i = await tt({
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
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : ai(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return Rn({
      privateKey: Ke(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: re,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return vi({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return gi({ vaultPrk: this.vaultPrk, ...t });
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
const bi = "bitlogin", se = "kv", Z = "device-keys", mi = 2;
function _i() {
  return new Promise((e, t) => {
    const n = indexedDB.open(bi, mi);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(se) || r.createObjectStore(se), r.objectStoreNames.contains(Z) || r.createObjectStore(Z);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class ki {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = _i()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(se, "readonly").objectStore(se).get(t);
      a.onsuccess = () => r(a.result), a.onerror = () => o(a.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, i) => {
      const a = r.transaction(se, "readwrite");
      a.objectStore(se).put(n, t), a.oncomplete = () => o(), a.onerror = () => i(a.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(se, "readwrite");
      i.objectStore(se).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
  /**
   * Returns a non-extractable AES-GCM key kept by the browser's IndexedDB
   * implementation. The key is deliberately separate from the string-only KV
   * API so callers cannot accidentally serialize it as application data.
   */
  async getOrCreateDeviceKey(t) {
    const n = await this.db(), r = await new Promise((i, a) => {
      const c = n.transaction(Z, "readonly").objectStore(Z).get(t);
      c.onsuccess = () => i(c.result), c.onerror = () => a(c.error);
    });
    if (r) return r;
    const o = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      !1,
      ["encrypt", "decrypt"]
    );
    try {
      return await new Promise((i, a) => {
        const c = n.transaction(Z, "readwrite");
        c.objectStore(Z).add(o, t), c.oncomplete = () => i(), c.onerror = () => a(c.error);
      }), o;
    } catch {
      const i = await new Promise((a, c) => {
        const s = n.transaction(Z, "readonly").objectStore(Z).get(t);
        s.onsuccess = () => a(s.result), s.onerror = () => c(s.error);
      });
      if (i) return i;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(Z, "readwrite");
      i.objectStore(Z).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
}
const Oe = "bitlogin:session:v1", Lt = "bitlogin:session-device-key:v1";
function Ft(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function Ht(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function Jt(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function Ei(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function Pi(e, t) {
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
      await e.delete(Oe);
      return;
    }
    const r = await e.getOrCreateDeviceKey(Lt), o = crypto.getRandomValues(new Uint8Array(12)), i = new TextEncoder().encode(JSON.stringify(n)), a = await crypto.subtle.encrypt({ name: "AES-GCM", iv: o }, r, i), c = {
      v: 2,
      iv: Ft(o),
      ciphertext: Ft(new Uint8Array(a))
    };
    await e.set(Oe, JSON.stringify(c));
  } catch {
  }
}
async function Ki(e) {
  let t;
  try {
    t = await e.get(Oe);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    if (!Ei(n) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(Oe), null;
    const r = await e.getOrCreateDeviceKey(Lt), o = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Jt(Ht(n.iv)) },
      r,
      Jt(Ht(n.ciphertext))
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
async function Ri(e) {
  try {
    await e.delete(Oe), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(Lt);
  } catch {
  }
}
class Ai {
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
let D = [...ni], nt = [...ri];
const ee = new ki(), xi = new Ai();
function oe() {
  if (!d.signer || !d.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: d.signer, everydayPrivateKey: d.everydayPrivateKey };
}
function Ae() {
  d.signer?.destroy(), d.everydayPrivateKey && d.everydayPrivateKey.fill(0), d.signer = null, d.everydayPrivateKey = null, d.accountId = null, d.recoveryPublicKey = null, d.activeCredentialEvent = null, d.activeRecoveryEvent = null, d.vault?.destroy(), d.vault = null, d.connectionVaultRoot && d.connectionVaultRoot.fill(0), d.connectionVaultRoot = null, d.vaultKnown = !1, d.pendingRecovery && (d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery.everydayPrivateKey.fill(0), d.pendingRecovery = null);
}
function rt(e, t) {
  d.connectionVaultRoot = e ?? null, d.vaultKnown = !0, d.vault = null, t && x(t);
}
async function Ve() {
  !d.everydayPrivateKey || !d.accountId || !d.recoveryPublicKey || !d.activeCredentialEvent || !d.activeRecoveryEvent || await Pi(ee, {
    everydayPrivateKey: d.everydayPrivateKey,
    accountId: d.accountId,
    recoveryPublicKey: d.recoveryPublicKey,
    activeCredentialEvent: d.activeCredentialEvent,
    activeRecoveryEvent: d.activeRecoveryEvent,
    ...d.connectionVaultRoot ? { connectionVaultRoot: d.connectionVaultRoot } : {},
    ...d.vaultKnown ? { vaultEnabled: d.connectionVaultRoot !== null } : {}
  });
}
function xe() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function dt() {
  if (!d.signer) throw new Error("No identity is unlocked in this session.");
  if (!d.connectionVaultRoot)
    throw new Error(
      d.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return d.vault ??= new wi(d.connectionVaultRoot.slice()), d.vault;
}
function Ce(e) {
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
async function je() {
  const e = dt(), t = await e.listConnections({ relayUrls: D, store: ee });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings,
    unreadable: t.unreadable,
    truncated: t.truncated,
    quorumMet: t.quorumMet
  };
}
async function ot(e) {
  const { vault: t, connections: n } = await je(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
async function Ci(e, t) {
  switch (e) {
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (D = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (nt = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await co({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: D }) : await En({ loginName: n.loginName, password: n.password, vaultRelayUrls: D });
      return Ae(), d.signer = new De(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryEvent, rt(r.connectionVaultRoot, r.vaultSudoKey), await Ve(), {
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
      const r = Pn(t.nsecOrHex), o = k(r), i = { everydayPublicKey: o, npub: Ut(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await so({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: D,
        store: ee,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return Ae(), d.signer = new De(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryCapsuleEvent, rt(r.connectionVaultRoot, r.vaultSudoKey), await Ve(), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await lo({
        phrase: n.phrase,
        vaultRelayUrls: D,
        discoveryRelayUrls: nt,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return Ae(), d.pendingRecovery = r, d.signer = new De(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.currentRecoveryEvent, rt(
        r.currentRecoveryPayload.connection_vault_root ? X(r.currentRecoveryPayload.connection_vault_root) : void 0
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
      const r = await uo({
        recovered: d.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: D,
        store: ee
      });
      return d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.refreshedRecoveryEvent, d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery = null, await Ve(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await yo({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: D,
        store: ee,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return d.activeCredentialEvent = r.newCredentialEvent, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.recoveryCapsuleEvent, await Ve(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = oe();
      return Ir({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: nt
      });
    }
    case "getPublicKey": {
      const { signer: n } = oe();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = oe(), r = t;
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = oe(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = oe(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = oe(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = oe(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = oe();
      return { nsec: mr(n), npub: Ut(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (oe(), !d.recoveryPublicKey || !d.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return br({
        recoveryPublicKeyHex: d.recoveryPublicKey,
        vaultRelayUrls: D,
        recoveryCapsuleEvents: [d.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const n = new C(D), r = await Hr(n, d.activeCredentialEvent, d.activeRecoveryEvent);
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
      const n = await Ki(ee);
      return n ? (Ae(), d.signer = new De(n.everydayPrivateKey), d.everydayPrivateKey = n.everydayPrivateKey, d.accountId = n.accountId, d.recoveryPublicKey = n.recoveryPublicKey, d.activeCredentialEvent = n.activeCredentialEvent, d.activeRecoveryEvent = n.activeRecoveryEvent, d.connectionVaultRoot = n.connectionVaultRoot ?? null, d.vaultKnown = n.vaultEnabled !== void 0, { restored: !0, everydayPublicKey: d.signer.getPublicKey(), accountId: n.accountId }) : { restored: !1 };
    }
    case "logout":
      return Ae(), await Ri(ee), {};
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return d.signer ? d.connectionVaultRoot ? { enabled: !0, vaultPublicKey: dt().vaultPublicKey } : { enabled: !1, reason: d.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a } = await je();
      return { connections: n.map(Ce), rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a };
    }
    case "vaultSaveNwc": {
      const n = t, r = xe(), o = dt(), i = Bt(n.uri), a = n.label.trim().slice(0, 120) || "Wallet connection", { record: c, event: s } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: a,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: s,
        connectionId: c.connection_id,
        relayUrls: D,
        store: ee
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const u = await o.decryptEvent(s);
      return Ce(u);
    }
    case "vaultFindForOrigin": {
      const n = xe(), { connections: r } = await je(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? Ce(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await ot(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== xe())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return Hn(i), { uri: si(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await ot(n.connectionId), i = n.origin === null ? null : xe(), { record: a, event: c } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: c,
        connectionId: a.connection_id,
        relayUrls: D,
        store: ee
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const l = await r.decryptEvent(c);
      return Ce(l);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await ot(n.connectionId), { record: i, event: a } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: a,
        connectionId: i.connection_id,
        relayUrls: D,
        store: ee
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const s = r.buildDeletionRequest(o.event.id), l = new C(D);
        await l.publishAll(s), l.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = xe(), o = Bt(n.uri), { connections: i } = await je(), a = i.find(
        (c) => c.record.connection_type === "nwc" && li(c.record.credential, o)
      );
      return a ? a.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: Ce(a) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const Ni = /* @__PURE__ */ new Set([
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
  "vaultOfferCheck"
]);
self.addEventListener("message", (e) => {
  const t = e.data;
  if (!t || typeof t != "object" || typeof t.id != "string") return;
  if (typeof t.action != "string" || !Ni.has(t.action)) {
    const i = {
      id: t.id,
      ok: !1,
      error: `Unknown worker action: ${String(t.action)}`,
      errorName: "Error"
    };
    self.postMessage(i);
    return;
  }
  const { id: n, action: r, payload: o } = e.data;
  xi.run(() => Ci(r, o)).then(
    (i) => {
      const a = { id: n, ok: !0, result: i };
      self.postMessage(a);
    },
    (i) => {
      const a = i instanceof Error ? i : new Error(String(i)), c = { id: n, ok: !1, error: a.message, errorName: a.name };
      self.postMessage(c);
    }
  );
});
