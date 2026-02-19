import sys
import time
from playwright.sync_api import sync_playwright

def log(category, message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{category}] {message}")

def run():
    error_count = 0

    with sync_playwright() as p:
        # Launch browser (headless by default)
        try:
            browser = p.chromium.launch()
        except Exception as e:
            log("SETUP_ERROR", f"Failed to launch browser: {e}")
            sys.exit(1)

        page = browser.new_page()

        def on_console(msg):
            nonlocal error_count
            if msg.type == "error":
                # Ignore known external/content errors that are not code issues
                ignored_errors = [
                    "net::ERR_CERT_COMMON_NAME_INVALID",
                    "blocked by CORS policy",
                    "net::ERR_FAILED",
                    "404 (Not Found)"
                ]
                if any(ignored in msg.text for ignored in ignored_errors):
                    log(f"CONSOLE:ERROR(IGNORED)", msg.text)
                    return
                error_count += 1
            log(f"CONSOLE:{msg.type.upper()}", msg.text)

        def on_page_error(exc):
            nonlocal error_count
            error_count += 1
            log("PAGE_ERROR", str(exc))

        def on_request_failed(req):
            log("REQUEST_FAILED", f"{req.url} {req.failure}")

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("requestfailed", on_request_failed)

        try:
            log("INFO", "Navigating to http://localhost:8000...")
            page.goto("http://localhost:8000")

            # Wait for load state to ensure initial resources are loaded
            try:
                page.wait_for_load_state("load", timeout=10000)
                log("INFO", "Page load event fired.")
            except Exception as e:
                log("WARN", f"Page load timeout: {e}")

            # Wait for network idle as a proxy for 'app ready'
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
                log("INFO", "Network idle reached.")
            except Exception:
                log("WARN", "Network idle timeout (some requests may be pending).")

            # Additional wait to catch delayed initialization errors
            log("INFO", "Waiting 5 seconds for delayed errors...")
            page.wait_for_timeout(5000)

        except Exception as e:
            log("SCRIPT_ERROR", str(e))
            error_count += 1
        finally:
            browser.close()

    if error_count > 0:
        log("RESULT", f"FAILED with {error_count} errors.")
        sys.exit(1)
    else:
        log("RESULT", "SUCCESS. No errors detected.")
        sys.exit(0)

if __name__ == "__main__":
    run()
