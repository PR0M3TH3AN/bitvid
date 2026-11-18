import { v as W, g as _, s as Z, b as Ve, a as ee, K as Tr, j as nt, k as qe, l as Ct, m as X, u as te, n as Ur, o as Mr, d as x, q as ne, t as ct, S as lt, w as Nt, x as ut, D as Se, y as ze, z as Fe, A as Lr, B as Dr, C as Or, F as Vr, G as pt, H as nn, I as St, J as qr, L as Wr, M as jr, N as He, O as xt, P as $r, Q as Br, T as It, U as dt, V as We, W as zr, X as Tt, Y as Ut, Z as E, _ as En, $ as Fr, h as Mt, a0 as Pn, a1 as xe, a2 as Gr, c as Ge, a3 as Kn, a4 as Re, a5 as Hr, a6 as Xe, a7 as bt, a8 as Jr, f as Qe, a9 as Yr, aa as rn } from "./bitlogin-shared-B-lZFF_w.js";
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
class Rn extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class ye extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class An extends Error {
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
const Xr = { generation: -1, recoveryGeneration: -1 };
function Lt(e) {
  return `bitlogin:hwm:${e}`;
}
async function Dt(e, t) {
  const n = await e.get(Lt(t));
  return n ? JSON.parse(n) : Xr;
}
async function Cn(e, t, n) {
  const r = await Dt(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(Lt(t), JSON.stringify(o)), o;
}
async function Qr(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set(Lt(t), JSON.stringify(n));
}
function Zr(e) {
  const t = e.split(".");
  if (t.length !== 4 || t.some((r) => !/^\d{1,3}$/u.test(r)))
    return !1;
  const n = t.map(Number);
  return n.every((r) => r >= 0 && r <= 255) && n[0] === 127;
}
function yt(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.username || t.password || t.hash ? !1 : t.protocol === "wss:" ? !0 : t.protocol !== "ws:" ? !1 : t.hostname === "localhost" || t.hostname === "[::1]" || Zr(t.hostname);
}
function eo() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
const rt = 1e3, to = 262144;
function no(e) {
  const t = Math.min(e.limit ?? rt, rt);
  return Math.max(50, t * 3);
}
const ro = 2048, oo = 1e4, io = 100;
function ao(e, t) {
  if (e.size >= ro) {
    const n = e.values().next().value;
    n !== void 0 && e.delete(n);
  }
  e.add(t);
}
class Ot {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    if (!yt(t))
      throw new Error("Relay URL must use secure WebSockets, except for an explicit loopback development endpoint.");
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = eo(), o = new r(this.url);
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
    if (t.length > to)
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
        if (u - s.liveWindowStart >= oo && (s.liveWindowStart = u, s.liveVerifies = 0), s.liveVerifies >= io || (s.liveVerifies++, !W(a) || !on(a, s.filter)))
          return;
        ao(s.seenIds, a.id), s.onEvent(a);
        return;
      }
      const l = Math.min(s.filter.limit ?? rt, rt);
      if (s.events.length >= l || s.verifyBudget <= 0 || (s.verifyBudget--, !W(a) || !on(a, s.filter)))
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
    const n = _(this.authPrivateKey), r = Z({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Tr,
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
    const r = Ve(ee(8));
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
    const r = Ve(ee(8));
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
        verifyBudget: no(t),
        liveWindowStart: 0,
        liveVerifies: 0,
        filter: t,
        onEose: () => s()
      }), this.send(["REQ", r, t]);
    });
  }
}
function on(e, t) {
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
class A {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Ot(r, n));
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
function Ke(e) {
  return e.filter((t) => t.result.ok).length;
}
function so(e, t, n) {
  return Z({ pubkey: _(e), created_at: n, kind: nt, tags: [], content: JSON.stringify(t) }, e);
}
function co(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return Z({ pubkey: _(e), created_at: n, kind: qe, tags: r, content: "" }, e);
}
function lo(e, t, n) {
  return Z({
    pubkey: _(e),
    created_at: n,
    kind: Ct,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function uo(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function yo(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function ho(e) {
  const t = _(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new A(r), [i, a, s] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [nt] }),
    o.queryQuorum({ authors: [t], kinds: [qe] }),
    o.queryQuorum({ authors: [t], kinds: [Ct] })
  ]);
  o.closeAll();
  const c = i.outcomes.some((f) => f.events.length > 0), l = a.outcomes.some((f) => f.events.length > 0), u = s.outcomes.some((f) => f.events.length > 0), y = new A(r);
  let w = null, p = null, g = null;
  const v = [];
  if (!c && (e.name || e.about || e.picture)) {
    const f = so(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    v.push(y.publishAll(f).then((h) => void (w = h)));
  }
  if (!l) {
    const f = co(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    v.push(y.publishAll(f).then((h) => void (p = h)));
  }
  if (!u) {
    const f = lo(e.everydayPrivateKey, e.dmRelays, n);
    v.push(y.publishAll(f).then((h) => void (g = h)));
  }
  return await Promise.all(v), y.closeAll(), {
    profilePublished: w !== null && Ke(w) > 0,
    relayListAcknowledgedCount: p !== null ? Ke(p) : 0,
    dmRelayListAcknowledgedCount: g !== null ? Ke(g) : 0,
    profileSkippedExisting: c,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function me(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), a = Ke(i), c = (await e.queryQuorum({ kinds: [X], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: a,
    readbackVerifiedCount: c,
    success: a >= r && c >= o
  };
}
function po(e) {
  const t = Ur(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function vo(e) {
  return te(po(e));
}
const Ze = [1024, 2048, 4096], fe = 4;
function fo(e) {
  const t = fe + e.length, n = Ze.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${Ze[Ze.length - 1]} bytes minus ${fe}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, fe), r;
}
function wo(e) {
  if (!Ze.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - fe)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(fe, fe + n), o = e.slice(fe + n);
  for (const i of o)
    if (i !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Vt() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function Nn(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Vt().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function Sn(e, t, n) {
  const r = Mr(), o = await Nn(e), i = await Vt().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function xn(e, t, n, r) {
  const o = await Nn(e);
  try {
    const i = await Vt().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function In(e) {
  return te(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function Tn(e) {
  return te(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function qt(e, t, n) {
  const r = vo(e), o = fo(r), i = await Sn(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: x(i.nonce),
    ciphertext: x(i.ciphertext)
  };
}
async function Wt(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = ne(e.nonce), o = ne(e.ciphertext), i = await xn(t, r, o, n), a = wo(i);
  return JSON.parse(ct(a));
}
class jt extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const go = 1e6, bo = /^[0-9a-f]{64}$/u;
function R(e, t) {
  if (!e)
    throw new jt(t);
}
function ot(e) {
  return typeof e == "string" && bo.test(e);
}
function Un(e) {
  R(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e)
    R(typeof t == "string", "Each relay hint must be a string (§12.4.7)."), R(yt(t), `Relay URL must use secure WebSockets, except for an explicit loopback development endpoint (§12.4.7): ${t}`);
}
function Mn(e) {
  R(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = ne(e);
  } catch {
    throw new jt("account_id is not valid base64url (§12.4.2).");
  }
  R(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function Ln(e, t) {
  R(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = ne(e);
  R(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), R(Nt(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), R(ot(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = _(n);
  R(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function it(e, t) {
  R(typeof t == "string", `${e} must be a string (§CV5.2).`);
  let n;
  try {
    n = ne(t);
  } catch {
    throw new jt(`${e} is not valid base64url (§CV5.2).`);
  }
  R(n.length === 32, `${e} must decode to exactly 32 bytes (§CV5.2).`);
}
function mo(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (R(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2)."), it("connection_vault_root", t), it("vault_sudo_key", n));
}
function ko(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (R(t !== void 0, "vault_sudo_key cannot appear without connection_vault_root (§CV5.2)."), it("connection_vault_root", t), n !== void 0 && it("vault_sudo_key", n));
}
function Dn(e, t) {
  R(Number.isInteger(e) && e >= 0 && e <= go, `${t} is out of supported bounds (§12.4.8).`);
}
function _o(e) {
  R(e.schema === ut, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), Mn(e.account_id), Dn(e.generation, "generation"), Ln(e.operational_private_key, e.operational_public_key), R(ot(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), Un(e.vault_relay_hints), ko(e);
  const t = e.recovery_capsule_event;
  R(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), R(W(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), R(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Eo(e) {
  R(e.schema === lt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), Mn(e.account_id), Dn(e.recovery_generation, "recovery_generation"), R(e.previous_recovery_event_id === null || ot(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), Ln(e.operational_private_key, e.operational_public_key), R(ot(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), Un(e.vault_relay_hints), mo(e);
}
function Po(e) {
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
async function $t(e) {
  const t = _(e.locatorPrivateKey), n = await qt(e.payload, e.capsuleKey, In(t));
  return Z({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: X,
    tags: [["d", Se]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function Ko(e) {
  const t = _(e.oldLocatorPrivateKey);
  return Z({
    pubkey: t,
    created_at: e.createdAt,
    kind: X,
    tags: [["d", Se]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Ro(e, t) {
  if (!W(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Wt(n, t, In(e.pubkey));
  return _o(r), r;
}
async function Bt(e) {
  const t = _(e.recoveryPrivateKey), n = await qt(e.payload, e.capsuleKey, Tn(t));
  return Z({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: X,
    tags: [["d", ze]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function On(e, t) {
  if (!W(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Wt(n, t, Tn(e.pubkey));
  return Eo(r), r;
}
function an(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === X && Fe(o, "d") === n && W(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function Vn(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [X], authors: [t], "#d": [n], limit: 5 }, o), a = i.outcomes.flatMap((w) => w.events), s = an(a, t, n), c = [];
  for (const w of s)
    try {
      const p = await r(w);
      c.push({ event: w, payload: p });
    } catch (p) {
      c.push({ event: w, payload: null, error: p.message });
    }
  const l = c.find((w) => w.payload !== null) ?? null, u = i.outcomes.map((w) => ({
    responded: w.responded,
    events: an(w.events, t, n)
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
async function $e(e, t, n, r = 8e3) {
  return Vn(e, t, Se, (o) => Ro(o, n), r);
}
async function qn(e, t, n, r = 8e3) {
  return Vn(e, t, ze, (o) => On(o, n), r);
}
function Ao(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : Po(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function sn(e) {
  const t = [...new Set(e.relayUrls)], n = async (s) => {
    const c = new A(t);
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
function Co(e) {
  const t = Fe(e, "d");
  if (e.kind !== X || t === void 0 || !W(e))
    throw new Error("This session's capsule event is not a valid capsule.");
  return { pubkey: e.pubkey, dTag: t };
}
function No(e, t, n) {
  const r = e.filter((i) => i.pubkey === n.pubkey && i.kind === X && Fe(i, "d") === n.dTag && W(i));
  return r.some((i) => i.id === t.id) ? "current" : r.length === 0 ? "missing" : Math.max(...r.map((i) => i.created_at)) >= t.created_at ? "newer" : "older";
}
async function cn(e, t, n) {
  const r = Co(t), o = new A(e);
  try {
    const i = await o.queryQuorum({
      kinds: [X],
      authors: [r.pubkey],
      "#d": [r.dTag],
      limit: 5
    }, n);
    return new Map(i.outcomes.map((a) => [
      a.relayUrl,
      a.responded ? { status: No(a.events, t, r) } : { status: "unreachable", error: a.error }
    ]));
  } finally {
    o.closeAll();
  }
}
async function So(e) {
  const t = [...new Set(e.relayUrls)], [n, r] = await Promise.all([
    cn(t, e.credentialEvent, e.timeoutMs),
    cn(t, e.recoveryEvent, e.timeoutMs)
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
const Wn = `abandon
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
function xo(e, t, n, r) {
  Or(e);
  const o = Vr({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: a, asyncTick: s } = o;
  if (pt(i), pt(a), pt(s), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = nn(t), l = nn(n), u = new Uint8Array(a), y = St.create(e, c), w = y._cloneInto().update(l);
  return { c: i, dkLen: a, asyncTick: s, DK: u, PRF: y, PRFSalt: w };
}
function Io(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), qr(o), n;
}
async function To(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: a, DK: s, PRF: c, PRFSalt: l } = xo(e, t, n, r);
  let u;
  const y = new Uint8Array(4), w = Lr(y), p = new Uint8Array(c.outputLen);
  for (let g = 1, v = 0; v < i; g++, v += c.outputLen) {
    const f = s.subarray(v, v + c.outputLen);
    w.setInt32(0, g, !1), (u = l._cloneInto(u)).update(y).digestInto(p), f.set(p.subarray(0, f.length)), await Dr(o - 1, a, () => {
      c._cloneInto(u).update(p).digestInto(p);
      for (let h = 0; h < f.length; h++)
        f[h] ^= p[h];
    });
  }
  return Io(c, l, s, u, p);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const Uo = (e) => e[0] === "あいこくしん";
function jn(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function $n(e) {
  const t = jn(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Bn(e) {
  jr(e, 16, 20, 24, 28, 32);
}
const Mo = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([xt(e)[0] >> t << t]);
};
function zn(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), He.chain(He.checksum(1, Mo), He.radix2(11, !0), He.alphabet(e));
}
function Lo(e, t) {
  const { words: n } = $n(e), r = zn(t).decode(n);
  return Bn(r), r;
}
function Do(e, t) {
  return Bn(e), zn(t).encode(e).join(Uo(t) ? "　" : " ");
}
function Oo(e, t) {
  try {
    Lo(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const Vo = (e) => jn("mnemonic" + e);
function qo(e, t = "") {
  return To(Wr, $n(e).nfkd, Vo(t), { c: 2048, dkLen: 64 });
}
function Wo(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return Do(e, Wn);
}
function Fn(e) {
  try {
    return Oo(Gn(e), Wn);
  } catch {
    return !1;
  }
}
function Gn(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function zt(e) {
  return qo(Gn(e), "");
}
const Ft = $r.id, Ae = "aes-256-gcm-v1", Ce = "bitlogin-bip39-hkdf-v1", Hn = "bitlogin-recovery-hkdf-v1";
function Ne(e) {
  return e ? { everyday_derivation: Hn } : {};
}
function Jn(e) {
  return e.protocol?.everyday_derivation === Hn;
}
async function Yn(e) {
  const t = dt(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await We(e.password, t);
  try {
    const i = _(r), a = new A(e.vaultRelayUrls, {
      authPrivateKey: r
    });
    let s;
    try {
      s = await $e(a, i, o, e.timeoutMs);
    } finally {
      a.closeAll();
    }
    if (!s.quorumMet)
      throw new de("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
    if (s.candidates.length > 0)
      throw new Rn();
    const c = e.everydayPrivateKey !== void 0;
    if (c && !Nt(e.everydayPrivateKey))
      throw new de("The provided key is not a valid secp256k1 private key.");
    const l = Wo(zr()), u = await zt(l);
    let y, w, p;
    try {
      ({ recoveryPrivateKey: y, capsuleKey: w } = Tt(u)), p = c ? e.everydayPrivateKey : Ut(u);
    } finally {
      E(u);
    }
    const g = !c, v = ee(32), f = ee(32);
    let h = !1;
    try {
      const b = _(y), m = _(p), P = x(En()), M = {
        schema: lt,
        account_id: P,
        recovery_generation: 0,
        previous_recovery_event_id: null,
        operational_private_key: x(p),
        operational_public_key: m,
        recovery_public_key: b,
        connection_vault_root: x(v),
        vault_sudo_key: x(f),
        created_at: n,
        vault_relay_hints: e.vaultRelayUrls,
        protocol: {
          capsule_encryption: Ae,
          recovery_derivation: Ce,
          ...Ne(g)
        }
      }, K = await Bt({
        recoveryPrivateKey: y,
        capsuleKey: w,
        payload: M
      }), N = new A(e.vaultRelayUrls, {
        authPrivateKey: y
      });
      let C;
      try {
        C = await me(N, K, {
          dTag: ze,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        N.closeAll();
      }
      if (!C.success)
        throw new de("The recovery capsule did not reach the required relay acknowledgement and readback quorum. No login credential was published. Please retry, or add more vault relays.");
      const I = {
        schema: ut,
        account_id: P,
        generation: 0,
        operational_private_key: x(p),
        operational_public_key: m,
        recovery_public_key: b,
        recovery_capsule_event: K,
        connection_vault_root: x(v),
        created_at: n,
        vault_relay_hints: e.vaultRelayUrls,
        protocol: {
          password_kdf: Ft,
          capsule_encryption: Ae,
          recovery_derivation: Ce,
          ...Ne(g)
        }
      }, L = await $t({
        locatorPrivateKey: r,
        capsuleKey: o,
        payload: I
      }), D = new A(e.vaultRelayUrls, {
        authPrivateKey: r
      });
      let T;
      try {
        T = await me(D, L, {
          dTag: Se,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        D.closeAll();
      }
      if (!T.success)
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
        connectionVaultRoot: v,
        vaultSudoKey: f,
        credentialEvent: L,
        recoveryEvent: K,
        credentialPublish: T,
        recoveryPublish: C
      };
    } finally {
      E(y, w), h || (c || E(p), E(v, f));
    }
  } finally {
    E(r, o);
  }
}
async function jo(e) {
  const { nsecOrHex: t, ...n } = e, r = Xn(t);
  return Yn({ ...n, everydayPrivateKey: r });
}
function Xn(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = Br(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = It(t.toLowerCase());
  else
    throw new de("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!Nt(n))
    throw new de("The provided key is not a valid secp256k1 private key.");
  return n;
}
class Qn {
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
async function $o(e) {
  const t = dt(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await We(e.password, t), o = _(n), i = new A(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  try {
    const a = await $e(i, o, r, e.timeoutMs);
    if (!a.quorumMet)
      throw new be("quorum-not-met");
    if (!a.best)
      throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const s = a.best.payload, c = e.store ?? new Qn(), l = await Dt(c, s.operational_public_key), u = s.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new An(l.generation, s.generation);
    const y = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${s.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await Cn(c, s.operational_public_key, {
      generation: s.generation
    });
    const w = a.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: ne(s.operational_private_key),
      everydayPublicKey: s.operational_public_key,
      recoveryPublicKey: s.recovery_public_key,
      accountId: s.account_id,
      generation: s.generation,
      everydayKeyDerived: Jn(s),
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
function ln(e) {
  return e.filter((t) => W(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function Bo(e) {
  if (!Fn(e.phrase))
    throw new ye("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await zt(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = Tt(t), o = Ut(t), i = _(o);
  E(t, o);
  const a = _(n), s = new A(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  let c;
  try {
    c = await qn(s, a, r, e.timeoutMs);
  } finally {
    s.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const v = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (W(m))
        try {
          v.push({
            event: m,
            payload: await On(m, r)
          });
        } catch (P) {
          v.push({
            event: m,
            payload: null,
            error: P.message
          });
        }
    const f = /* @__PURE__ */ new Map();
    for (const m of [...c.candidates, ...v])
      f.set(m.event.id, m);
    const h = [...f.values()].sort((m, P) => P.event.created_at - m.event.created_at), b = h.find((m) => m.payload !== null) ?? null;
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
  const l = c.best.payload, u = Ao(c.candidates), y = ne(l.operational_private_key), w = l.operational_public_key, { generalRelays: p, dmRelays: g } = await Zn(w, [...e.discoveryRelayUrls, ...l.vault_relay_hints], e.timeoutMs);
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
async function Zn(e, t, n) {
  const r = new A([...new Set(t)]);
  let o = [], i = [];
  try {
    const a = await r.queryQuorum({ kinds: [qe], authors: [e], limit: 5 }, n), s = ln(a.outcomes.flatMap((u) => u.events));
    s && (o = uo(s));
    const c = await r.queryQuorum({ kinds: [Ct], authors: [e], limit: 5 }, n), l = ln(c.outcomes.flatMap((u) => u.events));
    l && (i = yo(l));
  } finally {
    r.closeAll();
  }
  return { generalRelays: o, dmRelays: i };
}
async function er(e) {
  if (!Fn(e))
    throw new ye("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await zt(e);
  try {
    const { recoveryPrivateKey: n, capsuleKey: r } = Tt(t), o = Ut(t);
    return {
      recoveryPrivateKey: n,
      recoveryPublicKey: _(n),
      capsuleKey: r,
      everydayPrivateKey: o,
      everydayPublicKey: _(o)
    };
  } finally {
    E(t);
  }
}
async function tr(e, t, n) {
  const r = new A(t, {
    authPrivateKey: e.recoveryPrivateKey
  });
  let o;
  try {
    o = await qn(r, e.recoveryPublicKey, e.capsuleKey, n);
  } finally {
    r.closeAll();
  }
  if (!o.quorumMet)
    throw new be("quorum-not-met");
  if (o.best)
    throw new ye("This account's recovery capsule is still on the relays. Use normal recovery instead of a rebuild.");
  return o.candidates.length > 0 ? Math.max(...o.candidates.map((i) => i.event.created_at)) : null;
}
async function zo(e) {
  const t = await er(e.phrase);
  try {
    await tr(t, e.vaultRelayUrls, e.timeoutMs);
    const n = new A([
      .../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...e.vaultRelayUrls])
    ]);
    try {
      const o = (await n.queryQuorum({
        kinds: [nt, qe],
        authors: [t.everydayPublicKey],
        limit: 10
      }, e.timeoutMs)).outcomes.flatMap((i) => i.events).filter((i) => i.pubkey === t.everydayPublicKey && W(i));
      return {
        everydayPublicKey: t.everydayPublicKey,
        profileFound: o.some((i) => i.kind === nt),
        relayListFound: o.some((i) => i.kind === qe)
      };
    } finally {
      n.closeAll();
    }
  } finally {
    E(t.recoveryPrivateKey, t.capsuleKey, t.everydayPrivateKey);
  }
}
async function Fo(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = await er(e.phrase);
  let r = !1;
  try {
    const o = await tr(n, e.vaultRelayUrls, e.timeoutMs), i = {
      schema: lt,
      account_id: x(En()),
      recovery_generation: 0,
      previous_recovery_event_id: null,
      operational_private_key: x(n.everydayPrivateKey),
      operational_public_key: n.everydayPublicKey,
      recovery_public_key: n.recoveryPublicKey,
      connection_vault_root: x(ee(32)),
      vault_sudo_key: x(ee(32)),
      created_at: o === null ? t : je(o, t),
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        capsule_encryption: Ae,
        recovery_derivation: Ce,
        ...Ne(!0)
      }
    }, a = await Bt({
      recoveryPrivateKey: n.recoveryPrivateKey,
      capsuleKey: n.capsuleKey,
      payload: i
    }), s = new A(e.vaultRelayUrls, {
      authPrivateKey: n.recoveryPrivateKey
    });
    let c;
    try {
      c = await me(s, a, {
        dTag: ze,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      s.closeAll();
    }
    if (!c.success)
      throw new ye("Could not publish the rebuilt recovery capsule to enough relays. Nothing else was changed; please retry.");
    const { generalRelays: l, dmRelays: u } = await Zn(n.everydayPublicKey, [...e.discoveryRelayUrls, ...e.vaultRelayUrls], e.timeoutMs);
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
async function Go(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = dt(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root
  } : {}, { locatorPrivateKey: a, capsuleKey: s } = await We(e.newPassword, n);
  try {
    const c = _(a), l = new A(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let u;
    try {
      u = await $e(l, c, s, e.timeoutMs);
    } finally {
      l.closeAll();
    }
    if (!u.quorumMet)
      throw new ye("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
    const y = u.best?.payload ?? null, w = y !== null && y.account_id === r.accountId && y.operational_public_key === r.everydayPublicKey && y.recovery_public_key === r.recoveryPublicKey && y.generation === 0 && y.recovery_capsule_event.id === r.currentRecoveryEvent.id;
    if (u.candidates.length > 0 && !w)
      throw new ye("Another account is already registered with that login name and password. Pick a different one.");
    const p = r.currentRecoveryPayload.recovery_generation + 1, g = {
      schema: lt,
      account_id: r.accountId,
      recovery_generation: p,
      previous_recovery_event_id: r.currentRecoveryEvent.id,
      operational_private_key: x(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      ...o,
      created_at: je(r.currentRecoveryEvent.created_at, t),
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        capsule_encryption: Ae,
        recovery_derivation: Ce,
        ...Ne(r.everydayKeyDerived)
      }
    }, v = await Bt({
      recoveryPrivateKey: r.recoveryPrivateKey,
      capsuleKey: r.recoveryCapsuleKey,
      payload: g
    }), f = new A(e.vaultRelayUrls, {
      authPrivateKey: r.recoveryPrivateKey
    });
    let h;
    try {
      h = await me(f, v, {
        dTag: ze,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      f.closeAll();
    }
    if (!h.success)
      throw new ye("Could not publish the refreshed recovery capsule to enough relays. No new credential was published; please retry.");
    r.currentRecoveryEvent = v, r.currentRecoveryPayload = g;
    const b = {
      schema: ut,
      account_id: r.accountId,
      generation: 0,
      operational_private_key: x(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      recovery_capsule_event: v,
      ...i,
      // A retry may be repairing a credential that reached only one relay.
      // It must replace that partial event deterministically on every relay.
      created_at: u.best ? je(u.best.event.created_at, t) : t,
      vault_relay_hints: e.vaultRelayUrls,
      protocol: {
        password_kdf: Ft,
        capsule_encryption: Ae,
        recovery_derivation: Ce,
        ...Ne(r.everydayKeyDerived)
      }
    }, m = await $t({
      locatorPrivateKey: a,
      capsuleKey: s,
      payload: b
    }), P = new A(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let M;
    try {
      M = await me(P, m, {
        dTag: Se,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      P.closeAll();
    }
    if (!M.success)
      throw new ye("Could not publish the new credential capsule to enough relays. Please retry.");
    return e.store && await Qr(e.store, r.everydayPublicKey, {
      generation: 0,
      recoveryGeneration: p
    }), {
      normalizedLoginName: n,
      locatorPublicKey: c,
      credentialEvent: m,
      refreshedRecoveryEvent: v,
      credentialPublish: M,
      recoveryPublish: h
    };
  } finally {
    E(a, s);
  }
}
function nr(e) {
  const t = _(e.privateKey);
  return Z({
    pubkey: t,
    created_at: e.createdAt,
    kind: Fr,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function Ho(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = dt(e.loginName), r = await We(e.oldPassword, n), o = _(r.locatorPrivateKey), i = new A(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  });
  let a;
  try {
    a = await $e(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!a.quorumMet)
    throw new be("quorum-not-met");
  if (!a.best)
    throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = a.best.payload, c = a.best.event, l = e.store ?? new Qn(), u = await Dt(l, s.operational_public_key);
  if (s.generation < u.generation && !e.acknowledgeRollback)
    throw new An(u.generation, s.generation);
  const y = await We(e.newPassword, n), w = _(y.locatorPrivateKey), p = new A(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  });
  let g;
  try {
    g = await $e(p, w, y.capsuleKey, e.timeoutMs);
  } finally {
    p.closeAll();
  }
  if (!g.quorumMet)
    throw new de("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (g.candidates.length > 0)
    throw new Rn("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const v = s.generation + 1, f = {
    schema: ut,
    account_id: s.account_id,
    generation: v,
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
      password_kdf: Ft,
      capsule_encryption: Ae,
      recovery_derivation: Ce,
      ...Ne(Jn(s))
    }
  }, h = await $t({
    locatorPrivateKey: y.locatorPrivateKey,
    capsuleKey: y.capsuleKey,
    payload: f
  }), b = new A(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  }), m = await me(b, h, {
    dTag: Se,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (b.closeAll(), !m.success)
    throw new de("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const P = Ko({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: je(c.created_at, t)
  }), M = nr({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: c.id,
    deletedEventKind: X,
    createdAt: t
  }), K = new A(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  }), [N, C] = await Promise.all([
    K.publishAll(P, e.timeoutMs),
    K.publishAll(M, e.timeoutMs)
  ]);
  return K.closeAll(), await Cn(l, s.operational_public_key, {
    generation: v
  }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: w,
    newGeneration: v,
    recoveryPublicKey: s.recovery_public_key,
    recoveryCapsuleEvent: s.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: P,
    deletionRequestEvent: M,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: Ke(N),
    deletionAcknowledgedCount: Ke(C)
  };
}
const Jo = "bitlogin/connection-vault-root/v1", Yo = "bitlogin/connection-vault-signing/v1", Xo = "bitlogin/connection-record-encryption/v1", Qo = "bitlogin/connection-vault-personal/v1", mt = "bitlogin:connection:";
function Zo(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return Mt(Pn(Jo), e);
}
function Ie(e) {
  return Gr(e, Yo).scalar;
}
function rr(e) {
  const t = Ie(e);
  try {
    return _(t);
  } finally {
    E(t);
  }
}
function ei(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return Mt(Pn(Qo), xe(e, t));
}
function or(e, t) {
  const n = ht(t);
  return Ge(e, xe(te(Xo), new Uint8Array([0]), n), 32);
}
function ti() {
  return x(ee(16));
}
function ht(e) {
  const t = ne(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function ir(e) {
  return ht(e), `${mt}${e}`;
}
function ar(e) {
  if (!e.startsWith(mt))
    return null;
  const t = e.slice(mt.length);
  try {
    return ht(t), t;
  } catch {
    return null;
  }
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function ni(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function un(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function vt(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function V(e, t, n = "") {
  const r = ni(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const a = n && `"${n}" `, s = i ? ` of length ${t}` : "", c = r ? `length=${o}` : `type=${typeof e}`, l = a + "expected Uint8Array" + s + ", got " + c;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function U(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function ke(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const re = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, ri = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, oi = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = ri(e[t]);
  return e;
}, q = re ? (e) => e : oi;
function ii(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function sr(e, t) {
  if (ii(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function ai(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const si = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (V(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      V(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && V(o[1], void 0, "AAD");
    const a = t(r, ...o), s = (u, y) => {
      if (y !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        V(y, void 0, "output");
      }
    };
    let c = !1;
    return {
      encrypt(u, y) {
        if (c)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return c = !0, V(u), s(a.encrypt.length, y), a.encrypt(u, y);
      },
      decrypt(u, y) {
        if (V(u), i && u.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return s(a.decrypt.length, y), a.decrypt(u, y);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Gt(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (V(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !ce(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function ce(e) {
  return e.byteOffset % 4 === 0;
}
function we(e) {
  return Uint8Array.from(V(e));
}
const cr = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), ci = q(U(cr("expand 16-byte k"))), li = q(U(cr("expand 32-byte k")));
function k(e, t) {
  return e << t | e >>> 32 - t;
}
const Te = 64, ui = 16, kt = 2 ** 32 - 1, dn = /* @__PURE__ */ Uint32Array.of();
function di(e, t, n, r, o, i, a, s) {
  const c = o.length, l = new Uint8Array(Te), u = U(l), y = re && ce(o) && ce(i), w = y ? U(o) : dn, p = y ? U(i) : dn;
  if (!re) {
    for (let g = 0; g < c; a++) {
      if (e(t, n, r, u, a, s), q(u), a >= kt)
        throw new Error("arx: counter overflow");
      const v = Math.min(Te, c - g);
      for (let f = 0, h; f < v; f++)
        h = g + f, i[h] = o[h] ^ l[f];
      g += v;
    }
    return;
  }
  for (let g = 0; g < c; a++) {
    if (e(t, n, r, u, a, s), a >= kt)
      throw new Error("arx: counter overflow");
    const v = Math.min(Te, c - g);
    if (y && v === Te) {
      const f = g / 4;
      if (g % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < ui; h++)
        b = f + h, p[b] = w[b] ^ u[h];
      g += Te;
      continue;
    }
    for (let f = 0, h; f < v; f++)
      h = g + f, i[h] = o[h] ^ l[f];
    g += v;
  }
}
function yi(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: a } = ai({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return vt(o), vt(a), un(i), un(n), (s, c, l, u, y = 0) => {
    V(s, void 0, "key"), V(c, void 0, "nonce"), V(l, void 0, "data");
    const w = l.length;
    if (u = Gt(w, u, !1), vt(y), y < 0 || y >= kt)
      throw new Error("arx: counter overflow");
    const p = [];
    let g = s.length, v, f;
    if (g === 32)
      p.push(v = we(s)), f = li;
    else if (g === 16 && n)
      v = new Uint8Array(32), v.set(s), v.set(s, 16), f = ci, p.push(v);
    else
      throw V(s, 32, "arx key"), new Error("invalid key size");
    (!re || !ce(c)) && p.push(c = we(c));
    let h = U(v);
    if (r) {
      if (c.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const P = c.subarray(0, 16);
      if (re)
        r(f, h, U(P), h);
      else {
        const M = q(Uint32Array.from(f));
        r(M, h, U(P), h), ke(M), q(h);
      }
      c = c.subarray(16);
    } else re || q(h);
    const b = 16 - o;
    if (b !== c.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const P = new Uint8Array(12);
      P.set(c, i ? 0 : 12 - c.length), c = P, p.push(c);
    }
    const m = q(U(c));
    try {
      return di(e, f, h, m, l, u, y, a), u;
    } finally {
      ke(...p);
    }
  };
}
function hi(e, t, n, r, o, i = 20) {
  let a = e[0], s = e[1], c = e[2], l = e[3], u = t[0], y = t[1], w = t[2], p = t[3], g = t[4], v = t[5], f = t[6], h = t[7], b = o, m = n[0], P = n[1], M = n[2], K = a, N = s, C = c, I = l, L = u, D = y, T = w, j = p, $ = g, B = v, z = f, F = h, G = b, H = m, J = P, Y = M;
  for (let tn = 0; tn < i; tn += 2)
    K = K + L | 0, G = k(G ^ K, 16), $ = $ + G | 0, L = k(L ^ $, 12), K = K + L | 0, G = k(G ^ K, 8), $ = $ + G | 0, L = k(L ^ $, 7), N = N + D | 0, H = k(H ^ N, 16), B = B + H | 0, D = k(D ^ B, 12), N = N + D | 0, H = k(H ^ N, 8), B = B + H | 0, D = k(D ^ B, 7), C = C + T | 0, J = k(J ^ C, 16), z = z + J | 0, T = k(T ^ z, 12), C = C + T | 0, J = k(J ^ C, 8), z = z + J | 0, T = k(T ^ z, 7), I = I + j | 0, Y = k(Y ^ I, 16), F = F + Y | 0, j = k(j ^ F, 12), I = I + j | 0, Y = k(Y ^ I, 8), F = F + Y | 0, j = k(j ^ F, 7), K = K + D | 0, Y = k(Y ^ K, 16), z = z + Y | 0, D = k(D ^ z, 12), K = K + D | 0, Y = k(Y ^ K, 8), z = z + Y | 0, D = k(D ^ z, 7), N = N + T | 0, G = k(G ^ N, 16), F = F + G | 0, T = k(T ^ F, 12), N = N + T | 0, G = k(G ^ N, 8), F = F + G | 0, T = k(T ^ F, 7), C = C + j | 0, H = k(H ^ C, 16), $ = $ + H | 0, j = k(j ^ $, 12), C = C + j | 0, H = k(H ^ C, 8), $ = $ + H | 0, j = k(j ^ $, 7), I = I + L | 0, J = k(J ^ I, 16), B = B + J | 0, L = k(L ^ B, 12), I = I + L | 0, J = k(J ^ I, 8), B = B + J | 0, L = k(L ^ B, 7);
  let O = 0;
  r[O++] = a + K | 0, r[O++] = s + N | 0, r[O++] = c + C | 0, r[O++] = l + I | 0, r[O++] = u + L | 0, r[O++] = y + D | 0, r[O++] = w + T | 0, r[O++] = p + j | 0, r[O++] = g + $ | 0, r[O++] = v + B | 0, r[O++] = f + z | 0, r[O++] = h + F | 0, r[O++] = b + G | 0, r[O++] = m + H | 0, r[O++] = P + J | 0, r[O++] = M + Y | 0;
}
const lr = /* @__PURE__ */ yi(hi, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), ur = 2, _t = 1, dr = 65536, pi = 4294967295, vi = 132, fi = 99, Et = 1024 * 1024;
function at(e, t) {
  const n = xe(new Uint8Array([2]), It(t)), o = Kn.getSharedSecret(e, n, !0).slice(1, 33);
  return Mt(te("nip44-v2"), o);
}
function yr(e, t) {
  if (e.length !== 32)
    throw new Error("NIP-44 conversation key must be exactly 32 bytes.");
  if (t.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const n = Ge(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function Ht(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
const hr = 39 + Ht(Et) + 32, wi = Math.ceil(hr / 3) * 4;
function gi(e) {
  if (e < dr) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function bi(e) {
  const t = e.length;
  if (t < _t || t > Et)
    throw new Error(`NIP-44 plaintext length must be between ${_t} and ${Et} bytes on this platform.`);
  const n = gi(t), r = Ht(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function mi(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < dr)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < _t || r > pi || e.length !== o + Ht(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function pr(e, t, n) {
  return St(xt, e, xe(t, n));
}
function Pt(e, t) {
  return ki(e, t, ee(32));
}
function ki(e, t, n) {
  if (n.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const { chachaKey: r, chachaNonce: o, hmacKey: i } = yr(e, n), a = bi(te(t)), s = lr(r, o, a), c = pr(i, n, s);
  return Re.encode(xe(new Uint8Array([ur]), n, s, c));
}
function Jt(e, t) {
  if (t.startsWith("#"))
    throw new Error("Unsupported NIP-44 non-base64 encoding.");
  if (t.length < vi || t.length > wi)
    throw new Error("NIP-44 payload size is outside this platform's supported range.");
  const n = Re.decode(t);
  if (n.length < fi || n.length > hr)
    throw new Error("NIP-44 decoded payload size is outside this platform's supported range.");
  if (n[0] !== ur)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33);
  if (r.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const o = n.slice(n.length - 32), i = n.slice(33, n.length - 32), { chachaKey: a, chachaNonce: s, hmacKey: c } = yr(e, r), l = pr(c, r, i);
  if (!Hr(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = lr(a, s, i);
  return ct(mi(u));
}
const ve = 16, _i = 283;
function Ei(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function Yt(e) {
  return e << 1 ^ _i & -(e >> 7);
}
function Pe(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = Yt(e);
  return n;
}
const Kt = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= Yt(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return ke(e), t;
})(), Pi = /* @__PURE__ */ Kt.map((e, t) => Kt.indexOf(t)), Ki = (e) => e << 24 | e >>> 8, ft = (e) => e << 8 | e >>> 24;
function vr(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(ft), o = r.map(ft), i = o.map(ft), a = new Uint32Array(256 * 256), s = new Uint32Array(256 * 256), c = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const y = l * 256 + u;
      a[y] = n[l] ^ r[u], s[y] = o[l] ^ i[u], c[y] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: c, T0: n, T1: r, T2: o, T3: i, T01: a, T23: s };
}
const Xt = /* @__PURE__ */ vr(Kt, (e) => Pe(e, 3) << 24 | e << 16 | e << 8 | Pe(e, 2)), fr = /* @__PURE__ */ vr(Pi, (e) => Pe(e, 11) << 24 | Pe(e, 13) << 16 | Pe(e, 9) << 8 | Pe(e, 14)), Ri = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = Yt(n))
    e[t] = n;
  return e;
})();
function wr(e) {
  V(e);
  const t = e.length;
  Ei(e);
  const { sbox2: n } = Xt, r = [];
  (!re || !ce(e)) && r.push(e = we(e));
  const o = q(U(e)), i = o.length, a = (c) => ie(n, c, c, c, c), s = new Uint32Array(t + 28);
  s.set(o);
  for (let c = i; c < s.length; c++) {
    let l = s[c - 1];
    c % i === 0 ? l = a(Ki(l)) ^ Ri[c / i - 1] : i > 6 && c % i === 4 && (l = a(l)), s[c] = s[c - i] ^ l;
  }
  return ke(...r), s;
}
function Ai(e) {
  const t = wr(e), n = t.slice(), r = t.length, { sbox2: o } = Xt, { T0: i, T1: a, T2: s, T3: c } = fr;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  ke(t);
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
function yn(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = Xt;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const v = e[c++] ^ he(a, s, t, n, r, o), f = e[c++] ^ he(a, s, n, r, o, t), h = e[c++] ^ he(a, s, r, o, t, n), b = e[c++] ^ he(a, s, o, t, n, r);
    t = v, n = f, r = h, o = b;
  }
  const u = e[c++] ^ ie(i, t, n, r, o), y = e[c++] ^ ie(i, n, r, o, t), w = e[c++] ^ ie(i, r, o, t, n), p = e[c++] ^ ie(i, o, t, n, r);
  return { s0: u, s1: y, s2: w, s3: p };
}
function Ci(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = fr;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const v = e[c++] ^ he(a, s, t, o, r, n), f = e[c++] ^ he(a, s, n, t, o, r), h = e[c++] ^ he(a, s, r, n, t, o), b = e[c++] ^ he(a, s, o, r, n, t);
    t = v, n = f, r = h, o = b;
  }
  const u = e[c++] ^ ie(i, t, o, r, n), y = e[c++] ^ ie(i, n, t, o, r), w = e[c++] ^ ie(i, r, n, t, o), p = e[c++] ^ ie(i, o, r, n, t);
  return { s0: u, s1: y, s2: w, s3: p };
}
function Ni(e) {
  if (V(e), e.length % ve !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + ve);
}
function Si(e, t, n) {
  V(e);
  let r = e.length;
  const o = r % ve;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let s = ve - o;
    s || (s = ve), r = r + s;
  }
  n = Gt(r, n), sr(e, n), (!re || !ce(e)) && (e = we(e));
  const i = U(e);
  q(i);
  const a = U(n);
  return { b: i, o: a, out: n };
}
function xi(e, t) {
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
function Ii(e) {
  const t = new Uint8Array(16), n = U(t);
  t.set(e);
  const r = ve - e.length;
  for (let o = ve - r; o < ve; o++)
    t[o] = r;
  return n;
}
const gr = /* @__PURE__ */ si({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, a) {
      const s = wr(t), { b: c, o: l, out: u } = Si(i, o, a);
      let y = n;
      const w = [s];
      (!re || !ce(y)) && w.push(y = we(y));
      const p = U(y);
      q(p);
      let g = p[0], v = p[1], f = p[2], h = p[3], b = 0;
      for (; b + 4 <= c.length; )
        g ^= c[b + 0], v ^= c[b + 1], f ^= c[b + 2], h ^= c[b + 3], { s0: g, s1: v, s2: f, s3: h } = yn(s, g, v, f, h), l[b++] = g, l[b++] = v, l[b++] = f, l[b++] = h;
      if (o) {
        const m = Ii(i.subarray(b * 4));
        q(m), g ^= m[0], v ^= m[1], f ^= m[2], h ^= m[3], { s0: g, s1: v, s2: f, s3: h } = yn(s, g, v, f, h), l[b++] = g, l[b++] = v, l[b++] = f, l[b++] = h;
      }
      return q(l), ke(...w), u;
    },
    decrypt(i, a) {
      Ni(i);
      const s = Ai(t);
      let c = n;
      const l = [s];
      (!re || !ce(c)) && l.push(c = we(c));
      const u = U(c);
      q(u), a = Gt(i.length, a), sr(i, a), (!re || !ce(i)) && l.push(i = we(i));
      const y = U(i), w = U(a);
      q(y);
      let p = u[0], g = u[1], v = u[2], f = u[3];
      for (let h = 0; h + 4 <= y.length; ) {
        const b = p, m = g, P = v, M = f;
        p = y[h + 0], g = y[h + 1], v = y[h + 2], f = y[h + 3];
        const { s0: K, s1: N, s2: C, s3: I } = Ci(s, p, g, v, f);
        w[h++] = K ^ b, w[h++] = N ^ m, w[h++] = C ^ P, w[h++] = I ^ M;
      }
      return q(w), ke(...l), xi(a, o);
    }
  };
});
function br(e, t) {
  const n = xe(new Uint8Array([2]), It(t));
  return Kn.getSharedSecret(e, n, !0).slice(1, 33);
}
function Ti(e, t, n) {
  return Ui(e, t, n, ee(16));
}
function Ui(e, t, n, r) {
  if (r.length !== 16)
    throw new Error("NIP-04 iv must be exactly 16 bytes.");
  const o = br(e, t), i = gr(o, r).encrypt(te(n));
  return `${Re.encode(i)}?iv=${Re.encode(r)}`;
}
function Mi(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = Re.decode(n.slice(0, r)), i = Re.decode(n.slice(r + 4)), a = br(e, t), s = gr(a, i).decrypt(o);
  return ct(s);
}
class et {
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
    return this.assertAlive(), Z({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), Pt(at(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), Jt(at(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Ti(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), Mi(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    E(this.privateKey), this.destroyed = !0;
  }
}
const Li = [
  "wss://nos.lol",
  "wss://offchain.pub",
  "wss://nostr.bitcoiner.social",
  "wss://relay.mostr.pub",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://relay.damus.io"
], Di = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net"
], Qt = /^[0-9a-f]{64}$/u, Oi = 8, Vi = 4096, qi = 256, Wi = 512;
class _e extends Error {
  name = "BunkerUriParseError";
}
class ji extends Error {
  name = "Nip46RequestTimeoutError";
  constructor(t, n) {
    super(`The remote signer did not answer ${t} within ${Math.round(n / 1e3)}s. It may be offline, or waiting for your approval on another device -- check your signer and try again.`);
  }
}
class $i extends Error {
  name = "Nip46ErrorResponse";
}
function Bi(e) {
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    return null;
  }
  const n = t.hostname === "localhost" || t.hostname === "127.0.0.1";
  return t.protocol === "https:" || t.protocol === "http:" && n ? t.toString() : null;
}
function zi(e) {
  if (e.length > Vi)
    throw new _e("That bunker URI is unreasonably long.");
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    throw new _e("That doesn't look like a valid URI.");
  }
  if (t.protocol !== "bunker:")
    throw new _e("A remote-signer URI must start with bunker://");
  const n = (t.host || t.pathname.replace(/^\/+/u, "")).toLowerCase();
  if (!Qt.test(n))
    throw new _e("The bunker URI does not name a valid signer public key.");
  const r = [
    ...new Set(t.searchParams.getAll("relay").map((i) => i.trim()).filter((i) => i.length > 0 && i.length <= Wi))
  ].slice(0, Oi);
  if (r.length === 0)
    throw new _e("The bunker URI names no relays -- without at least one relay= parameter there is no way to reach the signer.");
  const o = t.searchParams.get("secret") ?? void 0;
  if (o && o.length > qi)
    throw new _e("The bunker URI's secret is unreasonably long.");
  return { signerPubkey: n, relayUrls: r, secret: o || void 0 };
}
function Fi(e) {
  if (!Qt.test(e.clientPubkey))
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
const Gi = 12e4;
class hn {
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
    this.clientSecretKey = t.clientSecretKey, this.clientPubkey = _(t.clientSecretKey), this.pointer = t.pointer, this.conversationKey = at(t.clientSecretKey, t.pointer.signerPubkey), this.onAuthUrl = t.onAuthUrl, this.requestTimeoutMs = t.requestTimeoutMs ?? Gi, this.conns = t.pointer.relayUrls.map((n) => new Ot(n, { authPrivateKey: t.clientSecretKey }));
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
        kinds: [Xe],
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
      n = JSON.parse(Jt(this.conversationKey, t.content));
    } catch {
      return;
    }
    if (typeof n.id != "string")
      return;
    const r = this.pending.get(n.id);
    if (r) {
      if (n.result === "auth_url") {
        if (!r.authUrlSeen && typeof n.error == "string" && n.error) {
          const o = Bi(n.error);
          o && (r.authUrlSeen = !0, this.onAuthUrl?.(o));
        }
        return;
      }
      if (this.pending.delete(n.id), clearTimeout(r.timer), typeof n.error == "string" && n.error) {
        r.reject(new $i(n.error));
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
    const r = Ve(ee(8)), o = Pt(this.conversationKey, JSON.stringify({ id: r, method: t, params: n })), i = [["p", this.pointer.signerPubkey]], a = Z({
      pubkey: this.clientPubkey,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Xe,
      tags: i,
      content: o
    }, this.clientSecretKey), s = new Promise((u, y) => {
      const w = setTimeout(() => {
        this.pending.delete(r), y(new ji(t, this.requestTimeoutMs));
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
    if (!Qt.test(t))
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
    if (!W(o))
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
      const t = Ve(ee(8)), n = Pt(this.conversationKey, JSON.stringify({ id: t, method: "logout", params: [] }));
      return Z({
        pubkey: this.clientPubkey,
        created_at: Math.floor(Date.now() / 1e3),
        kind: Xe,
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
async function Hi(e) {
  const t = _(e.clientSecretKey), n = e.timeoutMs, r = e.relayUrls.map((i) => new Ot(i, { authPrivateKey: e.clientSecretKey })), o = () => {
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
    const y = { kinds: [Xe], "#p": [t] }, w = (p) => {
      let g, v = null;
      try {
        v = at(e.clientSecretKey, p.pubkey), g = JSON.parse(Jt(v, p.content));
      } catch {
        return;
      } finally {
        v && E(v);
      }
      g.result === e.secret && l({ signerPubkey: p.pubkey });
    };
    Promise.allSettled(r.map((p) => p.subscribeLive(y, w))).then((p) => {
      p.some((g) => g.status === "fulfilled") || l(new Error("Could not reach any relay to listen for the signer."));
    });
  });
}
const mr = "bitlogin.connection.v1", kr = "bitlogin.connection.nwc.v1", pn = 120, Ji = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), Yi = /* @__PURE__ */ new Set(["connectable", "personal"]);
class Ee extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function _r(e, t) {
  return te(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function Er(e) {
  const t = e, n = (i) => {
    throw new Ee(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== mr && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), Yi.has(t.tier) || n("tier must be connectable or personal."), Ji.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > pn) && n(`label must be a string of at most ${pn} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function wt(e) {
  Er(e.record);
  const t = Ie(e.vaultPrk), n = _(t), r = ir(e.record.connection_id), o = or(e.recordPrk, e.record.connection_id), i = await qt(e.record, o, _r(n, r));
  return Z({
    pubkey: n,
    created_at: je(e.previousCreatedAt, e.now),
    kind: X,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function Xi(e, t, n) {
  if (!W(e))
    throw new Ee("Connection record event has an invalid id or signature.");
  const r = _(Ie(t));
  if (e.pubkey !== r)
    throw new Ee("Connection record event is not signed by this vault's identity.");
  const o = Fe(e, "d") ?? "", i = ar(o);
  if (i === null)
    throw new Ee("Connection record event has a malformed d tag.");
  const a = JSON.parse(e.content), s = _r(e.pubkey, o), c = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const l of c) {
    let u;
    try {
      u = await Wt(a, or(l.prk, i), s);
    } catch {
      continue;
    }
    if (Er(u), u.connection_id !== i)
      throw new Ee("Connection record id does not match its d tag.");
    if (u.tier !== l.tier)
      throw new Ee("Connection record tier does not match the key that decrypted it.");
    return { record: u, tier: l.tier, event: e };
  }
  return null;
}
function Qi(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const st = /^[0-9a-f]{64}$/u;
class le extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function vn(e) {
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
  if (!st.test(r))
    throw new le("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let a = null, s = null;
  for (const [c, l] of n.searchParams.entries())
    if (c === "relay") {
      if (!yt(l))
        throw new le("An NWC relay must use secure WebSockets, except for an explicit loopback development endpoint.");
      o.push(l);
    } else if (c === "secret") {
      const u = l.toLowerCase();
      if (!st.test(u))
        throw new le("The NWC URI's secret is not a 64-char hex client key.");
      a = u;
    } else c === "lud16" ? s = l : i.push([c, l]);
  if (o.length === 0)
    throw new le("The NWC URI names no relay.");
  if (a === null)
    throw new le("The NWC URI carries no secret.");
  return {
    schema: kr,
    wallet_pubkey: r,
    relays: o,
    secret: a,
    lud16: s,
    extra_params: i
  };
}
function Zi(e) {
  Pr(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function ea(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function Pr(e) {
  const t = e, n = (r) => {
    throw new le(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== kr && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !st.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), t.relays.some((r) => !yt(r)) && n("NWC relays must use secure WebSockets, except for explicit loopback development endpoints."), (typeof t.secret != "string" || !st.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
const ta = "bitlogin:vault-hwm:v2:", na = "bitlogin/vault-hwm-index/v2", Kr = "bitlogin/vault-hwm-encryption/v2", ra = /^[0-9a-f]{64}$/u;
class pe extends Error {
  constructor() {
    super("The local Connection Vault rollback marker is invalid or has been tampered with."), this.name = "RecordHighWaterMarkError";
  }
}
function Zt(e) {
  if (!e || typeof e != "object")
    return !1;
  const t = e;
  return Number.isInteger(t.createdAt) && (t.createdAt ?? -1) >= 0 && typeof t.eventId == "string" && ra.test(t.eventId);
}
function Rr(e, t) {
  ht(t);
  const n = Ge(e, na, 32), r = te(t);
  try {
    return `${ta}${x(St(xt, n, r))}`;
  } finally {
    E(n, r);
  }
}
function oa(e, t) {
  return `bitlogin:vault-hwm:${rr(e)}:${t}`;
}
async function ia(e, t, n) {
  const r = Ge(e, Kr, 32), o = te(JSON.stringify(n)), i = te(t);
  try {
    const a = await Sn(r, o, i), s = {
      v: 2,
      nonce: x(a.nonce),
      ciphertext: x(a.ciphertext)
    };
    return JSON.stringify(s);
  } finally {
    E(r, o, i);
  }
}
async function aa(e, t, n) {
  const r = Ge(e, Kr, 32), o = te(t);
  let i;
  try {
    const a = JSON.parse(n);
    if (a.v !== 2 || typeof a.nonce != "string" || typeof a.ciphertext != "string")
      throw new pe();
    i = await xn(r, ne(a.nonce), ne(a.ciphertext), o);
    const s = JSON.parse(ct(i));
    if (!Zt(s))
      throw new pe();
    return s;
  } catch (a) {
    throw a instanceof pe ? a : new pe();
  } finally {
    E(r, o), i && E(i);
  }
}
async function Ar(e, t, n, r) {
  const o = Rr(t, n);
  await e.set(o, await ia(t, o, r));
}
async function Cr(e, t, n) {
  const r = Rr(t, n), o = await e.get(r);
  if (o !== void 0)
    return aa(t, r, o);
  const i = oa(t, n), a = await e.get(i);
  if (a === void 0)
    return null;
  try {
    const s = JSON.parse(a);
    if (!Zt(s))
      throw new pe();
    return await Ar(e, t, n, s), await e.delete(i), s;
  } catch (s) {
    throw s instanceof pe ? s : new pe();
  }
}
async function Nr(e, t, n, r) {
  if (!Zt(r))
    throw new pe();
  const o = await Cr(e, t, n);
  o && bt({ created_at: r.createdAt, id: r.eventId }, { created_at: o.createdAt, id: o.eventId }) <= 0 || await Ar(e, t, n, r);
}
async function sa(e) {
  const t = Ie(e.vaultPrk), n = new A(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await me(n, e.event, {
      dTag: ir(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll(), E(t);
  }
  return r.success && await Nr(e.store, e.vaultPrk, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const fn = 500;
async function ca(e) {
  const t = Ie(e.vaultPrk), n = _(t), r = new A(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [X], authors: [n], limit: fn }, e.timeoutMs);
  } finally {
    r.closeAll(), E(t);
  }
  const i = o.outcomes.some((l) => l.events.length >= fn), a = /* @__PURE__ */ new Map();
  for (const l of o.outcomes.flatMap((u) => u.events)) {
    if (!W(l) || l.pubkey !== n)
      continue;
    const u = ar(Fe(l, "d") ?? "");
    if (u === null)
      continue;
    const y = a.get(u);
    (!y || bt(l, y) > 0) && a.set(u, l);
  }
  const s = /* @__PURE__ */ new Map(), c = [];
  for (const [l, u] of a) {
    const y = await Cr(e.store, e.vaultPrk, l);
    if (y !== null && bt(u, {
      created_at: y.createdAt,
      id: y.eventId
    }) < 0) {
      c.push(l);
      continue;
    }
    s.set(l, u), await Nr(e.store, e.vaultPrk, l, {
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
class la {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = Zo(this.connectionVaultRoot), this.vaultPublicKey = rr(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = ei(this.connectionVaultRoot, t), E(t);
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
      schema: mr,
      connection_id: ti(),
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
    }, o = await wt({
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
    }, a = await wt({
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
    const r = n ?? Math.floor(Date.now() / 1e3), o = Qi(t.record, r), i = await wt({
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
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : Xi(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return nr({
      privateKey: Ie(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: X,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return sa({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return ca({ vaultPrk: this.vaultPrk, ...t });
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
const ua = "bitlogin", ue = "kv", oe = "device-keys", da = 2;
function ya() {
  return new Promise((e, t) => {
    const n = indexedDB.open(ua, da);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(ue) || r.createObjectStore(ue), r.objectStoreNames.contains(oe) || r.createObjectStore(oe);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class ha {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = ya()), this.dbPromise;
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
const Be = "bitlogin:session:v1", en = "bitlogin:session-device-key:v1";
function wn(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function gn(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function bn(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function pa(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function va(e, t) {
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
      await e.delete(Be);
      return;
    }
    const r = await e.getOrCreateDeviceKey(en), o = crypto.getRandomValues(new Uint8Array(12)), i = new TextEncoder().encode(JSON.stringify(n)), a = await crypto.subtle.encrypt({ name: "AES-GCM", iv: o }, r, i), s = {
      v: 2,
      iv: wn(o),
      ciphertext: wn(new Uint8Array(a))
    };
    await e.set(Be, JSON.stringify(s));
  } catch {
  }
}
async function fa(e) {
  let t;
  try {
    t = await e.get(Be);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    if (!pa(n) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(Be), null;
    const r = await e.getOrCreateDeviceKey(en), o = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bn(gn(n.iv)) },
      r,
      bn(gn(n.ciphertext))
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
async function wa(e) {
  try {
    await e.delete(Be), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(en);
  } catch {
  }
}
const Sr = "bitlogin:session-public:v1";
async function ga(e, t) {
  try {
    const n = {
      pubkey: t.pubkey,
      npub: t.npub,
      ...t.name ? { name: t.name } : {}
    };
    await e.set(Sr, JSON.stringify(n));
  } catch {
  }
}
async function ba(e) {
  try {
    await e.delete(Sr);
  } catch {
  }
}
class ma {
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
let S = [...Li], Ue = [...Di];
const Q = new ha(), ka = new ma();
function ae() {
  if (!d.signer || !d.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: d.signer, everydayPrivateKey: d.everydayPrivateKey };
}
function Oe() {
  d.signer?.destroy(), d.everydayPrivateKey && d.everydayPrivateKey.fill(0), d.signer = null, d.everydayPrivateKey = null, d.accountId = null, d.recoveryPublicKey = null, d.activeCredentialEvent = null, d.activeRecoveryEvent = null, d.everydayKeyDerived = !1, d.vault?.destroy(), d.vault = null, d.connectionVaultRoot && d.connectionVaultRoot.fill(0), d.connectionVaultRoot = null, d.vaultKnown = !1, d.pendingRecovery && (d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery.everydayPrivateKey.fill(0), d.pendingRecovery = null);
}
function mn(e) {
  return Oe(), d.pendingRecovery = e, d.signer = new et(e.everydayPrivateKey), d.everydayPrivateKey = e.everydayPrivateKey, d.accountId = e.accountId, d.recoveryPublicKey = e.recoveryPublicKey, d.activeRecoveryEvent = e.currentRecoveryEvent, d.everydayKeyDerived = e.everydayKeyDerived, Rt(
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
function Rt(e, t) {
  d.connectionVaultRoot = e ?? null, d.vaultKnown = !0, d.vault = null, t && E(t);
}
async function Je() {
  !d.everydayPrivateKey || !d.accountId || !d.recoveryPublicKey || !d.activeCredentialEvent || !d.activeRecoveryEvent || (await va(Q, {
    everydayPrivateKey: d.everydayPrivateKey,
    accountId: d.accountId,
    recoveryPublicKey: d.recoveryPublicKey,
    activeCredentialEvent: d.activeCredentialEvent,
    activeRecoveryEvent: d.activeRecoveryEvent,
    ...d.connectionVaultRoot ? { connectionVaultRoot: d.connectionVaultRoot } : {},
    ...d.vaultKnown ? { vaultEnabled: d.connectionVaultRoot !== null } : {},
    everydayKeyDerived: d.everydayKeyDerived
  }), await xr());
}
async function xr() {
  if (!d.signer) return;
  const e = d.signer.getPublicKey();
  await ga(Q, { pubkey: e, npub: Qe(e) });
}
function Me() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function At() {
  if (!d.signer) throw new Error("No identity is unlocked in this session.");
  if (!d.connectionVaultRoot)
    throw new Error(
      d.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return d.vault ??= new la(d.connectionVaultRoot.slice()), d.vault;
}
function Le(e) {
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
async function tt() {
  const e = At(), t = await e.listConnections({ relayUrls: S, store: Q });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings,
    unreadable: t.unreadable,
    truncated: t.truncated,
    quorumMet: t.quorumMet
  };
}
async function gt(e) {
  const { vault: t, connections: n } = await tt(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
let ge = null, se = null;
function kn(e) {
  self.postMessage({ notify: "nip46-auth-url", url: e });
}
function De() {
  if (!ge) throw new Error("No remote signer is connected.");
  return ge;
}
function Ye() {
  se && (se.abort.abort(), E(se.clientSecretKey), se = null);
}
function Ir(e) {
  const t = e.buildLogoutEvent();
  e.close(), t && e.publishCourtesy(t);
}
function _n(e, t) {
  ge && Ir(ge.client), ge = { client: e, userPubkey: t };
}
async function _a(e, t) {
  switch (e) {
    case "nip46Connect": {
      const r = zi(t.uri), o = new hn({
        clientSecretKey: rn(),
        pointer: r,
        onAuthUrl: kn
      });
      try {
        await o.connect();
        const i = await o.getUserPublicKey();
        return _n(o, i), Ye(), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46NostrconnectStart": {
      const n = t, r = S.slice(0, 2);
      Ye();
      const o = rn(), i = Ve(ee(16));
      return se = { clientSecretKey: o, relayUrls: r, secret: i, abort: new AbortController() }, { uri: Fi({
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
        ({ signerPubkey: r } = await Hi({
          clientSecretKey: n.clientSecretKey,
          relayUrls: n.relayUrls,
          secret: n.secret,
          timeoutMs: 18e4,
          signal: n.abort.signal
        }));
      } catch (i) {
        throw se === n && Ye(), i;
      }
      if (se !== n) throw new Error("This signer-connection attempt was superseded.");
      se = null;
      const o = new hn({
        clientSecretKey: n.clientSecretKey,
        pointer: { signerPubkey: r, relayUrls: n.relayUrls },
        onAuthUrl: kn
      });
      try {
        const i = await o.getUserPublicKey();
        return _n(o, i), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46SignEvent": {
      const n = t;
      return De().client.signEvent({
        kind: n.kind,
        content: n.content,
        tags: n.tags ?? [],
        created_at: n.created_at ?? Math.floor(Date.now() / 1e3)
      });
    }
    case "nip46Nip44Encrypt": {
      const n = t;
      return { ciphertext: await De().client.nip44Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip44Decrypt": {
      const n = t;
      return { plaintext: await De().client.nip44Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Nip04Encrypt": {
      const n = t;
      return { ciphertext: await De().client.nip04Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip04Decrypt": {
      const n = t;
      return { plaintext: await De().client.nip04Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Disconnect": {
      const n = ge;
      return ge = null, Ye(), n && Ir(n.client), {};
    }
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (S = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (Ue = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await jo({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: S }) : await Yn({ loginName: n.loginName, password: n.password, vaultRelayUrls: S });
      return Oe(), d.signer = new et(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryEvent, d.everydayKeyDerived = r.everydayKeyDerived, Rt(r.connectionVaultRoot, r.vaultSudoKey), await Je(), {
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
      const r = Xn(t.nsecOrHex), o = _(r), i = { everydayPublicKey: o, npub: Qe(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await $o({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: S,
        store: Q,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return Oe(), d.signer = new et(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryCapsuleEvent, d.everydayKeyDerived = r.everydayKeyDerived, Rt(r.connectionVaultRoot, r.vaultSudoKey), await Je(), !r.rollbackWarning && !r.relayDisagreementWarning && sn({
        relayUrls: S,
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
      const n = t, r = await Bo({
        phrase: n.phrase,
        vaultRelayUrls: S,
        discoveryRelayUrls: Ue,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return mn(r);
    }
    case "previewPhraseRebuild": {
      const r = await zo({ phrase: t.phrase, vaultRelayUrls: S, discoveryRelayUrls: Ue });
      return { ...r, npub: Qe(r.everydayPublicKey) };
    }
    case "rebuildFromPhrase": {
      const r = await Fo({ phrase: t.phrase, vaultRelayUrls: S, discoveryRelayUrls: Ue });
      return mn(r);
    }
    case "completeRecovery": {
      const n = t;
      if (!d.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await Go({
        recovered: d.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: S,
        store: Q
      });
      return d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.refreshedRecoveryEvent, d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery = null, await Je(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await Ho({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: S,
        store: Q,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return d.activeCredentialEvent = r.newCredentialEvent, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.recoveryCapsuleEvent, await Je(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = ae();
      return ho({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: Ue
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
      return { nsec: Yr(n), npub: Qe(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (ae(), !d.recoveryPublicKey || !d.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return Jr({
        recoveryPublicKeyHex: d.recoveryPublicKey,
        vaultRelayUrls: S,
        recoveryCapsuleEvents: [d.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return sn({
        relayUrls: S,
        credentialEvent: d.activeCredentialEvent,
        recoveryEvent: d.activeRecoveryEvent
      });
    }
    case "checkReplicaHealth": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return So({
        relayUrls: S,
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
      const n = await fa(Q);
      return n ? (Oe(), d.signer = new et(n.everydayPrivateKey), d.everydayPrivateKey = n.everydayPrivateKey, d.accountId = n.accountId, d.recoveryPublicKey = n.recoveryPublicKey, d.activeCredentialEvent = n.activeCredentialEvent, d.activeRecoveryEvent = n.activeRecoveryEvent, d.everydayKeyDerived = n.everydayKeyDerived ?? !1, d.connectionVaultRoot = n.connectionVaultRoot ?? null, d.vaultKnown = n.vaultEnabled !== void 0, await xr(), {
        restored: !0,
        everydayPublicKey: d.signer.getPublicKey(),
        accountId: n.accountId,
        everydayKeyDerived: d.everydayKeyDerived
      }) : { restored: !1 };
    }
    case "logout":
      return Oe(), await wa(Q), await ba(Q), {};
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return d.signer ? d.connectionVaultRoot ? { enabled: !0, vaultPublicKey: At().vaultPublicKey } : { enabled: !1, reason: d.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a } = await tt();
      return { connections: n.map(Le), rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a };
    }
    case "vaultSaveNwc": {
      const n = t, r = Me(), o = At(), i = vn(n.uri), a = n.label.trim().slice(0, 120) || "Wallet connection", { record: s, event: c } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: a,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: c,
        connectionId: s.connection_id,
        relayUrls: S,
        store: Q
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const u = await o.decryptEvent(c);
      return Le(u);
    }
    case "vaultFindForOrigin": {
      const n = Me(), { connections: r } = await tt(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? Le(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await gt(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== Me())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return Pr(i), { uri: Zi(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await gt(n.connectionId), i = n.origin === null ? null : Me(), { record: a, event: s } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: s,
        connectionId: a.connection_id,
        relayUrls: S,
        store: Q
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const l = await r.decryptEvent(s);
      return Le(l);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await gt(n.connectionId), { record: i, event: a } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: a,
        connectionId: i.connection_id,
        relayUrls: S,
        store: Q
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const c = r.buildDeletionRequest(o.event.id), l = new A(S);
        await l.publishAll(c), l.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = Me(), o = vn(n.uri), { connections: i } = await tt(), a = i.find(
        (s) => s.record.connection_type === "nwc" && ea(s.record.credential, o)
      );
      return a ? a.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: Le(a) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const Ea = /* @__PURE__ */ new Set([
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
  if (typeof t.action != "string" || !Ea.has(t.action)) {
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
  (r.startsWith("nip46") ? (a) => a() : (a) => ka.run(a))(() => _a(r, o)).then(
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
