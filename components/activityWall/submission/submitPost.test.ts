import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityWallSession, ActivityWallSubmission } from '@/types';
import {
  EMPTY_DRAFT,
  PostSubmitError,
  availableTypes,
  capExhausted,
  createPost,
  deletePost,
  draftFromPost,
  nextCappedSlot,
  placementFromPost,
  updatePost,
} from './submitPost';

const {
  mockSetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockUpload,
  mockDeleteObject,
} = vi.hoisted(() => ({
  mockSetDoc:
    vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(),
  mockUpdateDoc:
    vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(),
  mockDeleteDoc: vi.fn(),
  mockUpload: vi.fn(),
  mockDeleteObject: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ kind: 'collection', args }),
  doc: (...args: unknown[]) => ({ kind: 'doc', args }),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
}));
vi.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => ({ kind: 'ref', args }),
  uploadBytesResumable: mockUpload,
  deleteObject: mockDeleteObject,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: { domain: 'ex.com' } }),
}));

const session = (
  overrides: Partial<ActivityWallSession> = {}
): ActivityWallSession => ({
  id: 't_a',
  activityId: 'a',
  teacherUid: 't',
  title: 'W',
  prompt: 'P',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  updatedAt: 1,
  layout: 'wall',
  ...overrides,
});

const post = (
  overrides: Partial<ActivityWallSubmission> = {}
): ActivityWallSubmission => ({
  id: 'u__0',
  content: 'c',
  submittedAt: 1,
  status: 'approved',
  ...overrides,
});

const base = {
  uid: 'u',
  isGuest: false,
  participantLabel: 'Sam',
  myPosts: [] as ActivityWallSubmission[],
};

const written = () => mockSetDoc.mock.calls[0][1];

describe('submitPost helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockDeleteObject.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
      (arr: ArrayBufferView) => {
        new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).fill(0);
        return arr;
      }
    );
  });

  it('availableTypes always includes text and follows allowedTypes', () => {
    expect(availableTypes(session())).toEqual(['text']);
    expect(
      availableTypes(
        session({
          allowedTypes: { photo: true, link: true, file: false, video: true },
        })
      )
    ).toEqual(['text', 'photo', 'link', 'video']);
  });

  it('nextCappedSlot picks the lowest free numeric slot and ignores uncapped ids', () => {
    expect(nextCappedSlot('u', [post({ id: 'u__0' })], 3)).toBe('u__1');
    expect(
      nextCappedSlot('u', [post({ id: 'u__0' }), post({ id: 'u__1' })], 2)
    ).toBeNull();
    expect(nextCappedSlot('u', [post({ id: 'u__AbCdEfGhIj' })], 2)).toBe(
      'u__0'
    );
    expect(capExhausted(session(), 'u', [post(), post()])).toBe(false);
    expect(
      capExhausted(session({ maxPostsPerStudent: 1 }), 'u', [
        post({ id: 'u__AbCdEfGhIj' }),
      ])
    ).toBe(true);
  });

  it('draftFromPost / placementFromPost seed an edit', () => {
    const source = post({
      type: 'link',
      content: 'https://x.y',
      title: 'T',
      cellKey: 'r|c',
      lat: 1,
      lng: 2,
      order: 5,
      label: 'L',
    });
    expect(draftFromPost(source)).toMatchObject({
      type: 'link',
      url: 'https://x.y',
      body: '',
      title: 'T',
      label: 'L',
    });
    expect(placementFromPost(source)).toEqual({
      cellKey: 'r|c',
      lat: 1,
      lng: 2,
      order: 5,
    });
  });

  describe('createPost payloads', () => {
    it('columns: writes sectionId with an uncapped id when there is no cap', async () => {
      const id = await createPost({
        ...base,
        session: session({ layout: 'columns' }),
        draft: { ...EMPTY_DRAFT, body: ' hello ', title: 'Hi' },
        placement: { sectionId: 'sec-1' },
      });
      expect(id).toBe('u__AAAAAAAAAA');
      expect(written()).toEqual({
        id: 'u__AAAAAAAAAA',
        activityId: 'a',
        type: 'text',
        content: 'hello',
        authorUid: 'u',
        isGuest: false,
        participantLabel: 'Sam',
        submittedAt: expect.any(Number) as number,
        status: 'approved',
        title: 'Hi',
        sectionId: 'sec-1',
      });
    });

    it('table: writes cellKey and uses the capped slot id, pending under moderation', async () => {
      await createPost({
        ...base,
        myPosts: [post({ id: 'u__0' })],
        session: session({
          layout: 'table',
          maxPostsPerStudent: 3,
          moderationEnabled: true,
        }),
        draft: { ...EMPTY_DRAFT, body: 'x' },
        placement: { cellKey: 'r1|c2' },
      });
      expect(written()).toMatchObject({
        id: 'u__1',
        cellKey: 'r1|c2',
        status: 'pending',
      });
      expect(written()).not.toHaveProperty('sectionId');
    });

    it('timeline: uses the placement order when given, else now, plus the label', async () => {
      await createPost({
        ...base,
        session: session({ layout: 'timeline' }),
        draft: { ...EMPTY_DRAFT, body: 'x', label: ' 1800s ' },
        placement: { order: 42 },
      });
      expect(written()).toMatchObject({ order: 42, label: '1800s' });

      mockSetDoc.mockClear();
      await createPost({
        ...base,
        session: session({ layout: 'timeline' }),
        draft: { ...EMPTY_DRAFT, body: 'x' },
        placement: {},
      });
      expect(typeof written().order).toBe('number');
      expect(written()).not.toHaveProperty('label');
    });

    it('teacher: lands approved under moderation, skips the cap, stamps authorRole', async () => {
      await createPost({
        ...base,
        session: session({ moderationEnabled: true, maxPostsPerStudent: 1 }),
        myPosts: [
          {
            id: base.uid + '__0',
            content: 'a',
            submittedAt: 1,
            status: 'approved',
          },
        ],
        draft: { ...EMPTY_DRAFT, body: 'From the teacher' },
        placement: {},
        author: 'teacher',
      });
      expect(written()).toMatchObject({
        status: 'approved',
        authorRole: 'teacher',
        content: 'From the teacher',
      });
      expect(String(written().id)).not.toMatch(/__[0-9]{1,3}$/);
    });

    it('map: writes lat/lng and refuses without a pin', async () => {
      await expect(
        createPost({
          ...base,
          session: session({ layout: 'map' }),
          draft: { ...EMPTY_DRAFT, body: 'x' },
          placement: {},
        })
      ).rejects.toBeInstanceOf(PostSubmitError);
      expect(mockSetDoc).not.toHaveBeenCalled();

      await createPost({
        ...base,
        session: session({ layout: 'map' }),
        draft: { ...EMPTY_DRAFT, body: 'x' },
        placement: { lat: 10, lng: -20 },
      });
      expect(written()).toMatchObject({ lat: 10, lng: -20 });
    });

    it('wordcloud: posts a word and drops the title', async () => {
      await createPost({
        ...base,
        session: session({ layout: 'wordcloud' }),
        draft: { ...EMPTY_DRAFT, word: ' spark ', title: 'ignored' },
        placement: {},
      });
      expect(written()).toMatchObject({ type: 'word', content: 'spark' });
      expect(written()).not.toHaveProperty('title');
    });

    it('link: attaches a YouTube preview without calling the function', async () => {
      await createPost({
        ...base,
        session: session(),
        draft: {
          ...EMPTY_DRAFT,
          type: 'link',
          url: 'https://youtu.be/abc123',
        },
        placement: {},
      });
      expect(written()).toMatchObject({
        type: 'link',
        content: 'https://youtu.be/abc123',
        linkPreview: { domain: 'youtube.com', title: 'YouTube abc123' },
      });
    });

    it('rejects with a student-facing error when the cap is exhausted', async () => {
      await expect(
        createPost({
          ...base,
          myPosts: [post({ id: 'u__0' })],
          session: session({ maxPostsPerStudent: 1 }),
          draft: { ...EMPTY_DRAFT, body: 'x' },
          placement: {},
        })
      ).rejects.toThrow(/used all of your posts/i);
    });

    it('uploads media, reports progress, and removes the orphan when the write fails', async () => {
      const progress: number[] = [];
      mockUpload.mockImplementation(() => ({
        on: (
          _event: string,
          next: (snap: {
            bytesTransferred: number;
            totalBytes: number;
          }) => void,
          _error: unknown,
          complete: () => void
        ) => {
          next({ bytesTransferred: 5, totalBytes: 10 });
          complete();
        },
      }));
      mockSetDoc.mockRejectedValueOnce(new Error('denied'));

      await expect(
        createPost({
          ...base,
          session: session({
            allowedTypes: {
              photo: true,
              link: false,
              file: false,
              video: false,
            },
          }),
          draft: {
            ...EMPTY_DRAFT,
            type: 'photo',
            file: new File(['d'], 'a b.png', { type: 'image/png' }),
          },
          placement: {},
          onProgress: (percent) => progress.push(percent),
        })
      ).rejects.toThrow('denied');

      expect(progress).toEqual([50]);
      expect(written()).toMatchObject({
        type: 'photo',
        content: 'activity_wall_media/t_a/u__AAAAAAAAAA/a_b.png',
        storagePath: 'activity_wall_media/t_a/u__AAAAAAAAAA/a_b.png',
        archiveStatus: 'firebase',
        fileName: 'a_b.png',
        mimeType: 'image/png',
        sizeBytes: 1,
      });
      expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    });
  });

  it('updatePost patches only student-editable fields', async () => {
    await updatePost(
      session({ layout: 'timeline' }),
      'u__0',
      { ...EMPTY_DRAFT, body: ' new ', title: 'T', label: 'L' },
      { order: 99 }
    );
    const patch = mockUpdateDoc.mock.calls[0][1];
    expect(patch).toEqual({
      editedAt: expect.any(Number) as number,
      content: 'new',
      title: 'T',
      label: 'L',
    });

    mockUpdateDoc.mockClear();
    await updatePost(
      session({ layout: 'map' }),
      'u__0',
      { ...EMPTY_DRAFT, type: 'photo', title: 'Cap' },
      { lat: 1, lng: 2 }
    );
    expect(mockUpdateDoc.mock.calls[0][1]).toEqual({
      editedAt: expect.any(Number) as number,
      title: 'Cap',
      lat: 1,
      lng: 2,
    });
  });

  it('deletePost targets the submission doc', async () => {
    await deletePost('t_a', 'u__0');
    expect(mockDeleteDoc).toHaveBeenCalledWith({
      kind: 'doc',
      args: [{}, 'activity_wall_sessions', 't_a', 'submissions', 'u__0'],
    });
  });
});
