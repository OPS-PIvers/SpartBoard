import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, type Locator } from '@playwright/test';

// A looping fake mic: quiet, a 0.6 s voiced word, then quiet long enough for the take to end itself.
const fakeWordWav = (): string => {
  const rate = 16000;
  const parts: Array<[number, boolean]> = [
    [0.5, false],
    [0.6, true],
    [2.9, false],
  ];
  const total = Math.round(parts.reduce((sum, [s]) => sum + s, 0) * rate);
  const data = Buffer.alloc(44 + total * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + total * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(total * 2, 40);
  let i = 0;
  for (const [seconds, voiced] of parts) {
    for (let n = 0; n < Math.round(seconds * rate); n++, i++) {
      const t = i / rate;
      const v = voiced
        ? 0.25 *
          (Math.sin(2 * Math.PI * 160 * t) +
            0.5 * Math.sin(2 * Math.PI * 480 * t))
        : 0.001 * Math.sin(2 * Math.PI * 50 * t);
      data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
    }
  }
  const path = join(tmpdir(), `spartboard-speak-word-${process.pid}.wav`);
  writeFileSync(path, data);
  return path;
};

// The stamp is built the way a locked Study assignment saves it; the recognizer is scripted to say each word exactly.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fakeWordWav()}`,
    ],
  },
});

// Speak listens on the next card and moves past a pass by itself, so a button seen a moment ago may already be gone.
const clickIfStillThere = (button: Locator) =>
  button.click({ timeout: 2000 }).catch(() => undefined);

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
  const mastered = page.getByText('2/2 said well');
  const nextRound = page.getByRole('button', { name: /next round/i });
  // Enabled only: while the mic opens the button still reads Start speaking, and a click then would stop the auto take.
  const record = page.getByRole('button', {
    name: 'Start speaking',
    disabled: false,
  });
  const listening = page.getByText('Listening…');
  const continueButton = page.getByRole('button', { name: 'Continue' });
  for (let step = 0; step < 40; step++) {
    // Wait for whichever comes next instead of sampling a frame that may not have rendered yet.
    await mastered
      .or(nextRound)
      .or(listening)
      .or(continueButton)
      .or(record)
      .first()
      .waitFor();
    if (await mastered.isVisible()) break;
    if (await listening.isVisible()) {
      // No Stop click: under the 8 s limit, only the auto-stop can have ended the take.
      await expect(listening).toBeHidden({ timeout: 7000 });
    } else if (await nextRound.isVisible()) await clickIfStillThere(nextRound);
    else if (await continueButton.isVisible())
      await clickIfStillThere(continueButton);
    else await clickIfStillThere(record);
  }
  await expect(page.getByText('2/2 said well')).toBeVisible();
  // §7: scoring and stress measuring on the main thread never block it for 200 ms; the fake skips the Worker's decode.
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
