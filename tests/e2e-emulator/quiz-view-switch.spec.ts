import { test, expect, type Page } from '@playwright/test';
import {
  addQuizWidget,
  createClass,
  createQuiz,
  openBoard,
  rowMenuItems,
  setFeatureOverrides,
  teacherFeatureOverrides,
} from './helpers/quiz';

// Pins how often a view switch reloads the quiz, so a screen split cannot add a Drive read or a spinner (docs/plans/QUIZ_WIDGET_STRUCTURE.md S1, D5).
const QUIZ = 'Fractions check';

type Leg = { reads: number; spinners: number };
type Probe = { leg: string; legs: Record<string, Leg> };

// Counts, per leg of the walk, reads of the quiz file from the mock Drive and every "Loading quiz…" or "Resuming session…" pane that mounts, however briefly.
const installProbe = (page: Page) =>
  page.evaluate(() => {
    const probe: Probe = { leg: 'start', legs: {} };
    (window as unknown as { __quizProbe: Probe }).__quizProbe = probe;
    const tally = () => (probe.legs[probe.leg] ??= { reads: 0, spinners: 0 });
    const localGet = Storage.prototype.getItem.bind(localStorage);
    const sessionGet = Storage.prototype.getItem.bind(sessionStorage);
    Storage.prototype.getItem = function (this: Storage, key: string) {
      if (this !== localStorage) return sessionGet(key);
      if (key.startsWith('mock_quiz_drive:') && !key.includes(':mock-tr-'))
        tally().reads++;
      return localGet(key);
    };
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of Array.from(record.addedNodes))
          if (/Loading quiz…|Resuming session…/.test(node.textContent ?? ''))
            tally().spinners++;
    }).observe(document.body, { childList: true, subtree: true });
  });

const startLeg = (page: Page, leg: string) =>
  page.evaluate((name) => {
    (window as unknown as { __quizProbe: Probe }).__quizProbe.leg = name;
  }, leg);

const legCounts = (page: Page, leg: string) =>
  page.evaluate(
    (name) =>
      (window as unknown as { __quizProbe: Probe }).__quizProbe.legs[name] ?? {
        reads: 0,
        spinners: 0,
      },
    leg
  );

// Today's counts: every entry to preview, results or the monitor reads the file once behind the spinner, and leaving preview or results while a session is live reloads it once more.
const EXPECTED: Record<string, Leg> = {
  'library → preview': { reads: 1, spinners: 1 },
  'preview → library': { reads: 1, spinners: 1 },
  'library → results': { reads: 1, spinners: 1 },
  'results → library': { reads: 1, spinners: 1 },
  'library → monitor': { reads: 1, spinners: 1 },
  'monitor → library': { reads: 0, spinners: 0 },
  'library tabs': { reads: 0, spinners: 0 },
};

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
  await openBoard(page);
});

test('switching views reloads the quiz no more than it does today', async ({
  page,
}) => {
  await createClass(page, 'Period 1');
  const library = await addQuizWidget(page);
  const widget = page.locator('.widget').first();
  const panel = library.getByRole('tabpanel');
  const libraryTab = library.getByRole('tab', { name: 'Library' });
  const inProgressTab = library.getByRole('tab', { name: 'In Progress' });
  const leg = async (name: string, walk: () => Promise<void>) => {
    await test.step(name, async () => {
      await startLeg(page, name);
      await walk();
      await expect.poll(() => legCounts(page, name)).toEqual(EXPECTED[name]);
    });
  };

  await test.step('assign and start a quiz, then go back to the library', async () => {
    await expect(panel.getByText('No Quizzes Yet')).toBeVisible();
    await createQuiz(page, QUIZ);
    await library.getByRole('button', { name: 'Assign', exact: true }).click();
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await stepper.getByRole('checkbox', { name: /Period 1/ }).check();
    await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(stepper).toBeHidden();
    await panel.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(widget.getByText('Live', { exact: true })).toBeVisible();
    await widget.getByRole('button', { name: 'Back' }).click();
    await libraryTab.click();
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await installProbe(page);
  });

  await leg('library → preview', async () => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Check answers' }).click();
    await expect(widget.getByText('What is 2 + 2?')).toBeVisible();
    await expect(widget.getByText(`1 of 1 · ${QUIZ}`)).toBeVisible();
  });

  await leg('preview → library', async () => {
    // The preview's back arrow has no accessible name, so it is reached as the pane's first button.
    await widget.getByRole('button').first().click();
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
  });

  await leg('library → results', async () => {
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await inProgressTab.click();
    await expect(panel.getByText('Live', { exact: true })).toBeVisible();
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Results' }).click();
    await expect(widget.getByText('No data available yet')).toBeVisible();
  });

  await leg('results → library', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(inProgressTab).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByText(QUIZ)).toBeVisible();
  });

  await leg('library → monitor', async () => {
    await expect(panel.getByText('Live', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Monitor', exact: true }).click();
    await expect(
      widget.getByRole('group', { name: 'Student status' })
    ).toBeVisible();
    await expect(widget.getByText(QUIZ)).toBeVisible();
  });

  await leg('monitor → library', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(panel.getByText('Live', { exact: true })).toBeVisible();
  });

  // Catches a late reload from an earlier leg as well as one from a tab switch.
  await leg('library tabs', async () => {
    await libraryTab.click();
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await library.getByRole('tab', { name: 'Completed' }).click();
    await expect(panel.getByText('No completed assignments')).toBeVisible();
    await inProgressTab.click();
    await expect(panel.getByText('Live', { exact: true })).toBeVisible();
  });

  await test.step('no leg changed after it was checked', async () => {
    const seen: Record<string, Leg> = {};
    for (const name of Object.keys(EXPECTED))
      seen[name] = await legCounts(page, name);
    expect(seen).toEqual(EXPECTED);
  });
});
