from playwright.sync_api import sync_playwright
import time

def verify_moderation_style(page):
    print("Navigating to app...")
    page.goto("http://localhost:8080")

    # Wait for the app to initialize
    print("Waiting for #videoList...")
    page.wait_for_selector("#videoList", timeout=30000)

    # Inject logic to manipulate DOM directly to verify structure and styles
    print("Manipulating DOM to show modal...")
    page.evaluate("""
        const modal = document.getElementById('playerModal');
        modal.classList.remove('hidden');
        modal.removeAttribute('hidden');
        document.body.classList.add('modal-open');

        // Find the moderation bar and show it in "neutral" state (simulating "Show anyway")
        const bar = modal.querySelector('[data-moderation-bar]');
        if (bar) {
            bar.removeAttribute('hidden');
            const badge = bar.querySelector('.moderation-badge');
            if (badge) {
                badge.setAttribute('data-variant', 'neutral');
                const text = badge.querySelector('[data-moderation-text]');
                if (text) text.textContent = "Showing despite blocked content";
            }
        }

        // Unblur video but blur avatar to simulate "active moderation" state visually
        // (Though logically if "neutral" usually implies override, maybe we want to test that too.
        // Let's test the specific requirement: Avatar Blur + Text Color)

        // Force blur on avatar
        const avatarImg = modal.querySelector('.channel-card__avatar img');
        if (avatarImg) {
            avatarImg.src = 'assets/svg/default-profile.svg'; // Ensure src so it renders
            avatarImg.dataset.visualState = 'blurred';
        }
    """)

    time.sleep(1)

    # Test Dark Mode first (usually default or we can toggle)
    # Check if we can toggle theme.
    # Assuming default might be light or system. Let's force dark mode if possible.
    print("Setting Dark Mode...")
    page.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
    time.sleep(0.5)
    page.screenshot(path="verification/3_dark_mode_neutral.png")
    print("Screenshot 3 taken: Dark Mode Neutral Badge + Blurred Avatar")

    # Verify Avatar Blur CSS
    # We can check computed style via evaluate
    blur_filter = page.evaluate("""
        () => {
            const img = document.querySelector('#playerModal .channel-card__avatar img');
            return window.getComputedStyle(img).filter;
        }
    """)
    print(f"Avatar Filter: {blur_filter}")
    if "blur" in blur_filter:
        print("SUCCESS: Avatar has blur filter applied.")
    else:
        print("FAILURE: Avatar does NOT have blur filter.")

    # Verify Text Color in Dark Mode
    # The badge text should be readable (light color in dark mode)
    text_color = page.evaluate("""
        () => {
            const badge = document.querySelector('#playerModal .video-modal__moderation-bar .moderation-badge');
            return window.getComputedStyle(badge).color;
        }
    """)
    print(f"Badge Text Color (Dark Mode): {text_color}")
    # In dark mode, text should be rgb(226, 232, 240) or similar light color.
    # rgb(24, 31, 44) is dark.

    # Simple check: sum of RGB should be high for light color
    import re
    rgb = re.findall(r'\d+', text_color)
    if rgb and len(rgb) >= 3:
        brightness = sum(map(int, rgb[:3]))
        print(f"Text Brightness: {brightness}")
        if brightness > 300: # Arbitrary threshold for "light enough"
            print("SUCCESS: Text is light in Dark Mode.")
        else:
            print("FAILURE: Text is dark in Dark Mode (Hard to read).")

    # Test Light Mode
    print("Setting Light Mode...")
    page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
    time.sleep(0.5)
    page.screenshot(path="verification/4_light_mode_neutral.png")
    print("Screenshot 4 taken: Light Mode Neutral Badge")

    text_color_light = page.evaluate("""
        () => {
            const badge = document.querySelector('#playerModal .video-modal__moderation-bar .moderation-badge');
            return window.getComputedStyle(badge).color;
        }
    """)
    print(f"Badge Text Color (Light Mode): {text_color_light}")
    rgb_light = re.findall(r'\d+', text_color_light)
    if rgb_light and len(rgb_light) >= 3:
        brightness_light = sum(map(int, rgb_light[:3]))
        print(f"Text Brightness: {brightness_light}")
        if brightness_light < 400: # Arbitrary threshold for "dark enough"
            print("SUCCESS: Text is dark in Light Mode.")
        else:
            print("FAILURE: Text is light in Light Mode (Hard to read).")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        verify_moderation_style(page)
    except Exception as e:
        print(f"Verification failed: {e}")
    finally:
        browser.close()
