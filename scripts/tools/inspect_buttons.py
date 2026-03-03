from playwright.sync_api import sync_playwright

def inspect_buttons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")
        page.wait_for_timeout(5000)
        buttons = page.locator('button').all()
        for i, btn in enumerate(buttons):
            print(f"Button {i}: Label='{btn.get_attribute('aria-label')}', Text='{btn.inner_text()}'")
        browser.close()

if __name__ == "__main__":
    inspect_buttons()
