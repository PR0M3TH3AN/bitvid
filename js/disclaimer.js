// js/disclaimer.js

class DisclaimerModal {
  constructor() {
    // Initialize elements when the disclaimer HTML is in the DOM.
    this.init();
  }

  init() {
    this.modal = document.getElementById("disclaimerModal");
    this.acceptButton = document.getElementById("acceptDisclaimer");
    if (this.acceptButton) {
      this.acceptButton.addEventListener("click", () => {
        this.hide();
      });
    }
  }

  hide() {
    if (this.modal) {
      this.modal.classList.add("hidden");
    }
    localStorage.setItem("hasSeenDisclaimer", "true");
  }

  show() {
    // In case the modal hasn't been initialized yet.
    if (!this.modal) {
      this.init();
    }
    if (!localStorage.getItem("hasSeenDisclaimer") && this.modal) {
      this.modal.classList.remove("hidden");
    }
  }
}

// Create and export a default instance.
const disclaimerModal = new DisclaimerModal();
export default disclaimerModal;
