import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('../secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => 'id' },
  CLASSLINK_CLIENT_SECRET: { value: () => 'secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant.example' },
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => 'unit-test-hmac-secret' },
}));

import type * as admin from 'firebase-admin';
import { computeStudentUid } from '../classlinkShared';
import {
  getGradebookRosterV1,
  handleGetGradebookRoster,
  parseRosterId,
  type GradebookRosterLoaders,
} from './getGradebookRosterV1';

const HMAC = 'unit-test-hmac-secret';
const TEACHER = 'teacher-1';

function stubDb(
  docs: Record<string, Record<string, unknown>>
): admin.firestore.Firestore {
  return {
    doc: (path: string) => ({
      get: () =>
        Promise.resolve({
          exists: path in docs,
          get: (field: string) => docs[path]?.[field],
        }),
    }),
  } as unknown as admin.firestore.Firestore;
}

function loaders(
  overrides: Partial<GradebookRosterLoaders> = {}
): GradebookRosterLoaders {
  return {
    classlink: vi.fn(() => Promise.resolve(new Map<string, string>())),
    test: vi.fn(() =>
      Promise.resolve({
        membership: new Map<string, string>(),
        authorized: false,
      })
    ),
    ...overrides,
  };
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
}

describe('parseRosterId', () => {
  it('accepts a plain id and rejects missing, pathlike or oversized ids', () => {
    expect(parseRosterId({ rosterId: ' r1 ' })).toBe('r1');
    for (const bad of [
      undefined,
      null,
      {},
      { rosterId: 5 },
      { rosterId: '' },
      { rosterId: 'a/b' },
      { rosterId: 'x'.repeat(201) },
    ]) {
      expect(() => parseRosterId(bad)).toThrow();
    }
  });
});

describe('handleGetGradebookRoster', () => {
  it('maps ClassLink students of the roster class to their SSO uid', async () => {
    const db = stubDb({
      [`users/${TEACHER}/rosters/r1`]: { classlinkClassId: 'class-a' },
    });
    const l = loaders({
      classlink: vi.fn(() =>
        Promise.resolve(
          new Map([
            ['sid-1', 'class-a'],
            ['sid-2', 'class-a'],
          ])
        )
      ),
    });
    const result = await handleGetGradebookRoster(db, TEACHER, 'r1', HMAC, l);
    expect(l.classlink).toHaveBeenCalledWith('class-a');
    expect(result).toEqual({
      rosterId: 'r1',
      source: 'classlink',
      classId: 'class-a',
      students: [
        {
          refKey: 'classlink:sid-1',
          studentUid: computeStudentUid('sid-1', HMAC),
        },
        {
          refKey: 'classlink:sid-2',
          studentUid: computeStudentUid('sid-2', HMAC),
        },
      ],
    });
  });

  it('returns no students for a ClassLink class the caller does not teach', async () => {
    const db = stubDb({
      [`users/${TEACHER}/rosters/r1`]: { classlinkClassId: 'forged' },
    });
    const result = await handleGetGradebookRoster(
      db,
      TEACHER,
      'r1',
      HMAC,
      loaders()
    );
    expect(result.students).toEqual([]);
  });

  it('maps test-class members with the test uid namespace', async () => {
    const db = stubDb({
      [`users/${TEACHER}/rosters/r2`]: { testClassId: 'mock' },
    });
    const l = loaders({
      test: vi.fn(() =>
        Promise.resolve({
          membership: new Map([['kid@school.edu', 'mock']]),
          authorized: true,
        })
      ),
    });
    const result = await handleGetGradebookRoster(db, TEACHER, 'r2', HMAC, l);
    expect(l.classlink).not.toHaveBeenCalled();
    expect(result.source).toBe('test');
    expect(result.students).toEqual([
      {
        refKey: 'test:kid@school.edu',
        studentUid: computeStudentUid('test:kid@school.edu', HMAC),
      },
    ]);
  });

  it('refuses a test class the caller has no authority over', async () => {
    const db = stubDb({
      [`users/${TEACHER}/rosters/r2`]: { testClassId: 'mock' },
    });
    await expectCode(
      handleGetGradebookRoster(db, TEACHER, 'r2', HMAC, loaders()),
      'permission-denied'
    );
  });

  it('refuses local rosters and rosters the caller does not own', async () => {
    const db = stubDb({
      [`users/${TEACHER}/rosters/local`]: { origin: 'local' },
    });
    await expectCode(
      handleGetGradebookRoster(db, TEACHER, 'local', HMAC, loaders()),
      'failed-precondition'
    );
    await expectCode(
      handleGetGradebookRoster(db, 'someone-else', 'local', HMAC, loaders()),
      'not-found'
    );
  });
});

describe('getGradebookRosterV1 auth', () => {
  const call = getGradebookRosterV1 as unknown as (
    req: unknown
  ) => Promise<unknown>;

  it('rejects signed-out callers, students and unverified emails', async () => {
    await expectCode(call({ data: { rosterId: 'r1' } }), 'unauthenticated');
    await expectCode(
      call({
        auth: { uid: 's', token: { studentRole: true } },
        data: { rosterId: 'r1' },
      }),
      'permission-denied'
    );
    await expectCode(
      call({
        auth: { uid: 't', token: { email: 't@x.org', email_verified: false } },
        data: { rosterId: 'r1' },
      }),
      'permission-denied'
    );
  });
});
