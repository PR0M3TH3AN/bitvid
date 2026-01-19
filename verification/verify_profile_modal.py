from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        # Navigate to the local server
        page.goto("http://localhost:8080/index.html")

        # Wait for the app to be ready (look for the header logo or similar)
        page.wait_for_selector(".ds-header__logo")

        # Force the profile modal to be visible by adding 'data-state="open"' or removing 'hidden' class
        # In the real app, we would click the profile button, but here we can just manipulate the DOM for testing the CSS
        page.evaluate("""
            const modal = document.getElementById('profileModal');
            modal.classList.remove('hidden');
            modal.style.display = 'flex'; // Ensure it's displayed as flex (from .bv-modal)
        """)

        # Wait a bit for transitions if any
        page.wait_for_timeout(500)

        # Take a screenshot of the full viewport to verify it covers everything
        page.screenshot(path="verification/profile_modal_fullscreen.png")

        browser.close()

if __name__ == "__main__":
    run()
