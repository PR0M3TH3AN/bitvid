from playwright.sync_api import sync_playwright

def verify_profile_modal(page):
    page.goto("http://localhost:8001")

    # 1. Open the profile modal by clicking the avatar button
    # Assuming standard header layout; if not found, we will adapt.
    # The header avatar usually has an ID like 'profileAvatar' or 'headerProfileButton'.
    # I'll try to find a button with an image or "profile" in the name/aria-label.

    # The button ID is profileButton
    page.locator("#profileButton").click()

    # 2. Wait for modal to appear
    # The modal ID is #profileModal
    page.locator("#profileModal").wait_for(state="visible")

    # 3. Navigate to Messages tab
    # Button ID: #profileNavMessages
    page.locator("#profileNavMessages").click()

    # 4. Wait for messages pane to be visible
    page.locator("#profilePaneMessages").wait_for(state="visible")

    # 5. Take a screenshot of the full viewport to verify modal size and layout
    page.screenshot(path="verification/profile_modal_full.png", full_page=True)

    # 6. Take a screenshot specifically of the Composer area to check the "More" button
    composer = page.locator(".dm-composer")
    if composer.is_visible():
        composer.screenshot(path="verification/composer_layout.png")

        # 7. Click the "More" button to show the menu
        more_btn = page.locator(".dm-composer__more")
        more_btn.click()
        page.wait_for_timeout(200) # Wait for menu to unhide
        composer.screenshot(path="verification/composer_menu_open.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a desktop viewport size to verify full-screen behavior
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        try:
            verify_profile_modal(page)
        except Exception as e:
            print(f"Error: {e}")
            # Take a debug screenshot if things fail
            page.screenshot(path="verification/debug_fail.png")
        finally:
            browser.close()
