// Vendor entry for blossom-client-sdk (hzrd149), bundled by
// scripts/build-blossom-sdk.mjs into vendor/blossom-client-sdk.bundle.min.js so
// bitvid can lazy-import it behind FEATURE_BLOSSOM_STORAGE without a runtime CDN.
// Re-exports only the surface bitvid needs. See docs/blossom-plan.md.
//
// The action helpers live under the `./actions/*` subpaths (the root entry
// namespaces them as `Actions`); auth + discovery are top-level modules.
export {
  createUploadAuth,
  createMirrorAuth,
  createListAuth,
  createDeleteAuth,
  encodeAuthorizationHeader,
} from "blossom-client-sdk/auth";
export {
  getServersFromServerListEvent,
  USER_BLOSSOM_SERVER_LIST_KIND,
} from "blossom-client-sdk/nostr";
export {
  multiServerUpload,
  multiServerMediaUpload,
} from "blossom-client-sdk/actions/multi-server";
export { uploadBlob } from "blossom-client-sdk/actions/upload";
export { mirrorBlob } from "blossom-client-sdk/actions/mirror";
export { listBlobs, iterateBlobs } from "blossom-client-sdk/actions/list";
export { deleteBlob } from "blossom-client-sdk/actions/delete";
