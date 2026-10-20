import { test, expect, type Page } from '@playwright/test';

// The stamp is built the way a locked Study assignment saves it; the recognizer is scripted to say each word exactly.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
});

const sayCurrentWord = async (page: Page) => {
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await page.getByRole('button', { name: 'Stop' }).click();
  // Exact or Accepted both pass; the synthetic take's stress may be forgiven.
  await expect(page.getByText(/^(Exact|Accepted)$/)).toBeVisible();
};

test('a student practises a Speak set to mastery aloud and the teacher sees it', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto('/flashcards-speak-dev');
  await expect(page.getByRole('button', { name: 'Speak' })).toBeVisible();
  // §7: the player's first render loads neither Speak mode nor the speech model.
  expect(
    scripts.some((url) => /SpeakMode|onnxruntime|recognizer\.worker/i.test(url))
  ).toBe(false);

  await page.getByRole('button', { name: 'Speak' }).click();
  await expect
    .poll(() => scripts.some((url) => /SpeakMode/.test(url)))
    .toBe(true);
  // The teacher locked Speak, so the student can't change attempts.
  await expect(page.getByText('Attempt 1 of 2')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Attempt 1 of 2' })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __longTasks: number[] }).__longTasks = [];
  });
  for (let take = 0; take < 12; take++) {
    if (await page.getByText('2/2 said well').isVisible()) break;
    const nextRound = page.getByRole('button', { name: /next round/i });
    if (await nextRound.isVisible()) {
      await nextRound.click();
      continue;
    }
    await sayCurrentWord(page);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.getByText('2/2 said well')).toBeVisible();
  // §7: judging a take never blocks the main thread for more than 200 ms.
  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __longTasks: number[] }).__longTasks)
  );
  expect(longest).toBeLessThan(200);

  await page.getByRole('button', { name: 'Teacher', exact: true }).click();
  const speaking = page.getByRole('tab', { name: 'Speaking' });
  await speaking.click();
  await expect(speaking).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Ana Student')).toBeVisible();
  await expect(page.getByText(/Said well 2 · In progress 0/)).toBeVisible();
});
