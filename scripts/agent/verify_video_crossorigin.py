from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            print("Navigating to http://localhost:8000/embed.html")
            page.goto("http://localhost:8000/embed.html")
            page.wait_for_selector("video")

            # Verify the attribute is present
            video = page.locator("video")
            cross_origin = video.get_attribute("crossorigin")
            print(f"Video crossorigin attribute: {cross_origin}")

            if cross_origin != "anonymous":
                print("ERROR: crossorigin attribute missing or incorrect")
            else:
                print("SUCCESS: crossorigin attribute is correct")

            page.screenshot(path="artifacts/verify_video.png")
        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
