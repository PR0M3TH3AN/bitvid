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
import { devLogger, userLogger } from "../utils/logger.js";
import { closeStaticModal } from "./components/staticModalAccessibility.js";
import { setModalState as setGlobalModalState } from "../state/appState.js";
import { createBitloginAdapter } from "../nostr/adapters/bitloginAdapter.js";
import { setPendingBitloginResult } from "../services/authProviders/bitlogin.js";
import bitloginProvider from "../services/authProviders/bitlogin.js";
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

// Cheap insurance against wireBitloginLogin() ever running twice for the same
// element (e.g. a future bootstrap change that calls it more than once): the
// same <bitlogin-auth> instance should only ever get one "bitlogin-login"
// listener, since two would each race the shared, single-read `pendingResult`
// and each independently call requestLogin() for one real sign-in.
const wiredWidgets = new WeakSet();

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

  if (wiredWidgets.has(widget)) {
    return;
  }
  wiredWidgets.add(widget);

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
      // bitvid rejecting the sign-in (e.g. the invite-only access-control
      // check) leaves the widget itself still showing its own "Signed in"
      // screen -- BitLogin succeeded on its own terms, bitvid just didn't
      // accept the identity. Reset the widget and surface the real reason
      // through the same error-banner path every other sign-in method uses
      // (devLogger.warn is a silent no-op outside dev mode -- see
      // IS_DEV_MODE in config/instance-config.js -- so relying on it here
      // meant a rejected user saw no feedback at all).
      userLogger.warn("[BitLogin] Sign-in failed to apply:", error);
      const maybePromise = app?.handleLoginModalError?.({
        error,
        provider: bitloginProvider,
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.catch((handlerError) => {
          devLogger.warn(
            "[BitLogin] handleLoginModalError threw:",
            handlerError,
          );
        });
      }
      try {
        await widget.logout();
      } catch (logoutError) {
        devLogger.warn(
          "[BitLogin] Failed to reset widget after a rejected sign-in:",
          logoutError,
        );
      }
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
