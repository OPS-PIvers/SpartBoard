import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWallEngagement } from './useWallEngagement';

type SnapshotDoc = { id: string; data: () => Record<string, unknown> };
type SnapshotHandler = (snap: { docs: SnapshotDoc[] }) => void;
type MockRef = { __path: string };

const { mockOnSnapshot, mockSetDoc, mockDeleteDoc, mockDoc, mockCollection } =
  vi.hoisted(() => ({
    mockOnSnapshot: vi.fn(),
    mockSetDoc: vi.fn(),
    mockDeleteDoc: vi.fn(),
    mockDoc: vi.fn(),
    mockCollection: vi.fn(),
  }));

vi.mock('@/config/firebase', () => ({ db: { __path: 'db' } }));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  deleteDoc: mockDeleteDoc,
  onSnapshot: mockOnSnapshot,
  query: vi.fn((value: unknown) => value),
  setDoc: mockSetDoc,
}));

const pathOf = (arg: unknown): string =>
  typeof arg === 'object' && arg !== null && '__path' in arg
    ? (arg as MockRef).__path
    : String(arg);

const subscribedPaths = (): string[] =>
  mockOnSnapshot.mock.calls.map((call) => (call[0] as MockRef).__path);

describe('useWallEngagement', () => {
  let likesHandler: SnapshotHandler | null;
  let commentsHandler: SnapshotHandler | null;
  let unsubLikes: ReturnType<typeof vi.fn>;
  let unsubComments: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    likesHandler = null;
    commentsHandler = null;
    unsubLikes = vi.fn();
    unsubComments = vi.fn();
    const buildRef = (first: unknown, ...rest: string[]): MockRef => ({
      __path: [pathOf(first), ...rest].join('/'),
    });
    mockCollection.mockImplementation(buildRef);
    mockDoc.mockImplementation(buildRef);
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((ref: MockRef, next: unknown) => {
      if (ref.__path.endsWith('/likes')) {
        likesHandler = next as SnapshotHandler;
        return unsubLikes;
      }
      commentsHandler = next as SnapshotHandler;
      return unsubComments;
    });
  });

  it('subscribes only to the enabled collections at the session path', () => {
    renderHook(() =>
      useWallEngagement('sess-1', 'viewer-1', { likes: true, comments: false })
    );
    expect(subscribedPaths()).toEqual([
      'db/activity_wall_sessions/sess-1/likes',
    ]);
    expect(commentsHandler).toBeNull();
  });

  it('subscribes to nothing when sessionId is null', () => {
    renderHook(() =>
      useWallEngagement(null, 'viewer-1', { likes: true, comments: true })
    );
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('tears down a subscription when its kind is disabled', () => {
    const { rerender } = renderHook(
      ({ comments }: { comments: boolean }) =>
        useWallEngagement('sess-1', 'viewer-1', { likes: false, comments }),
      { initialProps: { comments: true } }
    );
    expect(subscribedPaths()).toEqual([
      'db/activity_wall_sessions/sess-1/comments',
    ]);
    rerender({ comments: false });
    expect(unsubComments).toHaveBeenCalledTimes(1);
  });

  it('builds likeIndex and commentsBySubmission from the snapshots', () => {
    const { result } = renderHook(() =>
      useWallEngagement('sess-1', 'viewer-1', { likes: true, comments: true })
    );
    act(() => {
      likesHandler?.({
        docs: [
          {
            id: 'a__viewer-1',
            data: () => ({ submissionId: 'a', authorUid: 'viewer-1' }),
          },
          {
            id: 'a__other',
            data: () => ({ submissionId: 'a', authorUid: 'other' }),
          },
          {
            id: 'b__other',
            data: () => ({ submissionId: 'b', authorUid: 'other' }),
          },
        ],
      });
      commentsHandler?.({
        docs: [
          {
            id: 'c2',
            data: () => ({
              submissionId: 'a',
              content: 'second',
              createdAt: 200,
              parentCommentId: 'c1',
            }),
          },
          {
            id: 'c1',
            data: () => ({
              submissionId: 'a',
              content: 'first',
              createdAt: 100,
            }),
          },
        ],
      });
    });
    expect(result.current.likeIndex.get('a')).toEqual({
      count: 2,
      viewerLiked: true,
    });
    expect(result.current.likeIndex.get('b')).toEqual({
      count: 1,
      viewerLiked: false,
    });
    const comments = result.current.commentsBySubmission.get('a');
    expect(comments?.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(comments?.[0]).toMatchObject({
      parentCommentId: null,
      participantLabel: 'Anonymous',
      content: 'first',
    });
    expect(comments?.[1].parentCommentId).toBe('c1');
  });

  it('toggleLike writes then deletes the session-level like doc', async () => {
    const { result } = renderHook(() =>
      useWallEngagement('sess-1', 'viewer-1', { likes: true, comments: false })
    );
    await act(async () => {
      await result.current.toggleLike('sub-1');
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'db/activity_wall_sessions/sess-1/likes/sub-1__viewer-1' },
      expect.objectContaining({
        id: 'sub-1__viewer-1',
        submissionId: 'sub-1',
        authorUid: 'viewer-1',
      })
    );

    act(() => {
      likesHandler?.({
        docs: [
          {
            id: 'sub-1__viewer-1',
            data: () => ({ submissionId: 'sub-1', authorUid: 'viewer-1' }),
          },
        ],
      });
    });
    await act(async () => {
      await result.current.toggleLike('sub-1');
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith({
      __path: 'db/activity_wall_sessions/sess-1/likes/sub-1__viewer-1',
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('toggleLike is a no-op without a viewer', async () => {
    const { result } = renderHook(() =>
      useWallEngagement('sess-1', null, { likes: true, comments: false })
    );
    await act(async () => {
      await result.current.toggleLike('sub-1');
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('postComment writes a session-level comment doc with a generated id', async () => {
    const uuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-1111-1111-111111111111');
    const { result } = renderHook(() =>
      useWallEngagement('sess-1', 'viewer-1', { likes: false, comments: true })
    );
    await act(async () => {
      await result.current.postComment({
        submissionId: 'sub-1',
        parentCommentId: null,
        content: '  hello  ',
        participantLabel: 'Ada',
      });
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      {
        __path:
          'db/activity_wall_sessions/sess-1/comments/11111111-1111-1111-1111-111111111111',
      },
      expect.objectContaining({
        id: '11111111-1111-1111-1111-111111111111',
        submissionId: 'sub-1',
        parentCommentId: null,
        content: 'hello',
        participantLabel: 'Ada',
        authorUid: 'viewer-1',
      })
    );
    uuidSpy.mockRestore();
  });
});
