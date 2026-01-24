import { bytesToHex } from "../../vendor/crypto-helpers.bundle.min.js";
import { signEventWithPrivateKey } from "../nostr/publishHelpers.js";
import { ensureNostrTools, getCachedNostrTools } from "../nostr/toolkit.js";
import { normalizeActorKey } from "../nostr/watchHistory.js";
import { buildHttpAuthEvent } from "../nostrEventSchemas.js";

const DEFAULT_TEST_PUBKEY = "f".repeat(64);
const DEFAULT_DEV_DISPLAY_NAME = "Ephemeral dev signer";
const DEFAULT_TEST_DISPLAY_NAME = "Test signer";

function normalizePubkey(value) {
  const normalized = typeof value === "string" ? normalizeActorKey(value) : "";
  return normalized || "";
}

function getSigningTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * @typedef {Object} SigningAdapter
 * @property {() => Promise<string>} getPubkey
 * @property {() => Promise<string>} getDisplayName
 * @property {(unsignedEvent: object) => Promise<object>} signEvent
 * @property {(message: string) => Promise<string>} signMessage
 */

export function createNip07SigningAdapter({ extension } = {}) {
  const resolvedExtension =
    extension ||
    (typeof window !== "undefined" && window?.nostr ? window.nostr : null);

  const getPubkey = async () => {
    if (!resolvedExtension || typeof resolvedExtension.getPublicKey !== "function") {
      throw new Error("NIP-07 extension is unavailable.");
    }
    return normalizePubkey(await resolvedExtension.getPublicKey());
  };

  const getDisplayName = async () => {
    if (!resolvedExtension || typeof resolvedExtension.getMetadata !== "function") {
      return "";
    }
    const metadata = await resolvedExtension.getMetadata();
    if (!metadata || typeof metadata !== "object") {
      return "";
    }
    const displayName =
      typeof metadata.display_name === "string" ? metadata.display_name.trim() : "";
    if (displayName) {
      return displayName;
    }
    return typeof metadata.name === "string" ? metadata.name.trim() : "";
  };

  const signEvent = async (event) => {
    if (!resolvedExtension || typeof resolvedExtension.signEvent !== "function") {
      throw new Error("NIP-07 extension is missing signEvent.");
    }
    return resolvedExtension.signEvent(event);
  };

  const signMessage = async (message) => {
    if (!resolvedExtension || typeof resolvedExtension.signMessage !== "function") {
      throw new Error("NIP-07 extension does not support signMessage.");
    }
    return resolvedExtension.signMessage(message);
  };

  return {
    type: "nip07",
    getPubkey,
    getDisplayName,
    signEvent,
    signMessage,
  };
}

export function createEphemeralDevSigningAdapter({
  displayName = DEFAULT_DEV_DISPLAY_NAME,
  privateKey,
} = {}) {
  let cachedPrivateKey = typeof privateKey === "string" ? privateKey.trim() : "";
  let cachedPubkey = "";

  const ensurePrivateKey = () => {
    if (cachedPrivateKey) {
      return cachedPrivateKey;
    }
    const random = new Uint8Array(32);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(random);
    } else if (typeof globalThis?.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(random);
    } else {
      for (let i = 0; i < random.length; i += 1) {
        random[i] = Math.floor(Math.random() * 256);
      }
    }
    cachedPrivateKey = bytesToHex(random);
    return cachedPrivateKey;
  };

  const ensurePubkey = async () => {
    if (cachedPubkey) {
      return cachedPubkey;
    }
    const tools = (await ensureNostrTools()) || getCachedNostrTools();
    if (!tools || typeof tools.getPublicKey !== "function") {
      throw new Error("Nostr tools are required to derive the dev pubkey.");
    }
    cachedPubkey = normalizePubkey(tools.getPublicKey(ensurePrivateKey()));
    if (!cachedPubkey) {
      throw new Error("Failed to derive dev pubkey.");
    }
    return cachedPubkey;
  };

  const signEvent = async (event) =>
    signEventWithPrivateKey({ ...event, pubkey: await ensurePubkey() }, ensurePrivateKey());

  const signMessage = async (message) => {
    const pubkey = await ensurePubkey();
    const event = buildHttpAuthEvent({
      pubkey,
      created_at: getSigningTimestamp(),
      url: "bitvid:signing-adapter",
      content: typeof message === "string" ? message : String(message ?? ""),
    });

    const signed = signEventWithPrivateKey(event, ensurePrivateKey());
    if (!signed || typeof signed.sig !== "string") {
      throw new Error("Failed to sign message.");
    }
    return signed.sig;
  };

  return {
    type: "dev",
    getPubkey: ensurePubkey,
    getDisplayName: async () => displayName,
    signEvent,
    signMessage,
  };
}

export function createTestSigningAdapter({
  pubkey = DEFAULT_TEST_PUBKEY,
  displayName = DEFAULT_TEST_DISPLAY_NAME,
  signEvent,
  signMessage,
} = {}) {
  const normalizedPubkey = normalizePubkey(pubkey) || DEFAULT_TEST_PUBKEY;

  const signEventImpl =
    typeof signEvent === "function"
      ? signEvent
      : async (event) => ({
          ...event,
          pubkey: normalizedPubkey || event.pubkey,
          id: "test-event-id",
          sig: "test-event-sig",
        });

  const signMessageImpl =
    typeof signMessage === "function"
      ? signMessage
      : async (message) => `signed:${message}`;

  return {
    type: "test",
    getPubkey: async () => normalizedPubkey,
    getDisplayName: async () => displayName,
    signEvent: signEventImpl,
    signMessage: signMessageImpl,
  };
}
