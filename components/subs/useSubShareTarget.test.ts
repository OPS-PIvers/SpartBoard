import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  }),
  getDoc: (ref: unknown) => getDoc(ref) as unknown,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { useSubShareTarget } from './useSubShareTarget';

const DAY_MS = 24 * 60 * 60 * 1000;

const collectionDoc = (over: Record<string, unknown> = {}) => ({
  intendedMode: 'substitute',
  expiresAt: Date.now() + DAY_MS,
  buildingId: 'ohs',
  boardIds: ['b1', 'b2', 'b3'],
  ...over,
});

/** Answers the /shared_collections read, then the /shared_boards fallback. */
function respond(coll: unknown, board: unknown = null) {
  getDoc.mockImplementation((ref: unknown) => {
    const path = (ref as { __path: string }).__path;
    const data = path.startsWith('shared_collections') ? coll : board;
    return Promise.resolve({
      exists: () => data !== null,
      data: () => data,
    });
  });
}

const settle = async (shareId: string, boardId?: string) => {
  const { result } = renderHook(() =>
    useSubShareTarget({ shareId, ...(boardId !== undefined && { boardId }) })
  );
  await waitFor(() => expect(result.current.status).not.toBe('loading'));
  return result;
};

describe('useSubShareTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The building comes off the doc, because a link does not carry one.
  it('lands on the default board and takes the building from the share', async () => {
    respond(collectionDoc({ defaultBoardId: 'b2' }));
    const result = await settle('share-1');
    expect(result.current).toEqual({
      status: 'collection-board',
      shareId: 'share-1',
      boardId: 'b2',
      buildingId: 'ohs',
    });
  });

  it('falls back to the first board in walk order', async () => {
    respond(collectionDoc());
    const result = await settle('share-1');
    expect(result.current).toMatchObject({ boardId: 'b1' });
  });

  // A stale defaultBoardId would otherwise open a board that is gone.
  it('ignores a default board that is no longer in the share', async () => {
    respond(collectionDoc({ defaultBoardId: 'removed' }));
    const result = await settle('share-1');
    expect(result.current).toMatchObject({ boardId: 'b1' });
  });

  it('honours the board named in the link', async () => {
    respond(collectionDoc({ defaultBoardId: 'b2' }));
    const result = await settle('share-1', 'b3');
    expect(result.current).toMatchObject({ boardId: 'b3' });
  });

  it('refuses a board the share no longer carries', async () => {
    respond(collectionDoc());
    const result = await settle('share-1', 'gone');
    expect(result.current).toEqual({
      status: 'error',
      message: 'That board is not part of this share any more.',
    });
  });

  it('refuses an expired share', async () => {
    respond(collectionDoc({ expiresAt: Date.now() - 1 }));
    const result = await settle('share-1');
    expect(result.current).toEqual({
      status: 'error',
      message: 'This share has expired.',
    });
  });

  // "End now" stamps expiresAt in the past, so this is the ended-share path.
  it('refuses a share with no expiry at all', async () => {
    respond(collectionDoc({ expiresAt: undefined }));
    const result = await settle('share-1');
    expect(result.current).toMatchObject({ status: 'error' });
  });

  it('refuses a copy share', async () => {
    respond(collectionDoc({ intendedMode: 'copy' }));
    const result = await settle('share-1');
    expect(result.current).toEqual({
      status: 'error',
      message: 'That link is not a sub share.',
    });
  });

  it('refuses a share with no board left in it', async () => {
    respond(collectionDoc({ boardIds: [] }));
    const result = await settle('share-1');
    expect(result.current).toEqual({
      status: 'error',
      message: 'This share has no boards left in it.',
    });
  });

  // Links minted before collection shares existed point at /shared_boards.
  it('falls back to a single-board substitute share', async () => {
    respond(null, {
      intendedMode: 'substitute',
      expiresAt: Date.now() + DAY_MS,
      buildingId: 'ies',
    });
    const result = await settle('share-1');
    expect(result.current).toEqual({
      status: 'board',
      shareId: 'share-1',
      buildingId: 'ies',
    });
  });

  it('refuses an expired single-board share', async () => {
    respond(null, {
      intendedMode: 'substitute',
      expiresAt: Date.now() - 1,
      buildingId: 'ies',
    });
    const result = await settle('share-1');
    expect(result.current).toMatchObject({ status: 'error' });
  });

  it('reports a link that matches nothing', async () => {
    respond(null, null);
    const result = await settle('share-1');
    expect(result.current).toMatchObject({ status: 'error' });
  });

  // A denied read is what an ended share looks like from here.
  it('reports a denied read as a share it cannot find', async () => {
    getDoc.mockRejectedValue(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    const result = await settle('share-1');
    expect(result.current).toEqual({
      status: 'error',
      message:
        'That link does not point to a share we can find. It may have been ended.',
    });
  });
});
