from playwright.sync_api import sync_playwright

def debug_landing():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")
        page.wait_for_timeout(5000)
        import os
        os.makedirs("tests/e2e/screenshots", exist_ok=True)
        page.screenshot(path="tests/e2e/screenshots/debug_landing.png")
        print(f"URL: {page.url}")
        print(f"Content: {page.content()[:1000]}")
        browser.close()

if __name__ == "__main__":
    debug_landing()
