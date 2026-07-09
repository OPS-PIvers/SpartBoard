import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  deleteField,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { useRosters, ROSTER_DRIVE_CONCURRENCY } from '@/hooks/useRosters';
import type { ClassRosterMeta, Student } from '@/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  orderBy: vi.fn((field: string) => ({ __orderBy: field })),
  deleteField: vi.fn(() => ({ __sentinel: 'deleteField' })),
}));

// commitRosterPinIndexV1 is invoked through a callable returned by
// httpsCallable(functions, 'commitRosterPinIndexV1'). Capture the last call so
// the pin-index sidecar sync can be asserted without a real Cloud Function.
let lastCallableName: string | null = null;
let lastCallablePayload: unknown = null;
let callableImpl: (data: unknown) => Promise<{ data: unknown }> = () =>
  Promise.resolve({ data: { wrote: 0, deleted: 0 } });

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => {
    return (data: unknown) => {
      lastCallableName = name;
      lastCallablePayload = data;
      return callableImpl(data);
    };
  },
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
  isAuthBypass: false,
}));

// useGoogleDrive is consumed as `const { driveService } = useGoogleDrive()`.
// A module-level holder lets each test swap the service (or set it to null to
// model "not signed in / token loading").
let currentDriveService: MockDriveService | null = null;
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: currentDriveService }),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockAddDoc = addDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockDeleteDoc = deleteDoc as Mock;
const mockQuery = query as Mock;
const mockOrderBy = orderBy as Mock;

// ─── Test doubles ─────────────────────────────────────────────────────────────

interface MockDriveService {
  uploadFile: Mock;
  updateFileContent: Mock;
  downloadFile: Mock;
  deleteFile: Mock;
}

const makeDriveService = (
  overrides: Partial<MockDriveService> = {}
): MockDriveService => ({
  uploadFile: vi.fn().mockResolvedValue({ id: 'drive-file-new' }),
  updateFileContent: vi.fn().mockResolvedValue(undefined),
  downloadFile: vi
    .fn()
    .mockResolvedValue({ text: () => Promise.resolve('[]') }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// A Drive blob is read via `.text()`; wrap a JSON payload in that shape.
const driveBlob = (payload: unknown) => ({
  text: () => Promise.resolve(JSON.stringify(payload)),
});

const student = (overrides: Partial<Student> = {}): Student => ({
  id: 's1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  pin: '01',
  ...overrides,
});

const metaDoc = (
  id: string,
  data: Partial<ClassRosterMeta> & Record<string, unknown> = {}
) => ({
  id,
  data: () => ({ name: `Roster ${id}`, ...data }),
});

// Snapshot handler capture — mirrors the (onNext, onError) pair the hook wires.
interface SnapHandler {
  ref: unknown;
  onNext: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void;
  onError?: (err: { code?: string }) => void;
  unsub: Mock;
}
let snapHandlers: SnapHandler[] = [];

const emitSnapshot = (
  handlerIndex: number,
  docs: Array<{ id: string; data: () => unknown }>
) => {
  act(() => {
    snapHandlers[handlerIndex].onNext({ docs });
  });
};

const TEACHER_UID = 'teacher-1';
const mockUser = { uid: TEACHER_UID } as User;

const migrationKey = (uid: string) => `spart_roster_pii_migrated_v1_${uid}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  localStorage.clear();
  // Default: skip the one-time PII migration so snapshot tests exercise only
  // the build path. The dedicated migration test clears this key itself.
  localStorage.setItem(migrationKey(TEACHER_UID), '1');

  snapHandlers = [];
  lastCallableName = null;
  lastCallablePayload = null;
  callableImpl = () => Promise.resolve({ data: { wrote: 0, deleted: 0 } });
  currentDriveService = makeDriveService();

  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockAddDoc.mockResolvedValue({ id: 'new-roster-id' });
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation(
    (
      ref: unknown,
      onNext: SnapHandler['onNext'],
      onError?: SnapHandler['onError']
    ) => {
      const unsub = vi.fn();
      snapHandlers.push({ ref, onNext, onError, unsub });
      return unsub;
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Exported constant ──────────────────────────────────────────────────────

describe('ROSTER_DRIVE_CONCURRENCY', () => {
  it('is a small positive integer bound for the Drive fan-out', () => {
    expect(ROSTER_DRIVE_CONCURRENCY).toBe(4);
    expect(Number.isInteger(ROSTER_DRIVE_CONCURRENCY)).toBe(true);
    expect(ROSTER_DRIVE_CONCURRENCY).toBeGreaterThan(0);
  });
});

// ─── Subscription lifecycle ───────────────────────────────────────────────────

describe('useRosters — subscription', () => {
  it('does not subscribe when there is no user', () => {
    const { result } = renderHook(() => useRosters(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.rosters).toEqual([]);
    expect(result.current.activeRosterId).toBeNull();
  });

  it('subscribes to the user rosters collection ordered by name', () => {
    renderHook(() => useRosters(mockUser));
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'users',
      TEACHER_UID,
      'rosters'
    );
    expect(mockOrderBy).toHaveBeenCalledWith('name');
    expect(mockQuery).toHaveBeenCalled();
    expect(snapHandlers).toHaveLength(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useRosters(mockUser));
    const unsub = snapHandlers[0].unsub;
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('validates metadata and drops docs without a name', async () => {
    currentDriveService = null; // no students to load; metadata only
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [
      metaDoc('r1', { studentCount: 3 }),
      // Missing `name` → validateRosterMeta returns null → dropped.
      { id: 'bad', data: () => ({ studentCount: 9 }) },
    ]);

    await waitFor(() => expect(result.current.rosters).toHaveLength(1));
    expect(result.current.rosters[0].id).toBe('r1');
    expect(result.current.rosters[0].name).toBe('Roster r1');
    expect(result.current.rosters[0].studentCount).toBe(3);
  });

  it('merges Drive students into roster metadata and caches on success', async () => {
    currentDriveService = makeDriveService({
      downloadFile: vi.fn().mockResolvedValue(
        driveBlob([
          { id: 'a', firstName: 'Al', lastName: 'Pha', pin: '01' },
          { id: 'b', firstName: 'Be', lastName: 'Ta' }, // no pin → assigned
        ])
      ),
    });
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [
      metaDoc('r1', { driveFileId: 'file-1', studentCount: 2 }),
    ]);

    await waitFor(() => expect(result.current.rosters).toHaveLength(1));
    const roster = result.current.rosters[0];
    expect(roster.students.map((s) => s.id)).toEqual(['a', 'b']);
    // assignPins fills the missing pin with a zero-padded sequential value.
    expect(roster.students[1].pin).toBe('02');
    expect(roster.loadError).toBeUndefined();
    expect(currentDriveService.downloadFile).toHaveBeenCalledWith('file-1');
  });

  it('surfaces loadError and does not cache when a Drive download fails', async () => {
    const downloadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('token expired'))
      .mockResolvedValue(driveBlob([student()]));
    currentDriveService = makeDriveService({ downloadFile });

    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);

    await waitFor(() =>
      expect(result.current.rosters[0]?.loadError).toBe('token expired')
    );
    expect(result.current.rosters[0].students).toEqual([]);

    // A second snapshot with the SAME driveFileId retries (the failure was not
    // cached) and now resolves the students.
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);
    await waitFor(() =>
      expect(result.current.rosters[0].students).toHaveLength(1)
    );
    expect(result.current.rosters[0].loadError).toBeUndefined();
    expect(downloadFile).toHaveBeenCalledTimes(2);
  });

  it('treats a non-array Drive payload as a load failure', async () => {
    currentDriveService = makeDriveService({
      downloadFile: vi.fn().mockResolvedValue(driveBlob({ not: 'an array' })),
    });
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);

    await waitFor(() =>
      expect(result.current.rosters[0]?.loadError).toMatch(/not an array/)
    );
    expect(result.current.rosters[0].students).toEqual([]);
  });

  it('flags loadError when a roster has a Drive file but Drive is unavailable', async () => {
    currentDriveService = null;
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);

    await waitFor(() =>
      expect(result.current.rosters[0]?.loadError).toMatch(
        /Google Drive not available/
      )
    );
    expect(result.current.rosters[0].students).toEqual([]);
  });

  it('invalidates the students cache when a roster driveFileId changes', async () => {
    const downloadFile = vi
      .fn()
      .mockResolvedValueOnce(driveBlob([student({ id: 'old' })]))
      .mockResolvedValueOnce(driveBlob([student({ id: 'new' })]));
    currentDriveService = makeDriveService({ downloadFile });

    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);
    await waitFor(() =>
      expect(result.current.rosters[0].students[0].id).toBe('old')
    );

    // Same roster, new Drive file → cache busted → re-download.
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-2' })]);
    await waitFor(() =>
      expect(result.current.rosters[0].students[0].id).toBe('new')
    );
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile).toHaveBeenLastCalledWith('file-2');
  });

  it('serves a cached roster without re-downloading when driveFileId is unchanged', async () => {
    const downloadFile = vi
      .fn()
      .mockResolvedValue(driveBlob([student({ id: 'cached' })]));
    currentDriveService = makeDriveService({ downloadFile });

    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);
    await waitFor(() =>
      expect(result.current.rosters[0].students[0].id).toBe('cached')
    );

    // Second identical snapshot re-uses the cache — no extra download.
    emitSnapshot(0, [
      metaDoc('r1', { driveFileId: 'file-1', studentCount: 1 }),
    ]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('falls back to an unordered listener on a failed-precondition error', () => {
    renderHook(() => useRosters(mockUser));
    expect(snapHandlers).toHaveLength(1);

    act(() => {
      snapHandlers[0].onError?.({ code: 'failed-precondition' });
    });

    // A second (unordered) listener is armed against the collection ref.
    expect(snapHandlers).toHaveLength(2);
    expect(snapHandlers[1].ref).toBe('users/teacher-1/rosters');
  });

  it('does not arm a fallback listener for other snapshot errors', () => {
    renderHook(() => useRosters(mockUser));
    act(() => {
      snapHandlers[0].onError?.({ code: 'permission-denied' });
    });
    expect(snapHandlers).toHaveLength(1);
  });
});

// ─── addRoster ────────────────────────────────────────────────────────────────

describe('useRosters — addRoster', () => {
  it('throws when there is no user', async () => {
    const { result } = renderHook(() => useRosters(null));
    await expect(result.current.addRoster('New', [])).rejects.toThrow(
      'No user'
    );
  });

  it('writes metadata-only to Firestore, uploads students to Drive, and back-fills the driveFileId', async () => {
    currentDriveService = makeDriveService({
      uploadFile: vi.fn().mockResolvedValue({ id: 'drive-file-42' }),
    });
    const { result } = renderHook(() => useRosters(mockUser));

    let newId = '';
    await act(async () => {
      newId = await result.current.addRoster('Period 1', [
        student({ id: 's1', pin: '' }),
      ]);
    });

    expect(newId).toBe('new-roster-id');
    // Firestore doc is metadata-only — no `students` array (PII lives in Drive).
    const firestoreData = mockAddDoc.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(firestoreData).toMatchObject({
      name: 'Period 1',
      driveFileId: null,
      studentCount: 1,
    });
    expect(firestoreData).not.toHaveProperty('students');
    expect(typeof firestoreData.createdAt).toBe('number');

    // Drive upload happened and the doc was patched with the returned file id.
    expect(currentDriveService.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'users/teacher-1/rosters/new-roster-id',
      { driveFileId: 'drive-file-42' }
    );
  });

  it('passes ClassLink provenance metadata through to the Firestore doc', async () => {
    const { result } = renderHook(() => useRosters(mockUser));
    await act(async () => {
      await result.current.addRoster('CL', [], {
        origin: 'classlink',
        classlinkClassId: 'cl-123',
        classlinkClassCode: 'MATH-7',
      });
    });
    const [, firestoreData] = mockAddDoc.mock.calls[0];
    expect(firestoreData).toMatchObject({
      origin: 'classlink',
      classlinkClassId: 'cl-123',
      classlinkClassCode: 'MATH-7',
    });
  });

  it('still resolves with the new id when the Drive upload fails', async () => {
    currentDriveService = makeDriveService({
      uploadFile: vi.fn().mockRejectedValue(new Error('drive down')),
    });
    const { result } = renderHook(() => useRosters(mockUser));

    let newId = '';
    await act(async () => {
      newId = await result.current.addRoster('P', [student()]);
    });
    expect(newId).toBe('new-roster-id');
    // The driveFileId patch is skipped, but the roster doc itself was written.
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('does not attempt a Drive upload for an empty roster', async () => {
    const { result } = renderHook(() => useRosters(mockUser));
    await act(async () => {
      await result.current.addRoster('Empty', []);
    });
    expect(currentDriveService?.uploadFile).not.toHaveBeenCalled();
  });

  it('syncs the pin-index sidecar for students carrying a ClassLink id + PIN', async () => {
    const { result } = renderHook(() => useRosters(mockUser));
    await act(async () => {
      await result.current.addRoster('CL', [
        student({ id: 's1', pin: '01', classLinkSourcedId: 'cl-a' }),
        student({ id: 's2', pin: '02' }), // no classlink id → excluded
      ]);
    });
    expect(lastCallableName).toBe('commitRosterPinIndexV1');
    const payload = lastCallablePayload as {
      rosterId: string;
      entries: Array<{
        period: string;
        pin: string;
        classlinkSourcedId: string;
      }>;
    };
    expect(payload.rosterId).toBe('new-roster-id');
    expect(payload.entries).toEqual([
      { period: 'CL', pin: '01', classlinkSourcedId: 'cl-a' },
    ]);
  });

  it('skips the pin-index round-trip for a purely local roster', async () => {
    const { result } = renderHook(() => useRosters(mockUser));
    await act(async () => {
      await result.current.addRoster('Local', [student({ id: 's1' })]);
    });
    expect(lastCallableName).toBeNull();
  });
});

// ─── updateRoster ─────────────────────────────────────────────────────────────

describe('useRosters — updateRoster', () => {
  it('is a no-op when there is no user', async () => {
    const { result } = renderHook(() => useRosters(null));
    await act(async () => {
      await result.current.updateRoster('r1', { name: 'x' });
    });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('uploads students in-place to the existing Drive file and patches count', async () => {
    const updateFileContent = vi.fn().mockResolvedValue(undefined);
    currentDriveService = makeDriveService({
      updateFileContent,
      downloadFile: vi
        .fn()
        .mockResolvedValue(driveBlob([student({ id: 's1' })])),
    });
    const { result } = renderHook(() => useRosters(mockUser));
    // Seed metadata (so metaListRef knows the existing driveFileId).
    emitSnapshot(0, [
      metaDoc('r1', { driveFileId: 'file-1', studentCount: 1 }),
    ]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));

    await act(async () => {
      await result.current.updateRoster('r1', {
        students: [student({ id: 's1' }), student({ id: 's2', pin: '' })],
      });
    });

    // In-place update — no new upload.
    expect(updateFileContent).toHaveBeenCalledWith('file-1', expect.anything());
    expect(currentDriveService.uploadFile).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'users/teacher-1/rosters/r1',
      expect.objectContaining({ driveFileId: 'file-1', studentCount: 2 })
    );
    // Local state reflects the optimistic student list immediately.
    expect(result.current.rosters[0].students).toHaveLength(2);
    expect(result.current.rosters[0].students[1].pin).toBe('02');
  });

  it('reverts the optimistic update and throws when the Drive upload fails', async () => {
    currentDriveService = makeDriveService({
      downloadFile: vi
        .fn()
        .mockResolvedValue(driveBlob([student({ id: 's1' })])),
      updateFileContent: vi.fn().mockRejectedValue(new Error('drive fail')),
    });
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [
      metaDoc('r1', { driveFileId: 'file-1', studentCount: 1 }),
    ]);
    await waitFor(() =>
      expect(result.current.rosters[0].students).toHaveLength(1)
    );

    await act(async () => {
      await expect(
        result.current.updateRoster('r1', {
          students: [student({ id: 's1' }), student({ id: 's2' })],
        })
      ).rejects.toThrow('Failed to save roster changes to Drive');
    });

    // Rolled back to the single original student.
    await waitFor(() =>
      expect(result.current.rosters[0].students).toHaveLength(1)
    );
    expect(result.current.rosters[0].students[0].id).toBe('s1');
  });

  it('updates the Firestore count only when Drive is unavailable', async () => {
    currentDriveService = null;
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { studentCount: 0 })]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));

    await act(async () => {
      await result.current.updateRoster('r1', {
        name: 'Renamed',
        students: [student({ id: 's1' })],
      });
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith('users/teacher-1/rosters/r1', {
      name: 'Renamed',
      studentCount: 1,
    });
  });

  it('writes metadata-only when no students are supplied', async () => {
    const { result } = renderHook(() => useRosters(mockUser));
    await act(async () => {
      await result.current.updateRoster('r1', { name: 'Just a rename' });
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith('users/teacher-1/rosters/r1', {
      name: 'Just a rename',
    });
  });
});

// ─── setAbsentStudents ────────────────────────────────────────────────────────

describe('useRosters — setAbsentStudents', () => {
  it('is a no-op when there is no user', async () => {
    const { result } = renderHook(() => useRosters(null));
    await act(async () => {
      await result.current.setAbsentStudents('r1', ['s1']);
    });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('optimistically sets the absent list and persists it', async () => {
    currentDriveService = null;
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1')]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));

    await act(async () => {
      await result.current.setAbsentStudents('r1', ['s1', 's2']);
    });

    expect(result.current.rosters[0].absent?.studentIds).toEqual(['s1', 's2']);
    const path = mockUpdateDoc.mock.calls[0][0] as string;
    const payload = mockUpdateDoc.mock.calls[0][1] as {
      absent: { studentIds: string[]; date: string };
    };
    expect(path).toBe('users/teacher-1/rosters/r1');
    expect(payload.absent.studentIds).toEqual(['s1', 's2']);
    expect(typeof payload.absent.date).toBe('string');
  });

  it('reverts the absent list and rethrows when the write fails', async () => {
    currentDriveService = null;
    mockUpdateDoc.mockRejectedValueOnce(new Error('write denied'));
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1')]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));

    await act(async () => {
      await expect(
        result.current.setAbsentStudents('r1', ['s1'])
      ).rejects.toThrow('write denied');
    });

    // Reverted to the prior (undefined) absent value.
    expect(result.current.rosters[0].absent).toBeUndefined();
  });
});

// ─── deleteRoster + setActiveRoster ─────────────────────────────────────────────

describe('useRosters — deleteRoster & setActiveRoster', () => {
  it('is a no-op when there is no user', async () => {
    const { result } = renderHook(() => useRosters(null));
    await act(async () => {
      await result.current.deleteRoster('r1');
    });
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('deletes the Drive file and Firestore doc, and clears the active roster', async () => {
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    currentDriveService = makeDriveService({ deleteFile });
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1', { driveFileId: 'file-1' })]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));

    act(() => result.current.setActiveRoster('r1'));
    expect(result.current.activeRosterId).toBe('r1');
    expect(localStorage.getItem('spart_active_roster_id')).toBe('r1');

    await act(async () => {
      await result.current.deleteRoster('r1');
    });

    expect(deleteFile).toHaveBeenCalledWith('file-1');
    expect(mockDeleteDoc).toHaveBeenCalledWith('users/teacher-1/rosters/r1');
    // Active roster cleared because it matched the deleted id.
    expect(result.current.activeRosterId).toBeNull();
    expect(localStorage.getItem('spart_active_roster_id')).toBeNull();
  });

  it('leaves the active roster untouched when a different roster is deleted', async () => {
    currentDriveService = null;
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [metaDoc('r1'), metaDoc('r2')]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(2));

    act(() => result.current.setActiveRoster('r2'));
    await act(async () => {
      await result.current.deleteRoster('r1');
    });
    expect(result.current.activeRosterId).toBe('r2');
  });

  it('hydrates the initial active roster id from localStorage', () => {
    localStorage.setItem('spart_active_roster_id', 'persisted-r');
    const { result } = renderHook(() => useRosters(mockUser));
    expect(result.current.activeRosterId).toBe('persisted-r');
  });

  it('clears the persisted active roster id when set to null', () => {
    localStorage.setItem('spart_active_roster_id', 'persisted-r');
    const { result } = renderHook(() => useRosters(mockUser));
    act(() => result.current.setActiveRoster(null));
    expect(result.current.activeRosterId).toBeNull();
    expect(localStorage.getItem('spart_active_roster_id')).toBeNull();
  });
});

// ─── One-time PII migration ─────────────────────────────────────────────────────

describe('useRosters — PII migration', () => {
  it('moves students[] out of Firestore into Drive and removes the field', async () => {
    localStorage.removeItem(migrationKey(TEACHER_UID)); // force migration
    const uploadFile = vi.fn().mockResolvedValue({ id: 'migrated-file' });
    currentDriveService = makeDriveService({ uploadFile });

    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [
      metaDoc('r1', {
        studentCount: 1,
        // Legacy doc still carrying PII in Firestore.
        students: [{ id: 's1', firstName: 'Ada', lastName: 'L', pin: '01' }],
      }),
    ]);

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    // Firestore doc patched: driveFileId set, count kept, students deleted.
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'users/teacher-1/rosters/r1',
      expect.objectContaining({
        driveFileId: 'migrated-file',
        studentCount: 1,
        students: { __sentinel: 'deleteField' },
      })
    );
    expect(deleteField).toHaveBeenCalled();
    // Migration flag is now persisted so it won't run again.
    await waitFor(() =>
      expect(localStorage.getItem(migrationKey(TEACHER_UID))).toBe('1')
    );
    expect(result.current.rosters[0].students[0].id).toBe('s1');
  });

  it('does not re-run migration once the per-user flag is set', async () => {
    // Flag is set in beforeEach; a legacy doc with students[] should be ignored.
    const { result } = renderHook(() => useRosters(mockUser));
    emitSnapshot(0, [
      metaDoc('r1', {
        students: [{ id: 's1', firstName: 'Ada', lastName: 'L', pin: '01' }],
      }),
    ]);
    await waitFor(() => expect(result.current.rosters).toHaveLength(1));
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
