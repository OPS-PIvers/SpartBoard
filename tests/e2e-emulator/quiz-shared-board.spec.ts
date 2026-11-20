import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  addQuizWidget,
  createQuiz,
  expectToast,
  openBoard,
  setFeatureOverrides,
  teacherFeatureOverrides,
} from './helpers/quiz';

// Pins what a co-teacher sees when a board holding a colleague's Quiz widget is opened from its share link (docs/plans/QUIZ_WIDGET_STRUCTURE.md S1).
const HOST_UID = 'colleague-host-uid';
const HOST_NAME = 'Ms. Rivera';
const QUIZ_ID = 'colleague-quiz';
const QUIZ = 'Ratios warm-up';
const BOARD = 'Co-taught Math';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/demo-spartboard-e2e/databases/(default)/documents`;

type QuizView = 'manager' | 'preview' | 'monitor' | 'results';

const quizWidget = (view: QuizView, extra: Record<string, unknown> = {}) => ({
  id: 'shared-quiz-widget',
  type: 'quiz',
  x: 40,
  y: 40,
  w: 900,
  h: 600,
  z: 1,
  flipped: false,
  config: {
    view,
    managerTab: 'library',
    selectedQuizId: view === 'manager' ? null : QUIZ_ID,
    selectedQuizTitle: view === 'manager' ? null : QUIZ,
    selectedQuizOwnerUid: view === 'manager' ? null : HOST_UID,
    activeAssignmentId: null,
    activeLiveSessionCode: null,
    resultsSessionId: null,
    ...extra,
  },
});

// Firestore REST values for the emulator seed.
type RestValue = Record<string, unknown>;
const toRest = (value: unknown): RestValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(toRest) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          toRest(v),
        ])
      ),
    },
  };
};

// The copy the colleague's own widget publishes for board members.
const publishColleagueQuiz = async (
  request: APIRequestContext,
  shareId: string,
  hasBankSlots = false
): Promise<void> => {
  const doc = {
    kind: 'quiz',
    itemId: QUIZ_ID,
    ownerUid: HOST_UID,
    title: QUIZ,
    version: '1',
    publishedAt: Date.now(),
    payload: {
      quiz: {
        id: QUIZ_ID,
        title: QUIZ,
        createdAt: 1,
        updatedAt: 1,
        questions: [
          {
            id: 'q1',
            timeLimit: 0,
            text: 'Simplify 6:8',
            type: 'MC',
            correctAnswer: '3:4',
            incorrectAnswers: ['2:3', '6:4', '1:2'],
          },
          {
            id: 'q2',
            timeLimit: 0,
            text: 'Which ratio equals 1:2?',
            type: 'MC',
            correctAnswer: '4:8',
            incorrectAnswers: ['2:1', '3:5', '1:3'],
          },
        ],
      },
      hasBankSlots,
    },
  };
  const res = await request.patch(
    `${FIRESTORE}/shared_boards/${shareId}/items/quiz_${HOST_UID}_${QUIZ_ID}`,
    {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: (toRest(doc).mapValue as { fields: unknown }).fields },
    }
  );
  expect(res.ok()).toBe(true);
};

// Share docs live in a session-storage mock under auth bypass; the share link imports from it.
const openSharedBoard = async (
  page: Page,
  shareId: string,
  widget: ReturnType<typeof quizWidget>,
  mode: 'synced' | 'view-only' = 'synced'
): Promise<Locator> => {
  const share = {
    id: shareId,
    name: BOARD,
    background: 'bg-slate-800',
    widgets: [widget],
    originalAuthor: HOST_UID,
    originalAuthorName: HOST_NAME,
    intendedMode: mode,
    createdAt: 1,
  };
  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    [`mock_shared_${shareId}`, JSON.stringify(share)] as const
  );
  await page.goto(`/share/${shareId}`);
  const picker = page.getByRole('dialog', { name: 'Import shared board' });
  await expect(picker.getByText(BOARD)).toBeVisible({ timeout: 90000 });
  await picker
    .getByRole('button', {
      name: mode === 'synced' ? 'Import synced board' : 'Open view-only board',
    })
    .click();
  await expect(picker).toBeHidden();
  await expectToast(
    page,
    mode === 'synced' ? 'Synced board imported' : 'View-only board imported'
  );
  return page.locator('.widget').filter({ visible: true }).first();
};

const VIEW_ONLY_NOTE = 'View only. Assign saves a copy to your library.';

// The colleague's quiz, read-only: the preview plus the copy-to-assign bar and nothing else.
const expectColleagueQuiz = async (widget: Locator): Promise<void> => {
  await expect(widget.getByText(VIEW_ONLY_NOTE)).toBeVisible();
  await expect(widget.getByText('Preview', { exact: true })).toBeVisible();
  await expect(widget.getByText(`1 of 2 · ${QUIZ}`)).toBeVisible();
  await expect(widget.getByText('Simplify 6:8')).toBeVisible();
  await expect(widget.getByTitle('Reset question')).toBeVisible();
  await expect(
    widget.getByRole('button', { name: 'Assign', exact: true })
  ).toBeVisible();
  // None of the owner's library, monitor or results controls.
  await expect(
    widget.getByRole('region', { name: 'Quiz library' })
  ).toHaveCount(0);
  for (const name of [
    'Back',
    'Pause',
    'Close all',
    'Publish results',
    'Edit',
    'Start',
  ]) {
    await expect(widget.getByRole('button', { name, exact: true })).toHaveCount(
      0
    );
  }
  await expect(widget.getByText('Live', { exact: true })).toHaveCount(0);
};

// Every doc under a path, with its update time, read as the emulator's owner.
const dumpTree = async (
  request: APIRequestContext,
  docPath: string
): Promise<Record<string, unknown>> => {
  const out: Record<string, unknown> = {};
  const ids = await request.post(`${FIRESTORE}/${docPath}:listCollectionIds`, {
    headers: { Authorization: 'Bearer owner' },
    data: {},
  });
  expect(ids.ok()).toBe(true);
  const { collectionIds = [] } = (await ids.json()) as {
    collectionIds?: string[];
  };
  for (const id of collectionIds) {
    const list = await request.get(
      `${FIRESTORE}/${docPath}/${id}?showMissing=true&pageSize=300`,
      { headers: { Authorization: 'Bearer owner' } }
    );
    expect(list.ok()).toBe(true);
    const { documents = [] } = (await list.json()) as {
      documents?: { name: string; updateTime?: string; fields?: unknown }[];
    };
    for (const d of documents) {
      const path = d.name.split('/documents/')[1];
      out[path] = {
        updateTime: d.updateTime ?? null,
        fields: d.fields ?? null,
      };
      Object.assign(out, await dumpTree(request, path));
    }
  }
  return out;
};

// The share doc the board syncs through (a session-storage mock here) and both emulator subtrees.
const boardAndOwnerState = async (
  page: Page,
  request: APIRequestContext,
  shareId: string
) => ({
  share: await page.evaluate(
    (key) => sessionStorage.getItem(key),
    `mock_shared_${shareId}`
  ),
  board: await dumpTree(request, `shared_boards/${shareId}`),
  owner: await dumpTree(request, `users/${HOST_UID}`),
});

// Where the viewer's copy of the colleague's quiz landed.
const copyPaths = async (request: APIRequestContext): Promise<string[]> => {
  const res = await request.post(`${FIRESTORE}:runQuery`, {
    headers: { Authorization: 'Bearer owner' },
    data: {
      structuredQuery: {
        from: [{ collectionId: 'quizzes', allDescendants: true }],
      },
    },
  });
  expect(res.ok()).toBe(true);
  const rows = (await res.json()) as { document?: { name: string } }[];
  return rows
    .map((r) => r.document?.name.split('/documents/')[1])
    .filter((p): p is string => !!p && p.endsWith(`/quizzes/${QUIZ_ID}-copy`));
};

// Assign, cancel and Back: the copy lands in the viewer's library and nothing on the board or the colleague's side changes.
const assignWritesOnlyToViewer = async (
  page: Page,
  request: APIRequestContext,
  widget: Locator,
  shareId: string
): Promise<void> => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /permission/i.test(msg.text()))
      errors.push(msg.text());
  });
  // A copy left by an earlier test lives in another page's Drive mock, so start without one.
  for (const path of await copyPaths(request)) {
    const res = await request.delete(`${FIRESTORE}/${path}`, {
      headers: { Authorization: 'Bearer owner' },
    });
    expect(res.ok()).toBe(true);
  }
  const before = await boardAndOwnerState(page, request, shareId);
  expect(before.share).not.toBeNull();
  expect(Object.keys(before.board)).toContain(
    `shared_boards/${shareId}/items/quiz_${HOST_UID}_${QUIZ_ID}`
  );
  await widget.getByRole('button', { name: 'Assign', exact: true }).click();
  const stepper = page.getByRole('dialog', { name: QUIZ });
  await expect(stepper).toBeVisible();
  await stepper.getByRole('button', { name: 'Cancel' }).click();
  await expect(stepper).toBeHidden();
  const copies = await copyPaths(request);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatch(/^users\/[^/]+\/quizzes\//);
  expect(copies[0].startsWith(`users/${HOST_UID}/`)).toBe(false);
  await widget.getByRole('button', { name: 'Back to the shared quiz' }).click();
  await expectColleagueQuiz(widget);
  expect(await boardAndOwnerState(page, request, shareId)).toEqual(before);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
};

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
});

test('the owner previewing their own quiz gets no view-only bar and no Assign', async ({
  page,
}) => {
  await openBoard(page);
  const library = await addQuizWidget(page);
  const widget = page.locator('.widget').first();
  await createQuiz(page, 'My own quiz');
  await library.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Check answers' }).click();
  await expect(widget.getByText('1 of 1 · My own quiz')).toBeVisible();
  await expect(widget.getByTitle('Reset question')).toBeVisible();
  await expect(widget.getByText(VIEW_ONLY_NOTE)).toHaveCount(0);
  await expect(
    widget.getByRole('button', { name: 'Assign', exact: true })
  ).toHaveCount(0);
});

test('a colleague’s previewed quiz shows read-only with Assign copying it to the viewer’s library', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-preview';
  await publishColleagueQuiz(request, shareId);
  const widget = await openSharedBoard(page, shareId, quizWidget('preview'));

  await test.step('the shared view', async () => {
    await expectColleagueQuiz(widget);
    await widget.getByRole('button', { name: 'NEXT' }).click();
    await expect(widget.getByText(`2 of 2 · ${QUIZ}`)).toBeVisible();
    await expect(widget.getByText('Which ratio equals 1:2?')).toBeVisible();
  });

  await test.step('Assign saves a copy and opens its assign step', async () => {
    await widget.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(
      widget.getByRole('button', { name: 'Back to the shared quiz' })
    ).toBeVisible();
    const library = widget.getByRole('region', { name: 'Quiz library' });
    await expect(library).toBeVisible();
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await expect(stepper).toBeVisible();
    await stepper.getByRole('button', { name: 'Cancel' }).click();
    await expect(stepper).toBeHidden();
  });

  await test.step('Back returns to the colleague’s quiz', async () => {
    await widget
      .getByRole('button', { name: 'Back to the shared quiz' })
      .click();
    await expectColleagueQuiz(widget);
  });

  await test.step('Assign again reuses the copy already in the library', async () => {
    await widget.getByRole('button', { name: 'Assign', exact: true }).click();
    const library = widget.getByRole('region', { name: 'Quiz library' });
    await expect(library.getByRole('heading', { name: QUIZ })).toHaveCount(1);
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await expect(stepper).toBeVisible();
    await stepper.getByRole('button', { name: 'Cancel' }).click();
    await widget
      .getByRole('button', { name: 'Back to the shared quiz' })
      .click();
    await expectColleagueQuiz(widget);
  });
});

test('a colleague’s quiz with an assignment in progress shows the read-only preview, not the monitor', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-monitor';
  await publishColleagueQuiz(request, shareId);
  const widget = await openSharedBoard(
    page,
    shareId,
    quizWidget('monitor', { activeAssignmentId: 'colleague-assignment' })
  );
  await expectColleagueQuiz(widget);
});

test('a colleague’s quiz open on its results shows the read-only preview, not the results', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-results';
  await publishColleagueQuiz(request, shareId);
  const widget = await openSharedBoard(
    page,
    shareId,
    quizWidget('results', { activeAssignmentId: 'colleague-assignment' })
  );
  await expectColleagueQuiz(widget);
  await expect(widget.getByText('No data available yet')).toHaveCount(0);
});

test('a colleague’s quiz that draws from question banks is view only with no Assign', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-banks';
  await publishColleagueQuiz(request, shareId, true);
  const widget = await openSharedBoard(page, shareId, quizWidget('preview'));
  await expect(
    widget.getByText(
      "View only. This quiz draws from a colleague's question banks, so it can't be copied."
    )
  ).toBeVisible();
  await expect(widget.getByText(`1 of 2 · ${QUIZ}`)).toBeVisible();
  await expect(widget.getByText(VIEW_ONLY_NOTE)).toHaveCount(0);
  await expect(widget.getByRole('button', { name: 'Assign' })).toHaveCount(0);
});

test('a shared Quiz widget with no quiz selected shows the viewer’s own library', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-library';
  await publishColleagueQuiz(request, shareId);
  const widget = await openSharedBoard(page, shareId, quizWidget('manager'));
  const library = widget.getByRole('region', { name: 'Quiz library' });
  await expect(library).toBeVisible({ timeout: 30000 });
  await expect(
    library.getByRole('tabpanel').getByText('No Quizzes Yet')
  ).toBeVisible();
  await expect(widget.getByText(VIEW_ONLY_NOTE)).toHaveCount(0);
  await expect(widget.getByText(QUIZ)).toHaveCount(0);
});

test('a colleague’s quiz on a View-Only board offers the same read-only view, and Assign writes nothing to the board or the colleague', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-view-only';
  await publishColleagueQuiz(request, shareId);
  const widget = await openSharedBoard(
    page,
    shareId,
    quizWidget('preview'),
    'view-only'
  );
  await expectColleagueQuiz(widget);
  await assignWritesOnlyToViewer(page, request, widget, shareId);
});

test('Assign on a synced board writes nothing to the board or the colleague', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-synced-writes';
  await publishColleagueQuiz(request, shareId);
  const widget = await openSharedBoard(page, shareId, quizWidget('preview'));
  await expectColleagueQuiz(widget);
  await assignWritesOnlyToViewer(page, request, widget, shareId);
});

const UNAVAILABLE = `"${QUIZ}" isn't available on this board yet`;
const UNAVAILABLE_HINT =
  'It should appear here after the teacher who owns it next opens this board.';

test('a colleague’s quiz that was never published to the board says so instead of showing the viewer’s library', async ({
  page,
}) => {
  const widget = await openSharedBoard(
    page,
    'e2e-share-quiz-unpublished',
    quizWidget('preview')
  );
  await expect(widget.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30000 });
  await expect(widget.getByText(UNAVAILABLE_HINT)).toBeVisible();
  await expect(
    widget.getByRole('region', { name: 'Quiz library' })
  ).toHaveCount(0);
  await expect(widget.getByText('No Quizzes Yet')).toHaveCount(0);
  await expect(widget.getByText(VIEW_ONLY_NOTE)).toHaveCount(0);
  await expect(
    widget.getByRole('button', { name: 'Assign', exact: true })
  ).toHaveCount(0);
});

test('a colleague’s quiz published while the board is open replaces the notice with the preview', async ({
  page,
  request,
}) => {
  const shareId = 'e2e-share-quiz-late-publish';
  const widget = await openSharedBoard(page, shareId, quizWidget('preview'));
  await expect(widget.getByText(UNAVAILABLE)).toBeVisible({ timeout: 30000 });
  await publishColleagueQuiz(request, shareId);
  await expectColleagueQuiz(widget);
  await expect(widget.getByText(UNAVAILABLE)).toHaveCount(0);
});
