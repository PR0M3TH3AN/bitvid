class u {
  worker;
  pending = /* @__PURE__ */ new Map();
  counter = 0;
  dead = !1;
  /** Why the worker is gone, surfaced on every post-teardown rejection so a
   *  developer sees the CAUSE (usually an unmounted element), not just a bare
   *  failure. Overridable via terminate(reason). */
  deadReason = "This BitLogin session was torn down; reload the page to sign in again.";
  /** Set by the element to receive unsolicited worker frames (auth_url). */
  onNotification = null;
  constructor() {
    const e = ["cryptoWorker", ".js"].join(""), i = new URL(e, import.meta.url);
    this.worker = new Worker(i, { type: "module" }), this.worker.addEventListener("message", (r) => {
      const t = r.data;
      if (!t || typeof t != "object") return;
      const n = t;
      if (n.notify === "nip46-auth-url" && typeof n.url == "string") {
        this.onNotification?.(n);
        return;
      }
      if (typeof t.id != "string") return;
      const l = this.pending.get(t.id);
      if (l)
        if (this.pending.delete(t.id), clearTimeout(l.timer), t.ok)
          l.resolve(t.result);
        else {
          const s = new Error(t.error);
          s.name = t.errorName ?? "Error", l.reject(s);
        }
    });
    const a = (r) => () => this.failAll(r);
    this.worker.addEventListener("error", a("The BitLogin crypto worker stopped unexpectedly.")), this.worker.addEventListener(
      "messageerror",
      a("The BitLogin crypto worker sent an unreadable message.")
    );
  }
  /** Settles every outstanding call with an error. Idempotent. */
  failAll(e) {
    const i = [...this.pending.values()];
    this.pending.clear();
    for (const a of i)
      clearTimeout(a.timer), a.reject(new Error(e));
  }
  call(e, i, a = 6e4) {
    if (this.dead)
      return Promise.reject(new Error(this.deadReason));
    const r = `${Date.now().toString(36)}-${(this.counter++).toString(36)}`;
    return new Promise((t, n) => {
      const l = setTimeout(() => {
        this.pending.delete(r), n(new Error(`BitLogin's ${e} call timed out.`));
      }, a);
      this.pending.set(r, { resolve: t, reject: n, timer: l });
      const s = { id: r, action: e, payload: i };
      this.worker.postMessage(s);
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
  previewPhraseRebuild(e) {
    return this.call("previewPhraseRebuild", e);
  }
  rebuildFromPhrase(e) {
    return this.call("rebuildFromPhrase", e);
  }
  checkReplicaHealth() {
    return this.call("checkReplicaHealth", {});
  }
  getSessionStatus() {
    return this.call("getSessionStatus", {});
  }
  restoreSession() {
    return this.call("restoreSession", {});
  }
  handoffBegin() {
    return this.call("handoffBegin", {});
  }
  handoffExport(e) {
    return this.call("handoffExport", e);
  }
  handoffAccept(e) {
    return this.call("handoffAccept", e);
  }
  loadProfile(e = {}) {
    return this.call("loadProfile", e);
  }
  accountsList() {
    return this.call("accountsList", {});
  }
  accountsSwitch(e) {
    return this.call("accountsSwitch", { pubkey: e });
  }
  accountsAdd() {
    return this.call("accountsAdd", {});
  }
  accountsRemove(e) {
    return this.call("accountsRemove", { pubkey: e });
  }
  takeBack(e) {
    return this.call("takeBack", e);
  }
  signerCheck(e) {
    return this.call("signerCheck", e);
  }
  lockStatus() {
    return this.call("lockStatus", {});
  }
  lockEnable(e) {
    return this.call("lockEnable", e);
  }
  lockSetDevice(e) {
    return this.call("lockSetDevice", e);
  }
  lockRemoveDevice() {
    return this.call("lockRemoveDevice", {});
  }
  lockDisable() {
    return this.call("lockDisable", {});
  }
  lockNow() {
    return this.call("lockNow", {});
  }
  lockOpen(e) {
    return this.call("lockOpen", e);
  }
  roomPass(e) {
    return this.call("roomPass", e);
  }
  worldSave(e) {
    return this.call("worldSave", e);
  }
  worldFind(e) {
    return this.call("worldFind", e);
  }
  worldOpen(e) {
    return this.call("worldOpen", e);
  }
  worldFollow(e) {
    return this.call("worldFollow", e);
  }
  worldSeal(e) {
    return this.call("worldSeal", e);
  }
  worldUnwrap(e) {
    return this.call("worldUnwrap", e);
  }
  worldReach(e) {
    return this.call("worldReach", e);
  }
  worldScore(e) {
    return this.call("worldScore", e);
  }
  worldAchieve(e) {
    return this.call("worldAchieve", e);
  }
  signerKeep(e) {
    return this.call("signerKeep", e);
  }
  signerRestore(e) {
    return this.call("signerRestore", e);
  }
  signerTouch(e) {
    return this.call("signerTouch", e);
  }
  signerForget(e) {
    return this.call("signerForget", e);
  }
  appEncrypt(e) {
    return this.call("appEncrypt", e);
  }
  appDecrypt(e) {
    return this.call("appDecrypt", e);
  }
  appDecryptEvent(e) {
    return this.call("appDecryptEvent", e);
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
    return this.call("nip46Connect", e, 26e4);
  }
  nip46NostrconnectStart(e) {
    return this.call("nip46NostrconnectStart", e);
  }
  nip46NostrconnectAwait() {
    return this.call("nip46NostrconnectAwait", {}, 32e4);
  }
  nip46SignEvent(e) {
    return this.call("nip46SignEvent", e, 26e4);
  }
  nip46Nip44Encrypt(e) {
    return this.call("nip46Nip44Encrypt", e, 26e4);
  }
  nip46Nip44Decrypt(e) {
    return this.call("nip46Nip44Decrypt", e, 26e4);
  }
  nip46Nip04Encrypt(e) {
    return this.call("nip46Nip04Encrypt", e, 26e4);
  }
  nip46Nip04Decrypt(e) {
    return this.call("nip46Nip04Decrypt", e, 26e4);
  }
  nip46Disconnect() {
    return this.call("nip46Disconnect", {});
  }
  logout() {
    return this.call("logout", {});
  }
  terminate(e) {
    this.dead = !0, e && (this.deadReason = e), this.worker.terminate(), this.failAll(this.deadReason);
  }
}
const p = "BitLogin: no session is unlocked. Call restore() first, or have the user sign in once via <bitlogin-auth>.";
async function d(c = {}) {
  const e = new u();
  await e.configure({
    vaultRelayUrls: c.vaultRelays ?? [],
    discoveryRelayUrls: c.discoveryRelays ?? []
  });
  let i = null;
  const a = async () => {
    if (i) return i;
    const r = await e.getSessionStatus();
    if (!r.unlocked || !r.everydayPublicKey) throw new Error(p);
    return i = r.everydayPublicKey, i;
  };
  return {
    async restore() {
      const r = await e.restoreSession();
      return i = r.restored && r.everydayPublicKey ? r.everydayPublicKey : null, i ? { pubkey: i } : null;
    },
    async accounts() {
      return (await e.accountsList()).accounts;
    },
    async switchAccount(r) {
      const t = await e.accountsSwitch(r);
      return t.locked ? { locked: !0 } : (i = t.restored && t.everydayPublicKey ? t.everydayPublicKey : null, i ? { pubkey: i } : null);
    },
    async addAccount() {
      await e.accountsAdd(), i = null;
    },
    async isUnlocked() {
      if (i) return !0;
      const r = await e.getSessionStatus();
      return r.unlocked && r.everydayPublicKey && (i = r.everydayPublicKey), !!r.unlocked;
    },
    getPublicKey() {
      return a();
    },
    async signEvent(r) {
      return await a(), e.signEvent(r);
    },
    async nip44Encrypt(r, t) {
      return await a(), (await e.nip44Encrypt({ peerPublicKey: r, plaintext: t })).ciphertext;
    },
    async nip44Decrypt(r, t) {
      return await a(), (await e.nip44Decrypt({ peerPublicKey: r, payload: t })).plaintext;
    },
    async beginHandoff() {
      return (await e.handoffBegin()).recipientPublicKey;
    },
    async exportHandoff(r, t, n, l, s, o) {
      return await a(), e.handoffExport({ recipientPublicKey: r, ...t ? { app: t } : {}, ...n ? { site: n } : {}, ...l ? { remember: !0 } : {}, ...s ? { family: s } : {}, ...o?.length ? { more: [...o] } : {} });
    },
    async lockStatus() {
      return e.lockStatus();
    },
    async lockOpen(r) {
      const t = await e.lockOpen(r);
      return i = t.ok && t.everydayPublicKey ? t.everydayPublicKey : null, { ok: t.ok, left: t.left, removed: t.removed };
    },
    async loadProfile(r = {}) {
      return await a(), (await e.loadProfile(r)).profile ?? null;
    },
    async takeBack(r) {
      return await a(), e.takeBack(r);
    },
    async checkTakenBack(r) {
      return (await e.signerCheck({ site: r })).state;
    },
    async roomPass(r) {
      return e.roomPass({ session: r });
    },
    async worldSave(r, t) {
      return e.worldSave({ slot: r, data: t });
    },
    async worldFind(r) {
      return (await e.worldFind({ slot: r })).d;
    },
    async worldOpen(r) {
      return e.worldOpen({ event: r });
    },
    async worldFollow(r, t) {
      return e.worldFollow({ list: r, ...t });
    },
    async worldSeal(r, t) {
      return e.worldSeal({ to: r, text: t });
    },
    async worldUnwrap(r) {
      return (await e.worldUnwrap({ event: r })).message;
    },
    async worldReach(r) {
      return e.worldReach({ relays: r });
    },
    async worldScore(r, t, n, l = {}) {
      return e.worldScore({ world: r, board: t, score: n, ...l.title ? { title: l.title } : {}, ...l.format === "time" ? { format: "time" } : {} });
    },
    async worldAchieve(r, t, n) {
      return e.worldAchieve({ world: r, achievement: t, title: n });
    },
    async acceptHandoff(r) {
      const t = await e.handoffAccept(r);
      return i = t.everydayPublicKey, { pubkey: i, ...t.app ? { app: t.app } : {}, ...t.site ? { site: t.site } : {}, ...t.profile ? { profile: t.profile } : {}, ...t.remember ? { remember: !0 } : {}, ...t.family ? { family: t.family } : {}, ...t.more?.length ? { more: t.more } : {} };
    },
    async appEncrypt(r, t, n = "nip44") {
      return (await e.appEncrypt({ peerPublicKey: r, text: t, scheme: n })).text;
    },
    async appDecrypt(r, t, n = "nip44") {
      return (await e.appDecrypt({ peerPublicKey: r, text: t, scheme: n })).text;
    },
    async appDecryptEvent(r) {
      return (await e.appDecryptEvent({ event: r })).text;
    },
    async isSignerOnly() {
      return !!(await e.getSessionStatus()).signerOnly;
    },
    async keepSignerGrant(r) {
      return (await e.signerKeep(r)).kept;
    },
    async restoreSignerGrant(r, t) {
      const n = await e.signerRestore({ site: r, ...t ? { family: t } : {} });
      return !n.restored || !n.everydayPublicKey || typeof n.until != "number" ? null : (i = n.everydayPublicKey, {
        pubkey: i,
        until: n.until,
        ...n.name ? { name: n.name } : {},
        ...n.profile ? { profile: n.profile } : {},
        signed: n.signed ?? [],
        ...n.signedPass ? { signedPass: n.signedPass } : {},
        ...n.check ? { check: n.check } : {},
        ...n.family ? { family: n.family } : {},
        ...n.more?.length ? { more: n.more } : {},
        ...n.permissions ? { permissions: n.permissions, signedSensitive: n.signedSensitive ?? [] } : {}
      });
    },
    async touchSignerGrant(r, t, n, l) {
      await e.signerTouch({ site: r, signed: t, ...n ? { signedSensitive: n } : {}, ...l ? { signedPass: l } : {} });
    },
    async forgetSignerGrant(r) {
      await e.signerForget({ site: r });
    },
    async logout() {
      await e.logout(), i = null;
    },
    destroy() {
      e.terminate("BitLogin headless signer was destroyed."), i = null;
    }
  };
}
export {
  u as W,
  d as c
};
