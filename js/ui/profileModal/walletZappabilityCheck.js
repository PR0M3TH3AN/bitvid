import { checkLightningAddressZappable } from "../../payments/lnurl.js";
import { devLogger } from "../../utils/logger.js";

// Warn the creator if their OWN receiving Lightning address can't be reached from
// a browser (so people can't zap them on bitvid). Best-effort, non-blocking; runs
// after a successful wallet save. The probe is the exact fetch a zapper's browser
// would make, so a failure here means a failure for everyone. `controller` is the
// ProfileWalletController (provides mainController + updateWalletStatus).
export async function runWalletZappabilityCheck(controller, pubkey) {
  try {
    const main = controller?.mainController;
    const entry =
      typeof main?.getProfileCacheEntry === "function"
        ? main.getProfileCacheEntry(pubkey)
        : null;
    const profile = entry?.profile || null;
    // No cached profile -> can't determine; don't guess (avoid a false warning).
    if (!profile) {
      return;
    }

    const address =
      (typeof profile.lud16 === "string" && profile.lud16.trim()) ||
      (typeof profile.lud06 === "string" && profile.lud06.trim()) ||
      "";

    if (!address) {
      controller.updateWalletStatus(
        "Wallet saved. Tip: add a Lightning address to your Nostr profile so people can zap you on bitvid.",
        "info",
      );
      return;
    }

    const result = await checkLightningAddressZappable(address);
    if (!result.ok) {
      const message =
        `Heads up: your Lightning address (${address}) can't be reached from a browser ` +
        "— its host may be offline or blocking browser requests (no CORS). People may " +
        "not be able to zap you on bitvid. A host with proper CORS support (e.g. Alby, " +
        "Coinos, Wallet of Satoshi) fixes this.";
      controller.updateWalletStatus(message, "error");
      main.showError(message);
      return;
    }

    if (result.reason === "no-nostr") {
      controller.updateWalletStatus(
        `Your Lightning address (${address}) is reachable, but its host doesn't advertise ` +
          "Nostr zaps — payments may work without a zap receipt.",
        "info",
      );
      return;
    }

    controller.updateWalletStatus(
      `Wallet saved. Your Lightning address (${address}) is reachable — people can zap you on bitvid.`,
      "success",
    );
  } catch (error) {
    devLogger.warn("[ProfileModal] Lightning zappability check failed:", error);
  }
}
