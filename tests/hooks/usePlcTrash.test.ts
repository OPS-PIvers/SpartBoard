/**
 * Unit coverage for the Wave-2 soft-delete substrate (Decision 3.1, §3.10):
 *
 *   1. LIST FILTERING — the content parsers (`parseTodo`, `parseDoc`,
 *      `parsePlcQuizEntry`, `parsePlcVideoActivityEntry`) now surface `deletedAt`,
 *      and the live lists drop `deletedAt != null`. This file pins the
 *      parse-then-filter math so a regression that leaks a tombstoned row into a
 *      normal list (or hides a live one) is caught without an emulator.
 *
 *   2. RESTORE + UNDO — `usePlcSoftDelete(plcId).softDelete(...)` runs the
 *      delete, fires an `item_deleted` activity event, and shows an UNDO toast
 *      whose action runs the restore and fires `item_restored`. Firestore is
 *      never touched: the delete/restore mutators are supplied by the caller and
 *      the activity writer is mocked.
 *
 * The Firestore-listener side of `usePlcTrash` (the six subscriptions) is
 * exercised via the rules emulator suite (`plcSoftDelete.test.ts`) and the
 * component-level wiring; here we pin the testable logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Toast } from '@/types';

// --- Mocks (declared before importing the hook under test) -----------------

const writePlcActivityEvent = vi.fn<(...a: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
);
vi.mock('@/utils/plcActivity', () => ({
  writePlcActivityEvent: (...args: unknown[]): Promise<void> =>
    writePlcActivityEvent(...args),
}));

const mockUser = {
  uid: 'me-uid',
  displayName: 'Mona Member',
  email: 'mona@example.com',
};
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

// usePlcTrash imports config/firebase (db) + firebase/firestore at module load
// for the aggregator + restore writer; stub them so importing the module is
// side-effect-free in the test env. The soft-delete action path never calls
// them (it uses the caller-supplied runDelete/runRestore).
vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
  updateDoc: vi.fn(),
}));

import { usePlcSoftDelete } from '@/hooks/usePlcTrash';
import { parseTodo } from '@/hooks/usePlcTodos';
import { parseDoc } from '@/hooks/usePlcDocs';
import { parsePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { parsePlcVideoActivityEntry } from '@/hooks/usePlcVideoActivities';

// ---------------------------------------------------------------------------
// 1. List filtering — parse-then-filter
// ---------------------------------------------------------------------------

/** The live-list predicate every snapshot/provider slice applies. */
const isLive = (item: { deletedAt?: number | null }) => item.deletedAt == null;

/** Narrow a parser result to non-null, failing the test with context if null. */
function mustParse<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`expected ${label} to parse, got null`);
  return value;
}

describe('soft-delete list filtering', () => {
  it('parseTodo surfaces deletedAt and the live filter drops tombstoned to-dos', () => {
    const live = mustParse(
      parseTodo('a', {
        text: 'Live',
        done: false,
        createdBy: 'u',
        createdAt: 1,
      }),
      'live todo'
    );
    const deleted = mustParse(
      parseTodo('b', {
        text: 'Deleted',
        done: false,
        createdBy: 'u',
        createdAt: 1,
        deletedAt: 5000,
      }),
      'deleted todo'
    );
    expect(live.deletedAt).toBeUndefined();
    expect(deleted.deletedAt).toBe(5000);
    const list = [live, deleted].filter(isLive);
    expect(list).toHaveLength(1);
    expect(list[0]?.text).toBe('Live');
  });

  it('parseTodo treats explicit null deletedAt as live', () => {
    const restored = mustParse(
      parseTodo('a', {
        text: 'Restored',
        done: false,
        createdBy: 'u',
        createdAt: 1,
        deletedAt: null,
      }),
      'restored todo'
    );
    expect(restored.deletedAt).toBeNull();
    expect([restored].filter(isLive)).toHaveLength(1);
  });

  it('parseDoc surfaces deletedAt and the live filter drops tombstoned docs', () => {
    const deleted = mustParse(
      parseDoc('d', {
        title: 'Old doc',
        url: 'https://docs.google.com/document/d/x',
        createdBy: 'u',
        createdByName: 'U',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: 9000,
      }),
      'deleted doc'
    );
    expect(deleted.deletedAt).toBe(9000);
    expect([deleted].filter(isLive)).toHaveLength(0);
  });

  it('parsePlcQuizEntry surfaces deletedAt (int) and filters tombstoned entries', () => {
    const base = {
      title: 'CFA',
      questionCount: 10,
      syncGroupId: 'g1',
      sharedBy: 'u',
      sharedAt: 1,
      updatedAt: 1,
    };
    const live = mustParse(parsePlcQuizEntry('q1', base), 'live quiz');
    const deleted = mustParse(
      parsePlcQuizEntry('q2', { ...base, deletedAt: 7000 }),
      'deleted quiz'
    );
    expect(live.deletedAt).toBeUndefined();
    expect(deleted.deletedAt).toBe(7000);
    expect([live, deleted].filter(isLive)).toEqual([live]);
  });

  it('parsePlcVideoActivityEntry surfaces deletedAt and filters tombstoned entries', () => {
    const base = {
      title: 'VA',
      youtubeUrl: 'https://youtu.be/x',
      questionCount: 3,
      syncGroupId: 'g1',
      sharedBy: 'u',
      sharedAt: 1,
      updatedAt: 1,
    };
    const live = mustParse(parsePlcVideoActivityEntry('v1', base), 'live VA');
    const deleted = mustParse(
      parsePlcVideoActivityEntry('v2', { ...base, deletedAt: 8 }),
      'deleted VA'
    );
    expect(deleted.deletedAt).toBe(8);
    expect([live, deleted].filter(isLive)).toEqual([live]);
  });
});

// ---------------------------------------------------------------------------
// 2. usePlcSoftDelete — soft-delete + undo + activity
// ---------------------------------------------------------------------------

describe('usePlcSoftDelete', () => {
  beforeEach(() => {
    writePlcActivityEvent.mockClear();
    addToast.mockClear();
  });

  function setup() {
    const runDelete = vi.fn().mockResolvedValue(undefined);
    const runRestore = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlcSoftDelete('plc-1'));
    return { result, runDelete, runRestore };
  }

  it('runs the delete, logs item_deleted, and shows an undo toast', async () => {
    const { result, runDelete, runRestore } = setup();
    await act(async () => {
      await result.current.softDelete({
        type: 'note',
        id: 'n1',
        title: 'Agenda',
        runDelete,
        runRestore,
      });
    });

    expect(runDelete).toHaveBeenCalledTimes(1);
    // item_deleted event fired with the right meta.
    expect(writePlcActivityEvent).toHaveBeenCalledWith(
      'plc-1',
      expect.objectContaining({
        type: 'item_deleted',
        actorUid: 'me-uid',
        actorName: 'Mona Member',
        targetType: 'note',
        targetId: 'n1',
        targetTitle: 'Agenda',
      })
    );
    // Undo toast shown with an action.
    expect(addToast).toHaveBeenCalledTimes(1);
    const [, type, action] = addToast.mock.calls[0] as [
      string,
      string,
      Toast['action'],
    ];
    expect(type).toBe('info');
    expect(action?.label).toBe('Undo');
    expect(typeof action?.onClick).toBe('function');
  });

  it('undo action restores the item and logs item_restored', async () => {
    const { result, runDelete, runRestore } = setup();
    await act(async () => {
      await result.current.softDelete({
        type: 'todo',
        id: 'td1',
        title: 'Run CFA',
        runDelete,
        runRestore,
      });
    });
    const action = (
      addToast.mock.calls[0] as [string, string, Toast['action']]
    )[2];
    if (!action) throw new Error('undo toast action missing');

    writePlcActivityEvent.mockClear();
    await act(async () => {
      action.onClick();
      // let the void-promise chain settle
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runRestore).toHaveBeenCalledTimes(1);
    expect(writePlcActivityEvent).toHaveBeenCalledWith(
      'plc-1',
      expect.objectContaining({
        type: 'item_restored',
        targetType: 'todo',
        targetId: 'td1',
        targetTitle: 'Run CFA',
      })
    );
  });

  it('does NOT show the undo toast when the delete write fails', async () => {
    const { result, runRestore } = setup();
    const runDelete = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      act(async () => {
        await result.current.softDelete({
          type: 'doc',
          id: 'd1',
          title: 'Doc',
          runDelete,
          runRestore,
        });
      })
    ).rejects.toThrow('boom');
    expect(addToast).not.toHaveBeenCalled();
    expect(writePlcActivityEvent).not.toHaveBeenCalled();
  });
});
