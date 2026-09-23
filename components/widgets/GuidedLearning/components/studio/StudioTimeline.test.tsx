import React, { useEffect } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const buildSet = (): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Order',
  imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
  steps: [step('a', 0), step('x', 1), step('b', 0)],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
});

const latest: { current: GuidedLearningEditorController | null } = {
  current: null,
};
const Harness: React.FC<{ strip: 'timeline' | 'filmstrip' }> = ({ strip }) => {
  const state = useGuidedLearningEditorState({
    existingSet: buildSet(),
    existingMeta: null,
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

afterEach(() => {
  cleanup();
  latest.current = null;
});

describe('Studio strips', () => {
  it('reorders a slide’s steps with edits made since the strip last rendered', () => {
    render(<Harness strip="timeline" />);
    act(() => ctl().updateStep({ ...ctl().steps[0], text: 'edited' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(ctl().steps.map((s) => s.id)).toEqual(['b', 'x', 'a']);
    expect(ctl().steps[2].text).toBe('edited');
  });

  it('keeps step numbers and labels current after a label edit', () => {
    render(<Harness strip="timeline" />);
    act(() => ctl().updateStep({ ...ctl().steps[2], label: 'Save' }));
    expect(
      screen.getByRole('button', { name: 'Step 3: Save' })
    ).toBeInTheDocument();
  });

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
