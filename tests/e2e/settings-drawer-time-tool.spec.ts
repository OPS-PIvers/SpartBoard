import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectTabOrderStaysInDrawer } from './helpers/drawerTabbing';
import { dismissWelcomeToast } from './helpers/dismissWelcomeToast';

// Timer (time-tool) drawer coverage: one field per group changes the board face,
// values survive close/reopen, Tab stays inside the dialog, and the 820x640 sheet
// has no horizontal scroll. Runs in the `chromium` project (flag on via auth bypass).

const addTimerWidget = async (page: Page): Promise<Locator> => {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await page.getByTitle('Open Tools').click();
  await page.waitForTimeout(500);

  const timerButton = page.getByRole('button', { name: /^Timer$/i }).first();
  await expect(timerButton).toBeVisible();
  await timerButton.click({ force: true });

  // Close the dock, then select the widget: the gear only renders while selected.
  await page.mouse.click(0, 0);
  // The Play button exists in both timer and stopwatch mode, unlike "Add time".
  const widget = page
    .locator('.widget', { has: page.getByRole('button', { name: 'Play' }) })
    .last();
  await expect(widget).toBeVisible();
  await widget.click({ position: { x: 20, y: 20 } });
  return widget;
};

const openDrawer = async (page: Page) => {
  const gear = page.getByRole('button', {
    name: 'Settings (Alt+S)',
    exact: true,
  });
  await expect(gear).toBeVisible();
  await gear.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible({ timeout: 10000 });
  return drawer;
};

const closeDrawer = async (page: Page) => {
  await page
    .getByRole('dialog')
    .locator('[data-testid="settings-drawer-close"]')
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
};

// The digits button carries the clock-style classes and the glow text-shadow.
const timeFace = (widget: Locator) =>
  widget.locator('button', { hasText: /\d\d\s*:\s*\d\d/ }).first();

test.describe('time-tool settings drawer at 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('edits one field per group, reflects it on the board, and keeps values on reopen', async ({
    page,
  }) => {
    // The timer-end partner cards are the old toggles, which Widget Connections hides from the mock admin.
    await page.addInitScript(() =>
      localStorage.setItem(
        'authBypassFeatureOverrides',
        JSON.stringify({ 'widget-connections': false })
      )
    );
    await page.goto('/');
    const widget = await addTimerWidget(page);
    let drawer = await openDrawer(page);

    // Content: sound (radiogroup) — persistence is asserted on reopen below.
    const soundGroup = drawer.getByRole('radiogroup', { name: 'Alert Sound' });
    await soundGroup.getByRole('radio', { name: /blip/i }).click();
    await expect(
      soundGroup.getByRole('radio', { name: /blip/i })
    ).toHaveAttribute('aria-checked', 'true');

    // Behavior: adjust step (number) is visible in timer mode.
    const step = drawer.getByRole('spinbutton', { name: /adjust step/i });
    await expect(step).toHaveValue('60');
    await step.fill('30');
    await expect(step).toHaveValue('30');

    // Behavior: every partner card offers a one-tap add on an empty board.
    await expect(
      drawer.getByRole('button', { name: /^Add .* widget$/ })
    ).toHaveCount(5);

    // Display group lives on the Style tab: visual ring draws the progress ring behind the digits.
    await dismissWelcomeToast(page);
    await drawer.getByRole('tab', { name: 'Style' }).click();
    await expect(widget.locator('svg circle')).toHaveCount(0);
    await drawer
      .getByRole('radiogroup', { name: 'Display Style' })
      .getByRole('radio', { name: /visual/i })
      .click();
    await expect(widget.locator('svg circle').first()).toBeVisible();

    // Display: LCD number style applies its tracking class to the digits.
    await drawer
      .getByRole('radiogroup', { name: 'Number Style' })
      .getByRole('radio', { name: /lcd/i })
      .click();
    await expect(timeFace(widget)).toHaveClass(/tracking-widest/);

    // Content: mode switch to stopwatch hides the +/- adjust controls and the step field.
    await drawer.getByRole('tab', { name: 'Settings' }).click();
    await drawer
      .getByRole('radiogroup', { name: 'Mode' })
      .getByRole('radio', { name: /stopwatch/i })
      .click();
    await expect(widget.getByRole('button', { name: 'Add time' })).toHaveCount(
      0
    );
    await expect(
      drawer.getByRole('spinbutton', { name: /adjust step/i })
    ).toHaveCount(0);

    await closeDrawer(page);

    // Reopen: every change is still shown.
    await widget.click({ position: { x: 20, y: 20 } });
    drawer = await openDrawer(page);
    await expect(
      drawer
        .getByRole('radiogroup', { name: 'Alert Sound' })
        .getByRole('radio', { name: /blip/i })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      drawer
        .getByRole('radiogroup', { name: 'Mode' })
        .getByRole('radio', { name: /stopwatch/i })
    ).toHaveAttribute('aria-checked', 'true');
    await drawer.getByRole('tab', { name: 'Style' }).click();
    await expect(
      drawer
        .getByRole('radiogroup', { name: 'Display Style' })
        .getByRole('radio', { name: /visual/i })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      drawer
        .getByRole('radiogroup', { name: 'Number Style' })
        .getByRole('radio', { name: /lcd/i })
    ).toHaveAttribute('aria-checked', 'true');

    // Back to timer mode: the step value entered earlier is still stored.
    await drawer.getByRole('tab', { name: 'Settings' }).click();
    await drawer
      .getByRole('radiogroup', { name: 'Mode' })
      .getByRole('radio', { name: /timer/i })
      .click();
    await expect(
      drawer.getByRole('spinbutton', { name: /adjust step/i })
    ).toHaveValue('30');
  });

  test('tabs from the heading through every Settings-tab field without leaving the dialog', async ({
    page,
  }) => {
    await page.goto('/');
    await addTimerWidget(page);
    const drawer = await openDrawer(page);

    // Disabled Custom controls (partner widget missing) have no tab stop, so only tabbable fields are expected.
    const tabbableKeys = await drawer
      .locator('[data-field-key]')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) =>
            Array.from(
              n.querySelectorAll<HTMLElement>('button, input, select, textarea')
            ).some((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'))
          )
          .map((n) => n.getAttribute('data-field-key'))
      );
    expect(tabbableKeys.length).toBeGreaterThan(0);

    // A partner card and its inner control share a key, so compare distinct keys.
    const visited = await expectTabOrderStaysInDrawer(page, drawer);
    expect([...visited].sort()).toEqual([...new Set(tabbableKeys)].sort());
  });
});

test.describe('time-tool settings drawer at 820x640', () => {
  test.use({ viewport: { width: 820, height: 640 } });

  test('renders the schema in the bottom sheet with no horizontal scroll', async ({
    page,
  }) => {
    await page.goto('/');
    await addTimerWidget(page);
    const drawer = await openDrawer(page);
    await expect(drawer).toHaveAttribute('data-placement', 'bottom');
    await expect(
      drawer.getByRole('radiogroup', { name: 'Alert Sound' })
    ).toBeVisible();

    const overflow = await drawer.evaluate((root) => {
      const scrollers = [
        root,
        ...Array.from(root.querySelectorAll<HTMLElement>('*')),
      ];
      return scrollers
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX !== 'visible')
        .map((el) => `${el.tagName}.${el.className}`);
    });
    expect(overflow).toEqual([]);
    const body = drawer.locator('[data-testid="settings-drawer-body"]');
    if ((await body.count()) > 0) {
      const dims = await body.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
    }
  });
});
