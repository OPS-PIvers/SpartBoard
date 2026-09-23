// Unit tests for `launchSubAssignmentV1` (SUB_SHARE_COLLECTIONS.md §3.6, D7).
//
// This callable writes into another teacher's account, so the tests are mostly
// about refusal: who may call it, which share and board it will act on, and
// what it will accept as the session to write. The stub Firestore mirrors only
// the `doc().get()` and `batch().set()/commit()` surface the handler uses.

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
  publicQuestionsMatchKey,
  type SubLaunchCaller,
} from './subLaunchAssignment';

const NOW = 1_700_000_000_000;
const HOST = 'teacher-uid-1';
const SHARE = 'share-1';
const BOARD = 'board-1';
const WIDGET = 'widget-1';
const QUIZ = 'quiz-1';

const SUB: SubLaunchCaller = {
  uid: 'sub-uid-1',
  email: 'Sub@orono.k12.mn.us',
  emailVerified: true,
  anonymous: false,
  studentRole: false,
};

const KEY_QUESTIONS = [
  { id: 'q1', text: 'Which phase?', correctAnswer: 'Anaphase' },
  { id: 'q2', text: 'Name the organelle', correctAnswer: 'Nucleus' },
];

/** The session a sub's client builds: the key's questions, answers removed. */
const session = (over: Record<string, unknown> = {}) => ({
  quizId: QUIZ,
  quizTitle: 'Cells',
  status: 'waiting',
  code: 'AB12CD',
  publicQuestions: [
    { id: 'q1', text: 'Which phase?', choices: ['Anaphase', 'Telophase'] },
    { id: 'q2', text: 'Name the organelle' },
  ],
  ...over,
});

const assignment = (over: Record<string, unknown> = {}) => ({
  quizId: QUIZ,
  quizTitle: 'Cells',
  status: 'active',
  code: 'AB12CD',
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  shareId: SHARE,
  boardId: BOARD,
  widgetId: WIDGET,
  kind: 'quiz',
  itemId: QUIZ,
  classIds: ['class-A'],
  session: session(),
  assignment: assignment(),
  ...over,
});

interface StubState {
  switchOn?: boolean;
  share?: Record<string, unknown> | null;
  board?: Record<string, unknown> | null;
  key?: Record<string, unknown> | null;
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
    },
    board = { widgets: [{ id: WIDGET, type: 'quiz' }] },
    key = { payload: { quiz: { id: QUIZ, questions: KEY_QUESTIONS } } },
  } = state;

  const written: Written[] = [];
  const docs: Record<string, Record<string, unknown> | null> = {
    'admin_settings/sub_launch_as_teacher': { enabled: switchOn },
    [`shared_collections/${SHARE}`]: share,
    [`shared_collections/${SHARE}/boards/${BOARD}`]: board,
    [`shared_collections/${SHARE}/keys/quiz_${QUIZ}`]: key,
  };

  const db = {
    doc: (path: string) => ({
      path,
      get: () =>
        Promise.resolve({
          exists: docs[path] != null,
          data: () => docs[path] ?? undefined,
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

const deps = { now: () => NOW, newId: () => 'new-session-id' };

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
    const paths = written.map((w) => w.path);
    expect(paths).toEqual([
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

  it('targets the classes the caller picked', async () => {
    const { run, written } = launch({}, SUB, input({ classIds: ['c1', 'c2'] }));

    await run();

    expect(written[0].data.classIds).toEqual(['c1', 'c2']);
    expect(written[0].data.classId).toBe('c1');
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
      launch({ board: { widgets: [{ id: 'other-widget' }] } }).run()
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

  it('refuses a session whose questions are not the shared quiz’s', async () => {
    await expect(
      launch(
        {},
        SUB,
        input({
          session: session({
            publicQuestions: [{ id: 'q9', text: 'Made up' }],
          }),
        })
      ).run()
    ).rejects.toThrow('not in the shared quiz');

    await expect(
      launch(
        {},
        SUB,
        input({
          session: session({
            publicQuestions: [{ id: 'q1', text: 'Rewritten by the sub' }],
          }),
        })
      ).run()
    ).rejects.toThrow('does not match the shared quiz');
  });

  it('refuses a session for a different quiz', async () => {
    await expect(
      launch({}, SUB, input({ session: session({ quizId: 'other' }) })).run()
    ).rejects.toThrow('another quiz');
  });

  // The whole point of a public question: a student reads the session doc.
  it('refuses a session carrying the answer key', async () => {
    await expect(
      launch(
        {},
        SUB,
        input({
          session: session({
            publicQuestions: [
              { id: 'q1', text: 'Which phase?', correctAnswer: 'Anaphase' },
            ],
          }),
        })
      ).run()
    ).rejects.toThrow('correctAnswer');
  });

  it('refuses a caller trying to set ownership or the monitor stamp', async () => {
    for (const field of [
      'teacherUid',
      'subMonitorUids',
      'subMonitorUntil',
      'launchedBy',
      'plcId',
      'rosterIds',
    ]) {
      await expect(
        launch({}, SUB, input({ session: session({ [field]: 'x' }) })).run()
      ).rejects.toThrow('not yours to set');
    }
  });

  it('refuses a session with no usable join code', async () => {
    await expect(
      launch({}, SUB, input({ session: session({ code: 'nope!' }) })).run()
    ).rejects.toThrow('no join code');
  });

  it('refuses no class, too many classes, and a path as an id', async () => {
    await expect(
      launch({}, SUB, input({ classIds: [] })).run()
    ).rejects.toThrow('at least one class');
    await expect(
      launch({}, SUB, input({ classIds: Array(21).fill('c') })).run()
    ).rejects.toThrow('Too many classes');
    await expect(
      launch({}, SUB, input({ boardId: '../other' })).run()
    ).rejects.toThrow('must not be a path');
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
    expect(findAnswerField({ a: [{ b: { text: 'x' } }] })).toBeNull();
  });
});

describe('publicQuestionsMatchKey', () => {
  it('accepts the key’s own questions and nothing else', () => {
    expect(
      publicQuestionsMatchKey(
        [{ id: 'q1', text: 'Which phase?' }],
        KEY_QUESTIONS
      )
    ).toBeNull();
    expect(publicQuestionsMatchKey([], KEY_QUESTIONS)).toMatch('no questions');
    expect(publicQuestionsMatchKey(['q1'], KEY_QUESTIONS)).toMatch(
      'not an object'
    );
  });
});
