import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { GuidedLearningEditorController } from './useGuidedLearningEditorState';
import { useSetDraftPersistence } from './useSetDraftPersistence';

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
    const saved = build(set, { title: 'Edited' }) as Record<string, unknown>;
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
});
