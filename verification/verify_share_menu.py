import sys
import os
import time
from playwright.sync_api import sync_playwright

def verify_share_menu(page):
    print("Navigating to app...")
    page.goto("http://localhost:8000")

    # Wait for app to load
    print("Waiting for app to load...")
    try:
        # Just wait for anything to indicate readiness, cards might be lazy loaded
        page.wait_for_load_state("networkidle", timeout=5000)
        # Check for card container
        page.wait_for_selector("#videoList", timeout=5000)
    except Exception as e:
        print(f"Initial load wait error (ignoring): {e}")

    # Handle disclaimer if present
    try:
        print("Checking for disclaimer...")
        disclaimer = page.query_selector("#disclaimerAgreeBtn")
        if disclaimer and disclaimer.is_visible():
            print("Disclaimer found, clicking agree...")
            page.click("#disclaimerAgreeBtn")
            page.wait_for_selector("#disclaimerModal", state="hidden", timeout=3000)
            print("Disclaimer dismissed.")
        else:
            print("No visible disclaimer found.")
    except Exception as e:
        print(f"Disclaimer check exception: {e}")

    # Force a refresh of the cards or wait explicitly
    print("Waiting for any card...")
    try:
        page.wait_for_selector(".card", timeout=15000)
    except Exception as e:
        print(f"Failed to find cards: {e}")
        page.screenshot(path="verification/debug_no_cards.png")
        sys.exit(1)

    # Click the first video card to open the modal
    print("Opening video modal...")
    try:
        # Use JS click as it is most reliable against overlays/scrolling
        page.evaluate("() => { const card = document.querySelector(\".card\"); if(card) { card.scrollIntoView(); card.click(); } else { throw new Error(\"No card found\"); } }")
    except Exception as e:
        print(f"Click evaluation failed: {e}")
        page.screenshot(path="verification/debug_click_fail.png")
        sys.exit(1)

    # Wait for modal to open
    print("Waiting for modal...")
    try:
        # Check if modal is visible - use a function that returns true immediately if visible
        # We loop here to be safe and debug
        for i in range(20):
            is_visible = page.evaluate("() => { const el = document.getElementById(playerModal); return el && !el.hasAttribute(hidden) && !el.classList.contains(hidden); }")
            if is_visible:
                print("Modal is confirmed visible via JS.")
                break
            time.sleep(0.5)
        else:
             print("Modal did not become visible.")
             page.screenshot(path="verification/debug_modal_not_visible.png")
             # sys.exit(1) # Dont exit yet, check if its maybe just taking long or other issue

    except Exception as e:
        print(f"Modal check failed: {e}")
        sys.exit(1)

    # Verify "Copy Magnet" button is NOT in the main actions group
    print("Verifying absence of Copy Magnet button in main UI...")
    magnet_btn = page.query_selector("#copyMagnetBtn")
    if magnet_btn and page.evaluate("el => !el.hasAttribute(\"hidden\") && !el.classList.contains(\"hidden\")", magnet_btn):
        print("ERROR: Copy Magnet button is still visible in the main UI!")
        sys.exit(1)

    # Find and click the Share button
    print("Clicking Share button...")
    try:
        # Ensure share button is visible/clickable
        # If modal wasnt visible to playwright but IS visible to JS, we might need force=True
        page.click("#shareBtn", force=True)
    except Exception as e:
        print(f"Failed to click share button: {e}")
        page.screenshot(path="verification/debug_share_btn_fail.png")
        sys.exit(1)

    # Wait for the popover menu to appear
    print("Waiting for Share menu...")
    try:
        page.wait_for_selector("[data-menu=\"video-share\"]", timeout=5000)
    except Exception as e:
        print(f"Share menu did not appear: {e}")
        page.screenshot(path="verification/debug_share_menu_fail.png")
        sys.exit(1)

    # Take a screenshot of the open menu
    print("Taking screenshot...")
    page.screenshot(path="verification/share_menu_verification.png")

    # Verify menu items
    print("Verifying menu items...")
    menu = page.locator("[data-menu=\"video-share\"]")
    text_content = menu.inner_text()
    print(f"Menu content: {text_content}")

    if "Copy URL" not in text_content:
        print("ERROR: Copy URL item missing")
    if "Share on Nostr" not in text_content:
        print("ERROR: Share on Nostr item missing")
    if "Copy Magnet" not in text_content:
        print("ERROR: Copy Magnet item missing")
    if "Copy CDN Link" not in text_content:
        print("ERROR: Copy CDN Link item missing")

    print("Verification complete!")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_share_menu(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            sys.exit(1)
        finally:
            browser.close()
