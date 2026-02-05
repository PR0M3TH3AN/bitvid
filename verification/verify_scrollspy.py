from playwright.sync_api import sync_playwright
import time

def verify_scrollspy():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to docs...")
        page.goto("http://localhost:3000/#view=docs&doc=getting-started")

        # Wait for content
        page.wait_for_selector("#markdown-container h2")

        print("Injecting dummy TOC and styles...")
        page.evaluate("""
            const container = document.createElement('div');
            container.id = "dummy-toc";
            container.style.position = 'fixed';
            container.style.top = '100px';
            container.style.right = '20px';
            container.style.backgroundColor = 'white';
            container.style.padding = '10px';
            container.style.border = '1px solid black';
            container.style.zIndex = '9999';

            container.innerHTML = `
                <div style='font-weight:bold; margin-bottom:5px;'>Debug TOC</div>
                <a href="#watching-videos" data-docs-toc-item="true" id="link-watching" style='display:block; color:grey;'>Watching Videos</a>
                <a href="#sharing-your-videos" data-docs-toc-item="true" id="link-sharing" style='display:block; color:grey;'>Sharing Your Videos</a>
                <a href="#need-help" data-docs-toc-item="true" id="link-help" style='display:block; color:grey;'>Need Help?</a>
            `;
            document.body.appendChild(container);

            const style = document.createElement("style");
            style.textContent = `
                body { padding-bottom: 1000px; }
                a[data-docs-section-current="true"] {
                    color: red !important;
                    font-weight: bold !important;
                    text-decoration: underline;
                }
            `;
            document.head.appendChild(style);
        """)

        # Navigate away and back to re-init ScrollSpy with new links
        print("Reloading to init ScrollSpy...")
        page.goto("http://localhost:3000/#view=docs&doc=overview")
        page.wait_for_selector("#markdown-container h1")
        page.goto("http://localhost:3000/#view=docs&doc=getting-started")
        page.wait_for_selector("#watching-videos")

        # Scroll to Sharing Your Videos
        print("Scrolling to 'Sharing Your Videos'...")
        page.evaluate("""
            const el = document.querySelector("#sharing-your-videos");
            const top = el.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, top - 80);
        """)

        time.sleep(1) # Wait for IO

        # Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/scrollspy.png")

        browser.close()

if __name__ == "__main__":
    verify_scrollspy()
