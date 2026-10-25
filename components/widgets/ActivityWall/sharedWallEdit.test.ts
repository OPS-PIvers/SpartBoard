import { describe, expect, it, vi } from 'vitest';
import type { ActivityWallLibraryEntry } from '@/types';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { diffSharedWallEdit, sharedWallClassLock } from './sharedWallEdit';

const entry = (over: Partial<ActivityWallLibraryEntry> = {}) =>
  ({
    id: 'wall-1',
    title: 'Warm Up',
    prompt: 'Share one idea',
    mode: 'text',
    moderationEnabled: false,
    identificationMode: 'anonymous',
    createdAt: 1,
    updatedAt: 1,
    classIds: ['a', 'b'],
    ...over,
  }) as ActivityWallLibraryEntry;

describe('diffSharedWallEdit', () => {
  it('sends only changed setup fields', () => {
    const diff = diffSharedWallEdit(
      entry(),
      entry({ title: 'New', updatedAt: 99, createdAt: 99 }),
      'me'
    );
    expect(diff).toEqual({ changes: { title: 'New' } });
  });

  it("sends the colleague's own classes, never the owner's", () => {
    const diff = diffSharedWallEdit(
      entry(),
      entry({ classIds: ['a', 'b', 'c'] }),
      'me'
    );
    expect(diff.myClassIds).toEqual(['c']);
    expect(diff.changes).toEqual({});
  });

  it('clears the colleague classes they untick', () => {
    const before = entry({
      classIds: ['a', 'c'],
      memberClassIds: { me: ['c'] },
    });
    const diff = diffSharedWallEdit(before, entry({ classIds: ['a'] }), 'me');
    expect(diff.myClassIds).toEqual([]);
  });
});

describe('sharedWallClassLock', () => {
  it("locks the owner's and other colleagues' classes", () => {
    const lock = sharedWallClassLock(
      entry({
        classIds: ['a', 'c', 'd'],
        memberClassIds: { me: ['c'], x: ['d'] },
      }),
      'me'
    );
    expect(lock).toEqual({ locked: ['a', 'd'], canAdd: true });
  });

  it('keeps a link-only wall link-only', () => {
    expect(
      sharedWallClassLock(entry({ classIds: undefined }), 'me').canAdd
    ).toBe(false);
  });
});
