// Unit tests for the hourly quiz-media straggler sweep (Brief 3.3).
//
// The sweep's contract is narrow: retry anything stuck past 2 hours, leave
// fresher entries alone, and queue exactly one /mail doc per affected teacher
// per run — never one per artifact.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  firestore: Object.assign(vi.fn(), {
    FieldPath: { documentId: () => '__name__' },
  }),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock('./functionsInit', () => ({}));
vi.mock('./quizMediaArchive', () => ({
  archiveQuizArtifactCore: vi.fn(),
  buildDefaultArchiveDeps: vi.fn(),
  QUIZ_MEDIA_ARCHIVE_SECRETS: [],
}));

import {
  runSweepStuckQuizArchives,
  isStuckArchiveEntry,
  findQuestionIdForArtifact,
  buildStragglerEmail,
  STUCK_ARCHIVE_AGE_MS,
  MAX_LISTED_STRAGGLERS,
  type SweepDeps,
} from './sweepStuckQuizArchives';

const NOW = 1_700_000_000_000;
const OLD = NOW - STUCK_ARCHIVE_AGE_MS - 1000;
const FRESH = NOW - 60_000;

interface SeedResponse {
  sessionId: string;
  id: string;
  data: Record<string, unknown>;
}

function makeStubDb(
  responses: SeedResponse[],
  sessions: Record<string, Record<string, unknown>>
) {
  const mailWrites: { id: string; data: Record<string, unknown> }[] = [];
  const docs = responses.map((r) => ({
    id: r.id,
    data: () => r.data,
    ref: { parent: { parent: { id: r.sessionId } } },
  }));

  function makeQuery(cursorId: string | null) {
    const start = cursorId ? docs.findIndex((d) => d.id === cursorId) + 1 : 0;
    const page = docs.slice(start);
    return {
      where: () => makeQuery(cursorId),
      orderBy: () => makeQuery(cursorId),
      limit: () => makeQuery(cursorId),
      startAfter: (snap: { id: string }) => makeQuery(snap.id),
      get: () =>
        Promise.resolve({
          empty: page.length === 0,
          docs: page,
          size: page.length,
        }),
    };
  }

  const db = {
    collectionGroup: () => makeQuery(null),
    collection: (name: string) => {
      if (name === 'quiz_sessions') {
        return {
          doc: (id: string) => ({
            get: () => Promise.resolve({ data: () => sessions[id] }),
          }),
        };
      }
      if (name === 'mail') {
        return {
          doc: (id: string) => ({
            set: (data: Record<string, unknown>) => {
              mailWrites.push({ id, data });
              return Promise.resolve();
            },
          }),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  };
  return { db, mailWrites };
}

function makeDeps(overrides: Partial<SweepDeps> = {}): SweepDeps {
  return {
    archiveOne: vi.fn(() => Promise.resolve()),
    getTeacherEmail: vi.fn(() => Promise.resolve('teacher@school.org')),
    now: () => NOW,
    ...overrides,
  };
}

function answersWith(questionId: string, artifactId: string) {
  return [{ questionId, artifacts: [{ id: artifactId }] }];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pure helpers', () => {
  it('treats only syncing/failed entries past the threshold as stuck', () => {
    expect(
      isStuckArchiveEntry(
        { archiveStatus: 'syncing', archiveStartedAt: OLD },
        NOW
      )
    ).toBe(true);
    expect(
      isStuckArchiveEntry(
        { archiveStatus: 'failed', archiveStartedAt: OLD },
        NOW
      )
    ).toBe(true);
    expect(
      isStuckArchiveEntry(
        { archiveStatus: 'syncing', archiveStartedAt: FRESH },
        NOW
      )
    ).toBe(false);
    expect(
      isStuckArchiveEntry(
        { archiveStatus: 'archived', archiveStartedAt: OLD },
        NOW
      )
    ).toBe(false);
    expect(isStuckArchiveEntry(undefined, NOW)).toBe(false);
  });

  it('finds the question that owns an artifact', () => {
    expect(findQuestionIdForArtifact(answersWith('q7', 'a1'), 'a1')).toBe('q7');
    expect(
      findQuestionIdForArtifact(answersWith('q7', 'a1'), 'nope')
    ).toBeNull();
    expect(findQuestionIdForArtifact(undefined, 'a1')).toBeNull();
  });

  it('summarizes overflow rather than listing every straggler', () => {
    const items = Array.from({ length: MAX_LISTED_STRAGGLERS + 5 }, (_, i) => ({
      quizTitle: 'Unit 3',
      questionId: `q${i}`,
    }));
    const email = buildStragglerEmail(items);
    expect(email.text).toContain('...and 5 more');
    expect(email.subject).toContain(`${items.length} student recordings`);
  });
});

describe('runSweepStuckQuizArchives', () => {
  it('retries an artifact stuck past 2 hours', async () => {
    const { db } = makeStubDb(
      [
        {
          sessionId: 's1',
          id: 'r1',
          data: {
            hasStuckArchive: true,
            answers: answersWith('q1', 'a1'),
            artifactArchive: {
              a1: { archiveStatus: 'syncing', archiveStartedAt: OLD },
            },
          },
        },
      ],
      { s1: { teacherUid: 't1', quizTitle: 'Unit 3' } }
    );
    const deps = makeDeps();
    const summary = await runSweepStuckQuizArchives(
      db as unknown as Parameters<typeof runSweepStuckQuizArchives>[0],
      deps
    );
    expect(deps.archiveOne).toHaveBeenCalledWith({
      sessionId: 's1',
      responseKey: 'r1',
      questionId: 'q1',
      artifactId: 'a1',
    });
    expect(summary).toMatchObject({ retried: 1, recovered: 1, stillStuck: 0 });
  });

  it('leaves a fresh syncing artifact alone', async () => {
    const { db } = makeStubDb(
      [
        {
          sessionId: 's1',
          id: 'r1',
          data: {
            hasStuckArchive: true,
            answers: answersWith('q1', 'a1'),
            artifactArchive: {
              a1: { archiveStatus: 'syncing', archiveStartedAt: FRESH },
            },
          },
        },
      ],
      { s1: { teacherUid: 't1', quizTitle: 'Unit 3' } }
    );
    const deps = makeDeps();
    const summary = await runSweepStuckQuizArchives(
      db as unknown as Parameters<typeof runSweepStuckQuizArchives>[0],
      deps
    );
    expect(deps.archiveOne).not.toHaveBeenCalled();
    expect(summary.retried).toBe(0);
  });

  it('queues one mail doc per teacher, not one per stuck artifact', async () => {
    const { db, mailWrites } = makeStubDb(
      [
        {
          sessionId: 's1',
          id: 'r1',
          data: {
            hasStuckArchive: true,
            answers: [
              { questionId: 'q1', artifacts: [{ id: 'a1' }, { id: 'a2' }] },
            ],
            artifactArchive: {
              a1: { archiveStatus: 'failed', archiveStartedAt: OLD },
              a2: { archiveStatus: 'failed', archiveStartedAt: OLD },
            },
          },
        },
        {
          sessionId: 's1',
          id: 'r2',
          data: {
            hasStuckArchive: true,
            answers: answersWith('q2', 'a3'),
            artifactArchive: {
              a3: { archiveStatus: 'failed', archiveStartedAt: OLD },
            },
          },
        },
        {
          sessionId: 's2',
          id: 'r3',
          data: {
            hasStuckArchive: true,
            answers: answersWith('q9', 'a4'),
            artifactArchive: {
              a4: { archiveStatus: 'failed', archiveStartedAt: OLD },
            },
          },
        },
      ],
      {
        s1: { teacherUid: 't1', quizTitle: 'Unit 3' },
        s2: { teacherUid: 't2', quizTitle: 'Unit 4' },
      }
    );
    const deps = makeDeps({
      archiveOne: vi.fn(() => Promise.reject(new Error('drive down'))),
    });
    const summary = await runSweepStuckQuizArchives(
      db as unknown as Parameters<typeof runSweepStuckQuizArchives>[0],
      deps
    );
    expect(summary.stillStuck).toBe(4);
    expect(mailWrites).toHaveLength(2);
    expect(summary.mailQueued).toBe(2);
    const ids = mailWrites.map((m) => m.id).sort();
    expect(ids[0]).toContain('quiz-archive-stuck-t1-');
    expect(ids[1]).toContain('quiz-archive-stuck-t2-');
    const t1 = mailWrites.find((m) => m.id.includes('-t1-'));
    expect((t1?.data.message as { text: string }).text).toContain(
      'question q1'
    );
  });
});
