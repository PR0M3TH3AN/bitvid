// Vendor entry for Alby's Bitcoin Connect (getalby/bitcoin-connect), bundled by
// scripts/build-bitcoin-connect.mjs into vendor/bitcoin-connect.bundle.min.js so
// bitvid can lazy-import it behind FEATURE_BITCOIN_CONNECT without a runtime CDN.
//
// Importing the package self-registers its web components (bc-modal, etc.), so a
// single import both loads the API and boots the UI. We re-export only the small
// surface ProfileWalletController needs. See docs/bitcoin-connect-plan.md.
export {
  init,
  launchModal,
  closeModal,
  onConnected,
  onDisconnected,
  disconnect,
  getConnectorConfig,
  isConnected,
} from "@getalby/bitcoin-connect";
