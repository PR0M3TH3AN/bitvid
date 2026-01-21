from playwright.sync_api import sync_playwright

def verify_profile_messages():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        # 1. Close disclaimer modal if present
        # The logs say #disclaimerModal intercepts events.
        try:
            page.wait_for_selector("#closeDisclaimerModal", timeout=5000)
            page.click("#closeDisclaimerModal")
        except:
            print("Disclaimer modal not found or not visible")

        # Also could be #disclaimerAgreeBtn
        try:
            page.wait_for_selector("#disclaimerAgreeBtn", timeout=2000)
            page.click("#disclaimerAgreeBtn")
        except:
            pass

        # 2. Open Profile Modal via JS
        page.evaluate("""
            const modal = document.getElementById('profileModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.setAttribute('aria-hidden', 'false');
                document.body.classList.add('modal-open');

                // Ensure profile modal is on top if multiple modals
                modal.style.zIndex = '9999';
            }
        """)

        # 3. Click Messages tab
        # Wait for animation/visibility
        page.wait_for_timeout(500)
        page.click("#profileNavMessages")

        # 4. Wait for AppShell
        page.wait_for_selector("#dmAppShellMount")
        page.wait_for_timeout(2000)

        # 5. Take screenshot
        page.screenshot(path="verification_profile_messages.png")
        browser.close()

if __name__ == "__main__":
    verify_profile_messages()
