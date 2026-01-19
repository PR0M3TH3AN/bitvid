from playwright.sync_api import sync_playwright, expect

def verify_avatar_size():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the index page directly via file protocol (assuming no build step is needed for CSS)
        # Note: In a real environment we might need a server, but let's try direct file access first
        # as tailwind.generated.css might be needed.
        # Checking if we need to build first.

        # Actually, let's just inspect the CSS rules applied to an element we create dynamically
        # or load a simple HTML that imports the CSS.

        # Let's try to load the app. If it fails, we will create a minimal reproduction.
        try:
            # We need to serve the files. Let's use python's http.server in background?
            # Or just assume we can open index.html if it exists.
            import os
            cwd = os.getcwd()
            page.goto(f"file://{cwd}/index.html")

            # The app might need JS to render anything.
            # Let's inject a contact row manually into the body to test the CSS.

            page.evaluate("""
                document.body.innerHTML = `
                    <div class="dm-contact-row" style="width: 200px; display: flex;">
                        <div class="dm-avatar dm-avatar--md" style="background: red;">
                            <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" />
                        </div>
                        <div class="dm-contact-row__content" style="flex: 1; min-width: 0;">
                            <div class="dm-contact-row__name">A very long name that should normally shrink the avatar if flex-shrink is not set to 0</div>
                        </div>
                    </div>
                `;
            """)

            # Allow some time for styles to apply if they are loaded async
            page.wait_for_timeout(1000)

            # Take a screenshot
            page.screenshot(path="verification/avatar_verification.png")

            # Also evaluate the computed style of the avatar
            flex_shrink = page.evaluate("""
                window.getComputedStyle(document.querySelector('.dm-avatar')).flexShrink
            """)

            print(f"Computed flex-shrink: {flex_shrink}")

            if flex_shrink == '0':
                print("SUCCESS: flex-shrink is 0")
            else:
                print("FAILURE: flex-shrink is NOT 0")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_avatar_size()
