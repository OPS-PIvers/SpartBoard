import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: vi.fn(),
}));

const domains = vi.hoisted(() => new Map<string, string>());
vi.mock('./classlinkShared', () => ({
  normalizeEmailDomain: (email: string) => {
    const at = email.lastIndexOf('@');
    return at < 0 || at === email.length - 1
      ? null
      : '@' + email.slice(at + 1).toLowerCase();
  },
  resolveOrgIdForDomain: vi.fn((_db: unknown, domain: string) =>
    Promise.resolve(domains.get(domain) ?? null)
  ),
}));
vi.mock('./studentEmailIdentity', () => ({}));

import {
  createOrgEmailChecker,
  isWellFormedEmail,
  provenGoogleEmail,
  resolveStaffEmailsForUids,
} from './mailRecipients';

const google = [{ providerId: 'google.com' }];
const user = (patch: Record<string, unknown> = {}) =>
  ({
    uid: 'u1',
    email: 'Teacher@Orono.k12.mn.us',
    emailVerified: true,
    disabled: false,
    providerData: google,
    customClaims: {},
    ...patch,
  }) as never;

const stubDb = (
  members: Record<string, Record<string, unknown>>,
  orgs = ['orono', 'other']
) =>
  ({
    collection: () => ({
      get: () => Promise.resolve({ docs: orgs.map((id) => ({ id })) }),
    }),
    doc: (path: string) => ({
      get: () => Promise.resolve({ data: () => members[path] }),
    }),
  }) as never;

describe('isWellFormedEmail', () => {
  it('accepts one plain address and rejects lists, names and header tricks', () => {
    expect(isWellFormedEmail('a.b+c@orono.k12.mn.us')).toBe(true);
    expect(isWellFormedEmail('a@b.org, c@d.org')).toBe(false);
    expect(isWellFormedEmail('Name <a@b.org>')).toBe(false);
    expect(isWellFormedEmail('a@b.org\r\nBcc: x@y.org')).toBe(false);
    expect(isWellFormedEmail('nodomain@')).toBe(false);
    expect(isWellFormedEmail('a@localhost')).toBe(false);
    expect(isWellFormedEmail(42)).toBe(false);
  });
});

describe('provenGoogleEmail', () => {
  it('returns the lowercased address of a verified Google account', () => {
    expect(provenGoogleEmail(user())).toBe('teacher@orono.k12.mn.us');
  });

  it('refuses unverified, password-only, anonymous, disabled and student accounts', () => {
    expect(provenGoogleEmail(user({ emailVerified: false }))).toBeNull();
    expect(
      provenGoogleEmail(user({ providerData: [{ providerId: 'password' }] }))
    ).toBeNull();
    expect(
      provenGoogleEmail(user({ providerData: [], email: undefined }))
    ).toBeNull();
    expect(provenGoogleEmail(user({ disabled: true }))).toBeNull();
    expect(
      provenGoogleEmail(user({ customClaims: { studentRole: true } }))
    ).toBeNull();
    expect(
      provenGoogleEmail(user({ customClaims: { pinLogin: true } }))
    ).toBeNull();
    expect(provenGoogleEmail(null)).toBeNull();
  });
});

describe('createOrgEmailChecker', () => {
  domains.set('@orono.k12.mn.us', 'orono');
  const db = stubDb({
    'organizations/orono/members/teacher@orono.k12.mn.us': {
      roleId: 'teacher',
    },
    'organizations/orono/members/kid@orono.k12.mn.us': { roleId: 'student' },
    'organizations/orono/members/gone@orono.k12.mn.us': {
      roleId: 'teacher',
      status: 'inactive',
    },
  });

  it('knows org addresses by verified domain', async () => {
    const c = createOrgEmailChecker(db);
    expect(await c.isOrgAddress('new@orono.k12.mn.us')).toBe(true);
    expect(await c.isOrgAddress('someone@gmail.com')).toBe(false);
    expect(await c.isOrgAddress('bad address@orono.k12.mn.us')).toBe(false);
  });

  it('counts only active non-student members as staff', async () => {
    const c = createOrgEmailChecker(db);
    expect(await c.isStaff('Teacher@orono.k12.mn.us')).toBe(true);
    expect(await c.isStaff('kid@orono.k12.mn.us')).toBe(false);
    expect(await c.isStaff('gone@orono.k12.mn.us')).toBe(false);
    expect(await c.isStaff('nobody@orono.k12.mn.us')).toBe(false);
    expect(await c.isStaff('teacher@gmail.com')).toBe(false);
  });

  it('finds a staff member doc in an org whose domain is not verified for that address', async () => {
    const c = createOrgEmailChecker(
      stubDb({
        'organizations/other/members/coach@partner.example': {
          roleId: 'teacher',
        },
      })
    );
    expect(await c.isStaff('coach@partner.example')).toBe(true);
    expect(await c.isOrgAddress('coach@partner.example')).toBe(true);
    expect(await c.isOrgAddress('stranger@partner.example')).toBe(false);
  });

  it('retries a lookup that failed instead of caching the failure', async () => {
    let calls = 0;
    const flaky = {
      collection: () => ({
        get: () => Promise.resolve({ docs: [{ id: 'orono' }] }),
      }),
      doc: () => ({
        get: () =>
          ++calls === 1
            ? Promise.reject(new Error('unavailable'))
            : Promise.resolve({ data: () => ({ roleId: 'teacher' }) }),
      }),
    } as never;
    const c = createOrgEmailChecker(flaky);
    await expect(c.isStaff('teacher@orono.k12.mn.us')).rejects.toThrow();
    expect(await c.isStaff('teacher@orono.k12.mn.us')).toBe(true);
  });
});

describe('resolveStaffEmailsForUids', () => {
  it('reads addresses from Auth in batches and keeps only verified staff', async () => {
    const directory: Record<string, ReturnType<typeof user>> = {
      t1: user({ uid: 't1', email: 'teacher@orono.k12.mn.us' }),
      t2: user({
        uid: 't2',
        email: 'teacher@orono.k12.mn.us',
        emailVerified: false,
      }),
      s1: user({ uid: 's1', email: 'kid@orono.k12.mn.us' }),
    };
    const getUsers = vi.fn((ids: { uid: string }[]) =>
      Promise.resolve({
        users: ids.flatMap(({ uid }) => directory[uid] ?? []),
        notFound: [],
      })
    );
    const isStaff = (e: string) =>
      Promise.resolve(e === 'teacher@orono.k12.mn.us');
    const uids: string[] = [
      't1',
      't2',
      's1',
      'ghost',
      ...Array.from({ length: 150 }, () => 't1'),
    ];
    const out = await resolveStaffEmailsForUids(
      { getUsers },
      { isStaff },
      uids
    );
    expect(out).toEqual(['teacher@orono.k12.mn.us']);
    expect(getUsers).toHaveBeenCalledTimes(1);
  });
});
