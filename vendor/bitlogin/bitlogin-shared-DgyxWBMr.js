class o {
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
    const e = ["cryptoWorker", ".js"].join(""), n = new URL(e, import.meta.url);
    this.worker = new Worker(n, { type: "module" }), this.worker.addEventListener("message", (r) => {
      const t = r.data;
      if (!t || typeof t != "object") return;
      const i = t;
      if (i.notify === "nip46-auth-url" && typeof i.url == "string") {
        this.onNotification?.(i);
        return;
      }
      if (typeof t.id != "string") return;
      const s = this.pending.get(t.id);
      if (s)
        if (this.pending.delete(t.id), clearTimeout(s.timer), t.ok)
          s.resolve(t.result);
        else {
          const l = new Error(t.error);
          l.name = t.errorName ?? "Error", s.reject(l);
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
    const n = [...this.pending.values()];
    this.pending.clear();
    for (const a of n)
      clearTimeout(a.timer), a.reject(new Error(e));
  }
  call(e, n, a = 6e4) {
    if (this.dead)
      return Promise.reject(new Error(this.deadReason));
    const r = `${Date.now().toString(36)}-${(this.counter++).toString(36)}`;
    return new Promise((t, i) => {
      const s = setTimeout(() => {
        this.pending.delete(r), i(new Error(`BitLogin's ${e} call timed out.`));
      }, a);
      this.pending.set(r, { resolve: t, reject: i, timer: s });
      const l = { id: r, action: e, payload: n };
      this.worker.postMessage(l);
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
const u = "BitLogin: no session is unlocked. Call restore() first, or have the user sign in once via <bitlogin-auth>.";
async function p(c = {}) {
  const e = new o();
  await e.configure({
    vaultRelayUrls: c.vaultRelays ?? [],
    discoveryRelayUrls: c.discoveryRelays ?? []
  });
  let n = null;
  const a = async () => {
    if (n) return n;
    const r = await e.getSessionStatus();
    if (!r.unlocked || !r.everydayPublicKey) throw new Error(u);
    return n = r.everydayPublicKey, n;
  };
  return {
    async restore() {
      const r = await e.restoreSession();
      return n = r.restored && r.everydayPublicKey ? r.everydayPublicKey : null, n ? { pubkey: n } : null;
    },
    async isUnlocked() {
      if (n) return !0;
      const r = await e.getSessionStatus();
      return r.unlocked && r.everydayPublicKey && (n = r.everydayPublicKey), !!r.unlocked;
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
    async exportHandoff(r, t, i, s) {
      return await a(), e.handoffExport({ recipientPublicKey: r, ...t ? { app: t } : {}, ...i ? { site: i } : {}, ...s ? { remember: !0 } : {} });
    },
    async lockStatus() {
      return e.lockStatus();
    },
    async lockOpen(r) {
      const t = await e.lockOpen(r);
      return n = t.ok && t.everydayPublicKey ? t.everydayPublicKey : null, { ok: t.ok, left: t.left, removed: t.removed };
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
    async acceptHandoff(r) {
      const t = await e.handoffAccept(r);
      return n = t.everydayPublicKey, { pubkey: n, ...t.app ? { app: t.app } : {}, ...t.site ? { site: t.site } : {}, ...t.profile ? { profile: t.profile } : {}, ...t.remember ? { remember: !0 } : {} };
    },
    async appEncrypt(r, t, i = "nip44") {
      return (await e.appEncrypt({ peerPublicKey: r, text: t, scheme: i })).text;
    },
    async appDecrypt(r, t, i = "nip44") {
      return (await e.appDecrypt({ peerPublicKey: r, text: t, scheme: i })).text;
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
    async restoreSignerGrant(r) {
      const t = await e.signerRestore({ site: r });
      return !t.restored || !t.everydayPublicKey || typeof t.until != "number" ? null : (n = t.everydayPublicKey, {
        pubkey: n,
        until: t.until,
        ...t.name ? { name: t.name } : {},
        ...t.profile ? { profile: t.profile } : {},
        signed: t.signed ?? [],
        ...t.signedPass ? { signedPass: t.signedPass } : {},
        ...t.check ? { check: t.check } : {},
        ...t.permissions ? { permissions: t.permissions, signedSensitive: t.signedSensitive ?? [] } : {}
      });
    },
    async touchSignerGrant(r, t, i, s) {
      await e.signerTouch({ site: r, signed: t, ...i ? { signedSensitive: i } : {}, ...s ? { signedPass: s } : {} });
    },
    async forgetSignerGrant(r) {
      await e.signerForget({ site: r });
    },
    async logout() {
      await e.logout(), n = null;
    },
    destroy() {
      e.terminate("BitLogin headless signer was destroyed."), n = null;
    }
  };
}
export {
  o as W,
  p as c
};
