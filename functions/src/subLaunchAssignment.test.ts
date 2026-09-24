// Unit tests for `launchSubAssignmentV1` (SUB_SHARE_COLLECTIONS.md §3.6, D7).
//
// This callable writes into another teacher's account, so the tests are mostly
// about refusal: who may call it, which share and board it will act on, and
// what it will accept from the caller at all. Everything students read is
// derived from the bundled key, so the content tests assert what the handler
// built rather than what the caller sent. The stub Firestore mirrors only the
// `doc().get()` and `batch().set()/commit()` surface the handler uses.

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

import {
  findAnswerField,
  handleLaunchSubAssignment,
  publicQuestionFromKey,
  publicQuestionsFromKey,
  allocateJoinCode,
  resolveTargeting,
  type SubLaunchCaller,
} from './subLaunchAssignment';

const NOW = 1_700_000_000_000;
const HOST = 'teacher-uid-1';
const SHARE = 'share-1';
const BOARD = 'board-1';
const WIDGET = 'widget-1';
const QUIZ = 'quiz-1';
const DRIVE_FILE = 'drive-file-1';
const ROSTER = 'roster-1';
const ACTIVITY = 'activity-1';
const VA_DRIVE_FILE = 'drive-file-2';

const VA_KEY_QUESTIONS = [
  {
    id: 'v1',
    type: 'MC',
    text: 'What does a leaf absorb?',
    timestamp: 12,
    correctAnswer: 'Light',
    incorrectAnswers: ['Sound'],
  },
  {
    id: 'v1',
    type: 'MC',
    text: 'A duplicate id, which must not inflate the count',
    timestamp: 20,
    correctAnswer: 'Light',
  },
  {
    id: 'v2',
    type: 'FR',
    text: 'Name the pigment',
    timestamp: 40,
    correctAnswer: 'Chlorophyll',
  },
];

/** What `subLaunchRunSettings` sends for a video activity. */
const vaSession = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  mode: 'submissions',
  settings: { allowSkipping: false, requireCorrectAnswer: true },
  assignmentName: 'Period 3',
  ...over,
});

const vaAssignment = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  mode: 'submissions',
  className: 'Period 3',
  sessionSettings: { allowSkipping: false, requireCorrectAnswer: true },
  ...over,
});

const vaInput = (over: Record<string, unknown> = {}) => ({
  shareId: SHARE,
  boardId: BOARD,
  widgetId: WIDGET,
  kind: 'videoActivity',
  itemId: ACTIVITY,
  rosterIds: [ROSTER],
  session: vaSession(),
  assignment: vaAssignment(),
  ...over,
});

const GL_SET = 'gl-set-1';

const GL_KEY_STEPS = [
  {
    id: 'g1',
    xPct: 10,
    yPct: 20,
    imageIndex: 0,
    interactionType: 'question',
    tour: { anchorId: 'board-canvas' },
    question: {
      type: 'multiple-choice',
      text: 'Which organ pumps blood?',
      choices: ['Heart', 'Lung'],
      correctAnswer: 'Heart',
    },
  },
  {
    id: 'g1',
    xPct: 30,
    yPct: 30,
    imageIndex: 0,
    interactionType: 'tooltip',
    text: 'A duplicate id, which must not inflate the step count',
  },
  {
    id: 'g2',
    xPct: 50,
    yPct: 60,
    imageIndex: 1,
    interactionType: 'text-popover',
    text: 'Now look at the valves.',
  },
];

const GL_SET_DOC = {
  id: GL_SET,
  title: 'The heart',
  mode: 'guided',
  imageUrls: ['https://example.test/a.png', 'https://example.test/b.png'],
  schemaVersion: 3,
  steps: GL_KEY_STEPS,
};

/** What `subLaunchRunSettings` sends for a guided activity. */
const glInput = (over: Record<string, unknown> = {}) => ({
  shareId: SHARE,
  boardId: BOARD,
  widgetId: WIDGET,
  kind: 'guidedLearning',
  itemId: GL_SET,
  rosterIds: [ROSTER],
  session: { assignmentMode: 'submissions' },
  assignment: { status: 'active', assignmentMode: 'submissions' },
  ...over,
});

const FC_SET = 'fc-set-1';

const FC_CARDS = [
  { id: 'c1', term: 'Mitochondria', definition: 'Makes ATP' },
  { id: 'c1', term: 'A duplicate id, which must not inflate the deck' },
  { id: 'c2', term: 'Ribosome', definition: 'Builds proteins', starred: true },
];

const FC_SET_DOC = {
  id: FC_SET,
  title: 'Cell biology',
  termLanguage: 'en',
  definitionLanguage: 'es',
  cards: FC_CARDS,
  publicShareId: 'public-link-1',
};

/** What `subLaunchRunSettings` sends for a flashcard set. */
const fcInput = (over: Record<string, unknown> = {}) => ({
  shareId: SHARE,
  boardId: BOARD,
  widgetId: WIDGET,
  kind: 'flashcards',
  itemId: FC_SET,
  rosterIds: [ROSTER],
  session: { status: 'active' },
  assignment: { status: 'active' },
  ...over,
});

const SUB: SubLaunchCaller = {
  uid: 'sub-uid-1',
  email: 'Sub@orono.k12.mn.us',
  emailVerified: true,
  anonymous: false,
  studentRole: false,
};

const KEY_QUESTIONS = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Which phase?',
    timeLimit: 30,
    correctAnswer: 'Anaphase',
    incorrectAnswers: ['Telophase', 'Prophase'],
  },
  {
    id: 'q2',
    type: 'free-response',
    text: 'Name the organelle',
    timeLimit: 60,
    points: 4,
    placeholder: 'Your answer',
  },
];

/** Run settings only — the caller has nothing to say about content now. */
const session = (over: Record<string, unknown> = {}) => ({
  status: 'waiting',
  sessionMode: 'live',
  currentQuestionIndex: -1,
  ...over,
});

const assignment = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  sessionMode: 'live',
  sessionOptions: { readAloudAll: false },
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  shareId: SHARE,
  boardId: BOARD,
  widgetId: WIDGET,
  kind: 'quiz',
  itemId: QUIZ,
  rosterIds: [ROSTER],
  session: session(),
  assignment: assignment(),
  ...over,
});

interface StubState {
  switchOn?: boolean;
  share?: Record<string, unknown> | null;
  board?: Record<string, unknown> | null;
  key?: Record<string, unknown> | null;
  quiz?: Record<string, unknown> | null;
  roster?: Record<string, unknown> | null;
  vaKey?: Record<string, unknown> | null;
  va?: Record<string, unknown> | null;
  glKey?: Record<string, unknown> | null;
  gl?: Record<string, unknown> | null;
  fcContent?: Record<string, unknown> | null;
  fc?: Record<string, unknown> | null;
}

interface Written {
  path: string;
  data: Record<string, unknown>;
}

function stubDb(state: StubState = {}) {
  const {
    switchOn = true,
    share = {
      hostUid: HOST,
      intendedMode: 'substitute',
      expiresAt: NOW + 86_400_000,
      subEmails: ['sub@orono.k12.mn.us'],
      sharedRosters: [{ id: ROSTER, name: 'Period 3', driveFileId: 'd1' }],
    },
    // Matches `SharedCollectionBoardDoc`: the frozen board sits under
    // `dashboard`, which is what `useSharedCollection` writes.
    board = {
      boardId: BOARD,
      dashboard: { widgets: [{ id: WIDGET, type: 'quiz' }] },
    },
    key = {
      payload: {
        quiz: { id: QUIZ, title: 'Cells', questions: KEY_QUESTIONS },
      },
    },
    quiz = { driveFileId: DRIVE_FILE },
    roster = { name: 'Period 3', classlinkClassId: 'class-A' },
    vaKey = {
      payload: {
        activity: {
          id: ACTIVITY,
          title: 'Photosynthesis',
          youtubeUrl: 'https://youtu.be/abc',
          questions: VA_KEY_QUESTIONS,
        },
      },
    },
    va = { driveFileId: VA_DRIVE_FILE },
    glKey = { payload: { set: GL_SET_DOC } },
    gl = { title: 'The heart', driveFileId: 'drive-file-3' },
    fcContent = { payload: { set: FC_SET_DOC } },
    fc = { title: 'Cell biology' },
  } = state;

  const written: Written[] = [];
  const docs: Record<string, Record<string, unknown> | null> = {
    'admin_settings/sub_launch_as_teacher': { enabled: switchOn },
    [`shared_collections/${SHARE}`]: share,
    [`shared_collections/${SHARE}/boards/${BOARD}`]: board,
    [`shared_collections/${SHARE}/keys/quiz_${QUIZ}`]: key,
    [`users/${HOST}/quizzes/${QUIZ}`]: quiz,
    [`users/${HOST}/rosters/${ROSTER}`]: roster,
    [`shared_collections/${SHARE}/keys/videoActivity_${ACTIVITY}`]: vaKey,
    [`users/${HOST}/video_activities/${ACTIVITY}`]: va,
    [`shared_collections/${SHARE}/keys/guidedLearning_${GL_SET}`]: glKey,
    [`users/${HOST}/guided_learning/${GL_SET}`]: gl,
    // Flashcards bundle into `content/`, not `keys/`.
    [`shared_collections/${SHARE}/content/flashcards_${FC_SET}`]: fcContent,
    [`users/${HOST}/flashcard_sets/${FC_SET}`]: fc,
  };

  const db = {
    doc: (path: string) => ({
      path,
      get: () =>
        Promise.resolve({
          exists: docs[path] != null,
          data: () => docs[path] ?? undefined,
        }),
      collection: () => ({
        limit: () => ({
          get: () => Promise.resolve({ empty: true, docs: [] }),
        }),
      }),
    }),
    collection: () => ({
      doc: () => ({
        collection: () => ({
          limit: () => ({
            get: () => Promise.resolve({ empty: true, docs: [] }),
          }),
        }),
      }),
    }),
    batch: () => ({
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        written.push({ path: ref.path, data });
      },
      commit: () => Promise.resolve(),
    }),
  };
  return { db: db as never, written };
}

const deps = {
  now: () => NOW,
  newId: () => 'new-session-id',
  newCode: () => 'AB12CD',
};

const launch = (
  state: StubState = {},
  caller: SubLaunchCaller | null = SUB,
  data: unknown = input()
) => {
  const { db, written } = stubDb(state);
  return {
    written,
    run: () => handleLaunchSubAssignment(db, caller, data, deps),
  };
};

describe('handleLaunchSubAssignment', () => {
  it('writes the session and the teacher’s assignment as the host', async () => {
    const { run, written } = launch();

    const result = await run();

    expect(result).toEqual({ sessionId: 'new-session-id', code: 'AB12CD' });
    expect(written.map((w) => w.path)).toEqual([
      'quiz_sessions/new-session-id',
      `users/${HOST}/quiz_assignments/new-session-id`,
      'quiz_join_codes/AB12CD/sessions/new-session-id',
    ]);
    // The run belongs to the teacher, or their Results would never show it.
    for (const w of written.slice(0, 2)) {
      expect(w.data.teacherUid).toBe(HOST);
    }
  });

  // The stamp is what the `isSubMonitor` rule reads, and the tag the teacher
  // sees in Results; the caller cannot supply either.
  it('stamps who launched it and how long they may watch', async () => {
    const { run, written } = launch();

    await run();

    expect(written[0].data.launchedBy).toEqual({
      uid: SUB.uid,
      email: 'sub@orono.k12.mn.us',
      shareId: SHARE,
    });
    expect(written[0].data.subMonitorUids).toEqual([SUB.uid]);
    expect(written[0].data.subMonitorUntil).toBe(NOW + 86_400_000);
  });

  it('resolves the picked roster to its class and period name', async () => {
    const { run, written } = launch();

    await run();

    expect(written[0].data.classIds).toEqual(['class-A']);
    expect(written[0].data.classId).toBe('class-A');
    expect(written[0].data.classPeriodByClassId).toEqual({
      'class-A': 'Period 3',
    });
    expect(written[1].data.targetMode).toBe('class');
    expect(written[1].data.rosterIds).toEqual([ROSTER]);
  });

  // A session reaches students by class id alone, so the caller names rosters
  // the share lists and never a class id — there is nothing to enumerate.
  it('refuses a roster the share does not list', async () => {
    await expect(
      launch({}, SUB, input({ rosterIds: ['roster-9'] })).run()
    ).rejects.toThrow('not one the share covers');
    await expect(
      launch({}, SUB, input({ rosterIds: [ROSTER, 'roster-9'] })).run()
    ).rejects.toThrow('not one the share covers');
  });

  it('refuses a missing roster doc or one with no class', async () => {
    await expect(launch({ roster: null }).run()).rejects.toThrow(
      'no class a student can sign in to'
    );
    await expect(
      launch({ roster: { name: 'Local only' } }).run()
    ).rejects.toThrow('no class a student can sign in to');
  });

  it('refuses a caller who is not signed in', async () => {
    await expect(launch({}, null).run()).rejects.toThrow('Sign in first.');
  });

  it('refuses a student and an anonymous caller', async () => {
    await expect(
      launch({}, { ...SUB, studentRole: true }).run()
    ).rejects.toThrow('staff accounts');
    await expect(launch({}, { ...SUB, anonymous: true }).run()).rejects.toThrow(
      'staff accounts'
    );
  });

  it('refuses an unverified or outside email', async () => {
    await expect(
      launch({}, { ...SUB, emailVerified: false }).run()
    ).rejects.toThrow('verified district account');
    await expect(
      launch({}, { ...SUB, email: 'sub@gmail.com' }).run()
    ).rejects.toThrow('verified district account');
  });

  // D14: the switch is the kill switch, so off means off even for a sub the
  // share names.
  it('refuses when the kill switch is off or its doc is missing', async () => {
    await expect(launch({ switchOn: false }).run()).rejects.toThrow(
      'turned off'
    );
  });

  it('refuses a share that is missing, not a substitute share, or expired', async () => {
    await expect(launch({ share: null }).run()).rejects.toThrow(
      'no longer exists'
    );
    await expect(
      launch({
        share: {
          hostUid: HOST,
          intendedMode: 'copy',
          expiresAt: NOW + 1000,
          subEmails: ['sub@orono.k12.mn.us'],
        },
      }).run()
    ).rejects.toThrow('not a substitute share');
    await expect(
      launch({
        share: {
          hostUid: HOST,
          intendedMode: 'substitute',
          expiresAt: NOW - 1,
          subEmails: ['sub@orono.k12.mn.us'],
        },
      }).run()
    ).rejects.toThrow('expired');
  });

  // D10: any verified district account can read the boards, so being able to
  // see the share is not being allowed to start anything from it.
  it('refuses a district reader the share does not name', async () => {
    await expect(
      launch({
        share: {
          hostUid: HOST,
          intendedMode: 'substitute',
          expiresAt: NOW + 1000,
          subEmails: ['someone.else@orono.k12.mn.us'],
        },
      }).run()
    ).rejects.toThrow('does not name you');
  });

  it('refuses a board or widget that is not in the share', async () => {
    await expect(launch({ board: null }).run()).rejects.toThrow(
      'not in the share'
    );
    await expect(
      launch({
        board: { boardId: BOARD, dashboard: { widgets: [{ id: 'other' }] } },
      }).run()
    ).rejects.toThrow('not on the shared board');
    // A flat board doc is the shape this handler first assumed; it must not
    // read as a board carrying the widget.
    await expect(
      launch({ board: { widgets: [{ id: WIDGET }] } }).run()
    ).rejects.toThrow('not on the shared board');
  });

  it('refuses an item the share left no key for', async () => {
    await expect(launch({ key: null }).run()).rejects.toThrow(
      'did not leave this activity'
    );
  });

  it('refuses a kind that is not launchable in v1', async () => {
    await expect(
      launch({}, SUB, input({ kind: 'poll' })).run()
    ).rejects.toThrow('cannot be started from a share yet');
  });

  it('refuses a quiz that has left the teacher’s library', async () => {
    await expect(launch({ quiz: null }).run()).rejects.toThrow(
      'no longer in the teacher'
    );
    await expect(launch({ quiz: {} }).run()).rejects.toThrow(
      'no longer in the teacher'
    );
  });

  // A code is global across every teacher, so a caller's own could eclipse
  // another teacher's live session for students typing it in.
  it('mints the join code itself rather than taking the caller’s', async () => {
    await expect(
      launch({}, SUB, input({ session: session({ code: 'ZZ99ZZ' }) })).run()
    ).rejects.toThrow('code is not yours to set on the session');
    await expect(
      launch(
        {},
        SUB,
        input({ assignment: assignment({ code: 'ZZ99ZZ' }) })
      ).run()
    ).rejects.toThrow('code is not yours to set on the assignment');

    const { run, written } = launch();
    const result = await run();
    expect(result.code).toBe('AB12CD');
    expect(written[0].data.code).toBe('AB12CD');
    expect(written[1].data.code).toBe('AB12CD');
  });

  it('refuses no class, too many classes, and a path as an id', async () => {
    await expect(
      launch({}, SUB, input({ rosterIds: [] })).run()
    ).rejects.toThrow('at least one class');
    await expect(
      launch({}, SUB, input({ rosterIds: Array(21).fill(ROSTER) })).run()
    ).rejects.toThrow('Too many classes');
    await expect(
      launch({}, SUB, input({ boardId: '../other' })).run()
    ).rejects.toThrow('must not be a path');
  });

  it('refuses a payload over the size cap', async () => {
    await expect(
      launch(
        {},
        SUB,
        input({ session: session({ pauseMessage: 'x'.repeat(800_000) }) })
      ).run()
    ).rejects.toThrow('too large to start');
  });
});

// The allowlist is the trust boundary: anything the caller sends that is not on
// it is refused by name rather than quietly dropped, so a field added to the
// client without being reviewed fails loudly instead of reaching a student.
describe('the payload allowlist', () => {
  const REFUSED_SESSION_FIELDS = [
    'teacherUid',
    'id',
    'assignmentId',
    'launchedBy',
    'subMonitorUids',
    'subMonitorUntil',
    'plcId',
    'syncGroupId',
    'plcLinkedAt',
    'individualTargeting',
    'rosterIds',
    'classIds',
    'classId',
    'quizId',
    'quizTitle',
    'publicQuestions',
    'totalQuestions',
    'stimuli',
    'bankSlots',
    'revealedAnswers',
    'readAloud',
    'readAloudTextByStimulusId',
    'ltiNrps',
    'ltiAttachment',
    'classroomAttachment',
    'scoreVisibility',
    'scorePublishedAt',
    'protection',
    'mediaResponseEnabled',
    'showLearningTargets',
    'liveLeaderboard',
    'classPeriodByClassId',
  ];

  for (const field of REFUSED_SESSION_FIELDS) {
    it(`refuses ${field} on the session`, async () => {
      await expect(
        launch({}, SUB, input({ session: session({ [field]: 'x' }) })).run()
      ).rejects.toThrow(`${field} is not yours to set on the session`);
    });
  }

  const REFUSED_ASSIGNMENT_FIELDS = [
    'teacherUid',
    'id',
    'createdAt',
    'quizId',
    'quizTitle',
    'quizDriveFileId',
    'localizedFibAnswers',
    'questionSnapshot',
    'plc',
    'sync',
    'rosterIds',
    'classIds',
    'targetMode',
    'targetStudents',
    'overridesByStudentUid',
    'scoreVisibility',
    'protection',
    'classroomAttachment',
    'exportedResponseIds',
    'classPeriodByClassId',
  ];

  for (const field of REFUSED_ASSIGNMENT_FIELDS) {
    it(`refuses ${field} on the assignment`, async () => {
      await expect(
        launch(
          {},
          SUB,
          input({ assignment: assignment({ [field]: 'x' }) })
        ).run()
      ).rejects.toThrow(`${field} is not yours to set on the assignment`);
    });
  }

  it('keeps the run settings it does allow', async () => {
    const { run, written } = launch(
      {},
      SUB,
      input({
        session: session({ blockCopyPaste: true, attemptLimit: 2 }),
        assignment: assignment({ className: 'Period 3' }),
      })
    );

    await run();

    expect(written[0].data.blockCopyPaste).toBe(true);
    expect(written[0].data.attemptLimit).toBe(2);
    expect(written[1].data.className).toBe('Period 3');
  });
});

// The caller no longer supplies what students read, so these assert the
// handler's own projection of the bundled key.
// A mirror of what `subLaunchRunSettings` in utils/subLaunchRunSettings.ts
// sends. Nothing under functions/ can import a root module, so this is the
// only place the two sides meet: a key the client adds that this function does
// not allow fails here by name.
describe('the run settings the app actually sends', () => {
  const clientSession = {
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    startedAt: NOW,
    endedAt: null,
    questionPhase: 'answering',
    completenessModel: 1,
    attemptLimit: 1,
    tabWarningsEnabled: true,
    blockCopyPaste: false,
    showResultToStudent: false,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    showPodiumBetweenQuestions: false,
    soundEffectsEnabled: false,
  };
  const clientAssignment = {
    status: 'active',
    mode: 'submissions',
    className: 'Period 3',
    sessionMode: 'student',
    sessionOptions: { tabWarningsEnabled: true, shuffleAnswerOptions: true },
    attemptLimit: 1,
  };

  it('accepts every field, and keeps them on the run', async () => {
    const { run, written } = launch(
      {},
      SUB,
      input({ session: clientSession, assignment: clientAssignment })
    );

    await run();

    expect(written[0].data.status).toBe('active');
    expect(written[0].data.sessionMode).toBe('student');
    expect(written[0].data.currentQuestionIndex).toBe(0);
    expect(written[0].data.questionPhase).toBe('answering');
    expect(written[1].data.className).toBe('Period 3');
    expect(written[1].data.status).toBe('active');
  });
});

describe('launching a video activity', () => {
  const launchVa = (
    state: StubState = {},
    over: Record<string, unknown> = {}
  ) => launch(state, SUB, vaInput(over));

  it('writes the session, its key and the teacher\u2019s assignment', async () => {
    const { run, written } = launchVa();

    const result = await run();

    expect(result).toEqual({ sessionId: 'new-session-id' });
    expect(written.map((w) => w.path)).toEqual([
      'video_activity_sessions/new-session-id',
      'video_activity_sessions/new-session-id/key/answers',
      `users/${HOST}/video_activity_assignments/new-session-id`,
    ]);
    for (const w of written.slice(0, 1).concat(written.slice(2))) {
      expect(w.data.teacherUid).toBe(HOST);
    }
  });

  // A video activity is reached by class, so there is no code to mint and
  // none to collide with another teacher's live session.
  it('mints no join code', async () => {
    const { run, written } = launchVa();

    const result = await run();

    expect(result.code).toBeUndefined();
    expect(written.some((w) => w.path.startsWith('quiz_join_codes/'))).toBe(
      false
    );
  });

  it('keeps the answer key off the session doc', async () => {
    const { run, written } = launchVa();

    await run();

    expect(written[0].data.questions).toEqual([]);
    expect(findAnswerField(written[0].data)).toBeNull();
    expect(findAnswerField(written[2].data)).toBeNull();
  });

  it('puts the key where the grading callable looks for it', async () => {
    const { run, written } = launchVa();

    await run();

    const key = written[1].data as { questions: { id: string }[] };
    expect(key.questions.map((q) => q.id)).toEqual(['v1', 'v2']);
    expect(key.questions[0]).toMatchObject({ correctAnswer: 'Light' });
  });

  // A repeated id would otherwise inflate "Question X of N" for the class.
  it('dedupes the questions by id', async () => {
    const { run, written } = launchVa();

    await run();

    const publicQuestions = written[0].data.publicQuestions as { id: string }[];
    expect(publicQuestions.map((q) => q.id)).toEqual(['v1', 'v2']);
  });

  it('takes the Drive file from the teacher\u2019s own record', async () => {
    const { run, written } = launchVa();

    await run();

    expect(written[2].data.activityDriveFileId).toBe(VA_DRIVE_FILE);
  });

  it('refuses an activity the teacher has since deleted', async () => {
    await expect(launchVa({ va: null }).run()).rejects.toThrow(
      'no longer in the teacher'
    );
  });

  it('refuses a key the share never bundled', async () => {
    await expect(launchVa({ vaKey: null }).run()).rejects.toThrow(
      'did not leave this activity'
    );
  });

  it('refuses a key whose activity is not the one asked for', async () => {
    await expect(
      launchVa({
        vaKey: { payload: { activity: { id: 'other', questions: [] } } },
      }).run()
    ).rejects.toThrow('does not match the share');
  });

  it('refuses an activity with no video', async () => {
    await expect(
      launchVa({
        vaKey: {
          payload: {
            activity: { id: ACTIVITY, questions: VA_KEY_QUESTIONS },
          },
        },
      }).run()
    ).rejects.toThrow('has no video');
  });

  it('refuses an activity with no questions', async () => {
    await expect(
      launchVa({
        vaKey: {
          payload: {
            activity: {
              id: ACTIVITY,
              youtubeUrl: 'https://youtu.be/abc',
              questions: [],
            },
          },
        },
      }).run()
    ).rejects.toThrow('has no questions');
  });

  it('resolves the class the same way a quiz does', async () => {
    const { run, written } = launchVa();

    await run();

    expect(written[0].data.classIds).toEqual(['class-A']);
    expect(written[0].data.classId).toBe('class-A');
    expect(written[2].data.rosterIds).toEqual([ROSTER]);
  });

  it('stamps the sub as its monitor until the share expires', async () => {
    const { run, written } = launchVa();

    await run();

    expect(written[0].data.subMonitorUids).toEqual([SUB.uid]);
    expect(written[0].data.subMonitorUntil).toBe(NOW + 86_400_000);
  });

  // The quiz allowlist is not this one: `revealedAnswers` and the rest have no
  // meaning here, and `publicQuestions` is derived, never supplied.
  it('refuses a session field that is not a run setting', async () => {
    for (const field of [
      'publicQuestions',
      'questions',
      'teacherUid',
      'activityId',
      'subMonitorUids',
      'allowedPins',
    ]) {
      await expect(
        launchVa({}, { session: vaSession({ [field]: 'x' }) }).run()
      ).rejects.toThrow(`${field} is not yours to set on the session.`);
    }
  });

  it('refuses an assignment field that is not a run setting', async () => {
    for (const field of ['activityDriveFileId', 'teacherUid', 'plc', 'id']) {
      await expect(
        launchVa({}, { assignment: vaAssignment({ [field]: 'x' }) }).run()
      ).rejects.toThrow(`${field} is not yours to set on the assignment.`);
    }
  });

  it('keeps the run settings it was sent', async () => {
    const { run, written } = launchVa();

    await run();

    expect(written[0].data.status).toBe('active');
    expect(written[0].data.mode).toBe('submissions');
    expect(written[0].data.settings).toEqual({
      allowSkipping: false,
      requireCorrectAnswer: true,
    });
    expect(written[2].data.className).toBe('Period 3');
  });
});

describe('the content the session carries', () => {
  it('derives the questions, title and counts from the key', async () => {
    const { run, written } = launch();

    await run();

    const data = written[0].data as {
      quizId: string;
      quizTitle: string;
      totalQuestions: number;
      publicQuestions: Record<string, unknown>[];
    };
    expect(data.quizId).toBe(QUIZ);
    expect(data.quizTitle).toBe('Cells');
    expect(data.totalQuestions).toBe(2);
    expect(data.publicQuestions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(written[1].data.quizDriveFileId).toBe(DRIVE_FILE);
  });

  it('carries no answer-bearing field at any depth', async () => {
    const { run, written } = launch();

    await run();

    expect(findAnswerField(written[0].data)).toBeNull();
    expect(findAnswerField(written[1].data)).toBeNull();
  });

  // Both need a gate that does not travel in a share, so a sub-launched run
  // simply does without them.
  it('leaves media responses and learning targets off', async () => {
    const { run, written } = launch();

    await run();

    expect(written[0].data.mediaResponseEnabled).toBe(false);
    expect(written[0].data.showLearningTargets).toBe(false);
  });

  it('refuses a key whose quiz has no questions', async () => {
    await expect(
      launch({
        key: { payload: { quiz: { id: QUIZ, title: 'Cells', questions: [] } } },
      }).run()
    ).rejects.toThrow('no questions');
  });
});

describe('findAnswerField', () => {
  it('finds an answer key nested anywhere', () => {
    expect(findAnswerField({ a: [{ b: { correctAnswer: 'x' } }] })).toBe(
      'correctAnswer'
    );
    expect(findAnswerField({ questions: [{ acceptableVariants: [] }] })).toBe(
      'acceptableVariants'
    );
    expect(findAnswerField({ a: { revealedAnswers: {} } })).toBe(
      'revealedAnswers'
    );
    expect(findAnswerField({ a: [{ b: { text: 'x' } }] })).toBeNull();
  });
});

describe('publicQuestionFromKey', () => {
  it('shuffles the MC choices and keeps no correct answer', () => {
    const q = publicQuestionFromKey(KEY_QUESTIONS[0]);

    expect(q.id).toBe('q1');
    expect(q.correctAnswer).toBeUndefined();
    expect((q.choices as string[]).slice().sort()).toEqual([
      'Anaphase',
      'Prophase',
      'Telophase',
    ]);
  });

  it('shuffles every choose-all option together and keeps no key', () => {
    const q = publicQuestionFromKey({
      id: 'q9',
      type: 'MA',
      text: 'Which are mammals?',
      correctAnswer: 'Whale|Bat',
      incorrectAnswers: ['Shark', ''],
    });

    expect(q.correctAnswer).toBeUndefined();
    expect(q.incorrectAnswers).toBeUndefined();
    expect((q.choices as string[]).slice().sort()).toEqual([
      'Bat',
      'Shark',
      'Whale',
    ]);
  });

  it('mixes matching distractors into the right column without listing them', () => {
    const q = publicQuestionFromKey({
      id: 'q3',
      type: 'Matching',
      text: 'Pair them',
      correctAnswer: 'Mitochondria:Energy|Nucleus:DNA',
      matchingDistractors: ['Waste'],
    });

    expect(q.matchingLeft).toEqual(['Mitochondria', 'Nucleus']);
    expect((q.matchingRight as string[]).slice().sort()).toEqual([
      'DNA',
      'Energy',
      'Waste',
    ]);
    expect(q.matchingDistractors).toBeUndefined();
  });

  it('keeps a definition that contains a colon intact', () => {
    const q = publicQuestionFromKey({
      id: 'q4',
      type: 'Matching',
      text: 'When?',
      correctAnswer: 'First period:9:00 AM',
    });

    expect(q.matchingRight).toEqual(['9:00 AM']);
  });

  it('shuffles ordering items and keeps free-response bounds', () => {
    const ordering = publicQuestionFromKey({
      id: 'q5',
      type: 'Ordering',
      text: 'Sequence',
      correctAnswer: 'One|Two|Three',
    });
    expect((ordering.orderingItems as string[]).slice().sort()).toEqual([
      'One',
      'Three',
      'Two',
    ]);

    const fr = publicQuestionFromKey({
      id: 'q6',
      type: 'free-response',
      text: 'Explain',
      minWords: 20,
      enforceWordLimit: true,
    });
    expect(fr.minWords).toBe(20);
    expect(fr.enforceWordLimit).toBe(true);
  });
});

describe('publicQuestionsFromKey', () => {
  it('drops malformed and duplicate questions, and refuses an empty key', () => {
    const out = publicQuestionsFromKey([
      { id: 'q1', type: 'MC', text: 'A', correctAnswer: 'x' },
      { id: 'q1', type: 'MC', text: 'A again', correctAnswer: 'x' },
      { id: 'q2', type: 'MC' },
      'not an object',
    ]);

    expect(out.map((q) => q.id)).toEqual(['q1']);
    expect(() => publicQuestionsFromKey([])).toThrow('no questions');
    expect(() => publicQuestionsFromKey([{ nope: true }])).toThrow(
      'no usable questions'
    );
  });
});

describe('resolveTargeting', () => {
  const stub = (docs: Record<string, Record<string, unknown> | null>) =>
    ({
      doc: (path: string) => ({
        get: () =>
          Promise.resolve({
            exists: docs[path] != null,
            data: () => docs[path] ?? undefined,
          }),
      }),
    }) as never;

  const DOCS = {
    'users/h/rosters/r1': { name: 'Period 1', classlinkClassId: 'cl-1' },
    'users/h/rosters/r2': { name: 'Period 2', testClassId: 'test-2' },
    'users/h/rosters/r3': { name: 'Local only' },
  };
  const SHARED = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];

  it('resolves each picked roster to its class and period name', async () => {
    const out = await resolveTargeting(stub(DOCS), 'h', SHARED, ['r1', 'r2']);

    expect(out.classIds).toEqual(['cl-1', 'test-2']);
    expect(out.classPeriodByClassId).toEqual({
      'cl-1': 'Period 1',
      'test-2': 'Period 2',
    });
  });

  it('refuses a roster the share does not list', async () => {
    await expect(
      resolveTargeting(stub(DOCS), 'h', SHARED, ['r1', 'r9'])
    ).rejects.toThrow('not one the share covers');
    await expect(
      resolveTargeting(stub(DOCS), 'h', undefined, ['r1'])
    ).rejects.toThrow('not one the share covers');
  });

  // A roster id is a document id, so a path on the share doc is dropped before
  // it can be picked rather than read.
  it('never treats a path or a non-string as a listed roster', async () => {
    await expect(
      resolveTargeting(
        stub(DOCS),
        'h',
        [{ id: '../../other' }],
        ['../../other']
      )
    ).rejects.toThrow('not one the share covers');
    await expect(
      resolveTargeting(stub(DOCS), 'h', [{ id: 7 }, 'r1'], ['r1'])
    ).rejects.toThrow('not one the share covers');
  });

  it('refuses when no picked roster carries a class', async () => {
    await expect(
      resolveTargeting(stub(DOCS), 'h', SHARED, ['r3'])
    ).rejects.toThrow('no class a student can sign in to');
  });
});

describe('allocateJoinCode', () => {
  const stub = (
    pointersByCode: Record<string, string[]>,
    statusById: Record<string, string>
  ) =>
    ({
      collection: () => ({
        doc: (code: string) => ({
          collection: () => ({
            limit: () => ({
              get: () => {
                const ids = pointersByCode[code] ?? [];
                return Promise.resolve({
                  empty: ids.length === 0,
                  docs: ids.map((id) => ({ id })),
                });
              },
            }),
          }),
        }),
      }),
      doc: (path: string) => ({
        get: () =>
          Promise.resolve({
            data: () => {
              const id = path.split('/')[1];
              return statusById[id] ? { status: statusById[id] } : undefined;
            },
          }),
      }),
    }) as never;

  it('takes an unused code straight away', async () => {
    const out = await allocateJoinCode(stub({}, {}), () => 'FREE01');

    expect(out).toBe('FREE01');
  });

  // A code is recycled once its sessions are over, so a pointer alone is not a
  // collision — only a session a student could still join.
  it('reuses a code whose sessions have all ended', async () => {
    const out = await allocateJoinCode(
      stub({ OLD001: ['s1', 's2'] }, { s1: 'ended', s2: 'ended' }),
      () => 'OLD001'
    );

    expect(out).toBe('OLD001');
  });

  it('skips a code another live session still holds', async () => {
    const codes = ['TAKEN1', 'TAKEN1', 'SPARE1'];
    let i = 0;

    const out = await allocateJoinCode(
      stub({ TAKEN1: ['live'] }, { live: 'active' }),
      () => codes[i++]
    );

    expect(out).toBe('SPARE1');
  });

  // Never block a substitute from starting a lesson over a code clash; the
  // teacher's own path makes the same trade.
  it('gives up after five tries rather than refusing the launch', async () => {
    let tries = 0;

    const out = await allocateJoinCode(
      stub({ BUSY01: ['live'] }, { live: 'waiting' }),
      () => {
        tries += 1;
        return 'BUSY01';
      }
    );

    expect(out).toBe('BUSY01');
    expect(tries).toBe(6);
  });
});

describe('launching a guided activity', () => {
  const launchGl = (
    state: StubState = {},
    over: Record<string, unknown> = {}
  ) => launch(state, SUB, glInput(over));

  it('writes the session and the teacher’s assignment', async () => {
    const { run, written } = launchGl();

    const result = await run();

    expect(result).toEqual({ sessionId: 'new-session-id' });
    expect(written.map((w) => w.path)).toEqual([
      'guided_learning_sessions/new-session-id',
      `users/${HOST}/guided_learning_assignments/new-session-id`,
    ]);
    for (const w of written) expect(w.data.teacherUid).toBe(HOST);
  });

  // Students reach it from their assignments, the same way the teacher's own
  // assign works, so there is no code to mint.
  it('mints no join code', async () => {
    const { run, written } = launchGl();

    const result = await run();

    expect(result.code).toBeUndefined();
    expect(written.some((w) => w.path.startsWith('quiz_join_codes/'))).toBe(
      false
    );
  });

  // Unlike a quiz or a video activity, a guided session holds no key doc at
  // all: the teacher grades against their own set, and a sub against the copy
  // the share already bundled them.
  it('writes no answer key anywhere', async () => {
    const { run, written } = launchGl();

    await run();

    expect(written.some((w) => w.path.includes('/key'))).toBe(false);
    for (const w of written) expect(findAnswerField(w.data)).toBeNull();
    expect(JSON.stringify(written)).not.toContain('correctAnswer');
  });

  it('ships the steps a student plays, and nothing teacher-only', async () => {
    const { run, written } = launchGl();

    await run();

    const steps = written[0].data.publicSteps as Record<string, unknown>[];
    const question = steps[0].question as { choices: string[] };
    expect([...question.choices].sort()).toEqual(['Heart', 'Lung']);
    expect(steps[0].tour).toBeUndefined();
  });

  // The same Drive-sync race the teacher's own path dedupes: a repeated id
  // would inflate "Step X of N".
  it('counts a repeated step id once', async () => {
    const { run, written } = launchGl();

    await run();

    const steps = written[0].data.publicSteps as { id: string }[];
    expect(steps.map((s) => s.id)).toEqual(['g1', 'g2']);
  });

  it('mirrors what the player needs to draw the activity', async () => {
    const { run, written } = launchGl();

    await run();

    expect(written[0].data.title).toBe('The heart');
    expect(written[0].data.mode).toBe('guided');
    expect(written[0].data.imageUrls).toEqual([
      'https://example.test/a.png',
      'https://example.test/b.png',
    ]);
    expect(written[0].data.schemaVersion).toBe(3);
    expect(written[0].data.createdAt).toBe(NOW);
  });

  // A default the client also applies: an unrecognised play mode would leave
  // the player with no way to render the set.
  it('falls back to guided when the set names no usable play mode', async () => {
    const { run, written } = launchGl({
      glKey: { payload: { set: { ...GL_SET_DOC, mode: 'nonsense' } } },
    });

    await run();

    expect(written[0].data.mode).toBe('guided');
  });

  it('targets the classes the picked rosters resolve to', async () => {
    const { run, written } = launchGl();

    await run();

    expect(written[0].data.classIds).toEqual(['class-A']);
    expect(written[0].data.classId).toBe('class-A');
    expect(written[0].data.periodNames).toEqual(['Period 3']);
    expect(written[0].data.rosterIds).toEqual([ROSTER]);
  });

  it('leaves the teacher a row they can find and grade', async () => {
    const { run, written } = launchGl();

    await run();

    expect(written[1].data).toMatchObject({
      id: 'new-session-id',
      sessionId: 'new-session-id',
      setId: GL_SET,
      setTitle: 'The heart',
      status: 'active',
      source: 'personal',
      targetMode: 'class',
      rosterIds: [ROSTER],
      archivedAt: null,
    });
  });

  it('lets the sub watch the run until the share expires', async () => {
    const { run, written } = launchGl();

    await run();

    expect(written[0].data.subMonitorUids).toEqual([SUB.uid]);
    expect(written[0].data.subMonitorUntil).toBe(NOW + 86_400_000);
    expect(written[0].data.launchedBy).toEqual({
      uid: SUB.uid,
      email: 'sub@orono.k12.mn.us',
      shareId: SHARE,
    });
  });

  it('refuses a key the teacher never left', async () => {
    await expect(launchGl({ glKey: null }).run()).rejects.toThrow(
      'did not leave this activity'
    );
  });

  it('refuses a key for a different set', async () => {
    await expect(
      launchGl({
        glKey: { payload: { set: { ...GL_SET_DOC, id: 'other-set' } } },
      }).run()
    ).rejects.toThrow('does not match the share');
  });

  it('refuses a set with no steps to play', async () => {
    await expect(
      launchGl({
        glKey: { payload: { set: { ...GL_SET_DOC, steps: [] } } },
      }).run()
    ).rejects.toThrow('has no steps');
    await expect(
      launchGl({
        glKey: { payload: { set: { ...GL_SET_DOC, steps: [{ xPct: 1 }] } } },
      }).run()
    ).rejects.toThrow('no usable steps');
  });

  it('refuses a set that has left the teacher’s library', async () => {
    await expect(launchGl({ gl: null }).run()).rejects.toThrow(
      'no longer in the teacher'
    );
  });

  // Publishing scores reveals the answers, so it stays the teacher's own
  // decision however the run was started.
  it('refuses to publish scores on the sub’s behalf', async () => {
    await expect(
      launchGl(
        {},
        { session: { scoreVisibility: 'score-responses-and-answers' } }
      ).run()
    ).rejects.toThrow('scoreVisibility is not yours to set on the session');
    await expect(
      launchGl({}, { assignment: { scoreVisibility: 'score-only' } }).run()
    ).rejects.toThrow('scoreVisibility is not yours to set on the assignment');
  });

  // The quiz's allowlist has these; this one must not, or a sub could rename
  // the class or re-point the run.
  it('refuses a field from another kind’s allowlist', async () => {
    await expect(
      launchGl({}, { assignment: { className: 'Not my class' } }).run()
    ).rejects.toThrow('className is not yours to set on the assignment');
    await expect(
      launchGl({}, { session: { publicSteps: [] } }).run()
    ).rejects.toThrow('publicSteps is not yours to set on the session');
  });
});

describe('launching a flashcard set', () => {
  const launchFc = (
    state: StubState = {},
    over: Record<string, unknown> = {}
  ) => launch(state, SUB, fcInput(over));

  it('writes the session and the teacher’s assignment', async () => {
    const { run, written } = launchFc();

    const result = await run();

    expect(result).toEqual({ sessionId: 'new-session-id' });
    expect(written.map((w) => w.path)).toEqual([
      'flashcard_sessions/new-session-id',
      `users/${HOST}/flashcard_assignments/new-session-id`,
    ]);
    for (const w of written) expect(w.data.teacherUid).toBe(HOST);
  });

  // The deck is the lesson, not a key, so it bundles where the board content
  // does; reading `keys/` here would find nothing at all.
  it('reads the deck from the share’s content, not its keys', async () => {
    await expect(launchFc({ fcContent: null }).run()).rejects.toThrow(
      'did not leave this activity'
    );

    const { run, written } = launchFc({ key: null, vaKey: null, glKey: null });
    await run();
    expect((written[0].data.cards as { id: string }[]).length).toBe(2);
  });

  it('mints no join code', async () => {
    const { run, written } = launchFc();

    const result = await run();

    expect(result.code).toBeUndefined();
    expect(written.some((w) => w.path.startsWith('quiz_join_codes/'))).toBe(
      false
    );
  });

  // `content/` is readable by anyone holding the share, so whatever a bundled
  // card picked up must not ride onto a session doc students read.
  it('copies a card field by field', async () => {
    const { run, written } = launchFc();

    await run();

    expect(written[0].data.cards).toEqual([
      { id: 'c1', term: 'Mitochondria', definition: 'Makes ATP' },
      { id: 'c2', term: 'Ribosome', definition: 'Builds proteins' },
    ]);
    expect(JSON.stringify(written)).not.toContain('publicShareId');
    expect(JSON.stringify(written)).not.toContain('starred');
  });

  it('counts a repeated card id once, and drops a card with no back', async () => {
    const { run, written } = launchFc();

    await run();

    expect(
      (written[0].data.cards as { id: string }[]).map((c) => c.id)
    ).toEqual(['c1', 'c2']);
  });

  // A graded Check brings a mastery threshold and a score visibility that can
  // reveal answers; Study is the teacher's own default.
  it('starts a study run, never a graded check', async () => {
    const { run, written } = launchFc();

    await run();

    expect(written[0].data.kind).toBe('study');
    expect(written[1].data.kind).toBe('study');
    expect(written[0].data.scoreVisibility).toBeUndefined();
    expect(written[0].data.lockedSettings).toBeUndefined();
    expect(written[0].data.masteryThreshold).toBeUndefined();
  });

  it('refuses a kind or a grading setting from the caller', async () => {
    await expect(
      launchFc({}, { session: { kind: 'check' } }).run()
    ).rejects.toThrow('kind is not yours to set on the session');
    await expect(
      launchFc(
        {},
        { assignment: { scoreVisibility: 'score-and-answers' } }
      ).run()
    ).rejects.toThrow('scoreVisibility is not yours to set on the assignment');
    await expect(
      launchFc({}, { session: { cards: [] } }).run()
    ).rejects.toThrow('cards is not yours to set on the session');
  });

  it('keeps the set’s own languages, which the player reads', async () => {
    const { run, written } = launchFc();

    await run();

    expect(written[0].data.termLanguage).toBe('en');
    expect(written[0].data.definitionLanguage).toBe('es');
    expect(written[0].data.title).toBe('Cell biology');
    expect(written[0].data.createdAt).toBe(NOW);
  });

  it('targets the classes the picked rosters resolve to', async () => {
    const { run, written } = launchFc();

    await run();

    expect(written[0].data.classIds).toEqual(['class-A']);
    expect(written[0].data.classId).toBe('class-A');
    expect(written[0].data.periodNames).toEqual(['Period 3']);
    expect(written[1].data.rosterIds).toEqual([ROSTER]);
  });

  it('lets the sub watch the run until the share expires', async () => {
    const { run, written } = launchFc();

    await run();

    expect(written[0].data.subMonitorUids).toEqual([SUB.uid]);
    expect(written[0].data.subMonitorUntil).toBe(NOW + 86_400_000);
  });

  it('refuses a bundle for a different set', async () => {
    await expect(
      launchFc({
        fcContent: { payload: { set: { ...FC_SET_DOC, id: 'other-set' } } },
      }).run()
    ).rejects.toThrow('does not match the share');
  });

  it('refuses a set with no cards to study', async () => {
    await expect(
      launchFc({
        fcContent: { payload: { set: { ...FC_SET_DOC, cards: [] } } },
      }).run()
    ).rejects.toThrow('has no cards');
    await expect(
      launchFc({
        fcContent: {
          payload: { set: { ...FC_SET_DOC, cards: [{ term: 'x' }] } },
        },
      }).run()
    ).rejects.toThrow('no usable cards');
  });

  it('refuses a set that has left the teacher’s library', async () => {
    await expect(launchFc({ fc: null }).run()).rejects.toThrow(
      'no longer in the teacher'
    );
  });
});
