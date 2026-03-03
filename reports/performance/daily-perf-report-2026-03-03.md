js/docsView.js:385:    scrollSpyState.rafId = requestAnimationFrame(updateActiveFromScroll);
js/docsView.js:463:      typeof requestIdleCallback === "function"
js/docsView.js:464:        ? requestIdleCallback
js/docsView.js:465:        : (callback) => requestAnimationFrame(callback);
js/docsView.js:580:    typeof requestAnimationFrame === "function"
js/docsView.js:581:      ? requestAnimationFrame
js/docsView.js:582:      : (callback) => setTimeout(callback, 0);
js/dmDecryptor.js:456:    return await Promise.any(decryptors.map(attemptUnwrap));
js/viewCounter.js:75:  persistTimer = setTimeout(() => {
js/index.js:46:import AuthService from "./services/authService.js";
js/index.js:53:import { relayManager } from "./relayManager.js";
js/index.js:131:    relayManager,
js/index.js:139:    service.hydrateFromStorage();
js/index.js:200:  const authService = getLockdownAuthService();
js/index.js:201:  if (!authService || typeof authService.getActivePubkey !== "function") {
js/index.js:205:  const savedPubkey = authService.getActivePubkey();
js/index.js:216:    await authService.login(savedPubkey, { persistActive: false });
js/index.js:285:    const authService = getLockdownAuthService();
js/index.js:286:    const result = await authService.requestLogin({ allowAccountSelection: true });
js/index.js:373:    window.requestAnimationFrame(() => {
js/index.js:608:  await Promise.all([
js/index.js:807:      timeoutId = window.setTimeout(() => {
js/testHarness.js:15:import { relayManager } from "./relayManager.js";
js/testHarness.js:155:      setTimeout(check, SYNC_EVENT_POLL_INTERVAL_MS);
js/testHarness.js:211:        await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
js/testHarness.js:352:    if (relayManager && typeof relayManager.setEntries === "function") {
js/testHarness.js:355:      if (relayManager.defaultEntries) {
js/testHarness.js:356:        relayManager.defaultEntries = entries.map((e) => ({
js/testHarness.js:362:      relayManager.setEntries(
js/testHarness.js:369:    devLogger.warn("[testHarness] relayManager.setEntries failed:", error);
js/testHarness.js:423:  if (app && app.authService) {
js/testHarness.js:425:    await app.authService.login(pubkey, { persistActive: false });
js/testHarness.js:427:    devLogger.warn("[testHarness] App or authService not available during loginWithNsec");
js/testHarness.js:466:    relayManager: relayManager
js/testHarness.js:468:          all: relayManager.getAllRelayUrls?.() || [],
js/testHarness.js:469:          read: relayManager.getReadRelayUrls?.() || [],
js/testHarness.js:470:          write: relayManager.getWriteRelayUrls?.() || [],
js/testHarness.js:471:          lastLoadSource: relayManager.lastLoadSource || null,
js/testHarness.js:490:    hasMagnet: Boolean(card.getAttribute("data-play-magnet")),
js/testHarness.js:515:      requestAnimationFrame(check);
js/testHarness.js:541:      requestAnimationFrame(check);
js/testHarness.js:575:      requestAnimationFrame(check);
js/testHarness.js:705:  // Patch relayManager to respect test overrides during login/logout
js/testHarness.js:706:  if (relayManager) {
js/testHarness.js:707:    const originalLoadRelayList = relayManager.loadRelayList;
js/testHarness.js:708:    relayManager.loadRelayList = async function (pubkey) {
js/testHarness.js:727:    const originalReset = relayManager.reset;
js/testHarness.js:728:    relayManager.reset = function () {
js/magnetShared.js:10:const MAGNET_SCHEME = "magnet:";
js/magnetShared.js:201:  if (!/^magnet:/i.test(working)) {
js/app.js:6:import { torrentClient } from "./webtorrent.js";
js/app.js:17:import { extractBtihFromMagnet, safeDecodeMagnet } from "./magnetUtils.js";
js/app.js:35:import { relayManager } from "./relayManager.js";
js/app.js:85:  publishEventToRelays,
js/app.js:92:import { queueSignEvent } from "./nostr/signRequestQueue.js";
js/app.js:130:import { isValidMagnetUri } from "./utils/magnetValidators.js";
js/app.js:170:import TorrentStatusController from "./ui/torrentStatusController.js";
js/app.js:197:  "This magnet link is missing a compatible BitTorrent v1 info hash.";
js/app.js:214:    return this.authService.pubkey;
js/app.js:218:    this.authService.pubkey = value;
js/app.js:222:    return this.authService.currentUserNpub;
js/app.js:226:    this.authService.currentUserNpub = value;
js/app.js:238:    return this.authService.activeProfilePubkey;
js/app.js:242:    this.authService.setActiveProfilePubkey(value, { persist: false });
js/app.js:246:    return this.authService.savedProfiles;
js/app.js:250:    this.authService.setSavedProfiles(value, { persist: false, persistActive: false });
js/app.js:267:      torrentClient,
js/app.js:342:    this.torrentStatusIntervalId = null;
js/app.js:343:    this.torrentStatusNodes = null;
js/app.js:344:    this.torrentStatusVisibilityHandler = null;
js/app.js:345:    this.torrentStatusPageHideHandler = null;
js/app.js:351:    this.torrentStatusController = new TorrentStatusController({
js/app.js:606:        torrentClient,
js/app.js:642:        relayManager,
js/app.js:643:        torrentClient,
js/app.js:650:        publishEventToRelays,
js/app.js:652:        queueSignEvent,
js/app.js:655:        getActiveProfilePubkey: () => this.authService.activeProfilePubkey,
js/app.js:666:        torrentClient,
js/app.js:724:    const result = this.authService.loadSavedProfilesFromStorage();
js/app.js:730:    const updated = this.authService.syncSavedProfileFromCache(pubkey, {
js/app.js:740:    this.authService.loadProfileCacheFromStorage();
js/app.js:744:    this.authService.persistProfileCache();
js/app.js:748:    return this.authService.getProfileCacheEntry(pubkey);
js/app.js:752:    return this.authService.setProfileCacheEntry(pubkey, profile);
js/app.js:756:    this.authService.setActiveProfilePubkey(pubkey, { persist });
js/app.js:835:  _initServiceWorker() {
js/app.js:845:    this.authService.hydrateFromStorage();
js/app.js:911:    return Promise.all([
js/app.js:961:      setTimeout(() => {
js/app.js:967:    promises.push(Promise.race([aclRefreshPromise, timeoutPromise]));
js/app.js:982:    await Promise.all(promises);
js/app.js:1135:      const savedProfiles = this.authService.cloneSavedProfiles();
js/app.js:1150:        await this.authService.login(savedPubKey, loginOptions);
js/app.js:1179:    this._initServiceWorker();
js/app.js:1454:          this.authService?.requestLogin?.(options) ?? Promise.resolve(false),
js/app.js:1680:    return this.authService.requestLogin({
js/app.js:1768:          authService: this.authService,
js/app.js:2483:      await Promise.allSettled(refreshTasks);
js/app.js:2637:    return this.authService.loadOwnProfile(pubkey);
js/app.js:2641:    return this.authService.fetchAndRenderProfile(pubkey, forceRefresh);
js/app.js:2761:    const publishResults = await publishEventToRelays(
js/app.js:2840:    if (!nostrClient?.pool || typeof nostrClient.pool.list !== "function") {
js/app.js:2845:      const events = await nostrClient.pool.list(relayList, [
js/app.js:3089:        const publishResult = await this.authService.handleUploadSubmit(payload, {
js/app.js:3437:    await Promise.allSettled(tasks);
js/app.js:3455:    const taskResults = await Promise.allSettled([
js/app.js:3457:        .then(() => this.authService?.loadBlocksForPubkey?.(activePubkey, {
js/app.js:4245:   * Updates the modal to reflect current torrent stats.
js/app.js:4246:   * We remove the unused torrent.status references,
js/app.js:4247:   * and do not re-trigger recursion here (no setTimeout).
js/app.js:4249:  updateTorrentStatus(torrent) {
js/app.js:4250:    if (this.torrentStatusController) {
js/app.js:4251:      this.torrentStatusController.update(torrent);
js/app.js:4579:  async playViaWebTorrent(...args) {
js/app.js:4581:    return this._playback.playViaWebTorrent(...args);
js/app.js:4586:   * and falls back to WebTorrent when needed.
js/app.js:5032:   * Copies the current video's magnet link to the clipboard.
js/app.js:5035:    if (!this.currentVideo || !this.currentVideo.magnet) {
js/app.js:5039:        !this.currentVideo.torrentSupported
js/app.js:5045:      this.showError("No magnet link to copy.");
js/app.js:5049:      navigator.clipboard.writeText(this.currentVideo.magnet);
js/app.js:5052:      devLogger.error("Failed to copy magnet link:", err);
js/app.js:5053:      this.showError("Could not copy magnet link. Please copy it manually.");
js/nostr/commentEvents.js:13:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/commentEvents.js:302:    signedEvent = await queueSignEvent(signer, event, {
js/nostr/commentEvents.js:352:  if (!pool || typeof pool.list !== "function") {
js/nostr/commentEvents.js:366:  if (!pool || typeof pool.list !== "function") {
js/nostr/commentEvents.js:426:        const events = await pool.list([url], relayFilters);
js/nostr/videoEventBuffer.js:29:      document.addEventListener("visibilitychange", this.handleVisibilityChange);
js/nostr/videoEventBuffer.js:62:    this.flushTimerId = setTimeout(() => {
js/nostr/videoEventBuffer.js:151:      if (typeof document !== "undefined" && document.hidden) {
js/nostr/videoEventBuffer.js:178:    if (typeof document !== "undefined" && !document.hidden) {
js/nostr/videoEventBuffer.js:214:      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
js/nostr/nip04WorkerClient.js:49:function ensureWorker() {
js/nostr/nip04WorkerClient.js:59:    workerInstance = new Worker(new URL("./nip04Worker.js", import.meta.url), {
js/nostr/nip04WorkerClient.js:71:export function encryptNip04InWorker({
js/nostr/nip04WorkerClient.js:77:  const worker = ensureWorker();
js/nostr/nip04WorkerClient.js:95:    const timeoutId = setTimeout(() => {
js/nostr/nip04WorkerClient.js:101:    worker.postMessage({
js/nostr/adapters/nip07Adapter.js:31:        await new Promise((resolve) => setTimeout(resolve, delay));
js/nostr/dmDecryptWorker.js:12:  workerScope.postMessage(payload);
js/nostr/watchHistory.js:17:import { publishEventToRelays } from "../nostrPublish.js";
js/nostr/watchHistory.js:26:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/watchHistory.js:1079:    const timer = setTimeout(async () => {
js/nostr/watchHistory.js:1237:     const results = await Promise.all(
js/nostr/watchHistory.js:1418:        return queueSignEvent(activeSigner, event, {
js/nostr/watchHistory.js:1557:    const publishResults = await publishEventToRelays(
js/nostr/watchHistory.js:1941:      const results = await pool.list(readRelays, filters);
js/nostr/watchHistory.js:2004:        const results = await pool.list(readRelays, [
js/nostr/videoPublisher.js:116:        magnet: contentObject.magnet,
js/nostr/toolkit.js:539:  if (typeof pool.list !== "function") {
js/nostr/toolkit.js:540:    pool.list = async function legacyList(relays, filters, opts = {}) {
js/nostr/toolkit.js:586:        timer = setTimeout(() => {
js/nostr/toolkit.js:587:          devLogger.warn(`[toolkit] pool.list timed out after ${timeoutMs}ms.`);
js/nostr/managers/SignerManager.js:54:import { queueSignEvent } from "../signRequestQueue.js";
js/nostr/managers/SignerManager.js:543:          await new Promise((resolve) => setTimeout(resolve, 500));
js/nostr/managers/ConnectionManager.js:42:    timeoutId = setTimeout(() => {
js/nostr/managers/ConnectionManager.js:189:    const results = await Promise.all(
js/nostr/managers/ConnectionManager.js:194:            const timeout = setTimeout(() => {
js/nostr/managers/ConnectionManager.js:269:    this.relayReconnectTimer = setTimeout(async () => {
js/nostr/managers/ConnectionManager.js:863:    const activeResults = await Promise.all(
js/nostr/managers/PersistenceManager.js:13:  if (typeof requestIdleCallback === "function") {
js/nostr/managers/PersistenceManager.js:14:    return requestIdleCallback(callback, { timeout });
js/nostr/managers/PersistenceManager.js:16:  return setTimeout(callback, timeout);
js/nostr/managers/PersistenceManager.js:223:   * - Coordinates with `requestIdleCallback` to avoid blocking the main thread.
js/nostr/managers/PersistenceManager.js:249:    this.cachePersistTimerId = setTimeout(() => {
js/nostr/managers/EventsCacheStore.js:11:  if (typeof requestIdleCallback === "function") {
js/nostr/managers/EventsCacheStore.js:12:    return requestIdleCallback(callback, { timeout });
js/nostr/managers/EventsCacheStore.js:14:  return setTimeout(callback, timeout);
js/nostr/managers/EventsCacheStore.js:154:    const [events, tombstones] = await Promise.all([
js/nostr/managers/EventsCacheStore.js:221:    const [events, tombstones] = await Promise.all([
js/nostr/videoPayloadBuilder.js:2:import { infoHashFromMagnet } from "../magnets.js";
js/nostr/videoPayloadBuilder.js:56:    const rawMagnet = typeof videoData.magnet === "string" ? videoData.magnet : "";
js/nostr/videoPayloadBuilder.js:132:      magnet: finalMagnet,
js/nostr/videoPayloadBuilder.js:286:      magnet: finalMagnet,
js/nostr/videoPayloadBuilder.js:324:      : typeof baseEvent.magnet === "string"
js/nostr/videoPayloadBuilder.js:325:      ? baseEvent.magnet.trim()
js/nostr/videoPayloadBuilder.js:336:  // Use the new magnet if provided; otherwise, fall back to the decrypted old magnet
js/nostr/videoPayloadBuilder.js:337:  const magnetEdited = updatedData.magnetEdited === true;
js/nostr/videoPayloadBuilder.js:339:    typeof updatedData.magnet === "string" ? updatedData.magnet.trim() : "";
js/nostr/videoPayloadBuilder.js:340:  const finalMagnet = magnetEdited ? newMagnetValue : oldMagnet;
js/nostr/videoPayloadBuilder.js:414:    magnet: finalMagnet,
js/nostr/publishHelpers.js:3:  publishEventToRelays,
js/nostr/publishHelpers.js:27:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/publishHelpers.js:383:        signedEvent = await queueSignEvent(signer, event, {
js/nostr/publishHelpers.js:464:  const publishResults = await publishEventToRelays(
js/nostr/publishHelpers.js:1032:  let magnet = sanitize(options.magnet);
js/nostr/publishHelpers.js:1033:  if (!magnet && cachedVideo?.magnet) {
js/nostr/publishHelpers.js:1034:    magnet = sanitize(cachedVideo.magnet);
js/nostr/publishHelpers.js:1036:  if (!magnet && cachedVideo?.rawMagnet) {
js/nostr/publishHelpers.js:1037:    magnet = sanitize(cachedVideo.rawMagnet);
js/nostr/publishHelpers.js:1039:  if (!magnet && cachedVideo?.originalMagnet) {
js/nostr/publishHelpers.js:1040:    magnet = sanitize(cachedVideo.originalMagnet);
js/nostr/publishHelpers.js:1100:  if (!isPrivate && magnet) {
js/nostr/publishHelpers.js:1101:    tags.push(["magnet", magnet]);
js/nostr/publishHelpers.js:1331:  const publishResults = await publishEventToRelays(client?.pool, relays, rawEvent);
js/nostr/publishHelpers.js:1391:    magnet: "",
js/nostr/nip07Permissions.js:237:    timeoutId = setTimeout(() => {
js/nostr/nip07Permissions.js:254:  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
js/nostr/nip07Permissions.js:462:    const interval = setInterval(() => {
js/nostr/relayBatchFetcher.js:95:      : (r, f, timeout) => pool.list([r], [f], { timeout });
js/nostr/relayBatchFetcher.js:218:      const chunkResults = await Promise.all(promises);
js/nostr/viewEvents.js:16:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/viewEvents.js:357:  const canQueryPool = pool && typeof pool.list === "function";
js/nostr/viewEvents.js:394:    rawResults = await pool.list(relayList, filters);
js/nostr/viewEvents.js:641:    ? await Promise.race([listPromise, abortPromise])
js/nostr/viewEvents.js:811:        signedEvent = await queueSignEvent(signer, event, {
js/nostr/viewEvents.js:847:  const publishResults = await Promise.all(
js/nostr/nip71.js:17:import { extractBtihFromMagnet, extractMagnetHints } from "../magnetShared.js";
js/nostr/nip71.js:1424: * Handles parsing of `content` JSON, extraction of magnet links, info hashes,
js/nostr/nip71.js:1451:  const directMagnetRaw = safeTrim(parsedContent.magnet);
js/nostr/nip71.js:1461:    if (trimmed.toLowerCase().startsWith("magnet:?")) {
js/nostr/nip71.js:1467:  let magnet = normalizeMagnetCandidate(directMagnetRaw);
js/nostr/nip71.js:1468:  let rawMagnet = magnet ? directMagnetRaw : "";
js/nostr/nip71.js:1472:  if (!url && !magnet) {
js/nostr/nip71.js:1518:  if (!infoHash && magnet) {
js/nostr/nip71.js:1519:    const extracted = extractBtihFromMagnet(magnet);
js/nostr/nip71.js:1558:  const magnetHints = magnet
js/nostr/nip71.js:1559:    ? extractMagnetHints(magnet)
js/nostr/nip71.js:1561:  const ws = wsField || magnetHints.ws || "";
js/nostr/nip71.js:1562:  const xs = xsField || magnetHints.xs || "";
js/nostr/nip71.js:1578:    magnet,
js/nostr/nip46Connector.js:323:      const timeoutId = setTimeout(() => {
js/nostr/nip46Queue.js:49:        await new Promise((r) => setTimeout(r, waitMs));
js/nostr/dmDecryptWorkerClient.js:51:function ensureWorker() {
js/nostr/dmDecryptWorkerClient.js:61:    workerInstance = new Worker(
js/nostr/dmDecryptWorkerClient.js:80:export function getDmDecryptWorkerQueueSize() {
js/nostr/dmDecryptWorkerClient.js:84:export function decryptDmInWorker({
js/nostr/dmDecryptWorkerClient.js:92:  const worker = ensureWorker();
js/nostr/dmDecryptWorkerClient.js:112:    const timeoutId = setTimeout(() => {
js/nostr/dmDecryptWorkerClient.js:118:    worker.postMessage({
js/nostr/client.js:21:import { infoHashFromMagnet } from "../magnets.js";
js/nostr/client.js:106:  publishEventToRelays,
js/nostr/client.js:130:  decryptDmInWorker,
js/nostr/client.js:213:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/client.js:802:   * @param {function} [params.fetchFn] - Custom fetch function (mocks or specialized logic). Defaults to `pool.list`.
js/nostr/client.js:1285:            decryptDmInWorker({
js/nostr/client.js:1302:            decryptDmInWorker({
js/nostr/client.js:1443:      timeoutId = setTimeout(() => {
js/nostr/client.js:1977:        ciphertext = await encryptNip04InWorker({
js/nostr/client.js:2106:        const events = await this.pool.list(relayListCandidates, [
js/nostr/client.js:2441:   * - It includes both a WebTorrent `magnet` and a direct `url` (if hosted).
js/nostr/client.js:2452:   * @param {object} videoPayload - The normalized form data (title, magnet, thumbnail, etc.).
js/nostr/client.js:2494:   * 3. **Content Update**: The new payload (title, magnet, etc.) replaces the old content.
js/nostr/client.js:2709:            magnet: fetched.magnet,
js/nostr/client.js:2759:    const signedEvent = await queueSignEvent(signer, event);
js/nostr/client.js:2760:    const publishResults = await publishEventToRelays(
js/nostr/client.js:2895:    await Promise.all(
js/nostr/client.js:2914:          magnet: typeof vid.magnet === "string" ? vid.magnet : "",
js/nostr/client.js:2954:        cached.magnet = "";
js/nostr/client.js:3084:        const signedDelete = await queueSignEvent(signer, deleteEvent);
js/nostr/client.js:3085:        const publishResults = await publishEventToRelays(
js/nostr/client.js:3428:            const events = await this.pool.list([url], [filter]);
js/nostr/client.js:3574:    if (typeof this.pool.list === "function") {
js/nostr/client.js:3576:        const events = await this.pool.list(relays, [makeFilter()]);
js/nostr/client.js:3589:        devLogger.warn("fetchRawEventById pool.list error:", error);
js/nostr/client.js:3800:        const events = await this.pool.list(relays, [{ ids: Array.from(missingRoots) }]);
js/nostr/client.js:3822:        const events = await this.pool.list(relays, [filter]);
js/nostr/client.js:3946:              const events = await this.pool.list([url], [filter]);
js/nostr/nip46Client.js:29:  publishEventToRelays as defaultPublishEventToRelays,
js/nostr/nip46Client.js:1310:    publishEventToRelays = defaultPublishEventToRelays,
js/nostr/nip46Client.js:1326:    this.publishEventToRelays =
js/nostr/nip46Client.js:1327:      typeof publishEventToRelays === "function"
js/nostr/nip46Client.js:1328:        ? publishEventToRelays
js/nostr/nip46Client.js:1710:          const timeoutId = setTimeout(() => {
js/nostr/nip46Client.js:1739:          const publishResults = await this.publishEventToRelays(
js/nostr/nip46Client.js:1777:            await new Promise((r) => setTimeout(r, backoffMs));
js/nostr/signRequestQueue.js:88:    timeoutId = setTimeout(() => {
js/nostr/signRequestQueue.js:96:  return Promise.race([signPromise, timeoutPromise]).finally(() => {
js/nostr/signRequestQueue.js:108:export async function queueSignEvent(signer, event, options = {}) {
js/nostr/reactionEvents.js:11:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/reactionEvents.js:149:  if (!pool || typeof pool.list !== "function") {
js/nostr/reactionEvents.js:163:  if (!pool || typeof pool.list !== "function") {
js/nostr/reactionEvents.js:225:        const events = await pool.list([url], relayFilters);
js/nostr/reactionEvents.js:452:        signedEvent = await queueSignEvent(signer, event, {
js/nostr/nip04Worker.js:10:  workerScope.postMessage(payload);
js/nostr/dmSignalEvents.js:9:import { queueSignEvent } from "./signRequestQueue.js";
js/nostr/dmSignalEvents.js:128:    signedEvent = await queueSignEvent(signer, event, {
js/nostr/dmSignalEvents.js:271:    signedEvent = await queueSignEvent(signer, event, {
js/relayManager.js:11:  publishEventToRelays,
js/relayManager.js:619:        const timer = setTimeout(() => {
js/relayManager.js:634:          .then(() => nostrClient.pool.list([relayUrl], [filter]))
js/relayManager.js:679:    const background = Promise.allSettled([
js/relayManager.js:697:              `[relayManager] Relay ${reason.relay} timed out while loading relay list (${reason.timeoutMs}ms)`
js/relayManager.js:700: `[relayManager] Relay ${reason?.relay || "unknown"} failed while loading relay list:`,
js/relayManager.js:713:        devLogger.warn("[relayManager] Background relay refresh failed", error);
js/relayManager.js:719:        fastResult = await Promise.any(fastPromises);
js/relayManager.js:725:                `[relayManager] Relay ${err.relay} timed out while loading relay list (${err.timeoutMs}ms)`
js/relayManager.js:729:        } else devLogger.warn("[relayManager] Fast relay fetch failed", error);
js/relayManager.js:809:    const publishResults = await publishEventToRelays(
js/relayManager.js:866:export const relayManager = new RelayPreferencesManager();
js/payments/zapReceiptValidator.js:345:  if (!pool || typeof pool.list !== "function") {
js/payments/zapReceiptValidator.js:366:      events = await pool.list(relayUrls, filters);
js/payments/zapNotifications.js:231:    doc?.defaultView?.setTimeout ||
js/payments/zapNotifications.js:232:    (typeof setTimeout === "function" ? setTimeout : null);
js/payments/zapRequests.js:11:import { publishEventToRelays, assertAnyRelayAccepted } from "../nostrPublish.js";
js/payments/zapRequests.js:12:import { queueSignEvent } from "../nostr/signRequestQueue.js";
js/payments/zapRequests.js:108:  return queueSignEvent(signer, event, { timeoutMs });
js/payments/zapRequests.js:114:  const publishResults = await publishEventToRelays(pool, publishTargets, signedEvent);
js/payments/nwcClient.js:807:      timeoutId: setTimeout(() => {
js/payments/nwcClient.js:1323:  entry.timeoutId = setTimeout(() => {
js/payments/platformAddress.js:256:    const events = await pool.list(relayUrls, [
js/magnets.js:1:import { extractBtihFromMagnet, normalizeInfoHash } from "./magnetShared.js";
js/magnets.js:22:export function infoHashFromMagnet(magnet) {
js/magnets.js:23:  if (typeof magnet !== "string") {
js/magnets.js:26:  const extracted = extractBtihFromMagnet(magnet);
js/magnets.js:30:export function trackersFromMagnet(magnet) {
js/magnets.js:31:  if (typeof magnet !== "string") {
js/magnets.js:34:  const parsed = parseMagnetLite(magnet);
js/magnets.js:52:function parseMagnetLite(magnet) {
js/magnets.js:53:  if (typeof magnet !== "string") {
js/magnets.js:57:  const trimmed = magnet.trim();
js/gridHealth.js:2:import { infoHashFromMagnet } from "./magnets.js";
js/gridHealth.js:4:import { TorrentClient, torrentClient } from "./webtorrent.js";
js/gridHealth.js:113:      normalizedReason = "Invalid magnet";
js/gridHealth.js:120:    return "WebTorrent status unknown";
js/gridHealth.js:122:  return `WebTorrent • ${parts.join(" • ")}`;
js/gridHealth.js:177:function queueProbe(magnet, cacheKey, priority = 0, webSeeds = []) {
js/gridHealth.js:178:  if (!magnet) {
js/gridHealth.js:194:        torrentClient
js/gridHealth.js:195:          .probePeers(magnet, {
js/gridHealth.js:346:  const badge = card.querySelector(".torrent-health-badge");
js/gridHealth.js:354:  const classes = ["badge", "torrent-health-badge"];
js/gridHealth.js:363:      aria: "WebTorrent peers available",
js/gridHealth.js:369:      aria: "WebTorrent peers unavailable",
js/gridHealth.js:375:      aria: "Checking WebTorrent peers",
js/gridHealth.js:381:      aria: "WebTorrent status unknown",
js/gridHealth.js:395:  badge.textContent = `${iconPrefix}WebTorrent`;
js/gridHealth.js:437:  const magnet = card.dataset.magnet || "";
js/gridHealth.js:438:  if (!magnet) {
js/gridHealth.js:443:  const infoHash = infoHashFromMagnet(magnet);
js/gridHealth.js:474:  const probePromise = queueProbe(magnet, infoHash, priority, webSeeds);
js/gridHealth.js:525:    if (!card.dataset.magnet) {
js/utils/magnetValidators.js:1:// js/utils/magnetValidators.js
js/utils/magnetValidators.js:3:import { safeDecodeMagnet } from "../magnetUtils.js";
js/utils/magnetValidators.js:6: * Basic validation for BitTorrent magnet URIs.
js/utils/magnetValidators.js:8: * Returns `true` only when the value looks like a magnet link that WebTorrent
js/utils/magnetValidators.js:9: * understands (`magnet:` scheme with at least one `xt=urn:btih:<info-hash>`
js/utils/magnetValidators.js:14:export function isValidMagnetUri(magnet) {
js/utils/magnetValidators.js:15:  const trimmed = typeof magnet === "string" ? magnet.trim() : "";
js/utils/magnetValidators.js:29:    if (parsed.protocol.toLowerCase() !== "magnet:") {
js/utils/asyncUtils.js:59: * for each item, ensuring all items are processed (like Promise.allSettled).
js/utils/asyncUtils.js:93:    timeoutId = setTimeout(() => {
js/utils/serviceWorkerFallbackMessages.js:3:const BASE_STATUS_MESSAGE = "Streaming via WebTorrent";
js/utils/storage.js:5:const TORRENT_PROBE_STORAGE_PREFIX = "bitvid:torrentProbe:";
js/utils/storage.js:80:      `Failed to parse stored torrent probe for ${infoHash}:`,
js/utils/storage.js:100:    userLogger.warn(`Failed to persist torrent probe for ${infoHash}:`, err);
js/utils/storage.js:112:    userLogger.warn(`Failed to remove torrent probe for ${infoHash}:`, err);
js/utils/torrentHash.js:1:import WebTorrent from "../webtorrent.min.js";
js/utils/torrentHash.js:14:  const client = new WebTorrent({
js/utils/torrentHash.js:30:        (torrent) => {
js/utils/torrentHash.js:31:          const infoHash = torrent.infoHash;
js/utils/torrentHash.js:32:          const torrentFile = torrent.torrentFile || torrent.torrentFileBuffer || null;
js/utils/torrentHash.js:38:              resolve({ infoHash, torrentFile });
js/utils/torrentHash.js:47:        userLogger.error("WebTorrent client error during hashing:", err);
js/utils/torrentHash.js:59: * Calculates the torrent infoHash for a given file client-side.
js/reactionCounter.js:485:  if (!pool || typeof pool.list !== "function") {
js/reactionCounter.js:510:    events = await query.pool.list(query.relays, query.filters);
js/workers/exploreData.worker.js:141:    self.postMessage({ id, result });
js/workers/exploreData.worker.js:143:    self.postMessage({ id, error: error.message || String(error) });
js/channelProfile.js:3835:  await Promise.allSettled(pendingTasks);
js/channelProfile.js:4122:      typeof window.requestIdleCallback === "function"
js/channelProfile.js:4124:      window.requestIdleCallback(() => warmZapPopover(), { timeout: 250 });
js/channelProfile.js:4126:      setTimeout(() => {
js/channelProfile.js:4611:      : "This magnet link is missing a compatible BitTorrent v1 info hash.";
js/channelProfile.js:4633:      element?.closest("[data-play-url],[data-play-magnet]") || element;
js/channelProfile.js:4645:      target?.getAttribute?.("data-play-magnet") ??
js/channelProfile.js:4657:    const magnet = typeof rawMagnetValue === "string" ? rawMagnetValue : "";
js/channelProfile.js:4664:    return { videoId, url, magnet, video };
js/channelProfile.js:4682:          magnet: detail.magnet,
js/channelProfile.js:4691:            magnet: detail.magnet
js/channelProfile.js:4700:        app.playVideoWithFallback({ url: detail.url, magnet: detail.magnet })
js/channelProfile.js:4819:        isMagnetSupported: (magnet) => app?.isMagnetUriSupported?.(magnet),
js/channelProfile.js:5402:        const fallbackEvents = await nostrClient.pool.list(
js/channelProfile.js:5415:        (url) => nostrClient.pool.list([url], [filter]),
js/userBlocks.js:17:  publishEventToRelays,
js/userBlocks.js:22:import { relayManager } from "./relayManager.js";
js/userBlocks.js:829:    this.decryptRetryTimeoutId = setTimeout(() => {
js/userBlocks.js:960:    const readRelays = relayManager.getReadRelayUrls();
js/userBlocks.js:961:    const writeRelays = relayManager.getWriteRelayUrls();
js/userBlocks.js:1399:          // PERF: Try all decryption schemes in parallel via Promise.any().
js/userBlocks.js:1425:                const result = await Promise.any(attempts);
js/userBlocks.js:1466:          const decryptPromise = Promise.all([
js/userBlocks.js:1471:            setTimeout(
js/userBlocks.js:1484:          const [standardDecrypted, legacyDecrypted] = await Promise.race([
js/userBlocks.js:1650:      const legacyFetchPromise = Promise.all([
js/userBlocks.js:2333:    const publishResults = await publishEventToRelays(
js/subscriptions.js:14:import { relayManager } from "./relayManager.js";
js/subscriptions.js:23:  publishEventToRelays,
js/subscriptions.js:478:    this.decryptRetryTimeoutId = setTimeout(() => {
js/subscriptions.js:513:      const readRelays = relayManager.getReadRelayUrls();
js/subscriptions.js:593:      const fetchResults = await Promise.all(fetchPromises);
js/subscriptions.js:674:          setTimeout(
js/subscriptions.js:685:        decryptResult = await Promise.race([decryptPromise, timeoutPromise]);
js/subscriptions.js:944:      await Promise.race([
js/subscriptions.js:947:          timeoutId = setTimeout(
js/subscriptions.js:1245:    // PERF: Try all decryption schemes in parallel via Promise.any().
js/subscriptions.js:1266:        // Promise.any() from trying the remaining schemes.
js/subscriptions.js:1280:        const result = await Promise.any(attempts);
js/subscriptions.js:1519:    const publishResults = await publishEventToRelays(
js/subscriptions.js:2031:        "This magnet link is missing a compatible BitTorrent v1 info hash."
js/subscriptions.js:2073:        isMagnetSupported: (magnet) =>
js/subscriptions.js:2074:          app?.isMagnetUriSupported?.(magnet) ?? false,
js/subscriptions.js:2174:            magnet: detail.magnet
js/subscriptions.js:2185:        app?.playVideoWithFallback?.({ url: detail.url, magnet: detail.magnet })
js/subscriptions.js:2382:    await publishEventToRelays(
js/embedDiagnostics.js:14:        window.parent.postMessage({ __bitvid_debug: true, type, payload }, "*");
js/webtorrent.js:1://js/webtorrent.js
js/webtorrent.js:4: * js/webtorrent.js
js/webtorrent.js:6: * This module wraps the WebTorrent client and manages the Service Worker integration.
js/webtorrent.js:10: * - Singleton WebTorrent client: It ensures we reuse a single client instance to
js/webtorrent.js:13: *   because WebTorrent in the browser streams data via a Service Worker "proxy" that
js/webtorrent.js:21:import WebTorrent from "./webtorrent.min.js";
js/webtorrent.js:69:function appendProbeTrackers(magnetURI, trackers) {
js/webtorrent.js:70:  if (typeof magnetURI !== "string") {
js/webtorrent.js:71:    return { magnet: "", appended: false, hasProbeTrackers: false };
js/webtorrent.js:74:  const trimmedMagnet = magnetURI.trim();
js/webtorrent.js:76:    return { magnet: "", appended: false, hasProbeTrackers: false };
js/webtorrent.js:82:      magnet: trimmedMagnet,
js/webtorrent.js:124:      magnet: trimmedMagnet,
js/webtorrent.js:137:    magnet: finalMagnet,
js/webtorrent.js:164:    this.WebTorrentClass =
js/webtorrent.js:165:      typeof webTorrentClass === "function" ? webTorrentClass : WebTorrent;
js/webtorrent.js:185:      this.probeClient = new this.WebTorrentClass();
js/webtorrent.js:194:   * Helper to check if a magnet link has active peers without starting a full
js/webtorrent.js:198:    magnetURI,
js/webtorrent.js:201:    const magnet = typeof magnetURI === "string" ? magnetURI.trim() : "";
js/webtorrent.js:202:    if (!magnet) {
js/webtorrent.js:215:    const { magnet: augmentedMagnet, appended, hasProbeTrackers } =
js/webtorrent.js:216:      appendProbeTrackers(magnet, trackers);
js/webtorrent.js:218:    const hasMagnetWebSeed = magnet.includes("ws=") || magnet.includes("webSeed=");
js/webtorrent.js:248:    emit("torrent-probe-start", { magnet: augmentedMagnet });
js/webtorrent.js:252:      let torrent = null;
js/webtorrent.js:269:        if (torrent) {
js/webtorrent.js:271:            torrent.destroy({ destroyStore: true });
js/webtorrent.js:295:        emit("torrent-probe-result", result);
js/webtorrent.js:309:         * That was a mistake. WebTorrent counts a connected webseed as a peer.
js/webtorrent.js:320:        torrent = client.add(augmentedMagnet, addOptions);
js/webtorrent.js:332:        const peers = Math.max(1, Math.floor(normalizeNumber(torrent?.numPeers, 1)));
js/webtorrent.js:336:      torrent.once("wire", settleHealthy);
js/webtorrent.js:338:      torrent.once("error", (err) => {
js/webtorrent.js:339:        const peers = Math.max(0, Math.floor(normalizeNumber(torrent?.numPeers, 0)));
js/webtorrent.js:350:        timeoutId = setTimeout(() => {
js/webtorrent.js:351:          const peers = Math.max(0, Math.floor(normalizeNumber(torrent?.numPeers, 0)));
js/webtorrent.js:361:      pollId = setInterval(() => {
js/webtorrent.js:362:        if (!torrent || settled) {
js/webtorrent.js:365:        const peers = Math.max(0, Math.floor(normalizeNumber(torrent.numPeers, 0)));
js/webtorrent.js:396:   * Makes sure we have exactly one WebTorrent client instance and one SW registration.
js/webtorrent.js:401:      this.client = new this.WebTorrentClass();
js/webtorrent.js:417:        this.swRegistration = await this.setupServiceWorker();
js/webtorrent.js:434:        "[WebTorrent] Service worker setup failed; continuing without it:",
js/webtorrent.js:438:        "[WebTorrent] Service worker unavailable; falling back to direct streaming.",
js/webtorrent.js:454:      const timeout = setTimeout(() => {
js/webtorrent.js:478:        registration.waiting.postMessage({ type: "SKIP_WAITING" });
js/webtorrent.js:502:      this.log("[WebTorrent] Service worker lifecycle:", payload);
js/webtorrent.js:507:  async activateWaitingWorker(registration) {
js/webtorrent.js:522:    waitingWorker.postMessage({ type: "SKIP_WAITING" });
js/webtorrent.js:529:   * start WebTorrent streaming.
js/webtorrent.js:533:   * had finished installing but never claimed the page yet. WebTorrent's
js/webtorrent.js:557:      activeWorker.postMessage({ type: "ENSURE_CLIENTS_CLAIM" });
js/webtorrent.js:613:      timeoutId = setTimeout(() => {
js/webtorrent.js:618:      pollId = setInterval(() => {
js/webtorrent.js:638:  async setupServiceWorker() {
js/webtorrent.js:654:      // and WebTorrent fails to spin up, leaving playback broken until the
js/webtorrent.js:676:        await new Promise((resolve) => setTimeout(resolve, 1000));
js/webtorrent.js:693:          const timeout = setTimeout(() => {
js/webtorrent.js:711:      await this.activateWaitingWorker(registration);
js/webtorrent.js:716:      const readyRegistration = await Promise.race([
js/webtorrent.js:719:          setTimeout(
js/webtorrent.js:737:      // newly installed worker claims the page before WebTorrent spins up.
js/webtorrent.js:743:      await this.activateWaitingWorker(registration);
js/webtorrent.js:753:  attemptAutoplay(videoElement, context = "webtorrent") {
js/webtorrent.js:774:    torrent,
js/webtorrent.js:784:    // and deliberately mutate `torrent._opts` as a sanctioned WebTorrent workaround.
js/webtorrent.js:786:      torrent.on("warning", (err) => {
js/webtorrent.js:795:            if (torrent._opts?.urlList?.length) {
js/webtorrent.js:796:              torrent._opts.urlList = torrent._opts.urlList.filter((url) => {
js/webtorrent.js:799:              userLogger.warn("Cleaned up webseeds =>", torrent._opts.urlList);
js/webtorrent.js:801:            if (torrent._opts?.announce?.length) {
js/webtorrent.js:802:              torrent._opts.announce = torrent._opts.announce.filter((url) => {
js/webtorrent.js:805:              userLogger.warn("Cleaned up trackers =>", torrent._opts.announce);
js/webtorrent.js:812:    const file = torrent.files.find((f) => /\.(mp4|webm|mkv)$/i.test(f.name));
js/webtorrent.js:814:      return reject(new Error("No compatible video file found in torrent"));
js/webtorrent.js:842:      this.currentTorrent = torrent;
js/webtorrent.js:843:      resolve(torrent);
js/webtorrent.js:849:    torrent.on("error", (err) => {
js/webtorrent.js:889:      const timeoutId = setTimeout(() => {
js/webtorrent.js:924:   * Initiates streaming of a torrent magnet to a <video> element.
js/webtorrent.js:927:  async streamVideo(magnetURI, videoElement, opts = {}) {
js/webtorrent.js:929:      emit("torrent-stream-start", { magnet: magnetURI });
js/webtorrent.js:930:      // 1) Make sure we have a WebTorrent client and a valid SW registration.
js/webtorrent.js:940:          pathPrefix: location.origin + "/webtorrent",
js/webtorrent.js:943:        this.log("WebTorrent server created");
js/webtorrent.js:964:        // 3) Add the torrent to the client and handle accordingly.
js/webtorrent.js:966:          this.log("Starting torrent download (Firefox path)");
js/webtorrent.js:968:            magnetURI,
js/webtorrent.js:970:            (torrent) => {
js/webtorrent.js:971:              this.log("Torrent added (Firefox path):", torrent.name);
js/webtorrent.js:972:              this.handleTorrentStream(torrent, videoElement, resolve, reject, "firefox");
js/webtorrent.js:976:          this.log("Starting torrent download (Chrome path)");
js/webtorrent.js:977:          this.client.add(magnetURI, chromeOptions, (torrent) => {
js/webtorrent.js:978:            this.log("Torrent added (Chrome path):", torrent.name);
js/webtorrent.js:979:            this.handleTorrentStream(torrent, videoElement, resolve, reject, "chrome");
js/webtorrent.js:991:   * You might decide to keep the client alive if you want to reuse torrents.
js/webtorrent.js:999:            label: "current torrent",
js/webtorrent.js:1010:            label: "WebTorrent client",
js/webtorrent.js:1037:export const torrentClient = new TorrentClient();
js/videoEventUtils.js:7:const MAGNET_URI_PATTERN = /^magnet:\?/i;
js/historyView.js:1204:      return { url: "", magnet: "" };
js/historyView.js:1207:    const magnetRaw =
js/historyView.js:1208:      typeof video.magnet === "string"
js/historyView.js:1209:        ? video.magnet.trim()
js/historyView.js:1213:    return { url, magnet: magnetRaw };
js/historyView.js:1229:  if (playbackData.magnet) {
js/historyView.js:1230:    thumbnailLink.dataset.playMagnet = playbackData.magnet;
js/historyView.js:1265:  if (playbackData.magnet) {
js/historyView.js:1266:    titleLink.dataset.playMagnet = playbackData.magnet;
js/historyView.js:1378:      if (playbackData.magnet)
js/historyView.js:1379:        btn.dataset.playMagnet = playbackData.magnet;
js/historyView.js:2159:          const magnetAttr = trigger.dataset.playMagnet || "";
js/historyView.js:2171:            app.playVideoByEventId(videoId, { url, magnet: magnetAttr });
js/historyView.js:2178:              magnet: magnetAttr
js/webtorrent-global.js:1:import WebTorrent from "./webtorrent.min.js";
js/webtorrent-global.js:10:  typeof globalScope.WebTorrent !== "function" &&
js/webtorrent-global.js:11:  typeof WebTorrent === "function"
js/webtorrent-global.js:13:  globalScope.WebTorrent = WebTorrent;
js/feedEngine/watchHistoryFeed.js:406:      const events = await nostrClient.pool.list(mergedRelays, filters);
js/feedEngine/watchHistoryFeed.js:514:      const events = await nostrClient.pool.list(relays, [filter]);
js/feedEngine/stages.js:196:    return await Promise.any(promises);
js/playbackUtils.js:6:} from "./magnetUtils.js";
js/playbackUtils.js:9:const MAGNET_URI = /^magnet:\?/i;
js/playbackUtils.js:12: * Normalizes torrent related playback inputs into a canonical magnet payload.
js/playbackUtils.js:14: * The function first trims and safely decodes the incoming `magnet` string so
js/playbackUtils.js:15: * that URL encoded magnets become plain text before processing. Bare info hash
js/playbackUtils.js:17: * the `infoHash` field or a magnet that looks like one) it gets promoted to a
js/playbackUtils.js:18: * full magnet URI so downstream WebTorrent code can consume it directly.
js/playbackUtils.js:20: * When the normalized output differs from the original magnet input (for
js/playbackUtils.js:23: * that value if a later refactor breaks magnet normalization.
js/playbackUtils.js:26: * torrent-related input was supplied, while `usedInfoHash` is only `true` when
js/playbackUtils.js:27: * the normalized magnet was derived from an info hash instead of an already
js/playbackUtils.js:28: * well-formed magnet URI.
js/playbackUtils.js:36:  magnet = "",
js/playbackUtils.js:42:  const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
js/playbackUtils.js:44:  const magnetCandidate = decodedMagnet || trimmedMagnet;
js/playbackUtils.js:49:  const magnetIsUri = MAGNET_URI.test(magnetCandidate);
js/playbackUtils.js:50:  const magnetLooksLikeInfoHash = HEX_INFO_HASH.test(magnetCandidate);
js/playbackUtils.js:51:  const resolvedInfoHash = trimmedInfoHash || (magnetLooksLikeInfoHash
js/playbackUtils.js:52:    ? magnetCandidate.toLowerCase()
js/playbackUtils.js:55:  const normalizationInput = magnetIsUri ? magnetCandidate : resolvedInfoHash;
js/playbackUtils.js:57:  const decodeChanged = magnetCandidate !== trimmedMagnet;
js/playbackUtils.js:61:      magnet: "",
js/playbackUtils.js:77:  let normalizedMagnet = normalization.magnet;
js/playbackUtils.js:79:    if (magnetIsUri) {
js/playbackUtils.js:82:      normalizedMagnet = `magnet:?xt=urn:btih:${resolvedInfoHash}`;
js/playbackUtils.js:88:  const usedInfoHash = !magnetIsUri && Boolean(resolvedInfoHash);
js/playbackUtils.js:89:  const fallbackMagnet = magnetIsUri && normalization.didChange
js/playbackUtils.js:94:    magnet: normalizedMagnet,
js/state/profileCache.js:21:  if (typeof requestIdleCallback !== "undefined") {
js/state/profileCache.js:22:    requestIdleCallback(callback);
js/state/profileCache.js:24:    setTimeout(callback, 1);
js/adminListStore.js:566:    setTimeout(() => {
js/adminListStore.js:573:      events = await Promise.race([
js/adminListStore.js:590:      events = await Promise.race([
js/adminListStore.js:591:        nostrClient.pool.list(relays, [normalizedFilter]),
js/adminListStore.js:640:  const [editors, whitelist, blacklist] = await Promise.all([
js/adminListStore.js:686:  const results = await Promise.all(
js/adminListStore.js:835:    return Promise.any(acceptancePromises).catch((aggregateError) => {
js/adminListStore.js:841:  const allResults = Promise.allSettled(relayPromises).then((entries) => {
js/nostrEventSchemas.js:316:        { key: "magnet", type: "string", required: false },
js/embed.js:38:            window.parent.postMessage(
js/embed.js:112:  if (normalized === "url" || normalized === "torrent") {
js/embed.js:274:        const events = await pool.list(relayList, [filter]);
js/embed.js:282:        devLogger.warn("[embed] Failed to fetch naddr via pool.list:", error);
js/embed.js:379:    app.authService?.hydrateFromStorage?.();
js/embed.js:411:  const magnet = typeof video.magnet === "string" ? video.magnet.trim() : "";
js/embed.js:413:  if (!url && !magnet) {
js/embed.js:425:      magnet,
js/search/searchFilterMatchers.js:55:    if (hasMagnet && !video.magnet) return false;
js/search/searchFilters.js:243:        if (normalizedValue === "magnet") {
js/search/searchFilters.js:248:          errors.push({ token, message: "Has filter supports magnet or url." });
js/search/searchFilters.js:319:    tokens.push("has:magnet");
js/nostrPublish.js:79:    const timeoutId = setTimeout(() => {
js/nostrPublish.js:157:export function publishEventToRelays(pool, urls, event, options = {}) {
js/nostrPublish.js:169:    return Promise.all(promises);
js/ui/loginModalController.js:227:      authService:
js/ui/loginModalController.js:228:        services.authService && typeof services.authService === "object"
js/ui/loginModalController.js:229:          ? services.authService
js/ui/loginModalController.js:325:      document.addEventListener("visibilitychange", this.handleVisibility);
js/ui/loginModalController.js:338:    if (document.hidden) {
js/ui/loginModalController.js:389:      typeof this.window.setInterval !== "function"
js/ui/loginModalController.js:395:    this.modalCloseIntervalId = this.window.setInterval(handleClose, 500);
js/ui/loginModalController.js:537:      typeof this.window.setInterval === "function" &&
js/ui/loginModalController.js:540:      const timerId = this.window.setInterval(() => {
js/ui/loginModalController.js:714:    const service = this.services?.authService;
js/ui/loginModalController.js:1562:            setTimeout(() => {
js/ui/loginModalController.js:1609:      if (this.window && typeof this.window.setTimeout === "function") {
js/ui/loginModalController.js:1610:        this.nip46AutoStartTimer = this.window.setTimeout(autoStart, 0);
js/ui/loginModalController.js:1788:          const accessControl = this.services?.authService?.accessControl;
js/ui/loginModalController.js:2211:    if (!this.window || typeof this.window.setTimeout !== "function") {
js/ui/loginModalController.js:2215:    const timerId = this.window.setTimeout(() => {
js/ui/loginModalController.js:2267:    if (!this.services.authService) {
js/ui/loginModalController.js:2364:          await this.services.authService.requestLogin(requestOptions);
js/ui/loginModalController.js:2509:      document.removeEventListener("visibilitychange", this.handleVisibility);
js/ui/engagementController.js:208:      typeof dataset.magnet === "string" && dataset.magnet.trim()
js/ui/engagementController.js:209:        ? dataset.magnet.trim()
js/ui/engagementController.js:213:        ? currentVideo?.magnet || currentVideo?.originalMagnet || ""
js/ui/engagementController.js:215:    const magnet = rawMagnet || fallbackMagnet;
js/ui/engagementController.js:251:      magnet,
js/ui/engagementController.js:382:          typeof window.setTimeout === "function"
js/ui/engagementController.js:384:          window.setTimeout(() => {
js/ui/views/VideoListView.js:407:      magnet: typeof video?.magnet === "string" ? video.magnet : "",
js/ui/views/VideoListView.js:1067:    const target = element?.closest("[data-play-url],[data-play-magnet]") || element;
js/ui/views/VideoListView.js:1076:        : null) ?? target?.getAttribute?.("data-play-magnet") ?? "";
js/ui/views/VideoListView.js:1091:    const magnet = typeof rawMagnetValue === "string" ? rawMagnetValue : "";
js/ui/views/VideoListView.js:1103:    return { videoId, url, magnet, infoJsonUrl, video, trigger: element };
js/ui/views/VideoListView.js:1326:    const trigger = target.closest("[data-play-magnet],[data-play-url]");
js/ui/appChromeController.js:319:      this.document.addEventListener("visibilitychange", this.handleVisibilityChange);
js/ui/appChromeController.js:356:      .then(() => this.callbacks.flushWatchHistory("session-end", "visibilitychange"))
js/ui/appChromeController.js:359:          this.logger.warn("[visibilitychange] Watch history flush failed:", error);
js/ui/initUploadModal.js:15:    authService = null,
js/ui/initUploadModal.js:40:      authService,
js/ui/applicationBootstrap.js:10:import AuthService from "../services/authService.js";
js/ui/applicationBootstrap.js:27:import { relayManager } from "../relayManager.js";
js/ui/applicationBootstrap.js:66:import { isValidMagnetUri } from "../utils/magnetValidators.js";
js/ui/applicationBootstrap.js:67:import { torrentClient } from "../webtorrent.js";
js/ui/applicationBootstrap.js:138:    app.relayManager = relayManager;
js/ui/applicationBootstrap.js:316:      torrentClient: this.services.torrentClient || torrentClient,
js/ui/applicationBootstrap.js:327:        torrentClient: playbackDependencies.torrentClient,
js/ui/applicationBootstrap.js:334:            const magnetProvided = detail?.magnetProvided ? "true" : "false";
js/ui/applicationBootstrap.js:335:            const magnetUsable = detail?.magnetUsable ? "true" : "false";
js/ui/applicationBootstrap.js:337:              `[playVideoWithFallback] Session start urlProvided=${urlProvided} magnetProvided=${magnetProvided} magnetUsable=${magnetUsable}`,
js/ui/applicationBootstrap.js:343:                `[playVideoWithFallback] Falling back to WebTorrent (${detail.reason}).`,
js/ui/applicationBootstrap.js:361:    app.authService =
js/ui/applicationBootstrap.js:362:      this.services.authService ||
js/ui/applicationBootstrap.js:366:        relayManager,
js/ui/applicationBootstrap.js:373:      app.authService.on("auth:login", (detail) => {
js/ui/applicationBootstrap.js:383:      app.authService.on("auth:logout", (detail) => {
js/ui/applicationBootstrap.js:407:      app.authService.on("profile:updated", (detail) => {
js/ui/applicationBootstrap.js:419:      app.authService.on("blocksLoaded", (detail) => {
js/ui/applicationBootstrap.js:431:      app.authService.on("relaysLoaded", (detail) => {
js/ui/applicationBootstrap.js:482:          relayManager,
js/ui/applicationBootstrap.js:496:          switchProfile: (pubkey) => app.authService.switchProfile(pubkey),
js/ui/applicationBootstrap.js:498:            app.authService.removeSavedProfile(pubkey),
js/ui/applicationBootstrap.js:499:          relayManager,
js/ui/applicationBootstrap.js:530:          authService: app.authService,
js/ui/applicationBootstrap.js:899:          if (this.window && typeof this.window.setTimeout === "function") {
js/ui/applicationBootstrap.js:900:            this.window.setTimeout(() => {
js/ui/applicationBootstrap.js:911:    const magnetValidator = playbackDependencies.isValidMagnetUri;
js/ui/applicationBootstrap.js:927:        isMagnetSupported: (magnet) => magnetValidator(magnet),
js/ui/applicationBootstrap.js:1006:      magnet,
js/ui/applicationBootstrap.js:1014:          app.playVideoByEventId(videoId, { url, magnet, trigger }),
js/ui/applicationBootstrap.js:1021:        app.playVideoWithFallback({ url, magnet, trigger }),
js/ui/shareNostrController.js:4:  publishEventToRelays as defaultPublishEventToRelays,
js/ui/shareNostrController.js:10:import { queueSignEvent as defaultQueueSignEvent } from "../nostr/signRequestQueue.js";
js/ui/shareNostrController.js:22:      publishEventToRelays: services.publishEventToRelays || defaultPublishEventToRelays,
js/ui/shareNostrController.js:25:      queueSignEvent: services.queueSignEvent || defaultQueueSignEvent,
js/ui/shareNostrController.js:176:      signedEvent = await this.services.queueSignEvent(signer, event);
js/ui/shareNostrController.js:183:    const publishResults = await this.services.publishEventToRelays(
js/ui/torrentStatusController.js:23:  update(torrent) {
js/ui/torrentStatusController.js:24:    if (!torrent) {
js/ui/torrentStatusController.js:34:        progress: torrent.progress,
js/ui/torrentStatusController.js:35:        numPeers: torrent.numPeers,
js/ui/torrentStatusController.js:36:        downloadSpeed: torrent.downloadSpeed,
js/ui/torrentStatusController.js:37:        downloaded: torrent.downloaded,
js/ui/torrentStatusController.js:38:        length: torrent.length,
js/ui/torrentStatusController.js:39:        ready: torrent.ready,
js/ui/torrentStatusController.js:43:    if (torrent.ready || (typeof torrent.progress === "number" && torrent.progress > 0)) {
js/ui/torrentStatusController.js:44:      // Belt-and-suspenders: if WebTorrent reports progress but the DOM events
js/ui/torrentStatusController.js:48:        torrent.ready ? "torrent-ready-flag" : "torrent-progress"
js/ui/torrentStatusController.js:56:      const fullyDownloaded = Number(torrent.progress) >= 1;
js/ui/torrentStatusController.js:57:      const status = torrent.ready
js/ui/torrentStatusController.js:68:      const progressValue = Number.isFinite(torrent.progress)
js/ui/torrentStatusController.js:69:        ? `${(torrent.progress * 100).toFixed(2)}%`
js/ui/torrentStatusController.js:77:      const peersValue = `Peers: ${Number.isFinite(torrent.numPeers) ? torrent.numPeers : 0}`;
js/ui/torrentStatusController.js:84:      const speedValue = Number.isFinite(torrent.downloadSpeed)
js/ui/torrentStatusController.js:85:        ? `${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s`
js/ui/torrentStatusController.js:93:      const downloadedMb = Number.isFinite(torrent.downloaded)
js/ui/torrentStatusController.js:94:        ? (torrent.downloaded / (1024 * 1024)).toFixed(2)
js/ui/torrentStatusController.js:96:      const lengthMb = Number.isFinite(torrent.length)
js/ui/torrentStatusController.js:97:        ? (torrent.length / (1024 * 1024)).toFixed(2)
js/ui/components/SearchFilterModal.js:305:      if (type === "magnet") isActive = safeFilters.hasMagnet === true;
js/ui/components/SearchFilterModal.js:403:    if (btn.dataset.has === "magnet") filters.hasMagnet = true;
js/ui/components/hashtagStripHelper.js:231:      typeof this.window.requestAnimationFrame === "function" &&
js/ui/components/hashtagStripHelper.js:234:      this.window.requestAnimationFrame(() => {
js/ui/components/hashtagStripHelper.js:240:          if (this.window && typeof this.window.setTimeout === "function") {
js/ui/components/hashtagStripHelper.js:241:            this.window.setTimeout(() => {
js/ui/components/hashtagStripHelper.js:248:              this.window.setTimeout(() => {
js/ui/components/hashtagStripHelper.js:332:      if (typeof this.window.requestAnimationFrame === "function") {
js/ui/components/hashtagStripHelper.js:333:        const frameId = this.window.requestAnimationFrame(() => {
js/ui/components/hashtagStripHelper.js:344:        const timeoutId = this.window.setTimeout(() => {
js/ui/components/EventDetailsModal.js:374:        magnet: video.magnet,
js/ui/components/RevertModal.js:608:    const magnet =
js/ui/components/RevertModal.js:609:      typeof version.magnet === "string" ? version.magnet.trim() : "";
js/ui/components/RevertModal.js:612:    const displayMagnet = magnet || rawMagnet;
js/ui/components/VideoModal.js:1455:    this.updateSourceToggleState(visible ? "torrent" : "url");
js/ui/components/VideoModal.js:2973:    const magnetCandidate = (() => {
js/ui/components/VideoModal.js:2974:      if (typeof currentVideo?.magnet === "string" && currentVideo.magnet) {
js/ui/components/VideoModal.js:2975:        return currentVideo.magnet;
js/ui/components/VideoModal.js:2989:    this.modalMoreMenuContext.playbackMagnet = magnetCandidate;
js/ui/components/VideoModal.js:3320:          hasMagnet: Boolean(this.modalMoreMenuContext.playbackMagnet), // Re-use magnet from context
js/ui/components/EmbedVideoModal.js:179:    const hasMagnet = isNonEmptyString(this.activeVideo.magnet);
js/ui/components/EmbedVideoModal.js:204:      return "torrent";
js/ui/components/videoMenuRenderers.js:226:        magnet: playbackMagnet || "",
js/ui/components/videoMenuRenderers.js:351:  const magnetBtn = appendMenuAction(doc, list, {
js/ui/components/videoMenuRenderers.js:353:    action: "copy-magnet",
js/ui/components/videoMenuRenderers.js:357:    magnetBtn.disabled = true;
js/ui/components/videoMenuRenderers.js:358:    magnetBtn.classList.add("opacity-50", "cursor-not-allowed");
js/ui/components/videoMenuRenderers.js:359:    magnetBtn.title = "No magnet link available";
js/ui/components/EmbedPlayerModal.js:53:    // no-op for embed view (torrent stats)
js/ui/components/EmbedPlayerModal.js:96:    this.root.dataset.torrentStats = isVisible ? "true" : "false";
js/ui/components/ShareNostrModal.js:4:import { relayManager } from "../../relayManager.js";
js/ui/components/ShareNostrModal.js:248:      relayManager && typeof relayManager.getWriteRelayUrls === "function"
js/ui/components/ShareNostrModal.js:249:        ? relayManager.getWriteRelayUrls()
js/ui/components/VideoCard.js:170:    this.torrentHealthBadgeEl = null;
js/ui/components/VideoCard.js:179:      typeof video.magnet === "string" ? video.magnet.trim() : "";
js/ui/components/VideoCard.js:183:      magnet: rawMagnet,
js/ui/components/VideoCard.js:187:    this.playbackMagnet = playbackConfig.magnet;
js/ui/components/VideoCard.js:190:    this.magnetProvided = playbackConfig.provided;
js/ui/components/VideoCard.js:191:    this.magnetSupported = this.helpers.isMagnetSupported
js/ui/components/VideoCard.js:195:      !this.playbackUrl && this.magnetProvided && !this.magnetSupported;
js/ui/components/VideoCard.js:290:    return this.torrentHealthBadgeEl;
js/ui/components/VideoCard.js:517:          "WebTorrent fallback unavailable (magnet missing btih info hash)"
js/ui/components/VideoCard.js:519:      warning.dataset.torrentStatus = "unsupported";
js/ui/components/VideoCard.js:1142:    if (!isCompact && this.magnetSupported && this.magnetProvided) {
js/ui/components/VideoCard.js:1144:        classNames: ["badge", "torrent-health-badge"]
js/ui/components/VideoCard.js:1152:      this.torrentHealthBadgeEl = badge;
js/ui/components/VideoCard.js:2254:        normalizedReason = "Invalid magnet";
js/ui/components/VideoCard.js:2261:      return "WebTorrent status unknown";
js/ui/components/VideoCard.js:2263:    return `WebTorrent • ${parts.join(" • ")}`;
js/ui/components/VideoCard.js:2339:    badge.className = ["badge", "torrent-health-badge"].join(" ");
js/ui/components/VideoCard.js:2344:        aria: "WebTorrent peers available",
js/ui/components/VideoCard.js:2350:        aria: "WebTorrent peers unavailable",
js/ui/components/VideoCard.js:2356:        aria: "Checking WebTorrent peers",
js/ui/components/VideoCard.js:2362:        aria: "WebTorrent status unknown",
js/ui/components/VideoCard.js:2375:    const computedText = `${iconPrefix}WebTorrent`;
js/ui/components/VideoCard.js:2653:    if (this.magnetProvided && this.magnetSupported) {
js/ui/components/VideoCard.js:2674:      this.root.dataset.streamHealthReason = this.magnetProvided
js/ui/components/VideoCard.js:2682:    if (this.magnetProvided) {
js/ui/components/VideoCard.js:2683:      this.root.dataset.magnet = this.playbackMagnet;
js/ui/components/VideoCard.js:2685:      delete this.root.dataset.magnet;
js/ui/components/VideoCard.js:2689:      this.root.dataset.torrentSupported = "false";
js/ui/components/VideoCard.js:2690:    } else if (this.magnetProvided && this.magnetSupported) {
js/ui/components/VideoCard.js:2691:      this.root.dataset.torrentSupported = "true";
js/ui/components/VideoCard.js:2719:      if (this.magnetProvided) {
js/ui/components/VideoCard.js:2720:        el.dataset.torrentSupported = this.magnetSupported ? "true" : "false";
js/ui/components/VideoCard.js:2721:      } else if (el.dataset.torrentSupported) {
js/ui/components/VideoCard.js:2722:        delete el.dataset.torrentSupported;
js/ui/components/revertModalRenderers.js:575:  const magnet = typeof version.magnet === "string" ? version.magnet.trim() : "";
js/ui/components/revertModalRenderers.js:577:  const displayMagnet = magnet || rawMagnet;
js/ui/components/revertModalRenderers.js:580:  const magnetNode = displayMagnet
js/ui/components/revertModalRenderers.js:689:  headerDl.appendChild(createDtDd("Magnet", magnetNode));
js/ui/components/video-modal/commentNodeFactory.js:246:    if (!this.window || typeof this.window.setTimeout !== "function") {
js/ui/components/video-modal/commentNodeFactory.js:254:    const nextId = this.window.setTimeout(() => {
js/ui/components/UploadModal.js:12:} from "../../utils/torrentHash.js";
js/ui/components/UploadModal.js:40:    authService,
js/ui/components/UploadModal.js:55:    this.authService = authService || null;
js/ui/components/UploadModal.js:106:    this.torrentState = {
js/ui/components/UploadModal.js:109:        magnet: '',
js/ui/components/UploadModal.js:110:        url: '', // xs (torrent file url)
js/ui/components/UploadModal.js:233:        magnet: $("#input-magnet"),
js/ui/components/UploadModal.js:250:        magnet: $("#result-magnet"),
js/ui/components/UploadModal.js:251:        torrentUrl: $("#result-torrent-url"),
js/ui/components/UploadModal.js:368:        if (this.videoUploadState.url || this.torrentState.magnet) {
js/ui/components/UploadModal.js:509:      this.torrentState = {
js/ui/components/UploadModal.js:512:          magnet: '',
js/ui/components/UploadModal.js:521:      if (this.results.magnet) this.results.magnet.value = "Pending...";
js/ui/components/UploadModal.js:522:      if (this.results.torrentUrl) this.results.torrentUrl.value = "Pending...";
js/ui/components/UploadModal.js:596:          const torrentPromise = this.generateTorrentMetadata({ file, videoPublicUrl });
js/ui/components/UploadModal.js:598:          const [uploadResult, torrentResult] = await Promise.all([uploadPromise, torrentPromise]);
js/ui/components/UploadModal.js:621:          // 5. Handle Torrent Result & Upload .torrent file
js/ui/components/UploadModal.js:622:          if (torrentResult.hasValidInfoHash && torrentResult.torrentFile) {
js/ui/components/UploadModal.js:624:              const torrentKey = (baseKey && baseKey !== videoKey) ? `${baseKey}.torrent` : `${videoKey}.torrent`;
js/ui/components/UploadModal.js:626:              let torrentPublicUrl = "";
js/ui/components/UploadModal.js:628:                   torrentPublicUrl = buildPublicUrl(baseDomain, torrentKey);
js/ui/components/UploadModal.js:630:                   torrentPublicUrl = buildS3ObjectUrl({ publicBaseUrl: baseDomain, key: torrentKey });
js/ui/components/UploadModal.js:633:              this.updateVideoProgress(1, "Uploading torrent metadata...");
js/ui/components/UploadModal.js:645:                  file: torrentResult.torrentFile,
js/ui/components/UploadModal.js:647:                  key: torrentKey,
js/ui/components/UploadModal.js:660:              this.torrentState.status = 'complete';
js/ui/components/UploadModal.js:661:              this.torrentState.infoHash = torrentResult.infoHash;
js/ui/components/UploadModal.js:662:              this.torrentState.url = torrentPublicUrl;
js/ui/components/UploadModal.js:663:              this.torrentState.file = torrentResult.torrentFile;
js/ui/components/UploadModal.js:668:              const encodedXs = encodeURIComponent(torrentPublicUrl);
js/ui/components/UploadModal.js:669:              const magnet = `magnet:?xt=urn:btih:${torrentResult.infoHash}&dn=${encodedDn}&ws=${encodedWs}&xs=${encodedXs}`;
js/ui/components/UploadModal.js:671:              this.torrentState.magnet = magnet;
js/ui/components/UploadModal.js:673:              if (this.results.magnet) this.results.magnet.value = magnet;
js/ui/components/UploadModal.js:674:              if (this.results.torrentUrl) this.results.torrentUrl.value = torrentPublicUrl;
js/ui/components/UploadModal.js:678:              this.torrentState.status = 'skipped'; // Failed hash or invalid
js/ui/components/UploadModal.js:679:              this.updateVideoProgress(1, "Upload complete (No torrent fallback).");
js/ui/components/UploadModal.js:680:              if (this.results.magnet) this.results.magnet.value = "Not available (Info Hash failed)";
js/ui/components/UploadModal.js:681:              if (this.results.torrentUrl) this.results.torrentUrl.value = "Not available";
js/ui/components/UploadModal.js:697:          if (this.results.magnet) this.results.magnet.value = "Upload Failed";
js/ui/components/UploadModal.js:698:          if (this.results.torrentUrl) this.results.torrentUrl.value = "Upload Failed";
js/ui/components/UploadModal.js:790:          setTimeout(() => {
js/ui/components/UploadModal.js:933:      // We need a signer. Try active signer or authService
js/ui/components/UploadModal.js:935:      if (!signer && this.authService?.signer) {
js/ui/components/UploadModal.js:936:          signer = this.authService.signer;
js/ui/components/UploadModal.js:1051:          magnet: "",
js/ui/components/UploadModal.js:1055:          infoHash: this.torrentState.infoHash || "",
js/ui/components/UploadModal.js:1068:             metadata.magnet = this.torrentState.magnet || "";
js/ui/components/UploadModal.js:1077:             metadata.xs = this.torrentState.url || "";
js/ui/components/UploadModal.js:1084:                 x: this.torrentState.infoHash || "",
js/ui/components/UploadModal.js:1106:      let torrentFile = null;
js/ui/components/UploadModal.js:1110:          const torrentMetadata = await createTorrentMetadata(file, urlList);
js/ui/components/UploadModal.js:1112:          infoHash = torrentMetadata?.infoHash || "";
js/ui/components/UploadModal.js:1113:          if (torrentMetadata?.torrentFile) {
js/ui/components/UploadModal.js:1115:              torrentFile = new File([torrentMetadata.torrentFile], `${baseName}.torrent`, {
js/ui/components/UploadModal.js:1116:                  type: "application/x-bittorrent",
js/ui/components/UploadModal.js:1128:          torrentFile,
js/ui/components/UploadModal.js:1148:      metadata.magnet = this.inputs.magnet?.value?.trim() || "";
js/ui/components/UploadModal.js:1153:      const hasMagnet = metadata.magnet.length > 0;
js/ui/components/UploadModal.js:1211:    this.torrentState = {
js/ui/components/UploadModal.js:1214:      magnet: '',
js/ui/components/UploadModal.js:1215:      url: '', // xs (torrent file url)
js/ui/components/UploadModal.js:1232:    if (this.results?.magnet) this.results.magnet.value = "";
js/ui/components/UploadModal.js:1233:    if (this.results?.torrentUrl) this.results.torrentUrl.value = "";
js/ui/components/EditModal.js:1:import { extractMagnetHints } from "../../magnetShared.js";
js/ui/components/EditModal.js:2:import { normalizeAndAugmentMagnet } from "../../magnetUtils.js";
js/ui/components/EditModal.js:39:      magnet:
js/ui/components/EditModal.js:40:        typeof sanitizers.magnet === "function"
js/ui/components/EditModal.js:41:          ? sanitizers.magnet
js/ui/components/EditModal.js:168:      magnet: context.querySelector("#editVideoMagnet") || null,
js/ui/components/EditModal.js:414:    const magnetSource = video.magnet || video.rawMagnet || "";
js/ui/components/EditModal.js:415:    const magnetHints = extractMagnetHints(magnetSource);
js/ui/components/EditModal.js:416:    const effectiveWs = video.ws || magnetHints.ws || "";
js/ui/components/EditModal.js:417:    const effectiveXs = video.xs || magnetHints.xs || "";
js/ui/components/EditModal.js:489:        window.requestAnimationFrame(() => {
js/ui/components/EditModal.js:517:      magnet: editContext.magnet || "",
js/ui/components/EditModal.js:613:      case "magnet":
js/ui/components/EditModal.js:877:      if (key === "magnet") {
js/ui/components/EditModal.js:878:        return this.sanitizers.magnet(input.value);
js/ui/components/EditModal.js:887:    const magnetInput = this.fields.magnet;
js/ui/components/EditModal.js:899:    const newMagnet = fieldValue("magnet");
js/ui/components/EditModal.js:920:    const magnetWasEdited = isEditing(magnetInput);
js/ui/components/EditModal.js:925:      typeof original.magnet === "string" ? original.magnet.trim() : "";
js/ui/components/EditModal.js:934:    let finalMagnet = magnetWasEdited ? newMagnet : originalMagnetValue;
js/ui/components/EditModal.js:938:    if (magnetWasEdited) {
js/ui/components/EditModal.js:939:      const magnetHintCandidates = extractMagnetHints(finalMagnet);
js/ui/components/EditModal.js:941:        finalWs = magnetHintCandidates.ws || "";
js/ui/components/EditModal.js:944:        finalXs = magnetHintCandidates.xs || "";
js/ui/components/EditModal.js:1046:      finalMagnet = result.magnet;
js/ui/components/EditModal.js:1055:    const magnetChanged = magnetWasEdited && finalMagnet !== originalMagnetValue;
js/ui/components/EditModal.js:1056:    const wsEditedFlag = wsWasManuallyEdited || magnetChanged;
js/ui/components/EditModal.js:1057:    const xsEditedFlag = xsWasManuallyEdited || magnetChanged;
js/ui/components/EditModal.js:1062:      magnet: finalMagnet,
js/ui/components/EditModal.js:1072:      magnetEdited: magnetWasEdited,
js/ui/overlay/popoverEngine.js:364:    if (typeof view.requestAnimationFrame === "function") {
js/ui/overlay/popoverEngine.js:365:      view.requestAnimationFrame(restoreScroll);
js/ui/overlay/popoverEngine.js:369:    if (typeof view.setTimeout === "function") {
js/ui/overlay/popoverEngine.js:370:      view.setTimeout(restoreScroll, 0);
js/ui/overlay/popoverEngine.js:385:    if (!view || typeof view.setTimeout !== "function") {
js/ui/overlay/popoverEngine.js:391:    menuState.typeaheadTimeout = view.setTimeout(() => {
js/ui/notificationController.js:93:    if (this.window && typeof this.window.setTimeout === "function") {
js/ui/notificationController.js:94:      this.errorAutoHideHandle = this.window.setTimeout(() => {
js/ui/notificationController.js:117:      defaultView?.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
js/ui/notificationController.js:231:    if (this.window && typeof this.window.setTimeout === "function") {
js/ui/notificationController.js:232:      this.successAutoHideHandle = this.window.setTimeout(() => {
js/ui/ModalManager.js:71:        authService: app.authService,
js/ui/ModalManager.js:109:          magnet: (value) => (typeof value === "string" ? value.trim() : ""),
js/ui/ModalManager.js:283:      "video:copy-magnet",
js/ui/ModalManager.js:494:        typeof selectedVideo.magnet === "string"
js/ui/ModalManager.js:495:          ? selectedVideo.magnet.trim()
js/ui/ModalManager.js:498:        playbackOptions.magnet = rawMagnet;
js/ui/ModalManager.js:853:            eventName = "video:copy-magnet";
js/ui/moreMenuController.js:1035:            if (typeof video?.magnet === "string" && video.magnet) {
js/ui/moreMenuController.js:1036:              return video.magnet;
js/ui/profileModal/ProfileDirectMessageRenderer.js:268:    if (typeof window !== "undefined" && window && window.setTimeout) {
js/ui/profileModal/ProfileDirectMessageRenderer.js:272:      this.messagesStatusClearTimeout = window.setTimeout(() => {
js/ui/profileModal/ProfileDirectMessageRenderer.js:819:      typeof window !== "undefined" && typeof window.setTimeout === "function"
js/ui/profileModal/ProfileDirectMessageRenderer.js:820:        ? window.setTimeout.bind(window)
js/ui/profileModal/ProfileDirectMessageRenderer.js:821:        : setTimeout;
js/ui/profileModal/ProfileRelayController.js:39:      : this.mainController.services.relayManager.getEntries();
js/ui/dm/MessageThread.js:154:        setTimeout(() => {
js/ui/dm/MessageThread.js:158:          setTimeout(() => {
js/ui/dm/MessageThread.js:180:          setTimeout(initializeScroll, 300);
js/ui/dm/MessageThread.js:185:      setTimeout(initializeScroll, 0);
js/ui/dm/ConversationList.js:105:            setTimeout(() => {
js/ui/dm/ConversationList.js:108:                setTimeout(() => {
js/ui/dm/ConversationList.js:119:        setTimeout(() => {
js/ui/dm/ConversationList.js:122:            setTimeout(() => {
js/ui/profileModalContract.js:275:    key: "relayManager",
js/ui/videoModalController.js:72:      this.videoModal.addEventListener("video:copy-magnet", () => {
js/ui/videoModalController.js:133:    const magnetCandidate =
js/ui/videoModalController.js:134:      typeof video.magnet === "string" ? video.magnet.trim() : "";
js/ui/videoModalController.js:143:    const magnetAvailable = Boolean(magnetCandidate);
js/ui/videoModalController.js:165:    if (source === "torrent" && !magnetAvailable) {
js/ui/videoModalController.js:167:        "[VideoModalController] Unable to switch to torrent playback: missing magnet.",
js/ui/videoModalController.js:171:          "Torrent playback is unavailable for this video. No magnet was provided.",
js/ui/videoModalController.js:177:    if (source === "torrent" && hasActivePeers === false) {
js/ui/videoModalController.js:179:        "[VideoModalController] Switching to torrent playback despite 0 active peers detected.",
js/ui/videoModalController.js:196:          "CDN playback is unavailable right now, staying on the torrent stream.",
js/ui/videoModalController.js:210:        magnet: magnetCandidate,
js/ui/profileModalController.js:98:   * @param {object} [options.services] - Service instances (nostrService, relayManager, etc.).
js/ui/profileModalController.js:1640:        const service = this.services.relayManager;
js/ui/profileModalController.js:2200:        await this.services.authService.loadOwnProfile(normalizedPubkey);
js/ui/profileModalController.js:3047:    window.requestAnimationFrame(() => {
js/ui/profileModalController.js:3214:    setTimeout(() => {
js/ui/profileModalController.js:4258:          "visibilitychange",
js/ui/profileModalController.js:4347:    const previous = this.services.relayManager.snapshot();
js/ui/profileModalController.js:4352:          return this.services.relayManager.addRelay(url);
js/ui/profileModalController.js:4354:          return this.services.relayManager.removeRelay(url);
js/ui/profileModalController.js:4356:          return this.services.relayManager.restoreDefaults();
js/ui/profileModalController.js:4358:          return this.services.relayManager.cycleRelayMode(url);
js/ui/profileModalController.js:4383:      const publishResult = await this.services.relayManager.publishRelayList(
js/ui/profileModalController.js:4393:      this.services.relayManager.setEntries(previous, { allowEmpty: false });
js/ui/profileModalController.js:4871:    requestAnimationFrame(() => {
js/ui/profileModalController.js:4945:        void Promise.allSettled(backgroundTasks);
js/ui/profileModalController.js:4987:    window.requestAnimationFrame(() => {
js/ui/profileModalController.js:5057:        "visibilitychange",
js/ui/profileModalController.js:5092:        window.requestAnimationFrame(() => {
js/ui/profileModalController.js:5183:    Promise.all([walletPromise, adminPromise, postLoginPromise])
js/ui/ambientBackground.js:130:  const requestFrame = win?.requestAnimationFrame?.bind(win) || ((cb) => setTimeout(() => cb(Date.now()), throttleMs));
js/ui/ambientBackground.js:297:    doc.addEventListener("visibilitychange", handleVisibility);
js/ui/ambientBackground.js:317:      doc.removeEventListener("visibilitychange", handleVisibility);
js/ui/urlHealthController.js:56:      if (typeof requestAnimationFrame === "function") {
js/ui/urlHealthController.js:57:        requestAnimationFrame(() => {
js/ui/urlHealthController.js:315:          timeoutId = setTimeout(() => {
js/ui/urlHealthController.js:418:          timeoutId = setTimeout(() => {
js/ui/urlHealthController.js:434:      responseOrTimeout = await Promise.race(racers);
js/searchView.js:180:      "Results matching your search query. Use tokens like author:, tag:, kind:, relay:, after:, before:, duration:<, and has:magnet/url."
js/searchView.js:374:      label: "Has magnet",
js/searchView.js:495:                isMagnetSupported: (magnet) => magnet && magnet.startsWith("magnet:"),
js/searchView.js:500:                unsupportedBtihMessage: "Unsupported magnet link"
js/searchView.js:514:                     magnet: video.magnet,
js/searchView.js:520:                     magnet: video.magnet
js/searchView.js:600:                const events = await nostrClient.pool.list(relays, [filter]);
js/searchView.js:699:            const events = await nostrClient.pool.list(relays, [filter]);
js/storage/r2-mgmt.js:226:    await new Promise((resolve) => setTimeout(resolve, pollInterval));
js/app/modalCoordinator.js:21:    torrentClient,
js/app/modalCoordinator.js:252:            await fetch("/webtorrent/cancel/", { mode: "no-cors" });
js/app/modalCoordinator.js:255:          devLogger.warn("[hideModal] webtorrent cancel fetch failed:", err);
js/app/feedCoordinator.js:1130:      const classes = ["badge", "torrent-health-badge"];
js/app/feedCoordinator.js:1148:    isMagnetUriSupported(magnet) {
js/app/feedCoordinator.js:1149:      return isValidMagnetUri(magnet);
js/app/playbackCoordinator.js:4: * URL-first + magnet fallback playback pipeline.
js/app/playbackCoordinator.js:21:    torrentClient,
js/app/playbackCoordinator.js:140:        magnet: pending.magnet || "",
js/app/playbackCoordinator.js:212:    startTorrentStatusMirrors(torrentInstance) {
js/app/playbackCoordinator.js:213:      if (!torrentInstance) {
js/app/playbackCoordinator.js:225:        this.updateTorrentStatus(torrentInstance);
js/app/playbackCoordinator.js:226:        const { status, progress, peers, speed, downloaded } = this.torrentStatusNodes || {};
js/app/playbackCoordinator.js:267:      if (this.torrentStatusIntervalId) {
js/app/playbackCoordinator.js:273:      const intervalId = setInterval(callback, 3000);
js/app/playbackCoordinator.js:274:      this.torrentStatusIntervalId = intervalId;
js/app/playbackCoordinator.js:279:      if (!this.torrentStatusIntervalId) {
js/app/playbackCoordinator.js:282:      clearInterval(this.torrentStatusIntervalId);
js/app/playbackCoordinator.js:283:      this.removeActiveInterval(this.torrentStatusIntervalId);
js/app/playbackCoordinator.js:284:      this.torrentStatusIntervalId = null;
js/app/playbackCoordinator.js:333:    async playViaWebTorrent(
js/app/playbackCoordinator.js:334:      magnet,
js/app/playbackCoordinator.js:349:          throw new Error("No magnet URI provided for torrent playback.");
js/app/playbackCoordinator.js:359:            "No modal video element available for torrent playback."
js/app/playbackCoordinator.js:364:        const [magnetPrefix, magnetQuery = ""] = trimmedCandidate.split("?", 2);
js/app/playbackCoordinator.js:365:        let normalizedMagnet = magnetPrefix;
js/app/playbackCoordinator.js:366:        let queryParts = magnetQuery
js/app/playbackCoordinator.js:372:          normalizedMagnet = `${magnetPrefix}?${queryParts.join("&")}`;
js/app/playbackCoordinator.js:378:        await torrentClient.cleanup();
js/app/playbackCoordinator.js:382:          this.videoModal.updateStatus("Streaming via WebTorrent");
js/app/playbackCoordinator.js:386:        const torrentInstance = await torrentClient.streamVideo(
js/app/playbackCoordinator.js:392:        if (torrentClient.isServiceWorkerUnavailable()) {
js/app/playbackCoordinator.js:393:          const swError = torrentClient.getServiceWorkerInitError();
js/app/playbackCoordinator.js:396:            "[playViaWebTorrent] Service worker unavailable; streaming directly via WebTorrent.",
js/app/playbackCoordinator.js:401:              "[playViaWebTorrent] Service worker unavailable; direct streaming engaged.",
js/app/playbackCoordinator.js:409:        if (torrentInstance && torrentInstance.ready) {
js/app/playbackCoordinator.js:410:          // Some browsers delay `playing` events for MediaSource-backed torrents.
js/app/playbackCoordinator.js:412:          // video" regression when WebTorrent is already feeding data.
js/app/playbackCoordinator.js:413:          this.forceRemoveModalPoster("webtorrent-ready");
js/app/playbackCoordinator.js:415:        this.startTorrentStatusMirrors(torrentInstance);
js/app/playbackCoordinator.js:416:        return torrentInstance;
js/app/playbackCoordinator.js:420:        typeof magnet === "string" ? magnet.trim() : "";
js/app/playbackCoordinator.js:433:          `[playViaWebTorrent] Normalized magnet failed: ${primaryError.message}`
js/app/playbackCoordinator.js:436:          "[playViaWebTorrent] Primary magnet failed, retrying original string."
js/app/playbackCoordinator.js:448:     * and falls back to WebTorrent when needed.
js/app/playbackCoordinator.js:492:        playViaWebTorrent: (magnetUri, opts) =>
js/app/playbackCoordinator.js:493:          this.playViaWebTorrent(magnetUri, opts),
js/app/playbackCoordinator.js:514:            this.currentVideo.magnet = metadata.magnet;
js/app/playbackCoordinator.js:521:            this.currentVideo.torrentSupported = metadata.torrentSupported;
js/app/playbackCoordinator.js:523:          this.currentMagnetUri = metadata.magnet || null;
js/app/playbackCoordinator.js:558:        typeof hint.magnet === "string" ? hint.magnet.trim() : "";
js/app/playbackCoordinator.js:589:            magnet: fallbackMagnetCandidate,
js/app/playbackCoordinator.js:626:        typeof video.magnet === "string" ? video.magnet.trim() : "";
js/app/playbackCoordinator.js:637:      let magnetCandidate = rawMagnet || legacyInfoHash || "";
js/app/playbackCoordinator.js:638:      let decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
js/app/playbackCoordinator.js:639:      let usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
js/app/playbackCoordinator.js:640:      let magnetSupported = isValidMagnetUri(usableMagnetCandidate);
js/app/playbackCoordinator.js:642:      if (!magnetSupported && fallbackMagnetForCandidate) {
js/app/playbackCoordinator.js:643:        magnetCandidate = fallbackMagnetForCandidate;
js/app/playbackCoordinator.js:644:        decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
js/app/playbackCoordinator.js:645:        usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
js/app/playbackCoordinator.js:646:        magnetSupported = isValidMagnetUri(usableMagnetCandidate);
js/app/playbackCoordinator.js:649:      const sanitizedMagnet = magnetSupported ? usableMagnetCandidate : "";
js/app/playbackCoordinator.js:675:        magnet: sanitizedMagnet,
js/app/playbackCoordinator.js:677:          magnetCandidate || fallbackMagnetForCandidate || legacyInfoHash || "",
js/app/playbackCoordinator.js:678:        torrentSupported: magnetSupported,
js/app/playbackCoordinator.js:782:      const magnetInput =
js/app/playbackCoordinator.js:785:        magnetCandidate ||
js/app/playbackCoordinator.js:798:        magnet: magnetInput,
js/app/playbackCoordinator.js:1117:        magnet = "",
js/app/playbackCoordinator.js:1138:      const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
js/app/playbackCoordinator.js:1141:      const magnetSupported = isValidMagnetUri(usableMagnet);
js/app/playbackCoordinator.js:1142:      const sanitizedMagnet = magnetSupported ? usableMagnet : "";
js/app/playbackCoordinator.js:1152:        const message = trimmedMagnet && !magnetSupported
js/app/playbackCoordinator.js:1164:        magnet: sanitizedMagnet,
js/app/playbackCoordinator.js:1166:        torrentSupported: magnetSupported,
js/app/playbackCoordinator.js:1211:        magnet: usableMagnet,
js/app/authSessionCoordinator.js:29:    relayManager,
js/app/authSessionCoordinator.js:30:    torrentClient,
js/app/authSessionCoordinator.js:37:    publishEventToRelays,
js/app/authSessionCoordinator.js:39:    queueSignEvent,
js/app/authSessionCoordinator.js:268:          // 1. Relays and Profile are now loaded (sequentially or efficiently by authService)
js/app/authSessionCoordinator.js:363:      const listStatePromise = Promise.all([
js/app/authSessionCoordinator.js:423:          typeof this.authService.loadBlocksForPubkey === "function"
js/app/authSessionCoordinator.js:429:                const loaded = await this.authService.loadBlocksForPubkey(activePubkey, {
js/app/authSessionCoordinator.js:491:        const taskOutcomes = await Promise.all(parallelListTasks);
js/app/authSessionCoordinator.js:521:              Promise.all([
js/app/authSessionCoordinator.js:522:                this.authService?.loadBlocksForPubkey?.(activePubkey, {
js/app/authSessionCoordinator.js:709:      const feedSyncPromise = Promise.race([
js/app/authSessionCoordinator.js:710:        Promise.allSettled([
js/app/authSessionCoordinator.js:714:        new Promise((resolve) => setTimeout(resolve, FEED_SYNC_TIMEOUT_MS)),
js/app/authSessionCoordinator.js:792:        typeof window !== "undefined" && typeof window.setTimeout === "function"
js/app/authSessionCoordinator.js:793:          ? window.setTimeout.bind(window)
js/app/authSessionCoordinator.js:794:          : setTimeout;
js/app/authSessionCoordinator.js:827:      const detail = await this.authService.logout();
js/app/authSessionCoordinator.js:1179:          // Tell webtorrent to cleanup
js/app/authSessionCoordinator.js:1180:          await torrentClient.cleanup();
js/app/authSessionCoordinator.js:1181:          this.log("[cleanup] WebTorrent cleanup resolved.");
js/app/authSessionCoordinator.js:1185:              await fetch("/webtorrent/cancel/", { mode: "no-cors" });
js/app/authSessionCoordinator.js:1228:      this.torrentStatusIntervalId = null;
js/app/authSessionCoordinator.js:1236:        this.torrentStatusNodes = null;
js/app/authSessionCoordinator.js:1239:      this.torrentStatusNodes = {
js/app/authSessionCoordinator.js:1249:      this.torrentStatusNodes = null;
js/app/authSessionCoordinator.js:1284:      this.torrentStatusVisibilityHandler = handleVisibilityChange;
js/app/authSessionCoordinator.js:1285:      this.torrentStatusPageHideHandler = handlePageHide;
js/app/authSessionCoordinator.js:1286:      document.addEventListener("visibilitychange", handleVisibilityChange);
js/app/authSessionCoordinator.js:1291:      if (this.torrentStatusVisibilityHandler) {
js/app/authSessionCoordinator.js:1292:        document.removeEventListener("visibilitychange", this.torrentStatusVisibilityHandler);
js/app/authSessionCoordinator.js:1293:        this.torrentStatusVisibilityHandler = null;
js/app/authSessionCoordinator.js:1295:      if (this.torrentStatusPageHideHandler) {
js/app/authSessionCoordinator.js:1296:        window.removeEventListener("pagehide", this.torrentStatusPageHideHandler);
js/app/authSessionCoordinator.js:1297:        this.torrentStatusPageHideHandler = null;
js/app/authSessionCoordinator.js:1306:      const result = await this.authService.switchProfile(pubkey, { providerId });
js/app/authSessionCoordinator.js:1384:          } else if (typeof setTimeout === "function") {
js/app/authSessionCoordinator.js:1385:            setTimeout(resolve, 0);
js/app/authSessionCoordinator.js:1478:        removalResult = this.authService.removeSavedProfile(candidatePubkey);
js/app/authSessionCoordinator.js:1540:      const previous = relayManager.snapshot();
js/app/authSessionCoordinator.js:1546:            operationResult = relayManager.addRelay(url);
js/app/authSessionCoordinator.js:1549:            operationResult = relayManager.removeRelay(url);
js/app/authSessionCoordinator.js:1552:            operationResult = relayManager.restoreDefaults();
js/app/authSessionCoordinator.js:1555:            operationResult = relayManager.cycleRelayMode(url);
js/app/authSessionCoordinator.js:1579:        const publishResult = await relayManager.publishRelayList(activePubkey);
js/app/authSessionCoordinator.js:1604:            relayManager.setEntries(previous, { allowEmpty: false });
js/constants.js:139:  "wss://tracker.openwebtorrent.com",
js/constants.js:142:  "wss://tracker.webtorrent.dev",
js/constants.js:182:  URL_FIRST_ENABLED: DEFAULT_PLAYBACK_SOURCE !== "torrent", // try URL before magnet in the player
js/nostrToolsBootstrap.js:133:    timeoutId = setTimeout(() => {
js/nostrToolsBootstrap.js:397:    const dynamicResults = await Promise.allSettled([
js/magnetUtils.js:1:// js/magnetUtils.js
js/magnetUtils.js:14:} from "./magnetShared.js";
js/magnetUtils.js:27:    torrentUrl,
js/magnetUtils.js:47:    return { magnet: "", didChange: false };
js/magnetUtils.js:51:    const magnet = canonicalValue;
js/magnetUtils.js:53:      magnet,
js/magnetUtils.js:54:      didChange: didMutate || magnet !== initial,
js/magnetUtils.js:93:  const torrentHint = typeof torrentUrl === "string" && torrentUrl.trim()
js/magnetUtils.js:94:    ? torrentUrl
js/magnetUtils.js:99:  if (torrentHint) {
js/magnetUtils.js:100:    if (ensureTorrentHint(params, torrentHint, { requireHttp: true })) {
js/magnetUtils.js:126:    magnet: finalMagnet,
js/services/profileMetadataService.js:90:  if (!nostr?.pool || typeof nostr.pool.list !== "function") {
js/services/profileMetadataService.js:109:  const results = await Promise.allSettled(
js/services/profileMetadataService.js:235:  await Promise.all([...waiters, batchPromise].filter(Boolean));
js/services/videoNotePayload.js:1:import { extractMagnetHints } from "../magnetShared.js";
js/services/videoNotePayload.js:2:import { normalizeAndAugmentMagnet } from "../magnetUtils.js";
js/services/videoNotePayload.js:3:import { infoHashFromMagnet } from "../magnets.js";
js/services/videoNotePayload.js:18:    "Provide a hosted URL, magnet link, or an imeta variant before publishing.",
js/services/videoNotePayload.js:342:  const magnet = normalizeString(legacyPayload?.magnet || "");
js/services/videoNotePayload.js:371:    magnet,
js/services/videoNotePayload.js:386:  const hasLegacySource = Boolean(legacyFormData.url || legacyFormData.magnet);
js/services/videoNotePayload.js:417:  if (legacyFormData.magnet) {
js/services/videoNotePayload.js:426:    const result = normalizeAndAugmentMagnet(legacyFormData.magnet, {
js/services/videoNotePayload.js:430:    legacyFormData.magnet = result.magnet;
js/services/videoNotePayload.js:431:    const hints = extractMagnetHints(result.magnet);
js/services/videoNotePayload.js:450:    infoHash || normalizeInfoHash(legacyFormData.magnet) || "";
js/services/trustBootstrap.js:47:  return new Promise((resolve) => setTimeout(resolve, ms));
js/services/trustBootstrap.js:73:    setTimeout(() => {
js/services/trustBootstrap.js:80:    await Promise.race([accessControl.waitForReady(), timeoutPromise]);
js/services/r2Service.js:11: *   2. A `.torrent` file is generated and uploaded alongside the video.
js/services/r2Service.js:13: *      torrent file as a metadata source (`xs=`).
js/services/r2Service.js:51:import { calculateTorrentInfoHash } from "../utils/torrentHash.js";
js/services/r2Service.js:675:      await new Promise((r) => setTimeout(r, 500));
js/services/r2Service.js:788:   *    - `xs`: The Exact Source URL (link to the .torrent file on R2).
js/services/r2Service.js:799:    torrentFile = null,
js/services/r2Service.js:919:        return `${baseKey}.torrent`;
js/services/r2Service.js:921:      return `${key}.torrent`;
js/services/r2Service.js:973:      let torrentUrl = forcedTorrentUrl || "";
js/services/r2Service.js:975:      if (torrentFile) {
js/services/r2Service.js:976:        this.setCloudflareUploadStatus("Uploading torrent metadata...", "info");
js/services/r2Service.js:977:        const torrentKey = buildTorrentKey();
js/services/r2Service.js:982:            key: torrentKey,
js/services/r2Service.js:983:            file: torrentFile,
js/services/r2Service.js:984:            contentType: "application/x-bittorrent",
js/services/r2Service.js:988:          if (!torrentUrl) {
js/services/r2Service.js:989:             torrentUrl = buildPublicUrl(bucketEntry.publicBaseUrl, torrentKey);
js/services/r2Service.js:1005:        // - `ws` (WebSeed): The direct R2 URL. WebTorrent clients use this to "seed"
js/services/r2Service.js:1007:        // - `xs` (eXact Source): The URL to the .torrent file on R2. This allows
js/services/r2Service.js:1016:          let magnet = `magnet:?xt=urn:btih:${normalizedInfoHash}&dn=${encodedDn}&ws=${encodedWs}`;
js/services/r2Service.js:1020:          if (torrentUrl) {
js/services/r2Service.js:1021:            const encodedXs = encodeURIComponent(torrentUrl);
js/services/r2Service.js:1022:            magnet += `&xs=${encodedXs}`;
js/services/r2Service.js:1025:          generatedMagnet = magnet;
js/services/r2Service.js:1030:              "Invalid info hash provided. Skipping magnet and webseed generation.",
js/services/r2Service.js:1035:            "Info hash missing or invalid. Publishing URL-first without WebTorrent fallback.",
js/services/r2Service.js:1052:          magnet: generatedMagnet || (metadata?.magnet ?? ""),
js/services/r2Service.js:1057:          xs: torrentUrl || (metadata?.xs ?? ""),
js/services/playbackService.js:11: * falling back to a WebTorrent (P2P) stream if the URL is unreachable or stalls.
js/services/playbackService.js:18: *   stalls, it seamlessly triggers the P2P engine (WebTorrent).
js/services/playbackService.js:66:  "This magnet link is missing a compatible BitTorrent v1 info hash.";
js/services/playbackService.js:73:const extractWebSeedsFromMagnet = (magnetUri) => {
js/services/playbackService.js:74:  if (typeof magnetUri !== "string") {
js/services/playbackService.js:77:  const trimmed = magnetUri.trim();
js/services/playbackService.js:121:        "Hosted URL timed out. We’ll try WebTorrent if available.",
js/services/playbackService.js:173:        "Hosted URL blocked by browser security (CORS/SSL). We’ll try WebTorrent if available.",
js/services/playbackService.js:192:          "Hosted URL blocked by CORS. We’ll try WebTorrent if available.",
js/services/playbackService.js:244:    return "WebTorrent could not start. Please try again.";
js/services/playbackService.js:251:    return "WebTorrent could not reach any peers or trackers.";
js/services/playbackService.js:254:    return "WebTorrent was blocked by the browser or network.";
js/services/playbackService.js:256:  return "WebTorrent could not start. Please try again.";
js/services/playbackService.js:262:    torrentClient,
js/services/playbackService.js:277:    this.torrentClient = torrentClient;
js/services/playbackService.js:324:  getProbeCacheKey({ url, magnet }) {
js/services/playbackService.js:326:    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
js/services/playbackService.js:360:   * @param {string} [options.magnet] - Optional magnet context for caching keys.
js/services/playbackService.js:364:  async probeHostedUrl({ url, magnet, probeUrl } = {}) {
js/services/playbackService.js:371:      magnet,
js/services/playbackService.js:502:      stallTimerId = setTimeout(() => triggerFallback("stall"), normalizedStallMs);
js/services/playbackService.js:554:   * @param {string} [options.magnet] - The WebTorrent magnet link.
js/services/playbackService.js:558:   * @param {Function} [options.playViaWebTorrent] - Torrent handler.
js/services/playbackService.js:559:   * @param {string} [options.forcedSource] - 'url' or 'torrent' to skip priority checks.
js/services/playbackService.js:578: * 4. Falling back to WebTorrent if needed.
js/services/playbackService.js:580: * It uses a `requestSignature` (JSON of url+magnet) to uniquely identify the request.
js/services/playbackService.js:598:      typeof options.magnet === "string" ? options.magnet.trim() : "";
js/services/playbackService.js:607:            magnet: this.trimmedMagnet,
js/services/playbackService.js:612:        magnet: this.trimmedMagnet,
js/services/playbackService.js:619:        magnet: this.trimmedMagnet,
js/services/playbackService.js:629:    const magnetIsUsable =
js/services/playbackService.js:631:        ? service.isValidMagnetUri(this.playbackConfig.magnet)
js/services/playbackService.js:634:    this.magnetForPlayback = magnetIsUsable
js/services/playbackService.js:635:      ? this.playbackConfig.magnet
js/services/playbackService.js:637:    this.fallbackMagnet = magnetIsUsable
js/services/playbackService.js:640:    this.magnetProvided = !!this.playbackConfig.provided;
js/services/playbackService.js:666:    return this.magnetForPlayback;
js/services/playbackService.js:674:    return this.magnetProvided;
js/services/playbackService.js:753:   * @returns {Promise<{source: 'url'|'torrent'|null, error?: Error}>}
js/services/playbackService.js:775:   * @returns {Promise<{source: 'url'|'torrent'|null, error?: Error}>}
js/services/playbackService.js:786:      playViaWebTorrent,
js/services/playbackService.js:798:      magnetProvided: this.magnetProvided,
js/services/playbackService.js:799:      magnetUsable: !!this.magnetForPlayback,
js/services/playbackService.js:829:        this.service.torrentClient &&
js/services/playbackService.js:830:        typeof this.service.torrentClient.cleanup === "function"
js/services/playbackService.js:832:        await this.service.torrentClient.cleanup();
js/services/playbackService.js:875:      const magnetWebSeeds = extractWebSeedsFromMagnet(this.magnetForPlayback);
js/services/playbackService.js:876:      if (magnetWebSeeds.length > 0) {
js/services/playbackService.js:877:        magnetWebSeeds.forEach((seed) => addWebSeedCandidate(seed));
js/services/playbackService.js:909:      let torrentAttempted = false;
js/services/playbackService.js:911:        if (torrentAttempted) return null;
js/services/playbackService.js:912:        torrentAttempted = true;
js/services/playbackService.js:919:        if (!this.magnetForPlayback) {
js/services/playbackService.js:920:          // No magnet available to try
js/services/playbackService.js:924:        this.emit("status", { message: "Switching to WebTorrent..." });
js/services/playbackService.js:928:        if (typeof playViaWebTorrent !== "function") {
js/services/playbackService.js:929:          throw new Error("No torrent playback handler provided.");
js/services/playbackService.js:932:        let torrentInstance;
js/services/playbackService.js:934:          torrentInstance = await playViaWebTorrent(this.magnetForPlayback, {
js/services/playbackService.js:946:        this.service.handleAnalyticsEvent("sourcechange", { source: "torrent" });
js/services/playbackService.js:947:        this.emit("sourcechange", { source: "torrent" });
js/services/playbackService.js:952:        const result = { source: "torrent", torrentInstance };
js/services/playbackService.js:1021:          magnet: this.trimmedMagnet,
js/services/playbackService.js:1163:          const timer = setTimeout(() => {
js/services/playbackService.js:1184:      if (forcedSource === "torrent") tryUrlFirst = false;
js/services/playbackService.js:1216:          if (this.magnetForPlayback && forcedSource !== "url") {
js/services/playbackService.js:1219:        } else if (this.magnetForPlayback && forcedSource !== "url") {
js/services/playbackService.js:1224:        if (this.magnetForPlayback) {
js/services/playbackService.js:1228:            const torrentTimeout = httpsUrl ? effectiveTimeout : 0;
js/services/playbackService.js:1231:            const torrentResult = await withTimeout(
js/services/playbackService.js:1233:              torrentTimeout,
js/services/playbackService.js:1237:            if (torrentResult && torrentResult.source === "torrent") {
js/services/playbackService.js:1238:              return torrentResult;
js/services/playbackService.js:1241:            if (torrentResult?.reason === "timeout") {
js/services/playbackService.js:1246:                this.service.torrentClient &&
js/services/playbackService.js:1247:                typeof this.service.torrentClient.cleanup === "function"
js/services/playbackService.js:1249:                await this.service.torrentClient.cleanup();
js/services/playbackService.js:1259:              this.service.torrentClient &&
js/services/playbackService.js:1260:              typeof this.service.torrentClient.cleanup === "function"
js/services/playbackService.js:1262:              await this.service.torrentClient.cleanup();
js/services/playbackService.js:1269:        if (httpsUrl && forcedSource !== "torrent") {
js/services/playbackService.js:1283:        (this.magnetProvided && !this.magnetForPlayback
js/services/moderationService.js:22:import { publishEventToRelays, assertAnyRelayAccepted } from "../nostrPublish.js";
js/services/moderationService.js:728:    this.muteRefreshTimer = setTimeout(() => {
js/services/moderationService.js:1457:      events = await this.nostrClient.pool.list(relays, [filter]);
js/services/moderationService.js:1601:      await Promise.all(tasks);
js/services/moderationService.js:1663:        events = await this.nostrClient.pool.list(relays, [filter]);
js/services/moderationService.js:2106:      results = await publishEventToRelays(this.nostrClient.pool, relays, signedEvent);
js/services/dmNostrService.js:74:    timeoutId = setTimeout(() => {
js/services/dmNostrService.js:83:  return Promise.race([promise, timeoutPromise]).finally(() => {
js/services/dmNostrService.js:121:    typeof pool.list === "function" &&
js/services/dmNostrService.js:126:        pool.list(discoveryList, [
js/services/dmNostrService.js:398:    const timer = setTimeout(() => {
js/services/s3UploadService.js:20:import { calculateTorrentInfoHash } from "../utils/torrentHash.js";
js/services/s3UploadService.js:222:    torrentFile = null,
js/services/s3UploadService.js:351:      let torrentUrl = forcedTorrentUrl || "";
js/services/s3UploadService.js:352:      if (torrentFile) {
js/services/s3UploadService.js:353:        this.setUploadStatus("Uploading torrent metadata...", "info");
js/services/s3UploadService.js:354:        const torrentKey =
js/services/s3UploadService.js:359:              return `${baseKey}.torrent`;
js/services/s3UploadService.js:361:            return `${key}.torrent`;
js/services/s3UploadService.js:367:            key: torrentKey,
js/services/s3UploadService.js:368:            file: torrentFile,
js/services/s3UploadService.js:369:            contentType: "application/x-bittorrent",
js/services/s3UploadService.js:373:          if (!torrentUrl) {
js/services/s3UploadService.js:374:            torrentUrl = this.deps.buildS3ObjectUrl({
js/services/s3UploadService.js:378:              key: torrentKey,
js/services/s3UploadService.js:403:        let magnet = `magnet:?xt=urn:btih:${normalizedInfoHash}&dn=${encodedDn}&ws=${encodedWs}`;
js/services/s3UploadService.js:404:        if (torrentUrl) {
js/services/s3UploadService.js:405:          const encodedXs = encodeURIComponent(torrentUrl);
js/services/s3UploadService.js:406:          magnet += `&xs=${encodedXs}`;
js/services/s3UploadService.js:408:        generatedMagnet = magnet;
js/services/s3UploadService.js:413:            "Invalid info hash provided. Skipping magnet generation.",
js/services/s3UploadService.js:418:          "Info hash missing or invalid. Publishing URL-first without WebTorrent fallback.",
js/services/s3UploadService.js:435:        magnet: generatedMagnet || (metadata?.magnet ?? ""),
js/services/s3UploadService.js:440:        xs: torrentUrl || (metadata?.xs ?? ""),
js/services/commentThreadService.js:882:    this.profileHydrationTimer = setTimeout(() => {
js/services/commentThreadService.js:930:            await new Promise((resolve) => setTimeout(resolve, backoffMs));
js/services/nostrService.js:20:import { getDmDecryptWorkerQueueSize } from "../nostr/dmDecryptWorkerClient.js";
js/services/nostrService.js:713:      workerQueueSize: getDmDecryptWorkerQueueSize(),
js/services/nostrService.js:1852:      await Promise.all(
js/services/nostrService.js:1856:            const events = await this.nostrClient.pool.list([url], [filter]);
js/services/nostrService.js:1996:      const events = await this.nostrClient.pool.list(this.nostrClient.relays, [filter]);
js/services/authService.js:1:// js/services/authService.js
js/services/authService.js:53:    relayManager,
js/services/authService.js:61:    this.relayManager = relayManager || null;
js/services/authService.js:129:  hydrateFromStorage() {
js/services/authService.js:773:      if (this.relayManager && typeof this.relayManager.loadRelayList === "function") {
js/services/authService.js:776:          promise: schedule(() => this.relayManager.loadRelayList(activePubkey)),
js/services/authService.js:825:      await Promise.allSettled(concurrentOps.map(runOperation));
js/services/authService.js:924:    if (this.relayManager && typeof this.relayManager.reset === "function") {
js/services/authService.js:926:        this.relayManager.reset();
js/services/authService.js:928:        this.log("[AuthService] relayManager.reset threw", error);
js/services/authService.js:1048:    const fetchPromise = this.nostrClient.pool.list([relayUrl], filter);
js/services/authService.js:1052:      timeoutId = setTimeout(() => {
js/services/authService.js:1064:      const result = await Promise.race([fetchPromise, timeoutPromise]);
js/services/authService.js:1174:    const background = Promise.all([
js/services/authService.js:1175:      Promise.allSettled(fastPromises),
js/services/authService.js:1233:        fastResult = await Promise.any(fastPromises);
js/services/hashtagPreferencesService.js:14:  publishEventToRelays,
js/services/hashtagPreferencesService.js:22:import { relayManager } from "../relayManager.js";
js/services/hashtagPreferencesService.js:554:    this.decryptRetryTimeoutId = setTimeout(() => {
js/services/hashtagPreferencesService.js:655:      typeof nostrClient.pool.list !== "function"
js/services/hashtagPreferencesService.js:658:        `${LOG_PREFIX} nostrClient.pool.list unavailable; treating preferences as empty.`,
js/services/hashtagPreferencesService.js:679:    const readRelays = relayManager.getReadRelayUrls();
js/services/hashtagPreferencesService.js:746:      const results = await Promise.all(promises);
js/services/hashtagPreferencesService.js:860:        timeoutId = setTimeout(() => {
js/services/hashtagPreferencesService.js:869:        decryptResult = await Promise.race([decryptPromise, timeoutPromise]);
js/services/hashtagPreferencesService.js:1214:    // PERF: Try all decryption schemes in parallel via Promise.any().
js/services/hashtagPreferencesService.js:1247:        const result = await Promise.any(attempts);
js/services/hashtagPreferencesService.js:1419:    const publishResults = await publishEventToRelays(
js/services/watchHistoryTelemetry.js:19:  // Transport identifiers (URL, magnet, hashes) are intentionally omitted so
js/services/watchHistoryTelemetry.js:323:      state[idKey] = this._getTimerHost().setTimeout(callback, remainingMs);
js/services/relayHealthService.js:58:  constructor({ relayManager, nostrClient, logger, telemetryEmitter } = {}) {
js/services/relayHealthService.js:59:    this.relayManager = relayManager || null;
js/services/relayHealthService.js:81:    if (!this.relayManager || typeof this.relayManager.getEntries !== "function") {
js/services/relayHealthService.js:84:    const entries = this.relayManager.getEntries();
js/services/relayHealthService.js:207:      const relay = await Promise.race([
js/services/relayHealthService.js:210:          setTimeout(
js/services/relayHealthService.js:239:    await Promise.allSettled(urls.map((url) => this.checkRelay(url)));
js/services/playbackStrategyService.js:32:   * @param {object} options - Playback options (url, magnet, trigger, forcedSource).
js/services/playbackStrategyService.js:37:    const { url = "", magnet = "", trigger, forcedSource } = options || {};
js/services/playbackStrategyService.js:40:      method: forcedSource || (magnet ? "webtorrent" : "url"), // heuristic
js/services/playbackStrategyService.js:43:        magnet: Boolean(magnet),
js/services/playbackStrategyService.js:54:    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
js/services/playbackStrategyService.js:58:      magnet: trimmedMagnet,
js/services/playbackStrategyService.js:107:      previousSource === "torrent" &&
js/services/playbackStrategyService.js:110:      this.playbackService.torrentClient &&
js/services/playbackStrategyService.js:111:      typeof this.playbackService.torrentClient.cleanup === "function"
js/services/playbackStrategyService.js:114:        this.log("Previous playback used WebTorrent; cleaning up before preparing hosted session.");
js/services/playbackStrategyService.js:115:        await this.playbackService.torrentClient.cleanup();
js/services/playbackStrategyService.js:117:        this.log("Pre-playback torrent cleanup threw:", error);
js/services/playbackStrategyService.js:199:      magnet: trimmedMagnet,
js/services/playbackStrategyService.js:208:      playViaWebTorrent: context.playViaWebTorrent,
js/services/playbackStrategyService.js:232:    const magnetForPlayback = session.getMagnetForPlayback();
js/services/playbackStrategyService.js:234:    // const magnetProvided = session.getMagnetProvided();
js/services/playbackStrategyService.js:238:            magnet: magnetForPlayback,
js/services/playbackStrategyService.js:239:            normalizedMagnet: magnetForPlayback,
js/services/playbackStrategyService.js:242:            torrentSupported: !!magnetForPlayback
js/services/playbackStrategyService.js:246:    // this.currentMagnetUri = magnetForPlayback || null; // Logic is in context if needed
js/services/playbackStrategyService.js:285:      const usingTorrent = source === "torrent";
js/services/exploreDataService.js:9:function getWorker() {
js/services/exploreDataService.js:11:    workerInstance = new Worker(new URL("../workers/exploreData.worker.js", import.meta.url), { type: "module" });
js/services/exploreDataService.js:18:    const worker = getWorker();
js/services/exploreDataService.js:31:    worker.postMessage({ type, id, payload });
js/services/exploreDataService.js:154:      document.addEventListener("visibilitychange", this.handleVisibility);
js/services/exploreDataService.js:161:    if (document.hidden) {
js/services/exploreDataService.js:173:      this.watchHistoryInterval = setInterval(() => {
js/services/exploreDataService.js:178:      this.tagIdfInterval = setInterval(() => {
js/services/exploreDataService.js:232:    this.watchHistoryRefreshHandle = setTimeout(() => {
js/services/exploreDataService.js:242:    this.tagIdfRefreshHandle = setTimeout(() => {
js/services/exploreDataService.js:324:      document.removeEventListener("visibilitychange", this.handleVisibility);
