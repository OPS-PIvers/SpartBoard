import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The versioned write is what replaced the conflict toast. Under the CRDT every
 * writer is trying to write content that has already converged, so losing the
 * `new == old + 1` race is no longer a lost edit — it just means re-reading and
 * writing the same bytes against the fresh version.
 */

const getDocMock = vi.fn<(ref: unknown) => Promise<unknown>>();
interface Call {
  plcId: string;
  writes: { op: string; data: Record<string, unknown>; expect?: unknown }[];
}
const callMock = vi.fn<(payload: Call) => Promise<unknown>>();
const fieldsOf = (i: number) => callMock.mock.calls[i][0].writes[0].data;
const stale = () =>
  Object.assign(new Error('stale'), {
    code: 'functions/aborted',
    details: { reason: 'stale' },
  });

vi.mock('firebase/functions', () => ({
  httpsCallable: () => (payload: Call) => callMock(payload),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'plcs/p1/notes/n1' })),
  collection: vi.fn(() => ({})),
  getDoc: (ref: unknown) => getDocMock(ref),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const { writeVersionedNoteFields } = await import('@/hooks/usePlcNoteCrdt');

const snapshot = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

describe('writeVersionedNoteFields', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    callMock.mockReset();
  });

  it('bumps the version it just read and stamps the editor', async () => {
    getDocMock.mockResolvedValue(snapshot({ version: 4 }));
    callMock.mockResolvedValue({ data: { ok: true } });

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(callMock).toHaveBeenCalledTimes(1);
    expect(callMock.mock.calls[0][0].writes[0]).toMatchObject({
      op: 'update',
      expect: { version: 4, lastEditedAt: null },
    });
    expect(fieldsOf(0)).toEqual({
      body: 'hello',
      lastEditedBy: 'me',
      lastEditedAt: 'SERVER_TS',
      version: 5,
    });
  });

  it('re-reads and retries when a teammate wins the version race', async () => {
    getDocMock
      .mockResolvedValueOnce(snapshot({ version: 4 }))
      .mockResolvedValueOnce(snapshot({ version: 7 }));
    callMock
      .mockRejectedValueOnce(stale())
      .mockResolvedValueOnce({ data: { ok: true } });

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(callMock).toHaveBeenCalledTimes(2);
    // The retry is built from the version it re-read, not the stale one.
    expect(fieldsOf(1)).toMatchObject({ version: 8 });
  });

  it('never introduces a version onto a legacy note', async () => {
    getDocMock.mockResolvedValue(snapshot({ title: 'Legacy' }));
    callMock.mockResolvedValue({ data: { ok: true } });

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(fieldsOf(0)).not.toHaveProperty('version');
  });

  it('does nothing when the note has been deleted', async () => {
    getDocMock.mockResolvedValue(snapshot(null));

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(callMock).not.toHaveBeenCalled();
  });

  it('gives up after exhausting its attempts', async () => {
    getDocMock.mockResolvedValue(snapshot({ version: 1 }));
    callMock.mockRejectedValue(stale());

    await expect(
      writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }))
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(callMock).toHaveBeenCalledTimes(5);
  });

  it('does not retry a refusal', async () => {
    getDocMock.mockResolvedValue(snapshot({ version: 1 }));
    callMock.mockRejectedValue(
      Object.assign(new Error('no'), { code: 'functions/permission-denied' })
    );

    await expect(
      writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(callMock).toHaveBeenCalledTimes(1);
  });
});
