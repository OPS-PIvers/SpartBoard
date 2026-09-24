import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';
import type { StepRecapture } from './recorder/recordingHandoff';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploading: false }),
}));

const OLD = 'https://firebasestorage.googleapis.com/v0/b/x/o/gl%2Fold.png?t=1';
const NEW = 'https://firebasestorage.googleapis.com/v0/b/x/o/gl%2Fnew.png?t=1';

const step = (id: string, imageIndex: number): GuidedLearningStep => ({
  id,
  xPct: 10,
  yPct: 10,
  imageIndex,
  interactionType: 'tooltip',
  label: `Label ${id}`,
  tour: { anchor: 'sidebar.boards', action: 'click' },
});

const makeSet = (steps: GuidedLearningStep[]): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Tour',
  imageUrls: [OLD, 'https://example.com/b.png'],
  steps,
  mode: 'structured',
  isBuilding: true,
  tourSetup: { widgets: ['time-tool'] },
  createdAt: 1,
  updatedAt: 1,
});

const renderEditor = (set: GuidedLearningSet) =>
  renderHook(() =>
    useGuidedLearningEditorState({
      existingSet: set,
      existingMeta: null,
      setWideTimeline: true,
    })
  );

const recapture = (stepId: string): StepRecapture => ({
  stepId,
  url: NEW,
  thumbnailUrl: 'https://example.com/new-thumb.webp',
  placement: {
    xPct: 60,
    yPct: 40,
    region: { shape: 'rect', wPct: 8, hPct: 6 },
  },
  tour: { anchor: 'widget.close', action: 'click' },
});

describe('tour setup widgets in editor state', () => {
  it('starts from the loaded set and each chip edit is its own undo entry', () => {
    const { result } = renderEditor(makeSet([step('s1', 0)]));
    expect(result.current.tourSetupWidgets).toEqual(['time-tool']);
    act(() => result.current.setTourSetupWidgets(['time-tool', 'clock']));
    act(() => result.current.setTourSetupWidgets(['clock']));
    expect(result.current.tourSetupWidgets).toEqual(['clock']);
    act(() => result.current.undo());
    expect(result.current.tourSetupWidgets).toEqual(['time-tool', 'clock']);
    act(() => result.current.undo());
    expect(result.current.tourSetupWidgets).toEqual(['time-tool']);
  });
});

describe('recaptureStep', () => {
  it("replaces the step's own slide, placement and binding as one undo entry", async () => {
    const { result } = renderEditor(makeSet([step('s1', 0), step('s2', 1)]));
    act(() => {
      result.current.recaptureStep(recapture('s1'));
    });
    expect(result.current.imageUrls[0]).toBe(NEW);
    expect(result.current.imageUrls).toHaveLength(2);
    expect(result.current.steps[0]).toMatchObject({
      id: 's1',
      imageIndex: 0,
      xPct: 60,
      yPct: 40,
      region: { shape: 'rect', wPct: 8, hPct: 6 },
      tour: { anchor: 'widget.close', action: 'click' },
      label: 'Label s1',
    });
    expect(result.current.selectedStepId).toBe('s1');
    expect(result.current.slideThumbnails[NEW]).toBe(
      'https://example.com/new-thumb.webp'
    );
    // The replaced file is deleted once the set saves and closes.
    const release = vi.fn().mockResolvedValue(undefined);
    await act(() => result.current.flushMediaDeletions(release));
    expect(release).toHaveBeenCalledWith({
      storagePaths: ['gl/old.png'],
      driveFileIds: [],
    });
    act(() => result.current.undo());
    expect(result.current.imageUrls[0]).toBe(OLD);
    expect(result.current.steps[0].tour?.anchor).toBe('sidebar.boards');
  });

  it('keeps a slide other steps share and adds the new frame after it', () => {
    const { result } = renderEditor(
      makeSet([step('s1', 0), step('s2', 0), step('s3', 1)])
    );
    act(() => {
      result.current.recaptureStep(recapture('s2'));
    });
    expect(result.current.imageUrls).toEqual([
      OLD,
      NEW,
      'https://example.com/b.png',
    ]);
    expect(result.current.steps.map((s) => [s.id, s.imageIndex])).toEqual([
      ['s1', 0],
      ['s2', 1],
      ['s3', 2],
    ]);
    expect(result.current.currentImageIndex).toBe(1);
  });

  it('ignores a step that no longer exists', () => {
    const { result } = renderEditor(makeSet([step('s1', 0)]));
    let applied = true;
    act(() => {
      applied = result.current.recaptureStep(recapture('gone'));
    });
    expect(applied).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });
});
