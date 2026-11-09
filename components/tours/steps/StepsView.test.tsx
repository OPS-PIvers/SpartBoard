import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StepsView } from './StepsView';
import { StepsWalkthrough } from './StepsWalkthrough';
import {
  STEPS_LABELS_EN,
  type StepPictures,
  type StepsViewStep,
} from './stepsModel';

beforeAll(() => {
  // jsdom has no ResizeObserver; the walkthrough only needs it to measure.
  globalThis.ResizeObserver ??= class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

const step = (n: number, over: Partial<StepsViewStep> = {}): StepsViewStep => ({
  id: `s${n}`,
  title: `Title ${n}`,
  text: `Tip ${n}`,
  onlyIfAppears: false,
  observe: false,
  picture: {
    w: 800,
    h: 450,
    cssW: 800,
    target: { x: 0.4, y: 0.4, w: 0.2, h: 0.1 },
  },
  ...over,
});

const ready: StepPictures = {
  s1: { status: 'ready', src: 'data:image/png;base64,AA' },
  s2: { status: 'ready', src: 'data:image/png;base64,AA' },
  s3: { status: 'ready', src: 'data:image/png;base64,AA' },
};

const view = (
  over: Partial<React.ComponentProps<typeof StepsView>> = {}
): React.ReactElement => (
  <StepsView
    steps={[step(1), step(2), step(3)]}
    pictures={ready}
    labels={STEPS_LABELS_EN}
    walkthrough={StepsWalkthrough}
    print={{ title: 'My tour' }}
    {...over}
  />
);

afterEach(() => {
  document.documentElement.classList.remove('steps-printing');
});

describe('StepsView article', () => {
  it('lists each step with its number, title, tip and picture', () => {
    render(view());
    expect(screen.getAllByTestId('steps-article-step')).toHaveLength(3);
    expect(screen.getByText('Step 2')).toBeTruthy();
    expect(screen.getByText('Title 2')).toBeTruthy();
    expect(screen.getByText('Tip 2')).toBeTruthy();
    expect(screen.getByAltText('Picture of step 3')).toBeTruthy();
  });

  it('rings the target on a picture that has one, and not on one that does not', () => {
    render(
      view({
        steps: [
          step(1),
          step(2, { picture: { w: 800, h: 450, cssW: 800, target: null } }),
        ],
      })
    );
    expect(screen.getAllByTestId('step-picture-ring')).toHaveLength(1);
  });

  it('says plainly when a step only shows sometimes', () => {
    render(view({ steps: [step(1, { onlyIfAppears: true }), step(2)] }));
    expect(screen.getAllByText('Only if it appears')).toHaveLength(1);
  });

  it('names an untitled step', () => {
    render(view({ steps: [step(1, { title: '  ' })] }));
    expect(screen.getByText('Untitled step')).toBeTruthy();
  });

  it('draws nothing for a step with no picture', () => {
    render(view({ steps: [step(1, { picture: null })] }));
    expect(screen.queryByTestId('step-picture')).toBeNull();
    expect(screen.getByText('Title 1')).toBeTruthy();
  });

  it('shows a picture still loading, and one that failed', () => {
    render(
      view({
        steps: [step(1), step(2)],
        pictures: { s1: { status: 'loading' }, s2: { status: 'failed' } },
      })
    );
    expect(
      screen.getByRole('status', { name: 'Loading picture' })
    ).toBeTruthy();
    expect(screen.getByText("The picture couldn't load")).toBeTruthy();
  });

  it('shows a picture that fails to display as failed', () => {
    render(view({ steps: [step(1)] }));
    fireEvent.error(screen.getByAltText('Picture of step 1'));
    expect(screen.getByText("The picture couldn't load")).toBeTruthy();
  });

  it('draws picture markup over the picture when a host supplies it', () => {
    render(
      view({
        steps: [step(1)],
        renderMarkup: (s) => <span data-testid="markup">{s.id}</span>,
      })
    );
    expect(screen.getByTestId('markup').textContent).toBe('s1');
  });

  it('shows a loading state, then an empty one', () => {
    const { rerender } = render(view({ steps: [], loading: true }));
    expect(screen.getByRole('status', { name: 'Loading steps' })).toBeTruthy();
    rerender(view({ steps: [] }));
    expect(screen.getByText('This tour has no steps yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });

  it('offers no Walk through where the host leaves it out', () => {
    render(view({ walkthrough: undefined }));
    expect(screen.queryByRole('button', { name: 'Walk through' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy();
  });
});

describe('StepsView walk through', () => {
  const open = () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Walk through' }));
  };

  it('shows one step at a time with the tour bar and tip', () => {
    open();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Title 1');
    expect(screen.queryByText('Title 2')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Tip 2');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('goes back to the steps from Done on the last step, and from Exit', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('steps-article')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Walk through' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(screen.getByTestId('steps-article')).toBeTruthy();
  });

  it('notes a step that only shows sometimes, and a step with no picture', () => {
    render(
      view({
        steps: [step(1, { onlyIfAppears: true }), step(2, { picture: null })],
        initialMode: 'walkthrough',
      })
    );
    expect(screen.getByText('Only if it appears')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('No picture for this step')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Title 2');
  });

  it('shows the picture failing and loading', () => {
    render(
      view({
        steps: [step(1), step(2)],
        pictures: { s1: { status: 'loading' }, s2: { status: 'failed' } },
        initialMode: 'walkthrough',
      })
    );
    expect(
      screen.getByRole('status', { name: 'Loading picture' })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText("The picture couldn't load")).toBeTruthy();
  });

  it('moves with the arrow keys', () => {
    open();
    fireEvent.keyDown(screen.getByTestId('steps-walkthrough'), {
      key: 'ArrowRight',
    });
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('steps-walkthrough'), {
      key: 'ArrowLeft',
    });
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });
});

describe('StepsView print', () => {
  it('prints the article alone on its own layer, then takes the layer away', () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(document.documentElement.classList.contains('steps-printing')).toBe(
      true
    );
    const layer = document.querySelector('[data-steps-print]');
    expect(layer?.textContent).toContain('My tour');
    expect(layer?.textContent).toContain('Title 3');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(print).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(document.querySelector('[data-steps-print]')).toBeNull();
    expect(document.documentElement.classList.contains('steps-printing')).toBe(
      false
    );
    vi.useRealTimers();
    print.mockRestore();
  });

  it('has no Print button for a host that cannot print', () => {
    render(view({ print: undefined }));
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });
});
