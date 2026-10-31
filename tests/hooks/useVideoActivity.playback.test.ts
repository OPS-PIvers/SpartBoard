// Clip and notes on saveActivity's synced publish and on pullSyncedVideoActivity.
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { MockQuizDriveService } from '@/utils/mockQuizDriveService';
import type {
  QuizData,
  VideoActivityData,
  VideoActivityMetadata,
} from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: true,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({ googleAccessToken: null })),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(() => ({ isConnected: false })),
}));
vi.mock('@/hooks/useSyncedVideoActivityGroups', async (importActual) => ({
  ...(await importActual<
    typeof import('@/hooks/useSyncedVideoActivityGroups')
  >()),
  publishSyncedVideoActivity: vi.fn(),
  pullSyncedVideoActivityContent: vi.fn(),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import {
  publishSyncedVideoActivity,
  pullSyncedVideoActivityContent,
} from '@/hooks/useSyncedVideoActivityGroups';

const UID = 'teacher-uid';
const QUESTIONS = [{ id: 'q1', timestamp: 30 } as never];
const LOCAL_CLIP = { start: 5, end: 200 };
const LOCAL_NOTES = [{ id: 'mine', timestamp: 60, text: 'My note' }];
const PEER_CLIP = { start: 20, end: 100 };
const PEER_NOTES = [{ id: 'peer', timestamp: 50, text: 'Peer note' }];

const LOCAL: VideoActivityData = {
  id: 'va-1',
  title: 'Local',
  youtubeUrl: 'https://youtu.be/local',
  questions: QUESTIONS,
  clip: LOCAL_CLIP,
  notes: LOCAL_NOTES,
  createdAt: 1,
  updatedAt: 1,
};

const META: VideoActivityMetadata = {
  id: LOCAL.id,
  title: LOCAL.title,
  youtubeUrl: LOCAL.youtubeUrl,
  driveFileId: 'drive-1',
  questionCount: 1,
  createdAt: 1,
  updatedAt: 1,
  sync: { groupId: 'grp', lastSyncedVersion: 3 },
};

let saved: VideoActivityData[];
let loadSpy: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  saved = [];
  (firestore.doc as unknown as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]) => segs.join('/')
  );
  (firestore.collection as unknown as Mock).mockReturnValue({});
  (firestore.query as unknown as Mock).mockReturnValue({});
  (firestore.orderBy as unknown as Mock).mockReturnValue({});
  (firestore.onSnapshot as unknown as Mock).mockImplementation(() => vi.fn());
  (firestore.setDoc as unknown as Mock).mockResolvedValue(undefined);
  loadSpy = vi
    .spyOn(MockQuizDriveService.prototype, 'loadQuiz')
    .mockResolvedValue(LOCAL as unknown as QuizData);
  vi.spyOn(MockQuizDriveService.prototype, 'saveQuiz').mockImplementation(
    (data) => {
      saved.push(data as VideoActivityData);
      return Promise.resolve('drive-1');
    }
  );
});

const pull = async () => {
  const { result } = renderHook(() => useVideoActivity(UID));
  await act(async () => {
    await result.current.pullSyncedVideoActivity(META);
  });
  return saved[0];
};

const canonical = (extra: Record<string, unknown>) =>
  (pullSyncedVideoActivityContent as unknown as Mock).mockResolvedValue({
    title: 'Canonical',
    youtubeUrl: 'https://youtu.be/canonical',
    questions: QUESTIONS,
    version: 5,
    ...extra,
  });

describe('pullSyncedVideoActivity — clip and notes', () => {
  it("takes the canonical clip and notes over the teacher's own", async () => {
    canonical({ clip: PEER_CLIP, notes: PEER_NOTES });
    const refreshed = await pull();
    expect(refreshed.clip).toEqual(PEER_CLIP);
    expect(refreshed.notes).toEqual(PEER_NOTES);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('clears them when a peer published none', async () => {
    canonical({ notes: [] });
    const refreshed = await pull();
    expect(refreshed).not.toHaveProperty('clip');
    expect(refreshed).not.toHaveProperty('notes');
  });

  it('keeps the local clip and notes when the canonical doc predates synced playback', async () => {
    canonical({});
    const refreshed = await pull();
    expect(refreshed.clip).toEqual(LOCAL_CLIP);
    expect(refreshed.notes).toEqual(LOCAL_NOTES);
  });
});

describe('saveActivity — publishes clip and notes', () => {
  it('forwards the clip and notes to the synced publish', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => META,
    });
    (publishSyncedVideoActivity as unknown as Mock).mockResolvedValue({
      version: 4,
    });
    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(LOCAL, META.driveFileId);
    });
    expect(publishSyncedVideoActivity).toHaveBeenCalledWith(
      'grp',
      expect.objectContaining({ clip: LOCAL_CLIP, notes: LOCAL_NOTES })
    );
  });
});
