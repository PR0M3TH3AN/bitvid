from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to app with test mode enabled
    page.goto("http://localhost:8000/?__test__=1")

    # Wait for the app to load
    page.wait_for_load_state("networkidle")

    # Wait for bitvidApp to be available on window
    page.wait_for_function("window.bitvidApp !== undefined")

    # Wait for profileController to be initialized
    page.wait_for_function("window.bitvidApp.profileController !== undefined")
    page.wait_for_function("window.bitvidApp.profileController.subscriptionHistoryController !== undefined")

    # Open the subscription history modal with a dummy pubkey
    # Use the nested controller
    page.evaluate("""
        const pubkey = 'bce1bf7313e788f8d702cfa23759cfde9d980c70a6ba839e02d4f872541b1828'; // dummy hex
        window.bitvidApp.profileController.subscriptionHistoryController.show(pubkey);
    """)

    # Wait for modal to be visible
    page.wait_for_selector("#subscriptionHistoryModal:not(.hidden)")

    # Wait a bit for potential fetch/render (it will show empty or error)
    page.wait_for_timeout(2000)

    # Take screenshot of the modal
    page.screenshot(path="verification/subscription_history_modal.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
