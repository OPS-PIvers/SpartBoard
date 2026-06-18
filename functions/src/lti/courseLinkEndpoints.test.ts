/**
 * Tests for the Schoology class↔course linking callables (Item D part 2):
 *
 *   linkLtiCourseV1            — trust anchor (session ownership + context seen),
 *                                owned-class check, transactional no-hijack write.
 *   ltiSuggestClassLinkMatchV1 — transient NRPS∩OneRoster email overlap → the
 *                                best-match class id (emails never returned).
 *
 * firebase-admin (sessions, the per-context membership doc, the link doc +
 * runTransaction), NRPS, OneRoster, AGS token, and the platform config are all
 * mocked so the gating + matching logic is exercised without a live backend.
 */

/* eslint-disable @typescript-eslint/require-await -- mock async handlers mirror
   the async Admin-SDK / network surface without awaiting anything. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return { onCall: (_o: unknown, handler: unknown) => handler, HttpsError };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () =>
      name === 'CLASSLINK_TENANT_URL'
        ? 'https://tenant.example'
        : `secret:${name}`,
  }),
}));

// ── Configurable Firestore state ────────────────────────────────────────────
let sessionDoc: { exists: boolean; data: () => unknown };
let contextDoc: { exists: boolean; data: () => unknown };
// The caller's own ClassLink rosters' classlinkClassIds (suggest ownership gate).
let ownedRosters: string[] = [];
const courseLinks = new Map<string, Record<string, unknown>>();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name === 'quiz_sessions' || name === 'video_activity_sessions') {
        return { doc: () => ({ get: async () => sessionDoc }) };
      }
      if (name === 'lti_session_memberships') {
        return {
          doc: () => ({
            collection: () => ({
              doc: () => ({ get: async () => contextDoc }),
            }),
          }),
        };
      }
      if (name === 'lti_course_links') {
        return { doc: (ctx: string) => ({ _ctx: ctx }) };
      }
      if (name === 'users') {
        return {
          doc: () => ({
            collection: () => ({
              get: async () => ({
                docs: ownedRosters.map((cid) => ({
                  data: () => ({ classlinkClassId: cid }),
                })),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    runTransaction: async (
      fn: (tx: {
        get: (ref: { _ctx: string }) => Promise<{
          exists: boolean;
          data: () => unknown;
        }>;
        set: (
          ref: { _ctx: string },
          data: Record<string, unknown>,
          opts?: unknown
        ) => void;
        delete: (ref: { _ctx: string }) => void;
      }) => Promise<unknown>
    ) =>
      fn({
        get: async (ref) => ({
          exists: courseLinks.has(ref._ctx),
          data: () => courseLinks.get(ref._ctx),
        }),
        set: (ref, data) =>
          courseLinks.set(ref._ctx, {
            ...(courseLinks.get(ref._ctx) ?? {}),
            ...data,
          }),
        delete: (ref) => courseLinks.delete(ref._ctx),
      }),
  })),
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi
    .fn()
    .mockResolvedValue({ clientId: 'client-1', tokenUrl: 'https://lms/token' }),
}));

vi.mock('./ags', () => ({
  getAgsAccessToken: vi.fn().mockResolvedValue('nrps-token'),
}));

const { fetchNrpsMembersMock } = vi.hoisted(() => ({
  fetchNrpsMembersMock: vi.fn(),
}));
vi.mock('./nrps', () => ({ fetchNrpsMembers: fetchNrpsMembersMock }));

const { fetchClassStudentsMock } = vi.hoisted(() => ({
  fetchClassStudentsMock: vi.fn(),
}));
vi.mock('../classroomAddonAuth', () => ({
  classroomAddonNet: { fetchClassStudents: fetchClassStudentsMock },
}));

import {
  linkLtiCourseV1,
  ltiSuggestClassLinkMatchV1,
} from './courseLinkEndpoints';

type Req = {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
};
const callLink = linkLtiCourseV1 as unknown as (r: Req) => Promise<unknown>;
const callSuggest = ltiSuggestClassLinkMatchV1 as unknown as (
  r: Req
) => Promise<{
  suggestion: { classlinkClassId: string; overlap: number } | null;
  reason?: string;
  ambiguous?: boolean;
}>;

const TEACHER = { uid: 'teacher-1', token: { email: 't@s.edu' } };
const seenSession = () => {
  sessionDoc = { exists: true, data: () => ({ teacherUid: 'teacher-1' }) };
  contextDoc = {
    exists: true,
    data: () => ({
      contextTitle: 'Algebra 1 · P1',
      contextMembershipsUrl: 'https://lms/ctx/members',
    }),
  };
};
/** Simulates a privacy-stripped relaunch where the LMS omits the context title. */
const seenSessionNullTitle = () => {
  sessionDoc = { exists: true, data: () => ({ teacherUid: 'teacher-1' }) };
  contextDoc = {
    exists: true,
    data: () => ({
      contextTitle: null,
      contextMembershipsUrl: 'https://lms/ctx/members',
    }),
  };
};

beforeEach(() => {
  sessionDoc = { exists: false, data: () => undefined };
  contextDoc = { exists: false, data: () => undefined };
  // Classes the caller owns (link verifies ownership; suggest intersects). Covers
  // both the link tests' ids (cl-1, cl-new) and the suggest candidates (cl-A/B).
  ownedRosters = ['cl-1', 'cl-new', 'cl-A', 'cl-B'];
  courseLinks.clear();
  fetchNrpsMembersMock.mockReset();
  fetchClassStudentsMock.mockReset();
});

describe('linkLtiCourseV1', () => {
  const base = {
    contextId: 'ctx-1',
    sessionId: 'S1',
    kind: 'quiz',
    classlinkClassId: 'cl-1',
    classlinkOrgId: 'org-1',
    rosterId: 'r-1',
  };

  it('rejects a student / unauthenticated caller', async () => {
    await expect(callLink({ data: base })).rejects.toThrow(/Sign in/);
    await expect(
      callLink({ auth: { uid: 'x', token: { studentRole: true } }, data: base })
    ).rejects.toThrow(/Teacher account/);
  });

  it('rejects when the caller does not own the session', async () => {
    sessionDoc = { exists: true, data: () => ({ teacherUid: 'someone-else' }) };
    await expect(callLink({ auth: TEACHER, data: base })).rejects.toThrow(
      /Not the teacher/
    );
  });

  it('rejects when the session never saw this context', async () => {
    sessionDoc = { exists: true, data: () => ({ teacherUid: 'teacher-1' }) };
    contextDoc = { exists: false, data: () => undefined };
    await expect(callLink({ auth: TEACHER, data: base })).rejects.toThrow(
      /has not been seen/
    );
  });

  it('rejects a classlinkClassId the caller does not own', async () => {
    seenSession();
    await expect(
      callLink({
        auth: TEACHER,
        data: { ...base, classlinkClassId: 'cl-someone-elses' },
      })
    ).rejects.toThrow(/your own ClassLink classes/);
  });

  it('writes the link doc (captured title + paired class) on success', async () => {
    seenSession();
    const res = (await callLink({ auth: TEACHER, data: base })) as {
      ok: boolean;
      contextId: string;
    };
    expect(res).toEqual({ ok: true, contextId: 'ctx-1' });
    const link = courseLinks.get('ctx-1')!;
    expect(link).toMatchObject({
      teacherUid: 'teacher-1',
      contextId: 'ctx-1',
      classlinkClassId: 'cl-1',
      classlinkOrgId: 'org-1',
      contextTitle: 'Algebra 1 · P1',
      rosterId: 'r-1',
    });
    expect(typeof link.createdAt).toBe('number');
  });

  it('refuses to hijack a link owned by another teacher', async () => {
    seenSession();
    courseLinks.set('ctx-1', { teacherUid: 'other', classlinkClassId: 'cl-x' });
    await expect(callLink({ auth: TEACHER, data: base })).rejects.toThrow(
      /already linked by another teacher/
    );
    // The prior link is untouched.
    expect(courseLinks.get('ctx-1')).toMatchObject({ teacherUid: 'other' });
  });

  it('lets the SAME teacher re-point their own link', async () => {
    seenSession();
    courseLinks.set('ctx-1', {
      teacherUid: 'teacher-1',
      classlinkClassId: 'cl-old',
      createdAt: 1,
    });
    await callLink({
      auth: TEACHER,
      data: { ...base, classlinkClassId: 'cl-new' },
    });
    expect(courseLinks.get('ctx-1')).toMatchObject({
      teacherUid: 'teacher-1',
      classlinkClassId: 'cl-new',
    });
  });

  it('preserves a stored contextTitle when a privacy-stripped relaunch yields null (#null-clobber)', async () => {
    // Regression: a Schoology deployment with privacy configuration may omit the
    // context title on relaunches. nrpsStore.ts stores null for the title in the
    // NEW session's membership doc (there's no prior doc for that session to
    // fall back on). linkLtiCourseV1 was writing `contextTitle: null` directly
    // to lti_course_links, silently clearing the section name captured from an
    // earlier launch — the same clobber pattern fixed in nrpsStore.ts and
    // launchEndpoints.ts. The fix: prefer the stored title over null, matching
    // the pattern `contextTitle ?? storedTitle`.
    seenSessionNullTitle(); // session membership doc has contextTitle: null
    courseLinks.set('ctx-1', {
      teacherUid: 'teacher-1',
      classlinkClassId: 'cl-old',
      contextTitle: 'Algebra 1 · P1', // previously captured valid title
      createdAt: 1,
    });
    await callLink({
      auth: TEACHER,
      data: { ...base, classlinkClassId: 'cl-new' },
    });
    // The stored title must survive the relink — it must NOT be overwritten with null.
    expect(courseLinks.get('ctx-1')).toMatchObject({
      teacherUid: 'teacher-1',
      classlinkClassId: 'cl-new',
      contextTitle: 'Algebra 1 · P1',
    });
  });
});

describe('ltiSuggestClassLinkMatchV1', () => {
  const base = {
    contextId: 'ctx-1',
    sessionId: 'S1',
    kind: 'quiz',
    candidates: [{ classlinkClassId: 'cl-A' }, { classlinkClassId: 'cl-B' }],
  };

  it('suggests the class with the highest roster-email overlap', async () => {
    seenSession();
    fetchNrpsMembersMock.mockResolvedValue([
      {
        userId: 's1',
        givenName: '',
        familyName: '',
        email: 'a@s.edu',
        roles: [],
        status: '',
      },
      {
        userId: 's2',
        givenName: '',
        familyName: '',
        email: 'b@s.edu',
        roles: [],
        status: '',
      },
      {
        userId: 's3',
        givenName: '',
        familyName: '',
        email: 'c@s.edu',
        roles: [],
        status: '',
      },
    ]);
    fetchClassStudentsMock.mockImplementation(
      async (_t, _i, _s, classId: string) =>
        classId === 'cl-A'
          ? [{ email: 'a@s.edu' }, { email: 'z@s.edu' }] // overlap 1
          : [{ email: 'a@s.edu' }, { email: 'b@s.edu' }, { email: 'c@s.edu' }] // overlap 3
    );

    const res = await callSuggest({ auth: TEACHER, data: base });
    expect(res.suggestion?.classlinkClassId).toBe('cl-B');
    expect(res.suggestion?.overlap).toBe(3);
  });

  it('returns null (no-emails-released) when the platform withholds NRPS email', async () => {
    seenSession();
    fetchNrpsMembersMock.mockResolvedValue([
      {
        userId: 's1',
        givenName: 'A',
        familyName: 'B',
        email: '',
        roles: [],
        status: '',
      },
    ]);
    const res = await callSuggest({ auth: TEACHER, data: base });
    expect(res.suggestion).toBeNull();
    expect(res.reason).toBe('no-emails-released');
    // Never even reaches OneRoster when there's nothing to match on.
    expect(fetchClassStudentsMock).not.toHaveBeenCalled();
  });

  it('returns null (no-overlap) when no candidate shares an email', async () => {
    seenSession();
    fetchNrpsMembersMock.mockResolvedValue([
      {
        userId: 's1',
        givenName: '',
        familyName: '',
        email: 'a@s.edu',
        roles: [],
        status: '',
      },
    ]);
    fetchClassStudentsMock.mockResolvedValue([{ email: 'nobody@s.edu' }]);
    const res = await callSuggest({ auth: TEACHER, data: base });
    expect(res.suggestion).toBeNull();
    expect(res.reason).toBe('no-overlap');
  });

  it('flags an ambiguous match when a runner-up is within one student', async () => {
    seenSession();
    fetchNrpsMembersMock.mockResolvedValue([
      {
        userId: 's1',
        givenName: '',
        familyName: '',
        email: 'a@s.edu',
        roles: [],
        status: '',
      },
      {
        userId: 's2',
        givenName: '',
        familyName: '',
        email: 'b@s.edu',
        roles: [],
        status: '',
      },
      {
        userId: 's3',
        givenName: '',
        familyName: '',
        email: 'c@s.edu',
        roles: [],
        status: '',
      },
    ]);
    fetchClassStudentsMock.mockImplementation(
      async (_t, _i, _s, classId: string) =>
        classId === 'cl-A'
          ? [{ email: 'a@s.edu' }, { email: 'b@s.edu' }, { email: 'c@s.edu' }] // 3
          : [{ email: 'a@s.edu' }, { email: 'b@s.edu' }] // 2 — within one
    );
    const res = await callSuggest({ auth: TEACHER, data: base });
    expect(res.suggestion?.classlinkClassId).toBe('cl-A');
    expect(res.ambiguous).toBe(true);
  });

  it('enforces the trust anchor before any network call', async () => {
    sessionDoc = { exists: true, data: () => ({ teacherUid: 'someone-else' }) };
    await expect(callSuggest({ auth: TEACHER, data: base })).rejects.toThrow(
      /Not the teacher/
    );
    expect(fetchNrpsMembersMock).not.toHaveBeenCalled();
  });

  it('ignores candidates the caller does NOT own (no OneRoster fetch fishing)', async () => {
    seenSession();
    // The teacher owns neither cl-A nor cl-B — they passed foreign class ids.
    ownedRosters = ['cl-mine'];
    const res = await callSuggest({ auth: TEACHER, data: base });
    expect(res.suggestion).toBeNull();
    expect(res.reason).toBe('no-owned-candidates');
    // Crucially, no roster fetch (or even NRPS) runs for the foreign classes.
    expect(fetchClassStudentsMock).not.toHaveBeenCalled();
    expect(fetchNrpsMembersMock).not.toHaveBeenCalled();
  });

  it('degrades to null (not a thrown error) when the NRPS token mint fails', async () => {
    seenSession();
    const { getAgsAccessToken } = await import('./ags');
    vi.mocked(getAgsAccessToken).mockRejectedValueOnce(new Error('token down'));
    const res = await callSuggest({ auth: TEACHER, data: base });
    expect(res.suggestion).toBeNull();
    expect(res.reason).toBe('nrps-token-failed');
  });
});

describe('input validation', () => {
  it('rejects a sessionId that could escape its Firestore collection path', async () => {
    await expect(
      callLink({
        auth: TEACHER,
        data: {
          contextId: 'ctx-1',
          sessionId: 'quiz_sessions/other/evil',
          kind: 'quiz',
          classlinkClassId: 'cl-1',
        },
      })
    ).rejects.toThrow(/required/);
  });

  it('rejects an unrecognized kind instead of silently coercing to quiz', async () => {
    await expect(
      callLink({
        auth: TEACHER,
        data: {
          contextId: 'ctx-1',
          sessionId: 'S1',
          kind: 'bogus',
          classlinkClassId: 'cl-1',
        },
      })
    ).rejects.toThrow(/quiz.*va/);
  });
});
