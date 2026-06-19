import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  parseNote,
  PlcNoteVersionConflictError,
  usePlcNotes,
} from '@/hooks/usePlcNotes';
import { writePlcActivityEvent } from '@/utils/plcActivity';

// Distinct sentinel so tests can assert serverTimestamp() (Decision 1.3) was
// used for the time fields rather than a Date.now() number.
const SERVER_TS = { __serverTimestamp: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  serverTimestamp: vi.fn(() => SERVER_TS),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock =
  vi.fn<
    () => { user: { uid: string; displayName?: string; email?: string } | null }
  >();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

// The activity fan-out is fire-and-forget; mock it so createNote can assert the
// `note_created` emission without touching Firestore.
vi.mock('@/utils/plcActivity', () => ({
  writePlcActivityEvent: vi.fn(() => Promise.resolve()),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockDeleteDoc = deleteDoc as Mock;
const mockOrderBy = orderBy as Mock;
const mockWriteActivity = writePlcActivityEvent as Mock;

/**
 * Capture the single `updateDoc(ref, fields)` call `updateNote` makes (it no
 * longer uses a transaction — it sends one non-transactional patch carrying
 * `version: expectedVersion + 1`). Returns `captured` with the ref + fields.
 */
function captureUpdate() {
  const captured: { ref?: unknown; fields?: Record<string, unknown> } = {};
  mockUpdateDoc.mockImplementation(
    (ref: unknown, fields: Record<string, unknown>) => {
      captured.ref = ref;
      captured.fields = fields;
      return Promise.resolve();
    }
  );
  return captured;
}

const USER_UID = 'user-1';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  // doc() with no `path` (i.e. doc(collection)) returns an object with an
  // `.id` so the create-note helper has something to seed `id` from.
  mockDoc.mockImplementation((collectionRef: unknown, ...segs: string[]) => {
    if (segs.length === 0) {
      return { id: 'generated-id', __collection: collectionRef };
    }
    return segs.join('/');
  });
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockWriteActivity.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { uid: USER_UID } });
});

describe('usePlcNotes — listener wiring', () => {
  it('orders by lastEditedAt desc', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcNotes(PLC_ID));
    expect(mockOrderBy).toHaveBeenCalledWith('lastEditedAt', 'desc');
  });

  it('skips the listener when plcId is null', () => {
    renderHook(() => usePlcNotes(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('usePlcNotes — defensive parse', () => {
  it('drops notes missing required string fields; tolerates non-number time fields', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    const fakeSnap = (
      docs: Array<{ id: string; data: Record<string, unknown> }>
    ) => ({
      forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
        for (const d of docs) fn({ id: d.id, data: () => d.data });
      },
    });

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: {
              title: 'Valid',
              body: 'body',
              createdBy: 'u1',
              createdAt: 1,
              lastEditedBy: 'u1',
              lastEditedAt: 2,
            },
          },
          {
            // body missing — drop
            id: 'b',
            data: {
              title: 'No body',
              createdBy: 'u1',
              createdAt: 1,
              lastEditedBy: 'u1',
              lastEditedAt: 2,
            },
          },
          {
            // lastEditedBy missing (a required string) — drop
            id: 'd',
            data: {
              title: 'No editor',
              body: 'b',
              createdBy: 'u1',
              createdAt: 1,
              lastEditedAt: 2,
            },
          },
          {
            // Timestamp-shaped time fields (serverTimestamp on read) — KEEP,
            // resolved to millis via tsToMillis.
            id: 'c',
            data: {
              title: 'Stamped',
              body: 'b',
              createdBy: 'u1',
              createdAt: { toMillis: () => 1700000000000 },
              lastEditedBy: 'u1',
              lastEditedAt: { toMillis: () => 1700000000500 },
            },
          },
        ])
      );
    });

    // 'a' (legacy numbers) and 'c' (Timestamps) survive; 'b' + 'd' drop.
    expect(result.current.notes.map((n) => n.id).sort()).toEqual(['a', 'c']);
    const stamped = result.current.notes.find((n) => n.id === 'c');
    expect(stamped?.createdAt).toBe(1700000000000);
    expect(stamped?.lastEditedAt).toBe(1700000000500);
  });
});

describe('usePlcNotes — createNote', () => {
  it('writes a fully-formed note with createdBy + lastEditedBy stamped to the current user', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      const id = await result.current.createNote({
        title: 'T',
        body: 'B',
      });
      expect(id).toBe('generated-id');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.title).toBe('T');
    expect(written.body).toBe('B');
    expect(written.createdBy).toBe(USER_UID);
    expect(written.lastEditedBy).toBe(USER_UID);
    // Time fields are serverTimestamp() sentinels (Decision 1.3), not numbers.
    expect(written.createdAt).toBe(SERVER_TS);
    expect(written.lastEditedAt).toBe(SERVER_TS);
    // version seeds at 0 so the first edit bumps to 1 (Decision 2.4).
    expect(written.version).toBe(0);
    // A freeform note omits kind/meetingId (kept minimal).
    expect('kind' in written).toBe(false);
    expect('meetingId' in written).toBe(false);

    // Activity fan-out (Decision 2.2): createNote emits a `note_created` event
    // so the digest + unread badge surface the new note (Wave 2's headline).
    expect(mockWriteActivity).toHaveBeenCalledTimes(1);
    const [activityPlcId, activityEvent] =
      mockWriteActivity.mock.calls[0] ?? [];
    expect(activityPlcId).toBe(PLC_ID);
    expect(activityEvent).toMatchObject({
      type: 'note_created',
      actorUid: USER_UID,
      targetType: 'note',
      targetId: 'generated-id',
      targetTitle: 'T',
    });
  });

  it('emits note_created without a targetTitle for an empty-title note', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.createNote({ title: '   ', body: 'B' });
    });

    const [, activityEvent] = mockWriteActivity.mock.calls[0] ?? [];
    expect(activityEvent).toMatchObject({ type: 'note_created' });
    // A blank title is omitted entirely so the feed uses its placeholder.
    expect('targetTitle' in (activityEvent as Record<string, unknown>)).toBe(
      false
    );
  });

  it('writes kind + meetingId for a structured meeting note', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.createNote({
        title: 'Unit 4 CFA',
        body: '## Agenda',
        kind: 'meeting',
        meetingId: 'm-1',
      });
    });

    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.kind).toBe('meeting');
    expect(written.meetingId).toBe('m-1');
    expect(written.version).toBe(0);
  });
});

describe('parseNote — Wave-2 fields', () => {
  const base = {
    title: 'T',
    body: 'B',
    createdBy: 'u1',
    createdAt: 1,
    lastEditedBy: 'u1',
    lastEditedAt: 2,
  };

  it('reads kind/meetingId/version/deletedAt when present', () => {
    const note = parseNote('n1', {
      ...base,
      kind: 'meeting',
      meetingId: 'm-1',
      version: 7,
      deletedAt: 1700000000000,
    });
    expect(note).not.toBeNull();
    expect(note?.kind).toBe('meeting');
    expect(note?.meetingId).toBe('m-1');
    expect(note?.version).toBe(7);
    expect(note?.deletedAt).toBe(1700000000000);
  });

  it('tolerates legacy notes lacking version/kind/meetingId/deletedAt', () => {
    const note = parseNote('n1', { ...base });
    expect(note).not.toBeNull();
    // Absent stays absent — consumers treat undefined kind as freeform and
    // undefined version as "never versioned" (rollout escape hatch).
    expect(note?.kind).toBeUndefined();
    expect(note?.meetingId).toBeUndefined();
    expect(note?.version).toBeUndefined();
    expect(note?.deletedAt).toBeUndefined();
  });

  it('drops an out-of-union kind value', () => {
    const note = parseNote('n1', { ...base, kind: 'agenda' });
    expect(note?.kind).toBeUndefined();
  });

  it('reads an explicit null meetingId/deletedAt', () => {
    const note = parseNote('n1', {
      ...base,
      meetingId: null,
      deletedAt: null,
    });
    expect(note?.meetingId).toBeNull();
    expect(note?.deletedAt).toBeNull();
  });
});

// updateNote sends a SINGLE non-transactional updateDoc carrying
// `version: expectedVersion + 1` computed from the LOADED base (Decision 2.4) —
// deliberately NOT a transaction (which would re-read + recompute latest+1 on
// retry and silently overwrite a teammate). The rule rejects a stale base, and
// the client normalizes that rejection to PlcNoteVersionConflictError.
describe('usePlcNotes — version-aware updateNote', () => {
  it('sends expectedVersion + 1 (not a re-read latest) and patches only the changed field', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const captured = captureUpdate();
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.updateNote(
        'note-1',
        { body: 'new body' },
        { expectedVersion: 4 }
      );
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const fields = captured.fields ?? {};
    // Bumped from the LOADED base (4), not from a fresh read — this is the fix:
    // a teammate who already pushed the canonical version to 5 makes the rule's
    // `new == old + 1` (5 == 4? no) fail, surfacing the conflict.
    expect(fields.version).toBe(5);
    expect(fields.body).toBe('new body');
    // `title` must NOT appear — patch-only contract avoids reverting a
    // teammate's concurrent title edit from stale local state.
    expect('title' in fields).toBe(false);
    expect(fields.lastEditedBy).toBe(USER_UID);
    expect(fields.lastEditedAt).toBe(SERVER_TS);
  });

  it('does NOT introduce version when expectedVersion is omitted (legacy rollout escape hatch)', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const captured = captureUpdate();
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.updateNote('note-1', { body: 'edited' });
    });

    const fields = captured.fields ?? {};
    expect('version' in fields).toBe(false);
    expect(fields.body).toBe('edited');
  });

  it('normalizes a permission-denied rejection (stale base lost the race) to PlcNoteVersionConflictError', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    // The rule rejects a stale-base write — Firestore surfaces it as
    // permission-denied. This is now the path the client ACTUALLY exercises:
    // it sent `version: expectedVersion + 1` from a stale base, the canonical
    // had already moved on, the rule's `new == old + 1` failed.
    mockUpdateDoc.mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      })
    );
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await expect(
        result.current.updateNote(
          'note-1',
          { body: 'mine' },
          { expectedVersion: 4 }
        )
      ).rejects.toBeInstanceOf(PlcNoteVersionConflictError);
    });
    // The conflict carries the base the caller loaded (current is unknown
    // from the error alone).
    await act(async () => {
      try {
        await result.current.updateNote(
          'note-1',
          { body: 'mine' },
          { expectedVersion: 4 }
        );
      } catch (err) {
        expect((err as PlcNoteVersionConflictError).expectedVersion).toBe(4);
      }
    });
  });

  it('writes a soft-delete tombstone with a version bump from the loaded base', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const captured = captureUpdate();
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.deleteNote('note-1', 1);
    });

    const fields = captured.fields ?? {};
    expect(fields.deletedAt).toBeTypeOf('number');
    expect(fields.version).toBe(2);
  });

  it('restoreNote clears deletedAt and bumps version from the loaded base', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const captured = captureUpdate();
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.restoreNote('note-1', 5);
    });

    const fields = captured.fields ?? {};
    expect(fields.deletedAt).toBeNull();
    expect(fields.version).toBe(6);
  });
});
