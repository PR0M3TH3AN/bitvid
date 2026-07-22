// js/ui/bitloginModalIntegration.js
//
// Wires the permanent <bitlogin-auth id="bitloginWidget"> element -- declared
// once, statically, in components/login-modal.html, never written by an
// innerHTML re-render -- into the exact same session-establishment path every
// other sign-in method uses (AuthService.requestLogin -> handleAuthLogin).
// BitLogin isn't a single button-click-then-await-a-promise flow like the
// other providers, it's a whole multi-screen sign-in/create/recover UI, so it
// gets its own widget in the modal instead of a grid button (see
// providersForModal in js/services/authProviders/index.js) and its own small
// integration module here rather than special-casing LoginModalController.
import { devLogger } from "../utils/logger.js";
import { closeStaticModal } from "./components/staticModalAccessibility.js";
import { setModalState as setGlobalModalState } from "../state/appState.js";
import { createBitloginAdapter } from "../nostr/adapters/bitloginAdapter.js";
import { setPendingBitloginResult } from "../services/authProviders/bitlogin.js";
import { FEATURE_BITLOGIN } from "../constants.js";

// Vendored, pinned BitLogin widget bundle (scripts/build-bitlogin-widget.mjs).
// Lazy-imported so its ~350KB never weighs on the main bundle for visitors who
// never open the login modal, mirroring the existing Bitcoin Connect vendor
// step (js/ui/profileModal/ProfileWalletController.js). A plain dynamic
// import is enough: the bundle's only job is the customElements.define("bitlogin-auth")
// side effect, which retroactively upgrades the already-present <bitlogin-auth>
// tag in the modal's static HTML once it resolves.
const BITLOGIN_WIDGET_BUNDLE_URL = "../../vendor/bitlogin/bitlogin.js";

let widgetLoadPromise = null;

function loadBitloginWidgetOnce() {
  if (!widgetLoadPromise) {
    widgetLoadPromise = import(BITLOGIN_WIDGET_BUNDLE_URL).catch((error) => {
      widgetLoadPromise = null;
      throw error;
    });
  }
  return widgetLoadPromise;
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  if (modal && closeStaticModal(modal)) {
    setGlobalModalState("login", false);
  }
}

function attachWidget(app, widget) {
  const mount = document.getElementById("bitloginMount");
  if (!FEATURE_BITLOGIN) {
    // Unstable-branch experiment (AGENTS.md §1, config/instance-config.js) --
    // leave the permanent, statically-declared markup in place but never load
    // the vendored bundle or show the (otherwise-empty, unupgraded) element.
    if (mount instanceof HTMLElement) {
      mount.hidden = true;
    }
    return;
  }
  if (mount instanceof HTMLElement) {
    mount.hidden = false;
  }

  loadBitloginWidgetOnce().catch((error) => {
    devLogger.warn("[BitLogin] Failed to load the widget bundle:", error);
  });

  widget.addEventListener("bitlogin-login", async (event) => {
    const pubkey =
      event?.detail && typeof event.detail.publicKey === "string"
        ? event.detail.publicKey.trim()
        : "";
    if (!pubkey) {
      return;
    }

    setPendingBitloginResult({
      pubkey,
      signer: createBitloginAdapter(widget, pubkey),
    });

    try {
      await app.authService.requestLogin({ providerId: "bitlogin" });
      closeLoginModal();
    } catch (error) {
      devLogger.warn("[BitLogin] Sign-in failed to apply:", error);
    }
  });
}

/**
 * Call once during app bootstrap, after `app.authService` exists. The login
 * modal's HTML (including the permanent #bitloginWidget element) loads
 * asynchronously (js/index.js bootstrapInterface()) and isn't guaranteed to be
 * in the DOM yet at this point, so this waits for it rather than requiring a
 * specific call order between the two.
 * @param {{ authService: { requestLogin: Function } }} app
 */
export function wireBitloginLogin(app) {
  if (!app?.authService) {
    return;
  }

  const existing = document.getElementById("bitloginWidget");
  if (existing instanceof HTMLElement) {
    attachWidget(app, existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const widget = document.getElementById("bitloginWidget");
    if (widget instanceof HTMLElement) {
      observer.disconnect();
      attachWidget(app, widget);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
