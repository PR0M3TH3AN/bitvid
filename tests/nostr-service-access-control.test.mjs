import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (typeof globalThis.window.NostrTools === "undefined") {
  globalThis.window.NostrTools = {};
}

if (typeof globalThis.window.NostrTools.nip19 === "undefined") {
  globalThis.window.NostrTools.nip19 = {
    npubEncode(hex) {
      if (typeof hex !== "string") {
        throw new Error("invalid hex");
      }
      const trimmed = hex.trim();
      if (!trimmed) {
        throw new Error("empty hex");
      }
      return `npub1${trimmed}`;
    },
    decode(value) {
      if (typeof value !== "string") {
        throw new Error("invalid input");
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error("empty input");
      }
      return { type: "npub", data: trimmed.slice(5) || "" };
    },
  };
}

const { NostrService } = await import("../js/services/nostrService.js");
const { AccessControl } = await import("../js/accessControl.js");

{
  const service = new NostrService();
  const viewerPubkey = "a1b2c3";
  service.nostrClient = { pubkey: viewerPubkey };

  let accessControlInvocations = 0;
  service.accessControl = {
    canAccess() {
      accessControlInvocations += 1;
      return false;
    },
  };

  const video = {
    id: "evt", 
    pubkey: viewerPubkey,
    isPrivate: false,
    isNsfw: false,
  };

  const included = service.shouldIncludeVideo(video);
  assert.equal(
    included,
    true,
    "viewer-authored videos should bypass access control filters",
  );
  assert.equal(
    accessControlInvocations,
    0,
    "access control should not run for viewer-authored videos",
  );
}

{
  const control = new AccessControl();
  control.whitelistEnabled = true;
  control.whitelist = new Set();
  control.blacklist = new Set();
  control.hasLoaded = false;

  const allowed = control.canAccess({ npub: "npub1viewer" });
  assert.equal(
    allowed,
    true,
    "access control should allow access before admin lists finish loading",
  );
}

{
  const control = new AccessControl();
  control.whitelistEnabled = true;
  control.whitelist = new Set(["npub1allowed"]);
  control.blacklist = new Set();
  control.hasLoaded = true;

  assert.equal(
    control.canAccess({ npub: "npub1allowed" }),
    true,
    "whitelisted authors should remain accessible after lists load",
  );

  assert.equal(
    control.canAccess({ npub: "npub1other" }),
    false,
    "non-whitelisted authors should be filtered once admin lists load",
  );
}
