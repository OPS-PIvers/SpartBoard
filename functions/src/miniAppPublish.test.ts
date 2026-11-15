// Unit tests for publishMiniAppScoresV1.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => '__delete__' },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  buildPublishedResult,
  correctAnswerText,
  handlePublishMiniAppScores,
} from './miniAppPublish';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handlePublishMiniAppScores>[0];

function makeDb(docs: Record<string, Doc>) {
  const docRef = (path: string): unknown => ({
    id: path.split('/').pop(),
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    update: (d: Doc) => {
      const next = { ...(docs[path] ?? {}), ...d };
      for (const [k, v] of Object.entries(d))
        if (v === '__delete__') delete next[k];
      docs[path] = next;
      return Promise.resolve();
    },
    collection: (sub: string) => colRef(`${path}/${sub}`),
  });
  const colRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: () => {
      const depth = path.split('/').length + 1;
      const hits = Object.keys(docs).filter(
        (p) => p.startsWith(`${path}/`) && p.split('/').length === depth
      );
      return Promise.resolve({
        docs: hits.map((p) => ({
          id: p.split('/').pop(),
          ref: docRef(p),
          data: () => docs[p],
        })),
      });
    },
  });
  return {
    collection: (c: string) => colRef(c),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { path: string }, d: Doc) =>
          ops.push(() => (docs[ref.path] = d)),
        delete: (ref: { path: string }) =>
          ops.push(() => delete docs[ref.path]),
        commit: () => {
          ops.forEach((op) => op());
          return Promise.resolve();
        },
      };
    },
  } as unknown as Db;
}

const S = 'mini_app_sessions/s1';
const NOW = 1_000;
const teacher = { uid: 't1', studentRole: false };

const session = (extra: Doc = {}): Doc => ({
  teacherUid: 't1',
  status: 'ended',
  mode: 'submissions',
  resultsVersion: 2,
  assignmentId: 'a1',
  manifest: {
    questions: [
      { id: 'q1', type: 'mc', prompt: 'Which is larger?' },
      { id: 'q2', type: 'numeric', prompt: '3/4 of 20' },
    ],
  },
  ...extra,
});

const graded = (): Record<string, Doc> => ({
  [S]: session(),
  'users/t1/miniapp_assignments/a1': { id: 'a1' },
  [`${S}/private/key`]: {
    questions: { q1: { correct: '3/4' }, q2: { correct: 15, tolerance: 0 } },
  },
  [`${S}/submissions/p1`]: {
    studentUid: 'u1',
    attemptCount: 2,
    best: {
      score: 1,
      maxScore: 2,
      attemptNo: 1,
      gradedBy: 'server',
      items: [
        { id: 'q1', correct: true, by: 'server' },
        { id: 'q2', correct: false, by: 'server' },
      ],
    },
  },
  [`${S}/submissions/p1/attempts/1`]: {
    items: [
      { id: 'q1', answer: '3/4', correct: true },
      { id: 'q2', answer: 12, correct: false },
    ],
    payload: { items: [] },
  },
  [`${S}/submissions/p2`]: { studentUid: 'u2', payload: { completed: true } },
});

describe('publishMiniAppScoresV1', () => {
  it('writes score only and marks the session and archive row', async () => {
    const docs = graded();
    const res = await handlePublishMiniAppScores(
      makeDb(docs),
      teacher,
      { sessionId: 's1', visibility: 'score-only' },
      NOW
    );
    expect(res.published).toBe(1);
    expect(docs[`${S}/published/p1`]).toEqual({
      studentUid: 'u1',
      visibility: 'score-only',
      publishedAt: NOW,
      score: 1,
      maxScore: 2,
      gradedBy: 'server',
      correctCount: 1,
      gradedCount: 2,
    });
    expect(docs[`${S}/published/p2`]).toBeUndefined();
    expect(docs[S].scoreVisibility).toBe('score-only');
    expect(docs['users/t1/miniapp_assignments/a1'].scorePublishedAt).toBe(NOW);
  });

  it('adds the best attempt answers, and correct answers only at the top level', async () => {
    const docs = graded();
    const db = makeDb(docs);
    await handlePublishMiniAppScores(
      db,
      teacher,
      { sessionId: 's1', visibility: 'score-and-responses' },
      NOW
    );
    const mid = docs[`${S}/published/p1`].items as Doc[];
    expect(mid[1]).toEqual({
      id: 'q2',
      prompt: '3/4 of 20',
      answer: 12,
      correct: false,
    });
    await handlePublishMiniAppScores(
      db,
      teacher,
      { sessionId: 's1', visibility: 'score-responses-and-answers' },
      NOW
    );
    const top = docs[`${S}/published/p1`].items as Doc[];
    expect(top[1].correctAnswer).toBe('15');
  });

  it('unpublishes by deleting every copy', async () => {
    const docs = graded();
    const db = makeDb(docs);
    await handlePublishMiniAppScores(
      db,
      teacher,
      { sessionId: 's1', visibility: 'score-only' },
      NOW
    );
    await handlePublishMiniAppScores(
      db,
      teacher,
      { sessionId: 's1', visibility: 'none' },
      NOW
    );
    expect(docs[`${S}/published/p1`]).toBeUndefined();
    expect(docs[S].scoreVisibility).toBe('none');
    expect('scorePublishedAt' in docs[S]).toBe(false);
  });

  it('refuses other teachers, students, live and view-only assignments', async () => {
    const input = { sessionId: 's1', visibility: 'score-only' };
    await expect(
      handlePublishMiniAppScores(
        makeDb(graded()),
        { uid: 't2', studentRole: false },
        input,
        NOW
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handlePublishMiniAppScores(
        makeDb(graded()),
        { uid: 't1', studentRole: true },
        input,
        NOW
      )
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    const live = graded();
    live[S] = session({ status: 'active' });
    await expect(
      handlePublishMiniAppScores(makeDb(live), teacher, input, NOW)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const viewOnly = graded();
    viewOnly[S] = session({ mode: 'view-only' });
    await expect(
      handlePublishMiniAppScores(makeDb(viewOnly), teacher, input, NOW)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      handlePublishMiniAppScores(
        makeDb(graded()),
        teacher,
        { sessionId: 's1', visibility: 'all' },
        NOW
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('buildPublishedResult', () => {
  it('shows an older app payload as details at the responses level', () => {
    const r = buildPublishedResult(
      { studentUid: 'u1', payload: { levelReached: 4, completed: true } },
      null,
      session(),
      null,
      'score-and-responses',
      NOW
    );
    expect(r?.details).toEqual({ levelReached: 4 });
    expect(r?.score).toBeUndefined();
    expect(
      buildPublishedResult(
        { studentUid: 'u1', payload: { levelReached: 4 } },
        null,
        session(),
        null,
        'score-only',
        NOW
      )
    ).toBeNull();
  });
});

describe('correctAnswerText', () => {
  it('reads scalars, lists and accepted answers', () => {
    expect(correctAnswerText({ correct: true })).toBe('True');
    expect(correctAnswerText({ correct: ['a', 'b'] })).toBe('a, b');
    expect(correctAnswerText({ accepted: ['Numerator'] })).toBe('Numerator');
    expect(correctAnswerText({})).toBeUndefined();
  });
});
