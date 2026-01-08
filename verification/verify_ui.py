
from playwright.sync_api import sync_playwright
import os

def run():
    # Construct absolute path to the local file
    file_path = os.path.abspath('index.html')
    url = f'file://{file_path}'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Navigate to the local index.html
        print(f'Navigating to {url}')
        page.goto(url)

        # Wait for the upload modal to be part of the DOM (it's in the static HTML but hidden)
        # We need to trigger it to open.
        # The upload button has id='uploadButton'.
        # However, checking ApplicationBootstrap logic, it might need JS initialization.
        # Since we are running against static file://, module scripts might fail CORS or path resolution
        # unless served via http.
        # Let's try to serve it first.

        # Actually, simpler: just check if the new elements exist in the DOM,
        # even if the modal isn't visible, we can force it visible via JS for the screenshot.

        # Wait for the modal container
        page.wait_for_selector('#uploadModal', state='attached')

        # Force modal visible for screenshot
        page.evaluate("document.getElementById('uploadModal').classList.remove('hidden')")

        # Switch to Cloudflare tab to see new UI
        # The tab buttons have data-upload-mode='cloudflare'
        # We can click it or just unhide the section manually if JS isn't running fully.
        # Let's assume JS might fail on file://, so we do manual DOM manipulation to reveal the section.

        # Hide custom section
        page.evaluate("document.getElementById('customUploadSection').classList.add('hidden')")

        # Show Cloudflare section
        page.evaluate("document.getElementById('cloudflareUploadSection').classList.remove('hidden')")

        # Take screenshot of the Cloudflare section
        element = page.locator('#cloudflareUploadSection')
        element.screenshot(path='verification/upload_modal_cloudflare.png')

        browser.close()

if __name__ == '__main__':
    run()
