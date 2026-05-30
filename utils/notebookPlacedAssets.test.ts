import { describe, it, expect } from 'vitest';
import {
  assetsForPage,
  createPlacedAsset,
  updatePlacedAsset,
  removePlacedAsset,
  remapPlacedAssetPages,
  clampWidthFrac,
  clamp01,
  DEFAULT_PLACED_ASSET_WIDTH_FRAC,
  MIN_PLACED_ASSET_WIDTH_FRAC,
} from './notebookPlacedAssets';
import { PlacedNotebookAsset } from '@/types';

const make = (over: Partial<PlacedNotebookAsset>): PlacedNotebookAsset => ({
  id: over.id ?? crypto.randomUUID(),
  notebookId: over.notebookId ?? 'nb1',
  page: over.page ?? 0,
  url: over.url ?? 'u',
  xFrac: over.xFrac ?? 0.5,
  yFrac: over.yFrac ?? 0.5,
  wFrac: over.wFrac ?? 0.2,
});

describe('clamp helpers', () => {
  it('clamp01 bounds to [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it('clampWidthFrac enforces the minimum', () => {
    expect(clampWidthFrac(0.001)).toBe(MIN_PLACED_ASSET_WIDTH_FRAC);
    expect(clampWidthFrac(5)).toBe(1);
  });
});

describe('assetsForPage', () => {
  it('filters by notebook and page, preserving order', () => {
    const all = [
      make({ id: 'a', notebookId: 'nb1', page: 0 }),
      make({ id: 'b', notebookId: 'nb1', page: 1 }),
      make({ id: 'c', notebookId: 'nb2', page: 0 }),
      make({ id: 'd', notebookId: 'nb1', page: 0 }),
    ];
    expect(assetsForPage(all, 'nb1', 0).map((a) => a.id)).toEqual(['a', 'd']);
  });
});

describe('createPlacedAsset', () => {
  it('centers on the drop point and defaults the width', () => {
    const a = createPlacedAsset({
      notebookId: 'nb1',
      page: 2,
      url: 'img',
      xFrac: 0.5,
      yFrac: 0.5,
    });
    expect(a.wFrac).toBe(DEFAULT_PLACED_ASSET_WIDTH_FRAC);
    // Centered: top-left = point - half width.
    expect(a.xFrac).toBeCloseTo(0.5 - DEFAULT_PLACED_ASSET_WIDTH_FRAC / 2);
    expect(a.yFrac).toBeCloseTo(0.5 - DEFAULT_PLACED_ASSET_WIDTH_FRAC / 2);
    expect(a.page).toBe(2);
  });

  it('clamps a drop near the edge so the origin stays on the page', () => {
    const a = createPlacedAsset({
      notebookId: 'nb1',
      page: 0,
      url: 'img',
      xFrac: 0,
      yFrac: 0,
    });
    expect(a.xFrac).toBe(0);
    expect(a.yFrac).toBe(0);
  });
});

describe('updatePlacedAsset / removePlacedAsset', () => {
  it('patches only the target and clamps position against width to stay on-page', () => {
    const all = [make({ id: 'a' }), make({ id: 'b' })];
    const next = updatePlacedAsset(all, 'a', { xFrac: 2, wFrac: 0 });
    const a = next.find((x) => x.id === 'a');
    // wFrac floors at the minimum; xFrac is bounded to 1 - wFrac, not 1, so
    // the whole asset stays on the page.
    expect(a?.wFrac).toBe(MIN_PLACED_ASSET_WIDTH_FRAC);
    expect(a?.xFrac).toBeCloseTo(1 - MIN_PLACED_ASSET_WIDTH_FRAC);
    expect(next.find((x) => x.id === 'b')?.xFrac).toBe(0.5);
  });

  it('re-clamps position when a resize would push the asset off-page', () => {
    const all = [make({ id: 'a', xFrac: 0.9, yFrac: 0.9, wFrac: 0.05 })];
    const next = updatePlacedAsset(all, 'a', { wFrac: 0.4 });
    const a = next.find((x) => x.id === 'a');
    expect(a?.wFrac).toBe(0.4);
    expect(a?.xFrac).toBeCloseTo(0.6);
    expect(a?.yFrac).toBeCloseTo(0.6);
  });

  it('removes by id', () => {
    const all = [make({ id: 'a' }), make({ id: 'b' })];
    expect(removePlacedAsset(all, 'a').map((x) => x.id)).toEqual(['b']);
  });
});

describe('remapPlacedAssetPages', () => {
  // Assets across two notebooks; only nb1 is the "active" one being remapped.
  // a0..a4 on nb1 pages 0..4, plus one stray asset on nb2 that must never move.
  const all = (): PlacedNotebookAsset[] => [
    make({ id: 'a0', notebookId: 'nb1', page: 0 }),
    make({ id: 'a2', notebookId: 'nb1', page: 2 }),
    make({ id: 'a4', notebookId: 'nb1', page: 4 }),
    make({ id: 'other', notebookId: 'nb2', page: 2 }),
  ];

  const pages = (assets: PlacedNotebookAsset[]) =>
    assets.map((a) => ({ id: a.id, notebookId: a.notebookId, page: a.page }));

  it('shifts assets at or after an insert point (insertBlankPage)', () => {
    // Insert at index 2: pages >= 2 shift right by one.
    const next = remapPlacedAssetPages(all(), 'nb1', (p) =>
      p >= 2 ? p + 1 : p
    );
    expect(pages(next)).toEqual([
      { id: 'a0', notebookId: 'nb1', page: 0 }, // < 2, unchanged
      { id: 'a2', notebookId: 'nb1', page: 3 }, // 2 -> 3
      { id: 'a4', notebookId: 'nb1', page: 5 }, // 4 -> 5
      { id: 'other', notebookId: 'nb2', page: 2 }, // other notebook untouched
    ]);
  });

  it('drops assets on a deleted page and shifts later ones left (deletePage)', () => {
    // Delete page 2: assets on page 2 dropped, pages > 2 shift left.
    const next = remapPlacedAssetPages(all(), 'nb1', (p) =>
      p === 2 ? null : p > 2 ? p - 1 : p
    );
    expect(pages(next)).toEqual([
      { id: 'a0', notebookId: 'nb1', page: 0 }, // < 2, unchanged
      { id: 'a4', notebookId: 'nb1', page: 3 }, // 4 -> 3
      { id: 'other', notebookId: 'nb2', page: 2 }, // other notebook untouched
    ]);
  });

  it('swaps the two pages involved in a move (movePage)', () => {
    // Move page 2 up to 1: indices 2 and 1 swap.
    const next = remapPlacedAssetPages(all(), 'nb1', (p) =>
      p === 2 ? 1 : p === 1 ? 2 : p
    );
    expect(pages(next)).toEqual([
      { id: 'a0', notebookId: 'nb1', page: 0 }, // not involved
      { id: 'a2', notebookId: 'nb1', page: 1 }, // 2 -> 1
      { id: 'a4', notebookId: 'nb1', page: 4 }, // not involved
      { id: 'other', notebookId: 'nb2', page: 2 }, // other notebook untouched
    ]);
  });

  it('never touches assets belonging to a different notebook', () => {
    // A remap that would otherwise drop page 2 must leave nb2's page-2 asset.
    const next = remapPlacedAssetPages(all(), 'nb1', () => null);
    expect(pages(next)).toEqual([{ id: 'other', notebookId: 'nb2', page: 2 }]);
  });

  it('returns an empty array (not undefined) when every active asset is dropped', () => {
    const onlyActive = [make({ id: 'a0', notebookId: 'nb1', page: 0 })];
    expect(remapPlacedAssetPages(onlyActive, 'nb1', () => null)).toEqual([]);
  });
});
