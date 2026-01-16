from playwright.sync_api import sync_playwright
import time

def verify_moderation(page):
    print("Navigating to app...")
    page.goto("http://localhost:8080")

    # Wait for the app to initialize
    page.wait_for_selector("#videoList")

    # Inject script to open a mock moderated video
    print("Injecting mock video...")
    page.evaluate("""
        const mockVideo = {
            id: "mock-video-1",
            title: "Moderated Video Test",
            description: "This is a test video.",
            pubkey: "mock-pubkey",
            moderation: {
                trustedMuted: true,
                shouldShow: true,
                trustedMuteCount: 5,
                trustedMuteDisplayNames: ["Alice", "Bob"]
            }
        };

        // Access the app instance from the window object (assuming it's attached or reachable)
        // If not attached, we might need to find where 'app' variable is stored.
        // Looking at app.js, it seems 'app' is not globally exposed by default,
        // but often it is assigned to window.app in main.js or index.js.

        // Let's try to find the videoModal instance via DOM if app is not global
        // But app.js likely attaches it to window for debugging or it's in a module.

        // Assumption: window.app is available. If not, we might fail here.
        if (window.app && window.app.videoModal) {
            window.app.videoModal.open(mockVideo);
        } else {
            console.error("window.app.videoModal not found");
        }
    """)

    # Wait for modal to open
    page.wait_for_selector("#playerModal:not(.hidden)")
    print("Modal opened.")

    # Take screenshot of BLOCKED state
    # We expect the moderation bar to be visible above the video
    time.sleep(1) # Wait for animations
    page.screenshot(path="verification/1_blocked_state.png")
    print("Screenshot 1 taken: Blocked state")

    # Check if moderation bar is present
    bar = page.locator("[data-moderation-bar]")
    if bar.is_visible():
        print("Moderation bar is visible.")
    else:
        print("ERROR: Moderation bar is NOT visible.")

    # Click "Show anyway"
    print("Clicking 'Show anyway'...")
    page.click("[data-moderation-action='override']")

    # Wait for update
    time.sleep(1)

    # Take screenshot of UNBLOCKED state
    page.screenshot(path="verification/2_unblocked_state.png")
    print("Screenshot 2 taken: Unblocked state")

    # Check if moderation bar is STILL visible
    if bar.is_visible():
        print("Moderation bar is visible (Correct).")
        # Check text content
        text = page.locator("[data-moderation-text]").inner_text()
        print(f"Moderation text: {text}")
        if "Content or user blocked" in text: # It might still say blocked, but button should change
             print("Text verification needs update based on logic.")

        # Check if button changed to "Restore default moderation" (or "Hide")
        button_text = page.locator("[data-moderation-action='hide']").inner_text()
        print(f"Button text: {button_text}")

    else:
        print("ERROR: Moderation bar is NOT visible (Incorrect).")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        verify_moderation(page)
    except Exception as e:
        print(f"Verification failed: {e}")
    finally:
        browser.close()
