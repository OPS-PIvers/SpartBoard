import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SentRequest {
  plcId: string;
  writes: {
    op: string;
    coll: string;
    id: string;
    data?: Record<string, unknown>;
  }[];
}
const h = vi.hoisted(() => ({
  call: vi.fn<(req: SentRequest) => Promise<unknown>>(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => h.call),
}));
vi.mock('@/config/firebase', () => ({ functions: { __mock: 'functions' } }));
const va = vi.hoisted(() => ({
  blocks: vi.fn((_paths: readonly string[]) => false),
  needsAudit: vi.fn((_paths: readonly string[]) => false),
  record: vi.fn((_writes: unknown[]) => Promise.resolve()),
}));
vi.mock('@/utils/viewAsTab', () => ({
  ViewAsReadOnlyError: class extends Error {},
  viewAsBlocksRawWrite: va.blocks,
  viewAsRawWriteNeedsAudit: va.needsAudit,
}));
vi.mock('@/utils/viewAsAudit', () => ({ recordViewAsRawWrites: va.record }));

import { httpsCallable } from 'firebase/functions';
import {
  PLC_DELETE_FIELD,
  PLC_SERVER_TIME,
  deletePlcContentDoc,
  setPlcContentDoc,
  updatePlcContentDoc,
  writePlcContent,
} from '@/utils/plcContentWrites';

beforeEach(() => {
  h.call.mockReset();
  h.call.mockResolvedValue({ data: { written: 1 } });
});

describe('plcContentWrites', () => {
  it('sends set, update and delete to plcContentWriteV1', async () => {
    await setPlcContentDoc('p', 'quizzes', 'q1', {
      title: 'A',
      updatedAt: PLC_SERVER_TIME,
    });
    await updatePlcContentDoc('p', 'rubrics', 'r1', {
      description: PLC_DELETE_FIELD,
    });
    await deletePlcContentDoc('p', 'assignments', 'a1');
    expect(httpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'plcContentWriteV1'
    );
    expect(h.call.mock.calls.map((c) => c[0])).toEqual([
      {
        plcId: 'p',
        writes: [
          {
            op: 'set',
            coll: 'quizzes',
            id: 'q1',
            data: { title: 'A', updatedAt: { __plcSentinel: 'serverTime' } },
          },
        ],
      },
      {
        plcId: 'p',
        writes: [
          {
            op: 'update',
            coll: 'rubrics',
            id: 'r1',
            data: { description: { __plcSentinel: 'deleteField' } },
          },
        ],
      },
      { plcId: 'p', writes: [{ op: 'delete', coll: 'assignments', id: 'a1' }] },
    ]);
  });

  it('drops undefined values as Firestore did, instead of sending null', async () => {
    await setPlcContentDoc('p', 'assignments', 'a1', {
      attemptLimit: undefined,
      sessionOptions: { a: undefined, b: true },
      list: [{ c: undefined, d: 1 }],
    });
    expect(h.call.mock.calls[0][0].writes[0].data).toEqual({
      sessionOptions: { b: true },
      list: [{ d: 1 }],
    });
  });

  it('splits more than 100 writes into separate calls', async () => {
    const writes = Array.from({ length: 150 }, (_, i) => ({
      op: 'delete' as const,
      coll: 'quizzes' as const,
      id: `q${i}`,
    }));
    await writePlcContent('p', writes);
    expect(h.call.mock.calls.map((c) => c[0].writes.length)).toEqual([100, 50]);
  });

  it('rethrows with the bare Firestore code and message', async () => {
    h.call.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { code: 'functions/permission-denied' })
    );
    await expect(
      deletePlcContentDoc('p', 'quizzes', 'q1')
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });
    h.call.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { code: 'functions/not-found' })
    );
    await expect(
      updatePlcContentDoc('p', 'quizzes', 'q1', {})
    ).rejects.toMatchObject({
      code: 'not-found',
    });
    h.call.mockRejectedValueOnce(
      Object.assign(new Error('offline'), { code: 'functions/unavailable' })
    );
    await expect(
      deletePlcContentDoc('p', 'quizzes', 'q1')
    ).rejects.toMatchObject({
      code: 'unavailable',
      message: 'offline',
    });
  });
});

describe('plcContentWrites in a View as tab', () => {
  it('blocks a write the raw-write guard would block, without calling the server', async () => {
    va.blocks.mockReturnValueOnce(true);
    await expect(
      deletePlcContentDoc('p', 'quizzes', 'q1')
    ).rejects.toBeInstanceOf(Error);
    expect(va.blocks).toHaveBeenCalledWith(['plcs/p/quizzes/q1']);
    expect(h.call).not.toHaveBeenCalled();
  });

  it('logs the change in the View as log after the server accepts it', async () => {
    va.needsAudit.mockReturnValueOnce(true);
    await updatePlcContentDoc('p', 'rubrics', 'r1', { title: 'T' });
    expect(va.record).toHaveBeenCalledWith([
      { op: 'update', path: 'plcs/p/rubrics/r1', data: { title: 'T' } },
    ]);
  });
});
