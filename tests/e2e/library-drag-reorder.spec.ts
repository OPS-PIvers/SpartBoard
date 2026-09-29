import { test, expect, type Page } from '@playwright/test';

const rowTitles = async (page: Page): Promise<string[]> =>
  page
    .getByTestId('library-grid')
    .getByText(/^Unit \d+ checkpoint$/)
    .allInnerTexts();

test('dragging a quiz onto another reorders the library from the default sort', async ({
  page,
}) => {
  await page.goto('/library-managers-dev?view=quiz');
  const grid = page.getByTestId('library-grid');
  await expect(grid).toBeVisible();
  const before = await rowTitles(page);
  expect(before.length).toBeGreaterThan(2);

  const source = grid.getByText(before[2], { exact: true });
  const target = grid.getByText(before[0], { exact: true });
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('rows not laid out');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2,
    from.y + from.height / 2 - 10,
    {
      steps: 5,
    }
  );
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 20,
  });
  await page.mouse.up();

  await expect
    .poll(() => rowTitles(page))
    .toEqual([before[2], before[0], before[1], ...before.slice(3)]);
});
