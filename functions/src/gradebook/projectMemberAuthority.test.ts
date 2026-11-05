import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getUser,
  loadClassLinkMembership,
  loadOwnedRosterClasses,
  loadTestClassMembership,
  secret,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  loadClassLinkMembership: vi.fn(),
  loadOwnedRosterClasses: vi.fn(),
  loadTestClassMembership: vi.fn(),
  secret: { hmac: 'hmac', clientId: 'id' },
}));
vi.mock('../firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: () => ({ getUser }),
}));
vi.mock('../secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => secret.clientId },
  CLASSLINK_CLIENT_SECRET: { value: () => 'secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant.example' },
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => secret.hmac },
}));
vi.mock('../studentAssignmentTargets', () => ({
  loadClassLinkMembership,
  loadOwnedRosterClasses,
  loadTestClassMembership,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { computeStudentUid } from '../classlinkShared';
import { loadClassStudentUids } from './projectMemberAuthority';
import { RosterUnavailableError } from './rosterUnavailable';
import {
  __resetProjectRosterCache,
  defaultProjectMemberAuthority,
  drainDirtySessions,
} from './gradeIndex';
import { makeStubFirestore } from '../testing/stubFirestore';

const db = {} as never;
const teacher = { email: 't@school.edu', emailVerified: true };
const uidOf = (sourcedId: string) => computeStudentUid(sourcedId, 'hmac');
const testUidOf = (email: string) => computeStudentUid(`test:${email}`, 'hmac');
const noTestClasses = { membership: new Map(), authorized: false };

beforeEach(() => {
  __resetProjectRosterCache();
  secret.hmac = 'hmac';
  secret.clientId = 'id';
  getUser.mockReset().mockResolvedValue(teacher);
  loadClassLinkMembership.mockReset().mockResolvedValue(new Map());
  loadOwnedRosterClasses
    .mockReset()
    .mockResolvedValue({ classlinkClassIds: [], testClassIds: [] });
  loadTestClassMembership.mockReset().mockResolvedValue(noTestClasses);
});

describe('loadClassStudentUids', () => {
  it('returns the pseudonym uids of the classes the owner teaches in ClassLink', async () => {
    loadClassLinkMembership.mockResolvedValue(
      new Map([
        ['s1', 'class-1'],
        ['s2', 'class-1'],
      ])
    );
    const { uids, degraded } = await loadClassStudentUids(
      db,
      'owner',
      'class-1'
    );
    expect(loadClassLinkMembership).toHaveBeenCalledWith(
      't@school.edu',
      null,
      'id',
      'secret',
      'https://tenant.example'
    );
    expect(uids).toEqual(new Set([uidOf('s1'), uidOf('s2')]));
    expect(degraded).toBeNull();
  });

  it('returns nothing for an owner ClassLink does not show teaching', async () => {
    expect(
      (await loadClassStudentUids(db, 'attacker', 'class-1')).uids.size
    ).toBe(0);
  });

  it('vouches for a member of ANY class the owner teaches, not only the group class', async () => {
    loadClassLinkMembership.mockResolvedValue(
      new Map([
        ['from-section-a', 'class-a'],
        ['from-section-b', 'class-b'],
      ])
    );
    const { uids } = await loadClassStudentUids(db, 'owner', 'class-a');
    expect(uids).toEqual(
      new Set([uidOf('from-section-a'), uidOf('from-section-b')])
    );
    for (const hint of ['', 'local:r1'])
      expect((await loadClassStudentUids(db, 'owner', hint)).uids.size).toBe(2);
  });

  it('reads the test classes on the owner rosters and the group class id', async () => {
    loadOwnedRosterClasses.mockResolvedValue({
      classlinkClassIds: [],
      testClassIds: ['slug-a'],
    });
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([['kid@school.edu', 'slug-a']]),
      authorized: true,
    });
    const { uids } = await loadClassStudentUids(db, 'owner', 'slug-b');
    expect(loadTestClassMembership).toHaveBeenCalledWith(db, 't@school.edu', [
      'slug-a',
      'slug-b',
    ]);
    expect(uids).toEqual(new Set([testUidOf('kid@school.edu')]));
  });

  it('returns nothing for test classes the owner may not administer', async () => {
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([['kid@school.edu', 'slug']]),
      authorized: false,
    });
    expect((await loadClassStudentUids(db, 'owner', 'slug')).uids.size).toBe(0);
  });

  it('falls back to test classes when ClassLink throws, and flags the result as degraded', async () => {
    loadClassLinkMembership.mockRejectedValue(new Error('503'));
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([['kid@school.edu', 'slug']]),
      authorized: true,
    });
    const { uids, degraded } = await loadClassStudentUids(db, 'owner', 'slug');
    expect(uids).toEqual(new Set([testUidOf('kid@school.edu')]));
    expect(degraded).toBeInstanceOf(RosterUnavailableError);
  });

  it('throws a roster-unavailable error when ClassLink throws and no test class matches', async () => {
    loadClassLinkMembership.mockRejectedValue(new Error('503'));
    await expect(
      loadClassStudentUids(db, 'owner', 'class-1')
    ).rejects.toBeInstanceOf(RosterUnavailableError);
  });

  it('works on a project without ClassLink credentials (test classes only)', async () => {
    secret.clientId = '';
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([['kid@school.edu', 'slug']]),
      authorized: true,
    });
    const { uids, degraded } = await loadClassStudentUids(db, 'owner', 'slug');
    expect(loadClassLinkMembership).not.toHaveBeenCalled();
    expect(uids.size).toBe(1);
    expect(degraded).toBeNull();
  });

  it('returns nothing without a verified owner email, and treats an Auth outage as unavailable', async () => {
    getUser.mockResolvedValue({ email: 't@school.edu', emailVerified: false });
    expect((await loadClassStudentUids(db, 'owner', 'class-1')).uids.size).toBe(
      0
    );
    getUser.mockRejectedValue({ code: 'auth/user-not-found' });
    expect((await loadClassStudentUids(db, 'gone', 'class-1')).uids.size).toBe(
      0
    );
    getUser.mockRejectedValue(new Error('auth down'));
    await expect(
      loadClassStudentUids(db, 'owner', 'class-1')
    ).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(loadClassLinkMembership).not.toHaveBeenCalled();
  });

  it('throws, rather than returning no students, when the HMAC secret is missing', async () => {
    secret.hmac = '';
    await expect(
      loadClassStudentUids(db, 'owner', 'class-1')
    ).rejects.toMatchObject({ code: 'internal' });
  });
});

describe('defaultProjectMemberAuthority', () => {
  it('asks once per class and keeps only the members the owner teaches', async () => {
    loadClassLinkMembership.mockResolvedValue(new Map([['s1', 'class-1']]));
    const authority = defaultProjectMemberAuthority(db);
    const first = await authority('owner', 'class-1', [
      uidOf('s1'),
      'stranger',
    ]);
    const second = await authority('owner', 'class-1', [uidOf('s1')]);
    expect(first).toEqual(new Set([uidOf('s1')]));
    expect(second).toEqual(new Set([uidOf('s1')]));
    expect(loadClassLinkMembership).toHaveBeenCalledTimes(1);
  });

  it('shares one lookup between groups with no class id and local roster ids', async () => {
    loadClassLinkMembership.mockResolvedValue(new Map([['s1', 'class-1']]));
    const authority = defaultProjectMemberAuthority(db);
    expect(await authority('owner', '', [uidOf('s1')])).toEqual(
      new Set([uidOf('s1')])
    );
    expect(await authority('owner', 'local:r1', [uidOf('s1')])).toEqual(
      new Set([uidOf('s1')])
    );
    expect(loadClassLinkMembership).toHaveBeenCalledTimes(1);
  });

  it('asks again after a failed lookup', async () => {
    loadClassLinkMembership.mockRejectedValueOnce(new Error('unavailable'));
    const authority = defaultProjectMemberAuthority(db);
    await expect(authority('owner', 'class-1', ['x'])).rejects.toBeInstanceOf(
      RosterUnavailableError
    );
    loadClassLinkMembership.mockResolvedValue(new Map([['s1', 'class-1']]));
    expect(await authority('owner', 'class-1', [uidOf('s1')])).toEqual(
      new Set([uidOf('s1')])
    );
  });

  it('keeps test-class members working while ClassLink is down, but retries when a member is unchecked', async () => {
    loadClassLinkMembership.mockRejectedValue(new Error('503'));
    loadTestClassMembership.mockResolvedValue({
      membership: new Map([['kid@school.edu', 'slug']]),
      authorized: true,
    });
    const authority = defaultProjectMemberAuthority(db);
    const kid = testUidOf('kid@school.edu');
    expect(await authority('owner', 'slug', [kid])).toEqual(new Set([kid]));
    await expect(
      authority('owner', 'slug', [kid, uidOf('classlink-kid')])
    ).rejects.toBeInstanceOf(RosterUnavailableError);
  });

  it('does not cache an empty roster, so a new class or student is not denied for 90 seconds', async () => {
    const authority = defaultProjectMemberAuthority(db);
    expect((await authority('owner', 'class-1', [uidOf('s1')])).size).toBe(0);
    loadClassLinkMembership.mockResolvedValue(new Map([['s1', 'class-1']]));
    expect(await authority('owner', 'class-1', [uidOf('s1')])).toEqual(
      new Set([uidOf('s1')])
    );
    expect(loadClassLinkMembership).toHaveBeenCalledTimes(2);
  });

  it('shares one lookup across authorities for 90 seconds, then asks again', async () => {
    vi.useFakeTimers();
    try {
      loadClassLinkMembership.mockResolvedValue(new Map([['s1', 'class-1']]));
      await defaultProjectMemberAuthority(db)('owner', 'class-1', [
        uidOf('s1'),
      ]);
      await defaultProjectMemberAuthority(db)('owner', 'class-1', [
        uidOf('s1'),
      ]);
      expect(loadClassLinkMembership).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(91_000);
      await defaultProjectMemberAuthority(db)('owner', 'class-1', [
        uidOf('s1'),
      ]);
      expect(loadClassLinkMembership).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('drainDirtySessions when the class roster is unavailable', () => {
  const project = {
    'admin_settings/gradebook_index': { enabled: true },
    'project_runs/t1_p1': { teacherUid: 't1', title: 'Bridge' },
    'project_runs/t1_p1/groups/g1': { classId: 'c1', memberUids: ['u1'] },
    'project_runs/t1_p1/grades/g1': { points: 1, maxPoints: 2 },
    'grade_index_sessions/projects__t1_p1': {
      kind: 'projects',
      sessionId: 't1_p1',
      dirtyAt: 1,
    },
  };

  it('keeps the entry queued with a backoff and never counts it toward giving up', async () => {
    loadClassLinkMembership.mockRejectedValue(new Error('503'));
    const stub = makeStubFirestore(project);
    const typed = stub.db as unknown as Parameters<
      typeof drainDirtySessions
    >[0];
    for (let i = 0; i < 8; i++) {
      __resetProjectRosterCache();
      await drainDirtySessions(typed);
      // Pretend the backoff has passed so the next run retries it.
      const queued = stub.get('grade_index_sessions/projects__t1_p1');
      expect(queued).toBeDefined();
      stub.store.set('grade_index_sessions/projects__t1_p1', {
        ...queued,
        retryAt: 0,
      });
    }
    const queued = stub.get('grade_index_sessions/projects__t1_p1');
    expect(queued?.unavailable).toBe(8);
    expect(queued?.failures).toBeUndefined();
  });

  it('skips an entry still backing off, and drains it once the roster answers', async () => {
    const stub = makeStubFirestore({
      ...project,
      'grade_index_sessions/projects__t1_p1': {
        kind: 'projects',
        sessionId: 't1_p1',
        dirtyAt: 1,
        retryAt: Date.now() + 60_000,
        unavailable: 1,
      },
    });
    const typed = stub.db as unknown as Parameters<
      typeof drainDirtySessions
    >[0];
    expect(await drainDirtySessions(typed)).toEqual({
      recomputed: 0,
      failed: 0,
    });
    stub.store.set('grade_index_sessions/projects__t1_p1', {
      kind: 'projects',
      sessionId: 't1_p1',
      dirtyAt: 1,
    });
    loadClassLinkMembership.mockResolvedValue(new Map([['u1', 'c1']]));
    await drainDirtySessions(typed);
    expect(stub.has('grade_index_sessions/projects__t1_p1')).toBe(false);
  });
});
