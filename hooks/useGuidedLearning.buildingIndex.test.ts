import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
} from '@/types';

type Emit = (docs: { id: string; data: unknown }[]) => void;

const fs = vi.hoisted(() => ({
  listened: [] as string[],
  emit: {} as Record<string, Emit>,
  emitMeta: null as null | ((exists: boolean) => void),
  getDoc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  query: (path: string) => path,
  orderBy: () => null,
  onSnapshot: (path: string, next: (snap: unknown) => void) => {
    fs.listened.push(path);
    if (path === 'building_guided_learning_index/_meta') {
      fs.emitMeta = (exists) => next({ exists: () => exists });
    } else {
      fs.emit[path] = (docs) =>
        next({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
    }
    return () => undefined;
  },
  getDoc: fs.getDoc,
  setDoc: fs.setDoc,
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: () => null,
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ googleAccessToken: null, isAdmin: true }),
}));
vi.mock('./useGoogleDrive', () => ({
  useGoogleDrive: () => ({ isConnected: false }),
}));

import { useGuidedLearning } from './useGuidedLearning';
import { SetTooLargeError } from '@/utils/firestoreDocSize';

const entry: GuidedLearningBuildingSetIndex = {
  id: 'b-1',
  title: 'Cells',
  description: null,
  stepCount: 4,
  mode: 'guided',
  thumbnail: 'https://example.com/a.png',
  createdAt: 1,
  updatedAt: 2,
  hasLiveTour: false,
  isHelpCenter: false,
  folderId: null,
  order: null,
};

const fullSet = (over: Partial<GuidedLearningSet> = {}): GuidedLearningSet => ({
  id: 'b-1',
  title: 'Cells',
  imageUrls: ['https://example.com/a.png'],
  steps: [],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 2,
  isBuilding: true,
  ...over,
});

beforeEach(() => {
  fs.listened = [];
  fs.emit = {};
  fs.emitMeta = null;
  fs.getDoc.mockReset();
  fs.setDoc.mockClear();
});

describe('useGuidedLearning building-set index', () => {
  it('lists building sets from the index once backfilled, skipping control docs', async () => {
    const { result } = renderHook(() => useGuidedLearning(undefined));
    expect(fs.listened).toEqual(['building_guided_learning_index/_meta']);

    act(() => fs.emitMeta?.(true));
    expect(fs.listened).toContain('building_guided_learning_index');
    expect(fs.listened).not.toContain('building_guided_learning');
    act(() =>
      fs.emit['building_guided_learning_index']([
        { id: 'b-1', data: entry },
        { id: '_meta', data: { backfilledAt: 1 } },
        { id: '_lock', data: { startedAt: 1 } },
      ])
    );

    await waitFor(() => expect(result.current.buildingLoading).toBe(false));
    expect(result.current.buildingSets).toEqual([entry]);
    expect(fs.getDoc).not.toHaveBeenCalled();
  });

  it('falls back to the full sets before the index is backfilled, then switches', async () => {
    const { result } = renderHook(() => useGuidedLearning(undefined));
    act(() => fs.emitMeta?.(false));
    expect(fs.listened).toContain('building_guided_learning');
    expect(fs.listened).not.toContain('building_guided_learning_index');
    act(() =>
      fs.emit['building_guided_learning']([
        { id: 'b-1', data: fullSet({ steps: [{ id: 's' }] as never }) },
      ])
    );
    await waitFor(() => expect(result.current.buildingLoading).toBe(false));
    expect(result.current.buildingSets).toEqual([
      expect.objectContaining({ id: 'b-1', title: 'Cells', stepCount: 1 }),
    ]);

    act(() => fs.emitMeta?.(true));
    expect(fs.listened).toContain('building_guided_learning_index');
    act(() =>
      fs.emit['building_guided_learning_index']([{ id: 'b-1', data: entry }])
    );
    expect(result.current.buildingSets).toEqual([entry]);
  });

  it('saves only the full set; the index is left to the server', async () => {
    const { result } = renderHook(() => useGuidedLearning(undefined));
    await act(() => result.current.saveBuildingSet(fullSet()));
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    expect(fs.setDoc.mock.calls[0]).toEqual([
      'building_guided_learning/b-1',
      expect.objectContaining({ id: 'b-1', isBuilding: true }),
    ]);
  });

  it('refuses a set over 900 KB with a readable error and writes nothing', async () => {
    const { result } = renderHook(() => useGuidedLearning(undefined));
    const huge = fullSet({ description: 'x'.repeat(950 * 1024) });
    await expect(result.current.saveBuildingSet(huge)).rejects.toBeInstanceOf(
      SetTooLargeError
    );
    await expect(result.current.saveBuildingSet(huge)).rejects.toThrow(
      'This set is too large to save. Split it or remove slides.'
    );
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('duplicates by id, fetching the full set once', async () => {
    fs.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => fullSet({ steps: [] }),
    });
    const { result } = renderHook(() => useGuidedLearning('admin-1'));
    let copy: GuidedLearningSet | undefined;
    await act(async () => {
      copy = await result.current.duplicateBuildingSet('b-1');
    });
    expect(fs.getDoc).toHaveBeenCalledWith('building_guided_learning/b-1');
    expect(copy?.id).not.toBe('b-1');
    expect(copy?.authorUid).toBe('admin-1');
    expect(fs.setDoc).toHaveBeenCalledWith(
      `building_guided_learning/${copy?.id}`,
      copy
    );
  });
});
