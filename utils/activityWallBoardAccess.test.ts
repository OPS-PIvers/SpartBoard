import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDocs, mockGetDoc, mockUpdateDoc } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockGetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn((...ids: unknown[]) => ({ __arrayRemove: ids })),
  collection: vi.fn((_db: unknown, path: string) => path),
  doc: vi.fn((parent: { __path: string }, ...segments: string[]) => ({
    __path: [parent.__path, ...segments].join('/'),
  })),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  query: vi.fn((...args: unknown[]) => args),
  updateDoc: mockUpdateDoc,
  where: vi.fn((...args: unknown[]) => args),
}));

import { closeWallsToBoard } from './activityWallBoardAccess';

const sessionDoc = (activityId: string) => ({
  id: `teacher-1_${activityId}`,
  ref: { __path: `activity_wall_sessions/teacher-1_${activityId}` },
  data: () => ({ activityId }),
});

let access: Record<string, string[]>;

beforeEach(() => {
  vi.clearAllMocks();
  access = {};
  mockGetDoc.mockImplementation((ref: { __path: string }) =>
    Promise.resolve({
      data: () =>
        ref.__path in access
          ? { boardShareIds: access[ref.__path] }
          : undefined,
    })
  );
  mockUpdateDoc.mockResolvedValue(undefined);
});

describe('closeWallsToBoard', () => {
  it('closes walls the board no longer shows and keeps the ones it does', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [sessionDoc('kept'), sessionDoc('removed'), sessionDoc('other')],
    });
    access = {
      'activity_wall_sessions/teacher-1_kept/boardAccess/boards': ['share-1'],
      'activity_wall_sessions/teacher-1_removed/boardAccess/boards': [
        'share-2',
        'share-1/host-1',
        'share-10/host-2',
      ],
      'activity_wall_sessions/teacher-1_other/boardAccess/boards': ['share-2'],
    };

    await closeWallsToBoard('teacher-1', 'share-1', new Set(['kept']));

    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      {
        __path: 'activity_wall_sessions/teacher-1_removed/boardAccess/boards',
      },
      { boardShareIds: { __arrayRemove: ['share-1/host-1'] } }
    );
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { __path: 'activity_wall_sessions/teacher-1_removed' },
      { boardAccessAt: expect.any(Number) as number }
    );
    // The kept wall's access is never read.
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
  });

  it('closes every wall when nothing is kept', async () => {
    mockGetDocs.mockResolvedValue({ docs: [sessionDoc('a'), sessionDoc('b')] });
    access = {
      'activity_wall_sessions/teacher-1_a/boardAccess/boards': ['share-1'],
      'activity_wall_sessions/teacher-1_b/boardAccess/boards': ['share-1'],
    };

    await closeWallsToBoard('teacher-1', 'share-1', new Set());

    expect(mockUpdateDoc).toHaveBeenCalledTimes(4);
  });
});
