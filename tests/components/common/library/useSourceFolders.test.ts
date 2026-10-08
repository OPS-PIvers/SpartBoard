// Source folders and private filing (LIBRARY_FOLDERS D21-D24).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import type { LibraryPlacement } from '@/hooks/useLibraryPlacements';
import { useSourceFolders } from '@/components/common/library/useSourceFolders';

const place = vi.fn().mockResolvedValue(undefined);
const unplace = vi.fn().mockResolvedValue(undefined);
const pruneMissing = vi.fn();
let placements: LibraryPlacement[] = [];
let placementsLoading = false;

vi.mock('@/hooks/useLibraryPlacements', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useLibraryPlacements')>();
  return {
    ...actual,
    useLibraryPlacements: () => ({
      byKey: new Map(placements.map((p) => [p.sourceKey, p])),
      loading: placementsLoading,
      place,
      unplace,
      pruneMissing,
    }),
  };
});

const OWN: LibraryFolder[] = [
  { id: 'unit', name: 'Unit 3', parentId: null, order: 0, createdAt: 0 },
];
const KEYS = ['building:a', 'building:b', 'building:c'];

const run = (overrides: Partial<Parameters<typeof useSourceFolders>[0]> = {}) =>
  renderHook(() =>
    useSourceFolders({
      userId: 'u1',
      widget: 'guided_learning',
      enabled: true,
      sourceKeys: KEYS,
      ownFolders: OWN,
      ready: true,
      ...overrides,
    })
  ).result.current;

describe('useSourceFolders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    placementsLoading = false;
    placements = [
      { sourceKey: 'building:a', folderId: 'unit', updatedAt: 1 },
      { sourceKey: 'building:b', folderId: 'deleted-folder', updatedAt: 1 },
    ];
  });

  it('adds a pinned source folder and resolves each item', () => {
    const sf = run();
    expect(sf.folders.map((f) => f.id)).toEqual(['source:building', 'unit']);
    expect(sf.folderIdOf('building:a')).toBe('unit');
    // A placement in a deleted folder falls back to the source folder (D19).
    expect(sf.folderIdOf('building:b')).toBe('source:building');
    expect(sf.folderIdOf('building:c')).toBe('source:building');
    expect(sf.placedChip('building:a')).toBe('Building');
    expect(sf.placedChip('building:c')).toBeNull();
    expect(sf.placed).toEqual([{ folderId: 'unit', source: 'building' }]);
  });

  it('files into own folders and returns to the source otherwise', async () => {
    const sf = run();
    await sf.move('building:c', 'unit');
    expect(place).toHaveBeenCalledWith('building:c', 'unit');
    await sf.move('building:a', 'source:building');
    await sf.move('building:b', null);
    expect(unplace).toHaveBeenCalledWith('building:a');
    expect(unplace).toHaveBeenCalledWith('building:b');
    await sf.move('building:c', null);
    expect(unplace).toHaveBeenCalledTimes(2);
  });

  it('keeps today’s folders and skips cleanup with the flag off', () => {
    const sf = run({ enabled: false });
    expect(sf.folders).toBe(OWN);
    expect(sf.placedChip('building:a')).toBeNull();
    expect(pruneMissing).not.toHaveBeenCalled();
  });

  it('cleans up only after every source has loaded', () => {
    run({ ready: false });
    expect(pruneMissing).not.toHaveBeenCalled();
    run({ sourceKeys: [] });
    expect(pruneMissing).not.toHaveBeenCalled();
    run();
    expect(pruneMissing).toHaveBeenCalledWith(new Set(KEYS));
  });

  it('shows no source folder when the widget has no source items', () => {
    expect(run({ sourceKeys: [] }).folders).toBe(OWN);
  });
});
