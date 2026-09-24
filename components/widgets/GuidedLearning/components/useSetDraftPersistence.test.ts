import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { GuidedLearningEditorController } from './useGuidedLearningEditorState';
import {
  GuidedLearningReadOnlyError,
  useSetDraftPersistence,
} from './useSetDraftPersistence';
import {
  GuidedLearningSaveConflictError,
  type GuidedLearningSaveGuard,
} from '../utils/saveConflict';

type SaveFn = (
  set: GuidedLearningSet,
  driveFileId?: string,
  guard?: GuidedLearningSaveGuard
) => Promise<void>;

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ deleteFile: vi.fn(), deleteDriveFile: vi.fn() }),
}));

const buildSet = (
  overrides: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Cells',
  description: 'Old description',
  imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
  imagePaths: ['gl/a.png', 'gl/b.png'],
  steps: [],
  mode: 'structured',
  hotspotPulse: 'off',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

// Editor state as the Studio would hold it after the teacher's edits.
const editorFor = (
  set: GuidedLearningSet,
  edits: Partial<GuidedLearningEditorController> = {}
): GuidedLearningEditorController =>
  ({
    title: set.title,
    description: set.description ?? '',
    mode: set.mode,
    hotspotPulse: set.hotspotPulse ?? 'consistent',
    imageTransition: set.imageTransition ?? 'none',
    welcomeEnabled: Boolean(set.welcomeEnabled),
    welcomeMessage: set.welcomeMessage ?? '',
    imageUrls: set.imageUrls,
    imageKinds: set.imageUrls.map(() => 'image'),
    videoTrims: set.imageUrls.map(() => null),
    steps: set.steps,
    watchPace: set.watchPace,
    tourSetupWidgets: set.tourSetup?.widgets ?? [],
    setSteps: vi.fn(),
    canvasMeasurementsRef: { current: null },
    canvasMeasuredTick: 0,
    spotlightRadiiV2: true,
    markSpotlightRadiiV2: vi.fn(),
    flushMediaDeletions: vi.fn(),
    ...edits,
  }) as unknown as GuidedLearningEditorController;

const build = (
  set: GuidedLearningSet,
  edits: Partial<GuidedLearningEditorController> = {}
) =>
  renderHook(() =>
    useSetDraftPersistence({
      isOpen: true,
      set,
      editorState: editorFor(set, edits),
      onSave: vi.fn(),
      onClose: vi.fn(),
    })
  ).result.current.buildSavedSet();

describe('useSetDraftPersistence.buildSavedSet', () => {
  it('keeps imagePaths when an imported set is edited', () => {
    const saved = build(buildSet(), { title: 'Cells, revised' });
    expect(saved?.title).toBe('Cells, revised');
    expect(saved?.imagePaths).toEqual(['gl/a.png', 'gl/b.png']);
  });

  it('round-trips an unknown top-level field', () => {
    const set = {
      ...buildSet(),
      futureField: { nested: [1, 2] },
    } as GuidedLearningSet;
    const saved = build(set, { title: 'Edited' }) as unknown as Record<
      string,
      unknown
    >;
    expect(saved.futureField).toEqual({ nested: [1, 2] });
  });

  it('keeps tourSetup, helpCenter, authorUid and isBuilding', () => {
    const set = buildSet({
      isBuilding: true,
      helpCenter: true,
      authorUid: 'admin-1',
      tourSetup: { widgets: [] } as unknown as GuidedLearningSet['tourSetup'],
    });
    const saved = build(set);
    expect(saved).toMatchObject({
      isBuilding: true,
      helpCenter: true,
      authorUid: 'admin-1',
      tourSetup: { widgets: [] },
      hasLiveTour: false,
    });
  });

  it('drops editor-owned optional fields the teacher cleared', () => {
    const saved = build(buildSet(), {
      description: '  ',
      hotspotPulse: 'consistent',
    });
    expect(saved?.description).toBeUndefined();
    expect(saved).not.toHaveProperty('hotspotPulse');
  });

  it('carries driveFileIds and saves only thumbnails of slides still in the set', () => {
    const set = buildSet({ driveFileIds: ['drive-a'] });
    const saved = build(set, {
      imageUrls: ['https://example.com/a.png', 'https://example.com/new.png'],
      slideThumbnails: {
        'https://example.com/b.png': 'https://example.com/b-thumb.webp',
        'https://example.com/new.png': 'https://example.com/new-thumb.webp',
      },
    });
    expect(saved?.driveFileIds).toEqual(['drive-a']);
    expect(saved?.slideThumbnails).toEqual({
      'https://example.com/new.png': 'https://example.com/new-thumb.webp',
    });
  });
});

describe('useSetDraftPersistence tour setup', () => {
  const tourSet = buildSet({
    isBuilding: true,
    tourSetup: { widgets: ['time-tool'] },
  });

  it('writes the chips from editor state, not the loaded copy', () => {
    const saved = build(tourSet, { tourSetupWidgets: ['time-tool', 'clock'] });
    expect(saved?.tourSetup).toEqual({ widgets: ['time-tool', 'clock'] });
    expect(build(tourSet, { tourSetupWidgets: [] })?.tourSetup).toEqual({
      widgets: [],
    });
  });

  it('adds tourSetup only once a chip exists', () => {
    expect(build(buildSet())).not.toHaveProperty('tourSetup');
    expect(build(buildSet(), { tourSetupWidgets: ['clock'] })).toMatchObject({
      tourSetup: { widgets: ['clock'] },
    });
  });

  it('counts a chip edit as a draft change', () => {
    const { result, rerender } = renderHook(
      ({ edits }: { edits: Partial<GuidedLearningEditorController> }) =>
        useSetDraftPersistence({
          isOpen: true,
          set: tourSet,
          editorState: editorFor(tourSet, edits),
          onSave: vi.fn(),
          onClose: vi.fn(),
        }),
      { initialProps: { edits: {} } }
    );
    const idle = result.current.draftToken;
    expect(result.current.isDirty).toBe(false);
    rerender({ edits: { tourSetupWidgets: ['time-tool', 'clock'] } });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.draftToken).not.toBe(idle);
  });
});

describe('useSetDraftPersistence revision guard', () => {
  const persist = (
    set: GuidedLearningSet,
    onSave: Mock<SaveFn>,
    loadedUpdatedAt?: number
  ) =>
    renderHook(() =>
      useSetDraftPersistence({
        isOpen: true,
        set,
        editorState: editorFor(set, { title: 'Edited' }),
        onSave,
        driveFileId: 'drive-1',
        loadedUpdatedAt,
        onClose: vi.fn(),
      })
    );

  it('saves against the loaded revision, then against the one it wrote', async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    const { result } = persist(buildSet({ updatedAt: 50 }), onSave, 70);
    await act(() => result.current.persistDraft());
    const [first, driveId, guard] = onSave.mock.calls[0];
    expect(driveId).toBe('drive-1');
    expect(guard).toEqual({ expectedUpdatedAt: 70 });
    expect(first.updatedAt).toBeGreaterThan(70);
    await act(() => result.current.persistDraft());
    expect(onSave.mock.calls[1][2]).toEqual({
      expectedUpdatedAt: first.updatedAt,
    });
  });

  it('reports a conflict, and Overwrite skips the check once', async () => {
    const conflict = new GuidedLearningSaveConflictError(() =>
      Promise.resolve({ set: buildSet(), updatedAt: 90 })
    );
    const onSave = vi
      .fn<SaveFn>()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue(undefined);
    const { result } = persist(buildSet(), onSave);
    await act(() =>
      expect(result.current.persistDraft()).rejects.toBe(conflict)
    );
    expect(result.current.conflict).toBe(conflict);
    act(() => result.current.armOverwrite());
    await act(() => result.current.persistDraft());
    expect(onSave.mock.calls[1][2]).toEqual({ expectedUpdatedAt: undefined });
    expect(result.current.conflict).toBeNull();
    await act(() => result.current.persistDraft());
    expect(onSave.mock.calls[2][2]).toEqual({
      expectedUpdatedAt: onSave.mock.calls[1][0].updatedAt,
    });
  });

  it('refuses to save a set a newer schema wrote', async () => {
    const onSave = vi.fn<SaveFn>();
    const { result } = persist(buildSet({ schemaVersion: 99 }), onSave);
    expect(result.current.readOnly).toBe(true);
    await act(() =>
      expect(result.current.persistDraft()).rejects.toBeInstanceOf(
        GuidedLearningReadOnlyError
      )
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('useSetDraftPersistence during a gesture', () => {
  const step = (xPct: number): GuidedLearningSet['steps'][number] => ({
    id: 's1',
    xPct,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'tooltip',
    showOverlay: 'tooltip',
    text: 'Drag me',
  });

  it('holds isDirty and the autosave token mid-drag, then commits the final state on endGesture', async () => {
    const set = buildSet({ steps: [step(20)] });
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ edits }: { edits: Partial<GuidedLearningEditorController> }) =>
        useSetDraftPersistence({
          isOpen: true,
          set,
          editorState: editorFor(set, edits),
          onSave,
          onClose: vi.fn(),
        }),
      { initialProps: { edits: {} } }
    );
    const idle = result.current.draftToken;
    expect(result.current.isDirty).toBe(false);
    for (const x of [25, 30, 35]) {
      rerender({ edits: { steps: [step(x)], gestureOpen: true } });
      expect(result.current.draftToken).toBe(idle);
      expect(result.current.isDirty).toBe(false);
    }
    rerender({ edits: { steps: [step(40)], gestureOpen: false } });
    expect(result.current.draftToken).not.toBe(idle);
    expect(result.current.isDirty).toBe(true);
    await act(() => result.current.persistDraft());
    expect(onSave.mock.calls[0][0].steps[0].xPct).toBe(40);
  });
});
