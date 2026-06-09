import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import type {
  SharedVideoActivityAssignment,
  VideoActivityAssignmentSettings,
  VideoActivityMetadata,
  VideoActivitySession,
  VideoActivitySessionOptions,
} from '@/types';

// Sentinel object returned by the mocked `deleteField()` so the
// rollback test can assert the correct sentinel was passed (rather than
// a literal `null`, which Firestore would persist as a phantom field).
const DELETE_FIELD_SENTINEL = { __deleteFieldSentinel: true };

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD_SENTINEL),
  doc: vi.fn(),
  documentId: vi.fn(() => '__documentId'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

// Sync-group cloud function shims — mocked so `shareAssignment` / `import…`
// don't try to write to a real Firestore or fire an httpsCallable.
const mockCallJoin = vi.fn();
const mockCallLeave = vi.fn();
const mockCreateGroup = vi.fn();
const mockPullContent = vi.fn();
vi.mock('@/hooks/useSyncedVideoActivityGroups', () => ({
  callJoinSyncedVideoActivityGroup: (shareId: string): unknown =>
    mockCallJoin(shareId) as unknown,
  callLeaveSyncedVideoActivityGroup: (groupId: string): unknown =>
    mockCallLeave(groupId) as unknown,
  createSyncedVideoActivityGroup: (input: unknown): unknown =>
    mockCreateGroup(input) as unknown,
  pullSyncedVideoActivityContent: (groupId: string): unknown =>
    mockPullContent(groupId) as unknown,
}));

const mockAddDoc = addDoc as Mock;
const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockGetDocs = getDocs as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockWriteBatch = writeBatch as Mock;

const TEACHER_UID = 'teacher-1';

const ACTIVITY = {
  id: 'activity-1',
  title: 'Why does the sun shine?',
  driveFileId: 'drive-1',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  questions: [],
};

function makeSessionOptions(
  overrides: Partial<VideoActivitySessionOptions> = {}
): VideoActivitySessionOptions {
  return {
    tabWarningsEnabled: true,
    showResultToStudent: true,
    showCorrectAnswerToStudent: true,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    attemptLimit: 2,
    rewindOnIncorrectSeconds: 30,
    pointPenaltyOnIncorrect: 1,
    scoreVisibility: 'score-and-responses',
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<VideoActivityAssignmentSettings> = {}
): VideoActivityAssignmentSettings {
  return {
    className: 'Period 1',
    sessionSettings: {
      autoPlay: true,
      requireCorrectAnswer: false,
      allowSkipping: false,
    },
    ...overrides,
  } as VideoActivityAssignmentSettings;
}

describe('useVideoActivityAssignments — createAssignment persists sessionOptions', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    batchSet.mockReset();
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('writes sessionOptions onto BOTH the assignment doc and the session doc', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const sessionOptions = makeSessionOptions();
    const settings = makeSettings({ sessionOptions });

    await act(async () => {
      await result.current.createAssignment(ACTIVITY, settings);
    });

    expect(batchSet).toHaveBeenCalledTimes(2);

    // First batch.set is the assignment doc; second is the session doc.
    const assignmentPayload = batchSet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    const sessionPayload = batchSet.mock.calls[1][1] as VideoActivitySession;

    expect(assignmentPayload.sessionOptions).toEqual(sessionOptions);
    expect(sessionPayload.sessionOptions).toEqual(sessionOptions);
  });

  it('omits sessionOptions field entirely when not provided (legacy callers)', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const settings = makeSettings();

    await act(async () => {
      await result.current.createAssignment(ACTIVITY, settings);
    });

    const assignmentPayload = batchSet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    const sessionPayload = batchSet.mock.calls[1][1] as Record<string, unknown>;

    expect('sessionOptions' in assignmentPayload).toBe(false);
    expect('sessionOptions' in sessionPayload).toBe(false);
  });

  it('persists scoreVisibility and periodNames on the assignment when provided', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const settings = makeSettings({
      scoreVisibility: 'score-responses-and-answers',
      periodNames: ['Period 1', 'Period 2'],
    });

    await act(async () => {
      await result.current.createAssignment(ACTIVITY, settings);
    });

    const assignmentPayload = batchSet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(assignmentPayload.scoreVisibility).toBe(
      'score-responses-and-answers'
    );
    expect(assignmentPayload.periodNames).toEqual(['Period 1', 'Period 2']);
  });
});

describe('useVideoActivityAssignments — updateAssignmentSettings mirrors policy options to session', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: vi.fn(),
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('mirrors a sessionOptions patch to the session doc', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const sessionOptions = makeSessionOptions({ attemptLimit: 5 });

    await act(async () => {
      await result.current.updateAssignmentSettings('assignment-1', {
        sessionOptions,
      });
    });

    // Two updates: assignment doc + session doc.
    expect(batchUpdate).toHaveBeenCalledTimes(2);

    const sessionDocPath = batchUpdate.mock.calls[1][0] as string;
    const sessionPatch = batchUpdate.mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(sessionDocPath).toContain('video_activity_sessions/assignment-1');
    expect(sessionPatch).toEqual({ sessionOptions, updatedBy: TEACHER_UID });
  });

  it('mirrors className to the session doc as assignmentName', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );

    await act(async () => {
      await result.current.updateAssignmentSettings('assignment-1', {
        className: 'Period 2 Renamed',
      });
    });

    // Both the assignment doc AND the session doc get updated so the
    // student-side picker label tracks renames in real time.
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    const sessionPatch = batchUpdate.mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(sessionPatch).toEqual({
      assignmentName: 'Period 2 Renamed',
      updatedBy: TEACHER_UID,
    });
  });

  it('mirrors periodNames to the session doc', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );

    await act(async () => {
      await result.current.updateAssignmentSettings('assignment-1', {
        periodNames: ['Period 3', 'Period 4'],
      });
    });

    expect(batchUpdate).toHaveBeenCalledTimes(2);
    const sessionPatch = batchUpdate.mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(sessionPatch).toEqual({
      periodNames: ['Period 3', 'Period 4'],
      updatedBy: TEACHER_UID,
    });
  });

  it('does not touch the session doc when no student-visible field changes', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );

    await act(async () => {
      // `scoreVisibility` and `scorePublishedAt` are teacher-only metadata —
      // they live on the assignment archive doc but never need to flow to
      // the session doc, so the session-update branch should stay quiet.
      await result.current.updateAssignmentSettings('assignment-1', {
        scoreVisibility: 'score-only',
        scorePublishedAt: 1700000000000,
      });
    });

    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('useVideoActivityAssignments — shareAssignment + import', () => {
  const batchSet = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, name: string) => name);
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchSet.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: batchCommit,
    });
    mockAddDoc.mockReset();
    mockUpdateDoc.mockReset().mockResolvedValue(undefined);
    mockCreateGroup.mockReset().mockResolvedValue(undefined);
    mockCallJoin.mockReset();
    mockCallLeave.mockReset().mockResolvedValue({ remainingParticipants: 0 });
    mockPullContent.mockReset();
  });

  const ACTIVITY_DATA = {
    id: 'activity-1',
    title: 'Photosynthesis',
    youtubeUrl: 'https://youtube.com/watch?v=abc',
    questions: [],
    createdAt: 100,
    updatedAt: 200,
  };

  function seedAssignmentSnap(overrides: Record<string, unknown> = {}): {
    exists: () => boolean;
    data: () => Record<string, unknown>;
  } {
    return {
      exists: () => true,
      data: () => ({
        id: 'assign-1',
        activityId: 'activity-1',
        teacherUid: TEACHER_UID,
        sessionSettings: {
          autoPlay: false,
          requireCorrectAnswer: true,
          allowSkipping: false,
        },
        ...overrides,
      }),
    };
  }

  function seedMetadataSnap(overrides: Record<string, unknown> = {}): {
    exists: () => boolean;
    data: () => Record<string, unknown>;
  } {
    return {
      exists: () => true,
      data: () => ({
        id: 'activity-1',
        title: 'Photosynthesis',
        youtubeUrl: 'https://youtube.com/watch?v=abc',
        driveFileId: 'drive-1',
        questionCount: 0,
        createdAt: 100,
        updatedAt: 100,
        ...overrides,
      }),
    };
  }

  it('shareAssignment auto-creates a synced group when source has none', async () => {
    mockGetDoc
      .mockResolvedValueOnce(seedAssignmentSnap())
      .mockResolvedValueOnce(seedMetadataSnap());
    mockAddDoc.mockResolvedValue({ id: 'share-abc' });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    let url = '';
    await act(async () => {
      url = await result.current.shareAssignment('assign-1', ACTIVITY_DATA);
    });

    // 1) Synced group was minted with the sharer as sole participant.
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    const groupArg = mockCreateGroup.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(groupArg.uid).toBe(TEACHER_UID);
    expect(groupArg.title).toBe('Photosynthesis');
    expect(typeof groupArg.groupId).toBe('string');

    // 2) Local metadata patched with the new linkage.
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const linkagePatch = mockUpdateDoc.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    const sync = linkagePatch.sync as {
      groupId: string;
      lastSyncedVersion: number;
    };
    expect(sync.groupId).toBe(groupArg.groupId);
    expect(sync.lastSyncedVersion).toBe(1);

    // 3) Share doc carries the syncGroupId so importers can pick Synced.
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const sharePayload = mockAddDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(sharePayload.originalAuthor).toBe(TEACHER_UID);
    expect(sharePayload.syncGroupId).toBe(groupArg.groupId);
    expect(url).toContain('/share/video-activity/share-abc');
  });

  it('shareAssignment reuses an existing syncGroupId when source already has one', async () => {
    mockGetDoc
      .mockResolvedValueOnce(seedAssignmentSnap())
      .mockResolvedValueOnce(
        seedMetadataSnap({
          sync: { groupId: 'existing-group', lastSyncedVersion: 3 },
        })
      );
    mockAddDoc.mockResolvedValue({ id: 'share-xyz' });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.shareAssignment('assign-1', ACTIVITY_DATA);
    });

    // Existing group reused — no new createSyncedGroup, no metadata patch.
    expect(mockCreateGroup).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    const sharePayload = mockAddDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(sharePayload.syncGroupId).toBe('existing-group');
  });

  it('shareAssignment throws when source activity is missing from local library', async () => {
    mockGetDoc
      .mockResolvedValueOnce(seedAssignmentSnap())
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await expect(
      result.current.shareAssignment('assign-1', ACTIVITY_DATA)
    ).rejects.toThrow(/Source activity is missing/);
  });

  it('shareAssignment rolls back the metadata sync linkage when addDoc fails', async () => {
    // Source activity has no synced linkage — so we mint one, then addDoc fails.
    mockGetDoc
      .mockResolvedValueOnce(seedAssignmentSnap())
      .mockResolvedValueOnce(seedMetadataSnap());
    mockAddDoc.mockRejectedValue(new Error('share write denied'));

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await expect(
      result.current.shareAssignment('assign-1', ACTIVITY_DATA)
    ).rejects.toThrow(/share write denied/);

    // updateDoc was called twice: once to attach the freshly-minted linkage,
    // once to roll it back after addDoc failed. The rollback uses Firestore's
    // `deleteField()` sentinel (not a literal `null`) so the field is
    // actually removed from the doc — `null` would be persisted as a
    // phantom value. Without the rollback the local meta would carry a
    // `sync.groupId` pointing at a group with no matching share doc —
    // same race the Quiz hook has documented.
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    const rollbackPatch = mockUpdateDoc.mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(rollbackPatch.sync).toBe(DELETE_FIELD_SENTINEL);
  });

  it('shareAssignment does NOT roll back metadata when source already had a syncGroupId', async () => {
    // Pre-existing linkage means we never minted one, so a downstream
    // addDoc failure shouldn't clear what predates this share call.
    mockGetDoc
      .mockResolvedValueOnce(seedAssignmentSnap())
      .mockResolvedValueOnce(
        seedMetadataSnap({
          sync: { groupId: 'pre-existing', lastSyncedVersion: 5 },
        })
      );
    mockAddDoc.mockRejectedValue(new Error('share write denied'));

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await expect(
      result.current.shareAssignment('assign-1', ACTIVITY_DATA)
    ).rejects.toThrow(/share write denied/);

    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('peekSharedAssignment returns null for missing shareId', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => ({}),
    });
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const out = await result.current.peekSharedAssignment('nope');
    expect(out).toBeNull();
  });

  it('importSharedAssignment in copy mode does not call sync-group join', async () => {
    const sharedDoc: SharedVideoActivityAssignment = {
      id: 'share-1',
      title: 'Shared Activity',
      youtubeUrl: 'https://youtube.com/watch?v=def',
      questions: [],
      createdAt: 100,
      updatedAt: 200,
      assignmentSettings: {
        sessionSettings: {
          autoPlay: false,
          requireCorrectAnswer: true,
          allowSkipping: false,
        },
      },
      originalAuthor: 'teacher-A',
      sharedAt: 300,
      syncGroupId: 'group-x',
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });

    const newMeta: VideoActivityMetadata = {
      id: 'imported-activity',
      title: 'Shared Activity',
      youtubeUrl: 'https://youtube.com/watch?v=def',
      driveFileId: 'imported-drive',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const saveActivity = vi.fn().mockResolvedValue(newMeta);

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.importSharedAssignment('share-1', {
        mode: 'copy',
        saveActivity,
      });
    });
    expect(saveActivity).toHaveBeenCalledTimes(1);
    expect(mockCallJoin).not.toHaveBeenCalled();
    expect(mockPullContent).not.toHaveBeenCalled();
  });

  it('importSharedAssignment in sync mode joins the group and attaches linkage', async () => {
    const sharedDoc: SharedVideoActivityAssignment = {
      id: 'share-2',
      title: 'Synced Activity',
      youtubeUrl: 'https://youtube.com/watch?v=ghi',
      questions: [],
      createdAt: 100,
      updatedAt: 200,
      assignmentSettings: {
        sessionSettings: {
          autoPlay: false,
          requireCorrectAnswer: true,
          allowSkipping: false,
        },
      },
      originalAuthor: 'teacher-A',
      sharedAt: 300,
      syncGroupId: 'group-sync',
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });
    mockCallJoin.mockResolvedValue({
      groupId: 'group-sync',
      version: 7,
      alreadyJoined: false,
    });
    mockPullContent.mockResolvedValue({
      title: 'Synced Activity',
      youtubeUrl: 'https://youtube.com/watch?v=ghi',
      questions: [],
      version: 7,
    });

    const newMeta: VideoActivityMetadata = {
      id: 'imported-2',
      title: 'Synced Activity',
      youtubeUrl: 'https://youtube.com/watch?v=ghi',
      driveFileId: 'imported-drive-2',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const saveActivity = vi.fn().mockResolvedValue(newMeta);
    const attachSyncLinkage = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.importSharedAssignment('share-2', {
        mode: 'sync',
        saveActivity,
        attachSyncLinkage,
      });
    });

    expect(mockCallJoin).toHaveBeenCalledWith('share-2');
    expect(mockPullContent).toHaveBeenCalledWith('group-sync');
    expect(attachSyncLinkage).toHaveBeenCalledWith('imported-2', {
      groupId: 'group-sync',
      lastSyncedVersion: 7,
    });
  });

  it('importSharedAssignment rolls back the synced-group join when downstream save fails', async () => {
    const sharedDoc: SharedVideoActivityAssignment = {
      id: 'share-3',
      title: 'Failing import',
      youtubeUrl: 'https://youtube.com/watch?v=jkl',
      questions: [],
      createdAt: 100,
      updatedAt: 200,
      assignmentSettings: {
        sessionSettings: {
          autoPlay: false,
          requireCorrectAnswer: true,
          allowSkipping: false,
        },
      },
      originalAuthor: 'teacher-A',
      sharedAt: 300,
      syncGroupId: 'group-fail',
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });
    mockCallJoin.mockResolvedValue({
      groupId: 'group-fail',
      version: 1,
      alreadyJoined: false,
    });
    mockPullContent.mockRejectedValue(new Error('canonical fetch failed'));

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await expect(
      result.current.importSharedAssignment('share-3', {
        mode: 'sync',
        saveActivity: vi
          .fn<
            (
              activity: import('@/types').VideoActivityData
            ) => Promise<VideoActivityMetadata>
          >()
          .mockResolvedValue({
            id: 'imported-3',
            title: 'Failing import',
            youtubeUrl: 'https://youtube.com/watch?v=jkl',
            driveFileId: 'd',
            questionCount: 0,
            createdAt: 1,
            updatedAt: 1,
          }),
      })
    ).rejects.toThrow(/canonical fetch failed/);
    // Rollback fired so the importer doesn't accumulate orphan participation.
    expect(mockCallLeave).toHaveBeenCalledWith('group-fail');
  });

  it('importSharedAssignment rolls back the synced-group join when attachSyncLinkage fails', async () => {
    const sharedDoc: SharedVideoActivityAssignment = {
      id: 'share-4',
      title: 'Linkage-attach failure',
      youtubeUrl: 'https://youtube.com/watch?v=mno',
      questions: [],
      createdAt: 100,
      updatedAt: 200,
      assignmentSettings: {
        sessionSettings: {
          autoPlay: false,
          requireCorrectAnswer: true,
          allowSkipping: false,
        },
      },
      originalAuthor: 'teacher-A',
      sharedAt: 300,
      syncGroupId: 'group-attach-fail',
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });
    mockCallJoin.mockResolvedValue({
      groupId: 'group-attach-fail',
      version: 4,
      alreadyJoined: false,
    });
    mockPullContent.mockResolvedValue({
      title: 'Linkage-attach failure',
      youtubeUrl: 'https://youtube.com/watch?v=mno',
      questions: [],
      version: 4,
    });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await expect(
      result.current.importSharedAssignment('share-4', {
        mode: 'sync',
        saveActivity: vi
          .fn<
            (
              activity: import('@/types').VideoActivityData
            ) => Promise<VideoActivityMetadata>
          >()
          .mockResolvedValue({
            id: 'imported-4',
            title: 'Linkage-attach failure',
            youtubeUrl: 'https://youtube.com/watch?v=mno',
            driveFileId: 'd',
            questionCount: 0,
            createdAt: 1,
            updatedAt: 1,
          }),
        // Simulate the metadata patch failing AFTER join + pull succeed.
        attachSyncLinkage: vi
          .fn()
          .mockRejectedValue(new Error('metadata patch denied')),
      })
    ).rejects.toThrow(/metadata patch denied/);
    expect(mockCallLeave).toHaveBeenCalledWith('group-attach-fail');
  });
});

describe('useVideoActivityAssignments — publishAssignmentScores', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  // A two-question MC activity. q0 = 1 pt, q1 = 1 pt.
  const activityData = {
    id: 'act-pub-1',
    title: 'Score Publishing Test',
    youtubeUrl: 'https://youtube.com/watch?v=test',
    questions: [
      {
        id: 'q0',
        text: 'Q0',
        type: 'MC' as const,
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c'],
        timeLimit: 30,
        timestamp: 10,
        points: 1,
      },
      {
        id: 'q1',
        text: 'Q1',
        type: 'MC' as const,
        correctAnswer: 'b',
        incorrectAnswers: ['a', 'c'],
        timeLimit: 30,
        timestamp: 60,
        points: 1,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  const ASSIGNMENT_ID = 'assign-pub-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('computes score correctly when activityData.questions has no duplicates', async () => {
    // Student answered q0 correctly, q1 incorrectly.
    // Expected: pointsEarned=1, pointsMax=2, score=50%.
    const refPartial = { id: 'r-partial' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refPartial,
          data: () => ({
            studentUid: 's1',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'wrong', answeredAt: 2 },
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        activityData,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refPartial
    );
    if (!responseCall) throw new Error('expected update on response ref');
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('deduplicates duplicate question IDs before computing pointsMax for unanswered questions (Drive-sync duplication guard)', async () => {
    // Scenario: Drive-sync race wrote q0 twice into activityData.questions.
    // The student only answered q1 (correctly). q0 is unanswered.
    //
    // Without dedup the unanswered loop walks [q0, q0_dup, q1] and adds q0's
    // points TWICE (q0 and q0_dup are both missing from answeredQuestionIds):
    //   pointsEarned = 1 (q1 correct, graded in answers.map)
    //   pointsMax    = 1 (q1 from grading) + 1 (q0 unanswered) + 1 (q0_dup unanswered) = 3
    //   score        = round(1/3 * 100) = 33  ← wrong
    //
    // With the fix (iterate questionsById instead of activityData.questions):
    //   pointsMax    = 1 (q1 from grading) + 1 (q0 unanswered, counted once) = 2
    //   score        = round(1/2 * 100) = 50  ← correct
    const activityWithDupQ0 = {
      ...activityData,
      questions: [
        ...activityData.questions,
        // Exact duplicate of q0 — same id, same shape — simulates Drive-sync race.
        { ...activityData.questions[0] },
      ],
    };

    const refStudent = { id: 'r-student' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentUid: 's1',
            // Student answered q1 correctly; q0 was not answered.
            answers: [{ questionId: 'q1', answer: 'b', answeredAt: 1 }],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        activityWithDupQ0,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected update on response ref');
    // With the bug: pointsMax=3 (q0 counted twice) → score=round(1/3*100)=33
    // With the fix: pointsMax=2 (q0 counted once)  → score=round(1/2*100)=50
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('deduplicates duplicate answers before computing pointsEarned/pointsMax in the grading loop', async () => {
    // Scenario: an arrayUnion race / Drive-sync wrote the student's q0 answer
    // twice into `answers`. The grading loop walks the raw answers array, so a
    // duplicate answer would be scored twice.
    //
    // Student answered q0 correctly (duplicated) and q1 incorrectly:
    //   Without dedup: pointsEarned = 1 + 1 (q0 twice) = 2,
    //                  pointsMax    = 1 + 1 (q0 twice) + 1 (q1) = 3 → round(2/3*100)=67
    //   With dedup:    pointsEarned = 1 (q0 once),
    //                  pointsMax    = 1 (q0) + 1 (q1) = 2 → round(1/2*100)=50
    const refStudent = { id: 'r-dup-answer' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentUid: 's1',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              // Exact duplicate of the q0 answer — simulates arrayUnion race.
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'wrong', answeredAt: 2 },
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        activityData,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected update on response ref');
    // With the bug: score=round(2/3*100)=67. With the fix: round(1/2*100)=50.
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('scores every response across more than one page (limit + cursor paging)', async () => {
    // Mirrors RESPONSES_PAGE_SIZE in useVideoActivityAssignments — a full page
    // forces the publish path to request a second page to finish reading.
    const RESPONSES_PAGE_SIZE = 500;

    // Each response answers q0 correctly and leaves q1 blank → score 50%.
    const makeDoc = (i: number) => {
      const ref = { id: `r-${i}` };
      return {
        ref,
        data: () => ({
          studentUid: `s${i}`,
          answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
        }),
      };
    };

    // Page 1 is a FULL page (length === page size) so the cursor loop must
    // fetch a second page; page 2 is short so the loop terminates.
    const page1 = Array.from({ length: RESPONSES_PAGE_SIZE }, (_, i) =>
      makeDoc(i)
    );
    const page2 = [
      makeDoc(RESPONSES_PAGE_SIZE),
      makeDoc(RESPONSES_PAGE_SIZE + 1),
    ];
    const totalResponses = page1.length + page2.length;

    mockGetDocs
      .mockResolvedValueOnce({ docs: page1 })
      .mockResolvedValueOnce({ docs: page2 });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    let publishResult: { responsesUpdated: number } | undefined;
    await act(async () => {
      publishResult = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        activityData,
        'score-only'
      );
    });

    // Two reads = two pages: the prior unbounded single-read path would have
    // called getDocs once. The cursor loop is what bounds each read.
    expect(mockGetDocs).toHaveBeenCalledTimes(2);

    // Every response across both pages is scored exactly once.
    expect(publishResult?.responsesUpdated).toBe(totalResponses);
    const scoredRefIds = new Set(
      batchUpdate.mock.calls
        .filter(([ref]) => (ref as { id?: string }).id?.startsWith('r-'))
        .map(([ref]) => (ref as { id: string }).id)
    );
    expect(scoredRefIds.size).toBe(totalResponses);
    for (let i = 0; i < totalResponses; i++) {
      expect(scoredRefIds.has(`r-${i}`)).toBe(true);
    }

    // Spot-check a response from each page got the expected 50% score.
    const firstPageCall = batchUpdate.mock.calls.find(
      ([ref]) => (ref as { id: string }).id === 'r-0'
    );
    const secondPageCall = batchUpdate.mock.calls.find(
      ([ref]) => (ref as { id: string }).id === `r-${RESPONSES_PAGE_SIZE}`
    );
    expect((firstPageCall?.[1] as { score: number }).score).toBe(50);
    expect((secondPageCall?.[1] as { score: number }).score).toBe(50);
  });
});
