import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { GuidedLearningSaveConflictError } from '@/components/widgets/GuidedLearning/utils/saveConflict';
import { clearTourEdit, getTourEdit, setTourEdit } from './tourEditStore';
import { AUTOSAVE_MS, useTourEditorSession } from './useTourEditorSession';

const save = vi.hoisted(() =>
  vi.fn<(set: GuidedLearningSet, guard?: unknown) => Promise<void>>()
);
vi.mock('@/hooks/useGuidedLearning', () => ({ saveBuildingSetDoc: save }));

const makeSet = (): GuidedLearningSet =>
  ({
    id: 'set-1',
    title: 'Tour',
    mode: 'tour',
    imageUrls: [],
    updatedAt: 100,
    steps: ['a', 'b', 'c'].map((id) => ({
      id,
      label: id.toUpperCase(),
      tour: { anchor: 'sidebar.boards', action: 'click' },
    })),
  }) as unknown as GuidedLearningSet;

const open = (selected = 0) => {
  setTourEdit({ set: makeSet(), selected, replay: 0, readAloud: false });
  return renderHook(() => useTourEditorSession());
};

const ids = () =>
  getTourEdit()
    ?.set.steps.map((s) => s.id)
    .join('');

beforeEach(() => {
  vi.useFakeTimers();
  save.mockReset();
  save.mockResolvedValue(undefined);
});

afterEach(() => {
  clearTourEdit();
  vi.useRealTimers();
});

describe('useTourEditorSession', () => {
  it('undoes a run of typing in one step', () => {
    const { result } = open();
    act(() => result.current?.updateStep('a', { label: 'A1' }, 'label'));
    act(() => result.current?.updateStep('a', { label: 'A12' }, 'label'));
    expect(getTourEdit()?.set.steps[0].label).toBe('A12');
    act(() => result.current?.undo());
    expect(getTourEdit()?.set.steps[0].label).toBe('A');
    expect(result.current?.canRedo).toBe(true);
    act(() => result.current?.redo());
    expect(getTourEdit()?.set.steps[0].label).toBe('A12');
  });

  it('inserts recorded steps as one edit and selects the last', () => {
    const { result } = open(0);
    const steps = ['x', 'y'].map((id) => ({
      id,
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'text-popover' as const,
    }));
    act(() => result.current?.insertStepsAfter('a', steps, ['p/x.png']));
    expect(ids()).toBe('axybc');
    expect(getTourEdit()).toMatchObject({ selected: 2, replay: 1 });
    expect(getTourEdit()?.set.imagePaths).toEqual(['p/x.png']);
    act(() => result.current?.undo());
    expect(ids()).toBe('abc');
  });

  it('keeps the selected step selected through a reorder and asks for a replay', () => {
    const { result } = open(1);
    act(() => result.current?.moveStep('b', 2));
    expect(ids()).toBe('acb');
    expect(getTourEdit()).toMatchObject({ selected: 2, replay: 1 });
  });

  it('selects a neighbour when the selected step is deleted', () => {
    const { result } = open(2);
    act(() => result.current?.deleteStep('c'));
    expect(ids()).toBe('ab');
    expect(getTourEdit()?.selected).toBe(1);
  });

  it('inserts a step after another and selects it', () => {
    const { result } = open(0);
    let id = '';
    act(() => {
      id = result.current?.insertStepAfter('a', { label: 'New' }).id ?? '';
    });
    expect(getTourEdit()?.set.steps[1]).toMatchObject({ id, label: 'New' });
    expect(getTourEdit()?.selected).toBe(1);
  });

  it('sets and clears a binding', () => {
    const { result } = open();
    act(() =>
      result.current?.setBinding('b', {
        anchor: 'board.whole',
        action: 'observe',
      })
    );
    expect(getTourEdit()?.set.steps[1].tour?.anchor).toBe('board.whole');
    act(() => result.current?.setBinding('b', undefined));
    expect(getTourEdit()?.set.steps[1].tour).toBeUndefined();
  });

  it('autosaves after a pause, guarded by the revision it loaded', async () => {
    const { result } = open();
    act(() => result.current?.updateStep('a', { label: 'A1' }, 'label'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(save).toHaveBeenCalledTimes(1);
    const [written, guard] = save.mock.calls[0];
    expect(written.steps[0].label).toBe('A1');
    expect(guard).toEqual({ expectedUpdatedAt: 100 });
    expect(result.current?.saveState).toBe('saved');
    act(() => result.current?.updateStep('a', { label: 'A2' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100);
    });
    expect(save.mock.calls[1][1]).toEqual({
      expectedUpdatedAt: written.updatedAt,
    });
  });

  it('stops saving once someone else has changed the tour', async () => {
    save.mockRejectedValueOnce(
      new GuidedLearningSaveConflictError(() => Promise.reject(new Error()))
    );
    const { result } = open();
    act(() => result.current?.updateStep('a', { label: 'A1' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100);
    });
    expect(result.current?.saveState).toBe('conflict');
    act(() => result.current?.updateStep('a', { label: 'A2' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes pending edits when the editor closes', async () => {
    const { result, unmount } = open();
    act(() => result.current?.updateStep('a', { label: 'Last' }));
    act(() => clearTourEdit());
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].steps[0].label).toBe('Last');
  });
});
