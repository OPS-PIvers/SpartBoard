from playwright.sync_api import sync_playwright, expect
import time

def debug_admin_settings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.goto("http://localhost:3000")
        page.get_by_title("Admin Settings").click()
        page.wait_for_timeout(5000)
        import os
        os.makedirs("tests/e2e/screenshots", exist_ok=True)
        page.screenshot(path="tests/e2e/screenshots/admin_settings_debug.png")
        browser.close()

if __name__ == "__main__":
    debug_admin_settings()
