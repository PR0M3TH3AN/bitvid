// js/nostr/defaultClient.js

import { NostrClient } from "./client.js";
import {
  DEFAULT_NIP07_CORE_METHODS,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
} from "./nip07Permissions.js";
import {
  registerNostrClient,
  requestDefaultExtensionPermissions as requestRegisteredPermissions,
} from "../nostrClientRegistry.js";

export const nostrClient = new NostrClient();

registerNostrClient(nostrClient, {
  requestPermissions: (
    methods = DEFAULT_NIP07_PERMISSION_METHODS,
  ) => nostrClient.ensureExtensionPermissions(methods),
});

export function requestDefaultExtensionPermissions(
  methods = DEFAULT_NIP07_PERMISSION_METHODS,
) {
  return requestRegisteredPermissions(methods);
}

export {
  NostrClient,
  DEFAULT_NIP07_CORE_METHODS,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
};
