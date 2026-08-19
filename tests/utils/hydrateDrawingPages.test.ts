import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { DrawableObject, DrawingPage } from '@/types';

// Mock the Firestore surface the util touches. `collection(...)` returns the
// joined path so `getDocs` can key its canned response off it — that also
// asserts the util addresses the exact page-nested path the migration writes.
interface FakeSnapshot {
  docs: { data: () => DrawableObject }[];
}
const getDocsMock = vi.fn<(ref: string) => FakeSnapshot>();
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  getDocs: (ref: string) => getDocsMock(ref),
}));

const { hydrateDrawingPagesFromSubcollection } =
  await import('@/utils/hydrateDrawingPages');

const db = {} as Firestore;

const obj = (id: string, z: number): DrawableObject =>
  ({
    id,
    kind: 'path',
    z,
    points: [{ x: 0, y: 0 }],
    color: '#000',
    width: 2,
  }) as DrawableObject;

const snapshotOf = (objects: DrawableObject[]) => ({
  docs: objects.map((o) => ({ data: () => o })),
});

// Post-migration shape: the dashboard doc keeps id + background only.
const denormalizedPages: DrawingPage[] = [
  { id: 'page-1', objects: [], background: 'blank' },
  { id: 'page-2', objects: [], background: 'grid' },
];

const pathFor = (pageId: string) =>
  `users/uid-1/dashboards/dash-1/drawings/widget-1/pages/${pageId}/objects`;

describe('hydrateDrawingPagesFromSubcollection', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
  });

  it('fills objects[] for every page from the page-nested subcollection', async () => {
    getDocsMock.mockImplementation((ref: string) => {
      if (ref === pathFor('page-1')) return snapshotOf([obj('a', 0)]);
      if (ref === pathFor('page-2')) return snapshotOf([obj('b', 0)]);
      throw new Error(`unexpected path: ${ref}`);
    });

    const out = await hydrateDrawingPagesFromSubcollection({
      db,
      uid: 'uid-1',
      dashboardId: 'dash-1',
      widgetId: 'widget-1',
      pages: denormalizedPages,
    });

    expect(out.map((p) => p.objects.map((o) => o.id))).toEqual([['a'], ['b']]);
    // Page metadata from the denormalized cache is carried through untouched.
    expect(out.map((p) => p.background)).toEqual(['blank', 'grid']);
  });

  it('serves the live page from liveObjects instead of re-reading it', async () => {
    getDocsMock.mockImplementation((ref: string) => {
      if (ref === pathFor('page-2')) return snapshotOf([obj('b', 0)]);
      throw new Error(`unexpected path: ${ref}`);
    });

    const live = [obj('live-a', 0), obj('live-b', 1)];
    const out = await hydrateDrawingPagesFromSubcollection({
      db,
      uid: 'uid-1',
      dashboardId: 'dash-1',
      widgetId: 'widget-1',
      pages: denormalizedPages,
      livePageId: 'page-1',
      liveObjects: live,
    });

    expect(out[0].objects.map((o) => o.id)).toEqual(['live-a', 'live-b']);
    expect(out[1].objects.map((o) => o.id)).toEqual(['b']);
    // Only the non-live page was read.
    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(getDocsMock).toHaveBeenCalledWith(pathFor('page-2'));
    // The live array is copied, not aliased — the export pipeline sorts in
    // place, which must not reorder the widget's live state.
    expect(out[0].objects).not.toBe(live);
  });

  it('sorts fetched objects ascending by z (last-drawn-on-top)', async () => {
    getDocsMock.mockImplementation(() =>
      snapshotOf([obj('c', 5), obj('a', 1), obj('b', 3)])
    );

    const out = await hydrateDrawingPagesFromSubcollection({
      db,
      uid: 'uid-1',
      dashboardId: 'dash-1',
      widgetId: 'widget-1',
      pages: [denormalizedPages[0]],
    });

    expect(out[0].objects.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty page list for an empty page list', async () => {
    const out = await hydrateDrawingPagesFromSubcollection({
      db,
      uid: 'uid-1',
      dashboardId: 'dash-1',
      widgetId: 'widget-1',
      pages: [],
    });
    expect(out).toEqual([]);
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});
