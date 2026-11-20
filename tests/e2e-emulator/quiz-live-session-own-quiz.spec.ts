import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  expectToast,
  openBoard,
  setFeatureOverrides,
  teacherFeatureOverrides,
} from './helpers/quiz';

// Checking answers on another quiz must not drive the live session's answer reveals (AB-328).
const LIVE = 'Fractions review';
const OTHER = 'Decimals review';
const DOCS =
  'http://127.0.0.1:8080/v1/projects/demo-spartboard-e2e/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };

const addReviewWidget = async (page: Page): Promise<Locator> => {
  await page
    .locator('button[data-tool-id="review"]')
    .evaluate((el) => (el as HTMLElement).click());
  const library = page.getByRole('region', { name: 'Review library' });
  await expect(library).toBeVisible({ timeout: 30000 });
  return library;
};

const createReviewQuiz = async (
  page: Page,
  library: Locator,
  title: string,
  prompt: string,
  correct: string,
  withFreeResponse = false
): Promise<void> => {
  const editor = page.getByRole('dialog');
  // The library can finish loading after the menu opens, which closes it; reopen until the editor is up.
  await expect(async () => {
    if (await editor.isVisible()) return;
    const items = page.getByRole('menuitem');
    if (!(await items.first().isVisible())) {
      await library.getByRole('button', { name: 'New Quiz' }).click();
    }
    await expect(items).toHaveText(['Create', 'Import'], { timeout: 2000 });
    await items.filter({ hasText: /^Create$/ }).click({ timeout: 2000 });
    await expect(editor).toBeVisible({ timeout: 2000 });
  }).toPass();
  await editor.getByRole('textbox', { name: 'Title' }).fill(title);
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Question prompt' }).fill(prompt);
  const options = { A: '3', B: '4', C: '5', D: '22' };
  for (const [letter, text] of Object.entries(options)) {
    await editor
      .getByRole('textbox', { name: `Option ${letter}`, exact: true })
      .fill(text);
  }
  await editor
    .getByRole('radio', { name: `Option ${correct} is correct` })
    .check();
  if (withFreeResponse) {
    // The second "Add" adds learning targets.
    await editor
      .getByRole('button', { name: 'Add', exact: true })
      .first()
      .click();
    await editor
      .getByRole('combobox', { name: 'Type' })
      .last()
      .selectOption({ label: 'Free Response' });
    await editor
      .getByRole('textbox', { name: 'Question prompt' })
      .last()
      .fill('Explain how you know.');
  }
  await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
  // The toast comes with the first autosave and lasts 3s, so check it before closing.
  await expectToast(page, 'Quiz created!');
  await expect(editor.getByText(/Not ready to use yet/)).toHaveCount(0);
  await editor.getByRole('button', { name: 'Close' }).last().click();
  await expect(editor).toBeHidden();
};

type SessionDoc = {
  name: string;
  fields: {
    publicQuestions?: {
      arrayValue: {
        values?: { mapValue: { fields: { id: { stringValue: string } } } }[];
      };
    };
    revealedAnswers?: { mapValue: { fields?: Record<string, unknown> } };
  };
};

const sessionForCode = async (code: string): Promise<SessionDoc> => {
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
  const rows = (await res.json()) as { document?: SessionDoc }[];
  const doc = rows.find((r) => r.document)?.document;
  if (!doc) throw new Error(`No session for join code ${code}`);
  return doc;
};

const revealedIds = async (code: string): Promise<string[]> =>
  Object.keys(
    (await sessionForCode(code)).fields.revealedAnswers?.mapValue.fields ?? {}
  ).sort();

// The phase move a teacher-paced Review makes on its own when everyone has answered, sent to the emulator with rules bypassed.
const moveToReview = async (sessionId: string): Promise<void> => {
  const res = await fetch(
    `${DOCS}/quiz_sessions/${sessionId}?updateMask.fieldPaths=questionPhase`,
    {
      method: 'PATCH',
      headers: { ...OWNER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { questionPhase: { stringValue: 'reviewing' } },
      }),
    }
  );
  expect(res.ok).toBe(true);
};

// A student's answer, written straight to the emulator with rules bypassed.
const writeResponse = async (
  sessionId: string,
  questionId: string,
  answer: string
): Promise<void> => {
  const res = await fetch(`${DOCS}/quiz_sessions/${sessionId}/responses/s1`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        studentUid: { stringValue: 's1' },
        pin: { stringValue: '07' },
        joinedAt: { integerValue: '1' },
        status: { stringValue: 'in-progress' },
        answers: {
          arrayValue: {
            values: [
              {
                mapValue: {
                  fields: {
                    questionId: { stringValue: questionId },
                    answer: { stringValue: answer },
                    answeredAt: { integerValue: '2' },
                  },
                },
              },
            ],
          },
        },
      },
    }),
  });
  expect(res.ok).toBe(true);
};

// A session write that changes nothing the scoreboard reads.
const touchSession = async (sessionId: string, n: number): Promise<void> => {
  const res = await fetch(
    `${DOCS}/quiz_sessions/${sessionId}?updateMask.fieldPaths=e2eTouch`,
    {
      method: 'PATCH',
      headers: { ...OWNER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { e2eTouch: { integerValue: `${n}` } } }),
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
  return text;
};

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
  await openBoard(page);
});

// A free-response question is left out of a Review, so the session runs on a trimmed frozen copy with its own quiz id.
const runLiveReview = async (
  page: Page,
  withFreeResponse: boolean
): Promise<void> => {
  const library = await addReviewWidget(page);
  const widget = page.locator('.widget').first();
  let code = '';
  let sessionId = '';
  let liveQuestionId = '';

  await test.step('create two quizzes and start one with right-or-wrong feedback', async () => {
    await createReviewQuiz(page, library, OTHER, 'What is 0.5 + 0.5?', 'A');
    await createReviewQuiz(
      page,
      library,
      LIVE,
      'What is 2 + 2?',
      'B',
      withFreeResponse
    );
    if (withFreeResponse)
      await expect(
        library.getByRole('tabpanel').getByText('2 Qs')
      ).toBeVisible();
    await library
      .getByRole('heading', { name: LIVE })
      .locator('xpath=ancestor::*[.//button[normalize-space()="Start"]][1]')
      .getByRole('button', { name: 'Start', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: LIVE });
    await dialog.getByRole('button', { name: 'Answer Feedback' }).click();
    await dialog
      .getByRole('switch', { name: 'Show right or wrong after each answer' })
      .click();
    await dialog.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(dialog).toBeHidden();
    await widget.getByRole('button', { name: 'Resume' }).click();
    await expect(widget.getByText('Live', { exact: true })).toBeVisible();
    code = await readJoinCode(widget);
    const session = await sessionForCode(code);
    sessionId = session.name.split('/').pop() ?? '';
    liveQuestionId =
      session.fields.publicQuestions?.arrayValue.values?.[0]?.mapValue.fields.id
        .stringValue ?? '';
    expect(liveQuestionId).not.toBe('');
    await widget.getByRole('button', { name: 'Start quiz session' }).click();
    await expect(widget.getByText('What is 2 + 2?')).toBeVisible();
    await expect.poll(() => widget.ariaSnapshot()).toContain('Question 1 of 1');
    expect(await revealedIds(code)).toEqual([]);
  });

  await test.step('check answers on the other quiz', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await library.getByRole('tab', { name: 'Library' }).click();
    await library
      .getByRole('heading', { name: OTHER })
      .locator('xpath=ancestor::*[.//button[@aria-label="More actions"]][1]')
      .getByRole('button', { name: 'More actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Check answers' }).click();
    await expect(widget.getByText('What is 0.5 + 0.5?')).toBeVisible();
  });

  await test.step('the live question moves to review and students get its own answer', async () => {
    await moveToReview(sessionId);
    await expect.poll(() => revealedIds(code)).toEqual([liveQuestionId]);
    await expect(widget.getByText('What is 0.5 + 0.5?')).toBeVisible();
  });

  await test.step('back in the library nothing else is revealed', async () => {
    await widget.getByRole('button').first().click();
    await expect(library.getByRole('heading', { name: OTHER })).toBeVisible();
    await library.getByRole('tab', { name: 'In Progress' }).click();
    await library
      .getByRole('tabpanel')
      .getByRole('button', { name: 'Monitor', exact: true })
      .click();
    await expect(widget.getByText('What is 2 + 2?')).toBeVisible();
    expect(await revealedIds(code)).toEqual([liveQuestionId]);
  });
};

test('checking answers on another quiz leaves the live review on its own quiz', async ({
  page,
}) => {
  await runLiveReview(page, false);
});

test('a live review on a trimmed copy reveals its own question while another quiz is checked', async ({
  page,
}) => {
  await runLiveReview(page, true);
});

// A session update inside the sync's wait must not cancel the pending Scoreboard write (AB-343).
test('a live review with scoreboard sync on shows its scores on a Scoreboard', async ({
  page,
}) => {
  const library = await addReviewWidget(page);
  const widget = page.locator('.widget').first();
  const scoreboard = page.locator(
    '.widget[data-tour-widget-type="scoreboard"]'
  );
  let sessionId = '';
  let questionId = '';

  await test.step('start a review with scoreboard sync on', async () => {
    await createReviewQuiz(page, library, LIVE, 'What is 2 + 2?', 'B');
    await library
      .getByRole('heading', { name: LIVE })
      .locator('xpath=ancestor::*[.//button[normalize-space()="Start"]][1]')
      .getByRole('button', { name: 'Start', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: LIVE });
    await dialog.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(dialog).toBeHidden();
    await widget.getByRole('button', { name: 'Resume' }).click();
    await expect(widget.getByText('Live', { exact: true })).toBeVisible();
    const session = await sessionForCode(await readJoinCode(widget));
    sessionId = session.name.split('/').pop() ?? '';
    questionId =
      session.fields.publicQuestions?.arrayValue.values?.[0]?.mapValue.fields.id
        .stringValue ?? '';
    expect(questionId).not.toBe('');
    await widget.getByRole('button', { name: 'Quiz settings' }).click();
    await widget
      .getByRole('switch', { name: 'Sync to scoreboard widget' })
      .click();
    await widget.getByRole('button', { name: 'Back' }).click();
    await widget.getByRole('button', { name: 'Start quiz session' }).click();
    await expect(widget.getByText('What is 2 + 2?')).toBeVisible();
  });

  await test.step('a student answers while the session keeps updating', async () => {
    await writeResponse(sessionId, questionId, '4');
    // The sync waits up to 2s after an answer; these land inside that wait.
    for (let n = 1; n <= 4; n++) {
      await page.waitForTimeout(400);
      await touchSession(sessionId, n);
    }
  });

  await test.step('the Scoreboard shows the student and their score', async () => {
    await expect(scoreboard.getByText('LIVE', { exact: true })).toBeVisible();
    await expect(scoreboard.getByText('PIN 07')).toBeVisible();
  });
});
