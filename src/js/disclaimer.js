class DisclaimerModal {
  constructor() {
    this.modal = document.getElementById("disclaimerModal");
    this.acceptButton = document.getElementById("acceptDisclaimer");
    // If user previously dismissed the disclaimer, we'll store "true" in localStorage:
    this.hasSeenDisclaimer = localStorage.getItem("hasSeenDisclaimer");

    // Set up the click event for the "I Understand" button
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.acceptButton) {
      this.acceptButton.addEventListener("click", () => {
        // Hide the disclaimer by adding the "hidden" class
        if (this.modal) {
          this.modal.classList.add("hidden");
        }
        // Mark that the user has seen the disclaimer, so we don't show it again
        localStorage.setItem("hasSeenDisclaimer", "true");
      });
    }
  }

  show() {
    // Only show it if the user hasn't seen it before
    if (!this.hasSeenDisclaimer) {
      if (this.modal) {
        this.modal.classList.remove("hidden");
      }
    }
  }
}

// Export an instance that you can import in your main script
export const disclaimerModal = new DisclaimerModal();
