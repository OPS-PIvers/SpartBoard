import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockGetDocs, mockGetDownloadURL } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockGetDownloadURL: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...path: string[]) => path.join('/'),
  doc: (...path: string[]) => path.join('/'),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
}));

vi.mock('firebase/storage', () => ({
  getDownloadURL: mockGetDownloadURL,
  ref: (_storage: unknown, path: string) => path,
}));

vi.mock('@/config/firebase', () => ({ db: {}, storage: {} }));

const { wallPostsReader } = await import('@/utils/subShareWallPosts');

const wall = (mode = 'text') => ({
  exists: () => true,
  id: 'wall-1',
  data: () => ({ id: 'wall-1', title: 'Exit tickets', mode }),
});

const submissions = (docs: Record<string, unknown>[]) => ({
  docs: docs.map((data) => ({ id: data.id as string, data: () => data })),
});

describe('wallPostsReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue(wall());
  });

  it('is absent without a signed-in teacher', () => {
    expect(wallPostsReader(undefined)).toBeUndefined();
  });

  it('reads only the approved posts', async () => {
    mockGetDocs.mockResolvedValue(
      submissions([
        { id: 'p1', content: 'Ada', submittedAt: 1, status: 'approved' },
        { id: 'p2', content: 'Bo', submittedAt: 2, status: 'pending' },
      ])
    );

    const posts = (await wallPostsReader('teacher-1')?.('wall-1')) as {
      id: string;
    }[];

    expect(posts.map((p) => p.id)).toEqual(['p1']);
  });

  // Storage keeps a wall upload to the teacher and the student who posted it,
  // so the sub gets a download URL resolved here instead of the path.
  it('swaps an upload’s Storage path for a download URL', async () => {
    mockGetDocs.mockResolvedValue(
      submissions([
        {
          id: 'p1',
          content: 'activity_wall_media/s/p1/photo.png',
          submittedAt: 1,
          status: 'approved',
          type: 'photo',
        },
      ])
    );
    mockGetDownloadURL.mockResolvedValue('https://storage/photo.png?token=t');

    const posts = (await wallPostsReader('teacher-1')?.('wall-1')) as {
      storagePath?: string;
    }[];

    expect(posts[0].storagePath).toBe('https://storage/photo.png?token=t');
  });

  it('leaves a post alone when its upload will not resolve', async () => {
    mockGetDocs.mockResolvedValue(
      submissions([
        {
          id: 'p1',
          content: 'activity_wall_media/s/p1/photo.png',
          submittedAt: 1,
          status: 'approved',
          type: 'photo',
        },
      ])
    );
    mockGetDownloadURL.mockRejectedValue(new Error('403'));

    const posts = (await wallPostsReader('teacher-1')?.('wall-1')) as {
      storagePath?: string;
      content: string;
    }[];

    expect(posts[0].storagePath).toBeUndefined();
    expect(posts[0].content).toBe('activity_wall_media/s/p1/photo.png');
  });

  it('reads no Storage for a post already archived to Drive', async () => {
    mockGetDocs.mockResolvedValue(
      submissions([
        {
          id: 'p1',
          content: 'activity_wall_media/s/p1/photo.png',
          submittedAt: 1,
          status: 'approved',
          type: 'photo',
          driveFileId: 'file-1',
          driveUrl: 'https://drive/file-1',
        },
      ])
    );

    await wallPostsReader('teacher-1')?.('wall-1');

    expect(mockGetDownloadURL).not.toHaveBeenCalled();
  });

  it('throws when the wall is gone, so the teacher is told', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(wallPostsReader('teacher-1')?.('wall-1')).rejects.toThrow(
      /not found/
    );
  });
});
