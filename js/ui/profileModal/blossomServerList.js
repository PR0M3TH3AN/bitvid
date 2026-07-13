// BUD-03 (kind 10063) Blossom server-list import/publish — the relay read/write
// logic, extracted from ProfileStorageController so it stays thin and this is
// unit-testable. Each function returns a { kind, message, ... } result the UI can
// render directly (never throws). See docs/blossom-plan.md (Decision 3).
import { serversFromServerListEvent } from "../../services/blossomService.js";
import {
  buildBlossomServerListEvent,
  BLOSSOM_SERVER_LIST_KIND,
} from "../../nostrEventSchemas.js";

function readRelaysOf(client) {
  if (Array.isArray(client?.readRelays) && client.readRelays.length) {
    return client.readRelays;
  }
  return Array.isArray(client?.relays) ? client.relays : [];
}

/**
 * Fetch the newest kind-10063 server list published by `pubkey` and return its
 * servers. Does NOT persist — the caller drops them into the form for Save.
 *
 * @returns {Promise<{kind:"success"|"error", message:string, servers?:string[], error?:unknown}>}
 */
export async function importBlossomServerList({ client, pubkey } = {}) {
  if (!client || typeof client.getSubscriptionManager !== "function" || !pubkey) {
    return { kind: "error", message: "Log in to import your server list." };
  }
  try {
    const events = await client.getSubscriptionManager().list({
      filters: [{ kinds: [BLOSSOM_SERVER_LIST_KIND], authors: [pubkey] }],
      relays: readRelaysOf(client),
    });
    const newest = (Array.isArray(events) ? events : [])
      .filter((e) => e && Array.isArray(e.tags))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    const servers = newest ? serversFromServerListEvent(newest) : [];
    if (!servers.length) {
      return {
        kind: "error",
        message: "No published server list found for your account.",
      };
    }
    return {
      kind: "success",
      message: `Imported ${servers.length} server(s). Click Save to use them.`,
      servers,
    };
  } catch (error) {
    return { kind: "error", message: "Import failed. Please try again.", error };
  }
}

/**
 * Build + sign + publish the given servers as the user's kind-10063 list.
 *
 * @returns {Promise<{kind:"success"|"error", message:string, error?:unknown}>}
 */
export async function publishBlossomServerList({ client, pubkey, servers } = {}) {
  if (!client || typeof client.signAndPublishEvent !== "function" || !pubkey) {
    return { kind: "error", message: "Log in to publish your server list." };
  }
  if (!Array.isArray(servers) || servers.length === 0) {
    return { kind: "error", message: "Add at least one server first." };
  }
  try {
    const event = buildBlossomServerListEvent({
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      servers,
    });
    await client.signAndPublishEvent(event);
    return {
      kind: "success",
      message: `Published ${servers.length} server(s) to your Nostr relays.`,
    };
  } catch (error) {
    return { kind: "error", message: "Publish failed. Please try again.", error };
  }
}
