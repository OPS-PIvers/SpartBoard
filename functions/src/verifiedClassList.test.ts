/* eslint-disable @typescript-eslint/require-await -- mocks mirror the async Admin SDK surface. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({}));

import {
  MAX_VERIFIED_CLASS_IDS,
  isLmsClassId,
  mergeVerifiedClasses,
  staffEmailFromToken,
  unverifiedClassIds,
  writeVerifiedClasses,
} from './verifiedClassList';

type Doc = Record<string, unknown>;

function stubDb(docs: Record<string, Doc>) {
  const ref = (path: string) => ({ path });
  return {
    docs,
    doc: (path: string) => ({
      path,
      get: () =>
        Promise.resolve({ exists: path in docs, data: () => docs[path] }),
    }),
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async <T>(
      fn: (tx: {
        get: (r: { path: string }) => Promise<unknown>;
        set: (r: { path: string }, d: Doc) => void;
      }) => Promise<T>
    ) =>
      fn({
        get: async (r) => ({
          exists: r.path in docs,
          data: () => docs[r.path],
        }),
        set: (r, d) => {
          docs[r.path] = d;
        },
      }),
  } as never;
}

describe('mergeVerifiedClasses', () => {
  it('replaces ClassLink and test parts and keeps LMS ids', () => {
    const out = mergeVerifiedClasses(
      { classlink: ['old'], test: ['t-old'], lms: ['schoology:1'] },
      { classlink: ['cl-1', 'cl-1'], test: ['t-1'], addLms: ['classroom:9'] },
      5
    );
    expect(out).toEqual({
      ids: ['cl-1', 't-1', 'schoology:1', 'classroom:9'],
      classlink: ['cl-1'],
      test: ['t-1'],
      lms: ['schoology:1', 'classroom:9'],
      updatedAt: 5,
      classlinkAt: 5,
    });
  });

  it('keeps the stored part when a source could not answer', () => {
    const out = mergeVerifiedClasses(
      { classlink: ['cl-1'], test: ['t-1'], lms: [] },
      { classlink: null, test: null },
      1
    );
    expect(out.ids).toEqual(['cl-1', 't-1']);
    expect(out.classlinkAt).toBeUndefined();
    expect(
      mergeVerifiedClasses({ classlinkAt: 3 }, { classlink: null, test: [] }, 9)
        .classlinkAt
    ).toBe(3);
  });

  it('accepts only prefixed LMS ids and drops malformed entries', () => {
    const out = mergeVerifiedClasses(
      { classlink: ['ok', 7, '', 'x'.repeat(301)] },
      {
        classlink: null,
        test: [],
        addLms: ['cl-2', 'schoology:', 'classroom:5'],
      },
      1
    );
    expect(out.ids).toEqual(['ok', 'classroom:5']);
  });

  it('caps the merged list with ClassLink classes first', () => {
    const many = Array.from(
      { length: MAX_VERIFIED_CLASS_IDS + 5 },
      (_, i) => `c${i}`
    );
    const out = mergeVerifiedClasses(
      undefined,
      { classlink: many, test: [], addLms: ['schoology:1'] },
      1
    );
    expect(out.ids).toHaveLength(MAX_VERIFIED_CLASS_IDS);
    expect(out.ids).not.toContain('schoology:1');
  });
});

describe('isLmsClassId', () => {
  it('needs a known prefix and a non-empty id', () => {
    expect(isLmsClassId('schoology:abc')).toBe(true);
    expect(isLmsClassId('classroom:1')).toBe(true);
    expect(isLmsClassId('classroom:')).toBe(false);
    expect(isLmsClassId('lti:1')).toBe(false);
  });
});

describe('staffEmailFromToken', () => {
  it('returns a verified staff address, lowercased', () => {
    expect(
      staffEmailFromToken({ email: 'T@Orono.k12.mn.us', email_verified: true })
    ).toBe('t@orono.k12.mn.us');
  });

  it('refuses students, PIN tokens and unverified addresses', () => {
    expect(
      staffEmailFromToken({
        email: 'a@b.c',
        email_verified: true,
        studentRole: true,
      })
    ).toBeNull();
    expect(
      staffEmailFromToken({
        email: 'a@b.c',
        email_verified: true,
        pinLogin: true,
      })
    ).toBeNull();
    expect(
      staffEmailFromToken({ email: 'a@b.c', email_verified: false })
    ).toBeNull();
    expect(staffEmailFromToken(null)).toBeNull();
  });
});

describe('unverifiedClassIds', () => {
  it('returns the ids missing from the list', async () => {
    const db = stubDb({ 'verified_classes/u': { ids: ['a', 'b'] } });
    expect(await unverifiedClassIds(db, 'u', ['a', 'c'])).toEqual(['c']);
  });

  it('does not narrow a teacher with no list yet', async () => {
    expect(await unverifiedClassIds(stubDb({}), 'u', ['a'])).toEqual([]);
  });
});

describe('writeVerifiedClasses', () => {
  it('merges into the stored doc', async () => {
    const docs: Record<string, Doc> = {
      'verified_classes/u': {
        classlink: ['a'],
        test: [],
        lms: ['schoology:1'],
      },
    };
    await writeVerifiedClasses(
      stubDb(docs),
      'u',
      { classlink: null, test: null, addLms: ['classroom:2'] },
      9
    );
    expect(docs['verified_classes/u']).toMatchObject({
      ids: ['a', 'schoology:1', 'classroom:2'],
      updatedAt: 9,
    });
  });
});
