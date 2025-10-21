// js/nostrClientRegistry.js

let registeredNostrClient = null;
let requestPermissionsDelegate = null;

export function registerNostrClient(client, options = {}) {
  registeredNostrClient = client || null;

  if (typeof options.requestPermissions === "function") {
    requestPermissionsDelegate = options.requestPermissions;
    return;
  }

  if (
    registeredNostrClient &&
    typeof registeredNostrClient.ensureExtensionPermissions === "function"
  ) {
    requestPermissionsDelegate = (...args) =>
      registeredNostrClient.ensureExtensionPermissions(...args);
    return;
  }

  requestPermissionsDelegate = null;
}

export function getRegisteredNostrClient() {
  return registeredNostrClient;
}

export function clearNostrClientRegistration() {
  registeredNostrClient = null;
  requestPermissionsDelegate = null;
}

export function requestDefaultExtensionPermissions(...args) {
  if (typeof requestPermissionsDelegate === "function") {
    try {
      return requestPermissionsDelegate(...args);
    } catch (error) {
      return Promise.resolve({ ok: false, error });
    }
  }

  const error = new Error("Nostr client is not registered.");
  return Promise.resolve({ ok: false, error });
}

export const __nostrClientRegistryTestHooks = {
  clearNostrClientRegistration,
};
