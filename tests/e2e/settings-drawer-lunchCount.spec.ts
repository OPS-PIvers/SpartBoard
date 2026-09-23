import { test, expect, type Page } from '@playwright/test';
import { expectTabOrderStaysInDrawer } from './helpers/drawerTabbing';

// Runs in the default `chromium` project, where auth bypass leaves the
// settings-drawer flag on (see playwright.config.ts and settings-drawer.spec.ts).

const addLunchCountWidget = async (page: Page) => {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await page.getByTitle('Open Tools').click();
  await page.waitForTimeout(500);

  // Dock label is "Lunch" (config/tools.ts), not "Lunch Count".
  const lunchButton = page.getByRole('button', { name: /^Lunch$/i }).first();
  await expect(lunchButton).toBeVisible();
  await lunchButton.click({ force: true });

  // Close the dock, then select the new widget: the gear only renders while selected.
  await page.mouse.click(0, 0);
  const lunchWidget = page.locator('.widget').last();
  await expect(lunchWidget).toBeVisible();
  await lunchWidget.click({ position: { x: 20, y: 20 } });
  return lunchWidget;
};

const openDrawer = async (page: Page) => {
  const gear = page.getByRole('button', {
    name: 'Settings (Alt+S)',
    exact: true,
  });
  await expect(gear).toBeVisible();
  // A toast can sit over the toolbar of a widget placed near the top, so click the element, not its screen point.
  await gear.dispatchEvent('click');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible({ timeout: 10000 });
  return drawer;
};

test.describe('lunchCount settings drawer at 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('switches to a hero-view site, toggles manual mode, and reflects the hot-lunch name on the board', async ({
    page,
  }) => {
    await page.goto('/');
    const widget = await addLunchCountWidget(page);
    const drawer = await openDrawer(page);

    // Content group: School Site — Middle/High sites render the single
    // "Hot Lunch" hero name instead of the drag-and-drop assignment grid.
    const siteSelect = drawer.getByLabel('School Site');
    await expect(siteSelect).toBeVisible();
    await siteSelect.selectOption('orono-high-school');

    // Behavior group: Manual Mode toggle reveals the hot-lunch/bento-box text fields.
    const manualModeToggle = drawer.getByRole('switch', {
      name: 'Manual Mode',
    });
    await expect(manualModeToggle).toHaveAttribute('aria-checked', 'false');
    await manualModeToggle.click();
    await expect(manualModeToggle).toHaveAttribute('aria-checked', 'true');

    // Content group (now visible): set a manual hot-lunch name.
    const hotLunchInput = drawer.getByLabel('Hot Lunch Name');
    await expect(hotLunchInput).toBeVisible();
    await hotLunchInput.fill('Pizza Day');

    // The board reflects the manual hot-lunch name in the hero view.
    await expect(widget.getByText('Pizza Day')).toBeVisible();

    // Tab from the heading through every Settings-tab field without leaving the dialog.
    const visited = await expectTabOrderStaysInDrawer(page, drawer);
    expect(visited).toEqual(
      expect.arrayContaining(['schoolSite', 'isManualMode', 'manualHotLunch'])
    );

    // Close and reopen: values persist.
    await drawer.locator('[data-testid="settings-drawer-close"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Re-select the widget: the gear only renders while it is selected.
    await widget.click({ position: { x: 20, y: 20 } });
    const reopened = await openDrawer(page);
    await expect(reopened.getByLabel('School Site')).toHaveValue(
      'orono-high-school'
    );
    await expect(
      reopened.getByRole('switch', { name: 'Manual Mode' })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(reopened.getByLabel('Hot Lunch Name')).toHaveValue(
      'Pizza Day'
    );
  });
});

test.describe('lunchCount settings drawer at 820x640', () => {
  test.use({ viewport: { width: 820, height: 640 } });

  test('renders as a bottom sheet with no horizontal scroll', async ({
    page,
  }) => {
    await page.goto('/');
    await addLunchCountWidget(page);

    const drawer = await openDrawer(page);
    await expect(drawer).toHaveAttribute('data-placement', 'bottom');

    const overflow = await drawer.evaluate(
      (el) => el.scrollWidth <= el.clientWidth
    );
    expect(overflow).toBe(true);

    await drawer.locator('[data-testid="settings-drawer-close"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
