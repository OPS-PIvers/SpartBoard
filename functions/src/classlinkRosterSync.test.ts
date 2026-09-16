import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runClassLinkRosterSync,
  parseRosterFileBody,
  ClassLinkSyncDeps,
  RosterFileContent,
  SyncSettings,
} from './classlinkRosterSync';
import { ClassLinkStudent } from './classlinkShared';
import { SyncStudent } from './classlinkRosterReconcile';

/**
 * The runner's whole job is deciding what to write and what to refuse, so the
 * fakes below stand in for Drive/OneRoster/OAuth and the assertions are about
 * those decisions.
 */

interface FakeRoster {
  path: string;
  uid: string;
  data: Record<string, unknown>;
  students: SyncStudent[];
  upstream: ClassLinkStudent[];
  driveVersion?: string;
}

const student = (
  first: string,
  pin: string,
  sourcedId?: string
): SyncStudent => ({
  id: `id-${first}`,
  firstName: first,
  lastName: 'Test',
  pin,
  ...(sourcedId ? { classLinkSourcedId: sourcedId } : {}),
});

const up = (sourcedId: string, givenName: string): ClassLinkStudent => ({
  sourcedId,
  givenName,
  familyName: 'Test',
});

const ENABLED: SyncSettings = { enabled: true, dryRun: false };

function buildHarness(rosters: FakeRoster[]) {
  const written = new Map<string, RosterFileContent>();
  const updated = new Map<string, Record<string, unknown>>();
  const pinIndexCalls: { path: string; students: readonly SyncStudent[] }[] =
    [];
  const grants = new Map<string, boolean>();
  const driveVersions = new Map<string, string>();

  const docs = rosters.map((r) => {
    driveVersions.set(r.path, r.driveVersion ?? 'v1');
    grants.set(r.uid, true);
    return {
      id: r.path.split('/').pop(),
      ref: {
        path: r.path,
        parent: { parent: { id: r.uid } },
        update: vi.fn((payload: Record<string, unknown>) => {
          updated.set(r.path, payload);
          return Promise.resolve();
        }),
      },
      data: () => ({ driveFileId: `file-${r.path}`, ...r.data }),
    };
  });

  let pagesServed = 0;
  const db = {
    collectionGroup: () => {
      const q = {
        orderBy: () => q,
        limit: () => q,
        startAfter: () => q,
        get: () => {
          const page = pagesServed === 0 ? docs : [];
          pagesServed += 1;
          return Promise.resolve({
            empty: page.length === 0,
            docs: page,
            size: page.length,
          });
        },
      };
      return q;
    },
  } as unknown as Parameters<typeof runClassLinkRosterSync>[0];

  const byFile = new Map(rosters.map((r) => [`file-${r.path}`, r]));

  const deps: ClassLinkSyncDeps = {
    getAccessToken: (uid) => {
      if (!grants.get(uid)) {
        return Promise.reject(
          Object.assign(new Error('consent'), {
            details: { reason: 'needs-consent' },
          })
        );
      }
      return Promise.resolve(`token-${uid}`);
    },
    fetchClassStudents: (classId) => {
      const r = rosters.find((x) => x.data.classlinkClassId === classId);
      return Promise.resolve(r ? r.upstream : []);
    },
    readRosterFile: (_token, fileId) => {
      const r = byFile.get(fileId);
      if (!r) return Promise.reject(new Error(`no such file ${fileId}`));
      return Promise.resolve({
        content: {
          students: r.students,
          groups: [{ id: 'g1', name: 'A', studentIds: [] }],
        },
        driveVersion: driveVersions.get(r.path) ?? 'v1',
      });
    },
    writeRosterFile: (_token, fileId, content) => {
      written.set(fileId, content);
      return Promise.resolve();
    },
    getDriveVersion: (_token, fileId) => {
      const r = byFile.get(fileId);
      return Promise.resolve(driveVersions.get(r?.path ?? '') ?? 'v1');
    },
    reconcilePinIndex: (rosterRef, _data, students) => {
      pinIndexCalls.push({ path: rosterRef.path, students });
      return Promise.resolve();
    },
    now: () => 1_000_000,
  };

  return { db, deps, written, updated, pinIndexCalls, grants, driveVersions };
}

const classlinkRoster = (
  path: string,
  uid: string,
  students: SyncStudent[],
  upstream: ClassLinkStudent[]
): FakeRoster => ({
  path,
  uid,
  // Class id derived from the path so two fake rosters never share upstream.
  data: {
    classlinkClassId: `class-${path}`,
    name: 'Period 3',
    origin: 'classlink',
  },
  students,
  upstream,
});

describe('runClassLinkRosterSync', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('does nothing at all when disabled', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada'), up('s2', 'Grace')]
      ),
    ]);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, {
      enabled: false,
      dryRun: false,
    });

    expect(out.scanned).toBe(0);
    expect(harness.written.size).toBe(0);
  });

  it('writes the merged roster and stamps Firestore', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1'), student('Alan', '02', 's2')],
        [up('s1', 'Ada'), up('s3', 'Zoe')]
      ),
    ]);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.synced).toBe(1);
    expect(out.added).toBe(1);
    expect(out.removed).toBe(1);

    const file = harness.written.get('file-users/u1/rosters/r1');
    expect(file?.students.map((s) => s.firstName)).toEqual(['Ada', 'Zoe']);
    expect(file?.lastSync).toEqual({
      at: 1_000_000,
      added: ['Zoe Test'],
      removed: ['Alan Test'],
    });
    // Unrelated file content must survive a sync write.
    expect(file?.groups).toEqual([{ id: 'g1', name: 'A', studentIds: [] }]);

    const meta = harness.updated.get('users/u1/rosters/r1');
    expect(meta).toEqual({
      studentCount: 2,
      classlinkSyncedAt: 1_000_000,
      classlinkSyncSummary: { at: 1_000_000, addedCount: 1, removedCount: 1 },
    });
  });

  // The Firestore roster doc is contractually free of student PII — names live
  // only in Drive. A change summary is exactly the kind of addition that would
  // leak them back in.
  it('keeps student names out of the Firestore write', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1'), student('Alan', '02', 's2')],
        [up('s1', 'Ada'), up('s3', 'Zoe')]
      ),
    ]);

    await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    const meta = harness.updated.get('users/u1/rosters/r1');
    expect(meta).toBeDefined();
    expect(JSON.stringify(meta)).not.toMatch(/Ada|Alan|Zoe|Test/);
  });

  it('reconciles the pin index with the post-merge students', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1'), student('Alan', '02', 's2')],
        [up('s1', 'Ada')]
      ),
    ]);

    await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(harness.pinIndexCalls).toHaveLength(1);
    expect(harness.pinIndexCalls[0].students.map((s) => s.firstName)).toEqual([
      'Ada',
    ]);
  });

  it('writes nothing when the roster already matches', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada')]
      ),
    ]);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.unchanged).toBe(1);
    expect(out.synced).toBe(0);
    expect(harness.written.size).toBe(0);
    expect(harness.updated.size).toBe(0);
  });

  it('computes changes but writes nothing in dry run', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada'), up('s2', 'Grace')]
      ),
    ]);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, {
      enabled: true,
      dryRun: true,
    });

    expect(out.added).toBe(1);
    expect(out.synced).toBe(0);
    expect(harness.written.size).toBe(0);
    expect(harness.pinIndexCalls).toHaveLength(0);
  });

  // The teacher has not granted an offline token, so there is no way to read
  // their Drive roster. That is a skip, not a failure.
  it('skips a teacher with no offline grant without erroring', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada'), up('s2', 'Grace')]
      ),
    ]);
    harness.grants.set('u1', false);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.skippedNoGrant).toBe(1);
    expect(out.errors).toBe(0);
    expect(harness.written.size).toBe(0);
  });

  it('asks for a token once per teacher across their rosters', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada')]
      ),
      classlinkRoster(
        'users/u1/rosters/r2',
        'u1',
        [student('Bo', '01', 's9')],
        [up('s9', 'Bo')]
      ),
    ]);
    const spy = vi.spyOn(harness.deps, 'getAccessToken');

    await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Drive media uploads have no If-Match, so a teacher saving mid-merge would
  // otherwise be silently clobbered. Yield and retry tomorrow.
  it('skips the write when the Drive file changed mid-sync', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada'), up('s2', 'Grace')]
      ),
    ]);
    // The teacher saved between our read and our write.
    harness.deps.getDriveVersion = () =>
      Promise.resolve('v2-teacher-just-saved');

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.conflicts).toBe(1);
    expect(out.synced).toBe(0);
    expect(harness.written.size).toBe(0);
  });

  it('records a blocked reconcile without writing', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1'), student('Alan', '02', 's2')],
        []
      ),
    ]);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.blocked['empty-upstream']).toBe(1);
    expect(harness.written.size).toBe(0);
  });

  it('skips a roster that has no Drive file', async () => {
    harness = buildHarness([
      classlinkRoster('users/u1/rosters/r1', 'u1', [], [up('s1', 'Ada')]),
    ]);
    harness.db.collectionGroup = (() => {
      const q = {
        orderBy: () => q,
        limit: () => q,
        startAfter: () => q,
        get: () =>
          Promise.resolve({
            empty: false,
            size: 1,
            docs: [
              {
                ref: {
                  path: 'users/u1/rosters/r1',
                  parent: { parent: { id: 'u1' } },
                  update: vi.fn(),
                },
                data: () => ({ classlinkClassId: 'c1', driveFileId: null }),
              },
            ],
          }),
      };
      return q;
    }) as never;

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.skippedNoFile).toBe(1);
    expect(out.errors).toBe(0);
  });

  // One teacher's broken Drive file must not abort the whole nightly run.
  it('counts a failing roster and continues to the next', async () => {
    harness = buildHarness([
      classlinkRoster(
        'users/u1/rosters/r1',
        'u1',
        [student('Ada', '01', 's1')],
        [up('s1', 'Ada'), up('s2', 'Grace')]
      ),
      classlinkRoster(
        'users/u2/rosters/r2',
        'u2',
        [student('Bo', '01', 's9')],
        [up('s9', 'Bo'), up('s8', 'Cy')]
      ),
    ]);
    const realRead = harness.deps.readRosterFile;
    harness.deps.readRosterFile = (t, f) =>
      f === 'file-users/u1/rosters/r1'
        ? Promise.reject(new Error('corrupt json'))
        : realRead(t, f);

    const out = await runClassLinkRosterSync(harness.db, harness.deps, ENABLED);

    expect(out.errors).toBe(1);
    expect(out.synced).toBe(1);
    expect(harness.written.has('file-users/u2/rosters/r2')).toBe(true);
  });
});

describe('parseRosterFileBody', () => {
  it('reads the v2 envelope', () => {
    const out = parseRosterFileBody({
      version: 2,
      students: [student('Ada', '01')],
      groups: [{ id: 'g', name: 'n', studentIds: [] }],
    });
    expect(out.students).toHaveLength(1);
    expect(out.groups).toHaveLength(1);
  });

  it('reads a legacy bare student array', () => {
    const out = parseRosterFileBody([student('Ada', '01')]);
    expect(out.students).toHaveLength(1);
  });

  it('throws on an unrecognized payload', () => {
    expect(() => parseRosterFileBody({ nope: true })).toThrow();
  });
});
