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
  dropLinkedSectionPeriod,
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
// lti_course_links/{contextId} docs (section ↔ ClassLink class).
let courseLinkDocs: Map<string, Record<string, unknown>>;
// classPeriod labels already carried by responses, keyed by session id.
let responsePeriods: Map<string, string[]>;
// Response docs with ids and fields, keyed by session id.
let responseRows: Map<
  string,
  { id: string; classId?: string; classPeriod?: string }[]
>;
// Writes recorded when the batch commits.
let writes: Write[];
// Response updates recorded when the batch commits.
let updates: Write[];

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
      if (path.startsWith('lti_course_links/')) {
        const id = path.split('/')[1];
        return {
          exists: courseLinkDocs.has(id),
          data: () => courseLinkDocs.get(id),
        };
      }
      if (path.startsWith(`${QUIZ_SESSIONS_COLLECTION}/`)) {
        const id = path.split('/')[1];
        const row = quizSessions.find((s) => s.id === id);
        return { id, exists: !!row, data: () => row?.data };
      }
      throw new Error(`unexpected get on ${path}`);
    },
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
      where: (field: string, _op: string, value: string) => {
        const sid = path.split('/')[1];
        const rows = [
          ...(responsePeriods.get(sid) ?? []).map((classPeriod, i) => ({
            id: `legacy-${i}`,
            classPeriod,
          })),
          ...(responseRows.get(sid) ?? []),
        ].filter((r) => (r as Record<string, unknown>)[field] === value);
        const docs = rows.map((r) => ({
          ref: { path: `${path}/${sub}/${r.id}` },
          data: () => r,
        }));
        return {
          get: async () => ({ empty: docs.length === 0, docs }),
          limit: () => ({ get: async () => ({ empty: docs.length === 0 }) }),
        };
      },
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
      const ups: Write[] = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          ops.push({ path: ref.path, data });
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          ups.push({ path: ref.path, data });
        },
        commit: async () => {
          writes.push(...ops);
          updates.push(...ups);
          for (const u of ups) {
            const [, sid, , rid] = u.path.split('/');
            const row = responseRows.get(sid)?.find((r) => r.id === rid);
            if (row) Object.assign(row, u.data);
          }
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
  courseLinkDocs = new Map();
  responsePeriods = new Map();
  responseRows = new Map();
  writes = [];
  updates = [];
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
      classIds: ['schoology:ctx-1'],
      periodNames: ['Math 7'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
      ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
      ltiNrps: true,
    });

    // Archive-doc mirror (so the manager card needs no extra read).
    const archive = writeAt('users/teacher-1/quiz_assignments/sess-1');
    expect(archive?.data).toEqual({
      periodNames: ['Math 7'],
      classIds: ['schoology:ctx-1'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
    });

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
          classIds: ['schoology:ctx-1'],
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

  it('unions a linked section into classIds so its students pass the rules class-gate', async () => {
    // Attached from section ctx-1; a student of LINKED section ctx-2 launches
    // with classIds claim ['schoology:ctx-2'] — must overlap after this write.
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          classIds: ['schoology:ctx-1'],
          classId: 'schoology:ctx-1',
        },
      },
    ];
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextId: 'ctx-2',
      contextTitle: null,
      membershipUrl: null,
    });
    const sess = writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`);
    expect(sess?.data.classIds).toEqual(['schoology:ctx-1', 'schoology:ctx-2']);
    // Legacy single classId is left alone (rules prefer the list when non-empty).
    expect(sess?.data.classId).toBeUndefined();
  });

  it('skips the classIds union when the launch was bridged to a ClassLink class already on the session', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          classIds: ['CL-CLASS-A'],
        },
      },
    ];
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      bridgedClassId: 'CL-CLASS-A',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.classIds
    ).toBeUndefined();
  });

  it('still unions the section when the bridged class is NOT on the session', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          classIds: ['schoology:ctx-0'],
        },
      },
    ];
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      bridgedClassId: 'CL-CLASS-Z',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.classIds
    ).toEqual(['schoology:ctx-0', 'schoology:ctx-1']);
  });

  it('also unions the section into an in-app session targeted by ClassLink class ids', async () => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          classIds: ['CL-CLASS-A', 'CL-CLASS-B'],
        },
      },
    ];
    await persistLtiLaunchContext(db(), QUIZ_ARGS);
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.classIds
    ).toEqual(['CL-CLASS-A', 'CL-CLASS-B', 'schoology:ctx-1']);
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
      classIds: ['schoology:ctx-2'],
      classPeriodByClassId: {
        'schoology:ctx-1': 'Math 7',
        'schoology:ctx-2': 'Math 8',
      },
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
      classIds: ['schoology:ctx-1'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math 7' },
    });
    // …but the seen-section inventory is NOT written without NRPS: the linking
    // trust anchor needs the membership context doc (NRPS-only), so advertising
    // a section the link CFs would reject is suppressed.
    expect(writeAt('users/teacher-1/lti_seen_sections/')).toBeUndefined();
  });

  it('preserves a previously-captured section title when a relaunch omits it', async () => {
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
    // The seen-section already has the title from an earlier titled launch.
    seenDocs.set('users/teacher-1/lti_seen_sections/ctx-1', {
      contextId: 'ctx-1',
      contextTitle: 'Math 7',
      sessionId: 'sess-1',
      kind: 'quiz',
    });
    // This relaunch carries NO context title (privacy config) but keeps NRPS.
    await persistLtiLaunchContext(db(), { ...QUIZ_ARGS, contextTitle: null });
    // The stored title must NOT be clobbered to null → no seen-section rewrite.
    expect(writeAt('users/teacher-1/lti_seen_sections/')).toBeUndefined();
  });

  it('does not clobber the context membership doc title when a relaunch omits it', async () => {
    // Regression: a privacy-configured Schoology relaunch (contextTitle: null)
    // was overwriting the previously-stored contextTitle in the membership doc
    // with null, clearing the section name shown in the linking UI. The fix
    // applies the same "prefer stored title" logic that the seen-section
    // inventory already uses (args.contextTitle ?? storedTitle).
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          classIds: ['schoology:ctx-1'],
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
    seenDocs.set('users/teacher-1/lti_seen_sections/ctx-1', {
      contextId: 'ctx-1',
      contextTitle: 'Math 7',
      sessionId: 'sess-1',
      kind: 'quiz',
    });
    // A relaunch with no title should produce ZERO writes: the membership URL
    // is unchanged, the stored title is preserved (not clobbered to null), and
    // the seen-section inventory is already current.
    await persistLtiLaunchContext(db(), { ...QUIZ_ARGS, contextTitle: null });
    // Neither the context membership doc nor anything else should be rewritten.
    expect(
      writeAt(`${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/`)
    ).toBeUndefined();
    expect(writes).toHaveLength(0);
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
      classIds: ['schoology:ctx-9'],
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

describe('linked-section period dedupe', () => {
  // An in-app session targeting ClassLink class CL-1 (roster r-1), attached in
  // Schoology; section ctx-1 is linked to that same class.
  const pairedSession = (extra: Record<string, unknown> = {}) => {
    quizSessions = [
      {
        id: 'sess-1',
        data: {
          code: 'ABC123',
          status: 'active',
          startedAt: 100,
          teacherUid: 'teacher-1',
          classIds: ['CL-1'],
          rosterIds: ['r-1'],
          periodNames: ['Period 1'],
          ...extra,
        },
      },
    ];
  };
  const linkCtx1 = () =>
    courseLinkDocs.set('ctx-1', { classlinkClassId: 'CL-1', rosterId: 'r-1' });

  it('does not append the section title when the section is linked to a class on the session', async () => {
    pairedSession();
    linkCtx1();
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextTitle: 'Math: Sec 1',
    });
    const sess = writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`);
    expect(sess?.data.periodNames).toBeUndefined();
    // The SSO period map still learns the section so a bridged join resolves.
    expect(sess?.data.classPeriodByClassId).toEqual({
      'schoology:ctx-1': 'Math: Sec 1',
    });
    // The archive learns the section too, so the hub can resolve it to the class.
    expect(writeAt('users/teacher-1/quiz_assignments/sess-1')?.data).toEqual({
      classIds: ['CL-1', 'schoology:ctx-1'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math: Sec 1' },
    });
  });

  it('files a linked section under the paired class period when the class has one', async () => {
    pairedSession({ classPeriodByClassId: { 'CL-1': 'Period 1' } });
    linkCtx1();
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextTitle: 'Math: Sec 1',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.classPeriodByClassId
    ).toEqual({ 'CL-1': 'Period 1', 'schoology:ctx-1': 'Period 1' });
  });

  it('removes an already-present section title (self-heal) and mirrors the archive', async () => {
    pairedSession({ periodNames: ['Period 1', 'Math: Sec 1'] });
    linkCtx1();
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextTitle: 'Math: Sec 1',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.periodNames
    ).toEqual(['Period 1']);
    expect(writeAt('users/teacher-1/quiz_assignments/sess-1')?.data).toEqual({
      periodNames: ['Period 1'],
      classIds: ['CL-1', 'schoology:ctx-1'],
      classPeriodByClassId: { 'schoology:ctx-1': 'Math: Sec 1' },
    });
  });

  it('keeps the section title when a response already carries it as classPeriod', async () => {
    pairedSession({ periodNames: ['Period 1', 'Math: Sec 1'] });
    linkCtx1();
    responsePeriods.set('sess-1', ['Math: Sec 1']);
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextTitle: 'Math: Sec 1',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.periodNames
    ).toBeUndefined();
  });

  it('still appends the title for a linked section whose class is NOT on the session', async () => {
    pairedSession();
    courseLinkDocs.set('ctx-1', {
      classlinkClassId: 'CL-other',
      rosterId: 'r-other',
    });
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextTitle: 'Math: Sec 1',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.periodNames
    ).toEqual(['Period 1', 'Math: Sec 1']);
  });

  it('pairs by rosterId when the session only carries rosterIds', async () => {
    pairedSession({ classIds: [] });
    courseLinkDocs.set('ctx-1', {
      classlinkClassId: 'CL-other',
      rosterId: 'r-1',
    });
    await persistLtiLaunchContext(db(), {
      ...QUIZ_ARGS,
      contextTitle: 'Math: Sec 1',
    });
    expect(
      writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data.periodNames
    ).toBeUndefined();
  });

  describe('dropLinkedSectionPeriod (link time)', () => {
    it('drops the title from the session and the quiz archive doc', async () => {
      pairedSession({ periodNames: ['Period 1', 'Math: Sec 1'] });
      const changed = await dropLinkedSectionPeriod(db(), {
        kind: 'quiz',
        sessionId: 'sess-1',
        contextId: 'ctx-1',
        contextTitle: 'Math: Sec 1',
        classlinkClassId: 'CL-1',
        rosterId: 'r-1',
      });
      expect(changed).toBe(true);
      expect(writeAt(`${QUIZ_SESSIONS_COLLECTION}/sess-1`)?.data).toEqual({
        periodNames: ['Period 1'],
      });
      expect(writeAt('users/teacher-1/quiz_assignments/sess-1')?.data).toEqual({
        periodNames: ['Period 1'],
      });
    });

    it('is a no-op when the paired class is not on the session or the title is absent', async () => {
      pairedSession({ periodNames: ['Period 1', 'Math: Sec 1'] });
      expect(
        await dropLinkedSectionPeriod(db(), {
          kind: 'quiz',
          sessionId: 'sess-1',
          contextId: 'ctx-1',
          contextTitle: 'Math: Sec 1',
          classlinkClassId: 'CL-other',
          rosterId: 'r-other',
        })
      ).toBe(false);
      expect(
        await dropLinkedSectionPeriod(db(), {
          kind: 'quiz',
          sessionId: 'sess-1',
          contextId: 'ctx-1',
          contextTitle: 'Not here',
          classlinkClassId: 'CL-1',
          rosterId: 'r-1',
        })
      ).toBe(false);
      expect(writes).toHaveLength(0);
    });

    it('moves students who launched before the link into the paired class period', async () => {
      pairedSession({
        periodNames: ['Period 1', 'Math: Sec 1'],
        classPeriodByClassId: {
          'CL-1': 'Period 1',
          'schoology:ctx-1': 'Math: Sec 1',
        },
      });
      responseRows.set('sess-1', [
        { id: 'a', classId: 'schoology:ctx-1', classPeriod: 'Math: Sec 1' },
        { id: 'b', classId: 'schoology:ctx-1', classPeriod: 'Math: Sec 1' },
        { id: 'c', classId: 'CL-1', classPeriod: 'Period 1' },
      ]);
      const changed = await dropLinkedSectionPeriod(db(), {
        kind: 'quiz',
        sessionId: 'sess-1',
        contextId: 'ctx-1',
        contextTitle: 'Math: Sec 1',
        classlinkClassId: 'CL-1',
        rosterId: 'r-1',
      });
      expect(changed).toBe(true);
      expect(updates.map((u) => u.path).sort()).toEqual([
        `${QUIZ_SESSIONS_COLLECTION}/sess-1/responses/a`,
        `${QUIZ_SESSIONS_COLLECTION}/sess-1/responses/b`,
      ]);
      expect(updates.every((u) => u.data.classPeriod === 'Period 1')).toBe(
        true
      );
      const sessWrites = writes.filter(
        (w) => w.path === `${QUIZ_SESSIONS_COLLECTION}/sess-1`
      );
      expect(sessWrites.map((w) => w.data)).toEqual([
        {
          classPeriodByClassId: {
            'CL-1': 'Period 1',
            'schoology:ctx-1': 'Period 1',
          },
        },
        { periodNames: ['Period 1'] },
      ]);
    });

    it('keeps the section title while a PIN student still uses it', async () => {
      pairedSession({
        periodNames: ['Period 1', 'Math: Sec 1'],
        classPeriodByClassId: {
          'CL-1': 'Period 1',
          'schoology:ctx-1': 'Math: Sec 1',
        },
      });
      responseRows.set('sess-1', [
        { id: 'a', classId: 'schoology:ctx-1', classPeriod: 'Math: Sec 1' },
        { id: 'pin', classPeriod: 'Math: Sec 1' },
      ]);
      await dropLinkedSectionPeriod(db(), {
        kind: 'quiz',
        sessionId: 'sess-1',
        contextId: 'ctx-1',
        contextTitle: 'Math: Sec 1',
        classlinkClassId: 'CL-1',
        rosterId: 'r-1',
      });
      expect(updates.map((u) => u.path)).toEqual([
        `${QUIZ_SESSIONS_COLLECTION}/sess-1/responses/a`,
      ]);
      expect(writes.some((w) => w.data.periodNames !== undefined)).toBe(false);
    });
  });
});
