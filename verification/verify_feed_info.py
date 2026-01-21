import sys
import os
import time
from playwright.sync_api import sync_playwright

def verify_feed_info(page):
    print("Pre-seeding localStorage...")
    page.goto("http://localhost:8000") # Go to root first to set storage origin
    page.evaluate("window.localStorage.setItem('hasSeenDisclaimer', 'true')")

    print("Navigating to For You view...")
    page.goto("http://localhost:8000/#view=for-you")

    print("Waiting for feed info trigger...")
    trigger = page.locator("#feedInfoTrigger")
    try:
        trigger.wait_for(state="visible", timeout=10000)
    except Exception:
        page.screenshot(path="verification/debug_not_found.png")
        raise

    # Ensure no modals are blocking
    # We can try to force click or wait for potential overlays to disappear
    # But pre-seeding should handle the main one.

    print("Clicking trigger...")
    trigger.click()

    print("Waiting for popover...")
    popover = page.locator(".popover-panel")
    popover.wait_for(state="visible", timeout=5000)

    text = popover.inner_text()
    print(f"Popover text: {text}")

    expected = "Most Recent Video - Disinterests Tags - Watch History + Interests Tags"
    if expected not in text:
        raise Exception(f"Unexpected text: {text}")

    page.screenshot(path="verification/feed_info.png")
    print("Screenshot saved to verification/feed_info.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            verify_feed_info(page)
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        finally:
            browser.close()
