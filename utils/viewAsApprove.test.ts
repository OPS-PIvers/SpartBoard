import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingChange } from '@/utils/viewAsBoards';
import type { WidgetData } from '@/types';

const txUpdate = vi.fn();
const txSet = vi.fn();
let stored: Record<string, unknown> | null = null;

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'u1',
      email: 'Jane@orono.k12.mn.us',
      getIdTokenResult: () =>
        Promise.resolve({
          claims: {
            viewAs: { by: 'admin@orono.k12.mn.us', sid: 's1', ro: false },
          },
        }),
    },
  },
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'audit-col'),
  doc: vi.fn((...args: unknown[]) =>
    args.length === 1 ? 'audit-ref' : args.slice(1).join('/')
  ),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  runTransaction: vi.fn((_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: () =>
        Promise.resolve({
          exists: () => stored !== null,
          get: (k: string) => stored?.[k],
        }),
      update: txUpdate,
      set: txSet,
    })
  ),
}));

import { approveViewAsChange } from './viewAsApprove';

const change = (over: Partial<PendingChange> = {}): PendingChange => ({
  key: 'b1/w1/config',
  boardId: 'b1',
  boardName: 'Period 1',
  widgetId: 'w1',
  widget: { id: 'w1', x: 1, y: 2, w: 3, h: 4 } as WidgetData,
  kind: 'config',
  before: { config: { a: 1 } },
  after: { config: { a: 2 } },
  stale: false,
  ...over,
});

describe('approveViewAsChange', () => {
  beforeEach(() => {
    txUpdate.mockClear();
    txSet.mockClear();
    stored = {
      widgets: [
        { id: 'w0', config: {} },
        { id: 'w1', version: 4, xProp: 0.1, config: { a: 9 }, z: 2 },
      ],
    };
  });

  it('replaces only that widget config, bumps its version, and audits in the same transaction', async () => {
    await expect(approveViewAsChange(change())).resolves.toBe('approved');
    const [, payload] = txUpdate.mock.calls[0] as [
      unknown,
      { widgets: Record<string, unknown>[] },
    ];
    expect(payload.widgets[0]).toEqual({ id: 'w0', config: {} });
    expect(payload.widgets[1]).toEqual({
      id: 'w1',
      version: 5,
      xProp: 0.1,
      config: { a: 2 },
      z: 2,
    });
    expect(txSet).toHaveBeenCalledWith('audit-ref', {
      action: 'view_as_approve',
      sid: 's1',
      email: 'admin@orono.k12.mn.us',
      targetEmail: 'jane@orono.k12.mn.us',
      targetUid: 'u1',
      path: 'users/u1/dashboards/b1#widgets/w1',
      before: { config: { a: 9 } },
      after: { config: { a: 2 } },
      timestamp: 'SERVER_TS',
    });
  });

  it('writes layout fields with pixels and removes a field missing from after', async () => {
    await approveViewAsChange(
      change({
        kind: 'layout',
        before: { xProp: 0.1, z: 2 },
        after: { xProp: 0.5 },
      })
    );
    const [, payload] = txUpdate.mock.calls[0] as [
      unknown,
      { widgets: Record<string, unknown>[] },
    ];
    expect(payload.widgets[1]).toEqual({
      id: 'w1',
      version: 4,
      xProp: 0.5,
      config: { a: 9 },
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    });
  });

  it('is stale and writes nothing when the widget is gone', async () => {
    stored = { widgets: [{ id: 'w0' }] };
    await expect(approveViewAsChange(change())).resolves.toBe('stale');
    expect(txUpdate).not.toHaveBeenCalled();
    expect(txSet).not.toHaveBeenCalled();
  });
});
