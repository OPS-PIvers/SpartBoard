import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The versioned write is what replaced the conflict toast. Under the CRDT every
 * writer is trying to write content that has already converged, so losing the
 * `new == old + 1` race is no longer a lost edit — it just means re-reading and
 * writing the same bytes against the fresh version.
 */

const getDocMock = vi.fn<(ref: unknown) => Promise<unknown>>();
const updateDocMock =
  vi.fn<(ref: unknown, fields: Record<string, unknown>) => Promise<void>>();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'plcs/p1/notes/n1' })),
  collection: vi.fn(() => ({})),
  getDoc: (ref: unknown) => getDocMock(ref),
  updateDoc: (ref: unknown, fields: Record<string, unknown>) =>
    updateDocMock(ref, fields),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const { writeVersionedNoteFields } = await import('@/hooks/usePlcNoteCrdt');

const snapshot = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

describe('writeVersionedNoteFields', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    updateDocMock.mockReset();
  });

  it('bumps the version it just read and stamps the editor', async () => {
    getDocMock.mockResolvedValue(snapshot({ version: 4 }));
    updateDocMock.mockResolvedValue(undefined);

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toEqual({
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
    updateDocMock
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED'))
      .mockResolvedValueOnce(undefined);

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(updateDocMock).toHaveBeenCalledTimes(2);
    // The retry is built from the version it re-read, not the stale one.
    expect(updateDocMock.mock.calls[1][1]).toMatchObject({ version: 8 });
  });

  it('never introduces a version onto a legacy note', async () => {
    getDocMock.mockResolvedValue(snapshot({ title: 'Legacy' }));
    updateDocMock.mockResolvedValue(undefined);

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty('version');
  });

  it('does nothing when the note has been deleted', async () => {
    getDocMock.mockResolvedValue(snapshot(null));

    await writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }));

    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('gives up after exhausting its attempts', async () => {
    getDocMock.mockResolvedValue(snapshot({ version: 1 }));
    updateDocMock.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await expect(
      writeVersionedNoteFields('p1', 'n1', 'me', () => ({ body: 'hello' }))
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(updateDocMock).toHaveBeenCalledTimes(5);
  });
});
