// Clip and notes threading through the synced Video Activity canonical doc, its version snapshots and restore.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import {
  buildVideoActivityVersionContent,
  createSyncedVideoActivityGroup,
  publishSyncedVideoActivity,
  pullSyncedVideoActivityContent,
  restoreSyncedVideoActivityVersion,
} from '@/hooks/useSyncedVideoActivityGroups';
import type { VideoActivityQuestion } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const GROUP_ID = 'va-group-playback';
const UID = 'teacher-uid';
const DELETE = { __delete: true };

const QUESTIONS = [
  { id: 'q1', timestamp: 30 } as unknown as VideoActivityQuestion,
];
const CLIP = { start: 10, end: 90 };
const NOTES = [{ id: 'n1', timestamp: 40, text: 'Watch the graph' }];
const BLANK_NOTE = { id: 'n2', timestamp: 50, text: '  ' };

const baseGroup = (overrides: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  version: 2,
  title: 'VA',
  youtubeUrl: 'https://youtu.be/abc',
  questions: QUESTIONS,
  participants: { [UID]: { joinedAt: 1 } },
  createdAt: 1,
  updatedAt: 1,
  updatedBy: UID,
  ...overrides,
});

const snap = (data: unknown) => ({ exists: () => true, data: () => data });

let txUpdates: Record<string, unknown>[];
let currentGroup: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  txUpdates = [];
  currentGroup = baseGroup();
  (firestore.doc as unknown as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]) => segs.join('/')
  );
  (firestore.deleteField as unknown as Mock).mockReturnValue(DELETE);
  (firestore.setDoc as unknown as Mock).mockResolvedValue(undefined);
  (firestore.getDocs as unknown as Mock).mockResolvedValue({ docs: [] });
  (firestore.runTransaction as unknown as Mock).mockImplementation(
    async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: vi.fn().mockResolvedValue(snap(currentGroup)),
        update: vi.fn((_ref: unknown, patch: Record<string, unknown>) => {
          txUpdates.push(patch);
        }),
      })
  );
});

const publish = (extra: Record<string, unknown>) =>
  publishSyncedVideoActivity(GROUP_ID, {
    title: 'VA',
    youtubeUrl: 'https://youtu.be/abc',
    questions: QUESTIONS,
    expectedVersion: 2,
    uid: UID,
    ...extra,
  });

const setDocPayload = (path: string) =>
  (firestore.setDoc as unknown as Mock).mock.calls.find(
    ([ref]) => ref === path
  )?.[1] as Record<string, unknown> | undefined;

describe('createSyncedVideoActivityGroup', () => {
  it('writes the clip and non-blank notes', async () => {
    await createSyncedVideoActivityGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'VA',
      youtubeUrl: 'u',
      questions: QUESTIONS,
      clip: CLIP,
      notes: [...NOTES, BLANK_NOTE],
    });
    const payload = setDocPayload(`synced_video_activities/${GROUP_ID}`);
    expect(payload).toMatchObject({ clip: CLIP, notes: NOTES });
  });

  it('writes empty notes and no clip key when the activity has neither', async () => {
    await createSyncedVideoActivityGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'VA',
      youtubeUrl: 'u',
      questions: QUESTIONS,
      clip: undefined,
      notes: undefined,
    });
    const payload = setDocPayload(`synced_video_activities/${GROUP_ID}`);
    expect(payload?.notes).toEqual([]);
    expect(payload).not.toHaveProperty('clip');
  });
});

describe('publishSyncedVideoActivity', () => {
  it('publishes the clip and notes', async () => {
    await publish({ clip: CLIP, notes: NOTES });
    expect(txUpdates[0]).toMatchObject({ clip: CLIP, notes: NOTES });
  });

  it('deletes the canonical clip and empties notes when the teacher cleared them', async () => {
    currentGroup = baseGroup({ clip: CLIP, notes: NOTES });
    await publish({});
    expect(txUpdates[0]).toMatchObject({ clip: DELETE, notes: [] });
  });

  it('leaves the canonical clip and notes alone with keepPlayback', async () => {
    await publish({ keepPlayback: true });
    expect(txUpdates[0]).not.toHaveProperty('clip');
    expect(txUpdates[0]).not.toHaveProperty('notes');
  });

  it('snapshots the pre-edit clip and notes', async () => {
    currentGroup = baseGroup({ clip: CLIP, notes: NOTES });
    await publish({});
    await vi.waitFor(() =>
      expect(
        setDocPayload(`synced_video_activities/${GROUP_ID}/versions/2`)
      ).toBeDefined()
    );
    expect(
      setDocPayload(`synced_video_activities/${GROUP_ID}/versions/2`)?.content
    ).toMatchObject({ clip: CLIP, notes: NOTES });
  });
});

describe('buildVideoActivityVersionContent', () => {
  it('omits clip and notes for a canonical doc that predates synced playback', () => {
    const content = buildVideoActivityVersionContent(baseGroup({ clip: CLIP }));
    expect(content).not.toHaveProperty('clip');
    expect(content).not.toHaveProperty('notes');
  });

  it('keeps empty notes so restore can clear playback', () => {
    expect(
      buildVideoActivityVersionContent(baseGroup({ notes: [] }) as never)
    ).toMatchObject({ notes: [] });
  });
});

describe('pullSyncedVideoActivityContent', () => {
  it('returns the clip and notes', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce(
      snap(baseGroup({ clip: CLIP, notes: NOTES }))
    );
    const result = await pullSyncedVideoActivityContent(GROUP_ID);
    expect(result.clip).toEqual(CLIP);
    expect(result.notes).toEqual(NOTES);
  });

  it('leaves both out for a doc that predates synced playback', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce(
      snap(baseGroup())
    );
    const result = await pullSyncedVideoActivityContent(GROUP_ID);
    expect(result).not.toHaveProperty('clip');
    expect(result).not.toHaveProperty('notes');
  });
});

describe('restoreSyncedVideoActivityVersion', () => {
  const restoreFrom = async (content: Record<string, unknown>) => {
    (firestore.getDoc as unknown as Mock)
      .mockResolvedValueOnce(
        snap({ version: 1, content, savedBy: UID, savedAt: 1 })
      )
      .mockResolvedValueOnce(snap(currentGroup));
    await restoreSyncedVideoActivityVersion(GROUP_ID, 1, UID);
  };
  const base = { title: 'Old', youtubeUrl: 'u', questions: QUESTIONS };

  it("restores the snapshot's clip and notes", async () => {
    await restoreFrom({ ...base, clip: CLIP, notes: NOTES });
    expect(txUpdates[0]).toMatchObject({ clip: CLIP, notes: NOTES });
  });

  it('keeps the canonical clip and notes for a snapshot without them', async () => {
    currentGroup = baseGroup({ clip: CLIP, notes: NOTES });
    await restoreFrom(base);
    expect(txUpdates[0]).not.toHaveProperty('clip');
    expect(txUpdates[0]).not.toHaveProperty('notes');
  });
});
