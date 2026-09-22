import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { collection, getDocs } from 'firebase/firestore';
import { bundleSubShareContent } from '@/utils/bundleSubShareContent';
import type { Dashboard, DrawableObject, WidgetData } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    __path: path.join('/'),
  })),
  getDocs: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockGetDocs = getDocs as Mock;

const stroke = (id: string, z: number): DrawableObject =>
  ({ id, z, kind: 'pen' }) as unknown as DrawableObject;

const drawing = (id: string, migrated: boolean, pageIds: string[]) =>
  ({
    id,
    type: 'drawing',
    config: {
      subcollectionMigrated: migrated,
      pages: pageIds.map((pid) => ({ id: pid })),
    },
  }) as unknown as WidgetData;

const board = (id: string, name: string, widgets: WidgetData[]) =>
  ({ id, name, widgets }) as unknown as Dashboard;

describe('bundleSubShareContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bundles a migrated drawing page by page, in z order', async () => {
    mockGetDocs.mockImplementation((ref: { __path: string }) => {
      const objects = ref.__path.endsWith('p1/objects')
        ? [stroke('b', 2), stroke('a', 1)]
        : [stroke('c', 1)];
      return Promise.resolve({ docs: objects.map((o) => ({ data: () => o })) });
    });

    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', true, ['p1', 'p2'])])],
    });

    expect(bundle.failures).toEqual([]);
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0].id).toBe('drawing_w1');
    expect(bundle.items[0].doc.payload).toEqual({
      pages: [
        { pageId: 'p1', objects: [stroke('a', 1), stroke('b', 2)] },
        { pageId: 'p2', objects: [stroke('c', 1)] },
      ],
    });
  });

  // A widget that never migrated still carries its strokes in the board's own
  // config, which the snapshot already copies — bundling it would duplicate it.
  it('skips a drawing that has not migrated to the subcollection', async () => {
    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', false, ['p1'])])],
    });

    expect(bundle.items).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('reads from the teacher’s own account, not the caller’s', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', true, ['p1'])])],
    });

    const firstRef = (collection as Mock).mock.results[0].value as {
      __path: string;
    };
    expect(firstRef.__path).toBe(
      'users/teacher-1/dashboards/b1/drawings/w1/pages/p1/objects'
    );
  });

  // Shipping a widget the sub will find empty, with nobody told, is the thing
  // bundling exists to prevent.
  it('reports an item it could not read rather than shipping it empty', async () => {
    mockGetDocs.mockRejectedValue(new Error('offline'));

    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', true, ['p1'])])],
    });

    expect(bundle.items).toEqual([]);
    expect(bundle.failures).toEqual([
      { kind: 'drawing', itemId: 'w1', label: 'Drawing on Warm up' },
    ]);
  });

  it('carries on to the next board after a failure', async () => {
    mockGetDocs
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ docs: [] });

    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [
        board('b1', 'Warm up', [drawing('w1', true, ['p1'])]),
        board('b2', 'Reading', [drawing('w2', true, ['p1'])]),
      ],
    });

    expect(bundle.failures.map((f) => f.itemId)).toEqual(['w1']);
    expect(bundle.items.map((i) => i.id)).toEqual(['drawing_w2']);
  });
});
