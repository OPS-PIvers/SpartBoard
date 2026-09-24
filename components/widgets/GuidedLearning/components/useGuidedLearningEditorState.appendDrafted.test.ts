import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadGuidedLearningImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));

const step = (id: string, imageIndex: number): GuidedLearningStep => ({
  id,
  xPct: 10,
  yPct: 20,
  imageIndex,
  interactionType: 'text-popover',
  text: `text ${id}`,
});

const openSet = (
  extra: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  title: 'My set',
  imageUrls: ['A', 'B', 'C'],
  steps: [step('a1', 0), step('b1', 1), step('c1', 2), step('a2', 0)],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const drafted = (): GuidedLearningSet => ({
  id: 'drafted',
  title: 'AI title',
  imageUrls: ['X', 'Y'],
  slideThumbnails: { X: 'X-thumb' },
  // AI ids collide with the open set's on purpose.
  steps: [step('b1', 0), step('d2', 1), step('d3', 5)],
  mode: 'structured',
  createdAt: 2,
  updatedAt: 2,
  isBuilding: true,
});

const render = (set: GuidedLearningSet) =>
  renderHook(() =>
    useGuidedLearningEditorState({
      existingSet: set,
      existingMeta: null,
      setWideTimeline: true,
    })
  );

describe('appendDraftedSet', () => {
  it('inserts the draft after the current slide and shifts later steps', () => {
    const { result } = render(openSet());
    act(() => result.current.setCurrentImageIndex(1));
    let added = 0;
    act(() => {
      added = result.current.appendDraftedSet(drafted());
    });
    expect(added).toBe(2);
    const ctl = result.current;
    expect(ctl.imageUrls).toEqual(['A', 'B', 'X', 'Y', 'C']);
    expect(ctl.imageKinds).toHaveLength(5);
    expect(ctl.videoTrims).toHaveLength(5);
    const ids = ctl.steps.map((s) => s.id);
    // After slide B's last step in play order, before the later slides' steps.
    expect(ids.slice(0, 2)).toEqual(['a1', 'b1']);
    expect(ids.slice(5)).toEqual(['c1', 'a2']);
    const draftedSteps = ctl.steps.slice(2, 5);
    expect(draftedSteps.map((s) => s.imageIndex)).toEqual([2, 3, 3]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(draftedSteps.map((s) => s.id)).not.toContain('b1');
    expect(ctl.steps.find((s) => s.id === 'c1')?.imageIndex).toBe(4);
    expect(ctl.steps.find((s) => s.id === 'a2')?.imageIndex).toBe(0);
    expect(ctl.currentImageIndex).toBe(2);
    expect(ctl.selectedStepId).toBe(draftedSteps[0].id);
    expect(ctl.slideThumbnails).toEqual({ X: 'X-thumb' });
    // The open set's own title and mode stay.
    expect(ctl.title).toBe('My set');
    expect(ctl.mode).toBe('guided');
  });

  it('is one undo entry that restores the set exactly', () => {
    const set = openSet();
    const { result } = render(set);
    expect(result.current.canUndo).toBe(false);
    act(() => {
      result.current.appendDraftedSet(drafted());
    });
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.imageUrls).toEqual(set.imageUrls);
    expect(result.current.steps).toEqual(set.steps);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    expect(result.current.imageUrls).toEqual(['A', 'X', 'Y', 'B', 'C']);
  });

  it('undoes only its own edit when tagged', () => {
    const { result } = render(openSet());
    const tag = {};
    act(() => {
      result.current.appendDraftedSet(drafted(), tag);
    });
    let undone = false;
    act(() => {
      undone = result.current.undoIfLatest(tag);
    });
    expect(undone).toBe(true);
    expect(result.current.imageUrls).toEqual(['A', 'B', 'C']);
  });

  it('fills an empty set, taking the drafted title and mode', () => {
    const { result } = render(
      openSet({ title: '', imageUrls: [], steps: [], mode: 'guided' })
    );
    act(() => {
      result.current.appendDraftedSet(drafted());
    });
    expect(result.current.imageUrls).toEqual(['X', 'Y']);
    expect(result.current.steps.map((s) => s.imageIndex)).toEqual([0, 1, 1]);
    expect(result.current.title).toBe('AI title');
    expect(result.current.mode).toBe('structured');
    expect(result.current.currentImageIndex).toBe(0);
  });

  it('marks appended steps as AI drafts to review, and editing one clears it', () => {
    const { result } = render(openSet());
    act(() => {
      result.current.appendDraftedSet(drafted());
    });
    const flagged = result.current.steps.filter((s) => s.aiDraft);
    expect(flagged).toHaveLength(3);
    expect(
      result.current.steps.filter((s) => !s.aiDraft).map((s) => s.id)
    ).toEqual(['a1', 'b1', 'c1', 'a2']);
    act(() => result.current.updateStep({ ...flagged[0], text: 'Reviewed' }));
    expect(result.current.steps.filter((s) => s.aiDraft)).toHaveLength(2);
  });

  it('adds nothing for a draft with no slides', () => {
    const { result } = render(openSet());
    let added = -1;
    act(() => {
      added = result.current.appendDraftedSet({ ...drafted(), imageUrls: [] });
    });
    expect(added).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('reports the media home of the open set', () => {
    expect(render(openSet()).result.current.mediaHome).toBe('drive');
    expect(render(openSet({ isBuilding: true })).result.current.mediaHome).toBe(
      'storage'
    );
    expect(render(openSet({ helpCenter: true })).result.current.mediaHome).toBe(
      'storage'
    );
  });
});
