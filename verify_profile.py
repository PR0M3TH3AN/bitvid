
from playwright.sync_api import sync_playwright

def verify_profile_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # Navigate to the app
        page.goto("http://localhost:8000")

        # Wait for the page to load
        page.wait_for_load_state("networkidle")

        # Make the profile modal visible
        page.evaluate("""() => {
            const modal = document.getElementById('profileModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.setAttribute('aria-hidden', 'false');
            }
        }""")

        # Force the Messages pane to be visible
        page.evaluate("""() => {
            const pane = document.getElementById('profilePaneMessages');
            if (pane) {
                pane.classList.remove('hidden');
                pane.removeAttribute('hidden');
                // Ensure other panes are hidden if needed, but not strictly necessary for content check
            }
        }""")

        # Wait for the pane to become active/visible
        page.wait_for_selector("#profilePaneMessages:not(.hidden)")

        # Take a screenshot
        page.screenshot(path="verification_profile_messages.png")

        content = page.content()
        if "Direct message privacy" in content:
            print("FAILURE: 'Direct message privacy' text found in the page source.")
        else:
            print("SUCCESS: 'Direct message privacy' text NOT found.")

        if "Read receipts" in content and "Direct message privacy" in content:
             print("FAILURE: 'Read receipts' text found.")

        browser.close()

if __name__ == "__main__":
    verify_profile_modal()
