import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ staff: new Set<string>() }));
vi.mock('./districtStaff', () => ({
  isDistrictStaffEmail: (_db: unknown, email: string) =>
    Promise.resolve(h.staff.has(email)),
}));

import {
  authorPassesFlag,
  isFlagOnForAuthor,
  isListedTourAuthor,
  resolveCallerIsTourAuthor,
} from './tourAuthors';

type Doc = Record<string, unknown>;

function fakeDb(docs: Record<string, Doc>) {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () => {
          const data = docs[`${name}/${id}`];
          return Promise.resolve({ exists: !!data, data: () => data });
        },
      }),
    }),
  } as never;
}

const AUTHOR = 'pat.lee@orono.k12.mn.us';
const listed = { [`tour_authors/${AUTHOR}`]: { addedAt: 1 } };

describe('isListedTourAuthor', () => {
  it('needs both the list entry and an active staff member doc', async () => {
    h.staff = new Set([AUTHOR]);
    expect(
      await isListedTourAuthor(fakeDb(listed), ' Pat.Lee@Orono.k12.mn.us')
    ).toBe(true);
    expect(await isListedTourAuthor(fakeDb({}), AUTHOR)).toBe(false);
    h.staff = new Set();
    expect(await isListedTourAuthor(fakeDb(listed), AUTHOR)).toBe(false);
    expect(await isListedTourAuthor(fakeDb(listed), null)).toBe(false);
  });

  it('never counts an unverified email', async () => {
    h.staff = new Set([AUTHOR]);
    const db = fakeDb(listed);
    expect(
      await resolveCallerIsTourAuthor(db, {
        email: AUTHOR,
        email_verified: true,
      })
    ).toBe(true);
    expect(
      await resolveCallerIsTourAuthor(db, {
        email: AUTHOR,
        email_verified: false,
      })
    ).toBe(false);
    expect(await resolveCallerIsTourAuthor(db, {})).toBe(false);
  });
});

describe('isFlagOnForAuthor', () => {
  it('passes an enabled flag at any level and a preview flag with no saved doc', async () => {
    const on = (extra: Doc = {}) =>
      fakeDb({
        'global_permissions/web-tours': {
          enabled: true,
          accessLevel: 'admin',
          ...extra,
        },
      });
    expect(await isFlagOnForAuthor(on(), 'web-tours', AUTHOR)).toBe(true);
    expect(await isFlagOnForAuthor(fakeDb({}), 'web-tours', AUTHOR)).toBe(true);
    expect(
      await isFlagOnForAuthor(fakeDb({}), 'not-a-preview-flag', AUTHOR)
    ).toBe(false);
  });

  it('fails a flag that is off or excludes the author', async () => {
    const db = (doc: Doc) => fakeDb({ 'global_permissions/web-tours': doc });
    expect(
      await isFlagOnForAuthor(db({ enabled: false }), 'web-tours', AUTHOR)
    ).toBe(false);
    expect(
      await isFlagOnForAuthor(
        db({ enabled: true, excludedUsers: [AUTHOR] }),
        'web-tours',
        AUTHOR
      )
    ).toBe(false);
  });

  it('needs the list as well as the flag', async () => {
    h.staff = new Set([AUTHOR]);
    expect(await authorPassesFlag(fakeDb(listed), 'web-tours', AUTHOR)).toBe(
      true
    );
    expect(await authorPassesFlag(fakeDb({}), 'web-tours', AUTHOR)).toBe(false);
  });
});
