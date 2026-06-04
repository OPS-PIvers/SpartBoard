/**
 * Tests for persistLtiLaunchContext — the PII-free launch-context persistence.
 * Pins:
 *   (1) it resolves the right session (quiz: joinable + most-recent by code; VA:
 *       directly by session id) and files the NRPS membership under it;
 *   (2) it denormalizes the Schoology section onto the session — periodNames
 *       (union), classPeriodByClassId['schoology:<ctx>'], ltiAttachment, ltiNrps;
 *   (3) it is idempotent + write-bounded (a repeat launch from the same context
 *       writes NOTHING — no monitor snapshot churn);
 *   (4) it still denormalizes section + attachment when NRPS is OFF (no
 *       membership URL), but does NOT set ltiNrps or write a membership doc;
 *   (5) it never persists a name/email (PII gate);
 *   (6) it's a no-op when no target session matches.
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
let writes: Write[];

function makeDb() {
  const ctxDocRef = (sessionId: string, contextId: string) => {
    const path = `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/${sessionId}/contexts/${contextId}`;
    return {
      get: async () => ({
        exists: contextDocs.has(path),
        data: () => contextDocs.get(path),
      }),
      set: async (data: Record<string, unknown>) => {
        contextDocs.set(path, { ...(contextDocs.get(path) ?? {}), ...data });
        writes.push({ path, data });
      },
    };
  };
  return {
    collection: (name: string) => {
      if (name === QUIZ_SESSIONS_COLLECTION) {
        return {
          where: (_field: string, _op: string, value: string) => ({
            get: async () => ({
              docs: quizSessions
                .filter((s) => s.data.code === value)
                .map((s) => ({ id: s.id, data: () => s.data })),
            }),
          }),
          doc: (id: string) => ({
            set: async (data: Record<string, unknown>) => {
              writes.push({ path: `${QUIZ_SESSIONS_COLLECTION}/${id}`, data });
            },
          }),
        };
      }
      if (name === VIDEO_ACTIVITY_SESSIONS_COLLECTION) {
        return {
          doc: (id: string) => ({
            get: async () => ({
              id,
              exists: vaSessions.has(id),
              data: () => vaSessions.get(id),
            }),
            set: async (data: Record<string, unknown>) => {
              writes.push({
                path: `${VIDEO_ACTIVITY_SESSIONS_COLLECTION}/${id}`,
                data,
              });
            },
          }),
        };
      }
      if (name === LTI_SESSION_MEMBERSHIPS_COLLECTION) {
        return {
          doc: (sessionId: string) => ({
            collection: () => ({
              doc: (contextId: string) => ctxDocRef(sessionId, contextId),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
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

function sessionWrite(): Write | undefined {
  return writes.find((w) => w.path.startsWith(`${QUIZ_SESSIONS_COLLECTION}/`));
}
function ctxWrite(): Write | undefined {
  return writes.find((w) =>
    w.path.startsWith(`${LTI_SESSION_MEMBERSHIPS_COLLECTION}/`)
  );
}

beforeEach(() => {
  quizSessions = [];
  vaSessions = new Map();
  contextDocs = new Map();
  writes = [];
});

describe('persistLtiLaunchContext — quiz', () => {
  it('files the membership and denormalizes the section onto the joinable session', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: { code: 'ABC123', status: 'active', startedAt: 100 },
      },
    ];
    const sessionId = await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(sessionId).toBe('sess-1');

    // Membership doc filed under the resolved session + context.
    const ctx = ctxWrite();
    expect(ctx?.path).toBe(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/ctx-1`
    );
    // PII gate: only the URL + title + ids are persisted — never a name/email.
    expect(Object.keys(ctx?.data ?? {}).sort()).toEqual([
      'contextMembershipsUrl',
      'contextTitle',
      'deploymentId',
      'updatedAt',
    ]);
    expect(ctx?.data.contextMembershipsUrl).toBe(QUIZ_ARGS.membershipUrl);
    expect(ctx?.data.contextTitle).toBe('Math 7');

    // Session denormalization.
    const sess = sessionWrite();
    expect(sess?.path).toBe(`${QUIZ_SESSIONS_COLLECTION}/sess-1`);
    expect(sess?.data).toMatchObject({
      periodNames: ['Math 7'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
      ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
      ltiNrps: true,
    });
  });

  it('is idempotent — a repeat launch from the same context writes nothing', async () => {
    // Session already carries everything this launch would set.
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          periodNames: ['Math 7'],
          classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
          ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
          ltiNrps: true,
        },
      },
    ];
    // Membership doc already present + unchanged.
    contextDocs.set(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/ctx-1`,
      {
        contextMembershipsUrl: QUIZ_ARGS.membershipUrl,
        contextTitle: 'Math 7',
      }
    );

    await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(writes).toHaveLength(0);
  });

  it('unions a second section into periodNames + classPeriodByClassId', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          periodNames: ['Math 7'],
          classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
          ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
          ltiNrps: true,
        },
      },
    ];
    const sessionId = await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextId: 'ctx-2',
      contextTitle: 'Math 8',
      membershipUrl: 'https://lms/contexts/ctx-2/memberships',
    });
    expect(sessionId).toBe('sess-1');
    const sess = sessionWrite();
    expect(sess?.data.periodNames).toEqual(['Math 7', 'Math 8']);
    expect(sess?.data.classPeriodByClassId).toEqual({
      'schoology:ctx-1': 'Math 7',
      'schoology:ctx-2': 'Math 8',
    });
    // ltiAttachment is NOT clobbered (first section wins).
    expect(sess?.data.ltiAttachment).toBeUndefined();
  });

  it('denormalizes section + attachment even when NRPS is OFF (no membership)', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: { code: 'ABC123', status: 'active', startedAt: 100 },
      },
    ];
    const { membershipUrl: _omit, ...noNrps } = QUIZ_ARGS;
    void _omit;
    await persistLtiLaunchContext(db(), noNrps);

    // No membership doc written.
    expect(ctxWrite()).toBeUndefined();
    const sess = sessionWrite();
    expect(sess?.data).toMatchObject({
      periodNames: ['Math 7'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
      ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
    });
    // ltiNrps is NOT set without an NRPS membership endpoint.
    expect(sess?.data.ltiNrps).toBeUndefined();
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
    const sessionId = await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(sessionId).toBe('new');
  });

  it('is a no-op when no joinable session matches', async () => {
    quizSessions = [
      { id: 'ended', data: { code: 'ABC123', status: 'ended', startedAt: 1 } },
    ];
    const sessionId = await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(sessionId).toBeNull();
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

  it('files under the VA session id directly and denormalizes it', async () => {
    vaSessions.set('va-1', { teacherUid: 't1', status: 'active' });
    const sessionId = await persistLtiLaunchContext(db(), VA_ARGS);
    expect(sessionId).toBe('va-1');

    const ctx = ctxWrite();
    expect(ctx?.path).toBe(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/va-1/contexts/ctx-9`
    );
    const sess = writes.find((w) =>
      w.path.startsWith(`${VIDEO_ACTIVITY_SESSIONS_COLLECTION}/`)
    );
    expect(sess?.path).toBe(`${VIDEO_ACTIVITY_SESSIONS_COLLECTION}/va-1`);
    expect(sess?.data).toMatchObject({
      periodNames: ['Science 6'],
      classPeriodByClassId: { 'schoology:ctx-9': 'Science 6' },
      ltiAttachment: { resourceLinkId: 'rl-9', contextId: 'ctx-9' },
      ltiNrps: true,
    });
  });

  it('is a no-op when the VA session id is missing or unknown', async () => {
    expect(
      await persistLtiLaunchContext(db(), { ...VA_ARGS, sessionId: '' })
    ).toBeNull();
    expect(await persistLtiLaunchContext(db(), VA_ARGS)).toBeNull(); // not in vaSessions
    expect(writes).toHaveLength(0);
  });
});
