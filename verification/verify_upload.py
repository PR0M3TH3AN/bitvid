
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to the app
    page.goto("http://localhost:8080")

    # Wait for app
    page.wait_for_selector("#app")

    # Dismiss disclaimer if present
    try:
        if page.locator("#disclaimerModal").is_visible():
            page.locator("#disclaimerModal").get_by_role("button", name="I understand").click(timeout=2000)
    except:
        pass

    # 1. Verify the "Upload Content" Page
    print("Navigating to Upload Content view...")
    page.goto("http://localhost:8080/#view=upload-content")
    page.wait_for_timeout(2000)

    expect(page.locator("h2#uploadContentHeading")).to_have_text("Upload Content")
    page_icon = page.locator("#viewContainer img[src='assets/svg/upload-content-icon.svg']")
    expect(page_icon).to_be_visible()
    page.screenshot(path="verification/upload_content_page.png")
    print("Screenshot of page saved.")

    # 2. Verify the Link in Upload Modal
    # Force remove 'hidden' class from uploadButton
    page.evaluate("document.getElementById('uploadButton').classList.remove('hidden')")

    # Wait for it to be visible? Playwright waits for visibility.
    # Sometimes removing class isn't enough if parent is hidden, but parent is visible header.
    # The previous error said "element is not visible".
    # Let's force click via JS if UI click fails, or force visible style.

    page.evaluate("document.getElementById('uploadButton').style.display = 'block'")
    page.wait_for_selector("#uploadButton", state="visible")
    page.locator("#uploadButton").click()

    # Verify modal visible
    modal = page.locator("#uploadModal")
    # Modal also has 'hidden' class toggled by JS.
    # Wait for it.
    expect(modal).to_be_visible()

    # Open storage settings
    page.locator("#btn-storage-settings").click()

    # Verify link
    link = page.locator("#section-storage-settings").get_by_role("link", name="Learn How")
    expect(link).to_be_visible()
    expect(link).to_have_attribute("href", "#view=upload-content")

    # Verify link icon
    link_icon = link.locator("img")
    expect(link_icon).to_have_attribute("src", "assets/svg/upload-content-icon.svg")

    page.screenshot(path="verification/upload_modal_link.png")
    print("Screenshot of modal saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
