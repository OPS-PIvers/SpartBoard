import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getUser,
  loadTaughtClassEnrollment,
  loadTestClassMembership,
  loadTargetDirectory,
  secret,
} = vi.hoisted(() => ({
  loadTargetDirectory: vi.fn(),
  getUser: vi.fn(),
  loadTaughtClassEnrollment: vi.fn(),
  loadTestClassMembership: vi.fn(),
  secret: { hmac: 'hmac' },
}));
vi.mock('../firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: () => ({ getUser }),
}));
vi.mock('../secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => 'id' },
  CLASSLINK_CLIENT_SECRET: { value: () => 'secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant.example' },
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => secret.hmac },
}));
vi.mock('../studentIdentity', () => ({ loadTaughtClassEnrollment }));
vi.mock('../studentAssignmentTargets', () => ({
  loadTestClassMembership,
  loadTargetDirectory,
}));

import { computeStudentUid } from '../classlinkShared';
import { loadClassStudentUids } from './projectMemberAuthority';
import {
  __resetProjectRosterCache,
  defaultProjectMemberAuthority,
} from './gradeIndex';

const db = {} as never;
const teacher = { email: 't@school.edu', emailVerified: true };

beforeEach(() => {
  loadTargetDirectory.mockReset().mockResolvedValue({
    ctx: {
      classIdBySourcedId: new Map(),
      classIdByTestEmail: new Map(),
      testClassAuthorized: false,
    },
  });
  __resetProjectRosterCache();
  secret.hmac = 'hmac';
  getUser.mockReset().mockResolvedValue(teacher);
  loadTaughtClassEnrollment.mockReset().mockResolvedValue(null);
  loadTestClassMembership
    .mockReset()
    .mockResolvedValue({ membership: new Map(), authorized: false });
});

describe('loadClassStudentUids', () => {
  it('returns the pseudonym uids of a ClassLink class the owner teaches', async () => {
    loadTaughtClassEnrollment.mockResolvedValue(new Set(['s1', 's2']));
    const uids = await loadClassStudentUids(db, 'owner', 'class-1');
    expect(loadTaughtClassEnrollment).toHaveBeenCalledWith(
      't@school.edu',
      'class-1',
      expect.objectContaining({ tenantUrl: 'https://tenant.example' })
    );
    expect(uids).toEqual(
      new Set([
        computeStudentUid('s1', 'hmac'),
        computeStudentUid('s2', 'hmac'),
      ])
    );
  });

  it('returns nothing for a class ClassLink does not show the owner teaching', async () => {
    expect((await loadClassStudentUids(db, 'attacker', 'class-1')).size).toBe(
      0
    );
  });

  it('reads a test class the owner administers', async () => {
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([
        ['kid@school.edu', 'slug'],
        ['other@school.edu', 'another-slug'],
      ]),
      authorized: true,
    });
    const uids = await loadClassStudentUids(db, 'owner', 'slug');
    expect(uids).toEqual(
      new Set([computeStudentUid('test:kid@school.edu', 'hmac')])
    );
  });

  it('returns nothing for a test class the owner may not administer', async () => {
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([['kid@school.edu', 'slug']]),
      authorized: false,
    });
    expect((await loadClassStudentUids(db, 'owner', 'slug')).size).toBe(0);
  });

  it('returns nothing without a verified owner email, a class id, or for a local roster', async () => {
    getUser.mockResolvedValue({ email: 't@school.edu', emailVerified: false });
    expect((await loadClassStudentUids(db, 'owner', 'class-1')).size).toBe(0);
    getUser.mockRejectedValue({ code: 'auth/user-not-found' });
    expect((await loadClassStudentUids(db, 'gone', 'class-1')).size).toBe(0);
    expect(loadTaughtClassEnrollment).not.toHaveBeenCalled();
  });

  it('for a missing or local class id, vouches for students in any class the owner teaches', async () => {
    loadTargetDirectory.mockResolvedValue({
      ctx: {
        classIdBySourcedId: new Map([['s1', 'class-1']]),
        classIdByTestEmail: new Map([['kid@school.edu', 'slug']]),
        testClassAuthorized: true,
      },
    });
    const expected = new Set([
      computeStudentUid('s1', 'hmac'),
      computeStudentUid('test:kid@school.edu', 'hmac'),
    ]);
    expect(await loadClassStudentUids(db, 'owner', '')).toEqual(expected);
    expect(await loadClassStudentUids(db, 'owner', 'local:r1')).toEqual(
      expected
    );
    expect(loadTargetDirectory).toHaveBeenCalledWith(
      db,
      'owner',
      't@school.edu',
      expect.objectContaining({ tenantUrl: 'https://tenant.example' }),
      expect.any(Function)
    );
  });

  it('leaves out test-class students when the owner is not a test class authority', async () => {
    loadTargetDirectory.mockResolvedValue({
      ctx: {
        classIdBySourcedId: new Map(),
        classIdByTestEmail: new Map([['kid@school.edu', 'slug']]),
        testClassAuthorized: false,
      },
    });
    expect((await loadClassStudentUids(db, 'owner', '')).size).toBe(0);
  });

  it('throws, rather than returning no students, when the HMAC secret is missing', async () => {
    secret.hmac = '';
    await expect(
      loadClassStudentUids(db, 'owner', 'class-1')
    ).rejects.toMatchObject({ code: 'internal' });
  });

  it('throws when ClassLink is unavailable rather than reading it as no students', async () => {
    loadTaughtClassEnrollment.mockRejectedValue(new Error('unavailable'));
    await expect(loadClassStudentUids(db, 'owner', 'class-1')).rejects.toThrow(
      'unavailable'
    );
  });
});

describe('defaultProjectMemberAuthority', () => {
  it('asks once per class and keeps only the members the class holds', async () => {
    loadTaughtClassEnrollment.mockResolvedValue(new Set(['s1']));
    const authority = defaultProjectMemberAuthority(db);
    const s1 = computeStudentUid('s1', 'hmac');
    const first = await authority('owner', 'class-1', [s1, 'stranger']);
    const second = await authority('owner', 'class-1', [s1]);
    expect(first).toEqual(new Set([s1]));
    expect(second).toEqual(new Set([s1]));
    expect(loadTaughtClassEnrollment).toHaveBeenCalledTimes(1);
  });

  it('asks again after a failed lookup', async () => {
    loadTaughtClassEnrollment.mockRejectedValueOnce(new Error('unavailable'));
    const authority = defaultProjectMemberAuthority(db);
    await expect(authority('owner', 'class-1', ['x'])).rejects.toThrow();
    loadTaughtClassEnrollment.mockResolvedValue(new Set(['s1']));
    const s1 = computeStudentUid('s1', 'hmac');
    expect(await authority('owner', 'class-1', [s1])).toEqual(new Set([s1]));
  });

  it('shares one any-class lookup between groups with no class id and local roster ids', async () => {
    loadTargetDirectory.mockResolvedValue({
      ctx: {
        classIdBySourcedId: new Map([['s1', 'class-1']]),
        classIdByTestEmail: new Map(),
        testClassAuthorized: false,
      },
    });
    const authority = defaultProjectMemberAuthority(db);
    const s1 = computeStudentUid('s1', 'hmac');
    expect(await authority('owner', '', [s1])).toEqual(new Set([s1]));
    expect(await authority('owner', 'local:r1', [s1])).toEqual(new Set([s1]));
    expect(loadTargetDirectory).toHaveBeenCalledTimes(1);
  });

  it('does not cache an empty roster, so a new class or student is not denied for 90 seconds', async () => {
    const authority = defaultProjectMemberAuthority(db);
    const s1 = computeStudentUid('s1', 'hmac');
    expect((await authority('owner', 'class-1', [s1])).size).toBe(0);
    loadTaughtClassEnrollment.mockResolvedValue(new Set(['s1']));
    expect(await authority('owner', 'class-1', [s1])).toEqual(new Set([s1]));
    expect(loadTaughtClassEnrollment).toHaveBeenCalledTimes(2);
  });

  it('shares one lookup across authorities for 90 seconds, then asks again', async () => {
    vi.useFakeTimers();
    try {
      loadTaughtClassEnrollment.mockResolvedValue(new Set(['s1']));
      const s1 = computeStudentUid('s1', 'hmac');
      await defaultProjectMemberAuthority(db)('owner', 'class-1', [s1]);
      await defaultProjectMemberAuthority(db)('owner', 'class-1', [s1]);
      expect(loadTaughtClassEnrollment).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(91_000);
      await defaultProjectMemberAuthority(db)('owner', 'class-1', [s1]);
      expect(loadTaughtClassEnrollment).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
