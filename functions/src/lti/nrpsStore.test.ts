/**
 * Tests for persistLtiLaunchContext — the PII-free launch-context persistence.
 * Pins:
 *   (1) it resolves the right session (quiz: joinable + most-recent by code; VA:
 *       directly by session id) and files the NRPS membership under it;
 *   (2) it denormalizes the Schoology section onto the session — periodNames
 *       (union), classPeriodByClassId['schoology:<ctx>'], ltiAttachment, ltiNrps;
 *   (3) for a quiz it ALSO mirrors periodNames onto the teacher's archive doc
 *       (users/{teacherUid}/quiz_assignments/{sessionId}) so the manager card
 *       reads the section with no extra client read; VA does NOT;
 *   (4) all writes go through ONE atomic batch (membership URL + ltiNrps can't
 *       desync), and a repeat launch from a known context writes NOTHING;
 *   (5) it still denormalizes section + attachment when NRPS is OFF (no
 *       membership URL), but does NOT set ltiNrps or write a membership doc;
 *   (6) it never persists a name/email (PII gate);
 *   (7) it's a no-op when no target session matches.
 */

/* eslint-disable @typescript-eslint/require-await -- the structural Admin-SDK
   mock methods are async to match the real surface but don't await anything. */

import { describe, it, expect, beforeEach } from 'vitest';
import type * as admin from 'firebase-admin';
import {
  persistLtiLaunchContext,
  LTI_SESSION_MEMBERSHIPS_COLLECTION,
  QUIZ_SESSIONS_COLLECTION,
  VIDEO_ACTIVITY_SESSIONS_COLLECTION,
} from './nrpsStore';

interface SessionRow {
  id: string;
  data: Record<string, unknown>;
}
interface Write {
  path: string;
  data: Record<string, unknown>;
}

// quiz_sessions rows keyed by their `code` field (queried via where).
let quizSessions: SessionRow[];
// video_activity_sessions rows keyed by doc id (fetched via doc().get()).
let vaSessions: Map<string, Record<string, unknown>>;
// Existing membership context docs by full path.
let contextDocs: Map<string, Record<string, unknown>>;
// Existing per-teacher seen-section inventory docs by full path.
let seenDocs: Map<string, Record<string, unknown>>;
// Writes recorded when the batch commits.
let writes: Write[];

function docRef(path: string) {
  return {
    path,
    get: async () => {
      if (path.startsWith(`${LTI_SESSION_MEMBERSHIPS_COLLECTION}/`)) {
        return {
          exists: contextDocs.has(path),
          data: () => contextDocs.get(path),
        };
      }
      if (path.startsWith(`${VIDEO_ACTIVITY_SESSIONS_COLLECTION}/`)) {
        const id = path.split('/')[1];
        return {
          id,
          exists: vaSessions.has(id),
          data: () => vaSessions.get(id),
        };
      }
      if (path.includes('/lti_seen_sections/')) {
        return {
          exists: seenDocs.has(path),
          data: () => seenDocs.get(path),
        };
      }
      throw new Error(`unexpected get on ${path}`);
    },
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
    }),
  };
}

function makeDb() {
  return {
    collection: (name: string) => ({
      where: (field: string, _op: string, value: string) => ({
        get: async () => ({
          docs: quizSessions
            .filter((s) => s.data[field] === value)
            .map((s) => ({ id: s.id, data: () => s.data })),
        }),
      }),
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
    batch: () => {
      const ops: Write[] = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          ops.push({ path: ref.path, data });
        },
        commit: async () => {
          writes.push(...ops);
        },
      };
    },
  };
}

const db = (): admin.firestore.Firestore =>
  makeDb() as unknown as admin.firestore.Firestore;

const QUIZ_ARGS = {
  kind: 'quiz' as const,
  quizCode: 'abc123', // normalizeQuizCode → 'ABC123'
  contextId: 'ctx-1',
  contextTitle: 'Math 7',
  resourceLinkId: 'rl-1',
  membershipUrl: 'https://lms/contexts/ctx-1/memberships',
  deploymentId: 'dep-1',
};

function writeAt(prefix: string): Write | undefined {
  return writes.find((w) => w.path.startsWith(prefix));
}

beforeEach(() => {
  quizSessions = [];
  vaSessions = new Map();
  contextDocs = new Map();
  seenDocs = new Map();
  writes = [];
});

describe('persistLtiLaunchContext — quiz', () => {
  it('files membership + denormalizes the session + mirrors periodNames to the archive doc', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
        },
      },
    ];
    const sessionId = await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(sessionId).toBe('sess-1');

    // Membership doc under the resolved session + context.
    const ctx = writeAt(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/`
    );
    expect(ctx?.path).toBe(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/ctx-1`
    );
    // PII gate: only the URL + title + ids — never a name/email.
    expect(Object.keys(ctx?.data ?? {}).sort()).toEqual([
      'contextMembershipsUrl',
      'contextTitle',
      'deploymentId',
      'updatedAt',
    ]);
    expect(ctx?.data.contextMembershipsUrl).toBe(QUIZ_ARGS.membershipUrl);

    // Session denormalization.
    const sess = writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`);
    expect(sess?.data).toMatchObject({
      periodNames: ['Math 7'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
      ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
      ltiNrps: true,
    });

    // Archive-doc mirror (so the manager card needs no extra read).
    const archive = writeAt('users/teacher-1/quiz_assignments/sess-1');
    expect(archive?.data).toEqual({ periodNames: ['Math 7'] });

    // Per-teacher seen-section inventory (drives the linking UI; carries the
    // sessionId the linking CFs use as their trust anchor).
    const seen = writeAt('users/teacher-1/lti_seen_sections/');
    expect(seen?.path).toBe('users/teacher-1/lti_seen_sections/ctx-1');
    expect(seen?.data).toMatchObject({
      contextId: 'ctx-1',
      contextTitle: 'Math 7',
      sessionId: 'sess-1',
      kind: 'quiz',
    });
  });

  it('is idempotent — a repeat launch from the same context writes nothing', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          periodNames: ['Math 7'],
          classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
          ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
          ltiNrps: true,
        },
      },
    ];
    contextDocs.set(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/ctx-1`,
      { contextMembershipsUrl: QUIZ_ARGS.membershipUrl, contextTitle: 'Math 7' }
    );
    // The seen-section inventory is already current too, so nothing rewrites.
    seenDocs.set('users/teacher-1/lti_seen_sections/ctx-1', {
      contextId: 'ctx-1',
      contextTitle: 'Math 7',
      sessionId: 'sess-1',
      kind: 'quiz',
    });
    await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(writes).toHaveLength(0);
  });

  it('unions a second section into periodNames + classPeriodByClassId + archive', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          periodNames: ['Math 7'],
          classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
          ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
          ltiNrps: true,
        },
      },
    ];
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextId: 'ctx-2',
      contextTitle: 'Math 8',
      membershipUrl: 'https://lms/contexts/ctx-2/memberships',
    });
    const sess = writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`);
    expect(sess?.data.periodNames).toEqual(['Math 7', 'Math 8']);
    expect(sess?.data.classPeriodByClassId).toEqual({
      'schoology:ctx-1': 'Math 7',
      'schoology:ctx-2': 'Math 8',
    });
    // ltiAttachment NOT clobbered (first section wins).
    expect(sess?.data.ltiAttachment).toBeUndefined();
    // Archive mirror gets the unioned list too.
    expect(writeAt('users/teacher-1/quiz_assignments/sess-1')?.data).toEqual({
      periodNames: ['Math 7', 'Math 8'],
    });
  });

  it('denormalizes section + attachment + archive even when NRPS is OFF (no membership)', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
        },
      },
    ];
    const { membershipUrl: _omit, ...noNrps } = QUIZ_ARGS;
    void _omit;
    await persistLtiLaunchContext(db(), noNrps);

    expect(writeAt(`${LTI_SESSION_MEMBERSHIPS_COLLECTION}/`)).toBeUndefined();
    const sess = writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`);
    expect(sess?.data).toMatchObject({
      periodNames: ['Math 7'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
      ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
    });
    expect(sess?.data.ltiNrps).toBeUndefined();
    // Archive mirror still happens (it's keyed off the section change, not NRPS).
    expect(writeAt('users/teacher-1/quiz_assignments/sess-1')?.data).toEqual({
      periodNames: ['Math 7'],
    });
  });

  it('skips the archive mirror when the session has no teacherUid', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: { code: 'ABC123', status: 'active', startedAt: 1 },
      },
    ];
    await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(writeAt('users/')).toBeUndefined();
    // The session denormalization still happens.
    expect(writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)).toBeTruthy();
  });

  it('picks the most-recent joinable session and ignores ended ones', async () => {
    quizSessions = [
      { id: 'old', data: { code: 'ABC123', status: 'active', startedAt: 100 } },
      { id: 'new', data: { code: 'ABC123', status: 'active', startedAt: 500 } },
      {
        id: 'ended',
        data: { code: 'ABC123', status: 'ended', startedAt: 999 },
      },
    ];
    expect(await persistLtiLaunchContext(db(), QUIZ_ARGS)).toBe('new');
  });

  it('is a no-op when no joinable session matches', async () => {
    quizSessions = [
      { id: 'ended', data: { code: 'ABC123', status: 'ended', startedAt: 1 } },
    ];
    expect(await persistLtiLaunchContext(db(), QUIZ_ARGS)).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('returns null for an empty/garbage code without touching Firestore', async () => {
    const sessionId = await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      quizCode: '   ',
    });
    expect(sessionId).toBeNull();
    expect(writes).toHaveLength(0);
  });
});

describe('persistLtiLaunchContext — video activity', () => {
  const VA_ARGS = {
    kind: 'va' as const,
    sessionId: 'va-1',
    contextId: 'ctx-9',
    contextTitle: 'Science 6',
    resourceLinkId: 'rl-9',
    membershipUrl: 'https://lms/contexts/ctx-9/memberships',
    deploymentId: 'dep-1',
  };

  it('files under the VA session id and denormalizes it (no archive mirror)', async () => {
    vaSessions.set('va-1', { teacherUid: 't1', status: 'active' });
    expect(await persistLtiLaunchContext(db(), VA_ARGS)).toBe('va-1');

    expect(
      writeAt(`${LTI_SESSION_MEMBERSHIPS_COLLECTION}/va-1/contexts/`)?.path
    ).toBe(`${LTI_SESSION_MEMBERSHIPS_COLLECTION}/va-1/contexts/ctx-9`);
    expect(
      writeAt(`${VIDEO_ACTIVITY_SESSIONS_COLLECTION}/va-1`)?.data
    ).toMatchObject({
      periodNames: ['Science 6'],
      classPeriodByClassId: { 'schoology:ctx-9': 'Science 6' },
      ltiAttachment: { resourceLinkId: 'rl-9', contextId: 'ctx-9' },
      ltiNrps: true,
    });
    // VA's manager card labels by activity title — no quiz_assignments mirror.
    expect(writeAt('users/t1/quiz_assignments/')).toBeUndefined();
    // …but the seen-section inventory IS written (quiz + VA both feed it).
    const seen = writeAt('users/t1/lti_seen_sections/');
    expect(seen?.path).toBe('users/t1/lti_seen_sections/ctx-9');
    expect(seen?.data).toMatchObject({
      contextId: 'ctx-9',
      sessionId: 'va-1',
      kind: 'va',
    });
  });

  it('is a no-op when the VA session id is missing or unknown', async () => {
    expect(
      await persistLtiLaunchContext(db(), { ...VA_ARGS, sessionId: '' })
    ).toBeNull();
    expect(await persistLtiLaunchContext(db(), VA_ARGS)).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
