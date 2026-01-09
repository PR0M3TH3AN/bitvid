
from playwright.sync_api import sync_playwright, expect
import re

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

    # 1. Verify the Sidebar Link
    print("Verifying Sidebar Link...")
    # Open "More" dropdown in sidebar
    page.locator("#footerDropdownButton").click()
    # Wait for dropdown
    page.wait_for_selector("#footerLinksContainer:not(.hidden)")

    # Check for "Upload Content" link
    sidebar_link = page.get_by_role("link", name="Upload Content")
    expect(sidebar_link).to_be_visible()

    # Verify icon in sidebar link
    sidebar_icon = sidebar_link.locator("img")
    expect(sidebar_icon).to_have_attribute("src", "assets/svg/upload-content-icon.svg")

    page.screenshot(path="verification/sidebar_link.png")
    print("Screenshot of sidebar link saved.")

    # 2. Verify the Modal Link Update
    print("Verifying Modal Link...")
    # Open modal
    page.evaluate("document.getElementById('uploadButton').classList.remove('hidden')")
    page.evaluate("document.getElementById('uploadButton').style.display = 'block'")
    page.wait_for_selector("#uploadButton", state="visible")
    page.locator("#uploadButton").click()

    # Wait for modal
    modal = page.locator("#uploadModal")
    expect(modal).to_be_visible()

    # Open storage settings
    page.locator("#btn-storage-settings").click()

    # Verify link is now button-like and no target=_blank
    settings_section = page.locator("#section-storage-settings")
    link = settings_section.get_by_role("link", name="Learn How")
    expect(link).to_be_visible()

    # Check class for button styling (using regex on the class attribute string directly)
    class_attr = link.get_attribute("class")
    if not re.search(r"btn.*btn-ghost.*btn-xs", class_attr):
        raise Exception(f"Link classes do not match expected button styling. Found: {class_attr}")

    # Check href
    expect(link).to_have_attribute("href", "#view=upload-content")

    # Check NO target="_blank"
    target = link.get_attribute("target")
    if target == "_blank":
        raise Exception("Link still has target='_blank'")

    print("Link target verified (not _blank).")

    page.screenshot(path="verification/upload_modal_updated.png")
    print("Screenshot of updated modal saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
