// Client side of plcNotesWriteV1: wire format, error codes and the read-modify-write retry.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SERVER_TS = { isEqual: (o: unknown) => o === SERVER_TS };
const DELETE = { isEqual: (o: unknown) => o === DELETE };
const getDocMock = vi.fn<(ref: unknown) => Promise<unknown>>();
const callMock = vi.fn<(payload: unknown) => Promise<unknown>>();

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  getDoc: (ref: unknown) => getDocMock(ref),
  serverTimestamp: () => SERVER_TS,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => (payload: unknown) =>
    callMock({ name, payload }),
}));
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const { plcNotesWrite, plcNotesMutate, PlcNotesWriteError } =
  await import('@/utils/plcNotesWrite');

const ts = (ms: number) => ({ toMillis: () => ms, isEqual: () => false });
const snap = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});
const refusal = (code: string, reason?: string) =>
  Object.assign(new Error(code), {
    code: `functions/${code}`,
    ...(reason ? { details: { reason } } : {}),
  });

beforeEach(() => {
  getDocMock.mockReset();
  callMock.mockReset();
  callMock.mockResolvedValue({ data: { ok: true } });
});

describe('plcNotesWrite', () => {
  it('sends serverTimestamp() fields by name and drops undefined', async () => {
    await plcNotesWrite('p1', [
      {
        coll: 'comments',
        id: 'c1',
        op: 'update',
        fields: { deletedAt: SERVER_TS, body: 'x', skip: undefined },
      },
    ]);
    expect(callMock).toHaveBeenCalledWith({
      name: 'plcNotesWriteV1',
      payload: {
        plcId: 'p1',
        writes: [
          {
            coll: 'comments',
            id: 'c1',
            op: 'update',
            data: { body: 'x' },
            serverTime: ['deletedAt'],
          },
        ],
      },
    });
  });

  it('refuses other field values and Timestamps before calling', async () => {
    await expect(
      plcNotesWrite('p1', [
        { coll: 'notes', id: 'n', op: 'update', fields: { body: DELETE } },
      ])
    ).rejects.toThrow('unsupported field value');
    await expect(
      plcNotesWrite('p1', [
        { coll: 'notes', id: 'n', op: 'update', fields: { at: ts(1) } },
      ])
    ).rejects.toThrow('Timestamp values');
    expect(callMock).not.toHaveBeenCalled();
  });

  it('turns a callable refusal into a Firestore-style code', async () => {
    callMock.mockRejectedValueOnce(refusal('permission-denied', 'invalid'));
    const err = await plcNotesWrite('p1', [
      { coll: 'notes', id: 'n', op: 'update', fields: {} },
    ]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlcNotesWriteError);
    expect(err).toMatchObject({
      code: 'permission-denied',
      reason: 'invalid',
      message: 'Missing or insufficient permissions.',
    });
  });
});

describe('plcNotesMutate', () => {
  const build = (data: Record<string, unknown> | null) => ({
    write: data
      ? {
          op: 'update' as const,
          fields: { version: (data.version as number) + 1 },
        }
      : null,
    result: data ? 'wrote' : 'skipped',
  });

  it('sends the version and stamp it read as the precondition', async () => {
    getDocMock.mockResolvedValue(snap({ version: 2, lastEditedAt: ts(50) }));
    await expect(plcNotesMutate('p1', 'notes', 'n1', build)).resolves.toBe(
      'wrote'
    );
    const { payload } = callMock.mock.calls[0][0] as {
      payload: { writes: { expect: unknown }[] };
    };
    expect(payload.writes[0].expect).toEqual({ version: 2, lastEditedAt: 50 });
  });

  it('uses updatedAt for meetings', async () => {
    getDocMock.mockResolvedValue(snap({ version: 0, updatedAt: 7 }));
    await plcNotesMutate('p1', 'meetings', 'm1', build);
    const { payload } = callMock.mock.calls[0][0] as {
      payload: { writes: { expect: unknown }[] };
    };
    expect(payload.writes[0].expect).toEqual({ version: 0, updatedAt: 7 });
  });

  it('skips the call when there is nothing to write', async () => {
    getDocMock.mockResolvedValue(snap(null));
    await expect(plcNotesMutate('p1', 'notes', 'n1', build)).resolves.toBe(
      'skipped'
    );
    expect(callMock).not.toHaveBeenCalled();
  });

  it('re-reads and retries on a stale precondition or a lost create race', async () => {
    getDocMock
      .mockResolvedValueOnce(snap({ version: 1 }))
      .mockResolvedValueOnce(snap({ version: 2 }))
      .mockResolvedValueOnce(snap({ version: 3 }));
    callMock
      .mockRejectedValueOnce(refusal('aborted', 'stale'))
      .mockRejectedValueOnce(refusal('already-exists', 'alreadyExists'))
      .mockResolvedValueOnce({ data: { ok: true } });
    await plcNotesMutate('p1', 'notes', 'n1', build);
    expect(callMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a refusal', async () => {
    getDocMock.mockResolvedValue(snap({ version: 1 }));
    callMock.mockRejectedValue(refusal('permission-denied', 'notAllowed'));
    await expect(
      plcNotesMutate('p1', 'notes', 'n1', build)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(callMock).toHaveBeenCalledTimes(1);
  });
});
