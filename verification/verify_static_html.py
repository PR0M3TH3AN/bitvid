
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the HTML template file directly by fetching it and injecting it
        # effectively unit-testing the template structure in a browser
        page.goto("http://localhost:8080")

        # Inject the modal HTML manually to verify the static changes
        page.evaluate("""async () => {
            const response = await fetch("/components/upload-modal.html");
            const html = await response.text();
            document.body.innerHTML = html;
            document.getElementById("uploadModal").classList.remove("hidden");
            document.getElementById("section-storage-settings").classList.remove("hidden");
        }""")

        # Wait for rendering
        page.wait_for_selector("#uploadModal", state="visible")

        # Check text
        button_text = page.inner_text("#btn-storage-settings")
        print(f"Button Text: {button_text}")

        content = page.content()
        if "Storage Configuration" in button_text:
            print("Verified: Button text updated.")

        if "Account ID / Endpoint" in content:
             print("Verified: Account label updated.")

        if "Public URL" in content:
             print("Verified: Public URL label updated.")

        page.screenshot(path="verification/upload_modal_static.png")
        print("Screenshot saved to verification/upload_modal_static.png")

        browser.close()

if __name__ == "__main__":
    run()
