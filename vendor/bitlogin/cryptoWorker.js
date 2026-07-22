import { v as ee, g as E, s as W, c as Ot, K as Dt, b as Je, d as Ce, f as Le, h as ae, u as ye, j as qt, k as zt, l as X, m as ne, n as Ye, S as Ne, o as Te, q as we, D as ie, t as be, w as jt, x as $t, y as Gt, z as Vt, A as _e, B as ze, C as Qe, F as Bt, G as Wt, H as Ht, I as he, J as Xe, L as Ft, M as Jt, N as Ze, O as ke, P as ce, Q as Yt, T as et, U as Qt, V as Xt, W as Zt, X as er, Y as tt, Z as Ie, _ as tr, $ as rr, a0 as nr, a1 as or, a2 as ar, a as je, a3 as ir } from "./bitlogin-shared-QIBe5Omw.js";
class oe extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class Z extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class rt extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class nt extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class ot extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, r) {
    super(`This credential capsule reports generation ${r}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = r;
  }
}
function at(e, t) {
  const r = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? r : Math.max(r, e + 1);
}
const sr = { generation: -1, recoveryGeneration: -1 };
function it(e) {
  return `bitlogin:hwm:${e}`;
}
async function Se(e, t) {
  const r = await e.get(it(t));
  return r ? JSON.parse(r) : sr;
}
async function st(e, t, r) {
  const n = await Se(e, t), o = {
    generation: Math.max(n.generation, r.generation ?? -1),
    recoveryGeneration: Math.max(n.recoveryGeneration, r.recoveryGeneration ?? -1)
  };
  return await e.set(it(t), JSON.stringify(o)), o;
}
function cr() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
class lr {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, r = {}) {
    this.url = t, this.authPrivateKey = r.authPrivateKey, this.connectTimeoutMs = r.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, r) => {
      const n = cr(), o = new n(this.url);
      this.ws = o;
      const a = setTimeout(() => {
        r(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(a), t();
      }), o.addEventListener("error", () => {
        clearTimeout(a), r(new Error(`WebSocket error connecting to relay ${this.url}`));
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
    let r;
    try {
      r = JSON.parse(t);
    } catch {
      return;
    }
    if (!Array.isArray(r) || typeof r[0] != "string")
      return;
    const [n, ...o] = r;
    if (n === "EVENT") {
      const [a, i] = o, s = this.subs.get(a);
      s && ee(i) && s.events.push(i);
      return;
    }
    if (n === "EOSE") {
      const [a] = o;
      this.subs.get(a)?.onEose();
      return;
    }
    if (n === "OK") {
      const [a, i, s] = o;
      this.pendingPublishes.get(a)?.({ ok: i, message: s ?? "" }), this.pendingPublishes.delete(a);
      return;
    }
    if (n === "AUTH") {
      const [a] = o;
      this.respondToAuthChallenge(a);
      return;
    }
  }
  async respondToAuthChallenge(t) {
    if (!this.authPrivateKey)
      return;
    const r = E(this.authPrivateKey), n = W({
      pubkey: r,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Dt,
      tags: [
        ["relay", this.url],
        ["challenge", t]
      ],
      content: ""
    }, this.authPrivateKey);
    this.authenticated = !0, this.send(["AUTH", n]);
  }
  isAuthenticated() {
    return this.authenticated;
  }
  async publish(t, r = 8e3) {
    return await this.connect(), new Promise((n) => {
      const o = setTimeout(() => {
        this.pendingPublishes.delete(t.id), n({ ok: !1, message: "timeout: no OK received from relay" });
      }, r);
      this.pendingPublishes.set(t.id, (a) => {
        clearTimeout(o), n(a);
      }), this.send(["EVENT", t]);
    });
  }
  async queryOnce(t, r = 8e3) {
    await this.connect();
    const n = Ot({
      pubkey: "0".repeat(64),
      created_at: Date.now(),
      kind: 0,
      tags: [],
      content: JSON.stringify(t) + Math.random()
    }).slice(0, 16);
    return new Promise((o) => {
      const a = [], i = () => {
        clearTimeout(s), this.subs.delete(n), this.send(["CLOSE", n]), o(a);
      }, s = setTimeout(i, r);
      this.subs.set(n, { events: a, onEose: i }), this.send(["REQ", n, t]);
    });
  }
}
class C {
  connections = /* @__PURE__ */ new Map();
  constructor(t, r = {}) {
    for (const n of new Set(t))
      this.connections.set(n, new lr(n, r));
  }
  get relayUrls() {
    return [...this.connections.keys()];
  }
  /** Queries every configured relay and waits for a quorum of responses (or all timeouts) before returning (§16.2). */
  async queryQuorum(t, r = 8e3) {
    const n = [...this.connections.entries()], o = await Promise.all(n.map(async ([s, c]) => {
      try {
        const d = await c.queryOnce(t, r);
        return { relayUrl: s, events: d, responded: !0 };
      } catch (d) {
        return { relayUrl: s, events: [], responded: !1, error: d.message };
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
  async publishAll(t, r = 8e3) {
    const n = [...this.connections.entries()];
    return Promise.all(n.map(async ([o, a]) => {
      try {
        const i = await a.publish(t, r);
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
function F(e) {
  return e.filter((t) => t.result.ok).length;
}
function ur(e, t, r) {
  return W({ pubkey: E(e), created_at: r, kind: Je, tags: [], content: JSON.stringify(t) }, e);
}
function dr(e, t, r) {
  const n = t.map((o) => {
    const a = ["r", o.url];
    return o.read && !o.write && a.push("read"), o.write && !o.read && a.push("write"), a;
  });
  return W({ pubkey: E(e), created_at: r, kind: Ce, tags: n, content: "" }, e);
}
function yr(e, t, r) {
  return W({
    pubkey: E(e),
    created_at: r,
    kind: Le,
    tags: t.map((n) => ["relay", n]),
    content: ""
  }, e);
}
function hr(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function pr(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function vr(e) {
  const t = E(e.everydayPrivateKey), r = Math.floor(Date.now() / 1e3), n = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new C(n), [a, i, s] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [Je] }),
    o.queryQuorum({ authors: [t], kinds: [Ce] }),
    o.queryQuorum({ authors: [t], kinds: [Le] })
  ]);
  o.closeAll();
  const c = a.outcomes.some((u) => u.events.length > 0), d = i.outcomes.some((u) => u.events.length > 0), h = s.outcomes.some((u) => u.events.length > 0), m = new C(n);
  let p = null, g = null, v = null;
  const f = [];
  if (!c && (e.name || e.about || e.picture)) {
    const u = ur(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, r);
    f.push(m.publishAll(u).then((y) => void (p = y)));
  }
  if (!d) {
    const u = dr(e.everydayPrivateKey, e.generalRelays.map((y) => ({ url: y, read: !0, write: !0 })), r);
    f.push(m.publishAll(u).then((y) => void (g = y)));
  }
  if (!h) {
    const u = yr(e.everydayPrivateKey, e.dmRelays, r);
    f.push(m.publishAll(u).then((y) => void (v = y)));
  }
  return await Promise.all(f), m.closeAll(), {
    profilePublished: p !== null && F(p) > 0,
    relayListAcknowledgedCount: g !== null ? F(g) : 0,
    dmRelayListAcknowledgedCount: v !== null ? F(v) : 0,
    profileSkippedExisting: c,
    relayListSkippedExisting: d,
    dmRelayListSkippedExisting: h
  };
}
async function le(e, t, r) {
  const n = r.minAcks ?? 2, o = r.minReadbacks ?? 2, a = await e.publishAll(t, r.timeoutMs), i = F(a), c = (await e.queryQuorum({ kinds: [ae], authors: [t.pubkey], "#d": [r.dTag], limit: 5 }, r.timeoutMs)).outcomes.filter((d) => d.events.some((h) => h.id === t.id)).length;
  return {
    acknowledgedCount: i,
    readbackVerifiedCount: c,
    success: i >= n && c >= o
  };
}
function gr(e) {
  const t = qt(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function fr(e) {
  return ye(gr(e));
}
const ve = [1024, 2048, 4096], Y = 4;
function mr(e) {
  const t = Y + e.length, r = ve.find((a) => a >= t);
  if (r === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${ve[ve.length - 1]} bytes minus ${Y}-byte length prefix).`);
  const n = new Uint8Array(r);
  return new DataView(n.buffer).setUint32(0, e.length, !1), n.set(e, Y), n;
}
function wr(e) {
  if (!ve.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const r = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (r > e.length - Y)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const n = e.slice(Y, Y + r), o = e.slice(Y + r);
  for (const a of o)
    if (a !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return n;
}
function Me() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function ct(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Me().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function br(e, t, r) {
  const n = zt(), o = await ct(e), a = await Me().subtle.encrypt({ name: "AES-GCM", iv: n, additionalData: r, tagLength: 128 }, o, t);
  return { nonce: n, ciphertext: new Uint8Array(a) };
}
async function kr(e, t, r, n) {
  const o = await ct(e);
  try {
    const a = await Me().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: n, tagLength: 128 }, o, r);
    return new Uint8Array(a);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function lt(e) {
  return ye(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function ut(e) {
  return ye(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function dt(e, t, r) {
  const n = fr(e), o = mr(n), a = await br(t, o, r);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: X(a.nonce),
    ciphertext: X(a.ciphertext)
  };
}
async function yt(e, t, r) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const n = ne(e.nonce), o = ne(e.ciphertext), a = await kr(t, n, o, r), i = wr(a);
  return JSON.parse(Ye(i));
}
class Ue extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const _r = /* @__PURE__ */ new Set(["wss:", "ws:"]), Er = 1e6, Pr = /^[0-9a-f]{64}$/u;
function P(e, t) {
  if (!e)
    throw new Ue(t);
}
function ge(e) {
  return typeof e == "string" && Pr.test(e);
}
function ht(e) {
  P(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e) {
    P(typeof t == "string", "Each relay hint must be a string (§12.4.7).");
    let r;
    try {
      r = new URL(t);
    } catch {
      throw new Ue(`Invalid relay URL: ${String(t)} (§12.4.7)`);
    }
    P(_r.has(r.protocol), `Relay URL uses a disallowed scheme: ${t} (§12.4.7)`);
  }
}
function pt(e) {
  P(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = ne(e);
  } catch {
    throw new Ue("account_id is not valid base64url (§12.4.2).");
  }
  P(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function vt(e, t) {
  P(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const r = ne(e);
  P(r.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), P(Te(r), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), P(ge(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const n = E(r);
  P(n === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function gt(e, t) {
  P(Number.isInteger(e) && e >= 0 && e <= Er, `${t} is out of supported bounds (§12.4.8).`);
}
function Kr(e) {
  P(e.schema === we, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), pt(e.account_id), gt(e.generation, "generation"), vt(e.operational_private_key, e.operational_public_key), P(ge(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), ht(e.vault_relay_hints);
  const t = e.recovery_capsule_event;
  P(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), P(ee(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), P(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Rr(e) {
  P(e.schema === Ne, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), pt(e.account_id), gt(e.recovery_generation, "recovery_generation"), P(e.previous_recovery_event_id === null || ge(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), vt(e.operational_private_key, e.operational_public_key), P(ge(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), ht(e.vault_relay_hints);
}
function xr(e) {
  const t = new Map(e.map((n) => [n.recoveryGeneration, n])), r = [...e].sort((n, o) => n.recoveryGeneration - o.recoveryGeneration);
  for (let n = 1; n < r.length; n++) {
    const o = r[n], a = t.get(o.recoveryGeneration - 1);
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
async function Oe(e) {
  const t = E(e.locatorPrivateKey), r = await dt(e.payload, e.capsuleKey, lt(t));
  return W({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: ae,
    tags: [["d", ie]],
    content: JSON.stringify(r)
  }, e.locatorPrivateKey);
}
function Ar(e) {
  const t = E(e.oldLocatorPrivateKey);
  return W({
    pubkey: t,
    created_at: e.createdAt,
    kind: ae,
    tags: [["d", ie]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Cr(e, t) {
  if (!ee(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const r = JSON.parse(e.content), n = await yt(r, t, lt(e.pubkey));
  return Kr(n), n;
}
async function ft(e) {
  const t = E(e.recoveryPrivateKey), r = await dt(e.payload, e.capsuleKey, ut(t));
  return W({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: ae,
    tags: [["d", be]],
    content: JSON.stringify(r)
  }, e.recoveryPrivateKey);
}
async function mt(e, t) {
  if (!ee(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const r = JSON.parse(e.content), n = await yt(r, t, ut(e.pubkey));
  return Rr(n), n;
}
function Lr(e) {
  const t = /* @__PURE__ */ new Map();
  for (const r of e)
    ee(r) && t.set(r.id, r);
  return [...t.values()].sort((r, n) => n.created_at - r.created_at);
}
async function wt(e, t, r, n, o) {
  const a = await e.queryQuorum({ kinds: [ae], authors: [t], "#d": [r], limit: 5 }, o), i = a.outcomes.flatMap((p) => p.events), s = Lr(i), c = [];
  for (const p of s)
    try {
      const g = await n(p);
      c.push({ event: p, payload: g });
    } catch (g) {
      c.push({ event: p, payload: null, error: g.message });
    }
  const d = c.find((p) => p.payload !== null) ?? null, h = a.outcomes.filter((p) => p.responded && p.events.length > 0).map((p) => p.events.slice().sort((g, v) => v.created_at - g.created_at)[0].id), m = new Set(h).size > 1;
  return {
    quorumMet: a.quorumMet,
    respondedCount: a.respondedCount,
    totalCount: a.totalCount,
    candidates: c,
    best: d,
    relayDisagreement: m
  };
}
async function fe(e, t, r, n = 8e3) {
  return wt(e, t, ie, (o) => Cr(o, r), n);
}
async function Nr(e, t, r, n = 8e3) {
  return wt(e, t, be, (o) => mt(o, r), n);
}
function Tr(e) {
  const t = e.filter((r) => r.payload !== null);
  return t.length < 2 ? { consistent: !0 } : xr(t.map((r) => ({
    eventId: r.event.id,
    recoveryGeneration: r.payload.recovery_generation,
    previousRecoveryEventId: r.payload.previous_recovery_event_id
  })));
}
async function Ir(e, t, r, n) {
  const [o, a] = await Promise.all([
    e.publishAll(t, n),
    e.publishAll(r, n)
  ]);
  return {
    credentialAcknowledgedCount: F(o),
    recoveryAcknowledgedCount: F(a),
    relaysTried: e.relayUrls.length
  };
}
const bt = `abandon
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
function Sr(e, t, r, n) {
  Gt(e);
  const o = Vt({ dkLen: 32, asyncTick: 10 }, n), { c: a, dkLen: i, asyncTick: s } = o;
  if (_e(a), _e(i), _e(s), a < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = ze(t), d = ze(r), h = new Uint8Array(i), m = Qe.create(e, c), p = m._cloneInto().update(d);
  return { c: a, dkLen: i, asyncTick: s, DK: h, PRF: m, PRFSalt: p };
}
function Mr(e, t, r, n, o) {
  return e.destroy(), t.destroy(), n && n.destroy(), Bt(o), r;
}
async function Ur(e, t, r, n) {
  const { c: o, dkLen: a, asyncTick: i, DK: s, PRF: c, PRFSalt: d } = Sr(e, t, r, n);
  let h;
  const m = new Uint8Array(4), p = jt(m), g = new Uint8Array(c.outputLen);
  for (let v = 1, f = 0; f < a; v++, f += c.outputLen) {
    const u = s.subarray(f, f + c.outputLen);
    p.setInt32(0, v, !1), (h = d._cloneInto(h)).update(m).digestInto(g), u.set(g.subarray(0, u.length)), await $t(o - 1, i, () => {
      c._cloneInto(h).update(g).digestInto(g);
      for (let y = 0; y < u.length; y++)
        u[y] ^= g[y];
    });
  }
  return Mr(c, d, s, h, g);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const Or = (e) => e[0] === "あいこくしん";
function kt(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function _t(e) {
  const t = kt(e), r = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(r.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: r };
}
function Et(e) {
  Ht(e, 16, 20, 24, 28, 32);
}
const Dr = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([Xe(e)[0] >> t << t]);
};
function Pt(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), he.chain(he.checksum(1, Dr), he.radix2(11, !0), he.alphabet(e));
}
function qr(e, t) {
  const { words: r } = _t(e), n = Pt(t).decode(r);
  return Et(n), n;
}
function zr(e, t) {
  return Et(e), Pt(t).encode(e).join(Or(t) ? "　" : " ");
}
function jr(e, t) {
  try {
    qr(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const $r = (e) => kt("mnemonic" + e);
function Gr(e, t = "") {
  return Ur(Wt, _t(e).nfkd, $r(t), { c: 2048, dkLen: 64 });
}
function Vr(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return zr(e, bt);
}
function Br(e) {
  try {
    return jr(Kt(e), bt);
  } catch {
    return !1;
  }
}
function Kt(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function Rt(e) {
  return Gr(Kt(e), "");
}
const De = Ft.id, ue = "aes-256-gcm-v1", de = "bitlogin-bip39-hkdf-v1";
async function xt(e) {
  const t = ke(e.loginName), r = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: n, capsuleKey: o } = await ce(e.password, t), a = E(n), i = new C(e.vaultRelayUrls, { authPrivateKey: n });
  let s;
  try {
    s = await fe(i, a, o, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!s.quorumMet)
    throw new Z("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
  if (s.candidates.length > 0)
    throw new rt();
  const c = Vr(Yt()), d = await Rt(c), { recoveryPrivateKey: h, capsuleKey: m } = et(d), p = E(h), g = e.everydayPrivateKey !== void 0;
  if (g && !Te(e.everydayPrivateKey))
    throw new Z("The provided key is not a valid secp256k1 private key.");
  const v = g ? e.everydayPrivateKey : Qt(), f = E(v), u = X(Xt()), y = {
    schema: Ne,
    account_id: u,
    recovery_generation: 0,
    previous_recovery_event_id: null,
    operational_private_key: X(v),
    operational_public_key: f,
    recovery_public_key: p,
    created_at: r,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: ue, recovery_derivation: de }
  }, k = await ft({
    recoveryPrivateKey: h,
    capsuleKey: m,
    payload: y
  }), b = {
    schema: we,
    account_id: u,
    generation: 0,
    operational_private_key: X(v),
    operational_public_key: f,
    recovery_public_key: p,
    recovery_capsule_event: k,
    created_at: r,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: De,
      capsule_encryption: ue,
      recovery_derivation: de
    }
  }, K = await Oe({
    locatorPrivateKey: n,
    capsuleKey: o,
    payload: b
  }), G = new C(e.vaultRelayUrls, { authPrivateKey: h }), _ = await le(G, k, {
    dTag: be,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  G.closeAll();
  const R = new C(e.vaultRelayUrls, { authPrivateKey: n }), x = await le(R, K, {
    dTag: ie,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (R.closeAll(), !_.success || !x.success)
    throw new Z("Registration did not reach the required relay acknowledgement and readback quorum. Please retry, or add more vault relays.");
  return {
    normalizedLoginName: t,
    recoveryPhrase: c,
    everydayPrivateKey: v,
    everydayPublicKey: f,
    recoveryPublicKey: p,
    locatorPublicKey: a,
    accountId: u,
    imported: g,
    credentialEvent: K,
    recoveryEvent: k,
    credentialPublish: x,
    recoveryPublish: _
  };
}
async function Wr(e) {
  const { nsecOrHex: t, ...r } = e, n = At(t);
  return xt({ ...r, everydayPrivateKey: n });
}
function At(e) {
  const t = e.trim();
  let r;
  if (t.startsWith("nsec1"))
    r = Jt(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    r = Ze(t.toLowerCase());
  else
    throw new Z("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!Te(r))
    throw new Z("The provided key is not a valid secp256k1 private key.");
  return r;
}
class Ct {
  map = /* @__PURE__ */ new Map();
  async get(t) {
    return this.map.get(t);
  }
  async set(t, r) {
    this.map.set(t, r);
  }
  async delete(t) {
    this.map.delete(t);
  }
}
async function Hr(e) {
  const t = ke(e.loginName), { locatorPrivateKey: r, capsuleKey: n } = await ce(e.password, t), o = E(r), a = new C(e.vaultRelayUrls, { authPrivateKey: r });
  try {
    const i = await fe(a, o, n, e.timeoutMs);
    if (!i.quorumMet)
      throw new oe("quorum-not-met");
    if (!i.best)
      throw new oe(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const s = i.best.payload, c = e.store ?? new Ct(), d = await Se(c, s.operational_public_key), h = s.generation < d.generation;
    if (h && !e.acknowledgeRollback)
      throw new ot(d.generation, s.generation);
    const m = h ? `This device previously saw credential generation ${d.generation}, but the accepted capsule is generation ${s.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await st(c, s.operational_public_key, { generation: s.generation });
    const p = i.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: ne(s.operational_private_key),
      everydayPublicKey: s.operational_public_key,
      recoveryPublicKey: s.recovery_public_key,
      accountId: s.account_id,
      generation: s.generation,
      credentialEvent: i.best.event,
      recoveryCapsuleEvent: s.recovery_capsule_event,
      rollbackWarning: m,
      relayDisagreementWarning: p
    };
  } finally {
    a.closeAll();
  }
}
function $e(e) {
  return e.filter((t) => ee(t)).sort((t, r) => r.created_at - t.created_at)[0];
}
async function Fr(e) {
  if (!Br(e.phrase))
    throw new nt("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Rt(e.phrase), { recoveryPrivateKey: r, capsuleKey: n } = et(t), o = E(r), a = new C(e.vaultRelayUrls, { authPrivateKey: r });
  let i;
  try {
    i = await Nr(a, o, n, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const b of e.offlineRecoveryCapsuleEvents)
      if (ee(b))
        try {
          f.push({ event: b, payload: await mt(b, n) });
        } catch (K) {
          f.push({ event: b, payload: null, error: K.message });
        }
    const u = /* @__PURE__ */ new Map();
    for (const b of [...i.candidates, ...f])
      u.set(b.event.id, b);
    const y = [...u.values()].sort((b, K) => K.event.created_at - b.event.created_at), k = y.find((b) => b.payload !== null) ?? null;
    i = { ...i, candidates: y, best: k, quorumMet: i.quorumMet || k !== null };
  }
  if (!i.quorumMet)
    throw new oe("quorum-not-met");
  if (!i.best)
    throw new oe(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = i.best.payload, c = Tr(i.candidates), d = ne(s.operational_private_key), h = s.operational_public_key, m = [.../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...s.vault_relay_hints])], p = new C(m);
  let g = [], v = [];
  try {
    const f = await p.queryQuorum({ kinds: [Ce], authors: [h], limit: 5 }, e.timeoutMs), u = $e(f.outcomes.flatMap((b) => b.events));
    u && (g = hr(u));
    const y = await p.queryQuorum({ kinds: [Le], authors: [h], limit: 5 }, e.timeoutMs), k = $e(y.outcomes.flatMap((b) => b.events));
    k && (v = pr(k));
  } finally {
    p.closeAll();
  }
  return {
    everydayPrivateKey: d,
    everydayPublicKey: h,
    recoveryPrivateKey: r,
    recoveryPublicKey: o,
    recoveryCapsuleKey: n,
    accountId: s.account_id,
    currentRecoveryEvent: i.best.event,
    currentRecoveryPayload: s,
    generalRelays: g,
    dmRelays: v,
    chainWarning: c.consistent ? void 0 : c.warning
  };
}
async function Jr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), r = ke(e.newLoginName), { recovered: n } = e, o = {
    schema: Ne,
    account_id: n.accountId,
    recovery_generation: n.currentRecoveryPayload.recovery_generation + 1,
    previous_recovery_event_id: n.currentRecoveryEvent.id,
    operational_private_key: X(n.everydayPrivateKey),
    operational_public_key: n.everydayPublicKey,
    recovery_public_key: n.recoveryPublicKey,
    created_at: at(n.currentRecoveryEvent.created_at, t),
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: ue, recovery_derivation: de }
  }, a = await ft({
    recoveryPrivateKey: n.recoveryPrivateKey,
    capsuleKey: n.recoveryCapsuleKey,
    payload: o
  }), i = new C(e.vaultRelayUrls, { authPrivateKey: n.recoveryPrivateKey }), s = await le(i, a, {
    dTag: be,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  i.closeAll();
  const { locatorPrivateKey: c, capsuleKey: d } = await ce(e.newPassword, r), h = E(c), m = {
    schema: we,
    account_id: n.accountId,
    generation: 0,
    operational_private_key: X(n.everydayPrivateKey),
    operational_public_key: n.everydayPublicKey,
    recovery_public_key: n.recoveryPublicKey,
    recovery_capsule_event: a,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: De,
      capsule_encryption: ue,
      recovery_derivation: de
    }
  }, p = await Oe({ locatorPrivateKey: c, capsuleKey: d, payload: m }), g = new C(e.vaultRelayUrls, { authPrivateKey: c }), v = await le(g, p, {
    dTag: ie,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (g.closeAll(), !s.success || !v.success)
    throw new nt("Could not publish the refreshed recovery and credential capsules to enough relays. Please retry.");
  return { normalizedLoginName: r, locatorPublicKey: h, credentialEvent: p, refreshedRecoveryEvent: a, credentialPublish: v, recoveryPublish: s };
}
function Yr(e) {
  const t = E(e.privateKey);
  return W({
    pubkey: t,
    created_at: e.createdAt,
    kind: Zt,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function Qr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), r = ke(e.loginName), n = await ce(e.oldPassword, r), o = E(n.locatorPrivateKey), a = new C(e.vaultRelayUrls, { authPrivateKey: n.locatorPrivateKey });
  let i;
  try {
    i = await fe(a, o, n.capsuleKey, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (!i.quorumMet)
    throw new oe("quorum-not-met");
  if (!i.best)
    throw new oe(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = i.best.payload, c = i.best.event, d = e.store ?? new Ct(), h = await Se(d, s.operational_public_key);
  if (s.generation < h.generation && !e.acknowledgeRollback)
    throw new ot(h.generation, s.generation);
  const m = await ce(e.newPassword, r), p = E(m.locatorPrivateKey), g = new C(e.vaultRelayUrls, { authPrivateKey: m.locatorPrivateKey });
  let v;
  try {
    v = await fe(g, p, m.capsuleKey, e.timeoutMs);
  } finally {
    g.closeAll();
  }
  if (!v.quorumMet)
    throw new Z("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (v.candidates.length > 0)
    throw new rt("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = s.generation + 1, u = {
    schema: we,
    account_id: s.account_id,
    generation: f,
    operational_private_key: s.operational_private_key,
    operational_public_key: s.operational_public_key,
    recovery_public_key: s.recovery_public_key,
    recovery_capsule_event: s.recovery_capsule_event,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: De,
      capsule_encryption: ue,
      recovery_derivation: de
    }
  }, y = await Oe({
    locatorPrivateKey: m.locatorPrivateKey,
    capsuleKey: m.capsuleKey,
    payload: u
  }), k = new C(e.vaultRelayUrls, { authPrivateKey: m.locatorPrivateKey }), b = await le(k, y, {
    dTag: ie,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  k.closeAll();
  const K = Ar({
    oldLocatorPrivateKey: n.locatorPrivateKey,
    createdAt: at(c.created_at, t)
  }), G = Yr({
    privateKey: n.locatorPrivateKey,
    eventIdToDelete: c.id,
    deletedEventKind: ae,
    createdAt: t
  }), _ = new C(e.vaultRelayUrls, { authPrivateKey: n.locatorPrivateKey }), [R, x] = await Promise.all([
    _.publishAll(K, e.timeoutMs),
    _.publishAll(G, e.timeoutMs)
  ]);
  if (_.closeAll(), !b.success)
    throw new Z("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Please retry.");
  return await st(d, s.operational_public_key, { generation: f }), {
    normalizedLoginName: r,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: p,
    newGeneration: f,
    recoveryPublicKey: s.recovery_public_key,
    recoveryCapsuleEvent: s.recovery_capsule_event,
    newCredentialEvent: y,
    tombstoneEvent: K,
    deletionRequestEvent: G,
    newCredentialPublish: b,
    tombstoneAcknowledgedCount: F(R),
    deletionAcknowledgedCount: F(x)
  };
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function Xr(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Ge(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Ee(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function te(e, t, r = "") {
  const n = Xr(e), o = e?.length, a = t !== void 0;
  if (!n || a && o !== t) {
    const i = r && `"${r}" `, s = a ? ` of length ${t}` : "", c = n ? `length=${o}` : `type=${typeof e}`, d = i + "expected Uint8Array" + s + ", got " + c;
    throw n ? new RangeError(d) : new TypeError(d);
  }
  return e;
}
function B(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Ve(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const re = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, Zr = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, en = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = Zr(e[t]);
  return e;
}, Q = re ? (e) => e : en;
function tn(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
function rn(e, t, r = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (te(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (r && !me(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function me(e) {
  return e.byteOffset % 4 === 0;
}
function Be(e) {
  return Uint8Array.from(te(e));
}
const Lt = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), nn = Q(B(Lt("expand 16-byte k"))), on = Q(B(Lt("expand 32-byte k")));
function w(e, t) {
  return e << t | e >>> 32 - t;
}
const se = 64, an = 16, Re = 2 ** 32 - 1, We = /* @__PURE__ */ Uint32Array.of();
function sn(e, t, r, n, o, a, i, s) {
  const c = o.length, d = new Uint8Array(se), h = B(d), m = re && me(o) && me(a), p = m ? B(o) : We, g = m ? B(a) : We;
  if (!re) {
    for (let v = 0; v < c; i++) {
      if (e(t, r, n, h, i, s), Q(h), i >= Re)
        throw new Error("arx: counter overflow");
      const f = Math.min(se, c - v);
      for (let u = 0, y; u < f; u++)
        y = v + u, a[y] = o[y] ^ d[u];
      v += f;
    }
    return;
  }
  for (let v = 0; v < c; i++) {
    if (e(t, r, n, h, i, s), i >= Re)
      throw new Error("arx: counter overflow");
    const f = Math.min(se, c - v);
    if (m && f === se) {
      const u = v / 4;
      if (v % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let y = 0, k; y < an; y++)
        k = u + y, g[k] = p[k] ^ h[y];
      v += se;
      continue;
    }
    for (let u = 0, y; u < f; u++)
      y = v + u, a[y] = o[y] ^ d[u];
    v += f;
  }
}
function cn(e, t) {
  const { allowShortKeys: r, extendNonceFn: n, counterLength: o, counterRight: a, rounds: i } = tn({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Ee(o), Ee(i), Ge(a), Ge(r), (s, c, d, h, m = 0) => {
    te(s, void 0, "key"), te(c, void 0, "nonce"), te(d, void 0, "data");
    const p = d.length;
    if (h = rn(p, h, !1), Ee(m), m < 0 || m >= Re)
      throw new Error("arx: counter overflow");
    const g = [];
    let v = s.length, f, u;
    if (v === 32)
      g.push(f = Be(s)), u = on;
    else if (v === 16 && r)
      f = new Uint8Array(32), f.set(s), f.set(s, 16), u = nn, g.push(f);
    else
      throw te(s, 32, "arx key"), new Error("invalid key size");
    (!re || !me(c)) && g.push(c = Be(c));
    let y = B(f);
    if (n) {
      if (c.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const K = c.subarray(0, 16);
      if (re)
        n(u, y, B(K), y);
      else {
        const G = Q(Uint32Array.from(u));
        n(G, y, B(K), y), Ve(G), Q(y);
      }
      c = c.subarray(16);
    } else re || Q(y);
    const k = 16 - o;
    if (k !== c.length)
      throw new Error(`arx: nonce must be ${k} or 16 bytes`);
    if (k !== 12) {
      const K = new Uint8Array(12);
      K.set(c, a ? 0 : 12 - c.length), c = K, g.push(c);
    }
    const b = Q(B(c));
    try {
      return sn(e, u, y, b, d, h, m, i), h;
    } finally {
      Ve(...g);
    }
  };
}
function ln(e, t, r, n, o, a = 20) {
  let i = e[0], s = e[1], c = e[2], d = e[3], h = t[0], m = t[1], p = t[2], g = t[3], v = t[4], f = t[5], u = t[6], y = t[7], k = o, b = r[0], K = r[1], G = r[2], _ = i, R = s, x = c, L = d, N = h, T = m, I = p, S = g, M = v, U = f, O = u, D = y, q = k, z = b, j = K, $ = G;
  for (let qe = 0; qe < a; qe += 2)
    _ = _ + N | 0, q = w(q ^ _, 16), M = M + q | 0, N = w(N ^ M, 12), _ = _ + N | 0, q = w(q ^ _, 8), M = M + q | 0, N = w(N ^ M, 7), R = R + T | 0, z = w(z ^ R, 16), U = U + z | 0, T = w(T ^ U, 12), R = R + T | 0, z = w(z ^ R, 8), U = U + z | 0, T = w(T ^ U, 7), x = x + I | 0, j = w(j ^ x, 16), O = O + j | 0, I = w(I ^ O, 12), x = x + I | 0, j = w(j ^ x, 8), O = O + j | 0, I = w(I ^ O, 7), L = L + S | 0, $ = w($ ^ L, 16), D = D + $ | 0, S = w(S ^ D, 12), L = L + S | 0, $ = w($ ^ L, 8), D = D + $ | 0, S = w(S ^ D, 7), _ = _ + T | 0, $ = w($ ^ _, 16), O = O + $ | 0, T = w(T ^ O, 12), _ = _ + T | 0, $ = w($ ^ _, 8), O = O + $ | 0, T = w(T ^ O, 7), R = R + I | 0, q = w(q ^ R, 16), D = D + q | 0, I = w(I ^ D, 12), R = R + I | 0, q = w(q ^ R, 8), D = D + q | 0, I = w(I ^ D, 7), x = x + S | 0, z = w(z ^ x, 16), M = M + z | 0, S = w(S ^ M, 12), x = x + S | 0, z = w(z ^ x, 8), M = M + z | 0, S = w(S ^ M, 7), L = L + N | 0, j = w(j ^ L, 16), U = U + j | 0, N = w(N ^ U, 12), L = L + N | 0, j = w(j ^ L, 8), U = U + j | 0, N = w(N ^ U, 7);
  let A = 0;
  n[A++] = i + _ | 0, n[A++] = s + R | 0, n[A++] = c + x | 0, n[A++] = d + L | 0, n[A++] = h + N | 0, n[A++] = m + T | 0, n[A++] = p + I | 0, n[A++] = g + S | 0, n[A++] = v + M | 0, n[A++] = f + U | 0, n[A++] = u + O | 0, n[A++] = y + D | 0, n[A++] = k + q | 0, n[A++] = b + z | 0, n[A++] = K + j | 0, n[A++] = G + $ | 0;
}
const Nt = /* @__PURE__ */ cn(ln, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Tt = 2, xe = 1, It = 65536, Ae = 4294967295;
function He(e, t) {
  const r = Ie(new Uint8Array([2]), Ze(t)), o = tr.getSharedSecret(e, r, !0).slice(1, 33);
  return rr(ye("nip44-v2"), o);
}
function St(e, t) {
  const r = or(e, t, 76);
  return {
    chachaKey: r.slice(0, 32),
    chachaNonce: r.slice(32, 44),
    hmacKey: r.slice(44, 76)
  };
}
function Mt(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), r = t <= 256 ? 32 : t / 8;
  return r * (Math.floor((e - 1) / r) + 1);
}
function un(e) {
  if (e < It) {
    const r = new Uint8Array(2);
    return new DataView(r.buffer).setUint16(0, e, !1), r;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function dn(e) {
  const t = e.length;
  if (t < xe || t > Ae)
    throw new Error(`NIP-44 plaintext length must be between ${xe} and ${Ae} bytes.`);
  const r = un(t), n = Mt(t), o = new Uint8Array(r.length + n);
  return o.set(r, 0), o.set(e, r.length), o;
}
function yn(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), r = t.getUint16(0, !1);
  let n, o;
  if (r === 0) {
    if (n = t.getUint32(2, !1), o = 6, n < It)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    n = r, o = 2;
  if (n < xe || n > Ae || e.length !== o + Mt(n))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + n);
}
function Ut(e, t, r) {
  return Qe(Xe, e, Ie(t, r));
}
function hn(e, t, r) {
  const n = er(32), { chachaKey: o, chachaNonce: a, hmacKey: i } = St(e, n), s = dn(ye(t)), c = Nt(o, a, s), d = Ut(i, n, c);
  return tt.encode(Ie(new Uint8Array([Tt]), n, c, d));
}
function pn(e, t) {
  const r = tt.decode(t);
  if (r[0] !== Tt)
    throw new Error(`Unsupported NIP-44 version: ${r[0]}`);
  const n = r.slice(1, 33), o = r.slice(r.length - 32), a = r.slice(33, r.length - 32), { chachaKey: i, chachaNonce: s, hmacKey: c } = St(e, n), d = Ut(c, n, a);
  if (!nr(o, d))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const h = Nt(i, s, a);
  return Ye(yn(h));
}
function vn(...e) {
  for (const t of e)
    t && t.fill(0);
}
class Pe {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = E(t);
  }
  assertAlive() {
    if (this.destroyed)
      throw new Error("This signer has been destroyed (session locked or logged out).");
  }
  getPublicKey() {
    return this.assertAlive(), this.publicKeyHex;
  }
  signEvent(t) {
    return this.assertAlive(), W({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, r) {
    return this.assertAlive(), hn(He(this.privateKey, t), r);
  }
  nip44Decrypt(t, r) {
    return this.assertAlive(), pn(He(this.privateKey, t), r);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    vn(this.privateKey), this.destroyed = !0;
  }
}
const gn = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band"
], fn = [
  "wss://purplepag.es",
  "wss://relay.nostr.band"
], mn = "bitlogin", H = "kv", wn = 1;
function bn() {
  return new Promise((e, t) => {
    const r = indexedDB.open(mn, wn);
    r.onupgradeneeded = () => {
      const n = r.result;
      n.objectStoreNames.contains(H) || n.createObjectStore(H);
    }, r.onsuccess = () => e(r.result), r.onerror = () => t(r.error);
  });
}
class kn {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = bn()), this.dbPromise;
  }
  async get(t) {
    const r = await this.db();
    return new Promise((n, o) => {
      const i = r.transaction(H, "readonly").objectStore(H).get(t);
      i.onsuccess = () => n(i.result), i.onerror = () => o(i.error);
    });
  }
  async set(t, r) {
    const n = await this.db();
    return new Promise((o, a) => {
      const i = n.transaction(H, "readwrite");
      i.objectStore(H).put(r, t), i.oncomplete = () => o(), i.onerror = () => a(i.error);
    });
  }
  async delete(t) {
    const r = await this.db();
    return new Promise((n, o) => {
      const a = r.transaction(H, "readwrite");
      a.objectStore(H).delete(t), a.oncomplete = () => n(), a.onerror = () => o(a.error);
    });
  }
}
const l = {
  signer: null,
  everydayPrivateKey: null,
  accountId: null,
  recoveryPublicKey: null,
  activeCredentialEvent: null,
  activeRecoveryEvent: null,
  pendingRecovery: null
};
let V = [...gn], Ke = [...fn];
const Fe = new kn();
function J() {
  if (!l.signer || !l.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: l.signer, everydayPrivateKey: l.everydayPrivateKey };
}
function pe() {
  l.signer?.destroy(), l.everydayPrivateKey && l.everydayPrivateKey.fill(0), l.signer = null, l.everydayPrivateKey = null, l.accountId = null, l.recoveryPublicKey = null, l.activeCredentialEvent = null, l.activeRecoveryEvent = null, l.pendingRecovery && (l.pendingRecovery.recoveryPrivateKey.fill(0), l.pendingRecovery.everydayPrivateKey.fill(0), l.pendingRecovery = null);
}
async function _n(e, t) {
  switch (e) {
    case "configure": {
      const r = t;
      return r.vaultRelayUrls?.length && (V = r.vaultRelayUrls), r.discoveryRelayUrls?.length && (Ke = r.discoveryRelayUrls), {};
    }
    case "register": {
      const r = t, n = r.importKey ? await Wr({ nsecOrHex: r.importKey, loginName: r.loginName, password: r.password, vaultRelayUrls: V }) : await xt({ loginName: r.loginName, password: r.password, vaultRelayUrls: V });
      return pe(), l.signer = new Pe(n.everydayPrivateKey), l.everydayPrivateKey = n.everydayPrivateKey, l.accountId = n.accountId, l.recoveryPublicKey = n.recoveryPublicKey, l.activeCredentialEvent = n.credentialEvent, l.activeRecoveryEvent = n.recoveryEvent, {
        recoveryPhrase: n.recoveryPhrase,
        everydayPublicKey: n.everydayPublicKey,
        recoveryPublicKey: n.recoveryPublicKey,
        accountId: n.accountId,
        imported: n.imported,
        credentialEventId: n.credentialEvent.id,
        recoveryEventId: n.recoveryEvent.id
      };
    }
    case "previewImportKey": {
      const n = At(t.nsecOrHex), o = E(n), a = { everydayPublicKey: o, npub: je(o) };
      return n.fill(0), a;
    }
    case "login": {
      const r = t, n = await Hr({
        loginName: r.loginName,
        password: r.password,
        vaultRelayUrls: V,
        store: Fe,
        acknowledgeRollback: r.acknowledgeRollback
      });
      return pe(), l.signer = new Pe(n.everydayPrivateKey), l.everydayPrivateKey = n.everydayPrivateKey, l.accountId = n.accountId, l.recoveryPublicKey = n.recoveryPublicKey, l.activeCredentialEvent = n.credentialEvent, l.activeRecoveryEvent = n.recoveryCapsuleEvent, {
        everydayPublicKey: n.everydayPublicKey,
        accountId: n.accountId,
        generation: n.generation,
        rollbackWarning: n.rollbackWarning,
        relayDisagreementWarning: n.relayDisagreementWarning
      };
    }
    case "recover": {
      const r = t, n = await Fr({
        phrase: r.phrase,
        vaultRelayUrls: V,
        discoveryRelayUrls: Ke,
        offlineRecoveryCapsuleEvents: r.offlineExportFile?.recovery_capsule_events
      });
      return pe(), l.pendingRecovery = n, l.signer = new Pe(n.everydayPrivateKey), l.everydayPrivateKey = n.everydayPrivateKey, l.accountId = n.accountId, l.recoveryPublicKey = n.recoveryPublicKey, l.activeRecoveryEvent = n.currentRecoveryEvent, {
        everydayPublicKey: n.everydayPublicKey,
        accountId: n.accountId,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        chainWarning: n.chainWarning
      };
    }
    case "completeRecovery": {
      const r = t;
      if (!l.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const n = await Jr({
        recovered: l.pendingRecovery,
        newLoginName: r.newLoginName,
        newPassword: r.newPassword,
        vaultRelayUrls: V
      });
      return l.activeCredentialEvent = n.credentialEvent, l.activeRecoveryEvent = n.refreshedRecoveryEvent, l.pendingRecovery.recoveryPrivateKey.fill(0), l.pendingRecovery = null, {
        locatorPublicKey: n.locatorPublicKey,
        credentialEventId: n.credentialEvent.id,
        refreshedRecoveryEventId: n.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const r = t, n = await Qr({
        loginName: r.loginName,
        oldPassword: r.oldPassword,
        newPassword: r.newPassword,
        vaultRelayUrls: V,
        store: Fe,
        acknowledgeRollback: r.acknowledgeRollback
      });
      return l.activeCredentialEvent = n.newCredentialEvent, l.recoveryPublicKey = n.recoveryPublicKey, l.activeRecoveryEvent = n.recoveryCapsuleEvent, {
        newLocatorPublicKey: n.newLocatorPublicKey,
        newGeneration: n.newGeneration,
        tombstoneAcknowledgedCount: n.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: n.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const r = t, { everydayPrivateKey: n } = J();
      return vr({
        everydayPrivateKey: n,
        name: r.name,
        about: r.about,
        picture: r.picture,
        generalRelays: r.generalRelays,
        dmRelays: r.dmRelays,
        discoveryRelays: Ke
      });
    }
    case "getPublicKey": {
      const { signer: r } = J();
      return { publicKey: r.getPublicKey() };
    }
    case "signEvent": {
      const { signer: r } = J(), n = t;
      return r.signEvent({ kind: n.kind, tags: n.tags, content: n.content, created_at: n.created_at });
    }
    case "nip44Encrypt": {
      const { signer: r } = J(), n = t;
      return { ciphertext: r.nip44Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: r } = J(), n = t;
      return { plaintext: r.nip44Decrypt(n.peerPublicKey, n.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: r, signer: n } = J();
      return { nsec: ir(r), npub: je(n.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (J(), !l.recoveryPublicKey || !l.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return ar({
        recoveryPublicKeyHex: l.recoveryPublicKey,
        vaultRelayUrls: V,
        recoveryCapsuleEvents: [l.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!l.activeCredentialEvent || !l.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const r = new C(V), n = await Ir(r, l.activeCredentialEvent, l.activeRecoveryEvent);
      return r.closeAll(), n;
    }
    case "getSessionStatus":
      return { unlocked: !!l.signer, everydayPublicKey: l.signer?.getPublicKey() };
    case "logout":
      return pe(), {};
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
self.addEventListener("message", (e) => {
  const { id: t, action: r, payload: n } = e.data;
  _n(r, n).then(
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
