import React, { useEffect } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  useGuidedLearningEditorState,
  type GuidedLearningEditorController,
} from '../useGuidedLearningEditorState';
import { StudioTimeline } from './StudioTimeline';
import { StudioFilmstrip } from './StudioFilmstrip';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user' }, isAdmin: true }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploading: false }),
}));
const showConfirm = vi.hoisted(() => vi.fn());
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));
// Exposes each list's onReorder as a button that reverses the items.
vi.mock('@/components/common/SortableList', () => ({
  SortableList: <T,>({
    items,
    getId,
    onReorder,
    renderItem,
  }: {
    items: T[];
    getId: (item: T) => string;
    onReorder: (next: T[], movedId: string) => void;
    renderItem: (item: T, handle: object, index: number) => React.ReactNode;
  }) => (
    <div>
      {items.map((item, i) => (
        <div key={getId(item)}>
          {renderItem(item, { attributes: {}, isDragging: false }, i)}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onReorder([...items].reverse(), getId(items[0]))}
      >
        Reverse
      </button>
    </div>
  ),
}));

const step = (id: string, imageIndex: number): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex,
  interactionType: 'tooltip',
  showOverlay: 'tooltip',
  text: id,
});

const buildSet = (
  steps = [step('a', 0), step('x', 1), step('b', 0)],
  slides = 2
): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Order',
  imageUrls: Array.from(
    { length: slides },
    (_, i) => `https://example.com/${i}.png`
  ),
  steps,
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
});

const latest: { current: GuidedLearningEditorController | null } = {
  current: null,
};
const Harness: React.FC<{
  strip: 'timeline' | 'filmstrip';
  set?: GuidedLearningSet;
}> = ({ strip, set }) => {
  const state = useGuidedLearningEditorState({
    existingSet: set ?? buildSet(),
    existingMeta: null,
    setWideTimeline: true,
  });
  useEffect(() => {
    latest.current = state;
  });
  return strip === 'timeline' ? (
    <StudioTimeline state={state} />
  ) : (
    <StudioFilmstrip state={state} />
  );
};
const ctl = () => {
  if (!latest.current) throw new Error('not mounted');
  return latest.current;
};
const order = () => ctl().steps.map((s) => s.id);
const slidesOf = () => ctl().steps.map((s) => [s.id, s.imageIndex]);

beforeEach(() => {
  showConfirm.mockReset();
});
afterEach(() => {
  cleanup();
  latest.current = null;
});

describe('set-wide timeline', () => {
  it('shows every step in play order with a slide thumbnail per run', () => {
    render(<Harness strip="timeline" />);
    expect(
      screen
        .getAllByRole('button', { name: /^Step \d+$/ })
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual(['Step 1', 'Step 2', 'Step 3']);
    expect(
      screen
        .getAllByRole('button', { name: /^Go to slide/ })
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual(['Go to slide 1', 'Go to slide 2', 'Go to slide 1']);
  });

  it('drags a step across slides as one undo entry, keeping each step on its slide', () => {
    render(<Harness strip="timeline" />);
    act(() => ctl().updateStep({ ...ctl().steps[0], text: 'edited' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(slidesOf()).toEqual([
      ['b', 0],
      ['x', 1],
      ['a', 0],
    ]);
    expect(ctl().steps[2].text).toBe('edited');
    act(() => ctl().undo());
    expect(order()).toEqual(['a', 'x', 'b']);
    expect(ctl().steps[0].text).toBe('edited');
  });

  it('keeps step numbers and labels current after a label edit', () => {
    render(<Harness strip="timeline" />);
    act(() => ctl().updateStep({ ...ctl().steps[2], label: 'Save' }));
    expect(
      screen.getByRole('button', { name: 'Step 3: Save' })
    ).toBeInTheDocument();
  });

  it('moves the canvas to a step’s slide when it is picked on the timeline', () => {
    render(<Harness strip="timeline" />);
    expect(ctl().currentImageIndex).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Step 2' }));
    expect(ctl().selectedStepId).toBe('x');
    expect(ctl().currentImageIndex).toBe(1);
  });
});

describe('smart insert', () => {
  it('adds a step after the current slide’s last step in play order', () => {
    render(
      <Harness
        strip="timeline"
        set={buildSet([step('a', 0), step('b', 0), step('x', 1)])}
      />
    );
    act(() => ctl().addStepAt(10, 10));
    const added = ctl().selectedStepId;
    expect(order()).toEqual(['a', 'b', added, 'x']);
    act(() => ctl().undo());
    expect(order()).toEqual(['a', 'b', 'x']);
  });

  it('adds after a late revisit of the slide', () => {
    render(<Harness strip="timeline" />);
    act(() => ctl().addStepAt(10, 10));
    expect(order()).toEqual(['a', 'x', 'b', ctl().selectedStepId]);
  });

  it('adds a slide’s first step after the steps on earlier slides', () => {
    render(
      <Harness
        strip="timeline"
        set={buildSet([step('a', 0), step('z', 2)], 3)}
      />
    );
    act(() => ctl().setCurrentImageIndex(1));
    act(() => ctl().addStepAt(10, 10));
    expect(order()).toEqual(['a', ctl().selectedStepId, 'z']);
  });
});

describe('moving a slide asks about its steps', () => {
  // Reverse drags slide 1 to the end, so its steps a and b move to slide 2.
  it('Yes: the slide’s steps follow it in play order, as one undo entry', async () => {
    showConfirm.mockResolvedValue(true);
    render(<Harness strip="filmstrip" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(showConfirm).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'Move its steps too?' })
    );
    await waitFor(() => expect(order()).toEqual(['x', 'a', 'b']));
    expect(slidesOf()).toEqual([
      ['x', 0],
      ['a', 1],
      ['b', 1],
    ]);
    act(() => ctl().undo());
    expect(slidesOf()).toEqual([
      ['a', 0],
      ['x', 1],
      ['b', 0],
    ]);
    expect(ctl().imageUrls[0]).toBe('https://example.com/0.png');
  });

  it('No: the slides move and play order stays as it was', async () => {
    showConfirm.mockResolvedValue(false);
    render(<Harness strip="filmstrip" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    await waitFor(() =>
      expect(ctl().imageUrls[0]).toBe('https://example.com/1.png')
    );
    expect(slidesOf()).toEqual([
      ['a', 1],
      ['x', 0],
      ['b', 1],
    ]);
    act(() => ctl().undo());
    expect(ctl().imageUrls[0]).toBe('https://example.com/0.png');
    expect(ctl().canUndo).toBe(false);
  });

  it('does not ask when play order would not change', () => {
    render(
      <Harness strip="filmstrip" set={buildSet([step('a', 0), step('b', 0)])} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(showConfirm).not.toHaveBeenCalled();
    expect(slidesOf()).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });
});

describe('canvas follows the selected step', () => {
  it('follows a selected step moved to another slide, and back on undo', () => {
    render(<Harness strip="timeline" />);
    fireEvent.click(screen.getByRole('button', { name: 'Step 1' }));
    expect(ctl().currentImageIndex).toBe(0);
    act(() => ctl().updateStep({ ...ctl().steps[0], imageIndex: 1 }));
    expect(ctl().currentImageIndex).toBe(1);
    act(() => ctl().undo());
    expect(ctl().currentImageIndex).toBe(0);
  });

  it('stays on the slide the author opened when slides are reordered', () => {
    render(<Harness strip="timeline" />);
    act(() => ctl().setSelectedStepId('a'));
    act(() => ctl().setCurrentImageIndex(1));
    act(() => ctl().reorderImages([1, 0]));
    expect(ctl().currentImageIndex).toBe(0);
    expect(ctl().imageUrls[0]).toBe('https://example.com/1.png');
  });
});

describe('Studio strips', () => {
  it('marks the current slide and follows a slide switch', () => {
    render(<Harness strip="filmstrip" />);
    expect(
      screen.getByRole('button', { name: 'Slide 1, 2 steps' })
    ).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2, 1 step' }));
    expect(ctl().currentImageIndex).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Slide 1, 2 steps' })
    ).toHaveAttribute('aria-current', 'false');
    expect(
      screen.getByRole('button', { name: 'Slide 2, 1 step' })
    ).toHaveAttribute('aria-current', 'true');
  });

  it('updates slide step counts when a step moves slides', () => {
    render(<Harness strip="filmstrip" />);
    act(() => ctl().updateStep({ ...ctl().steps[1], imageIndex: 0 }));
    expect(
      screen.getByRole('button', { name: 'Slide 1, 3 steps' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Slide 2, 0 steps' })
    ).toBeInTheDocument();
  });
});
