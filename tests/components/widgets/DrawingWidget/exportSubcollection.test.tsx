import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type {
  DrawableObject,
  DrawingConfig,
  DrawingPage,
  WidgetData,
} from '@/types';

/**
 * Regression coverage for the post-migration export path.
 *
 * Once `migrateDrawingToSubcollection` runs, the dashboard doc's
 * `pages[].objects` is deliberately emptied — it becomes a denormalized
 * `{ id, background }` cache and the objects live in the page-nested
 * subcollection. The export handlers used to hand `activePage` / `pages`
 * (both sourced from `widget.config`) straight to the export pipeline, so
 * every migrated widget exported background-only PNGs and PDFs.
 *
 * These tests assert the pages reaching the export pipeline actually carry
 * their objects: the active page from the live subscription, the rest read
 * back from Firestore.
 */

const liveObjects: DrawableObject[] = [
  {
    id: 'live-1',
    kind: 'path',
    z: 0,
    points: [{ x: 1, y: 1 }],
    color: '#111111',
    width: 4,
  } as DrawableObject,
];

const page2Objects: DrawableObject[] = [
  {
    id: 'remote-1',
    kind: 'path',
    z: 0,
    points: [{ x: 2, y: 2 }],
    color: '#222222',
    width: 4,
  } as DrawableObject,
];

const addToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    bringToFront: vi.fn(),
    activeDashboard: { id: 'dash-1', widgets: [] },
    addToast,
    addWidget: vi.fn(),
    drawingWidgetsMigrating: new Set<string>(),
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1' }, canAccessFeature: () => true }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadFile: vi.fn() }),
}));

// Live page subscription — stands in for the real subcollection listener.
vi.mock('@/components/widgets/DrawingWidget/useDrawingObjectsDoc', () => ({
  useDrawingObjectsDoc: () => ({
    objects: liveObjects,
    addObject: vi.fn(),
    updateObject: vi.fn(),
    removeObject: vi.fn(),
    clear: vi.fn(),
    loading: false,
  }),
}));

// Firestore surface used by the non-active-page rehydration.
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  getDocs: (ref: string) => {
    if (ref.includes('/pages/page-2/objects')) {
      return Promise.resolve({
        docs: page2Objects.map((o) => ({ data: () => o })),
      });
    }
    return Promise.resolve({ docs: [] });
  },
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}));

interface PageSize {
  w: number;
  h: number;
}
const exportPagePng = vi
  .fn<(page: DrawingPage, size: PageSize) => Promise<string>>()
  .mockResolvedValue('data:image/png;base64,AAA');
const exportAllPagesPng = vi
  .fn<(pages: readonly DrawingPage[], size: PageSize) => Promise<string[]>>()
  .mockResolvedValue(['data:image/png;base64,AAA']);
const exportPdf = vi
  .fn<(pages: readonly DrawingPage[], size: PageSize) => Promise<void>>()
  .mockResolvedValue(undefined);
const downloadDataUrl = vi.fn<(dataUrl: string, filename: string) => void>();
vi.mock('@/components/widgets/DrawingWidget/exportCanvas', () => ({
  exportPagePng,
  exportAllPagesPng,
  exportPdf,
  downloadDataUrl,
}));

const { DrawingWidget } =
  await import('@/components/widgets/DrawingWidget/Widget');

const makeWidget = (config: DrawingConfig): WidgetData =>
  ({
    id: 'widget-1',
    type: 'drawing',
    x: 0,
    y: 0,
    w: 800,
    h: 600,
    z: 1,
    flipped: false,
    minimized: false,
    config,
  }) as unknown as WidgetData;

// Post-migration config: objects stripped from the denormalized page cache.
const migratedConfig = (): DrawingConfig =>
  ({
    subcollectionMigrated: true,
    currentPage: 0,
    pages: [
      { id: 'page-1', objects: [], background: 'blank' },
      { id: 'page-2', objects: [], background: 'grid' },
    ],
  }) as unknown as DrawingConfig;

const idsOf = (page: DrawingPage): string[] => page.objects.map((o) => o.id);

const openExportMenu = (getByLabelText: (t: string) => HTMLElement) => {
  fireEvent.click(getByLabelText('Export'));
};

const clickExportItem = (label: string) => {
  const popover = document.querySelector(
    '[data-testid="drawing-export-popover"]'
  );
  const button = Array.from(popover?.querySelectorAll('button') ?? []).find(
    (b) => b.textContent === label
  );
  if (!button) throw new Error(`export item not found: ${label}`);
  fireEvent.click(button);
};

describe('DrawingWidget export — subcollection-migrated widgets', () => {
  beforeEach(() => {
    exportPagePng.mockClear();
    exportAllPagesPng.mockClear();
    exportPdf.mockClear();
    downloadDataUrl.mockClear();
    addToast.mockClear();
  });
  afterEach(cleanup);

  it('exports the current page with its live objects, not the emptied cache', async () => {
    const { getByLabelText } = render(
      <DrawingWidget widget={makeWidget(migratedConfig())} />
    );
    openExportMenu(getByLabelText);
    clickExportItem('Export PNG (this page)');

    await waitFor(() => expect(exportPagePng).toHaveBeenCalledTimes(1));
    const [page] = exportPagePng.mock.calls[0];
    expect(page.id).toBe('page-1');
    expect(idsOf(page)).toEqual(['live-1']);
  });

  it('exports all pages with objects rehydrated from the subcollection', async () => {
    const { getByLabelText } = render(
      <DrawingWidget widget={makeWidget(migratedConfig())} />
    );
    openExportMenu(getByLabelText);
    clickExportItem('Export PNG (all pages)');

    await waitFor(() => expect(exportAllPagesPng).toHaveBeenCalledTimes(1));
    const [pages] = exportAllPagesPng.mock.calls[0];
    expect(pages.map((p) => [p.id, idsOf(p)])).toEqual([
      ['page-1', ['live-1']],
      ['page-2', ['remote-1']],
    ]);
  });

  it('exports a PDF with objects rehydrated from the subcollection', async () => {
    const { getByLabelText } = render(
      <DrawingWidget widget={makeWidget(migratedConfig())} />
    );
    openExportMenu(getByLabelText);
    clickExportItem('Export PDF');

    await waitFor(() => expect(exportPdf).toHaveBeenCalledTimes(1));
    const [pages] = exportPdf.mock.calls[0];
    expect(pages.map(idsOf)).toEqual([['live-1'], ['remote-1']]);
  });

  it('still exports pre-migration configs straight from the dashboard doc', async () => {
    const legacyObjects: DrawableObject[] = [
      {
        id: 'legacy-1',
        kind: 'path',
        z: 0,
        points: [{ x: 3, y: 3 }],
        color: '#333333',
        width: 4,
      } as DrawableObject,
    ];
    const config = {
      currentPage: 0,
      pages: [
        { id: 'page-a', objects: legacyObjects, background: 'blank' },
        { id: 'page-b', objects: [], background: 'lines' },
      ],
    } as unknown as DrawingConfig;

    const { getByLabelText } = render(
      <DrawingWidget widget={makeWidget(config)} />
    );
    openExportMenu(getByLabelText);
    clickExportItem('Export PNG (all pages)');

    await waitFor(() => expect(exportAllPagesPng).toHaveBeenCalledTimes(1));
    const [pages] = exportAllPagesPng.mock.calls[0];
    expect(idsOf(pages[0])).toEqual(['legacy-1']);
    expect(pages[1].objects).toEqual([]);
  });
});
