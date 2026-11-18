import { describe, it, expect } from 'vitest';
import { excludedEmails, isExcludedFrom } from './permissionExclusion';
import { isGlobalFeatureGranted } from './featureGrant';

type Db = Parameters<typeof isGlobalFeatureGranted>[0];

/** A Firestore stub with one saved permission doc and an admins list. */
const fakeDb = (perm: Record<string, unknown>, admins: string[]): Db =>
  ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () =>
          Promise.resolve(
            name === 'global_permissions'
              ? { exists: true, data: (): unknown => perm }
              : {
                  exists: name === 'admins' && admins.includes(id),
                  data: (): unknown => undefined,
                  get: () => undefined,
                }
          ),
      }),
    }),
    doc: () => ({
      get: () => Promise.resolve({ exists: false, get: () => undefined }),
    }),
  }) as unknown as Db;

describe('permission exclusion', () => {
  it('normalizes the list and ignores junk', () => {
    expect(
      excludedEmails({ excludedUsers: [' A@b.org', 'a@b.org', 3, ''] })
    ).toEqual(['a@b.org']);
    expect(excludedEmails(undefined)).toEqual([]);
    expect(isExcludedFrom({ excludedUsers: ['a@b.org'] }, 'A@B.org')).toBe(
      true
    );
    expect(isExcludedFrom({ excludedUsers: ['a@b.org'] }, null)).toBe(false);
  });

  it('denies an excluded admin on an admin-only flag', async () => {
    const perm = {
      enabled: true,
      accessLevel: 'admin',
      excludedUsers: ['boss@x.org'],
    };
    await expect(
      isGlobalFeatureGranted(
        fakeDb(perm, ['boss@x.org']),
        'f',
        'Boss@x.org',
        'u'
      )
    ).resolves.toBe(false);
    await expect(
      isGlobalFeatureGranted(
        fakeDb(perm, ['other@x.org']),
        'f',
        'other@x.org',
        'u'
      )
    ).resolves.toBe(true);
  });

  it('denies an excluded teacher on a public flag', async () => {
    const perm = {
      enabled: true,
      accessLevel: 'public',
      excludedUsers: ['t@x.org'],
    };
    await expect(
      isGlobalFeatureGranted(fakeDb(perm, []), 'f', 't@x.org', 'u')
    ).resolves.toBe(false);
    await expect(
      isGlobalFeatureGranted(fakeDb(perm, []), 'f', 'u@x.org', 'u')
    ).resolves.toBe(true);
  });

  it('denies an excluded beta tester', async () => {
    const perm = {
      enabled: true,
      accessLevel: 'beta',
      betaUsers: ['t@x.org'],
      excludedUsers: ['t@x.org'],
    };
    await expect(
      isGlobalFeatureGranted(fakeDb(perm, []), 'f', 't@x.org', 'u')
    ).resolves.toBe(false);
  });
});
