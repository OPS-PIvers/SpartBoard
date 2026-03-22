import asyncio
from playwright.async_api import async_playwright

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        print("Navigating to app...")
        await page.goto("http://localhost:3000")

        # We can bypass the UI dock entirely and trigger the widget open via state or evaluating in the browser context if possible.
        # Another option is to use the global testing hooks if they exist, or just use the UI that is visible.

        # Wait for app to load and the dock button to be ready
        open_tools_button = page.get_by_role("button", name="Open Tools")
        await open_tools_button.wait_for()

        # Let's open the dock
        await open_tools_button.click()

        # Wait for the Random button to be visible in the dock
        random_button = page.get_by_text("RANDOM")
        await random_button.wait_for()

        # Let's click "Random"
        print("Adding Random...")
        await random_button.click()

        # Wait for the new widget's settings button to appear
        settings_button = page.locator("button:has(svg.lucide-settings)").last
        await settings_button.wait_for()

        # Open the Random settings
        print("Opening Random Settings...")
        await settings_button.click()

        # Wait for an element in the settings panel to ensure it's loaded.
        await page.get_by_text("Operation Mode").wait_for()

        print("Taking final screenshot...")
        await page.screenshot(path="verification/debug_random_settings.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
