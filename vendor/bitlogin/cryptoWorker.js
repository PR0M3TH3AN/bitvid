import { v as ie, g as _, s as ee, c as zn, K as Bn, b as jt, d as it, f as at, h as te, u as ue, j as Gn, k as Fn, l as H, m as J, n as ct, S as st, o as lt, q as $e, D as ke, t as We, w as ut, x as Hn, y as Jn, z as Yn, A as Qn, B as Ge, C as At, F as $t, G as Xn, H as Zn, I as er, J as Le, L as Wt, M as tr, N as nr, O as dt, P as ze, Q as Ce, T as rr, U as zt, V as or, W as ir, X as xe, Y as ge, Z as ar, _ as we, $ as _e, a0 as Bt, a1 as yt, a2 as cr, a3 as Gt, a4 as Ft, a5 as sr, a6 as lr, a as Ct, a7 as ur } from "./bitlogin-shared-B2Rc9khL.js";
class be extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class ye extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class Ht extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class Me extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class Jt extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function ht(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const dr = { generation: -1, recoveryGeneration: -1 };
function pt(e) {
  return `bitlogin:hwm:${e}`;
}
async function vt(e, t) {
  const n = await e.get(pt(t));
  return n ? JSON.parse(n) : dr;
}
async function Yt(e, t, n) {
  const r = await vt(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(pt(t), JSON.stringify(o)), o;
}
async function yr(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set(pt(t), JSON.stringify(n));
}
function hr() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
class pr {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = hr(), o = new r(this.url);
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
      const [i, a] = o, c = this.subs.get(i);
      c && ie(a) && c.events.push(a);
      return;
    }
    if (r === "EOSE") {
      const [i] = o;
      this.subs.get(i)?.onEose();
      return;
    }
    if (r === "OK") {
      const [i, a, c] = o;
      this.pendingPublishes.get(i)?.({ ok: a, message: c ?? "" }), this.pendingPublishes.delete(i);
      return;
    }
    if (r === "AUTH") {
      const [i] = o;
      this.respondToAuthChallenge(i);
      return;
    }
  }
  async respondToAuthChallenge(t) {
    if (!this.authPrivateKey)
      return;
    const n = _(this.authPrivateKey), r = ee({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Bn,
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
    const r = zn({
      pubkey: "0".repeat(64),
      created_at: Date.now(),
      kind: 0,
      tags: [],
      content: JSON.stringify(t) + Math.random()
    }).slice(0, 16);
    return new Promise((o, i) => {
      const a = [], c = (l) => {
        clearTimeout(s), this.subs.delete(r), this.send(["CLOSE", r]), l ? i(l) : o(a);
      }, s = setTimeout(() => c(new Error("relay did not answer the subscription before the timeout")), n);
      this.subs.set(r, { events: a, onEose: () => c() }), this.send(["REQ", r, t]);
    });
  }
}
class C {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new pr(r, n));
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
function se(e) {
  return e.filter((t) => t.result.ok).length;
}
function vr(e, t, n) {
  return ee({ pubkey: _(e), created_at: n, kind: jt, tags: [], content: JSON.stringify(t) }, e);
}
function fr(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return ee({ pubkey: _(e), created_at: n, kind: it, tags: r, content: "" }, e);
}
function gr(e, t, n) {
  return ee({
    pubkey: _(e),
    created_at: n,
    kind: at,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function wr(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function br(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function mr(e) {
  const t = _(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new C(r), [i, a, c] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [jt] }),
    o.queryQuorum({ authors: [t], kinds: [it] }),
    o.queryQuorum({ authors: [t], kinds: [at] })
  ]);
  o.closeAll();
  const s = i.outcomes.some((p) => p.events.length > 0), l = a.outcomes.some((p) => p.events.length > 0), u = c.outcomes.some((p) => p.events.length > 0), y = new C(r);
  let v = null, w = null, g = null;
  const f = [];
  if (!s && (e.name || e.about || e.picture)) {
    const p = vr(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(y.publishAll(p).then((h) => void (v = h)));
  }
  if (!l) {
    const p = fr(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    f.push(y.publishAll(p).then((h) => void (w = h)));
  }
  if (!u) {
    const p = gr(e.everydayPrivateKey, e.dmRelays, n);
    f.push(y.publishAll(p).then((h) => void (g = h)));
  }
  return await Promise.all(f), y.closeAll(), {
    profilePublished: v !== null && se(v) > 0,
    relayListAcknowledgedCount: w !== null ? se(w) : 0,
    dmRelayListAcknowledgedCount: g !== null ? se(g) : 0,
    profileSkippedExisting: s,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function me(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), a = se(i), s = (await e.queryQuorum({ kinds: [te], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: a,
    readbackVerifiedCount: s,
    success: a >= r && s >= o
  };
}
function kr(e) {
  const t = Gn(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function _r(e) {
  return ue(kr(e));
}
const De = [1024, 2048, 4096], de = 4;
function Er(e) {
  const t = de + e.length, n = De.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${De[De.length - 1]} bytes minus ${de}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, de), r;
}
function Pr(e) {
  if (!De.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - de)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(de, de + n), o = e.slice(de + n);
  for (const i of o)
    if (i !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function ft() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function Qt(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return ft().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function Kr(e, t, n) {
  const r = Fn(), o = await Qt(e), i = await ft().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function Rr(e, t, n, r) {
  const o = await Qt(e);
  try {
    const i = await ft().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function Xt(e) {
  return ue(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function Zt(e) {
  return ue(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function gt(e, t, n) {
  const r = _r(e), o = Er(r), i = await Kr(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: H(i.nonce),
    ciphertext: H(i.ciphertext)
  };
}
async function wt(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = J(e.nonce), o = J(e.ciphertext), i = await Rr(t, r, o, n), a = Pr(i);
  return JSON.parse(ct(a));
}
class Be extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const Ar = /* @__PURE__ */ new Set(["wss:", "ws:"]), Cr = 1e6, xr = /^[0-9a-f]{64}$/u;
function P(e, t) {
  if (!e)
    throw new Be(t);
}
function qe(e) {
  return typeof e == "string" && xr.test(e);
}
function en(e) {
  P(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e) {
    P(typeof t == "string", "Each relay hint must be a string (§12.4.7).");
    let n;
    try {
      n = new URL(t);
    } catch {
      throw new Be(`Invalid relay URL: ${String(t)} (§12.4.7)`);
    }
    P(Ar.has(n.protocol), `Relay URL uses a disallowed scheme: ${t} (§12.4.7)`);
  }
}
function tn(e) {
  P(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = J(e);
  } catch {
    throw new Be("account_id is not valid base64url (§12.4.2).");
  }
  P(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function nn(e, t) {
  P(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = J(e);
  P(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), P(lt(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), P(qe(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = _(n);
  P(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function rn(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  if (!(t === void 0 && n === void 0)) {
    P(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2).");
    for (const [r, o] of [
      ["connection_vault_root", t],
      ["vault_sudo_key", n]
    ]) {
      P(typeof o == "string", `${r} must be a string (§CV5.2).`);
      let i;
      try {
        i = J(o);
      } catch {
        throw new Be(`${r} is not valid base64url (§CV5.2).`);
      }
      P(i.length === 32, `${r} must decode to exactly 32 bytes (§CV5.2).`);
    }
  }
}
function on(e, t) {
  P(Number.isInteger(e) && e >= 0 && e <= Cr, `${t} is out of supported bounds (§12.4.8).`);
}
function Sr(e) {
  P(e.schema === $e, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), tn(e.account_id), on(e.generation, "generation"), nn(e.operational_private_key, e.operational_public_key), P(qe(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), en(e.vault_relay_hints), rn(e);
  const t = e.recovery_capsule_event;
  P(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), P(ie(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), P(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Nr(e) {
  P(e.schema === st, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), tn(e.account_id), on(e.recovery_generation, "recovery_generation"), P(e.previous_recovery_event_id === null || qe(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), nn(e.operational_private_key, e.operational_public_key), P(qe(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), en(e.vault_relay_hints), rn(e);
}
function Ir(e) {
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
async function bt(e) {
  const t = _(e.locatorPrivateKey), n = await gt(e.payload, e.capsuleKey, Xt(t));
  return ee({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: te,
    tags: [["d", ke]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function Tr(e) {
  const t = _(e.oldLocatorPrivateKey);
  return ee({
    pubkey: t,
    created_at: e.createdAt,
    kind: te,
    tags: [["d", ke]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Lr(e, t) {
  if (!ie(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await wt(n, t, Xt(e.pubkey));
  return Sr(r), r;
}
async function an(e) {
  const t = _(e.recoveryPrivateKey), n = await gt(e.payload, e.capsuleKey, Zt(t));
  return ee({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: te,
    tags: [["d", We]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function cn(e, t) {
  if (!ie(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await wt(n, t, Zt(e.pubkey));
  return Nr(r), r;
}
function xt(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === te && ut(o, "d") === n && ie(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function sn(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [te], authors: [t], "#d": [n], limit: 5 }, o), a = i.outcomes.flatMap((v) => v.events), c = xt(a, t, n), s = [];
  for (const v of c)
    try {
      const w = await r(v);
      s.push({ event: v, payload: w });
    } catch (w) {
      s.push({ event: v, payload: null, error: w.message });
    }
  const l = s.find((v) => v.payload !== null) ?? null, u = i.outcomes.map((v) => ({
    responded: v.responded,
    events: xt(v.events, t, n)
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
async function Se(e, t, n, r = 8e3) {
  return sn(e, t, ke, (o) => Lr(o, n), r);
}
async function Ur(e, t, n, r = 8e3) {
  return sn(e, t, We, (o) => cn(o, n), r);
}
function Or(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : Ir(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function Mr(e, t, n, r) {
  const [o, i] = await Promise.all([
    e.publishAll(t, r),
    e.publishAll(n, r)
  ]);
  return {
    credentialAcknowledgedCount: se(o),
    recoveryAcknowledgedCount: se(i),
    relaysTried: e.relayUrls.length
  };
}
const ln = `abandon
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
function Dr(e, t, n, r) {
  Yn(e);
  const o = Qn({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: a, asyncTick: c } = o;
  if (Ge(i), Ge(a), Ge(c), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const s = At(t), l = At(n), u = new Uint8Array(a), y = $t.create(e, s), v = y._cloneInto().update(l);
  return { c: i, dkLen: a, asyncTick: c, DK: u, PRF: y, PRFSalt: v };
}
function Vr(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), Xn(o), n;
}
async function qr(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: a, DK: c, PRF: s, PRFSalt: l } = Dr(e, t, n, r);
  let u;
  const y = new Uint8Array(4), v = Hn(y), w = new Uint8Array(s.outputLen);
  for (let g = 1, f = 0; f < i; g++, f += s.outputLen) {
    const p = c.subarray(f, f + s.outputLen);
    v.setInt32(0, g, !1), (u = l._cloneInto(u)).update(y).digestInto(w), p.set(w.subarray(0, p.length)), await Jn(o - 1, a, () => {
      s._cloneInto(u).update(w).digestInto(w);
      for (let h = 0; h < p.length; h++)
        p[h] ^= w[h];
    });
  }
  return Vr(s, l, c, u, w);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const jr = (e) => e[0] === "あいこくしん";
function un(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function dn(e) {
  const t = un(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function yn(e) {
  er(e, 16, 20, 24, 28, 32);
}
const $r = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([Wt(e)[0] >> t << t]);
};
function hn(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), Le.chain(Le.checksum(1, $r), Le.radix2(11, !0), Le.alphabet(e));
}
function Wr(e, t) {
  const { words: n } = dn(e), r = hn(t).decode(n);
  return yn(r), r;
}
function zr(e, t) {
  return yn(e), hn(t).encode(e).join(jr(t) ? "　" : " ");
}
function Br(e, t) {
  try {
    Wr(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const Gr = (e) => un("mnemonic" + e);
function Fr(e, t = "") {
  return qr(Zn, dn(e).nfkd, Gr(t), { c: 2048, dkLen: 64 });
}
function Hr(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return zr(e, ln);
}
function Jr(e) {
  try {
    return Br(pn(e), ln);
  } catch {
    return !1;
  }
}
function pn(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function vn(e) {
  return Fr(pn(e), "");
}
const mt = tr.id, Ne = "aes-256-gcm-v1", Ie = "bitlogin-bip39-hkdf-v1";
async function fn(e) {
  const t = ze(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await Ce(e.password, t), i = _(r), a = new C(e.vaultRelayUrls, { authPrivateKey: r });
  let c;
  try {
    c = await Se(a, i, o, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (!c.quorumMet)
    throw new ye("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
  if (c.candidates.length > 0)
    throw new Ht();
  const s = Hr(rr()), l = await vn(s), { recoveryPrivateKey: u, capsuleKey: y } = zt(l), v = _(u), w = e.everydayPrivateKey !== void 0;
  if (w && !lt(e.everydayPrivateKey))
    throw new ye("The provided key is not a valid secp256k1 private key.");
  const g = w ? e.everydayPrivateKey : or(), f = _(g), p = H(ir()), h = xe(32), b = xe(32), m = {
    schema: st,
    account_id: p,
    recovery_generation: 0,
    previous_recovery_event_id: null,
    operational_private_key: H(g),
    operational_public_key: f,
    recovery_public_key: v,
    connection_vault_root: H(h),
    vault_sudo_key: H(b),
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: Ne, recovery_derivation: Ie }
  }, K = await an({
    recoveryPrivateKey: u,
    capsuleKey: y,
    payload: m
  }), F = {
    schema: $e,
    account_id: p,
    generation: 0,
    operational_private_key: H(g),
    operational_public_key: f,
    recovery_public_key: v,
    recovery_capsule_event: K,
    connection_vault_root: H(h),
    vault_sudo_key: H(b),
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: mt,
      capsule_encryption: Ne,
      recovery_derivation: Ie
    }
  }, E = await bt({
    locatorPrivateKey: r,
    capsuleKey: o,
    payload: F
  }), R = new C(e.vaultRelayUrls, { authPrivateKey: u }), A = await me(R, K, {
    dTag: We,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  R.closeAll();
  const x = new C(e.vaultRelayUrls, { authPrivateKey: r }), N = await me(x, E, {
    dTag: ke,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (x.closeAll(), !A.success || !N.success)
    throw new ye("Registration did not reach the required relay acknowledgement and readback quorum. Please retry, or add more vault relays.");
  return {
    normalizedLoginName: t,
    recoveryPhrase: s,
    everydayPrivateKey: g,
    everydayPublicKey: f,
    recoveryPublicKey: v,
    locatorPublicKey: i,
    accountId: p,
    imported: w,
    connectionVaultRoot: h,
    vaultSudoKey: b,
    credentialEvent: E,
    recoveryEvent: K,
    credentialPublish: N,
    recoveryPublish: A
  };
}
async function Yr(e) {
  const { nsecOrHex: t, ...n } = e, r = gn(t);
  return fn({ ...n, everydayPrivateKey: r });
}
function gn(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = nr(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = dt(t.toLowerCase());
  else
    throw new ye("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!lt(n))
    throw new ye("The provided key is not a valid secp256k1 private key.");
  return n;
}
class wn {
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
async function Qr(e) {
  const t = ze(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await Ce(e.password, t), o = _(n), i = new C(e.vaultRelayUrls, { authPrivateKey: n });
  try {
    const a = await Se(i, o, r, e.timeoutMs);
    if (!a.quorumMet)
      throw new be("quorum-not-met");
    if (!a.best)
      throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const c = a.best.payload, s = e.store ?? new wn(), l = await vt(s, c.operational_public_key), u = c.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new Jt(l.generation, c.generation);
    const y = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${c.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await Yt(s, c.operational_public_key, { generation: c.generation });
    const v = a.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: J(c.operational_private_key),
      everydayPublicKey: c.operational_public_key,
      recoveryPublicKey: c.recovery_public_key,
      accountId: c.account_id,
      generation: c.generation,
      credentialEvent: a.best.event,
      recoveryCapsuleEvent: c.recovery_capsule_event,
      connectionVaultRoot: c.connection_vault_root ? J(c.connection_vault_root) : void 0,
      vaultSudoKey: c.vault_sudo_key ? J(c.vault_sudo_key) : void 0,
      rollbackWarning: y,
      relayDisagreementWarning: v
    };
  } finally {
    i.closeAll();
  }
}
function St(e) {
  return e.filter((t) => ie(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function Xr(e) {
  if (!Jr(e.phrase))
    throw new Me("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await vn(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = zt(t);
  ge(t);
  const o = _(n), i = new C(e.vaultRelayUrls, { authPrivateKey: n });
  let a;
  try {
    a = await Ur(i, o, r, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (ie(m))
        try {
          f.push({ event: m, payload: await cn(m, r) });
        } catch (K) {
          f.push({ event: m, payload: null, error: K.message });
        }
    const p = /* @__PURE__ */ new Map();
    for (const m of [...a.candidates, ...f])
      p.set(m.event.id, m);
    const h = [...p.values()].sort((m, K) => K.event.created_at - m.event.created_at), b = h.find((m) => m.payload !== null) ?? null;
    a = { ...a, candidates: h, best: b, quorumMet: a.quorumMet || b !== null };
  }
  if (!a.quorumMet)
    throw new be("quorum-not-met");
  if (!a.best)
    throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = a.best.payload, s = Or(a.candidates), l = J(c.operational_private_key), u = c.operational_public_key, y = [.../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...c.vault_relay_hints])], v = new C(y);
  let w = [], g = [];
  try {
    const f = await v.queryQuorum({ kinds: [it], authors: [u], limit: 5 }, e.timeoutMs), p = St(f.outcomes.flatMap((m) => m.events));
    p && (w = wr(p));
    const h = await v.queryQuorum({ kinds: [at], authors: [u], limit: 5 }, e.timeoutMs), b = St(h.outcomes.flatMap((m) => m.events));
    b && (g = br(b));
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
async function Zr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = ze(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = {
    schema: st,
    account_id: r.accountId,
    recovery_generation: r.currentRecoveryPayload.recovery_generation + 1,
    previous_recovery_event_id: r.currentRecoveryEvent.id,
    operational_private_key: H(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    ...o,
    created_at: ht(r.currentRecoveryEvent.created_at, t),
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: Ne, recovery_derivation: Ie }
  }, a = await an({
    recoveryPrivateKey: r.recoveryPrivateKey,
    capsuleKey: r.recoveryCapsuleKey,
    payload: i
  }), c = new C(e.vaultRelayUrls, { authPrivateKey: r.recoveryPrivateKey }), s = await me(c, a, {
    dTag: We,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  c.closeAll();
  const { locatorPrivateKey: l, capsuleKey: u } = await Ce(e.newPassword, n), y = _(l), v = new C(e.vaultRelayUrls, { authPrivateKey: l });
  let w;
  try {
    w = await Se(v, y, u, e.timeoutMs);
  } finally {
    v.closeAll();
  }
  if (!w.quorumMet)
    throw new Me("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
  if (w.candidates.length > 0)
    throw new Me("Another account is already registered with that login name and password. Pick a different one.");
  const g = {
    schema: $e,
    account_id: r.accountId,
    generation: 0,
    operational_private_key: H(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    recovery_capsule_event: a,
    ...o,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: mt,
      capsule_encryption: Ne,
      recovery_derivation: Ie
    }
  }, f = await bt({ locatorPrivateKey: l, capsuleKey: u, payload: g }), p = new C(e.vaultRelayUrls, { authPrivateKey: l }), h = await me(p, f, {
    dTag: ke,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (p.closeAll(), !s.success || !h.success)
    throw new Me("Could not publish the refreshed recovery and credential capsules to enough relays. Please retry.");
  return e.store && await yr(e.store, r.everydayPublicKey, {
    generation: 0,
    recoveryGeneration: r.currentRecoveryPayload.recovery_generation + 1
  }), { normalizedLoginName: n, locatorPublicKey: y, credentialEvent: f, refreshedRecoveryEvent: a, credentialPublish: h, recoveryPublish: s };
}
function bn(e) {
  const t = _(e.privateKey);
  return ee({
    pubkey: t,
    created_at: e.createdAt,
    kind: ar,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function eo(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = ze(e.loginName), r = await Ce(e.oldPassword, n), o = _(r.locatorPrivateKey), i = new C(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey });
  let a;
  try {
    a = await Se(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!a.quorumMet)
    throw new be("quorum-not-met");
  if (!a.best)
    throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = a.best.payload, s = a.best.event, l = e.store ?? new wn(), u = await vt(l, c.operational_public_key);
  if (c.generation < u.generation && !e.acknowledgeRollback)
    throw new Jt(u.generation, c.generation);
  const y = await Ce(e.newPassword, n), v = _(y.locatorPrivateKey), w = new C(e.vaultRelayUrls, { authPrivateKey: y.locatorPrivateKey });
  let g;
  try {
    g = await Se(w, v, y.capsuleKey, e.timeoutMs);
  } finally {
    w.closeAll();
  }
  if (!g.quorumMet)
    throw new ye("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (g.candidates.length > 0)
    throw new Ht("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = c.generation + 1, p = {
    schema: $e,
    account_id: c.account_id,
    generation: f,
    operational_private_key: c.operational_private_key,
    operational_public_key: c.operational_public_key,
    recovery_public_key: c.recovery_public_key,
    recovery_capsule_event: c.recovery_capsule_event,
    // Carried forward like every other long-lived field (§CV5.2): dropping
    // the vault roots on a password change would strand every connection
    // record until the next phrase ceremony.
    ...c.connection_vault_root !== void 0 ? { connection_vault_root: c.connection_vault_root, vault_sudo_key: c.vault_sudo_key } : {},
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: mt,
      capsule_encryption: Ne,
      recovery_derivation: Ie
    }
  }, h = await bt({
    locatorPrivateKey: y.locatorPrivateKey,
    capsuleKey: y.capsuleKey,
    payload: p
  }), b = new C(e.vaultRelayUrls, { authPrivateKey: y.locatorPrivateKey }), m = await me(b, h, {
    dTag: ke,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (b.closeAll(), !m.success)
    throw new ye("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const K = Tr({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: ht(s.created_at, t)
  }), F = bn({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: s.id,
    deletedEventKind: te,
    createdAt: t
  }), E = new C(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey }), [R, A] = await Promise.all([
    E.publishAll(K, e.timeoutMs),
    E.publishAll(F, e.timeoutMs)
  ]);
  return E.closeAll(), await Yt(l, c.operational_public_key, { generation: f }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: v,
    newGeneration: f,
    recoveryPublicKey: c.recovery_public_key,
    recoveryCapsuleEvent: c.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: K,
    deletionRequestEvent: F,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: se(R),
    deletionAcknowledgedCount: se(A)
  };
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function to(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Nt(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Fe(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function T(e, t, n = "") {
  const r = to(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const a = n && `"${n}" `, c = i ? ` of length ${t}` : "", s = r ? `length=${o}` : `type=${typeof e}`, l = a + "expected Uint8Array" + c + ", got " + s;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function S(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function pe(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const Y = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, no = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, ro = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = no(e[t]);
  return e;
}, L = Y ? (e) => e : ro;
function oo(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function mn(e, t) {
  if (oo(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function io(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const ao = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (T(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      T(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && T(o[1], void 0, "AAD");
    const a = t(r, ...o), c = (u, y) => {
      if (y !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        T(y, void 0, "output");
      }
    };
    let s = !1;
    return {
      encrypt(u, y) {
        if (s)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return s = !0, T(u), c(a.encrypt.length, y), a.encrypt(u, y);
      },
      decrypt(u, y) {
        if (T(u), i && u.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return c(a.decrypt.length, y), a.decrypt(u, y);
      }
    };
  }
  return Object.assign(n, e), n;
};
function kt(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (T(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !oe(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function oe(e) {
  return e.byteOffset % 4 === 0;
}
function he(e) {
  return Uint8Array.from(T(e));
}
const kn = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), co = L(S(kn("expand 16-byte k"))), so = L(S(kn("expand 32-byte k")));
function k(e, t) {
  return e << t | e >>> 32 - t;
}
const Pe = 64, lo = 16, Ze = 2 ** 32 - 1, It = /* @__PURE__ */ Uint32Array.of();
function uo(e, t, n, r, o, i, a, c) {
  const s = o.length, l = new Uint8Array(Pe), u = S(l), y = Y && oe(o) && oe(i), v = y ? S(o) : It, w = y ? S(i) : It;
  if (!Y) {
    for (let g = 0; g < s; a++) {
      if (e(t, n, r, u, a, c), L(u), a >= Ze)
        throw new Error("arx: counter overflow");
      const f = Math.min(Pe, s - g);
      for (let p = 0, h; p < f; p++)
        h = g + p, i[h] = o[h] ^ l[p];
      g += f;
    }
    return;
  }
  for (let g = 0; g < s; a++) {
    if (e(t, n, r, u, a, c), a >= Ze)
      throw new Error("arx: counter overflow");
    const f = Math.min(Pe, s - g);
    if (y && f === Pe) {
      const p = g / 4;
      if (g % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < lo; h++)
        b = p + h, w[b] = v[b] ^ u[h];
      g += Pe;
      continue;
    }
    for (let p = 0, h; p < f; p++)
      h = g + p, i[h] = o[h] ^ l[p];
    g += f;
  }
}
function yo(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: a } = io({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Fe(o), Fe(a), Nt(i), Nt(n), (c, s, l, u, y = 0) => {
    T(c, void 0, "key"), T(s, void 0, "nonce"), T(l, void 0, "data");
    const v = l.length;
    if (u = kt(v, u, !1), Fe(y), y < 0 || y >= Ze)
      throw new Error("arx: counter overflow");
    const w = [];
    let g = c.length, f, p;
    if (g === 32)
      w.push(f = he(c)), p = so;
    else if (g === 16 && n)
      f = new Uint8Array(32), f.set(c), f.set(c, 16), p = co, w.push(f);
    else
      throw T(c, 32, "arx key"), new Error("invalid key size");
    (!Y || !oe(s)) && w.push(s = he(s));
    let h = S(f);
    if (r) {
      if (s.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const K = s.subarray(0, 16);
      if (Y)
        r(p, h, S(K), h);
      else {
        const F = L(Uint32Array.from(p));
        r(F, h, S(K), h), pe(F), L(h);
      }
      s = s.subarray(16);
    } else Y || L(h);
    const b = 16 - o;
    if (b !== s.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const K = new Uint8Array(12);
      K.set(s, i ? 0 : 12 - s.length), s = K, w.push(s);
    }
    const m = L(S(s));
    try {
      return uo(e, p, h, m, l, u, y, a), u;
    } finally {
      pe(...w);
    }
  };
}
function ho(e, t, n, r, o, i = 20) {
  let a = e[0], c = e[1], s = e[2], l = e[3], u = t[0], y = t[1], v = t[2], w = t[3], g = t[4], f = t[5], p = t[6], h = t[7], b = o, m = n[0], K = n[1], F = n[2], E = a, R = c, A = s, x = l, N = u, O = y, M = v, D = w, V = g, q = f, j = p, $ = h, W = b, z = m, B = K, G = F;
  for (let Rt = 0; Rt < i; Rt += 2)
    E = E + N | 0, W = k(W ^ E, 16), V = V + W | 0, N = k(N ^ V, 12), E = E + N | 0, W = k(W ^ E, 8), V = V + W | 0, N = k(N ^ V, 7), R = R + O | 0, z = k(z ^ R, 16), q = q + z | 0, O = k(O ^ q, 12), R = R + O | 0, z = k(z ^ R, 8), q = q + z | 0, O = k(O ^ q, 7), A = A + M | 0, B = k(B ^ A, 16), j = j + B | 0, M = k(M ^ j, 12), A = A + M | 0, B = k(B ^ A, 8), j = j + B | 0, M = k(M ^ j, 7), x = x + D | 0, G = k(G ^ x, 16), $ = $ + G | 0, D = k(D ^ $, 12), x = x + D | 0, G = k(G ^ x, 8), $ = $ + G | 0, D = k(D ^ $, 7), E = E + O | 0, G = k(G ^ E, 16), j = j + G | 0, O = k(O ^ j, 12), E = E + O | 0, G = k(G ^ E, 8), j = j + G | 0, O = k(O ^ j, 7), R = R + M | 0, W = k(W ^ R, 16), $ = $ + W | 0, M = k(M ^ $, 12), R = R + M | 0, W = k(W ^ R, 8), $ = $ + W | 0, M = k(M ^ $, 7), A = A + D | 0, z = k(z ^ A, 16), V = V + z | 0, D = k(D ^ V, 12), A = A + D | 0, z = k(z ^ A, 8), V = V + z | 0, D = k(D ^ V, 7), x = x + N | 0, B = k(B ^ x, 16), q = q + B | 0, N = k(N ^ q, 12), x = x + N | 0, B = k(B ^ x, 8), q = q + B | 0, N = k(N ^ q, 7);
  let I = 0;
  r[I++] = a + E | 0, r[I++] = c + R | 0, r[I++] = s + A | 0, r[I++] = l + x | 0, r[I++] = u + N | 0, r[I++] = y + O | 0, r[I++] = v + M | 0, r[I++] = w + D | 0, r[I++] = g + V | 0, r[I++] = f + q | 0, r[I++] = p + j | 0, r[I++] = h + $ | 0, r[I++] = b + W | 0, r[I++] = m + z | 0, r[I++] = K + B | 0, r[I++] = F + G | 0;
}
const _n = /* @__PURE__ */ yo(ho, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), En = 2, et = 1, Pn = 65536, tt = 4294967295;
function Tt(e, t) {
  const n = _e(new Uint8Array([2]), dt(t)), o = Bt.getSharedSecret(e, n, !0).slice(1, 33);
  return yt(ue("nip44-v2"), o);
}
function Kn(e, t) {
  const n = Gt(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function Rn(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
function po(e) {
  if (e < Pn) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function vo(e) {
  const t = e.length;
  if (t < et || t > tt)
    throw new Error(`NIP-44 plaintext length must be between ${et} and ${tt} bytes.`);
  const n = po(t), r = Rn(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function fo(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < Pn)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < et || r > tt || e.length !== o + Rn(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function An(e, t, n) {
  return $t(Wt, e, _e(t, n));
}
function go(e, t, n) {
  const r = xe(32), { chachaKey: o, chachaNonce: i, hmacKey: a } = Kn(e, r), c = vo(ue(t)), s = _n(o, i, c), l = An(a, r, s);
  return we.encode(_e(new Uint8Array([En]), r, s, l));
}
function wo(e, t) {
  const n = we.decode(t);
  if (n[0] !== En)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33), o = n.slice(n.length - 32), i = n.slice(33, n.length - 32), { chachaKey: a, chachaNonce: c, hmacKey: s } = Kn(e, r), l = An(s, r, i);
  if (!cr(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = _n(a, c, i);
  return ct(fo(u));
}
const le = 16, bo = 283;
function mo(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function _t(e) {
  return e << 1 ^ bo & -(e >> 7);
}
function fe(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = _t(e);
  return n;
}
const nt = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= _t(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return pe(e), t;
})(), ko = /* @__PURE__ */ nt.map((e, t) => nt.indexOf(t)), _o = (e) => e << 24 | e >>> 8, He = (e) => e << 8 | e >>> 24;
function Cn(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(He), o = r.map(He), i = o.map(He), a = new Uint32Array(256 * 256), c = new Uint32Array(256 * 256), s = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const y = l * 256 + u;
      a[y] = n[l] ^ r[u], c[y] = o[l] ^ i[u], s[y] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: s, T0: n, T1: r, T2: o, T3: i, T01: a, T23: c };
}
const Et = /* @__PURE__ */ Cn(nt, (e) => fe(e, 3) << 24 | e << 16 | e << 8 | fe(e, 2)), xn = /* @__PURE__ */ Cn(ko, (e) => fe(e, 11) << 24 | fe(e, 13) << 16 | fe(e, 9) << 8 | fe(e, 14)), Eo = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = _t(n))
    e[t] = n;
  return e;
})();
function Sn(e) {
  T(e);
  const t = e.length;
  mo(e);
  const { sbox2: n } = Et, r = [];
  (!Y || !oe(e)) && r.push(e = he(e));
  const o = L(S(e)), i = o.length, a = (s) => Z(n, s, s, s, s), c = new Uint32Array(t + 28);
  c.set(o);
  for (let s = i; s < c.length; s++) {
    let l = c[s - 1];
    s % i === 0 ? l = a(_o(l)) ^ Eo[s / i - 1] : i > 6 && s % i === 4 && (l = a(l)), c[s] = c[s - i] ^ l;
  }
  return pe(...r), c;
}
function Po(e) {
  const t = Sn(e), n = t.slice(), r = t.length, { sbox2: o } = Et, { T0: i, T1: a, T2: c, T3: s } = xn;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  pe(t);
  for (let l = 4; l < r - 4; l++) {
    const u = n[l], y = Z(o, u, u, u, u);
    n[l] = i[y & 255] ^ a[y >>> 8 & 255] ^ c[y >>> 16 & 255] ^ s[y >>> 24];
  }
  return n;
}
function ce(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function Z(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function Lt(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: c } = Et;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[s++] ^ ce(a, c, t, n, r, o), p = e[s++] ^ ce(a, c, n, r, o, t), h = e[s++] ^ ce(a, c, r, o, t, n), b = e[s++] ^ ce(a, c, o, t, n, r);
    t = f, n = p, r = h, o = b;
  }
  const u = e[s++] ^ Z(i, t, n, r, o), y = e[s++] ^ Z(i, n, r, o, t), v = e[s++] ^ Z(i, r, o, t, n), w = e[s++] ^ Z(i, o, t, n, r);
  return { s0: u, s1: y, s2: v, s3: w };
}
function Ko(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: c } = xn;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let g = 0; g < l; g++) {
    const f = e[s++] ^ ce(a, c, t, o, r, n), p = e[s++] ^ ce(a, c, n, t, o, r), h = e[s++] ^ ce(a, c, r, n, t, o), b = e[s++] ^ ce(a, c, o, r, n, t);
    t = f, n = p, r = h, o = b;
  }
  const u = e[s++] ^ Z(i, t, o, r, n), y = e[s++] ^ Z(i, n, t, o, r), v = e[s++] ^ Z(i, r, n, t, o), w = e[s++] ^ Z(i, o, r, n, t);
  return { s0: u, s1: y, s2: v, s3: w };
}
function Ro(e) {
  if (T(e), e.length % le !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + le);
}
function Ao(e, t, n) {
  T(e);
  let r = e.length;
  const o = r % le;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let c = le - o;
    c || (c = le), r = r + c;
  }
  n = kt(r, n), mn(e, n), (!Y || !oe(e)) && (e = he(e));
  const i = S(e);
  L(i);
  const a = S(n);
  return { b: i, o: a, out: n };
}
function Co(e, t) {
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
function xo(e) {
  const t = new Uint8Array(16), n = S(t);
  t.set(e);
  const r = le - e.length;
  for (let o = le - r; o < le; o++)
    t[o] = r;
  return n;
}
const Nn = /* @__PURE__ */ ao({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, a) {
      const c = Sn(t), { b: s, o: l, out: u } = Ao(i, o, a);
      let y = n;
      const v = [c];
      (!Y || !oe(y)) && v.push(y = he(y));
      const w = S(y);
      L(w);
      let g = w[0], f = w[1], p = w[2], h = w[3], b = 0;
      for (; b + 4 <= s.length; )
        g ^= s[b + 0], f ^= s[b + 1], p ^= s[b + 2], h ^= s[b + 3], { s0: g, s1: f, s2: p, s3: h } = Lt(c, g, f, p, h), l[b++] = g, l[b++] = f, l[b++] = p, l[b++] = h;
      if (o) {
        const m = xo(i.subarray(b * 4));
        L(m), g ^= m[0], f ^= m[1], p ^= m[2], h ^= m[3], { s0: g, s1: f, s2: p, s3: h } = Lt(c, g, f, p, h), l[b++] = g, l[b++] = f, l[b++] = p, l[b++] = h;
      }
      return L(l), pe(...v), u;
    },
    decrypt(i, a) {
      Ro(i);
      const c = Po(t);
      let s = n;
      const l = [c];
      (!Y || !oe(s)) && l.push(s = he(s));
      const u = S(s);
      L(u), a = kt(i.length, a), mn(i, a), (!Y || !oe(i)) && l.push(i = he(i));
      const y = S(i), v = S(a);
      L(y);
      let w = u[0], g = u[1], f = u[2], p = u[3];
      for (let h = 0; h + 4 <= y.length; ) {
        const b = w, m = g, K = f, F = p;
        w = y[h + 0], g = y[h + 1], f = y[h + 2], p = y[h + 3];
        const { s0: E, s1: R, s2: A, s3: x } = Ko(c, w, g, f, p);
        v[h++] = E ^ b, v[h++] = R ^ m, v[h++] = A ^ K, v[h++] = x ^ F;
      }
      return L(v), pe(...l), Co(a, o);
    }
  };
});
function In(e, t) {
  const n = _e(new Uint8Array([2]), dt(t));
  return Bt.getSharedSecret(e, n, !0).slice(1, 33);
}
function So(e, t, n, r) {
  const o = In(e, t), i = xe(16), a = Nn(o, i).encrypt(ue(n));
  return `${we.encode(a)}?iv=${we.encode(i)}`;
}
function No(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = we.decode(n.slice(0, r)), i = we.decode(n.slice(r + 4)), a = In(e, t), c = Nn(a, i).decrypt(o);
  return ct(c);
}
class Ue {
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
    return this.assertAlive(), ee({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), go(Tt(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), wo(Tt(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), So(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), No(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    ge(this.privateKey), this.destroyed = !0;
  }
}
const Io = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social"
], To = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net"
], Tn = "bitlogin.connection.v1", Ln = "bitlogin.connection.nwc.v1", Lo = "bitlogin/connection-vault-root/v1", Uo = "bitlogin/connection-vault-signing/v1", Oo = "bitlogin/connection-record-encryption/v1", Mo = "bitlogin/connection-vault-personal/v1", rt = "bitlogin:connection:";
function Do(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return yt(Ft(Lo), e);
}
function Ee(e) {
  return sr(e, Uo).scalar;
}
function Vo(e) {
  return _(Ee(e));
}
function qo(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return yt(Ft(Mo), _e(e, t));
}
function Un(e, t) {
  const n = Pt(t);
  return Gt(e, _e(ue(Oo), new Uint8Array([0]), n), 32);
}
function jo() {
  return H(xe(16));
}
function Pt(e) {
  const t = J(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function On(e) {
  return Pt(e), `${rt}${e}`;
}
function Mn(e) {
  if (!e.startsWith(rt))
    return null;
  const t = e.slice(rt.length);
  try {
    return Pt(t), t;
  } catch {
    return null;
  }
}
const Ut = 120, $o = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), Wo = /* @__PURE__ */ new Set(["connectable", "personal"]);
class ve extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function Dn(e, t) {
  return ue(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function Vn(e) {
  const t = e, n = (i) => {
    throw new ve(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== Tn && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), Wo.has(t.tier) || n("tier must be connectable or personal."), $o.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > Ut) && n(`label must be a string of at most ${Ut} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function Je(e) {
  Vn(e.record);
  const t = Ee(e.vaultPrk), n = _(t), r = On(e.record.connection_id), o = Un(e.recordPrk, e.record.connection_id), i = await gt(e.record, o, Dn(n, r));
  return ee({
    pubkey: n,
    created_at: ht(e.previousCreatedAt, e.now),
    kind: te,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function zo(e, t, n) {
  if (!ie(e))
    throw new ve("Connection record event has an invalid id or signature.");
  const r = _(Ee(t));
  if (e.pubkey !== r)
    throw new ve("Connection record event is not signed by this vault's identity.");
  const o = ut(e, "d") ?? "", i = Mn(o);
  if (i === null)
    throw new ve("Connection record event has a malformed d tag.");
  const a = JSON.parse(e.content), c = Dn(e.pubkey, o), s = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const l of s) {
    let u;
    try {
      u = await wt(a, Un(l.prk, i), c);
    } catch {
      continue;
    }
    if (Vn(u), u.connection_id !== i)
      throw new ve("Connection record id does not match its d tag.");
    if (u.tier !== l.tier)
      throw new ve("Connection record tier does not match the key that decrypted it.");
    return { record: u, tier: l.tier, event: e };
  }
  return null;
}
function Bo(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const je = /^[0-9a-f]{64}$/u;
class re extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function Ot(e) {
  const t = e.trim();
  if (!/^nostr\+walletconnect:\/\//iu.test(t))
    throw new re("Not an NWC URI: it must start with nostr+walletconnect://");
  let n;
  try {
    n = new URL(t.replace(/^nostr\+walletconnect:\/\//iu, "http://"));
  } catch {
    throw new re("The NWC URI is malformed.");
  }
  const r = n.hostname.toLowerCase();
  if (!je.test(r))
    throw new re("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let a = null, c = null;
  for (const [s, l] of n.searchParams.entries())
    if (s === "relay") {
      let u;
      try {
        u = new URL(l);
      } catch {
        throw new re("A relay parameter in the NWC URI is not a valid URL.");
      }
      if (u.protocol !== "wss:" && u.protocol !== "ws:")
        throw new re("A relay parameter in the NWC URI is not a websocket URL.");
      o.push(l);
    } else if (s === "secret") {
      const u = l.toLowerCase();
      if (!je.test(u))
        throw new re("The NWC URI's secret is not a 64-char hex client key.");
      a = u;
    } else s === "lud16" ? c = l : i.push([s, l]);
  if (o.length === 0)
    throw new re("The NWC URI names no relay.");
  if (a === null)
    throw new re("The NWC URI carries no secret.");
  return {
    schema: Ln,
    wallet_pubkey: r,
    relays: o,
    secret: a,
    lud16: c,
    extra_params: i
  };
}
function Go(e) {
  qn(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function Fo(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function qn(e) {
  const t = e, n = (r) => {
    throw new re(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== Ln && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !je.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), (typeof t.secret != "string" || !je.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
function jn(e, t) {
  return `bitlogin:vault-hwm:${e}:${t}`;
}
async function $n(e, t, n) {
  const r = await e.get(jn(t, n));
  return r ? JSON.parse(r) : null;
}
async function Wn(e, t, n, r) {
  const o = await $n(e, t, n);
  o && o.createdAt > r.createdAt || o && o.createdAt === r.createdAt && o.eventId <= r.eventId || await e.set(jn(t, n), JSON.stringify(r));
}
async function Ho(e) {
  const t = Ee(e.vaultPrk), n = new C(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await me(n, e.event, {
      dTag: On(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll();
  }
  return r.success && await Wn(e.store, e.event.pubkey, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const Mt = 500;
async function Jo(e) {
  const t = Ee(e.vaultPrk), n = _(t), r = new C(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [te], authors: [n], limit: Mt }, e.timeoutMs);
  } finally {
    r.closeAll();
  }
  const i = o.outcomes.some((l) => l.events.length >= Mt), a = /* @__PURE__ */ new Map();
  for (const l of o.outcomes.flatMap((u) => u.events)) {
    if (!ie(l) || l.pubkey !== n)
      continue;
    const u = Mn(ut(l, "d") ?? "");
    if (u === null)
      continue;
    const y = a.get(u);
    (!y || l.created_at > y.created_at) && a.set(u, l);
  }
  const c = /* @__PURE__ */ new Map(), s = [];
  for (const [l, u] of a) {
    const y = await $n(e.store, n, l);
    if (y !== null && (u.created_at < y.createdAt || u.created_at === y.createdAt && u.id < y.eventId)) {
      s.push(l);
      continue;
    }
    c.set(l, u), await Wn(e.store, n, l, {
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
class Yo {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = Do(this.connectionVaultRoot), this.vaultPublicKey = Vo(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = qo(this.connectionVaultRoot, t), ge(t);
  }
  /** Closes the sudo window and wipes the personal-tier key material. */
  endSudo() {
    this.personalPrk && ge(this.personalPrk), this.personalPrk = null;
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
    this.endSudo(), ge(this.vaultPrk, this.connectionVaultRoot), this.destroyed = !0;
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
      schema: Tn,
      connection_id: jo(),
      connection_type: t.connection_type,
      tier: t.tier,
      state: "active",
      label: t.label,
      created_at: n,
      updated_at: n,
      credential: t.credential,
      application_binding: t.application_binding ?? { origin: null, app_pubkey: null },
      notes: t.notes ?? null
    }, o = await Je({
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
    }, a = await Je({
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
    const r = n ?? Math.floor(Date.now() / 1e3), o = Bo(t.record, r), i = await Je({
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
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : zo(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return bn({
      privateKey: Ee(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: te,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return Ho({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return Jo({ vaultPrk: this.vaultPrk, ...t });
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
const Qo = "bitlogin", ae = "kv", Q = "device-keys", Xo = 2;
function Zo() {
  return new Promise((e, t) => {
    const n = indexedDB.open(Qo, Xo);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(ae) || r.createObjectStore(ae), r.objectStoreNames.contains(Q) || r.createObjectStore(Q);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class ei {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Zo()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(ae, "readonly").objectStore(ae).get(t);
      a.onsuccess = () => r(a.result), a.onerror = () => o(a.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, i) => {
      const a = r.transaction(ae, "readwrite");
      a.objectStore(ae).put(n, t), a.oncomplete = () => o(), a.onerror = () => i(a.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(ae, "readwrite");
      i.objectStore(ae).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
  /**
   * Returns a non-extractable AES-GCM key kept by the browser's IndexedDB
   * implementation. The key is deliberately separate from the string-only KV
   * API so callers cannot accidentally serialize it as application data.
   */
  async getOrCreateDeviceKey(t) {
    const n = await this.db(), r = await new Promise((i, a) => {
      const c = n.transaction(Q, "readonly").objectStore(Q).get(t);
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
        const c = n.transaction(Q, "readwrite");
        c.objectStore(Q).add(o, t), c.oncomplete = () => i(), c.onerror = () => a(c.error);
      }), o;
    } catch {
      const i = await new Promise((a, c) => {
        const s = n.transaction(Q, "readonly").objectStore(Q).get(t);
        s.onsuccess = () => a(s.result), s.onerror = () => c(s.error);
      });
      if (i) return i;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(Q, "readwrite");
      i.objectStore(Q).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
}
const Te = "bitlogin:session:v1", Kt = "bitlogin:session-device-key:v1";
function Dt(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function Vt(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function qt(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function ti(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function ni(e, t) {
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
      await e.delete(Te);
      return;
    }
    const r = await e.getOrCreateDeviceKey(Kt), o = crypto.getRandomValues(new Uint8Array(12)), i = new TextEncoder().encode(JSON.stringify(n)), a = await crypto.subtle.encrypt({ name: "AES-GCM", iv: o }, r, i), c = {
      v: 2,
      iv: Dt(o),
      ciphertext: Dt(new Uint8Array(a))
    };
    await e.set(Te, JSON.stringify(c));
  } catch {
  }
}
async function ri(e) {
  let t;
  try {
    t = await e.get(Te);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    if (!ti(n) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(Te), null;
    const r = await e.getOrCreateDeviceKey(Kt), o = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: qt(Vt(n.iv)) },
      r,
      qt(Vt(n.ciphertext))
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
async function oi(e) {
  try {
    await e.delete(Te), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(Kt);
  } catch {
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
let U = [...Io], Ye = [...To];
const X = new ei();
function ne() {
  if (!d.signer || !d.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: d.signer, everydayPrivateKey: d.everydayPrivateKey };
}
function Ke() {
  d.signer?.destroy(), d.everydayPrivateKey && d.everydayPrivateKey.fill(0), d.signer = null, d.everydayPrivateKey = null, d.accountId = null, d.recoveryPublicKey = null, d.activeCredentialEvent = null, d.activeRecoveryEvent = null, d.vault?.destroy(), d.vault = null, d.connectionVaultRoot && d.connectionVaultRoot.fill(0), d.connectionVaultRoot = null, d.vaultKnown = !1, d.pendingRecovery && (d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery.everydayPrivateKey.fill(0), d.pendingRecovery = null);
}
function Qe(e, t) {
  d.connectionVaultRoot = e ?? null, d.vaultKnown = !0, d.vault = null, t && ge(t);
}
async function Oe() {
  !d.everydayPrivateKey || !d.accountId || !d.recoveryPublicKey || !d.activeCredentialEvent || !d.activeRecoveryEvent || await ni(X, {
    everydayPrivateKey: d.everydayPrivateKey,
    accountId: d.accountId,
    recoveryPublicKey: d.recoveryPublicKey,
    activeCredentialEvent: d.activeCredentialEvent,
    activeRecoveryEvent: d.activeRecoveryEvent,
    ...d.connectionVaultRoot ? { connectionVaultRoot: d.connectionVaultRoot } : {},
    ...d.vaultKnown ? { vaultEnabled: d.connectionVaultRoot !== null } : {}
  });
}
function Re() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function ot() {
  if (!d.signer) throw new Error("No identity is unlocked in this session.");
  if (!d.connectionVaultRoot)
    throw new Error(
      d.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return d.vault ??= new Yo(d.connectionVaultRoot.slice()), d.vault;
}
function Ae(e) {
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
async function Ve() {
  const e = ot(), t = await e.listConnections({ relayUrls: U, store: X });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings
  };
}
async function Xe(e) {
  const { vault: t, connections: n } = await Ve(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
async function ii(e, t) {
  switch (e) {
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (U = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (Ye = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await Yr({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: U }) : await fn({ loginName: n.loginName, password: n.password, vaultRelayUrls: U });
      return Ke(), d.signer = new Ue(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryEvent, Qe(r.connectionVaultRoot, r.vaultSudoKey), await Oe(), {
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
      const r = gn(t.nsecOrHex), o = _(r), i = { everydayPublicKey: o, npub: Ct(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await Qr({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: U,
        store: X,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return Ke(), d.signer = new Ue(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.recoveryCapsuleEvent, Qe(r.connectionVaultRoot, r.vaultSudoKey), await Oe(), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await Xr({
        phrase: n.phrase,
        vaultRelayUrls: U,
        discoveryRelayUrls: Ye,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return Ke(), d.pendingRecovery = r, d.signer = new Ue(r.everydayPrivateKey), d.everydayPrivateKey = r.everydayPrivateKey, d.accountId = r.accountId, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.currentRecoveryEvent, Qe(
        r.currentRecoveryPayload.connection_vault_root ? J(r.currentRecoveryPayload.connection_vault_root) : void 0
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
      const r = await Zr({
        recovered: d.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: U,
        store: X
      });
      return d.activeCredentialEvent = r.credentialEvent, d.activeRecoveryEvent = r.refreshedRecoveryEvent, d.pendingRecovery.recoveryPrivateKey.fill(0), d.pendingRecovery = null, await Oe(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await eo({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: U,
        store: X,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return d.activeCredentialEvent = r.newCredentialEvent, d.recoveryPublicKey = r.recoveryPublicKey, d.activeRecoveryEvent = r.recoveryCapsuleEvent, await Oe(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = ne();
      return mr({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: Ye
      });
    }
    case "getPublicKey": {
      const { signer: n } = ne();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = ne(), r = t;
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = ne(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = ne(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = ne(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = ne(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = ne();
      return { nsec: ur(n), npub: Ct(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (ne(), !d.recoveryPublicKey || !d.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return lr({
        recoveryPublicKeyHex: d.recoveryPublicKey,
        vaultRelayUrls: U,
        recoveryCapsuleEvents: [d.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!d.activeCredentialEvent || !d.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const n = new C(U), r = await Mr(n, d.activeCredentialEvent, d.activeRecoveryEvent);
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
      const n = await ri(X);
      return n ? (Ke(), d.signer = new Ue(n.everydayPrivateKey), d.everydayPrivateKey = n.everydayPrivateKey, d.accountId = n.accountId, d.recoveryPublicKey = n.recoveryPublicKey, d.activeCredentialEvent = n.activeCredentialEvent, d.activeRecoveryEvent = n.activeRecoveryEvent, d.connectionVaultRoot = n.connectionVaultRoot ?? null, d.vaultKnown = n.vaultEnabled !== void 0, { restored: !0, everydayPublicKey: d.signer.getPublicKey(), accountId: n.accountId }) : { restored: !1 };
    }
    case "logout":
      return Ke(), await oi(X), {};
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return d.signer ? d.connectionVaultRoot ? { enabled: !0, vaultPublicKey: ot().vaultPublicKey } : { enabled: !1, reason: d.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r } = await Ve();
      return { connections: n.map(Ae), rollbackWarnings: r };
    }
    case "vaultSaveNwc": {
      const n = t, r = Re(), o = ot(), i = Ot(n.uri), a = n.label.trim().slice(0, 120) || "Wallet connection", { record: c, event: s } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: a,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: s,
        connectionId: c.connection_id,
        relayUrls: U,
        store: X
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const u = await o.decryptEvent(s);
      return Ae(u);
    }
    case "vaultFindForOrigin": {
      const n = Re(), { connections: r } = await Ve(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? Ae(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await Xe(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== Re())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return qn(i), { uri: Go(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await Xe(n.connectionId), i = n.origin === null ? null : Re(), { record: a, event: c } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: c,
        connectionId: a.connection_id,
        relayUrls: U,
        store: X
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const l = await r.decryptEvent(c);
      return Ae(l);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await Xe(n.connectionId), { record: i, event: a } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: a,
        connectionId: i.connection_id,
        relayUrls: U,
        store: X
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const s = r.buildDeletionRequest(o.event.id), l = new C(U);
        await l.publishAll(s), l.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = Re(), o = Ot(n.uri), { connections: i } = await Ve(), a = i.find(
        (c) => c.record.connection_type === "nwc" && Fo(c.record.credential, o)
      );
      return a ? a.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: Ae(a) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const ai = /* @__PURE__ */ new Set([
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
  if (typeof t.action != "string" || !ai.has(t.action)) {
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
  ii(r, o).then(
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
