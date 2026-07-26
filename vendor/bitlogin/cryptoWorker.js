import { v as le, g as x, s as Z, K as ln, c as un, b as vt, d as Be, f as Ge, h as he, u as ve, j as dn, k as yn, l as ae, m as de, n as Ve, S as He, o as We, q as Le, D as fe, t as Ne, w as pn, x as hn, y as vn, z as fn, A as Oe, B as at, C as ft, F as gn, G as wn, H as bn, I as Ke, J as gt, L as mn, M as kn, N as Fe, O as Ie, P as me, Q as En, T as wt, U as Pn, V as _n, W as Kn, X as bt, Y as ye, Z as Te, _ as mt, $ as xn, a0 as Rn, a1 as An, a2 as Cn, a as it, a3 as Sn } from "./bitlogin-shared-QIBe5Omw.js";
class pe extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class ie extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class kt extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class Et extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class Pt extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function _t(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const Ln = { generation: -1, recoveryGeneration: -1 };
function Kt(e) {
  return `bitlogin:hwm:${e}`;
}
async function Je(e, t) {
  const n = await e.get(Kt(t));
  return n ? JSON.parse(n) : Ln;
}
async function xt(e, t, n) {
  const r = await Je(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(Kt(t), JSON.stringify(o)), o;
}
function Nn() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
class In {
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
      const r = Nn(), o = new r(this.url);
      this.ws = o;
      const a = setTimeout(() => {
        n(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(a), t();
      }), o.addEventListener("error", () => {
        clearTimeout(a), n(new Error(`WebSocket error connecting to relay ${this.url}`));
      }), o.addEventListener("close", () => {
        this.connectPromise = null;
      }), o.addEventListener("message", (i) => {
        this.handleMessage(String(i.data));
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
      const [a, i] = o, s = this.subs.get(a);
      s && le(i) && s.events.push(i);
      return;
    }
    if (r === "EOSE") {
      const [a] = o;
      this.subs.get(a)?.onEose();
      return;
    }
    if (r === "OK") {
      const [a, i, s] = o;
      this.pendingPublishes.get(a)?.({ ok: i, message: s ?? "" }), this.pendingPublishes.delete(a);
      return;
    }
    if (r === "AUTH") {
      const [a] = o;
      this.respondToAuthChallenge(a);
      return;
    }
  }
  async respondToAuthChallenge(t) {
    if (!this.authPrivateKey)
      return;
    const n = x(this.authPrivateKey), r = Z({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: ln,
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
      this.pendingPublishes.set(t.id, (a) => {
        clearTimeout(o), r(a);
      }), this.send(["EVENT", t]);
    });
  }
  async queryOnce(t, n = 8e3) {
    await this.connect();
    const r = un({
      pubkey: "0".repeat(64),
      created_at: Date.now(),
      kind: 0,
      tags: [],
      content: JSON.stringify(t) + Math.random()
    }).slice(0, 16);
    return new Promise((o) => {
      const a = [], i = () => {
        clearTimeout(s), this.subs.delete(r), this.send(["CLOSE", r]), o(a);
      }, s = setTimeout(i, n);
      this.subs.set(r, { events: a, onEose: i }), this.send(["REQ", r, t]);
    });
  }
}
class I {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new In(r, n));
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
    })), a = o.filter((s) => s.responded).length, i = o.length;
    return {
      outcomes: o,
      quorumMet: a >= Math.ceil(i / 2),
      respondedCount: a,
      totalCount: i
    };
  }
  /** Publishes an event to every configured relay, best-effort (§15.6, §24.4). */
  async publishAll(t, n = 8e3) {
    const r = [...this.connections.entries()];
    return Promise.all(r.map(async ([o, a]) => {
      try {
        const i = await a.publish(t, n);
        return { relayUrl: o, result: i };
      } catch (i) {
        return { relayUrl: o, result: { ok: !1, message: i.message } };
      }
    }));
  }
  closeAll() {
    for (const t of this.connections.values())
      t.close();
  }
}
function ne(e) {
  return e.filter((t) => t.result.ok).length;
}
function Tn(e, t, n) {
  return Z({ pubkey: x(e), created_at: n, kind: vt, tags: [], content: JSON.stringify(t) }, e);
}
function On(e, t, n) {
  const r = t.map((o) => {
    const a = ["r", o.url];
    return o.read && !o.write && a.push("read"), o.write && !o.read && a.push("write"), a;
  });
  return Z({ pubkey: x(e), created_at: n, kind: Be, tags: r, content: "" }, e);
}
function Mn(e, t, n) {
  return Z({
    pubkey: x(e),
    created_at: n,
    kind: Ge,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Un(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function Dn(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function qn(e) {
  const t = x(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new I(r), [a, i, s] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [vt] }),
    o.queryQuorum({ authors: [t], kinds: [Be] }),
    o.queryQuorum({ authors: [t], kinds: [Ge] })
  ]);
  o.closeAll();
  const c = a.outcomes.some((h) => h.events.length > 0), l = i.outcomes.some((h) => h.events.length > 0), u = s.outcomes.some((h) => h.events.length > 0), d = new I(r);
  let g = null, w = null, v = null;
  const f = [];
  if (!c && (e.name || e.about || e.picture)) {
    const h = Tn(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(d.publishAll(h).then((p) => void (g = p)));
  }
  if (!l) {
    const h = On(e.everydayPrivateKey, e.generalRelays.map((p) => ({ url: p, read: !0, write: !0 })), n);
    f.push(d.publishAll(h).then((p) => void (w = p)));
  }
  if (!u) {
    const h = Mn(e.everydayPrivateKey, e.dmRelays, n);
    f.push(d.publishAll(h).then((p) => void (v = p)));
  }
  return await Promise.all(f), d.closeAll(), {
    profilePublished: g !== null && ne(g) > 0,
    relayListAcknowledgedCount: w !== null ? ne(w) : 0,
    dmRelayListAcknowledgedCount: v !== null ? ne(v) : 0,
    profileSkippedExisting: c,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function ke(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, a = await e.publishAll(t, n.timeoutMs), i = ne(a), c = (await e.queryQuorum({ kinds: [he], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: i,
    readbackVerifiedCount: c,
    success: i >= r && c >= o
  };
}
function jn(e) {
  const t = dn(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function zn(e) {
  return ve(jn(e));
}
const Ae = [1024, 2048, 4096], oe = 4;
function $n(e) {
  const t = oe + e.length, n = Ae.find((a) => a >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${Ae[Ae.length - 1]} bytes minus ${oe}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, oe), r;
}
function Bn(e) {
  if (!Ae.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - oe)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(oe, oe + n), o = e.slice(oe + n);
  for (const a of o)
    if (a !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Ye() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function Rt(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Ye().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function Gn(e, t, n) {
  const r = yn(), o = await Rt(e), a = await Ye().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(a) };
}
async function Vn(e, t, n, r) {
  const o = await Rt(e);
  try {
    const a = await Ye().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(a);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function At(e) {
  return ve(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function Ct(e) {
  return ve(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function St(e, t, n) {
  const r = zn(e), o = $n(r), a = await Gn(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: ae(a.nonce),
    ciphertext: ae(a.ciphertext)
  };
}
async function Lt(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = de(e.nonce), o = de(e.ciphertext), a = await Vn(t, r, o, n), i = Bn(a);
  return JSON.parse(Ve(i));
}
class Qe extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const Hn = /* @__PURE__ */ new Set(["wss:", "ws:"]), Wn = 1e6, Fn = /^[0-9a-f]{64}$/u;
function R(e, t) {
  if (!e)
    throw new Qe(t);
}
function Ce(e) {
  return typeof e == "string" && Fn.test(e);
}
function Nt(e) {
  R(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e) {
    R(typeof t == "string", "Each relay hint must be a string (§12.4.7).");
    let n;
    try {
      n = new URL(t);
    } catch {
      throw new Qe(`Invalid relay URL: ${String(t)} (§12.4.7)`);
    }
    R(Hn.has(n.protocol), `Relay URL uses a disallowed scheme: ${t} (§12.4.7)`);
  }
}
function It(e) {
  R(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = de(e);
  } catch {
    throw new Qe("account_id is not valid base64url (§12.4.2).");
  }
  R(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function Tt(e, t) {
  R(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = de(e);
  R(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), R(We(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), R(Ce(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = x(n);
  R(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function Ot(e, t) {
  R(Number.isInteger(e) && e >= 0 && e <= Wn, `${t} is out of supported bounds (§12.4.8).`);
}
function Jn(e) {
  R(e.schema === Le, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), It(e.account_id), Ot(e.generation, "generation"), Tt(e.operational_private_key, e.operational_public_key), R(Ce(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), Nt(e.vault_relay_hints);
  const t = e.recovery_capsule_event;
  R(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), R(le(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), R(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Yn(e) {
  R(e.schema === He, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), It(e.account_id), Ot(e.recovery_generation, "recovery_generation"), R(e.previous_recovery_event_id === null || Ce(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), Tt(e.operational_private_key, e.operational_public_key), R(Ce(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), Nt(e.vault_relay_hints);
}
function Qn(e) {
  const t = new Map(e.map((r) => [r.recoveryGeneration, r])), n = [...e].sort((r, o) => r.recoveryGeneration - o.recoveryGeneration);
  for (let r = 1; r < n.length; r++) {
    const o = n[r], a = t.get(o.recoveryGeneration - 1);
    if (o.previousRecoveryEventId === null)
      return { consistent: !1, warning: `Generation ${o.recoveryGeneration} has a null previous-event link but is not the first generation.` };
    if (a && o.previousRecoveryEventId !== a.eventId)
      return {
        consistent: !1,
        warning: `Recovery generation chain is broken between generation ${a.recoveryGeneration} and ${o.recoveryGeneration}: possible replay or relay misbehavior.`
      };
  }
  return { consistent: !0 };
}
async function Xe(e) {
  const t = x(e.locatorPrivateKey), n = await St(e.payload, e.capsuleKey, At(t));
  return Z({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: he,
    tags: [["d", fe]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function Xn(e) {
  const t = x(e.oldLocatorPrivateKey);
  return Z({
    pubkey: t,
    created_at: e.createdAt,
    kind: he,
    tags: [["d", fe]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Zn(e, t) {
  if (!le(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Lt(n, t, At(e.pubkey));
  return Jn(r), r;
}
async function Mt(e) {
  const t = x(e.recoveryPrivateKey), n = await St(e.payload, e.capsuleKey, Ct(t));
  return Z({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: he,
    tags: [["d", Ne]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function Ut(e, t) {
  if (!le(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Lt(n, t, Ct(e.pubkey));
  return Yn(r), r;
}
function er(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e)
    le(n) && t.set(n.id, n);
  return [...t.values()].sort((n, r) => r.created_at - n.created_at);
}
async function Dt(e, t, n, r, o) {
  const a = await e.queryQuorum({ kinds: [he], authors: [t], "#d": [n], limit: 5 }, o), i = a.outcomes.flatMap((g) => g.events), s = er(i), c = [];
  for (const g of s)
    try {
      const w = await r(g);
      c.push({ event: g, payload: w });
    } catch (w) {
      c.push({ event: g, payload: null, error: w.message });
    }
  const l = c.find((g) => g.payload !== null) ?? null, u = a.outcomes.filter((g) => g.responded && g.events.length > 0).map((g) => g.events.slice().sort((w, v) => v.created_at - w.created_at)[0].id), d = new Set(u).size > 1;
  return {
    quorumMet: a.quorumMet,
    respondedCount: a.respondedCount,
    totalCount: a.totalCount,
    candidates: c,
    best: l,
    relayDisagreement: d
  };
}
async function Se(e, t, n, r = 8e3) {
  return Dt(e, t, fe, (o) => Zn(o, n), r);
}
async function tr(e, t, n, r = 8e3) {
  return Dt(e, t, Ne, (o) => Ut(o, n), r);
}
function nr(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : Qn(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function rr(e, t, n, r) {
  const [o, a] = await Promise.all([
    e.publishAll(t, r),
    e.publishAll(n, r)
  ]);
  return {
    credentialAcknowledgedCount: ne(o),
    recoveryAcknowledgedCount: ne(a),
    relaysTried: e.relayUrls.length
  };
}
const qt = `abandon
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
function or(e, t, n, r) {
  vn(e);
  const o = fn({ dkLen: 32, asyncTick: 10 }, r), { c: a, dkLen: i, asyncTick: s } = o;
  if (Oe(a), Oe(i), Oe(s), a < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = at(t), l = at(n), u = new Uint8Array(i), d = ft.create(e, c), g = d._cloneInto().update(l);
  return { c: a, dkLen: i, asyncTick: s, DK: u, PRF: d, PRFSalt: g };
}
function ar(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), gn(o), n;
}
async function ir(e, t, n, r) {
  const { c: o, dkLen: a, asyncTick: i, DK: s, PRF: c, PRFSalt: l } = or(e, t, n, r);
  let u;
  const d = new Uint8Array(4), g = pn(d), w = new Uint8Array(c.outputLen);
  for (let v = 1, f = 0; f < a; v++, f += c.outputLen) {
    const h = s.subarray(f, f + c.outputLen);
    g.setInt32(0, v, !1), (u = l._cloneInto(u)).update(d).digestInto(w), h.set(w.subarray(0, h.length)), await hn(o - 1, i, () => {
      c._cloneInto(u).update(w).digestInto(w);
      for (let p = 0; p < h.length; p++)
        h[p] ^= w[p];
    });
  }
  return ar(c, l, s, u, w);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const sr = (e) => e[0] === "あいこくしん";
function jt(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function zt(e) {
  const t = jt(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function $t(e) {
  bn(e, 16, 20, 24, 28, 32);
}
const cr = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([gt(e)[0] >> t << t]);
};
function Bt(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), Ke.chain(Ke.checksum(1, cr), Ke.radix2(11, !0), Ke.alphabet(e));
}
function lr(e, t) {
  const { words: n } = zt(e), r = Bt(t).decode(n);
  return $t(r), r;
}
function ur(e, t) {
  return $t(e), Bt(t).encode(e).join(sr(t) ? "　" : " ");
}
function dr(e, t) {
  try {
    lr(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const yr = (e) => jt("mnemonic" + e);
function pr(e, t = "") {
  return ir(wn, zt(e).nfkd, yr(t), { c: 2048, dkLen: 64 });
}
function hr(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return ur(e, qt);
}
function vr(e) {
  try {
    return dr(Gt(e), qt);
  } catch {
    return !1;
  }
}
function Gt(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function Vt(e) {
  return pr(Gt(e), "");
}
const Ze = mn.id, Ee = "aes-256-gcm-v1", Pe = "bitlogin-bip39-hkdf-v1";
async function Ht(e) {
  const t = Ie(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await me(e.password, t), a = x(r), i = new I(e.vaultRelayUrls, { authPrivateKey: r });
  let s;
  try {
    s = await Se(i, a, o, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!s.quorumMet)
    throw new ie("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
  if (s.candidates.length > 0)
    throw new kt();
  const c = hr(En()), l = await Vt(c), { recoveryPrivateKey: u, capsuleKey: d } = wt(l), g = x(u), w = e.everydayPrivateKey !== void 0;
  if (w && !We(e.everydayPrivateKey))
    throw new ie("The provided key is not a valid secp256k1 private key.");
  const v = w ? e.everydayPrivateKey : Pn(), f = x(v), h = ae(_n()), p = {
    schema: He,
    account_id: h,
    recovery_generation: 0,
    previous_recovery_event_id: null,
    operational_private_key: ae(v),
    operational_public_key: f,
    recovery_public_key: g,
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: Ee, recovery_derivation: Pe }
  }, b = await Mt({
    recoveryPrivateKey: u,
    capsuleKey: d,
    payload: p
  }), m = {
    schema: Le,
    account_id: h,
    generation: 0,
    operational_private_key: ae(v),
    operational_public_key: f,
    recovery_public_key: g,
    recovery_capsule_event: b,
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Ze,
      capsule_encryption: Ee,
      recovery_derivation: Pe
    }
  }, P = await Xe({
    locatorPrivateKey: r,
    capsuleKey: o,
    payload: m
  }), T = new I(e.vaultRelayUrls, { authPrivateKey: u }), E = await ke(T, b, {
    dTag: Ne,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  T.closeAll();
  const _ = new I(e.vaultRelayUrls, { authPrivateKey: r }), K = await ke(_, P, {
    dTag: fe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (_.closeAll(), !E.success || !K.success)
    throw new ie("Registration did not reach the required relay acknowledgement and readback quorum. Please retry, or add more vault relays.");
  return {
    normalizedLoginName: t,
    recoveryPhrase: c,
    everydayPrivateKey: v,
    everydayPublicKey: f,
    recoveryPublicKey: g,
    locatorPublicKey: a,
    accountId: h,
    imported: w,
    credentialEvent: P,
    recoveryEvent: b,
    credentialPublish: K,
    recoveryPublish: E
  };
}
async function fr(e) {
  const { nsecOrHex: t, ...n } = e, r = Wt(t);
  return Ht({ ...n, everydayPrivateKey: r });
}
function Wt(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = kn(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = Fe(t.toLowerCase());
  else
    throw new ie("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!We(n))
    throw new ie("The provided key is not a valid secp256k1 private key.");
  return n;
}
class Ft {
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
async function gr(e) {
  const t = Ie(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await me(e.password, t), o = x(n), a = new I(e.vaultRelayUrls, { authPrivateKey: n });
  try {
    const i = await Se(a, o, r, e.timeoutMs);
    if (!i.quorumMet)
      throw new pe("quorum-not-met");
    if (!i.best)
      throw new pe(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const s = i.best.payload, c = e.store ?? new Ft(), l = await Je(c, s.operational_public_key), u = s.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new Pt(l.generation, s.generation);
    const d = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${s.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await xt(c, s.operational_public_key, { generation: s.generation });
    const g = i.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: de(s.operational_private_key),
      everydayPublicKey: s.operational_public_key,
      recoveryPublicKey: s.recovery_public_key,
      accountId: s.account_id,
      generation: s.generation,
      credentialEvent: i.best.event,
      recoveryCapsuleEvent: s.recovery_capsule_event,
      rollbackWarning: d,
      relayDisagreementWarning: g
    };
  } finally {
    a.closeAll();
  }
}
function st(e) {
  return e.filter((t) => le(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function wr(e) {
  if (!vr(e.phrase))
    throw new Et("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Vt(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = wt(t), o = x(n), a = new I(e.vaultRelayUrls, { authPrivateKey: n });
  let i;
  try {
    i = await tr(a, o, r, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (le(m))
        try {
          f.push({ event: m, payload: await Ut(m, r) });
        } catch (P) {
          f.push({ event: m, payload: null, error: P.message });
        }
    const h = /* @__PURE__ */ new Map();
    for (const m of [...i.candidates, ...f])
      h.set(m.event.id, m);
    const p = [...h.values()].sort((m, P) => P.event.created_at - m.event.created_at), b = p.find((m) => m.payload !== null) ?? null;
    i = { ...i, candidates: p, best: b, quorumMet: i.quorumMet || b !== null };
  }
  if (!i.quorumMet)
    throw new pe("quorum-not-met");
  if (!i.best)
    throw new pe(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = i.best.payload, c = nr(i.candidates), l = de(s.operational_private_key), u = s.operational_public_key, d = [.../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...s.vault_relay_hints])], g = new I(d);
  let w = [], v = [];
  try {
    const f = await g.queryQuorum({ kinds: [Be], authors: [u], limit: 5 }, e.timeoutMs), h = st(f.outcomes.flatMap((m) => m.events));
    h && (w = Un(h));
    const p = await g.queryQuorum({ kinds: [Ge], authors: [u], limit: 5 }, e.timeoutMs), b = st(p.outcomes.flatMap((m) => m.events));
    b && (v = Dn(b));
  } finally {
    g.closeAll();
  }
  return {
    everydayPrivateKey: l,
    everydayPublicKey: u,
    recoveryPrivateKey: n,
    recoveryPublicKey: o,
    recoveryCapsuleKey: r,
    accountId: s.account_id,
    currentRecoveryEvent: i.best.event,
    currentRecoveryPayload: s,
    generalRelays: w,
    dmRelays: v,
    chainWarning: c.consistent ? void 0 : c.warning
  };
}
async function br(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ie(e.newLoginName), { recovered: r } = e, o = {
    schema: He,
    account_id: r.accountId,
    recovery_generation: r.currentRecoveryPayload.recovery_generation + 1,
    previous_recovery_event_id: r.currentRecoveryEvent.id,
    operational_private_key: ae(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    created_at: _t(r.currentRecoveryEvent.created_at, t),
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: Ee, recovery_derivation: Pe }
  }, a = await Mt({
    recoveryPrivateKey: r.recoveryPrivateKey,
    capsuleKey: r.recoveryCapsuleKey,
    payload: o
  }), i = new I(e.vaultRelayUrls, { authPrivateKey: r.recoveryPrivateKey }), s = await ke(i, a, {
    dTag: Ne,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  i.closeAll();
  const { locatorPrivateKey: c, capsuleKey: l } = await me(e.newPassword, n), u = x(c), d = {
    schema: Le,
    account_id: r.accountId,
    generation: 0,
    operational_private_key: ae(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    recovery_capsule_event: a,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Ze,
      capsule_encryption: Ee,
      recovery_derivation: Pe
    }
  }, g = await Xe({ locatorPrivateKey: c, capsuleKey: l, payload: d }), w = new I(e.vaultRelayUrls, { authPrivateKey: c }), v = await ke(w, g, {
    dTag: fe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (w.closeAll(), !s.success || !v.success)
    throw new Et("Could not publish the refreshed recovery and credential capsules to enough relays. Please retry.");
  return { normalizedLoginName: n, locatorPublicKey: u, credentialEvent: g, refreshedRecoveryEvent: a, credentialPublish: v, recoveryPublish: s };
}
function mr(e) {
  const t = x(e.privateKey);
  return Z({
    pubkey: t,
    created_at: e.createdAt,
    kind: Kn,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function kr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ie(e.loginName), r = await me(e.oldPassword, n), o = x(r.locatorPrivateKey), a = new I(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey });
  let i;
  try {
    i = await Se(a, o, r.capsuleKey, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (!i.quorumMet)
    throw new pe("quorum-not-met");
  if (!i.best)
    throw new pe(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = i.best.payload, c = i.best.event, l = e.store ?? new Ft(), u = await Je(l, s.operational_public_key);
  if (s.generation < u.generation && !e.acknowledgeRollback)
    throw new Pt(u.generation, s.generation);
  const d = await me(e.newPassword, n), g = x(d.locatorPrivateKey), w = new I(e.vaultRelayUrls, { authPrivateKey: d.locatorPrivateKey });
  let v;
  try {
    v = await Se(w, g, d.capsuleKey, e.timeoutMs);
  } finally {
    w.closeAll();
  }
  if (!v.quorumMet)
    throw new ie("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (v.candidates.length > 0)
    throw new kt("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = s.generation + 1, h = {
    schema: Le,
    account_id: s.account_id,
    generation: f,
    operational_private_key: s.operational_private_key,
    operational_public_key: s.operational_public_key,
    recovery_public_key: s.recovery_public_key,
    recovery_capsule_event: s.recovery_capsule_event,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Ze,
      capsule_encryption: Ee,
      recovery_derivation: Pe
    }
  }, p = await Xe({
    locatorPrivateKey: d.locatorPrivateKey,
    capsuleKey: d.capsuleKey,
    payload: h
  }), b = new I(e.vaultRelayUrls, { authPrivateKey: d.locatorPrivateKey }), m = await ke(b, p, {
    dTag: fe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  b.closeAll();
  const P = Xn({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: _t(c.created_at, t)
  }), T = mr({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: c.id,
    deletedEventKind: he,
    createdAt: t
  }), E = new I(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey }), [_, K] = await Promise.all([
    E.publishAll(P, e.timeoutMs),
    E.publishAll(T, e.timeoutMs)
  ]);
  if (E.closeAll(), !m.success)
    throw new ie("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Please retry.");
  return await xt(l, s.operational_public_key, { generation: f }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: g,
    newGeneration: f,
    recoveryPublicKey: s.recovery_public_key,
    recoveryCapsuleEvent: s.recovery_capsule_event,
    newCredentialEvent: p,
    tombstoneEvent: P,
    deletionRequestEvent: T,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: ne(_),
    deletionAcknowledgedCount: ne(K)
  };
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function Er(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function ct(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Me(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function L(e, t, n = "") {
  const r = Er(e), o = e?.length, a = t !== void 0;
  if (!r || a && o !== t) {
    const i = n && `"${n}" `, s = a ? ` of length ${t}` : "", c = r ? `length=${o}` : `type=${typeof e}`, l = i + "expected Uint8Array" + s + ", got " + c;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function A(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function ce(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const W = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, Pr = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, _r = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = Pr(e[t]);
  return e;
}, N = W ? (e) => e : _r;
function Kr(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Jt(e, t) {
  if (Kr(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function xr(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const Rr = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (L(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      L(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const a = e.tagLength;
    a && o[1] !== void 0 && L(o[1], void 0, "AAD");
    const i = t(r, ...o), s = (u, d) => {
      if (d !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        L(d, void 0, "output");
      }
    };
    let c = !1;
    return {
      encrypt(u, d) {
        if (c)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return c = !0, L(u), s(i.encrypt.length, d), i.encrypt(u, d);
      },
      decrypt(u, d) {
        if (L(u), a && u.length < a)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + a);
        return s(i.decrypt.length, d), i.decrypt(u, d);
      }
    };
  }
  return Object.assign(n, e), n;
};
function et(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (L(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !X(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function X(e) {
  return e.byteOffset % 4 === 0;
}
function se(e) {
  return Uint8Array.from(L(e));
}
const Yt = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), Ar = N(A(Yt("expand 16-byte k"))), Cr = N(A(Yt("expand 32-byte k")));
function k(e, t) {
  return e << t | e >>> 32 - t;
}
const ge = 64, Sr = 16, qe = 2 ** 32 - 1, lt = /* @__PURE__ */ Uint32Array.of();
function Lr(e, t, n, r, o, a, i, s) {
  const c = o.length, l = new Uint8Array(ge), u = A(l), d = W && X(o) && X(a), g = d ? A(o) : lt, w = d ? A(a) : lt;
  if (!W) {
    for (let v = 0; v < c; i++) {
      if (e(t, n, r, u, i, s), N(u), i >= qe)
        throw new Error("arx: counter overflow");
      const f = Math.min(ge, c - v);
      for (let h = 0, p; h < f; h++)
        p = v + h, a[p] = o[p] ^ l[h];
      v += f;
    }
    return;
  }
  for (let v = 0; v < c; i++) {
    if (e(t, n, r, u, i, s), i >= qe)
      throw new Error("arx: counter overflow");
    const f = Math.min(ge, c - v);
    if (d && f === ge) {
      const h = v / 4;
      if (v % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let p = 0, b; p < Sr; p++)
        b = h + p, w[b] = g[b] ^ u[p];
      v += ge;
      continue;
    }
    for (let h = 0, p; h < f; h++)
      p = v + h, a[p] = o[p] ^ l[h];
    v += f;
  }
}
function Nr(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: a, rounds: i } = xr({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Me(o), Me(i), ct(a), ct(n), (s, c, l, u, d = 0) => {
    L(s, void 0, "key"), L(c, void 0, "nonce"), L(l, void 0, "data");
    const g = l.length;
    if (u = et(g, u, !1), Me(d), d < 0 || d >= qe)
      throw new Error("arx: counter overflow");
    const w = [];
    let v = s.length, f, h;
    if (v === 32)
      w.push(f = se(s)), h = Cr;
    else if (v === 16 && n)
      f = new Uint8Array(32), f.set(s), f.set(s, 16), h = Ar, w.push(f);
    else
      throw L(s, 32, "arx key"), new Error("invalid key size");
    (!W || !X(c)) && w.push(c = se(c));
    let p = A(f);
    if (r) {
      if (c.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const P = c.subarray(0, 16);
      if (W)
        r(h, p, A(P), p);
      else {
        const T = N(Uint32Array.from(h));
        r(T, p, A(P), p), ce(T), N(p);
      }
      c = c.subarray(16);
    } else W || N(p);
    const b = 16 - o;
    if (b !== c.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const P = new Uint8Array(12);
      P.set(c, a ? 0 : 12 - c.length), c = P, w.push(c);
    }
    const m = N(A(c));
    try {
      return Lr(e, h, p, m, l, u, d, i), u;
    } finally {
      ce(...w);
    }
  };
}
function Ir(e, t, n, r, o, a = 20) {
  let i = e[0], s = e[1], c = e[2], l = e[3], u = t[0], d = t[1], g = t[2], w = t[3], v = t[4], f = t[5], h = t[6], p = t[7], b = o, m = n[0], P = n[1], T = n[2], E = i, _ = s, K = c, S = l, O = u, M = d, U = g, D = w, q = v, j = f, z = h, $ = p, B = b, G = m, V = P, H = T;
  for (let ot = 0; ot < a; ot += 2)
    E = E + O | 0, B = k(B ^ E, 16), q = q + B | 0, O = k(O ^ q, 12), E = E + O | 0, B = k(B ^ E, 8), q = q + B | 0, O = k(O ^ q, 7), _ = _ + M | 0, G = k(G ^ _, 16), j = j + G | 0, M = k(M ^ j, 12), _ = _ + M | 0, G = k(G ^ _, 8), j = j + G | 0, M = k(M ^ j, 7), K = K + U | 0, V = k(V ^ K, 16), z = z + V | 0, U = k(U ^ z, 12), K = K + U | 0, V = k(V ^ K, 8), z = z + V | 0, U = k(U ^ z, 7), S = S + D | 0, H = k(H ^ S, 16), $ = $ + H | 0, D = k(D ^ $, 12), S = S + D | 0, H = k(H ^ S, 8), $ = $ + H | 0, D = k(D ^ $, 7), E = E + M | 0, H = k(H ^ E, 16), z = z + H | 0, M = k(M ^ z, 12), E = E + M | 0, H = k(H ^ E, 8), z = z + H | 0, M = k(M ^ z, 7), _ = _ + U | 0, B = k(B ^ _, 16), $ = $ + B | 0, U = k(U ^ $, 12), _ = _ + U | 0, B = k(B ^ _, 8), $ = $ + B | 0, U = k(U ^ $, 7), K = K + D | 0, G = k(G ^ K, 16), q = q + G | 0, D = k(D ^ q, 12), K = K + D | 0, G = k(G ^ K, 8), q = q + G | 0, D = k(D ^ q, 7), S = S + O | 0, V = k(V ^ S, 16), j = j + V | 0, O = k(O ^ j, 12), S = S + O | 0, V = k(V ^ S, 8), j = j + V | 0, O = k(O ^ j, 7);
  let C = 0;
  r[C++] = i + E | 0, r[C++] = s + _ | 0, r[C++] = c + K | 0, r[C++] = l + S | 0, r[C++] = u + O | 0, r[C++] = d + M | 0, r[C++] = g + U | 0, r[C++] = w + D | 0, r[C++] = v + q | 0, r[C++] = f + j | 0, r[C++] = h + z | 0, r[C++] = p + $ | 0, r[C++] = b + B | 0, r[C++] = m + G | 0, r[C++] = P + V | 0, r[C++] = T + H | 0;
}
const Qt = /* @__PURE__ */ Nr(Ir, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Xt = 2, je = 1, Zt = 65536, ze = 4294967295;
function ut(e, t) {
  const n = Te(new Uint8Array([2]), Fe(t)), o = mt.getSharedSecret(e, n, !0).slice(1, 33);
  return xn(ve("nip44-v2"), o);
}
function en(e, t) {
  const n = An(e, t, 76);
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
function Tr(e) {
  if (e < Zt) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function Or(e) {
  const t = e.length;
  if (t < je || t > ze)
    throw new Error(`NIP-44 plaintext length must be between ${je} and ${ze} bytes.`);
  const n = Tr(t), r = tn(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function Mr(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < Zt)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < je || r > ze || e.length !== o + tn(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function nn(e, t, n) {
  return ft(gt, e, Te(t, n));
}
function Ur(e, t, n) {
  const r = bt(32), { chachaKey: o, chachaNonce: a, hmacKey: i } = en(e, r), s = Or(ve(t)), c = Qt(o, a, s), l = nn(i, r, c);
  return ye.encode(Te(new Uint8Array([Xt]), r, c, l));
}
function Dr(e, t) {
  const n = ye.decode(t);
  if (n[0] !== Xt)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33), o = n.slice(n.length - 32), a = n.slice(33, n.length - 32), { chachaKey: i, chachaNonce: s, hmacKey: c } = en(e, r), l = nn(c, r, a);
  if (!Rn(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = Qt(i, s, a);
  return Ve(Mr(u));
}
const re = 16, qr = 283;
function jr(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function tt(e) {
  return e << 1 ^ qr & -(e >> 7);
}
function ue(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = tt(e);
  return n;
}
const $e = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= tt(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return ce(e), t;
})(), zr = /* @__PURE__ */ $e.map((e, t) => $e.indexOf(t)), $r = (e) => e << 24 | e >>> 8, Ue = (e) => e << 8 | e >>> 24;
function rn(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(Ue), o = r.map(Ue), a = o.map(Ue), i = new Uint32Array(256 * 256), s = new Uint32Array(256 * 256), c = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const d = l * 256 + u;
      i[d] = n[l] ^ r[u], s[d] = o[l] ^ a[u], c[d] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: c, T0: n, T1: r, T2: o, T3: a, T01: i, T23: s };
}
const nt = /* @__PURE__ */ rn($e, (e) => ue(e, 3) << 24 | e << 16 | e << 8 | ue(e, 2)), on = /* @__PURE__ */ rn(zr, (e) => ue(e, 11) << 24 | ue(e, 13) << 16 | ue(e, 9) << 8 | ue(e, 14)), Br = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = tt(n))
    e[t] = n;
  return e;
})();
function an(e) {
  L(e);
  const t = e.length;
  jr(e);
  const { sbox2: n } = nt, r = [];
  (!W || !X(e)) && r.push(e = se(e));
  const o = N(A(e)), a = o.length, i = (c) => J(n, c, c, c, c), s = new Uint32Array(t + 28);
  s.set(o);
  for (let c = a; c < s.length; c++) {
    let l = s[c - 1];
    c % a === 0 ? l = i($r(l)) ^ Br[c / a - 1] : a > 6 && c % a === 4 && (l = i(l)), s[c] = s[c - a] ^ l;
  }
  return ce(...r), s;
}
function Gr(e) {
  const t = an(e), n = t.slice(), r = t.length, { sbox2: o } = nt, { T0: a, T1: i, T2: s, T3: c } = on;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  ce(t);
  for (let l = 4; l < r - 4; l++) {
    const u = n[l], d = J(o, u, u, u, u);
    n[l] = a[d & 255] ^ i[d >>> 8 & 255] ^ s[d >>> 16 & 255] ^ c[d >>> 24];
  }
  return n;
}
function te(e, t, n, r, o, a) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | a >>> 24 & 255];
}
function J(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function dt(e, t, n, r, o) {
  const { sbox2: a, T01: i, T23: s } = nt;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let v = 0; v < l; v++) {
    const f = e[c++] ^ te(i, s, t, n, r, o), h = e[c++] ^ te(i, s, n, r, o, t), p = e[c++] ^ te(i, s, r, o, t, n), b = e[c++] ^ te(i, s, o, t, n, r);
    t = f, n = h, r = p, o = b;
  }
  const u = e[c++] ^ J(a, t, n, r, o), d = e[c++] ^ J(a, n, r, o, t), g = e[c++] ^ J(a, r, o, t, n), w = e[c++] ^ J(a, o, t, n, r);
  return { s0: u, s1: d, s2: g, s3: w };
}
function Vr(e, t, n, r, o) {
  const { sbox2: a, T01: i, T23: s } = on;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const l = e.length / 4 - 2;
  for (let v = 0; v < l; v++) {
    const f = e[c++] ^ te(i, s, t, o, r, n), h = e[c++] ^ te(i, s, n, t, o, r), p = e[c++] ^ te(i, s, r, n, t, o), b = e[c++] ^ te(i, s, o, r, n, t);
    t = f, n = h, r = p, o = b;
  }
  const u = e[c++] ^ J(a, t, o, r, n), d = e[c++] ^ J(a, n, t, o, r), g = e[c++] ^ J(a, r, n, t, o), w = e[c++] ^ J(a, o, r, n, t);
  return { s0: u, s1: d, s2: g, s3: w };
}
function Hr(e) {
  if (L(e), e.length % re !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + re);
}
function Wr(e, t, n) {
  L(e);
  let r = e.length;
  const o = r % re;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let s = re - o;
    s || (s = re), r = r + s;
  }
  n = et(r, n), Jt(e, n), (!W || !X(e)) && (e = se(e));
  const a = A(e);
  N(a);
  const i = A(n);
  return { b: a, o: i, out: n };
}
function Fr(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (n === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const r = e[n - 1];
  let o = 1;
  o &= r - 1 >>> 31 ^ 1, o &= 16 - r >>> 31 ^ 1;
  for (let a = 0; a < 16; a++) {
    const i = a - r >>> 31, s = (e[n - 1 - a] ^ r) === 0 ? 1 : 0;
    o &= s | i ^ 1;
  }
  if (!o)
    throw new Error("aes/pkcs7: wrong padding");
  return e.subarray(0, n - r);
}
function Jr(e) {
  const t = new Uint8Array(16), n = A(t);
  t.set(e);
  const r = re - e.length;
  for (let o = re - r; o < re; o++)
    t[o] = r;
  return n;
}
const sn = /* @__PURE__ */ Rr({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(a, i) {
      const s = an(t), { b: c, o: l, out: u } = Wr(a, o, i);
      let d = n;
      const g = [s];
      (!W || !X(d)) && g.push(d = se(d));
      const w = A(d);
      N(w);
      let v = w[0], f = w[1], h = w[2], p = w[3], b = 0;
      for (; b + 4 <= c.length; )
        v ^= c[b + 0], f ^= c[b + 1], h ^= c[b + 2], p ^= c[b + 3], { s0: v, s1: f, s2: h, s3: p } = dt(s, v, f, h, p), l[b++] = v, l[b++] = f, l[b++] = h, l[b++] = p;
      if (o) {
        const m = Jr(a.subarray(b * 4));
        N(m), v ^= m[0], f ^= m[1], h ^= m[2], p ^= m[3], { s0: v, s1: f, s2: h, s3: p } = dt(s, v, f, h, p), l[b++] = v, l[b++] = f, l[b++] = h, l[b++] = p;
      }
      return N(l), ce(...g), u;
    },
    decrypt(a, i) {
      Hr(a);
      const s = Gr(t);
      let c = n;
      const l = [s];
      (!W || !X(c)) && l.push(c = se(c));
      const u = A(c);
      N(u), i = et(a.length, i), Jt(a, i), (!W || !X(a)) && l.push(a = se(a));
      const d = A(a), g = A(i);
      N(d);
      let w = u[0], v = u[1], f = u[2], h = u[3];
      for (let p = 0; p + 4 <= d.length; ) {
        const b = w, m = v, P = f, T = h;
        w = d[p + 0], v = d[p + 1], f = d[p + 2], h = d[p + 3];
        const { s0: E, s1: _, s2: K, s3: S } = Vr(s, w, v, f, h);
        g[p++] = E ^ b, g[p++] = _ ^ m, g[p++] = K ^ P, g[p++] = S ^ T;
      }
      return N(g), ce(...l), Fr(i, o);
    }
  };
});
function cn(e, t) {
  const n = Te(new Uint8Array([2]), Fe(t));
  return mt.getSharedSecret(e, n, !0).slice(1, 33);
}
function Yr(e, t, n, r) {
  const o = cn(e, t), a = bt(16), i = sn(o, a).encrypt(ve(n));
  return `${ye.encode(i)}?iv=${ye.encode(a)}`;
}
function Qr(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = ye.decode(n.slice(0, r)), a = ye.decode(n.slice(r + 4)), i = cn(e, t), s = sn(i, a).decrypt(o);
  return Ve(s);
}
function Xr(...e) {
  for (const t of e)
    t && t.fill(0);
}
class xe {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = x(t);
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
    return this.assertAlive(), Ur(ut(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), Dr(ut(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Yr(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), Qr(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    Xr(this.privateKey), this.destroyed = !0;
  }
}
const Zr = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social"
], eo = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net"
], to = "bitlogin", ee = "kv", F = "device-keys", no = 2;
function ro() {
  return new Promise((e, t) => {
    const n = indexedDB.open(to, no);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(ee) || r.createObjectStore(ee), r.objectStoreNames.contains(F) || r.createObjectStore(F);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class oo {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = ro()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(ee, "readonly").objectStore(ee).get(t);
      i.onsuccess = () => r(i.result), i.onerror = () => o(i.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, a) => {
      const i = r.transaction(ee, "readwrite");
      i.objectStore(ee).put(n, t), i.oncomplete = () => o(), i.onerror = () => a(i.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(ee, "readwrite");
      a.objectStore(ee).delete(t), a.oncomplete = () => r(), a.onerror = () => o(a.error);
    });
  }
  /**
   * Returns a non-extractable AES-GCM key kept by the browser's IndexedDB
   * implementation. The key is deliberately separate from the string-only KV
   * API so callers cannot accidentally serialize it as application data.
   */
  async getOrCreateDeviceKey(t) {
    const n = await this.db(), r = await new Promise((a, i) => {
      const s = n.transaction(F, "readonly").objectStore(F).get(t);
      s.onsuccess = () => a(s.result), s.onerror = () => i(s.error);
    });
    if (r) return r;
    const o = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      !1,
      ["encrypt", "decrypt"]
    );
    try {
      return await new Promise((a, i) => {
        const s = n.transaction(F, "readwrite");
        s.objectStore(F).add(o, t), s.oncomplete = () => a(), s.onerror = () => i(s.error);
      }), o;
    } catch {
      const a = await new Promise((i, s) => {
        const c = n.transaction(F, "readonly").objectStore(F).get(t);
        c.onsuccess = () => i(c.result), c.onerror = () => s(c.error);
      });
      if (a) return a;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(F, "readwrite");
      a.objectStore(F).delete(t), a.oncomplete = () => r(), a.onerror = () => o(a.error);
    });
  }
}
const _e = "bitlogin:session:v1", rt = "bitlogin:session-device-key:v1";
function yt(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function pt(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function ht(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function ao(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function io(e, t) {
  const n = {
    everydayPrivateKeyHex: Array.from(t.everydayPrivateKey, (r) => r.toString(16).padStart(2, "0")).join(""),
    accountId: t.accountId,
    recoveryPublicKey: t.recoveryPublicKey,
    activeCredentialEvent: t.activeCredentialEvent,
    activeRecoveryEvent: t.activeRecoveryEvent
  };
  try {
    if (typeof e.getOrCreateDeviceKey != "function") {
      await e.delete(_e);
      return;
    }
    const r = await e.getOrCreateDeviceKey(rt), o = crypto.getRandomValues(new Uint8Array(12)), a = new TextEncoder().encode(JSON.stringify(n)), i = await crypto.subtle.encrypt({ name: "AES-GCM", iv: o }, r, a), s = {
      v: 2,
      iv: yt(o),
      ciphertext: yt(new Uint8Array(i))
    };
    await e.set(_e, JSON.stringify(s));
  } catch {
  }
}
async function so(e) {
  let t;
  try {
    t = await e.get(_e);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    if (!ao(n) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(_e), null;
    const r = await e.getOrCreateDeviceKey(rt), o = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ht(pt(n.iv)) },
      r,
      ht(pt(n.ciphertext))
    ), a = JSON.parse(new TextDecoder().decode(o));
    return typeof a.everydayPrivateKeyHex != "string" || typeof a.accountId != "string" || typeof a.recoveryPublicKey != "string" || !a.activeCredentialEvent || !a.activeRecoveryEvent ? null : {
      everydayPrivateKey: Uint8Array.from(
        a.everydayPrivateKeyHex.match(/.{1,2}/g) || [],
        (i) => Number.parseInt(i, 16)
      ),
      accountId: a.accountId,
      recoveryPublicKey: a.recoveryPublicKey,
      activeCredentialEvent: a.activeCredentialEvent,
      activeRecoveryEvent: a.activeRecoveryEvent
    };
  } catch {
    return null;
  }
}
async function co(e) {
  try {
    await e.delete(_e), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(rt);
  } catch {
  }
}
const y = {
  signer: null,
  everydayPrivateKey: null,
  accountId: null,
  recoveryPublicKey: null,
  activeCredentialEvent: null,
  activeRecoveryEvent: null,
  pendingRecovery: null
};
let Y = [...Zr], De = [...eo];
const be = new oo();
function Q() {
  if (!y.signer || !y.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: y.signer, everydayPrivateKey: y.everydayPrivateKey };
}
function we() {
  y.signer?.destroy(), y.everydayPrivateKey && y.everydayPrivateKey.fill(0), y.signer = null, y.everydayPrivateKey = null, y.accountId = null, y.recoveryPublicKey = null, y.activeCredentialEvent = null, y.activeRecoveryEvent = null, y.pendingRecovery && (y.pendingRecovery.recoveryPrivateKey.fill(0), y.pendingRecovery.everydayPrivateKey.fill(0), y.pendingRecovery = null);
}
async function Re() {
  !y.everydayPrivateKey || !y.accountId || !y.recoveryPublicKey || !y.activeCredentialEvent || !y.activeRecoveryEvent || await io(be, {
    everydayPrivateKey: y.everydayPrivateKey,
    accountId: y.accountId,
    recoveryPublicKey: y.recoveryPublicKey,
    activeCredentialEvent: y.activeCredentialEvent,
    activeRecoveryEvent: y.activeRecoveryEvent
  });
}
async function lo(e, t) {
  switch (e) {
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (Y = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (De = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await fr({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: Y }) : await Ht({ loginName: n.loginName, password: n.password, vaultRelayUrls: Y });
      return we(), y.signer = new xe(r.everydayPrivateKey), y.everydayPrivateKey = r.everydayPrivateKey, y.accountId = r.accountId, y.recoveryPublicKey = r.recoveryPublicKey, y.activeCredentialEvent = r.credentialEvent, y.activeRecoveryEvent = r.recoveryEvent, await Re(), {
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
      const r = Wt(t.nsecOrHex), o = x(r), a = { everydayPublicKey: o, npub: it(o) };
      return r.fill(0), a;
    }
    case "login": {
      const n = t, r = await gr({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: Y,
        store: be,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return we(), y.signer = new xe(r.everydayPrivateKey), y.everydayPrivateKey = r.everydayPrivateKey, y.accountId = r.accountId, y.recoveryPublicKey = r.recoveryPublicKey, y.activeCredentialEvent = r.credentialEvent, y.activeRecoveryEvent = r.recoveryCapsuleEvent, await Re(), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await wr({
        phrase: n.phrase,
        vaultRelayUrls: Y,
        discoveryRelayUrls: De,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return we(), y.pendingRecovery = r, y.signer = new xe(r.everydayPrivateKey), y.everydayPrivateKey = r.everydayPrivateKey, y.accountId = r.accountId, y.recoveryPublicKey = r.recoveryPublicKey, y.activeRecoveryEvent = r.currentRecoveryEvent, {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generalRelays: r.generalRelays,
        dmRelays: r.dmRelays,
        chainWarning: r.chainWarning
      };
    }
    case "completeRecovery": {
      const n = t;
      if (!y.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await br({
        recovered: y.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: Y
      });
      return y.activeCredentialEvent = r.credentialEvent, y.activeRecoveryEvent = r.refreshedRecoveryEvent, y.pendingRecovery.recoveryPrivateKey.fill(0), y.pendingRecovery = null, await Re(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await kr({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: Y,
        store: be,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return y.activeCredentialEvent = r.newCredentialEvent, y.recoveryPublicKey = r.recoveryPublicKey, y.activeRecoveryEvent = r.recoveryCapsuleEvent, await Re(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = Q();
      return qn({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: De
      });
    }
    case "getPublicKey": {
      const { signer: n } = Q();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = Q(), r = t;
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = Q(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = Q(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = Q(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = Q(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = Q();
      return { nsec: Sn(n), npub: it(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (Q(), !y.recoveryPublicKey || !y.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return Cn({
        recoveryPublicKeyHex: y.recoveryPublicKey,
        vaultRelayUrls: Y,
        recoveryCapsuleEvents: [y.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!y.activeCredentialEvent || !y.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const n = new I(Y), r = await rr(n, y.activeCredentialEvent, y.activeRecoveryEvent);
      return n.closeAll(), r;
    }
    case "getSessionStatus":
      return { unlocked: !!y.signer, everydayPublicKey: y.signer?.getPublicKey() };
    // Called once, right after "configure", before the widget renders its welcome
    // screen -- restores whatever persistSession() last cached for this origin, so
    // a page reload doesn't ask for the login name + password again. A missing or
    // corrupt cache is not an error: it just means the widget falls through to its
    // normal welcome screen, exactly like it always has.
    case "restoreSession": {
      const n = await so(be);
      return n ? (we(), y.signer = new xe(n.everydayPrivateKey), y.everydayPrivateKey = n.everydayPrivateKey, y.accountId = n.accountId, y.recoveryPublicKey = n.recoveryPublicKey, y.activeCredentialEvent = n.activeCredentialEvent, y.activeRecoveryEvent = n.activeRecoveryEvent, { restored: !0, everydayPublicKey: y.signer.getPublicKey(), accountId: n.accountId }) : { restored: !1 };
    }
    case "logout":
      return we(), await co(be), {};
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
self.addEventListener("message", (e) => {
  const { id: t, action: n, payload: r } = e.data;
  lo(n, r).then(
    (o) => {
      const a = { id: t, ok: !0, result: o };
      self.postMessage(a);
    },
    (o) => {
      const a = o instanceof Error ? o : new Error(String(o)), i = { id: t, ok: !1, error: a.message, errorName: a.name };
      self.postMessage(i);
    }
  );
});
