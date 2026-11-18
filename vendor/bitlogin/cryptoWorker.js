import { v as V, g as k, s as Z, b as Be, a as ee, K as Gr, j as at, k as We, l as Ut, m as W, u as te, n as Hr, o as Jr, d as x, q as ne, t as yt, S as ht, w as Mt, x as pt, D as Te, y as Ge, z as Ie, A as Yr, B as Xr, C as Qr, F as Zr, G as gt, H as un, I as Dt, J as eo, L as to, M as no, N as Xe, O as Ot, P as ro, Q as oo, T as Vt, U as ft, V as $e, W as io, X as qt, Y as Bt, Z as E, _ as Tn, $ as ao, h as Wt, a0 as In, a1 as Le, a2 as so, c as He, a3 as Ln, a4 as Ae, a5 as co, a6 as Un, a7 as et, a8 as Pt, a9 as lo, f as tt, aa as uo, ab as dn } from "./bitlogin-shared-DDWBXFUP.js";
class be extends Error {
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
class Mn extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class ye extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class Dn extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function je(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const yo = { generation: -1, recoveryGeneration: -1 };
function $t(e) {
  return `bitlogin:hwm:${e}`;
}
async function jt(e, t) {
  const n = await e.get($t(t));
  return n ? JSON.parse(n) : yo;
}
async function On(e, t, n) {
  const r = await jt(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set($t(t), JSON.stringify(o)), o;
}
async function ho(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set($t(t), JSON.stringify(n));
}
function po(e) {
  const t = e.split(".");
  if (t.length !== 4 || t.some((r) => !/^\d{1,3}$/u.test(r)))
    return !1;
  const n = t.map(Number);
  return n.every((r) => r >= 0 && r <= 255) && n[0] === 127;
}
function Je(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.username || t.password || t.hash ? !1 : t.protocol === "wss:" ? !0 : t.protocol !== "ws:" ? !1 : t.hostname === "localhost" || t.hostname === "[::1]" || po(t.hostname);
}
function fo() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
const st = 1e3, vo = 262144;
function wo(e) {
  const t = Math.min(e.limit ?? st, st);
  return Math.max(50, t * 3);
}
const go = 2048, bo = 1e4, mo = 100;
function _o(e, t) {
  if (e.size >= go) {
    const n = e.values().next().value;
    n !== void 0 && e.delete(n);
  }
  e.add(t);
}
class Ft {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    if (!Je(t))
      throw new Error("Relay URL must use secure WebSockets, except for an explicit loopback development endpoint.");
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = fo(), o = new r(this.url);
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
    if (t.length > vo)
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
        if (u - s.liveWindowStart >= bo && (s.liveWindowStart = u, s.liveVerifies = 0), s.liveVerifies >= mo || (s.liveVerifies++, !V(a) || !yn(a, s.filter)))
          return;
        _o(s.seenIds, a.id), s.onEvent(a);
        return;
      }
      const l = Math.min(s.filter.limit ?? st, st);
      if (s.events.length >= l || s.verifyBudget <= 0 || (s.verifyBudget--, !V(a) || !yn(a, s.filter)))
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
    const n = k(this.authPrivateKey), r = Z({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Gr,
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
    const r = Be(ee(8));
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
    const r = Be(ee(8));
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
        verifyBudget: wo(t),
        liveWindowStart: 0,
        liveVerifies: 0,
        filter: t,
        onEose: () => s()
      }), this.send(["REQ", r, t]);
    });
  }
}
function yn(e, t) {
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
class K {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Ft(r, n));
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
function Re(e) {
  return e.filter((t) => t.result.ok).length;
}
function ko(e, t, n) {
  return Z({ pubkey: k(e), created_at: n, kind: at, tags: [], content: JSON.stringify(t) }, e);
}
function Eo(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return Z({ pubkey: k(e), created_at: n, kind: We, tags: r, content: "" }, e);
}
function Po(e, t, n) {
  return Z({
    pubkey: k(e),
    created_at: n,
    kind: Ut,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Ko(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function Ro(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function Ao(e) {
  const t = k(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new K(r), [i, a, s] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [at] }),
    o.queryQuorum({ authors: [t], kinds: [We] }),
    o.queryQuorum({ authors: [t], kinds: [Ut] })
  ]);
  o.closeAll();
  const c = i.outcomes.some((v) => v.events.length > 0), l = a.outcomes.some((v) => v.events.length > 0), u = s.outcomes.some((v) => v.events.length > 0), y = new K(r);
  let w = null, p = null, g = null;
  const f = [];
  if (!c && (e.name || e.about || e.picture)) {
    const v = ko(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(y.publishAll(v).then((h) => void (w = h)));
  }
  if (!l) {
    const v = Eo(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    f.push(y.publishAll(v).then((h) => void (p = h)));
  }
  if (!u) {
    const v = Po(e.everydayPrivateKey, e.dmRelays, n);
    f.push(y.publishAll(v).then((h) => void (g = h)));
  }
  return await Promise.all(f), y.closeAll(), {
    profilePublished: w !== null && Re(w) > 0,
    relayListAcknowledgedCount: p !== null ? Re(p) : 0,
    dmRelayListAcknowledgedCount: g !== null ? Re(g) : 0,
    profileSkippedExisting: c,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function me(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), a = Re(i), c = (await e.queryQuorum({ kinds: [W], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: a,
    readbackVerifiedCount: c,
    success: a >= r && c >= o
  };
}
function So(e) {
  const t = Hr(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function No(e) {
  return te(So(e));
}
const nt = [1024, 2048, 4096], ve = 4;
function Co(e) {
  const t = ve + e.length, n = nt.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${nt[nt.length - 1]} bytes minus ${ve}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, ve), r;
}
function xo(e) {
  if (!nt.includes(e.length))
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
function zt() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function Vn(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return zt().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function qn(e, t, n) {
  const r = Jr(), o = await Vn(e), i = await zt().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function Bn(e, t, n, r) {
  const o = await Vn(e);
  try {
    const i = await zt().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function Wn(e) {
  return te(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function $n(e) {
  return te(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function Gt(e, t, n) {
  const r = No(e), o = Co(r), i = await qn(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: x(i.nonce),
    ciphertext: x(i.ciphertext)
  };
}
async function Ht(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = ne(e.nonce), o = ne(e.ciphertext), i = await Bn(t, r, o, n), a = xo(i);
  return JSON.parse(yt(a));
}
class Jt extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const To = 1e6, Io = /^[0-9a-f]{64}$/u;
function A(e, t) {
  if (!e)
    throw new Jt(t);
}
function ct(e) {
  return typeof e == "string" && Io.test(e);
}
function jn(e) {
  A(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e)
    A(typeof t == "string", "Each relay hint must be a string (§12.4.7)."), A(Je(t), `Relay URL must use secure WebSockets, except for an explicit loopback development endpoint (§12.4.7): ${t}`);
}
function Fn(e) {
  A(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = ne(e);
  } catch {
    throw new Jt("account_id is not valid base64url (§12.4.2).");
  }
  A(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function zn(e, t) {
  A(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = ne(e);
  A(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), A(Mt(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), A(ct(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = k(n);
  A(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function lt(e, t) {
  A(typeof t == "string", `${e} must be a string (§CV5.2).`);
  let n;
  try {
    n = ne(t);
  } catch {
    throw new Jt(`${e} is not valid base64url (§CV5.2).`);
  }
  A(n.length === 32, `${e} must decode to exactly 32 bytes (§CV5.2).`);
}
function Lo(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (A(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2)."), lt("connection_vault_root", t), lt("vault_sudo_key", n));
}
function Uo(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (A(t !== void 0, "vault_sudo_key cannot appear without connection_vault_root (§CV5.2)."), lt("connection_vault_root", t), n !== void 0 && lt("vault_sudo_key", n));
}
function Gn(e, t) {
  A(Number.isInteger(e) && e >= 0 && e <= To, `${t} is out of supported bounds (§12.4.8).`);
}
function Mo(e) {
  A(e.schema === pt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), Fn(e.account_id), Gn(e.generation, "generation"), zn(e.operational_private_key, e.operational_public_key), A(ct(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), jn(e.vault_relay_hints), Uo(e);
  const t = e.recovery_capsule_event;
  A(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), A(V(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), A(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Do(e) {
  A(e.schema === ht, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), Fn(e.account_id), Gn(e.recovery_generation, "recovery_generation"), A(e.previous_recovery_event_id === null || ct(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), zn(e.operational_private_key, e.operational_public_key), A(ct(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), jn(e.vault_relay_hints), Lo(e);
}
function Oo(e) {
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
async function Yt(e) {
  const t = k(e.locatorPrivateKey), n = await Gt(e.payload, e.capsuleKey, Wn(t));
  return Z({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: W,
    tags: [["d", Te]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function Vo(e) {
  const t = k(e.oldLocatorPrivateKey);
  return Z({
    pubkey: t,
    created_at: e.createdAt,
    kind: W,
    tags: [["d", Te]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function qo(e, t) {
  if (!V(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Ht(n, t, Wn(e.pubkey));
  return Mo(r), r;
}
async function Xt(e) {
  const t = k(e.recoveryPrivateKey), n = await Gt(e.payload, e.capsuleKey, $n(t));
  return Z({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: W,
    tags: [["d", Ge]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function Hn(e, t) {
  if (!V(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Ht(n, t, $n(e.pubkey));
  return Do(r), r;
}
function hn(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === W && Ie(o, "d") === n && V(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function Jn(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [W], authors: [t], "#d": [n], limit: 5 }, o), a = i.outcomes.flatMap((w) => w.events), s = hn(a, t, n), c = [];
  for (const w of s)
    try {
      const p = await r(w);
      c.push({ event: w, payload: p });
    } catch (p) {
      c.push({ event: w, payload: null, error: p.message });
    }
  const l = c.find((w) => w.payload !== null) ?? null, u = i.outcomes.map((w) => ({
    responded: w.responded,
    events: hn(w.events, t, n)
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
async function Fe(e, t, n, r = 8e3) {
  return Jn(e, t, Te, (o) => qo(o, n), r);
}
async function Yn(e, t, n, r = 8e3) {
  return Jn(e, t, Ge, (o) => Hn(o, n), r);
}
function Bo(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : Oo(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function pn(e) {
  const t = [...new Set(e.relayUrls)], n = async (s) => {
    const c = new K(t);
    try {
      const l = await c.publishAll(s, e.timeoutMs);
      return new Map(l.map((u) => [
        u.relayUrl,
        { ok: u.result.ok, message: u.result.message ?? "" }
      ]));
    } finally {
      c.closeAll();
    }
  }, [r, o] = await Promise.all([
    n(e.credentialEvent),
    n(e.recoveryEvent)
  ]), i = { ok: !1, message: "no reply" }, a = t.map((s) => ({
    relayUrl: s,
    credential: r.get(s) ?? i,
    recovery: o.get(s) ?? i
  }));
  return {
    credentialAcknowledgedCount: a.filter((s) => s.credential.ok).length,
    recoveryAcknowledgedCount: a.filter((s) => s.recovery.ok).length,
    relaysTried: a.length,
    relays: a
  };
}
function Wo(e) {
  const t = Ie(e, "d");
  if (e.kind !== W || t === void 0 || !V(e))
    throw new Error("This session's capsule event is not a valid capsule.");
  return { pubkey: e.pubkey, dTag: t };
}
function $o(e, t, n) {
  const r = e.filter((i) => i.pubkey === n.pubkey && i.kind === W && Ie(i, "d") === n.dTag && V(i));
  return r.some((i) => i.id === t.id) ? "current" : r.length === 0 ? "missing" : Math.max(...r.map((i) => i.created_at)) >= t.created_at ? "newer" : "older";
}
async function fn(e, t, n) {
  const r = Wo(t), o = new K(e);
  try {
    const i = await o.queryQuorum({
      kinds: [W],
      authors: [r.pubkey],
      "#d": [r.dTag],
      limit: 5
    }, n);
    return new Map(i.outcomes.map((a) => [
      a.relayUrl,
      a.responded ? { status: $o(a.events, t, r) } : { status: "unreachable", error: a.error }
    ]));
  } finally {
    o.closeAll();
  }
}
async function jo(e) {
  const t = [...new Set(e.relayUrls)], [n, r] = await Promise.all([
    fn(t, e.credentialEvent, e.timeoutMs),
    fn(t, e.recoveryEvent, e.timeoutMs)
  ]), o = t.map((i) => {
    const a = n.get(i) ?? { status: "unreachable" }, s = r.get(i) ?? { status: "unreachable" }, c = a.error ?? s.error;
    return {
      relayUrl: i,
      credential: a.status,
      recovery: s.status,
      ...c ? { error: c } : {}
    };
  });
  return {
    relays: o,
    totalCount: o.length,
    reachableCount: o.filter((i) => i.credential !== "unreachable" && i.recovery !== "unreachable").length,
    credentialCurrentCount: o.filter((i) => i.credential === "current").length,
    recoveryCurrentCount: o.filter((i) => i.recovery === "current").length,
    checkedAt: e.now ?? Math.floor(Date.now() / 1e3)
  };
}
const Xn = `abandon
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
function Fo(e, t, n, r) {
  Qr(e);
  const o = Zr({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: a, asyncTick: s } = o;
  if (gt(i), gt(a), gt(s), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = un(t), l = un(n), u = new Uint8Array(a), y = Dt.create(e, c), w = y._cloneInto().update(l);
  return { c: i, dkLen: a, asyncTick: s, DK: u, PRF: y, PRFSalt: w };
}
function zo(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), eo(o), n;
}
async function Go(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: a, DK: s, PRF: c, PRFSalt: l } = Fo(e, t, n, r);
  let u;
  const y = new Uint8Array(4), w = Yr(y), p = new Uint8Array(c.outputLen);
  for (let g = 1, f = 0; f < i; g++, f += c.outputLen) {
    const v = s.subarray(f, f + c.outputLen);
    w.setInt32(0, g, !1), (u = l._cloneInto(u)).update(y).digestInto(p), v.set(p.subarray(0, v.length)), await Xr(o - 1, a, () => {
      c._cloneInto(u).update(p).digestInto(p);
      for (let h = 0; h < v.length; h++)
        v[h] ^= p[h];
    });
  }
  return zo(c, l, s, u, p);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const Ho = (e) => e[0] === "あいこくしん";
function Qn(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function Zn(e) {
  const t = Qn(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function er(e) {
  no(e, 16, 20, 24, 28, 32);
}
const Jo = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([Ot(e)[0] >> t << t]);
};
function tr(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), Xe.chain(Xe.checksum(1, Jo), Xe.radix2(11, !0), Xe.alphabet(e));
}
function Yo(e, t) {
  const { words: n } = Zn(e), r = tr(t).decode(n);
  return er(r), r;
}
function Xo(e, t) {
  return er(e), tr(t).encode(e).join(Ho(t) ? "　" : " ");
}
function Qo(e, t) {
  try {
    Yo(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const Zo = (e) => Qn("mnemonic" + e);
function ei(e, t = "") {
  return Go(to, Zn(e).nfkd, Zo(t), { c: 2048, dkLen: 64 });
}
function ti(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return Xo(e, Xn);
}
function nr(e) {
  try {
    return Qo(rr(e), Xn);
  } catch {
    return !1;
  }
}
function rr(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function Qt(e) {
  return ei(rr(e), "");
}
const Zt = ro.id, Se = "aes-256-gcm-v1", Ne = "bitlogin-bip39-hkdf-v1", or = "bitlogin-recovery-hkdf-v1", ni = 4, ri = 64;
function Ce(e) {
  return [...new Set(e)].filter((t) => t.length <= ri).slice(0, ni);
}
function xe(e) {
  return e ? { everyday_derivation: or } : {};
}
function ir(e) {
  return e.protocol?.everyday_derivation === or;
}
async function ar(e) {
  const t = ft(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await $e(e.password, t);
  try {
    const i = k(r), a = new K(e.vaultRelayUrls, {
      authPrivateKey: r
    });
    let s;
    try {
      s = await Fe(a, i, o, e.timeoutMs);
    } finally {
      a.closeAll();
    }
    if (!s.quorumMet)
      throw new de("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
    if (s.candidates.length > 0)
      throw new Mn();
    const c = e.everydayPrivateKey !== void 0;
    if (c && !Mt(e.everydayPrivateKey))
      throw new de("The provided key is not a valid secp256k1 private key.");
    const l = ti(io()), u = await Qt(l);
    let y, w, p;
    try {
      ({ recoveryPrivateKey: y, capsuleKey: w } = qt(u)), p = c ? e.everydayPrivateKey : Bt(u);
    } finally {
      E(u);
    }
    const g = !c, f = ee(32), v = ee(32);
    let h = !1;
    try {
      const b = k(y), m = k(p), P = x(Tn()), U = {
        schema: ht,
        account_id: P,
        recovery_generation: 0,
        previous_recovery_event_id: null,
        operational_private_key: x(p),
        operational_public_key: m,
        recovery_public_key: b,
        connection_vault_root: x(f),
        vault_sudo_key: x(v),
        created_at: n,
        vault_relay_hints: Ce(e.vaultRelayUrls),
        protocol: {
          capsule_encryption: Se,
          recovery_derivation: Ne,
          ...xe(g)
        }
      }, R = await Xt({
        recoveryPrivateKey: y,
        capsuleKey: w,
        payload: U
      }), N = new K(e.vaultRelayUrls, {
        authPrivateKey: y
      });
      let S;
      try {
        S = await me(N, R, {
          dTag: Ge,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        N.closeAll();
      }
      if (!S.success)
        throw new de("The recovery capsule did not reach the required relay acknowledgement and readback quorum. No login credential was published. Please retry, or add more vault relays.");
      const T = {
        schema: pt,
        account_id: P,
        generation: 0,
        operational_private_key: x(p),
        operational_public_key: m,
        recovery_public_key: b,
        recovery_capsule_event: R,
        connection_vault_root: x(f),
        created_at: n,
        vault_relay_hints: Ce(e.vaultRelayUrls),
        protocol: {
          password_kdf: Zt,
          capsule_encryption: Se,
          recovery_derivation: Ne,
          ...xe(g)
        }
      }, M = await Yt({
        locatorPrivateKey: r,
        capsuleKey: o,
        payload: T
      }), D = new K(e.vaultRelayUrls, {
        authPrivateKey: r
      });
      let I;
      try {
        I = await me(D, M, {
          dTag: Te,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        D.closeAll();
      }
      if (!I.success)
        throw new de("Registration did not reach the required credential acknowledgement and readback quorum. Please retry, or add more vault relays.");
      return h = !0, {
        normalizedLoginName: t,
        recoveryPhrase: l,
        everydayPrivateKey: p,
        everydayPublicKey: m,
        recoveryPublicKey: b,
        locatorPublicKey: i,
        accountId: P,
        imported: c,
        everydayKeyDerived: g,
        connectionVaultRoot: f,
        vaultSudoKey: v,
        credentialEvent: M,
        recoveryEvent: R,
        credentialPublish: I,
        recoveryPublish: S
      };
    } finally {
      E(y, w), h || (c || E(p), E(f, v));
    }
  } finally {
    E(r, o);
  }
}
async function oi(e) {
  const { nsecOrHex: t, ...n } = e, r = sr(t);
  return ar({ ...n, everydayPrivateKey: r });
}
function sr(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = oo(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = Vt(t.toLowerCase());
  else
    throw new de("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!Mt(n))
    throw new de("The provided key is not a valid secp256k1 private key.");
  return n;
}
class cr {
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
async function ii(e) {
  const t = ft(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await $e(e.password, t), o = k(n), i = new K(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  try {
    const a = await Fe(i, o, r, e.timeoutMs);
    if (!a.quorumMet)
      throw new be("quorum-not-met");
    if (!a.best)
      throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const s = a.best.payload, c = e.store ?? new cr(), l = await jt(c, s.operational_public_key), u = s.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new Dn(l.generation, s.generation);
    const y = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${s.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await On(c, s.operational_public_key, {
      generation: s.generation
    });
    const w = a.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: ne(s.operational_private_key),
      everydayPublicKey: s.operational_public_key,
      recoveryPublicKey: s.recovery_public_key,
      accountId: s.account_id,
      generation: s.generation,
      everydayKeyDerived: ir(s),
      credentialEvent: a.best.event,
      recoveryCapsuleEvent: s.recovery_capsule_event,
      connectionVaultRoot: s.connection_vault_root ? ne(s.connection_vault_root) : void 0,
      rollbackWarning: y,
      relayDisagreementWarning: w
    };
  } finally {
    i.closeAll();
  }
}
function vn(e) {
  return e.filter((t) => V(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function ai(e) {
  if (!nr(e.phrase))
    throw new ye("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Qt(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = qt(t), o = Bt(t), i = k(o);
  E(t, o);
  const a = k(n), s = new K(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  let c;
  try {
    c = await Yn(s, a, r, e.timeoutMs);
  } finally {
    s.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (V(m))
        try {
          f.push({
            event: m,
            payload: await Hn(m, r)
          });
        } catch (P) {
          f.push({
            event: m,
            payload: null,
            error: P.message
          });
        }
    const v = /* @__PURE__ */ new Map();
    for (const m of [...c.candidates, ...f])
      v.set(m.event.id, m);
    const h = [...v.values()].sort((m, P) => P.event.created_at - m.event.created_at), b = h.find((m) => m.payload !== null) ?? null;
    c = {
      ...c,
      candidates: h,
      best: b,
      quorumMet: c.quorumMet || b !== null
    };
  }
  if (!c.quorumMet)
    throw new be("quorum-not-met");
  if (!c.best)
    throw new be(c.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const l = c.best.payload, u = Bo(c.candidates), y = ne(l.operational_private_key), w = l.operational_public_key, { generalRelays: p, dmRelays: g } = await lr(w, [...e.discoveryRelayUrls, ...l.vault_relay_hints], e.timeoutMs);
  return {
    everydayPrivateKey: y,
    everydayPublicKey: w,
    recoveryPrivateKey: n,
    recoveryPublicKey: a,
    recoveryCapsuleKey: r,
    accountId: l.account_id,
    currentRecoveryEvent: c.best.event,
    currentRecoveryPayload: l,
    generalRelays: p,
    dmRelays: g,
    chainWarning: u.consistent ? void 0 : u.warning,
    everydayKeyDerived: w === i
  };
}
async function lr(e, t, n) {
  const r = new K([...new Set(t)]);
  let o = [], i = [];
  try {
    const a = await r.queryQuorum({ kinds: [We], authors: [e], limit: 5 }, n), s = vn(a.outcomes.flatMap((u) => u.events));
    s && (o = Ko(s));
    const c = await r.queryQuorum({ kinds: [Ut], authors: [e], limit: 5 }, n), l = vn(c.outcomes.flatMap((u) => u.events));
    l && (i = Ro(l));
  } finally {
    r.closeAll();
  }
  return { generalRelays: o, dmRelays: i };
}
async function ur(e) {
  if (!nr(e))
    throw new ye("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Qt(e);
  try {
    const { recoveryPrivateKey: n, capsuleKey: r } = qt(t), o = Bt(t);
    return {
      recoveryPrivateKey: n,
      recoveryPublicKey: k(n),
      capsuleKey: r,
      everydayPrivateKey: o,
      everydayPublicKey: k(o)
    };
  } finally {
    E(t);
  }
}
async function dr(e, t, n) {
  const r = new K(t, {
    authPrivateKey: e.recoveryPrivateKey
  });
  let o;
  try {
    o = await Yn(r, e.recoveryPublicKey, e.capsuleKey, n);
  } finally {
    r.closeAll();
  }
  if (!o.quorumMet)
    throw new be("quorum-not-met");
  if (o.best)
    throw new ye("This account's recovery capsule is still on the relays. Use normal recovery instead of a rebuild.");
  return o.candidates.length > 0 ? Math.max(...o.candidates.map((i) => i.event.created_at)) : null;
}
async function si(e) {
  const t = await ur(e.phrase);
  try {
    await dr(t, e.vaultRelayUrls, e.timeoutMs);
    const n = new K([
      .../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...e.vaultRelayUrls])
    ]);
    try {
      const o = (await n.queryQuorum({
        kinds: [at, We],
        authors: [t.everydayPublicKey],
        limit: 10
      }, e.timeoutMs)).outcomes.flatMap((i) => i.events).filter((i) => i.pubkey === t.everydayPublicKey && V(i));
      return {
        everydayPublicKey: t.everydayPublicKey,
        profileFound: o.some((i) => i.kind === at),
        relayListFound: o.some((i) => i.kind === We)
      };
    } finally {
      n.closeAll();
    }
  } finally {
    E(t.recoveryPrivateKey, t.capsuleKey, t.everydayPrivateKey);
  }
}
async function ci(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = await ur(e.phrase);
  let r = !1;
  try {
    const o = await dr(n, e.vaultRelayUrls, e.timeoutMs), i = {
      schema: ht,
      account_id: x(Tn()),
      recovery_generation: 0,
      previous_recovery_event_id: null,
      operational_private_key: x(n.everydayPrivateKey),
      operational_public_key: n.everydayPublicKey,
      recovery_public_key: n.recoveryPublicKey,
      connection_vault_root: x(ee(32)),
      vault_sudo_key: x(ee(32)),
      created_at: o === null ? t : je(o, t),
      vault_relay_hints: Ce(e.vaultRelayUrls),
      protocol: {
        capsule_encryption: Se,
        recovery_derivation: Ne,
        ...xe(!0)
      }
    }, a = await Xt({
      recoveryPrivateKey: n.recoveryPrivateKey,
      capsuleKey: n.capsuleKey,
      payload: i
    }), s = new K(e.vaultRelayUrls, {
      authPrivateKey: n.recoveryPrivateKey
    });
    let c;
    try {
      c = await me(s, a, {
        dTag: Ge,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      s.closeAll();
    }
    if (!c.success)
      throw new ye("Could not publish the rebuilt recovery capsule to enough relays. Nothing else was changed; please retry.");
    const { generalRelays: l, dmRelays: u } = await lr(n.everydayPublicKey, [...e.discoveryRelayUrls, ...e.vaultRelayUrls], e.timeoutMs);
    return r = !0, {
      everydayPrivateKey: n.everydayPrivateKey,
      everydayPublicKey: n.everydayPublicKey,
      recoveryPrivateKey: n.recoveryPrivateKey,
      recoveryPublicKey: n.recoveryPublicKey,
      recoveryCapsuleKey: n.capsuleKey,
      accountId: i.account_id,
      currentRecoveryEvent: a,
      currentRecoveryPayload: i,
      generalRelays: l,
      dmRelays: u,
      everydayKeyDerived: !0
    };
  } finally {
    r || E(n.recoveryPrivateKey, n.capsuleKey, n.everydayPrivateKey);
  }
}
async function li(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = ft(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root
  } : {}, { locatorPrivateKey: a, capsuleKey: s } = await $e(e.newPassword, n);
  try {
    const c = k(a), l = new K(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let u;
    try {
      u = await Fe(l, c, s, e.timeoutMs);
    } finally {
      l.closeAll();
    }
    if (!u.quorumMet)
      throw new ye("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
    const y = u.best?.payload ?? null, w = y !== null && y.account_id === r.accountId && y.operational_public_key === r.everydayPublicKey && y.recovery_public_key === r.recoveryPublicKey && y.generation === 0 && y.recovery_capsule_event.id === r.currentRecoveryEvent.id;
    if (u.candidates.length > 0 && !w)
      throw new ye("Another account is already registered with that login name and password. Pick a different one.");
    const p = r.currentRecoveryPayload.recovery_generation + 1, g = {
      schema: ht,
      account_id: r.accountId,
      recovery_generation: p,
      previous_recovery_event_id: r.currentRecoveryEvent.id,
      operational_private_key: x(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      ...o,
      created_at: je(r.currentRecoveryEvent.created_at, t),
      vault_relay_hints: Ce(e.vaultRelayUrls),
      protocol: {
        capsule_encryption: Se,
        recovery_derivation: Ne,
        ...xe(r.everydayKeyDerived)
      }
    }, f = await Xt({
      recoveryPrivateKey: r.recoveryPrivateKey,
      capsuleKey: r.recoveryCapsuleKey,
      payload: g
    }), v = new K(e.vaultRelayUrls, {
      authPrivateKey: r.recoveryPrivateKey
    });
    let h;
    try {
      h = await me(v, f, {
        dTag: Ge,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      v.closeAll();
    }
    if (!h.success)
      throw new ye("Could not publish the refreshed recovery capsule to enough relays. No new credential was published; please retry.");
    r.currentRecoveryEvent = f, r.currentRecoveryPayload = g;
    const b = {
      schema: pt,
      account_id: r.accountId,
      generation: 0,
      operational_private_key: x(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      recovery_capsule_event: f,
      ...i,
      // A retry may be repairing a credential that reached only one relay.
      // It must replace that partial event deterministically on every relay.
      created_at: u.best ? je(u.best.event.created_at, t) : t,
      vault_relay_hints: Ce(e.vaultRelayUrls),
      protocol: {
        password_kdf: Zt,
        capsule_encryption: Se,
        recovery_derivation: Ne,
        ...xe(r.everydayKeyDerived)
      }
    }, m = await Yt({
      locatorPrivateKey: a,
      capsuleKey: s,
      payload: b
    }), P = new K(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let U;
    try {
      U = await me(P, m, {
        dTag: Te,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      P.closeAll();
    }
    if (!U.success)
      throw new ye("Could not publish the new credential capsule to enough relays. Please retry.");
    return e.store && await ho(e.store, r.everydayPublicKey, {
      generation: 0,
      recoveryGeneration: p
    }), {
      normalizedLoginName: n,
      locatorPublicKey: c,
      credentialEvent: m,
      refreshedRecoveryEvent: f,
      credentialPublish: U,
      recoveryPublish: h
    };
  } finally {
    E(a, s);
  }
}
function yr(e) {
  const t = k(e.privateKey);
  return Z({
    pubkey: t,
    created_at: e.createdAt,
    kind: ao,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function ui(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = ft(e.loginName), r = await $e(e.oldPassword, n), o = k(r.locatorPrivateKey), i = new K(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  });
  let a;
  try {
    a = await Fe(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!a.quorumMet)
    throw new be("quorum-not-met");
  if (!a.best)
    throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = a.best.payload, c = a.best.event, l = e.store ?? new cr(), u = await jt(l, s.operational_public_key);
  if (s.generation < u.generation && !e.acknowledgeRollback)
    throw new Dn(u.generation, s.generation);
  const y = await $e(e.newPassword, n), w = k(y.locatorPrivateKey), p = new K(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  });
  let g;
  try {
    g = await Fe(p, w, y.capsuleKey, e.timeoutMs);
  } finally {
    p.closeAll();
  }
  if (!g.quorumMet)
    throw new de("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (g.candidates.length > 0)
    throw new Mn("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = s.generation + 1, v = {
    schema: pt,
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
    vault_relay_hints: Ce(e.vaultRelayUrls),
    protocol: {
      password_kdf: Zt,
      capsule_encryption: Se,
      recovery_derivation: Ne,
      ...xe(ir(s))
    }
  }, h = await Yt({
    locatorPrivateKey: y.locatorPrivateKey,
    capsuleKey: y.capsuleKey,
    payload: v
  }), b = new K(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  }), m = await me(b, h, {
    dTag: Te,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (b.closeAll(), !m.success)
    throw new de("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const P = Vo({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: je(c.created_at, t)
  }), U = yr({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: c.id,
    deletedEventKind: W,
    createdAt: t
  }), R = new K(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  }), [N, S] = await Promise.all([
    R.publishAll(P, e.timeoutMs),
    R.publishAll(U, e.timeoutMs)
  ]);
  return R.closeAll(), await On(l, s.operational_public_key, {
    generation: f
  }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: w,
    newGeneration: f,
    recoveryPublicKey: s.recovery_public_key,
    recoveryCapsuleEvent: s.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: P,
    deletionRequestEvent: U,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: Re(N),
    deletionAcknowledgedCount: Re(S)
  };
}
const di = "bitlogin/connection-vault-root/v1", yi = "bitlogin/connection-vault-signing/v1", hi = "bitlogin/connection-record-encryption/v1", pi = "bitlogin/connection-vault-personal/v1", Kt = "bitlogin:connection:";
function fi(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return Wt(In(di), e);
}
function Ue(e) {
  return so(e, yi).scalar;
}
function hr(e) {
  const t = Ue(e);
  try {
    return k(t);
  } finally {
    E(t);
  }
}
function vi(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return Wt(In(pi), Le(e, t));
}
function pr(e, t) {
  const n = vt(t);
  return He(e, Le(te(hi), new Uint8Array([0]), n), 32);
}
function wi() {
  return x(ee(16));
}
function vt(e) {
  const t = ne(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function fr(e) {
  return vt(e), `${Kt}${e}`;
}
function vr(e) {
  if (!e.startsWith(Kt))
    return null;
  const t = e.slice(Kt.length);
  try {
    return vt(t), t;
  } catch {
    return null;
  }
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function gi(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function wn(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function bt(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function q(e, t, n = "") {
  const r = gi(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const a = n && `"${n}" `, s = i ? ` of length ${t}` : "", c = r ? `length=${o}` : `type=${typeof e}`, l = a + "expected Uint8Array" + s + ", got " + c;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function L(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function _e(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const re = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, bi = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, mi = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = bi(e[t]);
  return e;
}, B = re ? (e) => e : mi;
function _i(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function wr(e, t) {
  if (_i(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function ki(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const Ei = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (q(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      q(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && q(o[1], void 0, "AAD");
    const a = t(r, ...o), s = (u, y) => {
      if (y !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        q(y, void 0, "output");
      }
    };
    let c = !1;
    return {
      encrypt(u, y) {
        if (c)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return c = !0, q(u), s(a.encrypt.length, y), a.encrypt(u, y);
      },
      decrypt(u, y) {
        if (q(u), i && u.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return s(a.decrypt.length, y), a.decrypt(u, y);
      }
    };
  }
  return Object.assign(n, e), n;
};
function en(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (q(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !ce(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function ce(e) {
  return e.byteOffset % 4 === 0;
}
function we(e) {
  return Uint8Array.from(q(e));
}
const gr = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), Pi = B(L(gr("expand 16-byte k"))), Ki = B(L(gr("expand 32-byte k")));
function _(e, t) {
  return e << t | e >>> 32 - t;
}
const Me = 64, Ri = 16, Rt = 2 ** 32 - 1, gn = /* @__PURE__ */ Uint32Array.of();
function Ai(e, t, n, r, o, i, a, s) {
  const c = o.length, l = new Uint8Array(Me), u = L(l), y = re && ce(o) && ce(i), w = y ? L(o) : gn, p = y ? L(i) : gn;
  if (!re) {
    for (let g = 0; g < c; a++) {
      if (e(t, n, r, u, a, s), B(u), a >= Rt)
        throw new Error("arx: counter overflow");
      const f = Math.min(Me, c - g);
      for (let v = 0, h; v < f; v++)
        h = g + v, i[h] = o[h] ^ l[v];
      g += f;
    }
    return;
  }
  for (let g = 0; g < c; a++) {
    if (e(t, n, r, u, a, s), a >= Rt)
      throw new Error("arx: counter overflow");
    const f = Math.min(Me, c - g);
    if (y && f === Me) {
      const v = g / 4;
      if (g % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < Ri; h++)
        b = v + h, p[b] = w[b] ^ u[h];
      g += Me;
      continue;
    }
    for (let v = 0, h; v < f; v++)
      h = g + v, i[h] = o[h] ^ l[v];
    g += f;
  }
}
function Si(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: a } = ki({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return bt(o), bt(a), wn(i), wn(n), (s, c, l, u, y = 0) => {
    q(s, void 0, "key"), q(c, void 0, "nonce"), q(l, void 0, "data");
    const w = l.length;
    if (u = en(w, u, !1), bt(y), y < 0 || y >= Rt)
      throw new Error("arx: counter overflow");
    const p = [];
    let g = s.length, f, v;
    if (g === 32)
      p.push(f = we(s)), v = Ki;
    else if (g === 16 && n)
      f = new Uint8Array(32), f.set(s), f.set(s, 16), v = Pi, p.push(f);
    else
      throw q(s, 32, "arx key"), new Error("invalid key size");
    (!re || !ce(c)) && p.push(c = we(c));
    let h = L(f);
    if (r) {
      if (c.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const P = c.subarray(0, 16);
      if (re)
        r(v, h, L(P), h);
      else {
        const U = B(Uint32Array.from(v));
        r(U, h, L(P), h), _e(U), B(h);
      }
      c = c.subarray(16);
    } else re || B(h);
    const b = 16 - o;
    if (b !== c.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const P = new Uint8Array(12);
      P.set(c, i ? 0 : 12 - c.length), c = P, p.push(c);
    }
    const m = B(L(c));
    try {
      return Ai(e, v, h, m, l, u, y, a), u;
    } finally {
      _e(...p);
    }
  };
}
function Ni(e, t, n, r, o, i = 20) {
  let a = e[0], s = e[1], c = e[2], l = e[3], u = t[0], y = t[1], w = t[2], p = t[3], g = t[4], f = t[5], v = t[6], h = t[7], b = o, m = n[0], P = n[1], U = n[2], R = a, N = s, S = c, T = l, M = u, D = y, I = w, j = p, F = g, z = f, G = v, H = h, J = b, Y = m, X = P, Q = U;
  for (let ln = 0; ln < i; ln += 2)
    R = R + M | 0, J = _(J ^ R, 16), F = F + J | 0, M = _(M ^ F, 12), R = R + M | 0, J = _(J ^ R, 8), F = F + J | 0, M = _(M ^ F, 7), N = N + D | 0, Y = _(Y ^ N, 16), z = z + Y | 0, D = _(D ^ z, 12), N = N + D | 0, Y = _(Y ^ N, 8), z = z + Y | 0, D = _(D ^ z, 7), S = S + I | 0, X = _(X ^ S, 16), G = G + X | 0, I = _(I ^ G, 12), S = S + I | 0, X = _(X ^ S, 8), G = G + X | 0, I = _(I ^ G, 7), T = T + j | 0, Q = _(Q ^ T, 16), H = H + Q | 0, j = _(j ^ H, 12), T = T + j | 0, Q = _(Q ^ T, 8), H = H + Q | 0, j = _(j ^ H, 7), R = R + D | 0, Q = _(Q ^ R, 16), G = G + Q | 0, D = _(D ^ G, 12), R = R + D | 0, Q = _(Q ^ R, 8), G = G + Q | 0, D = _(D ^ G, 7), N = N + I | 0, J = _(J ^ N, 16), H = H + J | 0, I = _(I ^ H, 12), N = N + I | 0, J = _(J ^ N, 8), H = H + J | 0, I = _(I ^ H, 7), S = S + j | 0, Y = _(Y ^ S, 16), F = F + Y | 0, j = _(j ^ F, 12), S = S + j | 0, Y = _(Y ^ S, 8), F = F + Y | 0, j = _(j ^ F, 7), T = T + M | 0, X = _(X ^ T, 16), z = z + X | 0, M = _(M ^ z, 12), T = T + M | 0, X = _(X ^ T, 8), z = z + X | 0, M = _(M ^ z, 7);
  let O = 0;
  r[O++] = a + R | 0, r[O++] = s + N | 0, r[O++] = c + S | 0, r[O++] = l + T | 0, r[O++] = u + M | 0, r[O++] = y + D | 0, r[O++] = w + I | 0, r[O++] = p + j | 0, r[O++] = g + F | 0, r[O++] = f + z | 0, r[O++] = v + G | 0, r[O++] = h + H | 0, r[O++] = b + J | 0, r[O++] = m + Y | 0, r[O++] = P + X | 0, r[O++] = U + Q | 0;
}
const br = /* @__PURE__ */ Si(Ni, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), mr = 2, At = 1, _r = 65536, Ci = 4294967295, xi = 132, Ti = 99, St = 1024 * 1024;
function ut(e, t) {
  const n = Le(new Uint8Array([2]), Vt(t)), o = Ln.getSharedSecret(e, n, !0).slice(1, 33);
  return Wt(te("nip44-v2"), o);
}
function kr(e, t) {
  if (e.length !== 32)
    throw new Error("NIP-44 conversation key must be exactly 32 bytes.");
  if (t.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const n = He(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function tn(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
const Er = 39 + tn(St) + 32, Ii = Math.ceil(Er / 3) * 4;
function Li(e) {
  if (e < _r) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function Ui(e) {
  const t = e.length;
  if (t < At || t > St)
    throw new Error(`NIP-44 plaintext length must be between ${At} and ${St} bytes on this platform.`);
  const n = Li(t), r = tn(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function Mi(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < _r)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < At || r > Ci || e.length !== o + tn(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function Pr(e, t, n) {
  return Dt(Ot, e, Le(t, n));
}
function Nt(e, t) {
  return Di(e, t, ee(32));
}
function Di(e, t, n) {
  if (n.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const { chachaKey: r, chachaNonce: o, hmacKey: i } = kr(e, n), a = Ui(te(t)), s = br(r, o, a), c = Pr(i, n, s);
  return Ae.encode(Le(new Uint8Array([mr]), n, s, c));
}
function nn(e, t) {
  if (t.startsWith("#"))
    throw new Error("Unsupported NIP-44 non-base64 encoding.");
  if (t.length < xi || t.length > Ii)
    throw new Error("NIP-44 payload size is outside this platform's supported range.");
  const n = Ae.decode(t);
  if (n.length < Ti || n.length > Er)
    throw new Error("NIP-44 decoded payload size is outside this platform's supported range.");
  if (n[0] !== mr)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33);
  if (r.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const o = n.slice(n.length - 32), i = n.slice(33, n.length - 32), { chachaKey: a, chachaNonce: s, hmacKey: c } = kr(e, r), l = Pr(c, r, i);
  if (!co(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = br(a, s, i);
  return yt(Mi(u));
}
const fe = 16, Oi = 283;
function Vi(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function rn(e) {
  return e << 1 ^ Oi & -(e >> 7);
}
function Ke(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = rn(e);
  return n;
}
const Ct = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= rn(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return _e(e), t;
})(), qi = /* @__PURE__ */ Ct.map((e, t) => Ct.indexOf(t)), Bi = (e) => e << 24 | e >>> 8, mt = (e) => e << 8 | e >>> 24;
function Kr(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(mt), o = r.map(mt), i = o.map(mt), a = new Uint32Array(256 * 256), s = new Uint32Array(256 * 256), c = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const y = l * 256 + u;
      a[y] = n[l] ^ r[u], s[y] = o[l] ^ i[u], c[y] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: c, T0: n, T1: r, T2: o, T3: i, T01: a, T23: s };
}
const on = /* @__PURE__ */ Kr(Ct, (e) => Ke(e, 3) << 24 | e << 16 | e << 8 | Ke(e, 2)), Rr = /* @__PURE__ */ Kr(qi, (e) => Ke(e, 11) << 24 | Ke(e, 13) << 16 | Ke(e, 9) << 8 | Ke(e, 14)), Wi = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = rn(n))
    e[t] = n;
  return e;
})();
function Ar(e) {
  q(e);
  const t = e.length;
  Vi(e);
  const { sbox2: n } = on, r = [];
  (!re || !ce(e)) && r.push(e = we(e));
  const o = B(L(e)), i = o.length, a = (c) => ie(n, c, c, c, c), s = new Uint32Array(t + 28);
  s.set(o);
  for (let c = i; c < s.length; c++) {
    let l = s[c - 1];
    c % i === 0 ? l = a(Bi(l)) ^ Wi[c / i - 1] : i > 6 && c % i === 4 && (l = a(l)), s[c] = s[c - i] ^ l;
  }
  return _e(...r), s;
}
function $i(e) {
  const t = Ar(e), n = t.slice(), r = t.length, { sbox2: o } = on, { T0: i, T1: a, T2: s, T3: c } = Rr;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  _e(t);
  for (let l = 4; l < r - 4; l++) {
    const u = n[l], y = ie(o, u, u, u, u);
    n[l] = i[y & 255] ^ a[y >>> 8 & 255] ^ s[y >>> 16 & 255] ^ c[y >>> 24];
  }
  return n;
}
function he(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function ie(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function bn(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = on;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[c++] ^ he(a, s, t, n, r, o), v = e[c++] ^ he(a, s, n, r, o, t), h = e[c++] ^ he(a, s, r, o, t, n), b = e[c++] ^ he(a, s, o, t, n, r);
    t = f, n = v, r = h, o = b;
  }
  const u = e[c++] ^ ie(i, t, n, r, o), y = e[c++] ^ ie(i, n, r, o, t), w = e[c++] ^ ie(i, r, o, t, n), p = e[c++] ^ ie(i, o, t, n, r);
  return { s0: u, s1: y, s2: w, s3: p };
}
function ji(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = Rr;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[c++] ^ he(a, s, t, o, r, n), v = e[c++] ^ he(a, s, n, t, o, r), h = e[c++] ^ he(a, s, r, n, t, o), b = e[c++] ^ he(a, s, o, r, n, t);
    t = f, n = v, r = h, o = b;
  }
  const u = e[c++] ^ ie(i, t, o, r, n), y = e[c++] ^ ie(i, n, t, o, r), w = e[c++] ^ ie(i, r, n, t, o), p = e[c++] ^ ie(i, o, r, n, t);
  return { s0: u, s1: y, s2: w, s3: p };
}
function Fi(e) {
  if (q(e), e.length % fe !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + fe);
}
function zi(e, t, n) {
  q(e);
  let r = e.length;
  const o = r % fe;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let s = fe - o;
    s || (s = fe), r = r + s;
  }
  n = en(r, n), wr(e, n), (!re || !ce(e)) && (e = we(e));
  const i = L(e);
  B(i);
  const a = L(n);
  return { b: i, o: a, out: n };
}
function Gi(e, t) {
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
function Hi(e) {
  const t = new Uint8Array(16), n = L(t);
  t.set(e);
  const r = fe - e.length;
  for (let o = fe - r; o < fe; o++)
    t[o] = r;
  return n;
}
const Sr = /* @__PURE__ */ Ei({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, a) {
      const s = Ar(t), { b: c, o: l, out: u } = zi(i, o, a);
      let y = n;
      const w = [s];
      (!re || !ce(y)) && w.push(y = we(y));
      const p = L(y);
      B(p);
      let g = p[0], f = p[1], v = p[2], h = p[3], b = 0;
      for (; b + 4 <= c.length; )
        g ^= c[b + 0], f ^= c[b + 1], v ^= c[b + 2], h ^= c[b + 3], { s0: g, s1: f, s2: v, s3: h } = bn(s, g, f, v, h), l[b++] = g, l[b++] = f, l[b++] = v, l[b++] = h;
      if (o) {
        const m = Hi(i.subarray(b * 4));
        B(m), g ^= m[0], f ^= m[1], v ^= m[2], h ^= m[3], { s0: g, s1: f, s2: v, s3: h } = bn(s, g, f, v, h), l[b++] = g, l[b++] = f, l[b++] = v, l[b++] = h;
      }
      return B(l), _e(...w), u;
    },
    decrypt(i, a) {
      Fi(i);
      const s = $i(t);
      let c = n;
      const l = [s];
      (!re || !ce(c)) && l.push(c = we(c));
      const u = L(c);
      B(u), a = en(i.length, a), wr(i, a), (!re || !ce(i)) && l.push(i = we(i));
      const y = L(i), w = L(a);
      B(y);
      let p = u[0], g = u[1], f = u[2], v = u[3];
      for (let h = 0; h + 4 <= y.length; ) {
        const b = p, m = g, P = f, U = v;
        p = y[h + 0], g = y[h + 1], f = y[h + 2], v = y[h + 3];
        const { s0: R, s1: N, s2: S, s3: T } = ji(s, p, g, f, v);
        w[h++] = R ^ b, w[h++] = N ^ m, w[h++] = S ^ P, w[h++] = T ^ U;
      }
      return B(w), _e(...l), Gi(a, o);
    }
  };
});
function Nr(e, t) {
  const n = Le(new Uint8Array([2]), Vt(t));
  return Ln.getSharedSecret(e, n, !0).slice(1, 33);
}
function Ji(e, t, n) {
  return Yi(e, t, n, ee(16));
}
function Yi(e, t, n, r) {
  if (r.length !== 16)
    throw new Error("NIP-04 iv must be exactly 16 bytes.");
  const o = Nr(e, t), i = Sr(o, r).encrypt(te(n));
  return `${Ae.encode(i)}?iv=${Ae.encode(r)}`;
}
function Xi(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = Ae.decode(n.slice(0, r)), i = Ae.decode(n.slice(r + 4)), a = Nr(e, t), s = Sr(a, i).decrypt(o);
  return yt(s);
}
class rt {
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
    return this.assertAlive(), Z({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), Nt(ut(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), nn(ut(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Ji(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), Xi(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    E(this.privateKey), this.destroyed = !0;
  }
}
const Ye = null, Cr = [
  "wss://nos.lol",
  "wss://offchain.pub",
  "wss://nostr.bitcoiner.social",
  "wss://relay.mostr.pub",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://relay.damus.io",
  // Added 2026-11-18 after `scripts/relay-probe.mjs` measured the eight above
  // from one machine: nos.lol, relay.primal.net and relay.snort.social stored
  // everything; relay.mostr.pub and nostr-pub.wellorder.net never connected;
  // relay.damus.io connected about one time in eight; nostr.bitcoiner.social
  // intermittently refused capsule keys ("pubkey is not in our web of
  // trust"); and offchain.pub acknowledged and returned capsules, then held
  // only half of them minutes later. That is about four dependable relays,
  // and an account whose owner lost it to exactly this.
  //
  // NOTHING ABOVE IS REMOVED. Existing accounts live on those relays, and a
  // client that stopped asking them could no longer find those accounts.
  // These five each stored 8 of 8 capsule-shaped test events from throwaway
  // keys and still held all 8 on two later re-reads. That is minutes of
  // evidence, not months: re-run the probe before trusting any of them more.
  "wss://nostr.mom",
  "wss://relay.nostr.net",
  "wss://nostr-01.yakihonne.com",
  "wss://relay.nostr.wirednet.jp",
  "wss://nostr.sathoarder.com"
], xr = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net",
  // Added 2026-11-18: relay.nostr.band timed out and nostr-pub.wellorder.net
  // never connected in the same measurement, leaving two working lookups.
  "wss://nos.lol"
], Qi = [], Zi = /^[0-9a-f]{64}$/u, ea = 64;
function _t(e) {
  return Array.isArray(e) && e.length <= ea && e.every((t) => typeof t == "string" && Je(t)) && new Set(e).size === e.length;
}
function wt(e, t = Ye, n = -1) {
  if (!t || !Zi.test(t) || /^0{64}$/u.test(t) || !V(e) || e.pubkey !== t || e.kind !== W || Ie(e, "d") !== Un)
    return null;
  try {
    const r = JSON.parse(e.content);
    if (typeof r != "object" || r === null || Array.isArray(r))
      return null;
    const o = r;
    return !Number.isSafeInteger(o.version) || o.version < 1 || o.version <= n || !_t(o.vaultRelays) || !_t(o.discoveryRelays) || o.deprecated !== void 0 && !_t(o.deprecated) ? null : {
      version: o.version,
      vaultRelays: o.vaultRelays,
      discoveryRelays: o.discoveryRelays,
      ...o.deprecated === void 0 ? {} : { deprecated: o.deprecated }
    };
  } catch {
    return null;
  }
}
function ta(e) {
  return Math.max(0, e - 1);
}
function mn(e, t, n) {
  const r = t ? n === "vault" ? t.vaultRelays : t.discoveryRelays : [], o = new Set(t?.deprecated ?? []), i = new Set(e), a = [...new Set(r)].filter((s) => !o.has(s) && !i.has(s)).slice(0, ta(e.length));
  return [...e, ...a];
}
async function na(e, t = Ye, n = -1, r = 6e3) {
  if (!t || e.length === 0)
    return null;
  const o = new K([...e]);
  let i;
  try {
    i = (await o.queryQuorum({ kinds: [W], authors: [t], "#d": [Un], limit: 3 }, r)).outcomes.flatMap((c) => c.events);
  } finally {
    o.closeAll();
  }
  let a = null;
  for (const s of i) {
    const c = wt(s, t, n);
    c && (!a || c.version > a.list.version) && (a = { event: s, list: c });
  }
  return a;
}
const Tr = "bitlogin:bootstrap-relays:v1";
async function Ir(e, t = Ye) {
  if (!t)
    return null;
  try {
    const n = await e.get(Tr);
    return n ? wt(JSON.parse(n), t) : null;
  } catch {
    return null;
  }
}
function ot(e) {
  return {
    vaultRelays: mn(Cr, e, "vault"),
    discoveryRelays: mn(xr, e, "discovery"),
    listVersion: e?.version ?? null
  };
}
async function ra(e, t = {}) {
  const n = t.maintainerPubkeyHex === void 0 ? Ye : t.maintainerPubkeyHex, r = await Ir(e, n);
  if (!n)
    return ot(null);
  const o = ot(r), i = r?.version ?? -1;
  try {
    let a = await na(t.queryRelayUrls ?? [.../* @__PURE__ */ new Set([...o.vaultRelays, ...o.discoveryRelays])], n, i, t.timeoutMs);
    if (!a) {
      const s = await oa(t.httpsFallbackUrls ?? Qi, n, i), c = s ? wt(s, n, i) : null;
      s && c && (a = { event: s, list: c });
    }
    return a ? (await e.set(Tr, JSON.stringify(a.event)), ot(a.list)) : o;
  } catch {
    return o;
  }
}
async function oa(e, t = Ye, n = -1) {
  if (!t)
    return null;
  for (const r of e)
    try {
      if (new URL(r).protocol !== "https:")
        continue;
      const o = await fetch(r);
      if (!o.ok || Number(o.headers.get("content-length") ?? 0) > 1e6)
        continue;
      const a = await o.text();
      if (a.length > 1e6)
        continue;
      const s = JSON.parse(a);
      if (V(s) && wt(s, t, n))
        return s;
    } catch {
    }
  return null;
}
const an = /^[0-9a-f]{64}$/u, ia = 8, aa = 4096, sa = 256, ca = 512;
class ke extends Error {
  name = "BunkerUriParseError";
}
class la extends Error {
  name = "Nip46RequestTimeoutError";
  constructor(t, n) {
    super(`The remote signer did not answer ${t} within ${Math.round(n / 1e3)}s. It may be offline, or waiting for your approval on another device -- check your signer and try again.`);
  }
}
class ua extends Error {
  name = "Nip46ErrorResponse";
}
function da(e) {
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    return null;
  }
  const n = t.hostname === "localhost" || t.hostname === "127.0.0.1";
  return t.protocol === "https:" || t.protocol === "http:" && n ? t.toString() : null;
}
function ya(e) {
  if (e.length > aa)
    throw new ke("That bunker URI is unreasonably long.");
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    throw new ke("That doesn't look like a valid URI.");
  }
  if (t.protocol !== "bunker:")
    throw new ke("A remote-signer URI must start with bunker://");
  const n = (t.host || t.pathname.replace(/^\/+/u, "")).toLowerCase();
  if (!an.test(n))
    throw new ke("The bunker URI does not name a valid signer public key.");
  const r = [
    ...new Set(t.searchParams.getAll("relay").map((i) => i.trim()).filter((i) => i.length > 0 && i.length <= ca))
  ].slice(0, ia);
  if (r.length === 0)
    throw new ke("The bunker URI names no relays -- without at least one relay= parameter there is no way to reach the signer.");
  const o = t.searchParams.get("secret") ?? void 0;
  if (o && o.length > sa)
    throw new ke("The bunker URI's secret is unreasonably long.");
  return { signerPubkey: n, relayUrls: r, secret: o || void 0 };
}
function ha(e) {
  if (!an.test(e.clientPubkey))
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
const pa = 12e4;
class _n {
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
    this.clientSecretKey = t.clientSecretKey, this.clientPubkey = k(t.clientSecretKey), this.pointer = t.pointer, this.conversationKey = ut(t.clientSecretKey, t.pointer.signerPubkey), this.onAuthUrl = t.onAuthUrl, this.requestTimeoutMs = t.requestTimeoutMs ?? pa, this.conns = t.pointer.relayUrls.map((n) => new Ft(n, { authPrivateKey: t.clientSecretKey }));
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
        kinds: [et],
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
      n = JSON.parse(nn(this.conversationKey, t.content));
    } catch {
      return;
    }
    if (typeof n.id != "string")
      return;
    const r = this.pending.get(n.id);
    if (r) {
      if (n.result === "auth_url") {
        if (!r.authUrlSeen && typeof n.error == "string" && n.error) {
          const o = da(n.error);
          o && (r.authUrlSeen = !0, this.onAuthUrl?.(o));
        }
        return;
      }
      if (this.pending.delete(n.id), clearTimeout(r.timer), typeof n.error == "string" && n.error) {
        r.reject(new ua(n.error));
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
    const r = Be(ee(8)), o = Nt(this.conversationKey, JSON.stringify({ id: r, method: t, params: n })), i = [["p", this.pointer.signerPubkey]], a = Z({
      pubkey: this.clientPubkey,
      created_at: Math.floor(Date.now() / 1e3),
      kind: et,
      tags: i,
      content: o
    }, this.clientSecretKey), s = new Promise((u, y) => {
      const w = setTimeout(() => {
        this.pending.delete(r), y(new la(t, this.requestTimeoutMs));
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
    if (!an.test(t))
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
    if (!V(o))
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
      const t = Be(ee(8)), n = Nt(this.conversationKey, JSON.stringify({ id: t, method: "logout", params: [] }));
      return Z({
        pubkey: this.clientPubkey,
        created_at: Math.floor(Date.now() / 1e3),
        kind: et,
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
async function fa(e) {
  const t = k(e.clientSecretKey), n = e.timeoutMs, r = e.relayUrls.map((i) => new Ft(i, { authPrivateKey: e.clientSecretKey })), o = () => {
    for (const i of r)
      i.close();
  };
  return new Promise((i, a) => {
    let s = !1;
    const c = () => l(new Error("The signer-connection attempt was cancelled.")), l = (p) => {
      s || (s = !0, clearTimeout(u), e.signal?.removeEventListener("abort", c), o(), p instanceof Error ? a(p) : i(p));
    }, u = setTimeout(() => l(new Error(`No signer connected within ${Math.round(n / 1e3)}s. Scan or paste the connection code in your signer app, then try again.`)), n);
    if (e.signal?.aborted) {
      c();
      return;
    }
    e.signal?.addEventListener("abort", c, { once: !0 });
    const y = { kinds: [et], "#p": [t] }, w = (p) => {
      let g, f = null;
      try {
        f = ut(e.clientSecretKey, p.pubkey), g = JSON.parse(nn(f, p.content));
      } catch {
        return;
      } finally {
        f && E(f);
      }
      g.result === e.secret && l({ signerPubkey: p.pubkey });
    };
    Promise.allSettled(r.map((p) => p.subscribeLive(y, w))).then((p) => {
      p.some((g) => g.status === "fulfilled") || l(new Error("Could not reach any relay to listen for the signer."));
    });
  });
}
const Lr = "bitlogin.connection.v1", Ur = "bitlogin.connection.nwc.v1", kn = 120, va = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), wa = /* @__PURE__ */ new Set(["connectable", "personal"]);
class Ee extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function Mr(e, t) {
  return te(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function Dr(e) {
  const t = e, n = (i) => {
    throw new Ee(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== Lr && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), wa.has(t.tier) || n("tier must be connectable or personal."), va.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > kn) && n(`label must be a string of at most ${kn} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function kt(e) {
  Dr(e.record);
  const t = Ue(e.vaultPrk), n = k(t), r = fr(e.record.connection_id), o = pr(e.recordPrk, e.record.connection_id), i = await Gt(e.record, o, Mr(n, r));
  return Z({
    pubkey: n,
    created_at: je(e.previousCreatedAt, e.now),
    kind: W,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function ga(e, t, n) {
  if (!V(e))
    throw new Ee("Connection record event has an invalid id or signature.");
  const r = k(Ue(t));
  if (e.pubkey !== r)
    throw new Ee("Connection record event is not signed by this vault's identity.");
  const o = Ie(e, "d") ?? "", i = vr(o);
  if (i === null)
    throw new Ee("Connection record event has a malformed d tag.");
  const a = JSON.parse(e.content), s = Mr(e.pubkey, o), c = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const l of c) {
    let u;
    try {
      u = await Ht(a, pr(l.prk, i), s);
    } catch {
      continue;
    }
    if (Dr(u), u.connection_id !== i)
      throw new Ee("Connection record id does not match its d tag.");
    if (u.tier !== l.tier)
      throw new Ee("Connection record tier does not match the key that decrypted it.");
    return { record: u, tier: l.tier, event: e };
  }
  return null;
}
function ba(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const dt = /^[0-9a-f]{64}$/u;
class le extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function En(e) {
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
  if (!dt.test(r))
    throw new le("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let a = null, s = null;
  for (const [c, l] of n.searchParams.entries())
    if (c === "relay") {
      if (!Je(l))
        throw new le("An NWC relay must use secure WebSockets, except for an explicit loopback development endpoint.");
      o.push(l);
    } else if (c === "secret") {
      const u = l.toLowerCase();
      if (!dt.test(u))
        throw new le("The NWC URI's secret is not a 64-char hex client key.");
      a = u;
    } else c === "lud16" ? s = l : i.push([c, l]);
  if (o.length === 0)
    throw new le("The NWC URI names no relay.");
  if (a === null)
    throw new le("The NWC URI carries no secret.");
  return {
    schema: Ur,
    wallet_pubkey: r,
    relays: o,
    secret: a,
    lud16: s,
    extra_params: i
  };
}
function ma(e) {
  Or(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function _a(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function Or(e) {
  const t = e, n = (r) => {
    throw new le(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== Ur && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !dt.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), t.relays.some((r) => !Je(r)) && n("NWC relays must use secure WebSockets, except for explicit loopback development endpoints."), (typeof t.secret != "string" || !dt.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
const ka = "bitlogin:vault-hwm:v2:", Ea = "bitlogin/vault-hwm-index/v2", Vr = "bitlogin/vault-hwm-encryption/v2", Pa = /^[0-9a-f]{64}$/u;
class pe extends Error {
  constructor() {
    super("The local Connection Vault rollback marker is invalid or has been tampered with."), this.name = "RecordHighWaterMarkError";
  }
}
function sn(e) {
  if (!e || typeof e != "object")
    return !1;
  const t = e;
  return Number.isInteger(t.createdAt) && (t.createdAt ?? -1) >= 0 && typeof t.eventId == "string" && Pa.test(t.eventId);
}
function qr(e, t) {
  vt(t);
  const n = He(e, Ea, 32), r = te(t);
  try {
    return `${ka}${x(Dt(Ot, n, r))}`;
  } finally {
    E(n, r);
  }
}
function Ka(e, t) {
  return `bitlogin:vault-hwm:${hr(e)}:${t}`;
}
async function Ra(e, t, n) {
  const r = He(e, Vr, 32), o = te(JSON.stringify(n)), i = te(t);
  try {
    const a = await qn(r, o, i), s = {
      v: 2,
      nonce: x(a.nonce),
      ciphertext: x(a.ciphertext)
    };
    return JSON.stringify(s);
  } finally {
    E(r, o, i);
  }
}
async function Aa(e, t, n) {
  const r = He(e, Vr, 32), o = te(t);
  let i;
  try {
    const a = JSON.parse(n);
    if (a.v !== 2 || typeof a.nonce != "string" || typeof a.ciphertext != "string")
      throw new pe();
    i = await Bn(r, ne(a.nonce), ne(a.ciphertext), o);
    const s = JSON.parse(yt(i));
    if (!sn(s))
      throw new pe();
    return s;
  } catch (a) {
    throw a instanceof pe ? a : new pe();
  } finally {
    E(r, o), i && E(i);
  }
}
async function Br(e, t, n, r) {
  const o = qr(t, n);
  await e.set(o, await Ra(t, o, r));
}
async function Wr(e, t, n) {
  const r = qr(t, n), o = await e.get(r);
  if (o !== void 0)
    return Aa(t, r, o);
  const i = Ka(t, n), a = await e.get(i);
  if (a === void 0)
    return null;
  try {
    const s = JSON.parse(a);
    if (!sn(s))
      throw new pe();
    return await Br(e, t, n, s), await e.delete(i), s;
  } catch (s) {
    throw s instanceof pe ? s : new pe();
  }
}
async function $r(e, t, n, r) {
  if (!sn(r))
    throw new pe();
  const o = await Wr(e, t, n);
  o && Pt({ created_at: r.createdAt, id: r.eventId }, { created_at: o.createdAt, id: o.eventId }) <= 0 || await Br(e, t, n, r);
}
async function Sa(e) {
  const t = Ue(e.vaultPrk), n = new K(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await me(n, e.event, {
      dTag: fr(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll(), E(t);
  }
  return r.success && await $r(e.store, e.vaultPrk, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const Pn = 500;
async function Na(e) {
  const t = Ue(e.vaultPrk), n = k(t), r = new K(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [W], authors: [n], limit: Pn }, e.timeoutMs);
  } finally {
    r.closeAll(), E(t);
  }
  const i = o.outcomes.some((l) => l.events.length >= Pn), a = /* @__PURE__ */ new Map();
  for (const l of o.outcomes.flatMap((u) => u.events)) {
    if (!V(l) || l.pubkey !== n)
      continue;
    const u = vr(Ie(l, "d") ?? "");
    if (u === null)
      continue;
    const y = a.get(u);
    (!y || Pt(l, y) > 0) && a.set(u, l);
  }
  const s = /* @__PURE__ */ new Map(), c = [];
  for (const [l, u] of a) {
    const y = await Wr(e.store, e.vaultPrk, l);
    if (y !== null && Pt(u, {
      created_at: y.createdAt,
      id: y.eventId
    }) < 0) {
      c.push(l);
      continue;
    }
    s.set(l, u), await $r(e.store, e.vaultPrk, l, {
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
class Ca {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = fi(this.connectionVaultRoot), this.vaultPublicKey = hr(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = vi(this.connectionVaultRoot, t), E(t);
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
      schema: Lr,
      connection_id: wi(),
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
    }, o = await kt({
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
    }, a = await kt({
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
    const r = n ?? Math.floor(Date.now() / 1e3), o = ba(t.record, r), i = await kt({
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
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : ga(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return yr({
      privateKey: Ue(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: W,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return Sa({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return Na({ vaultPrk: this.vaultPrk, ...t });
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
const xa = "bitlogin", ue = "kv", oe = "device-keys", Ta = 2;
function Ia() {
  return new Promise((e, t) => {
    const n = indexedDB.open(xa, Ta);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(ue) || r.createObjectStore(ue), r.objectStoreNames.contains(oe) || r.createObjectStore(oe);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class La {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Ia()), this.dbPromise;
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
      const s = n.transaction(oe, "readonly").objectStore(oe).get(t);
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
        const s = n.transaction(oe, "readwrite");
        s.objectStore(oe).add(o, t), s.oncomplete = () => i(), s.onerror = () => a(s.error);
      }), o;
    } catch {
      const i = await new Promise((a, s) => {
        const c = n.transaction(oe, "readonly").objectStore(oe).get(t);
        c.onsuccess = () => a(c.result), c.onerror = () => s(c.error);
      });
      if (i) return i;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(oe, "readwrite");
      i.objectStore(oe).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
}
const ze = "bitlogin:session:v1", cn = "bitlogin:session-device-key:v1";
function Kn(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function Rn(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function An(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function Ua(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function Ma(e, t) {
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
    ...t.vaultEnabled !== void 0 ? { vaultEnabled: t.vaultEnabled } : {},
    ...t.everydayKeyDerived !== void 0 ? { everydayKeyDerived: t.everydayKeyDerived } : {}
  };
  try {
    if (typeof e.getOrCreateDeviceKey != "function") {
      await e.delete(ze);
      return;
    }
    const r = await e.getOrCreateDeviceKey(cn), o = crypto.getRandomValues(new Uint8Array(12)), i = new TextEncoder().encode(JSON.stringify(n)), a = await crypto.subtle.encrypt({ name: "AES-GCM", iv: o }, r, i), s = {
      v: 2,
      iv: Kn(o),
      ciphertext: Kn(new Uint8Array(a))
    };
    await e.set(ze, JSON.stringify(s));
  } catch {
  }
}
async function Da(e) {
  let t;
  try {
    t = await e.get(ze);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    if (!Ua(n) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(ze), null;
    const r = await e.getOrCreateDeviceKey(cn), o = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: An(Rn(n.iv)) },
      r,
      An(Rn(n.ciphertext))
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
      ...typeof i.vaultEnabled == "boolean" ? { vaultEnabled: i.vaultEnabled } : {},
      ...typeof i.everydayKeyDerived == "boolean" ? { everydayKeyDerived: i.everydayKeyDerived } : {}
    };
  } catch {
    return null;
  }
}
async function Oa(e) {
  try {
    await e.delete(ze), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(cn);
  } catch {
  }
}
const jr = "bitlogin:session-public:v1";
async function Va(e, t) {
  try {
    const n = {
      pubkey: t.pubkey,
      npub: t.npub,
      ...t.name ? { name: t.name } : {}
    };
    await e.set(jr, JSON.stringify(n));
  } catch {
  }
}
async function qa(e) {
  try {
    await e.delete(jr);
  } catch {
  }
}
class Ba {
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
  everydayKeyDerived: !1,
  connectionVaultRoot: null,
  vaultKnown: !1,
  vault: null
};
let C = [...Cr], Pe = [...xr];
const $ = new La();
let xt = !1, Tt = !1;
function Sn(e) {
  xt || (C = e.vaultRelays), Tt || (Pe = e.discoveryRelays);
}
const Wa = new Ba();
function ae() {
  if (!d.signer || !d.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: d.signer, everydayPrivateKey: d.everydayPrivateKey };
}
function qe() {
  d.signer?.destroy(), d.everydayPrivateKey && d.everydayPrivateKey.fill(0), d.signer = null, d.everydayPrivateKey = null, d.accountId = null, d.recoveryPublicKey = null, d.activeCredentialEvent = null, d.activeRecoveryEvent = null, d.everydayKeyDerived = !1, d.vault?.destroy(), d.vault = null, d.connectionVaultRoot && d.connectionVaultRoot.fill(0), d.connectionVaultRoot = null, d.vaultKnown = !1, d.pendingRecovery && (d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery.everydayPrivateKey.fill(0), d.pendingRecovery = null);
}
function Nn(e) {
  return qe(), d.pendingRecovery = e, d.signer = new rt(e.everydayPrivateKey), d.everydayPrivateKey = e.everydayPrivateKey, d.accountId = e.accountId, d.recoveryPublicKey = e.recoveryPublicKey, d.activeRecoveryEvent = e.currentRecoveryEvent, d.everydayKeyDerived = e.everydayKeyDerived, It(
    e.currentRecoveryPayload.connection_vault_root ? ne(e.currentRecoveryPayload.connection_vault_root) : void 0
  ), {
    everydayPublicKey: e.everydayPublicKey,
    accountId: e.accountId,
    generalRelays: e.generalRelays,
    dmRelays: e.dmRelays,
    chainWarning: e.chainWarning,
    everydayKeyDerived: e.everydayKeyDerived
  };
}
function It(e, t) {
  d.connectionVaultRoot = e ?? null, d.vaultKnown = !0, d.vault = null, t && E(t);
}
async function Qe() {
  !d.everydayPrivateKey || !d.accountId || !d.recoveryPublicKey || !d.activeCredentialEvent || !d.activeRecoveryEvent || (await Ma($, {
    everydayPrivateKey: d.everydayPrivateKey,
    accountId: d.accountId,
    recoveryPublicKey: d.recoveryPublicKey,
    activeCredentialEvent: d.activeCredentialEvent,
    activeRecoveryEvent: d.activeRecoveryEvent,
    ...d.connectionVaultRoot ? { connectionVaultRoot: d.connectionVaultRoot } : {},
    ...d.vaultKnown ? { vaultEnabled: d.connectionVaultRoot !== null } : {},
    everydayKeyDerived: d.everydayKeyDerived
  }), await Fr());
}
async function Fr() {
  if (!d.signer) return;
  const e = d.signer.getPublicKey();
  await Va($, { pubkey: e, npub: tt(e) });
}
function De() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function Lt() {
  if (!d.signer) throw new Error("No identity is unlocked in this session.");
  if (!d.connectionVaultRoot)
    throw new Error(
      d.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return d.vault ??= new Ca(d.connectionVaultRoot.slice()), d.vault;
}
function Oe(e) {
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
async function it() {
  const e = Lt(), t = await e.listConnections({ relayUrls: C, store: $ });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings,
    unreadable: t.unreadable,
    truncated: t.truncated,
    quorumMet: t.quorumMet
  };
}
async function Et(e) {
  const { vault: t, connections: n } = await it(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
let ge = null, se = null;
function Cn(e) {
  self.postMessage({ notify: "nip46-auth-url", url: e });
}
function Ve() {
  if (!ge) throw new Error("No remote signer is connected.");
  return ge;
}
function Ze() {
  se && (se.abort.abort(), E(se.clientSecretKey), se = null);
}
function zr(e) {
  const t = e.buildLogoutEvent();
  e.close(), t && e.publishCourtesy(t);
}
function xn(e, t) {
  ge && zr(ge.client), ge = { client: e, userPubkey: t };
}
async function $a(e, t) {
  switch (e) {
    case "nip46Connect": {
      const r = ya(t.uri), o = new _n({
        clientSecretKey: dn(),
        pointer: r,
        onAuthUrl: Cn
      });
      try {
        await o.connect();
        const i = await o.getUserPublicKey();
        return xn(o, i), Ze(), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46NostrconnectStart": {
      const n = t, r = C.slice(0, 2);
      Ze();
      const o = dn(), i = Be(ee(16));
      return se = { clientSecretKey: o, relayUrls: r, secret: i, abort: new AbortController() }, { uri: ha({
        clientPubkey: k(o),
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
        ({ signerPubkey: r } = await fa({
          clientSecretKey: n.clientSecretKey,
          relayUrls: n.relayUrls,
          secret: n.secret,
          timeoutMs: 18e4,
          signal: n.abort.signal
        }));
      } catch (i) {
        throw se === n && Ze(), i;
      }
      if (se !== n) throw new Error("This signer-connection attempt was superseded.");
      se = null;
      const o = new _n({
        clientSecretKey: n.clientSecretKey,
        pointer: { signerPubkey: r, relayUrls: n.relayUrls },
        onAuthUrl: Cn
      });
      try {
        const i = await o.getUserPublicKey();
        return xn(o, i), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46SignEvent": {
      const n = t;
      return Ve().client.signEvent({
        kind: n.kind,
        content: n.content,
        tags: n.tags ?? [],
        created_at: n.created_at ?? Math.floor(Date.now() / 1e3)
      });
    }
    case "nip46Nip44Encrypt": {
      const n = t;
      return { ciphertext: await Ve().client.nip44Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip44Decrypt": {
      const n = t;
      return { plaintext: await Ve().client.nip44Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Nip04Encrypt": {
      const n = t;
      return { ciphertext: await Ve().client.nip04Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip04Decrypt": {
      const n = t;
      return { plaintext: await Ve().client.nip04Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Disconnect": {
      const n = ge;
      return ge = null, Ze(), n && zr(n.client), {};
    }
    case "configure": {
      const n = t;
      return xt = !!n.vaultRelayUrls?.length, Tt = !!n.discoveryRelayUrls?.length, n.vaultRelayUrls?.length && (C = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (Pe = n.discoveryRelayUrls), Sn(ot(await Ir($))), (!xt || !Tt) && ra($).then(Sn, () => {
      }), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await oi({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: C }) : await ar({ loginName: n.loginName, password: n.password, vaultRelayUrls: C });
      return qe(), d.signer = new rt(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryEvent, d.everydayKeyDerived = r.everydayKeyDerived, It(r.connectionVaultRoot, r.vaultSudoKey), await Qe(), {
        recoveryPhrase: r.recoveryPhrase,
        everydayPublicKey: r.everydayPublicKey,
        recoveryPublicKey: r.recoveryPublicKey,
        accountId: r.accountId,
        imported: r.imported,
        everydayKeyDerived: r.everydayKeyDerived,
        credentialEventId: r.credentialEvent.id,
        recoveryEventId: r.recoveryEvent.id
      };
    }
    case "previewImportKey": {
      const r = sr(t.nsecOrHex), o = k(r), i = { everydayPublicKey: o, npub: tt(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await ii({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: C,
        store: $,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return qe(), d.signer = new rt(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryCapsuleEvent, d.everydayKeyDerived = r.everydayKeyDerived, It(r.connectionVaultRoot, r.vaultSudoKey), await Qe(), !r.rollbackWarning && !r.relayDisagreementWarning && pn({
        relayUrls: C,
        credentialEvent: r.credentialEvent,
        recoveryEvent: r.recoveryCapsuleEvent
      }).catch(() => {
      }), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        everydayKeyDerived: r.everydayKeyDerived,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await ai({
        phrase: n.phrase,
        vaultRelayUrls: C,
        discoveryRelayUrls: Pe,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return Nn(r);
    }
    case "previewPhraseRebuild": {
      const r = await si({ phrase: t.phrase, vaultRelayUrls: C, discoveryRelayUrls: Pe });
      return { ...r, npub: tt(r.everydayPublicKey) };
    }
    case "rebuildFromPhrase": {
      const r = await ci({ phrase: t.phrase, vaultRelayUrls: C, discoveryRelayUrls: Pe });
      return Nn(r);
    }
    case "completeRecovery": {
      const n = t;
      if (!d.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await li({
        recovered: d.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: C,
        store: $
      });
      return d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.refreshedRecoveryEvent, d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery = null, await Qe(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await ui({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: C,
        store: $,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return d.activeCredentialEvent = r.newCredentialEvent, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.recoveryCapsuleEvent, await Qe(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = ae();
      return Ao({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: Pe
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
      return { nsec: uo(n), npub: tt(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (ae(), !d.recoveryPublicKey || !d.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return lo({
        recoveryPublicKeyHex: d.recoveryPublicKey,
        vaultRelayUrls: C,
        recoveryCapsuleEvents: [d.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return pn({
        relayUrls: C,
        credentialEvent: d.activeCredentialEvent,
        recoveryEvent: d.activeRecoveryEvent
      });
    }
    case "checkReplicaHealth": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return jo({
        relayUrls: C,
        credentialEvent: d.activeCredentialEvent,
        recoveryEvent: d.activeRecoveryEvent
      });
    }
    case "getSessionStatus":
      return { unlocked: !!d.signer, everydayPublicKey: d.signer?.getPublicKey() };
    // Called once, right after "configure", before the widget renders its welcome
    // screen -- restores whatever persistSession() last cached for this origin, so
    // a page reload doesn't ask for the login name + password again. A missing or
    // corrupt cache is not an error: it just means the widget falls through to its
    // normal welcome screen, exactly like it always has.
    case "restoreSession": {
      const n = await Da($);
      return n ? (qe(), d.signer = new rt(n.everydayPrivateKey), d.everydayPrivateKey = n.everydayPrivateKey, d.accountId = n.accountId, d.recoveryPublicKey = n.recoveryPublicKey, d.activeCredentialEvent = n.activeCredentialEvent, d.activeRecoveryEvent = n.activeRecoveryEvent, d.everydayKeyDerived = n.everydayKeyDerived ?? !1, d.connectionVaultRoot = n.connectionVaultRoot ?? null, d.vaultKnown = n.vaultEnabled !== void 0, await Fr(), {
        restored: !0,
        everydayPublicKey: d.signer.getPublicKey(),
        accountId: n.accountId,
        everydayKeyDerived: d.everydayKeyDerived
      }) : { restored: !1 };
    }
    case "logout":
      return qe(), await Oa($), await qa($), {};
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return d.signer ? d.connectionVaultRoot ? { enabled: !0, vaultPublicKey: Lt().vaultPublicKey } : { enabled: !1, reason: d.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a } = await it();
      return { connections: n.map(Oe), rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a };
    }
    case "vaultSaveNwc": {
      const n = t, r = De(), o = Lt(), i = En(n.uri), a = n.label.trim().slice(0, 120) || "Wallet connection", { record: s, event: c } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: a,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: c,
        connectionId: s.connection_id,
        relayUrls: C,
        store: $
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const u = await o.decryptEvent(c);
      return Oe(u);
    }
    case "vaultFindForOrigin": {
      const n = De(), { connections: r } = await it(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? Oe(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await Et(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== De())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return Or(i), { uri: ma(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await Et(n.connectionId), i = n.origin === null ? null : De(), { record: a, event: s } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: s,
        connectionId: a.connection_id,
        relayUrls: C,
        store: $
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const l = await r.decryptEvent(s);
      return Oe(l);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await Et(n.connectionId), { record: i, event: a } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: a,
        connectionId: i.connection_id,
        relayUrls: C,
        store: $
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const c = r.buildDeletionRequest(o.event.id), l = new K(C);
        await l.publishAll(c), l.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = De(), o = En(n.uri), { connections: i } = await it(), a = i.find(
        (s) => s.record.connection_type === "nwc" && _a(s.record.credential, o)
      );
      return a ? a.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: Oe(a) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const ja = /* @__PURE__ */ new Set([
  "configure",
  "register",
  "previewImportKey",
  "login",
  "recover",
  "previewPhraseRebuild",
  "rebuildFromPhrase",
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
  "checkReplicaHealth",
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
  if (typeof t.action != "string" || !ja.has(t.action)) {
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
  (r.startsWith("nip46") ? (a) => a() : (a) => Wa.run(a))(() => $a(r, o)).then(
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
