// js/nostr/adapters/nip46Adapter.js

import { Nip46RpcClient } from "../nip46Client.js";
import { normalizeActorKey } from "../watchHistory.js";

function resolveClient(client) {
  if (client instanceof Nip46RpcClient) {
    return client;
  }
  return client?.nip46Client instanceof Nip46RpcClient ? client.nip46Client : null;
}

export async function createNip46Adapter(client) {
  const resolvedClient = resolveClient(client);
  if (!resolvedClient) {
    return {
      type: "nip46",
      pubkey: "",
      metadata: async () => null,
      relays: async () => null,
      signEvent: async () => {
        throw new Error("NIP-46 client unavailable.");
      },
      requestPermissions: async () => ({ ok: false, error: new Error("client-unavailable") }),
      destroy: async () => {},
      canSign: () => false,
    };
  }

  let pubkey = normalizeActorKey(resolvedClient.userPubkey);
  if (!pubkey) {
    pubkey = normalizeActorKey(await resolvedClient.getUserPubkey());
  }

  const signer = {
    type: "nip46",
    pubkey,
    metadata: async () =>
      resolvedClient.metadata && typeof resolvedClient.metadata === "object"
        ? { ...resolvedClient.metadata }
        : null,
    relays: async () => (Array.isArray(resolvedClient.relays) ? [...resolvedClient.relays] : null),
    signEvent: async (event) => resolvedClient.signEvent(event),
    requestPermissions: async () => ({ ok: true }),
    destroy: async () => {
      resolvedClient.destroy();
    },
    canSign: () =>
      !resolvedClient.destroyed && typeof resolvedClient.signEvent === "function",
  };

  if (typeof resolvedClient.nip04Encrypt === "function") {
    signer.nip04Encrypt = resolvedClient.nip04Encrypt.bind(resolvedClient);
  }
  if (typeof resolvedClient.nip04Decrypt === "function") {
    signer.nip04Decrypt = resolvedClient.nip04Decrypt.bind(resolvedClient);
  }
  if (typeof resolvedClient.nip44Encrypt === "function") {
    signer.nip44Encrypt = resolvedClient.nip44Encrypt.bind(resolvedClient);
  }
  if (typeof resolvedClient.nip44Decrypt === "function") {
    signer.nip44Decrypt = resolvedClient.nip44Decrypt.bind(resolvedClient);
  }

  return signer;
}
