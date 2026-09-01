/**
 * Tests for the Schoology → ClassLink launch-time identity bridge.
 *
 * The bridge is what makes M17 per-student targeting/overrides reach a
 * Schoology-launched student: without it their uid is namespaced off the LTI
 * `sub` and never matches the ClassLink-keyed pointer doc. The invariants worth
 * pinning are (a) a match mints the SAME uid as ClassLink SSO, (b) a miss NEVER
 * throws — the student must still be able to take the assignment, and (c) the
 * sticky doc keeps a student's identity stable across a OneRoster blip.
 */

/* eslint-disable @typescript-eslint/require-await -- the Firestore doubles
   mirror the async Admin-SDK surface without awaiting anything. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { computeStudentUid } from '../classlinkShared';
import { classroomAddonNet } from '../classroomAddonAuth';
import { resolveClasslinkIdentity } from './classlinkBridge';

const HMAC = 'test-hmac-secret';
const CREDS = {
  tenantUrl: 'https://tenant.example',
  clientId: 'cl-id',
  clientSecret: 'cl-secret',
};

// ── Minimal Firestore doc-store standing in for the Admin SDK ───────────────
const store = new Map<string, Record<string, unknown>>();

const db = {
  doc: (path: string) => ({
    get: async () => {
      const data = store.get(path);
      return { exists: !!data, data: () => data };
    },
    set: async (data: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
  }),
} as unknown as Parameters<typeof resolveClasslinkIdentity>[0];

const ROSTER = [
  {
    sourcedId: 'sid-alice',
    email: 'Alice@school.edu',
    givenName: 'Alice',
    familyName: 'A',
  },
  {
    sourcedId: 'sid-bob',
    email: 'bob@school.edu',
    givenName: 'Bob',
    familyName: 'B',
  },
];

function linkSection(contextId = 'ctx-1', classlinkClassId = 'class-7') {
  store.set(`lti_course_links/${contextId}`, {
    classlinkClassId,
    teacherUid: 'teacher-1',
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    contextId: 'ctx-1' as string | null,
    email: 'alice@school.edu' as string | null,
    subUid: 'sub-uid-alice',
    hmacSecret: HMAC,
    classlink: CREDS,
    ...overrides,
  };
}

// Wrapped so the spy's element type is inferred (a bare `ReturnType<typeof
// vi.spyOn>` widens to `any` and trips no-unsafe-call on `.mockRejectedValue`).
const spyOnFetchStudents = () =>
  vi.spyOn(classroomAddonNet, 'fetchClassStudents');
let fetchSpy: ReturnType<typeof spyOnFetchStudents>;

beforeEach(() => {
  store.clear();
  vi.restoreAllMocks();
  fetchSpy = spyOnFetchStudents().mockResolvedValue(ROSTER);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('resolveClasslinkIdentity — live match', () => {
  it('mints the SAME uid ClassLink SSO would, and reports the class id', async () => {
    linkSection();
    const result = await resolveClasslinkIdentity(db, input());
    expect(result).toEqual({
      uid: computeStudentUid('sid-alice', HMAC),
      classlinkClassId: 'class-7',
      live: true,
    });
  });

  it('matches the roster email case-insensitively', async () => {
    linkSection();
    const result = await resolveClasslinkIdentity(
      db,
      input({ email: 'BOB@SCHOOL.EDU' })
    );
    expect(result?.uid).toBe(computeStudentUid('sid-bob', HMAC));
  });

  it('records the sticky mapping keyed by the sub-derived uid', async () => {
    linkSection();
    await resolveClasslinkIdentity(db, input());
    expect(store.get('lti_identity_bridge/sub-uid-alice')).toMatchObject({
      classlinkUid: computeStudentUid('sid-alice', HMAC),
      classlinkClassId: 'class-7',
    });
  });
});

describe('resolveClasslinkIdentity — no bridge applies', () => {
  it('returns null for an unlinked section without fetching OneRoster', async () => {
    const result = await resolveClasslinkIdentity(db, input());
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the platform released no email', async () => {
    linkSection();
    const result = await resolveClasslinkIdentity(db, input({ email: null }));
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when ClassLink is not configured', async () => {
    linkSection();
    const result = await resolveClasslinkIdentity(
      db,
      input({ classlink: { ...CREDS, tenantUrl: '' } })
    );
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the student is not in the OneRoster roster', async () => {
    linkSection();
    const result = await resolveClasslinkIdentity(
      db,
      input({ email: 'carol@school.edu' })
    );
    expect(result).toBeNull();
  });

  it('refuses a slash-bearing contextId rather than escaping the collection', async () => {
    store.set('lti_course_links/ctx-1/evil/doc', {
      classlinkClassId: 'class-9',
    });
    const result = await resolveClasslinkIdentity(
      db,
      input({ contextId: 'ctx-1/evil/doc' })
    );
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes no sticky doc when nothing resolved', async () => {
    linkSection();
    await resolveClasslinkIdentity(db, input({ email: 'carol@school.edu' }));
    expect(store.has('lti_identity_bridge/sub-uid-alice')).toBe(false);
  });
});

describe('resolveClasslinkIdentity — stickiness', () => {
  it('restores the stored identity when OneRoster fails mid-assignment', async () => {
    linkSection();
    await resolveClasslinkIdentity(db, input());
    fetchSpy.mockRejectedValue(new Error('OneRoster 503'));

    const result = await resolveClasslinkIdentity(db, input());
    expect(result).toEqual({
      uid: computeStudentUid('sid-alice', HMAC),
      classlinkClassId: 'class-7',
      live: false,
    });
  });

  it('restores the stored identity when the section link disappears', async () => {
    linkSection();
    await resolveClasslinkIdentity(db, input());
    store.delete('lti_course_links/ctx-1');

    const result = await resolveClasslinkIdentity(db, input());
    expect(result?.uid).toBe(computeStudentUid('sid-alice', HMAC));
    expect(result?.live).toBe(false);
  });

  it('restores the stored identity on a privacy-stripped relaunch (no contextId)', async () => {
    linkSection();
    await resolveClasslinkIdentity(db, input());

    const result = await resolveClasslinkIdentity(
      db,
      input({ contextId: null, email: null })
    );
    expect(result?.uid).toBe(computeStudentUid('sid-alice', HMAC));
  });

  it('prefers a fresh live match over the stored one after a roster change', async () => {
    linkSection();
    await resolveClasslinkIdentity(db, input());
    fetchSpy.mockResolvedValue([
      { ...ROSTER[0], sourcedId: 'sid-alice-renamed' },
    ]);

    const result = await resolveClasslinkIdentity(db, input());
    expect(result?.uid).toBe(computeStudentUid('sid-alice-renamed', HMAC));
    expect(result?.live).toBe(true);
    expect(store.get('lti_identity_bridge/sub-uid-alice')?.classlinkUid).toBe(
      computeStudentUid('sid-alice-renamed', HMAC)
    );
  });

  it('ignores a malformed sticky doc rather than minting a bad uid', async () => {
    store.set('lti_identity_bridge/sub-uid-alice', { classlinkUid: 42 });
    const result = await resolveClasslinkIdentity(db, input());
    expect(result).toBeNull();
  });
});

describe('resolveClasslinkIdentity — never blocks the student', () => {
  it('returns null instead of throwing when every Firestore read fails', async () => {
    const brokenDb = {
      doc: () => ({
        get: async () => {
          throw new Error('firestore down');
        },
        set: async () => {},
      }),
    } as unknown as Parameters<typeof resolveClasslinkIdentity>[0];

    await expect(
      resolveClasslinkIdentity(brokenDb, input())
    ).resolves.toBeNull();
  });

  it('still returns the live identity when the sticky write fails', async () => {
    linkSection();
    const failingDb = {
      doc: (path: string) => ({
        get: async () => {
          const data = store.get(path);
          return { exists: !!data, data: () => data };
        },
        set: async () => {
          throw new Error('write denied');
        },
      }),
    } as unknown as Parameters<typeof resolveClasslinkIdentity>[0];

    const result = await resolveClasslinkIdentity(failingDb, input());
    expect(result?.uid).toBe(computeStudentUid('sid-alice', HMAC));
  });
});
