// js/disclaimer.js

import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./ui/components/staticModalAccessibility.js";

class DisclaimerModal {
  constructor() {
    this.modal = null;
    this.acceptButton = null;
    this.acceptHandler = null;
  }

  init() {
    this.modal = document.getElementById("disclaimerModal");
    if (this.modal) {
      prepareStaticModal({ root: this.modal });
    }
    const nextAcceptButton = document.getElementById("acceptDisclaimer");

    if (!this.acceptHandler) {
      this.acceptHandler = () => {
        this.hide();
      };
    }

    if (this.acceptButton && this.acceptHandler) {
      this.acceptButton.removeEventListener("click", this.acceptHandler);
    }

    this.acceptButton = nextAcceptButton || null;

    if (this.acceptButton && this.acceptHandler) {
      this.acceptButton.addEventListener("click", this.acceptHandler);
    }
  }

  hide() {
    if (this.modal && !closeStaticModal(this.modal)) {
      this.modal.classList.add("hidden");
    }
    localStorage.setItem("hasSeenDisclaimer", "true");
  }

  show() {
    // Check if Playwright automation requested to bypass the disclaimer
    if (localStorage.getItem("playwright-bypass-disclaimer") === "true") {
      return;
    }

    // In case the modal hasn't been initialized yet.
    if (!this.modal) {
      this.init();
    }
    if (!localStorage.getItem("hasSeenDisclaimer") && this.modal) {
      if (!openStaticModal(this.modal)) {
        this.modal.classList.remove("hidden");
      }
    }
  }
}

// Create and export a default instance.
const disclaimerModal = new DisclaimerModal();
export default disclaimerModal;
