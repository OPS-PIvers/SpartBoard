import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import { RESUME_PREFIX } from './player/useResume';

let restore: (() => void) | null = null;
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  vi.useRealTimers();
  window.localStorage.clear();
});

const step = (
  id: string,
  over: Partial<GuidedLearningStep> = {}
): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: `Label ${id}`,
  text: `Text for ${id}`,
  cursor: { hide: true },
  ...over,
});

const makeSet = (
  mode: GuidedLearningSet['mode'],
  steps: GuidedLearningStep[]
): GuidedLearningSet => ({
  id: 'set-o',
  schemaVersion: 3,
  title: 'Orientation',
  imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
  steps,
  mode,
  createdAt: 0,
  updatedAt: 0,
});

const THREE = [step('a'), step('b'), step('c', { imageIndex: 1 })];

function renderPlayer(set: GuidedLearningSet) {
  const handle = mockStageLayout({
    container: { w: 800, h: 600 },
    image: { w: 1600, h: 900 },
  });
  restore = handle.restore;
  const view = render(<GuidedLearningPlayer set={set} teacherMode playerV2 />);
  fireEvent.load(
    document.querySelector('[data-gl-stage] img') as HTMLImageElement
  );
  act(() => handle.fireResize());
  return view;
}

const counter = () => screen.getByRole('button', { name: /show all steps/i });

describe('GuidedLearningPlayer outline', () => {
  it('lists steps by slide and jumps to one in Watch', () => {
    renderPlayer(makeSet('guided', THREE));
    fireEvent.click(counter());
    const list = screen.getByRole('dialog', { name: 'Steps' });
    expect(list).toHaveTextContent('Slide 1');
    expect(list).toHaveTextContent('Slide 2');
    fireEvent.click(screen.getByRole('button', { name: /label c/i }));
    expect(counter()).toHaveTextContent('3 / 3');
    expect(screen.queryByRole('dialog', { name: 'Steps' })).toBeNull();
  });

  it('allows only jumping back in Try, and marks passed steps done', () => {
    renderPlayer(makeSet('structured', THREE));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(counter());
    expect(screen.getByRole('button', { name: /label c/i })).toBeDisabled();
    const first = screen.getByRole('button', { name: /label a/i });
    expect(first).toBeEnabled();
    expect(first.querySelector('[aria-label="Done"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /label b/i })).toHaveAttribute(
      'aria-current',
      'step'
    );
    fireEvent.click(first);
    expect(counter()).toHaveTextContent('1 / 3');
  });
});

describe('GuidedLearningPlayer resume', () => {
  it('offers the saved step and resumes there', () => {
    window.localStorage.setItem(
      RESUME_PREFIX + 'set-o',
      JSON.stringify({
        id: 'set-o',
        idx: 1,
        mode: 'try',
        updatedAt: Date.now() - 1000,
      })
    );
    renderPlayer(makeSet('guided', THREE));
    const prompt = screen.getByRole('dialog', {
      name: 'Resume at step 2?',
    });
    expect(prompt).toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Resume' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(counter()).toHaveTextContent('2 / 3');
    expect(screen.getByRole('button', { name: /^try it$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('starts over when asked, and ignores a place older than 14 days', () => {
    window.localStorage.setItem(
      RESUME_PREFIX + 'set-o',
      JSON.stringify({ id: 'set-o', idx: 2, mode: 'watch', updatedAt: 1 })
    );
    renderPlayer(makeSet('guided', THREE));
    expect(screen.queryByText(/resume at step/i)).toBeNull();
    cleanup();
    restore?.();

    window.localStorage.setItem(
      RESUME_PREFIX + 'set-o',
      JSON.stringify({
        id: 'set-o',
        idx: 2,
        mode: 'watch',
        updatedAt: Date.now(),
      })
    );
    renderPlayer(makeSet('guided', THREE));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(counter()).toHaveTextContent('1 / 3');
  });

  it('saves the learner’s place as they move', () => {
    renderPlayer(makeSet('structured', THREE));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    const saved = JSON.parse(
      window.localStorage.getItem(RESUME_PREFIX + 'set-o') ?? '{}'
    ) as { idx: number; mode: string };
    expect(saved.idx).toBe(1);
    expect(saved.mode).toBe('try');
  });
});

describe('GuidedLearningPlayer accessibility', () => {
  it('announces the step in a polite live region', () => {
    renderPlayer(
      makeSet('structured', [
        step('a', { text: 'Press **Save** now' }),
        step('b'),
      ])
    );
    const live = screen.getByTestId('gl-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Step 1 of 2: Label a. Press Save now');
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(live).toHaveTextContent('Step 2 of 2: Label b. Text for b');
  });

  it('moves focus into a popover and back to the stage on close', () => {
    renderPlayer(
      makeSet('structured', [
        step('a', { interactionType: 'text-popover' }),
        step('b'),
      ])
    );
    const dialog = screen.getByRole('dialog', { name: 'Label a' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(dialog).toContainElement(close);
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(document.activeElement).toBe(
      document.querySelector('[data-gl-stage]')
    );
  });

  it('marks the tooltip as a note and names the image by the step', () => {
    renderPlayer(makeSet('structured', THREE));
    expect(screen.getByRole('note')).toHaveTextContent('Text for a');
    expect(screen.getByAltText('Label a')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer read-aloud', () => {
  function mockSpeech() {
    const speak = vi.fn<(u: { text: string; onend: () => void }) => void>();
    const cancel = vi.fn();
    class Utterance {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    return { speak, cancel };
  }

  it('speaks each step on enter and cancels on leave', () => {
    const { speak, cancel } = mockSpeech();
    renderPlayer(makeSet('structured', THREE));
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toBe('Label a. Text for a');
    cancel.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][0].text).toBe('Label b. Text for b');
  });

  it('holds a Watch step until the voice finishes', () => {
    vi.useFakeTimers();
    const { speak } = mockSpeech();
    renderPlayer(makeSet('guided', THREE));
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    // 3s step time is up, but the voice is still going.
    expect(counter()).toHaveTextContent('1 / 3');
    const utterance = speak.mock.calls[0][0];
    act(() => utterance.onend());
    expect(counter()).toHaveTextContent('2 / 3');
  });

  it('releases a held Watch step when read-aloud is turned off', () => {
    vi.useFakeTimers();
    mockSpeech();
    renderPlayer(makeSet('guided', THREE));
    const toggle = screen.getByRole('button', { name: 'Read aloud' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(counter()).toHaveTextContent('1 / 3');
    fireEvent.click(toggle);
    expect(counter()).toHaveTextContent('2 / 3');
  });

  it('hides the toggle when there is no speech and no narration', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    renderPlayer(makeSet('structured', THREE));
    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull();
  });

  it('plays a step’s narration instead of speech synthesis', () => {
    const { speak } = mockSpeech();
    const play = vi.fn(() => Promise.resolve());
    const audios: string[] = [];
    class AudioMock {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src: string) {
        audios.push(src);
      }
      play = play;
      pause = vi.fn();
    }
    vi.stubGlobal('Audio', AudioMock);
    renderPlayer(
      makeSet('structured', [
        step('a', {
          narration: {
            source: 'generated',
            url: 'https://example.com/a.mp3',
            storagePath: 'x/a.mp3',
            durationMs: 2000,
          },
        }),
        step('b'),
      ])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(audios).toEqual(['https://example.com/a.mp3']);
    expect(play).toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });
});
