class DisclaimerModal {
  constructor() {
    this.modal = document.getElementById("disclaimerModal");
    this.acceptButton = document.getElementById("acceptDisclaimer");
    this.hasSeenDisclaimer = localStorage.getItem("hasSeenDisclaimer");

    this.setupEventListeners();
  }

  setupEventListeners() {
    const closeModal = () => {
      this.modal.style.display = "none";
      document.body.style.overflow = "unset";
      localStorage.setItem("hasSeenDisclaimer", "true");
    };

    // Only keep the accept button event listener
    this.acceptButton.addEventListener("click", closeModal);
  }

  show() {
    if (!this.hasSeenDisclaimer) {
      this.modal.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }
}

export const disclaimerModal = new DisclaimerModal();
