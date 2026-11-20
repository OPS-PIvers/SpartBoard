import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  addQuizWidget,
  createClass,
  createQuiz,
  expectToast,
  openBoard,
  setFeatureOverrides,
  teacherFeatureOverrides,
} from './helpers/quiz';

// Leaving the monitor mid-session must not end, pause or lose it (docs/plans/QUIZ_WIDGET_STRUCTURE.md S1, D5).
const QUIZ = 'Fractions check';
const DOCS =
  'http://127.0.0.1:8080/v1/projects/demo-spartboard-e2e/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };

const sessionIdForCode = async (code: string): Promise<string> => {
  const res = await fetch(`${DOCS}:runQuery`, {
    method: 'POST',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'quiz_sessions' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'code' },
            op: 'EQUAL',
            value: { stringValue: code },
          },
        },
      },
    }),
  });
  const rows = (await res.json()) as { document?: { name: string } }[];
  const name = rows.find((r) => r.document)?.document?.name;
  if (!name) throw new Error(`No session for join code ${code}`);
  return name.split('/').pop() ?? '';
};

// A student's response as the student app writes it, sent to the emulator with rules bypassed.
const studentResponds = async (
  sessionId: string,
  uid: string,
  status: 'in-progress' | 'completed'
): Promise<void> => {
  const res = await fetch(
    `${DOCS}/quiz_sessions/${sessionId}/responses/${uid}`,
    {
      method: 'PATCH',
      headers: { ...OWNER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          studentUid: { stringValue: uid },
          pin: { stringValue: uid.slice(-4) },
          classPeriod: { stringValue: 'Period 1' },
          joinedAt: { integerValue: String(Date.now()) },
          status: { stringValue: status },
          answers: { arrayValue: {} },
          score: { nullValue: null },
          submittedAt:
            status === 'completed'
              ? { integerValue: String(Date.now()) }
              : { nullValue: null },
        },
      }),
    }
  );
  expect(res.ok).toBe(true);
};

const readJoinCode = async (widget: Locator): Promise<string> => {
  await widget.getByRole('button', { name: 'Join code' }).click();
  const code = widget.getByText(/^[A-Z0-9]{6}$/);
  await expect(code).toBeVisible();
  const text = (await code.innerText()).trim();
  await widget.getByRole('button', { name: 'Back' }).click();
  await expect(
    widget.getByRole('group', { name: 'Student status' })
  ).toBeVisible();
  return text;
};

const expectLiveMonitor = async (
  widget: Locator,
  counts: { notStarted: number; inProgress: number; done: number }
): Promise<void> => {
  await expect(widget.getByText(QUIZ)).toBeVisible();
  await expect(widget.getByText('Live', { exact: true })).toBeVisible();
  const status = widget.getByRole('group', { name: 'Student status' });
  await expect(
    status.getByRole('button', { name: `${counts.notStarted} Not started` })
  ).toBeVisible();
  await expect(
    status.getByRole('button', { name: `${counts.inProgress} In progress` })
  ).toBeVisible();
  await expect(
    status.getByRole('button', { name: `${counts.done} Done` })
  ).toBeVisible();
  await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible();
};

const expectLiveRow = async (library: Locator): Promise<void> => {
  const row = library.getByRole('tabpanel');
  await expect(
    library.getByRole('tab', { name: 'In Progress' })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(row.getByText(QUIZ)).toBeVisible();
  await expect(row.getByText('Live', { exact: true })).toBeVisible();
  await expect(row.getByText('Paused', { exact: true })).toHaveCount(0);
};

const closeWidget = async (page: Page, widget: Locator): Promise<void> => {
  await widget.focus();
  await page.keyboard.press('Delete');
  const confirm = page.getByRole('alertdialog', {
    name: 'Close widget? Data will be lost.',
  });
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expectToast(page, 'Widget closed');
  await expect(page.locator('.widget')).toHaveCount(0);
};

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
  await openBoard(page);
});

test('a teacher leaves the monitor mid-session and comes back', async ({
  page,
}) => {
  await createClass(page, 'Period 1');
  let library = await addQuizWidget(page);
  const widget = page.locator('.widget').first();
  let row = library.getByRole('tabpanel');
  let joinCode = '';
  let sessionId = '';

  await test.step('start a quiz and open the monitor', async () => {
    await expect(row.getByText('No Quizzes Yet')).toBeVisible();
    await createQuiz(page, QUIZ);
    await library.getByRole('button', { name: 'Assign', exact: true }).click();
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await stepper.getByRole('checkbox', { name: /Period 1/ }).check();
    await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(stepper).toBeHidden();
    await row.getByRole('button', { name: 'Start', exact: true }).click();
    await expectLiveMonitor(widget, { notStarted: 0, inProgress: 0, done: 0 });
    joinCode = await readJoinCode(widget);
    sessionId = await sessionIdForCode(joinCode);
    await studentResponds(sessionId, 'student-0001', 'in-progress');
    await expectLiveMonitor(widget, { notStarted: 0, inProgress: 1, done: 0 });
  });

  await test.step('back to the library while a student submits', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await expectLiveRow(library);
    await studentResponds(sessionId, 'student-0002', 'completed');
    await row.getByRole('button', { name: 'Monitor', exact: true }).click();
    await expectLiveMonitor(widget, { notStarted: 0, inProgress: 1, done: 1 });
    expect(await readJoinCode(widget)).toBe(joinCode);
  });

  await test.step('to other library tabs while a student joins', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await expectLiveRow(library);
    await library.getByRole('tab', { name: 'Library' }).click();
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await studentResponds(sessionId, 'student-0003', 'in-progress');
    await library.getByRole('tab', { name: 'Completed' }).click();
    await expect(row.getByText('No completed assignments')).toBeVisible();
    await library.getByRole('tab', { name: 'In Progress' }).click();
    await expectLiveRow(library);
    await row.getByRole('button', { name: 'Monitor', exact: true }).click();
    await expectLiveMonitor(widget, { notStarted: 0, inProgress: 2, done: 1 });
    expect(await readJoinCode(widget)).toBe(joinCode);
  });

  await test.step('close the widget, add it again and reopen the monitor', async () => {
    await closeWidget(page, widget);
    await studentResponds(sessionId, 'student-0001', 'completed');
    library = await addQuizWidget(page);
    row = library.getByRole('tabpanel');
    await library.getByRole('tab', { name: 'In Progress' }).click();
    await expectLiveRow(library);
    await row.getByRole('button', { name: 'Monitor', exact: true }).click();
    await expectLiveMonitor(widget, { notStarted: 0, inProgress: 1, done: 2 });
    expect(await readJoinCode(widget)).toBe(joinCode);
  });
});
