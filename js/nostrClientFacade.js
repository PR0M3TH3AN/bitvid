// js/nostrClientFacade.js
//
// Compatibility-forwarding module that exposes the default Nostr client
// singleton alongside the convenience permission helper.
// Future modules should import from this facade instead of reaching into the
// nested default client implementation directly.

export {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr/defaultClient.js";
