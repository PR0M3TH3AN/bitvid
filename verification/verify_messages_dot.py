
from playwright.sync_api import sync_playwright

def verify_messages_dot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set a viewport that triggers the mobile menu view (or desktop, depending on where the nav is)
        # Profile modal uses a split layout on desktop (lg), and mobile view on smaller screens.
        # The prompt implies the "Messages" tab button which is visible in the sidebar navigation
        # inside the modal.
        # Let's target a desktop size to see the sidebar layout clearly.
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # Navigate to the app (assuming it's served on port 8000 based on memory)
        page.goto("http://localhost:8000/index.html")

        # Wait for page load
        page.wait_for_load_state("networkidle")

        # The profile modal is hidden by default. We need to open it.
        # Usually there is a profile button or we can force it open via JS.
        # Looking at index.html, there is a #profileButton (hidden by default) and #loginButton.
        # Let's try to simulate a logged-in state or just force the modal open.

        # Force the profile modal to be visible and have the 'Messages' tab unread dot visible.
        page.evaluate("""
            const modal = document.getElementById('profileModal');
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');

            // Force the unread dot to be visible
            const dot = document.getElementById('profileMessagesUnreadDot');
            if (dot) {
                dot.classList.add('is-visible');
                dot.style.display = 'block'; // Ensure it overrides any specific CSS if needed for test
            }

            // Highlight the messages button to simulate active state if needed,
            // but the prompt asked for visibility even when selected (red).
            // Let's make the messages button active.
            const msgBtn = document.getElementById('profileNavMessages');
            if (msgBtn) {
                msgBtn.setAttribute('data-state', 'active');
                msgBtn.setAttribute('aria-selected', 'true');
            }
        """)

        # Wait a moment for animations/styles
        page.wait_for_timeout(1000)

        # Take a screenshot of the navigation area in the profile modal
        # We target the profile modal nav or the specific button area.
        nav = page.locator("#profileNavMessages")
        if nav.is_visible():
            # Capture the button and some surrounding area to see the dot overhang
            # We can take a screenshot of the whole modal nav sidebar
            sidebar = page.locator(".profile-modal__nav")
            sidebar.screenshot(path="verification/messages_dot_verification.png")
            print("Screenshot taken: verification/messages_dot_verification.png")
        else:
            print("Profile nav messages button not visible.")
            # Fallback full page
            page.screenshot(path="verification/full_page_fallback.png")

        browser.close()

if __name__ == "__main__":
    verify_messages_dot()
